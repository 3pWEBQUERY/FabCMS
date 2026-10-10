import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { sql, json } from './db';
import { env } from './env';
import { appSecret, getSettings } from './settings';
import { HttpError, badRequest } from './lib/http';

/**
 * Google Search Console over OAuth: one connection per site, made by
 * someone who may change the settings. Nova submits the sitemap and shows
 * clicks, impressions, positions and search terms in the statistics.
 *
 * Needs a Google OAuth client (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET,
 * type «web application», redirect URI …/api/gsc/callback). The refresh
 * token is stored encrypted with the app secret, in its own settings row –
 * never part of /api/settings or the export.
 */

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOKE = 'https://oauth2.googleapis.com/revoke';
const API = 'https://www.googleapis.com/webmasters/v3';
const SCOPES = ['https://www.googleapis.com/auth/webmasters', 'openid', 'email'];

export const gscConfigured = () => Boolean(env.google.clientId && env.google.clientSecret);
export const redirectUri = () => `${env.publicUrl.replace(/\/$/, '')}/api/gsc/callback`;

interface Stored {
  refresh: string;
  email: string;
  site: string | null;
  sites: string[];
  connectedAt: string;
  sitemapAt: string | null;
}

/* ---------- token at rest ---------- */

async function key() {
  return createHash('sha256')
    .update(`${await appSecret()}:gsc`)
    .digest();
}
async function seal(text: string): Promise<string> {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', await key(), iv);
  const body = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString('base64url')).join('.');
}
async function open(sealed: string): Promise<string> {
  const [iv, tag, body] = sealed.split('.').map((p) => Buffer.from(p, 'base64url'));
  const d = createDecipheriv('aes-256-gcm', await key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString('utf8');
}

async function load(): Promise<Stored | null> {
  const [row] = await sql`select value from settings where key = 'gsc'`;
  return (row?.value as Stored) ?? null;
}
async function store(v: Stored | null) {
  if (!v) await sql`delete from settings where key = 'gsc'`;
  else await sql`insert into settings (key, value) values ('gsc', ${json(v)}) on conflict (key) do update set value = excluded.value, updated_at = now()`;
  access = null;
  cache.clear();
}

/* ---------- OAuth ---------- */

export function authUrl(state: string): string {
  if (!gscConfigured()) throw badRequest('Für die Search Console fehlen GOOGLE_CLIENT_ID und GOOGLE_CLIENT_SECRET in den Variablen des Dienstes.');
  const q = new URLSearchParams({
    client_id: env.google.clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH}?${q}`;
}

async function tokenCall(params: Record<string, string>): Promise<{ access_token: string; expires_in: number; refresh_token?: string; id_token?: string }> {
  const r = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.google.clientId, client_secret: env.google.clientSecret, ...params }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    if (body.error === 'invalid_grant') throw new HttpError(409, 'Google hat die Verbindung beendet. Verbinde die Search Console bitte neu.');
    throw new HttpError(502, 'Google hat die Anmeldung nicht bestätigt. Prüf GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET und die Weiterleitungs-URI.');
  }
  return body as never;
}

let access: { token: string; until: number } | null = null;
async function accessToken(s: Stored): Promise<string> {
  if (access && access.until > Date.now() + 60_000) return access.token;
  const t = await tokenCall({ grant_type: 'refresh_token', refresh_token: await open(s.refresh) });
  access = { token: t.access_token, until: Date.now() + t.expires_in * 1000 };
  return access.token;
}

async function google<T>(s: Stored, method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken(s)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  if (r.status === 403) throw new HttpError(403, 'Dieses Google-Konto hat keinen Zugriff auf die Property. Wähl eine andere oder verbinde ein Konto mit Zugriff.');
  if (!r.ok) throw new HttpError(502, 'Die Search Console hat nicht geantwortet. Versuch es später nochmal.');
  return (r.status === 204 ? null : await r.json().catch(() => null)) as T;
}

/** The property for this site: a domain property, or the URL prefix of the public address. */
export function matchProperty(sites: string[], base: string): string | null {
  const url = new URL(base);
  const host = url.hostname.replace(/^www\./, '');
  return sites.find((s) => s === `sc-domain:${host}`) ?? sites.find((s) => s.replace(/\/$/, '') === url.origin) ?? null;
}

async function publicBase() {
  const s = await getSettings();
  return (s.baseUrl || env.publicUrl).replace(/\/$/, '');
}

/** After Google sends the visitor back: tokens, properties, and the sitemap if the site's own property is there. */
export async function connect(code: string): Promise<Stored> {
  const t = await tokenCall({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() });
  if (!t.refresh_token) throw new HttpError(502, 'Google hat keinen dauerhaften Zugang erteilt. Verbinde bitte nochmals.');
  let email = '';
  try {
    email = String(JSON.parse(Buffer.from(String(t.id_token).split('.')[1], 'base64url').toString()).email ?? '');
  } catch {
    /* no id token: fine, the address is only shown */
  }
  const stored: Stored = { refresh: await seal(t.refresh_token), email, site: null, sites: [], connectedAt: new Date().toISOString(), sitemapAt: null };
  access = { token: t.access_token, until: Date.now() + t.expires_in * 1000 };
  const list = await google<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(stored, 'GET', '/sites');
  stored.sites = (list?.siteEntry ?? []).filter((e) => e.permissionLevel !== 'siteUnverifiedUser').map((e) => e.siteUrl);
  stored.site = matchProperty(stored.sites, await publicBase());
  await store(stored);
  if (stored.site) await submitSitemap().catch(() => undefined);
  return (await load())!;
}

export async function chooseSite(site: string) {
  const s = await load();
  if (!s) throw badRequest('Die Search Console ist nicht verbunden.');
  if (!s.sites.includes(site)) throw badRequest('Diese Property gehört nicht zum verbundenen Google-Konto.');
  await store({ ...s, site, sitemapAt: null });
  await submitSitemap();
}

export async function submitSitemap() {
  const s = await load();
  if (!s?.site) throw badRequest('Wähl zuerst die Property für diese Website.');
  const sitemap = `${await publicBase()}/sitemap.xml`;
  await google(s, 'PUT', `/sites/${encodeURIComponent(s.site)}/sitemaps/${encodeURIComponent(sitemap)}`);
  await store({ ...s, sitemapAt: new Date().toISOString() });
}

export async function disconnect() {
  const s = await load();
  if (!s) return;
  // Withdraw at Google too; if that fails, the token is gone here anyway.
  await fetch(`${REVOKE}?token=${encodeURIComponent(await open(s.refresh))}`, { method: 'POST', signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
  await store(null);
}

export async function gscStatus() {
  const s = await load();
  return {
    configured: gscConfigured(),
    redirectUri: redirectUri(),
    connected: Boolean(s),
    email: s?.email ?? '',
    site: s?.site ?? null,
    sites: s?.sites ?? [],
    connectedAt: s?.connectedAt ?? null,
    sitemapAt: s?.sitemapAt ?? null,
  };
}

/* ---------- report ---------- */

export interface GscReport {
  site: string;
  from: string;
  to: string;
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  series: { day: string; clicks: number; impressions: number }[];
  queries: { query: string; clicks: number; impressions: number; position: number }[];
  pages: { page: string; clicks: number; impressions: number }[];
}

const cache = new Map<string, { at: number; report: GscReport }>();
const day = (d: Date) => d.toISOString().slice(0, 10);

export async function report(days: number): Promise<GscReport | null> {
  const s = await load();
  if (!s?.site) return null;
  const hit = cache.get(`${s.site}:${days}`);
  if (hit && Date.now() - hit.at < 3 * 60 * 60_000) return hit.report;
  // Search data arrives with a delay of about two days.
  const to = new Date(Date.now() - 2 * 86_400_000);
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  type Row = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };
  const query = (dimensions: string[], rowLimit: number) =>
    google<{ rows?: Row[] }>(s, 'POST', `/sites/${encodeURIComponent(s.site!)}/searchAnalytics/query`, { startDate: day(from), endDate: day(to), dimensions, rowLimit }).then(
      (r) => r?.rows ?? [],
    );
  const [byDay, byQuery, byPage, total] = await Promise.all([query(['date'], 500), query(['query'], 15), query(['page'], 10), query([], 1)]);
  const base = await publicBase();
  const t = total[0];
  const out: GscReport = {
    site: s.site,
    from: day(from),
    to: day(to),
    totals: { clicks: t?.clicks ?? 0, impressions: t?.impressions ?? 0, ctr: Math.round((t?.ctr ?? 0) * 1000) / 10, position: Math.round((t?.position ?? 0) * 10) / 10 },
    series: byDay.map((r) => ({ day: r.keys![0], clicks: r.clicks, impressions: r.impressions })),
    queries: byQuery.map((r) => ({ query: r.keys![0], clicks: r.clicks, impressions: r.impressions, position: Math.round(r.position * 10) / 10 })),
    // Own pages as paths, like the rest of the statistics.
    pages: byPage.map((r) => ({ page: r.keys![0].startsWith(base) ? r.keys![0].slice(base.length) || '/' : r.keys![0], clicks: r.clicks, impressions: r.impressions })),
  };
  cache.set(`${s.site}:${days}`, { at: Date.now(), report: out });
  return out;
}

import type { Context, Hono } from 'hono';
import { formHooks } from '../hooks';
import { alternates, currentLang, localized, localizedOne, localizePath, pathMap } from '../translations';
import { defaultLang, extraLangs, langInfo } from '../../shared/i18n';
import { getCookie, setCookie } from 'hono/cookie';
import { createRequire } from 'node:module';
import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import type { AppEnv } from '../auth';
import { sql, json } from '../db';
import { env } from '../env';
import { appSecret, contentGeneration, getSettings } from '../settings';
import { activeCollections, getCollection } from '../content';
import { getVariant, storeUpload, VARIANT_WIDTHS, type VariantFormat } from '../media';
import { storage } from '../storage';
import { clientIp, HttpError } from '../lib/http';
import { rateLimit } from '../lib/ratelimit';
import { sign, unsign } from '../lib/crypto';
import { recordGoal, recordHit } from '../analytics';
import { emit } from '../events';
import { sendMail } from '../mail';
import { cachedOgImage } from '../og';
import {
  addToCart,
  CART_COOKIE,
  createOrder,
  decodeCart,
  encodeCart,
  handleStripeEvent,
  paymentOptions,
  quote,
  sendOrderMails,
  stripeCheckoutUrl,
  verifyStripeSignature,
  type CartItem,
  type CheckoutInput,
  type QuoteLine,
} from '../shop';
import { runtimeScript, type RuntimeName } from '../../site/assets';
import { notify as notifyTeam } from '../notify';
import { bookingPublicRoutes } from './public-booking';
import { newsletterPublicRoutes } from './public-newsletter';
import { membersPublicRoutes } from './public-members';
import { ticketsPublicRoutes } from './public-tickets';
import { donationsPublicRoutes } from './public-donations';
import { invoiceHtml } from '../invoice';
import { realestatePublicRoutes } from './public-realestate';
import { orderingPublicRoutes } from './public-ordering';
import { currentMember } from '../members';
import { entryAccess, mayRead } from '../../shared/members';
import { FONT_FILES } from '../../site/fonts';
import { createContext, renderList, renderPage, renderSystemPage } from '../../site/render';
import { renderMenu } from '../../site/blocks';
import { html, raw } from '../../site/html';
import { picture } from '../../site/picture';
import { resolveTheme, themeCss } from '../../site/themes';
import { entryPath, matchRoute } from '../../shared/paths';
import { formatMoney, formatPrice, excerpt, stripHtml } from '../../shared/text';
import { blocksText } from '../../shared/blocks';
import type { CollectionDef, EntryData, FormDef, SiteSettings } from '../../shared/types';

const require = createRequire(import.meta.url);
const AGE_COOKIE = 'nova_age';
const IMMUTABLE = 'public, max-age=31536000, immutable';

/* ---------- helpers ---------- */

async function siteBase(s: SiteSettings) {
  return (s.baseUrl || env.publicUrl).replace(/\/$/, '');
}

async function cartItems(c: Context): Promise<CartItem[]> {
  return decodeCart(getCookie(c, CART_COOKIE), await appSecret());
}

async function saveCart(c: Context, items: CartItem[]) {
  setCookie(c, CART_COOKIE, encodeCart(items, await appSecret()), {
    httpOnly: true,
    sameSite: 'Lax',
    secure: env.production,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function ctxFor(c: Context, opts: { edit?: boolean; preview?: boolean } = {}) {
  const settings = await getSettings();
  const url = new URL(c.req.url);
  const cart = settings.modules.includes('shop') ? await cartItems(c) : [];
  const age = unsign(getCookie(c, AGE_COOKIE), await appSecret()) === '1';
  const member = settings.modules.includes('members') && !opts.edit && !opts.preview ? await currentMember(c) : null;
  const path = decodeURIComponent(url.pathname);
  return createContext({
    lang: currentLang() ?? undefined,
    alternates: extraLangs(settings).length ? await alternates(path) : [],
    settings,
    collections: await activeCollections(),
    path,
    base: await siteBase(settings),
    query: url.searchParams,
    edit: opts.edit,
    preview: opts.preview,
    ageOk: age,
    cartCount: cart.reduce((s, i) => s + i.q, 0),
    member: member ? { id: member.id, name: member.name, level: member.level } : null,
  });
}

/* ---------- page cache ---------- */

const pageCache = new Map<string, { html: string; etag: string; gen: number }>();
const CACHE_MAX = 600;

function cacheGet(key: string) {
  const hit = pageCache.get(key);
  if (!hit || hit.gen !== contentGeneration()) return null;
  pageCache.delete(key);
  pageCache.set(key, hit);
  return hit;
}

function cacheSet(key: string, body: string) {
  const etag = `W/"${contentGeneration()}-${body.length}-${hashCode(body)}"`;
  pageCache.set(key, { html: body, etag, gen: contentGeneration() });
  if (pageCache.size > CACHE_MAX) pageCache.delete(pageCache.keys().next().value!);
  return etag;
}

function hashCode(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i += 7) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Pages with opening-hour status depend on the clock: re-render at least every 5 minutes. */
const timeBucket = () => Math.floor(Date.now() / 300_000);

export function sendHtml(c: Context, body: string, status = 200, etag?: string) {
  c.header('Content-Type', 'text/html; charset=utf-8');
  c.header('Cache-Control', 'public, max-age=0, must-revalidate');
  if (etag) c.header('ETag', etag);
  return c.body(body, status as 200);
}

/* ---------- page resolution ---------- */

type Resolved =
  | {
      kind: 'entry';
      collection: CollectionDef;
      entry: { id: string; slug: string; data: EntryData; published_at: string | null; updated_at: string; version: number; author_name: string | null };
    }
  | { kind: 'list'; collection: CollectionDef };

async function resolve(path: string): Promise<Resolved | null> {
  const collections = await activeCollections();
  const slug = path === '/' ? '' : path.replace(/^\//, '');
  const load = async (collection: string, s: string) => {
    const [e] = await sql`
      select e.id, e.slug, e.published_data as data, e.published_at, e.updated_at, e.version, u.name as author_name
      from entries e left join users u on u.id = e.author_id
      where e.collection = ${collection} and e.slug = ${s} and e.status = 'published'`;
    return localizedOne(e as unknown as Extract<Resolved, { kind: 'entry' }>['entry'] | undefined, collection);
  };
  const page = await load('pages', slug);
  if (page) return { kind: 'entry', collection: collections.find((c) => c.id === 'pages')!, entry: page };
  for (const c of collections) {
    if (c.id === 'pages') continue;
    if (c.list_route === path) return { kind: 'list', collection: c };
    if (c.route) {
      const s = matchRoute(c.route, path);
      if (s) {
        const e = await load(c.id, s);
        if (e) return { kind: 'entry', collection: c, entry: e };
      }
    }
  }
  return null;
}

export async function notFoundPage(c: Context) {
  const ctx = await ctxFor(c);
  ctx.path = '/404';
  const body = await renderSystemPage(ctx, {
    title: 'Seite nicht gefunden',
    body: html`<div class="wrap nf">
      <p class="code" aria-hidden="true">404</p>
      <h1>Diese Seite gibt es nicht (mehr).</h1>
      <p class="lead">Vielleicht wurde sie verschoben. Such hier oder geh zur Startseite.</p>
      <form class="search-form" action="/suche" role="search">
        <label class="sr" for="q">Suchbegriff</label><input id="q" name="q" type="search" placeholder="Suchen …" /><button class="btn">Suchen</button>
      </form>
      <p><a class="btn-2" href="/">Zur Startseite</a></p>
    </div>`,
  });
  return sendHtml(c, body, 404);
}

/** Before the first «Veröffentlichen» the public sees this instead of example content. */
async function holdingPage(c: Context, s: SiteSettings) {
  const { css } = themeCss(s);
  const body = `<!doctype html><html lang="${s.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${html`${s.name}`}</title><style>${css}</style></head><body><main class="wrap nf" style="min-height:100vh"><p class="label">${html`${s.name}`}</p><h1 style="font-size:var(--step-6);max-width:14ch">Hier entsteht etwas.</h1><p class="lead">Diese Website ist bald online.${s.business.email ? html` Fragen? <a href="mailto:${s.business.email}">${s.business.email}</a>` : ''}</p></main></body></html>`;
  c.header('Cache-Control', 'no-store');
  return sendHtml(c, body, 200);
}

/* ---------- form submissions ---------- */

function fieldVisible(form: FormDef, f: FormDef['fields'][number], data: Record<string, string>) {
  if (!f.showIf?.field) return true;
  return (data[f.showIf.field] ?? '') === f.showIf.equals;
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  if (!env.turnstile.secret) return true;
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: env.turnstile.secret, response: token, remoteip: ip }),
  }).catch(() => null);
  const body = (await r?.json().catch(() => null)) as { success?: boolean } | null;
  return Boolean(body?.success);
}

/** Bots fill the hidden field or submit within a second; humans don't. */
export function looksLikeSpam(body: Record<string, unknown>): boolean {
  if (typeof body.website === 'string' && body.website.trim()) return true;
  const t = parseInt(String(body._t ?? ''), 36);
  if (!t || Number.isNaN(t)) return true;
  const age = Date.now() - t;
  return age < 1500 || age > 2 * 86_400_000;
}

/* ---------- routes ---------- */

export function publicRoutes(app: Hono<AppEnv>) {
  bookingPublicRoutes(app);
  newsletterPublicRoutes(app);
  membersPublicRoutes(app);
  ticketsPublicRoutes(app);
  donationsPublicRoutes(app);
  realestatePublicRoutes(app);
  orderingPublicRoutes(app);
  app.get('/_nova/:name{(site|bridge|fields)\\.js}', async (c) => {
    const name = c.req.param('name').replace('.js', '') as RuntimeName;
    const { code } = await runtimeScript(name);
    c.header('Content-Type', 'text/javascript; charset=utf-8');
    c.header('Cache-Control', c.req.query('v') && env.production ? IMMUTABLE : 'no-cache');
    return c.body(code);
  });

  app.get('/_nova/fonts/:file', (c) => {
    const rel = FONT_FILES.get(c.req.param('file'));
    if (!rel) return c.notFound();
    const path = require.resolve(rel);
    c.header('Content-Type', 'font/woff2');
    c.header('Cache-Control', IMMUTABLE);
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Content-Length', String(statSync(path).size));
    return c.body(Readable.toWeb(createReadStream(path)) as ReadableStream);
  });

  app.get('/_nova/favicon.svg', async (c) => {
    const s = await getSettings();
    const { palette } = resolveTheme(s);
    const letter = (s.name.trim()[0] ?? 'N').toUpperCase().replace(/[<>&"]/g, '');
    c.header('Content-Type', 'image/svg+xml');
    c.header('Cache-Control', 'public, max-age=3600');
    return c.body(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${palette.ink}"/><text x="32" y="44" text-anchor="middle" font-family="Georgia,serif" font-size="38" fill="${palette.bg}">${letter}</text></svg>`,
    );
  });

  app.get('/_nova/og/:file{[a-z0-9-]+\\.png}', async (c) => {
    const id = c.req.param('file').replace('.png', '');
    const s = await getSettings();
    let title = s.tagline ? `${s.name} – ${s.tagline}` : s.name;
    let kicker = new URL(await siteBase(s)).hostname;
    let version = 0;
    if (id !== 'site') {
      if (!/^[0-9a-f-]{36}$/.test(id)) return c.notFound();
      const [e] = await sql`select collection, published_data, version from entries where id = ${id} and status = 'published'`;
      if (e) e.published_data = (await localizedOne({ id, data: e.published_data, collection: e.collection as string }))!.data;
      if (!e) return c.notFound();
      title = (e.published_data as EntryData).seo?.title || (e.published_data as EntryData).title;
      kicker = s.name;
      version = e.version as number;
    }
    const png = await cachedOgImage(`${id}-${version}-${s.name.length}`, s, title, kicker);
    c.header('Content-Type', 'image/png');
    c.header('Cache-Control', 'public, max-age=86400');
    return c.body(new Uint8Array(png));
  });

  /* media */
  app.get('/media/:id/:ver{v\\d+}/:file{\\d+\\.(avif|webp|jpg)}', async (c) => {
    const id = c.req.param('id');
    if (!/^[0-9a-f-]{36}$/.test(id)) return c.notFound();
    const [w, fmt] = c.req.param('file').split('.') as [string, VariantFormat];
    const width = Number(w);
    if (!(VARIANT_WIDTHS as readonly number[]).includes(width)) return c.notFound();
    const buf = await getVariant(id, Number(c.req.param('ver').slice(1)), width, fmt);
    if (!buf) return c.notFound();
    c.header('Content-Type', fmt === 'jpg' ? 'image/jpeg' : `image/${fmt}`);
    c.header('Cache-Control', IMMUTABLE);
    return c.body(new Uint8Array(buf));
  });

  app.get('/media/:id/file/:name', async (c) => {
    const id = c.req.param('id');
    if (!/^[0-9a-f-]{36}$/.test(id)) return c.notFound();
    const [m] = await sql`select storage_key, filename, mime, size, private from media where id = ${id}`;
    if (!m || m.private) return c.notFound();
    // Bucket egress is free on Railway and S3 handles range requests (video seeking).
    const url = await storage.presign(m.storage_key, 3600);
    if (url) {
      c.header('Cache-Control', 'private, max-age=3000');
      return c.redirect(url, 302);
    }
    // Without a bucket the file comes from here; byte ranges let video and audio seek.
    const size = Number(m.size);
    const want = /^bytes=(\d*)-(\d*)$/.exec(c.req.header('range') ?? '');
    let range: { start: number; end: number } | undefined;
    if (want && (want[1] || want[2])) {
      const start = want[1] ? Number(want[1]) : Math.max(0, size - Number(want[2]));
      const end = want[1] && want[2] ? Math.min(Number(want[2]), size - 1) : size - 1;
      if (start > end || start >= size) {
        c.header('Content-Range', `bytes */${size}`);
        return c.body(null, 416);
      }
      range = { start, end };
    }
    const obj = await storage.get(m.storage_key, range);
    if (!obj) return c.notFound();
    c.header('Content-Type', m.mime);
    c.header('Accept-Ranges', 'bytes');
    c.header('Cache-Control', 'public, max-age=86400');
    if (range) {
      c.header('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
      c.header('Content-Length', String(range.end - range.start + 1));
      return c.body(Readable.toWeb(obj.body) as ReadableStream, 206);
    }
    c.header('Content-Length', String(obj.size));
    return c.body(Readable.toWeb(obj.body) as ReadableStream);
  });

  /* analytics */
  app.post('/_nova/hit', async (c) => {
    const s = await getSettings();
    const ip = clientIp(c);
    if (!s.analytics.enabled || !rateLimit(`hit:${ip}`, 120, 60_000).ok) return c.body(null, 204);
    const body = (await c.req.json().catch(() => null)) as { p?: string; r?: string; w?: number } | null;
    if (body?.p && body.p.startsWith('/'))
      await recordHit({ path: body.p, referrer: body.r ?? '', width: Number(body.w) || 0, ip, ua: c.req.header('user-agent') ?? '', host: new URL(c.req.url).hostname });
    return c.body(null, 204);
  });

  /* forms */
  app.post('/_nova/forms/:id', async (c) => {
    const wantsJson = (c.req.header('accept') ?? '').includes('application/json');
    const ip = clientIp(c);
    const [form] =
      (await sql`select * from forms where id = ${/^[0-9a-f-]{36}$/.test(c.req.param('id')) ? c.req.param('id') : '00000000-0000-0000-0000-000000000000'}`) as unknown as FormDef[];
    if (!form) return c.notFound();
    const body = await c.req.parseBody({ all: false });
    const page = typeof body._page === 'string' && body._page.startsWith('/') ? body._page : '/';
    const fail = (message: string) =>
      wantsJson ? c.json({ ok: false, message }, 400) : c.redirect(`${page}?formfehler=${form.id}&meldung=${encodeURIComponent(message)}#form-${form.id}`, 303);
    const success = () =>
      wantsJson ? c.json({ ok: true, message: form.settings.successMessage || 'Danke! Wir melden uns bald.' }) : c.redirect(`${page}?gesendet=${form.id}#form-${form.id}`, 303);

    if (looksLikeSpam(body)) return success(); // pretend success, store nothing
    if (!rateLimit(`form:${form.id}:${ip}`, 5, 10 * 60_000).ok) return fail('Du hast gerade mehrere Anfragen gesendet. Bitte warte ein paar Minuten.');
    if (form.settings.turnstile && env.turnstile.secret && !(await verifyTurnstile(String(body['cf-turnstile-response'] ?? ''), ip)))
      return fail('Die Spam-Prüfung hat nicht geklappt. Bitte lade die Seite neu.');

    const data: Record<string, string> = {};
    for (const f of form.fields) if (f.type !== 'step' && f.type !== 'file') data[f.name] = typeof body[f.name] === 'string' ? (body[f.name] as string).trim().slice(0, 5000) : '';
    const files: { field: string; media: string; filename: string }[] = [];
    for (const f of form.fields) {
      if (f.type === 'step' || !fieldVisible(form, f, data)) continue;
      if (f.type === 'file') {
        const file = body[f.name];
        if (file instanceof File && file.size > 0) {
          if (file.size > 10 * 1024 * 1024) return fail(`«${f.label}» ist grösser als 10 MB.`);
          try {
            const m = await storeUpload({ buffer: Buffer.from(await file.arrayBuffer()), filename: file.name, folder: 'Formulare', private: true });
            files.push({ field: f.name, media: m.id, filename: m.filename });
          } catch (e) {
            return fail((e as Error).message);
          }
        } else if (f.required) return fail(`Bitte lade eine Datei bei «${f.label}» hoch.`);
        continue;
      }
      if (f.required && !data[f.name]) return fail(`Bitte fülle «${f.label}» aus.`);
      if (f.type === 'email' && data[f.name] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data[f.name])) return fail(`«${f.label}» ist keine gültige E-Mail-Adresse.`);
    }

    const hooked = await formHooks({ form: { id: form.id, name: form.name }, fields: data, page });
    if (hooked.spam) return success();
    if (hooked.reject) return fail(hooked.reject);
    Object.assign(data, hooked.fields);

    const emailField = form.fields.find((f) => f.type === 'email');
    const email = emailField ? data[emailField.name] : '';
    let contactId: string | null = null;
    const s = await getSettings();
    if (form.settings.createLead && email && s.modules.includes('leads')) {
      const name = data.name || data.vorname ? [data.vorname, data.nachname ?? data.name].filter(Boolean).join(' ') : '';
      const phoneField = form.fields.find((f) => f.type === 'tel');
      const [existing] = await sql`select id from contacts where lower(email) = lower(${email})`;
      if (existing) {
        contactId = existing.id as string;
        await sql`update contacts set updated_at = now(), name = case when name = '' then ${name} else name end where id = ${contactId}`;
      } else {
        const [ct] = await sql`
          insert into contacts (email, name, phone, source) values (${email}, ${name}, ${phoneField ? data[phoneField.name] : ''}, ${form.name})
          returning id`;
        contactId = ct.id as string;
        emit('lead.created', { id: contactId, email, name, source: form.name });
      }
    }
    const [sub] = await sql`
      insert into submissions (form_id, contact_id, data, files, page) values (${form.id}, ${contactId}, ${json(data)}, ${json(files)}, ${page})
      returning id`;
    emit('form.submitted', { form: form.name, formId: form.id, submission: sub.id, data, page });
    const who = [data.name || [data.vorname, data.nachname].filter(Boolean).join(' '), email].filter(Boolean).join(' · ');
    void notifyTeam({ kind: 'form', cap: 'forms.manage', title: `Neue Anfrage: ${form.name}`, body: who || `Gesendet von ${page}`, href: `/formulare/${form.id}` });
    await recordGoal('form', ip, c.req.header('user-agent') ?? '', page);
    const notify = form.settings.notifyEmail || s.business.email;
    if (notify) {
      const lines = form.fields
        .filter((f) => f.type !== 'step')
        .map((f) => `${f.label}: ${f.type === 'file' ? (files.find((x) => x.field === f.name)?.filename ?? '–') : data[f.name] || '–'}`);
      void sendMail({
        to: notify,
        subject: `Neue Anfrage: ${form.name}`,
        text: `${lines.join('\n')}\n\nGesendet von ${page}\nAlle Einträge: ${await siteBase(s)}/admin/formulare/${form.id}`,
        replyTo: email || undefined,
      });
    }
    return success();
  });

  /* blog comments */
  app.post('/_nova/comments/:entry', async (c) => {
    const id = c.req.param('entry');
    if (!/^[0-9a-f-]{36}$/.test(id)) return c.notFound();
    const s = await getSettings();
    const [e] = await sql`select collection, slug, published_data from entries where id = ${id} and status = 'published' and collection = 'posts'`;
    if (!e || !s.blog.comments || (e.published_data as EntryData).allowComments === false) return c.notFound();
    // Behind the paywall, only those who can read may comment.
    const access = entryAccess(e.published_data as EntryData);
    if (access !== 'public' && !mayRead(access, (await currentMember(c))?.level ?? null)) return c.notFound();
    const path = entryPath(await getCollection('posts'), e.slug as string) ?? '/';
    const body = await c.req.parseBody();
    if (looksLikeSpam(body)) return c.redirect(`${path}?kommentar=danke#kommentare`, 303);
    if (!rateLimit(`comment:${clientIp(c)}`, 3, 10 * 60_000).ok) return c.redirect(`${path}#kommentare`, 303);
    const name = String(body.name ?? '')
      .trim()
      .slice(0, 80);
    const text = String(body.body ?? '')
      .trim()
      .slice(0, 4000);
    if (!name || !text) return c.redirect(`${path}#kommentare`, 303);
    await sql`insert into comments (entry_id, name, email, body) values (${id}, ${name}, ${String(body.email ?? '').slice(0, 200)}, ${text})`;
    emit('comment.created', { entry: id, name });
    void notifyTeam({
      kind: 'comment',
      cap: 'comments.moderate',
      title: `Neuer Kommentar von ${name}`,
      body: `«${text.slice(0, 140)}${text.length > 140 ? '…' : ''}» – wartet auf Freigabe.`,
      href: '/kommentare',
    });
    return c.redirect(`${path}?kommentar=danke#kommentare`, 303);
  });

  /* age gate */
  app.post('/_nova/age', async (c) => {
    const body = await c.req.parseBody();
    const back = typeof body.back === 'string' && body.back.startsWith('/') && !body.back.startsWith('//') ? body.back : '/';
    if (body.ok === '1') setCookie(c, AGE_COOKIE, sign('1', await appSecret()), { httpOnly: true, sameSite: 'Lax', secure: env.production, path: '/', maxAge: 60 * 60 * 24 * 30 });
    return c.redirect(back, 303);
  });

  /* ---------- shop ---------- */

  app.post('/warenkorb/add', async (c) => {
    const wantsJson = (c.req.header('accept') ?? '').includes('application/json');
    const body = await c.req.parseBody();
    const product = String(body.product ?? '');
    const variant = body.variant !== undefined && body.variant !== '' ? Number(body.variant) : null;
    const qty = Math.max(1, Math.min(99, Number(body.qty) || 1));
    let items = await cartItems(c);
    items = addToCart(items, { p: product, v: Number.isInteger(variant) ? variant : null, q: qty });
    const q = await quote(items);
    const kept = q.lines.map((l) => ({ p: l.productId, v: l.variant, q: l.qty }));
    await saveCart(c, kept);
    const count = kept.reduce((s, i) => s + i.q, 0);
    const added = q.lines.some((l) => l.productId === product);
    const message = added ? (q.problems[0] ?? 'Im Warenkorb.') : (q.problems[0] ?? 'Das Produkt ist nicht verfügbar.');
    if (wantsJson) return c.json({ ok: added, count, message });
    const [e] = await sql`select slug from entries where id = ${/^[0-9a-f-]{36}$/.test(product) ? product : '00000000-0000-0000-0000-000000000000'}`;
    const back = e ? entryPath(await getCollection('products'), e.slug as string) : '/warenkorb';
    return c.redirect(`${back}?hinzugefuegt=1`, 303);
  });

  app.post('/warenkorb/update', async (c) => {
    const body = await c.req.parseBody();
    const items = await cartItems(c);
    const next = items.map((it, i) => ({ ...it, q: body[`remove_${i}`] ? 0 : Math.max(0, Math.min(99, Number(body[`qty_${i}`] ?? it.q) || 0)) })).filter((it) => it.q > 0);
    await saveCart(c, next);
    const code = String(body.coupon ?? '').trim();
    return c.redirect(code ? `/warenkorb?gutschein=${encodeURIComponent(code)}` : '/warenkorb', 303);
  });

  app.get('/warenkorb', async (c) => {
    const ctx = await ctxFor(c);
    const s = ctx.settings;
    if (!s.modules.includes('shop')) return notFoundPage(c);
    const items = await cartItems(c);
    const coupon = c.req.query('gutschein') ?? '';
    const q = await quote(items, { couponCode: coupon });
    await ctx.preloadMedia(q.lines.map((l) => l.image));
    const rows = await Promise.all(
      q.lines.map(async (l, i) => {
        const img = await ctx.media(l.image);
        return html`<tr>
          <td class="c-img">${img ? picture(img, { sizes: '4rem', maxWidth: 320, ratio: '1/1' }) : ''}</td>
          <td class="c-name">
            <a href="${entryPath(await getCollection('products'), l.slug)}">${l.title}</a>${l.variantName ? html`<br /><span class="muted">${l.variantName}</span>` : ''}
          </td>
          <td class="num c-price" data-label="Preis">${formatPrice(l.unit)}</td>
          <td class="c-qty"><label class="sr" for="q${i}">Menge</label><input id="q${i}" name="qty_${i}" type="number" min="0" max="99" value="${l.qty}" inputmode="numeric" /></td>
          <td class="num c-total">${formatPrice(l.total)}</td>
          <td class="c-rm"><button class="btn-2" name="remove_${i}" value="1" aria-label="${l.title} entfernen">Entfernen</button></td>
        </tr>`;
      }),
    );
    const body = q.lines.length
      ? html`<div class="wrap" style="padding-block:var(--sp-s)">
          <h1 style="font-size:var(--step-5);margin-bottom:2rem">Warenkorb</h1>
          ${q.problems.map((p) => html`<p class="form-err">${p}</p>`)}
          <form method="post" action="/warenkorb/update">
            <div class="table-wrap">
              <table class="cart-table">
                <thead>
                  <tr>
                    <th><span class="sr">Bild</span></th>
                    <th>Produkt</th>
                    <th class="num">Preis</th>
                    <th>Menge</th>
                    <th class="num">Total</th>
                    <th><span class="sr">Aktion</span></th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                </tbody>
              </table>
            </div>
            <div class="actions" style="justify-content:space-between">
              <div class="fld" style="max-width:18rem"><label for="coupon">Gutscheincode</label><input id="coupon" name="coupon" value="${coupon}" autocomplete="off" /></div>
              <button class="btn-2">Aktualisieren</button>
            </div>
          </form>
          ${q.coupon
            ? html`<p class="${q.coupon.ok ? 'form-ok' : 'form-err'}">${q.coupon.ok ? `Gutschein ${q.coupon.code}: ${q.coupon.message}` : q.coupon.message}</p>`
            : ''}${totalsHtml(q)}
          <div class="actions" style="justify-content:flex-end"><a class="btn" href="/kasse${coupon ? `?gutschein=${encodeURIComponent(coupon)}` : ''}">Zur Kasse</a></div>
        </div>`
      : html`<div class="wrap nf">
          <h1>Dein Warenkorb ist leer.</h1>
          <p><a class="btn" href="${ctx.collections.find((x) => x.id === 'products')?.list_route ?? '/'}">Zum Laden</a></p>
        </div>`;
    return sendHtml(c, await renderSystemPage(ctx, { title: 'Warenkorb', body }));
  });

  app.get('/kasse', async (c) => {
    const ctx = await ctxFor(c);
    const s = ctx.settings;
    if (!s.modules.includes('shop')) return notFoundPage(c);
    const items = await cartItems(c);
    const coupon = c.req.query('gutschein') ?? '';
    const q = await quote(items, { couponCode: coupon });
    if (!q.lines.length) return c.redirect('/warenkorb', 303);
    const pay = paymentOptions(s);
    const error = c.req.query('fehler');
    const legal = await sql`select slug from entries where collection = 'pages' and slug = 'agb' and status = 'published'`;
    const body = html`<div class="wrap" style="padding-block:var(--sp-s)">
      <h1 style="font-size:var(--step-5);margin-bottom:2rem">Kasse</h1>
      ${error ? html`<p class="form-err" role="alert">${error}</p>` : ''}
      <div class="checkout">
        <form class="nform" method="post" action="/kasse" style="max-width:none">
          <input type="hidden" name="coupon" value="${coupon}" />
          <fieldset>
            <legend>Kontakt</legend>
            <div class="two-col">
              <div class="fld"><label for="k-name">Vor- und Nachname</label><input id="k-name" name="name" required autocomplete="name" /></div>
              <div class="fld"><label for="k-mail">E-Mail</label><input id="k-mail" name="email" type="email" required autocomplete="email" /></div>
            </div>
            <div class="two-col">
              <div class="fld">
                <label for="k-tel">Telefon <span class="muted">(optional)</span></label
                ><input id="k-tel" name="phone" type="tel" autocomplete="tel" />
              </div>
              <div class="fld">
                <label for="k-firma">Firma <span class="muted">(optional)</span></label
                ><input id="k-firma" name="company" autocomplete="organization" />
              </div>
            </div>
          </fieldset>
          ${q.needsShipping
            ? html`<fieldset>
                <legend>Lieferung</legend>
                <div class="pay-opts">
                  <label class="pay-opt"
                    ><input type="radio" name="shippingMethod" value="ship" checked /> Versand
                    ${s.shop.shipping.freeFrom !== null
                      ? `(${formatPrice(s.shop.shipping.flat)}, ab ${formatPrice(s.shop.shipping.freeFrom)} gratis)`
                      : `(${formatPrice(s.shop.shipping.flat)})`}</label
                  >${s.shop.shipping.pickup
                    ? html`<label class="pay-opt"
                        ><input type="radio" name="shippingMethod" value="pickup" /> Abholen${s.business.city ? ` in ${s.business.city}` : ''} (gratis)</label
                      >`
                    : ''}
                </div>
                <div class="fld"><label for="k-str">Strasse und Nr.</label><input id="k-str" name="street" autocomplete="street-address" /></div>
                <div class="two-col">
                  <div class="fld"><label for="k-plz">PLZ</label><input id="k-plz" name="zip" autocomplete="postal-code" inputmode="numeric" /></div>
                  <div class="fld"><label for="k-ort">Ort</label><input id="k-ort" name="city" autocomplete="address-level2" /></div>
                  <div class="fld">
                    <label for="k-land">Land</label
                    ><select id="k-land" name="country" autocomplete="country">
                      ${s.shop.shipping.countries.map((cc) => html`<option value="${cc}">${new Intl.DisplayNames(['de-CH'], { type: 'region' }).of(cc) ?? cc}</option>`)}
                    </select>
                  </div>
                </div>
              </fieldset>`
            : html`<input type="hidden" name="shippingMethod" value="pickup" />`}
          <fieldset>
            <legend>Bezahlung</legend>
            <div class="pay-opts">
              ${pay.stripe
                ? html`<label class="pay-opt"><input type="radio" name="payment" value="stripe" checked /> Online bezahlen – TWINT, Karte, Apple Pay, Google Pay</label>`
                : ''}${pay.invoice
                ? html`<label class="pay-opt"><input type="radio" name="payment" value="invoice" ${pay.stripe ? '' : raw(' checked')} /> Rechnung (zahlbar innert 30 Tagen)</label>`
                : ''}
            </div>
            ${!pay.stripe && !pay.invoice ? html`<p class="form-err">Zurzeit ist keine Zahlungsart eingerichtet.</p>` : ''}
          </fieldset>
          <div class="fld">
            <label for="k-note">Bemerkung <span class="muted">(optional)</span></label
            ><textarea id="k-note" name="note" maxlength="1000" style="min-height:5rem"></textarea>
          </div>
          <div class="fld check">
            <input type="checkbox" id="k-agb" name="acceptTerms" value="1" required /><label for="k-agb"
              >Ich habe die ${legal.length ? html`<a href="/agb" target="_blank">AGB</a>` : 'AGB'} und die
              <a href="/datenschutz" target="_blank">Datenschutzerklärung</a> gelesen.</label
            >
          </div>
          <div><button class="btn" ${!pay.stripe && !pay.invoice ? raw('disabled') : ''}>Zahlungspflichtig bestellen · ${formatMoney(q.total, s.shop.currency)}</button></div>
        </form>
        <aside aria-label="Zusammenfassung">
          <h2 style="font-size:var(--step-2);margin-bottom:1rem">Deine Bestellung</h2>
          <ul style="list-style:none;margin:0;padding:0;display:grid;gap:.5rem">
            ${q.lines.map(
              (l) =>
                html`<li style="display:flex;justify-content:space-between;gap:1rem">
                  <span>${l.qty} × ${l.title}${l.variantName ? ` (${l.variantName})` : ''}</span><span class="num">${formatPrice(l.total)}</span>
                </li>`,
            )}
          </ul>
          ${totalsHtml(q)}
        </aside>
      </div>
    </div>`;
    return sendHtml(c, await renderSystemPage(ctx, { title: 'Kasse', body }));
  });

  app.post('/kasse', async (c) => {
    const body = await c.req.parseBody();
    const items = await cartItems(c);
    const input: CheckoutInput = {
      email: String(body.email ?? ''),
      name: String(body.name ?? ''),
      phone: String(body.phone ?? ''),
      company: String(body.company ?? ''),
      street: String(body.street ?? ''),
      zip: String(body.zip ?? ''),
      city: String(body.city ?? ''),
      country: String(body.country ?? 'CH'),
      note: String(body.note ?? ''),
      shippingMethod: body.shippingMethod === 'pickup' ? 'pickup' : 'ship',
      payment: body.payment === 'invoice' ? 'invoice' : 'stripe',
      coupon: String(body.coupon ?? ''),
      acceptTerms: body.acceptTerms === '1',
    };
    if (!rateLimit(`checkout:${clientIp(c)}`, 10, 10 * 60_000).ok) return c.redirect(`/kasse?fehler=${encodeURIComponent('Zu viele Versuche. Bitte warte kurz.')}`, 303);
    try {
      const order = await createOrder(items, input);
      await saveCart(c, []);
      if (input.payment === 'stripe') return c.redirect(await stripeCheckoutUrl(order.id), 303);
      void sendOrderMails(order.id);
      return c.redirect(`/bestellung/${order.token}`, 303);
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Die Bestellung konnte nicht abgeschlossen werden. Bitte versuch es nochmals.';
      if (!(e instanceof HttpError)) console.error('[kasse]', e);
      const q = new URLSearchParams({ fehler: msg });
      if (input.coupon) q.set('gutschein', input.coupon);
      return c.redirect(`/kasse?${q}`, 303);
    }
  });

  app.get('/bestellung/:token', async (c) => {
    const [o] = await sql`select * from orders where token = ${c.req.param('token')}`;
    if (!o) return notFoundPage(c);
    const ctx = await ctxFor(c);
    const s = ctx.settings;
    const lines = o.items as QuoteLine[];
    const paid = ['paid', 'fulfilled'].includes(o.status);
    const digital = paid
      ? await sql`select id, published_data ->> 'title' as title, published_data ->> 'file' as file from entries where id = any(${lines.filter((l) => l.digital).map((l) => l.productId)}::uuid[])`
      : [];
    const status =
      o.status === 'cancelled'
        ? html`<p class="form-err">Diese Bestellung wurde storniert.${c.req.query('abgebrochen') ? ' Die Zahlung wurde abgebrochen.' : ''}</p>`
        : paid
          ? html`<p class="form-ok">Bezahlt. Danke! Eine Bestätigung ist unterwegs an ${o.email}.</p>`
          : o.payment_method === 'invoice'
            ? html`<p class="form-ok">
                  Danke für deine Bestellung! Bitte überweise ${formatMoney(o.total, o.currency)} innert 30
                  Tagen.${s.shop.invoiceNote ? html`<br /><span style="white-space:pre-line">${s.shop.invoiceNote}</span>` : ''}
                </p>
                ${s.shop.iban ? html`<p><a class="btn" href="/bestellung/${o.token}/rechnung" target="_blank">Rechnung mit QR-Code</a></p>` : ''}`
            : c.req.query('bezahlt')
              ? html`<p class="form-ok">Die Zahlung wird bestätigt – das dauert meist nur Sekunden. Lade die Seite gleich neu.</p>`
              : html`<p class="form-err">Die Zahlung ist noch offen. <a href="/bestellung/${o.token}/bezahlen">Jetzt bezahlen</a></p>`;
    const body = html`<div class="wrap" style="padding-block:var(--sp-s);max-width:48rem">
      <p class="label">Bestellung ${o.number}</p>
      <h1 style="font-size:var(--step-5);margin:.5rem 0 1.5rem">Danke, ${o.customer.name}.</h1>
      ${status}
      <table class="cart-table" style="margin-top:2rem">
        <tbody>
          ${lines.map(
            (l) =>
              html`<tr>
                <td>${l.qty} × ${l.title}${l.variantName ? html` <span class="muted">(${l.variantName})</span>` : ''}</td>
                <td class="num">${formatPrice(l.total)}</td>
              </tr>`,
          )}
        </tbody>
      </table>
      ${totalsHtml({
        subtotal: o.subtotal,
        discount: o.discount,
        shipping: o.shipping,
        total: o.total,
        vat: o.vat,
        currency: o.currency,
        needsShipping: o.shipping > 0,
      })}${digital.length
        ? html`<h2 style="font-size:var(--step-2);margin-top:2rem">Downloads</h2>
            <ul>
              ${digital.filter((d) => d.file).map((d) => html`<li><a href="/_nova/download/${o.token}/${d.file}">${d.title}</a></li>`)}
            </ul>`
        : ''}
    </div>`;
    return sendHtml(c, await renderSystemPage(ctx, { title: `Bestellung ${o.number}`, body }));
  });

  /** The customer's invoice with the Swiss QR bill, to print or scan with the banking app. */
  app.get('/bestellung/:token/rechnung', async (c) => {
    const [o] = await sql`select * from orders where token = ${c.req.param('token')}`;
    if (!o || o.payment_method !== 'invoice') return notFoundPage(c);
    c.header('Cache-Control', 'no-store');
    c.header('X-Robots-Tag', 'noindex');
    return c.html((await invoiceHtml(o)).value);
  });

  app.get('/bestellung/:token/bezahlen', async (c) => {
    const [o] = await sql`select id, status, payment_method from orders where token = ${c.req.param('token')}`;
    if (!o || o.status !== 'pending' || o.payment_method !== 'stripe' || !env.stripe.secretKey) return c.redirect(`/bestellung/${c.req.param('token')}`, 303);
    return c.redirect(await stripeCheckoutUrl(o.id as string), 303);
  });

  app.get('/_nova/download/:token/:media', async (c) => {
    const [o] = await sql`select items, status from orders where token = ${c.req.param('token')}`;
    if (!o || !['paid', 'fulfilled'].includes(o.status)) return c.notFound();
    const ids = (o.items as QuoteLine[]).filter((l) => l.digital).map((l) => l.productId);
    const [p] = await sql`select 1 from entries where id = any(${ids}::uuid[]) and published_data ->> 'file' = ${c.req.param('media')}`;
    if (!p) return c.notFound();
    const [m] = await sql`select storage_key, filename, mime from media where id = ${c.req.param('media')}`;
    if (!m) return c.notFound();
    const url = await storage.presign(m.storage_key, 600, m.filename);
    if (url) return c.redirect(url, 302);
    const obj = await storage.get(m.storage_key);
    if (!obj) return c.notFound();
    c.header('Content-Type', m.mime);
    c.header('Content-Disposition', `attachment; filename="${String(m.filename).replace(/"/g, '')}"`);
    return c.body(Readable.toWeb(obj.body) as ReadableStream);
  });

  app.post('/_nova/stripe/webhook', async (c) => {
    const payload = await c.req.text();
    if (!verifyStripeSignature(payload, c.req.header('stripe-signature'), env.stripe.webhookSecret)) return c.text('invalid signature', 400);
    await handleStripeEvent(JSON.parse(payload));
    return c.json({ received: true });
  });

  /* ---------- SEO files ---------- */

  app.get('/robots.txt', async (c) => {
    const s = await getSettings();
    const base = await siteBase(s);
    c.header('Content-Type', 'text/plain; charset=utf-8');
    if (s.seo.noindex) return c.body('User-agent: *\nDisallow: /\n');
    return c.body(
      `User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /warenkorb\nDisallow: /kasse\nDisallow: /bestellung/\nDisallow: /suche\n\nSitemap: ${base}/sitemap.xml\n`,
    );
  });

  app.get('/sitemap.xml', async (c) => {
    const s = await getSettings();
    const base = await siteBase(s);
    const collections = await activeCollections();
    const rows = await sql`
      select collection, slug, updated_at, published_data -> 'seo' ->> 'noindex' as noindex
      from entries where status = 'published' order by collection, slug`;
    const urls: string[] = [];
    // Translated pages: every language gets its own <url>, each listing all versions (hreflang).
    const langs = extraLangs(s);
    const maps = await Promise.all(langs.map(async (l) => ({ lang: l, map: await pathMap(l) })));
    const main = defaultLang(s);
    for (const r of rows) {
      const col = collections.find((x) => x.id === r.collection);
      if (!col || r.noindex === 'true') continue;
      const p = entryPath(col, r.slug as string);
      if (!p) continue;
      const lastmod = `<lastmod>${new Date(r.updated_at).toISOString().slice(0, 10)}</lastmod>`;
      const versions = [{ lang: main, path: p }, ...maps.filter((m) => m.map.toLocal.has(p)).map((m) => ({ lang: m.lang, path: m.map.toLocal.get(p)! }))];
      const links = versions.length > 1 ? versions.map((v) => `<xhtml:link rel="alternate" hreflang="${v.lang}" href="${base}${encodeURI(v.path)}"/>`).join('') : '';
      for (const v of versions) urls.push(`<url><loc>${base}${encodeURI(v.path)}</loc>${lastmod}${links}</url>`);
    }
    for (const col of collections) {
      if (col.list_route && !rows.some((r) => r.collection === 'pages' && `/${r.slug}` === col.list_route)) urls.push(`<url><loc>${base}${col.list_route}</loc></url>`);
    }
    c.header('Content-Type', 'application/xml; charset=utf-8');
    return c.body(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join('')}</urlset>`,
    );
  });

  app.get('/feed.xml', async (c) => {
    const s = await getSettings();
    const base = await siteBase(s);
    const col = (await activeCollections()).find((x) => x.id === 'posts');
    if (!col) return c.notFound();
    const items = await localized(
      (await sql`
      select e.id, e.slug, e.published_data as data, e.published_at, u.name as author from entries e left join users u on u.id = e.author_id
      where e.collection = 'posts' and e.status = 'published' order by coalesce(e.published_data ->> 'date', e.published_at::text) desc limit 30`) as unknown as {
        id: string;
        slug: string;
        data: EntryData;
        published_at: string;
        author: string;
      }[],
      'posts',
    );
    const lang = currentLang();
    const map = lang ? await pathMap(lang) : null;
    const feedBase = lang ? base + localizePath(await pathMap(lang), lang, '/').replace(/\/$/, '') : base;
    const x = (v: unknown) => String(v ?? '').replace(/[<>&'"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[ch]!);
    const entries = items
      .map((i) => {
        const d = i.data as EntryData;
        const link = lang ? base + localizePath(map!, lang, entryPath(col, i.slug)!) : base + entryPath(col, i.slug);
        const desc = (d.excerpt as string) || (entryAccess(d) === 'public' ? excerpt(blocksText(d.blocks), 300) : '');
        const date = new Date((d.date as string) || i.published_at).toUTCString();
        return `<item><title>${x(d.title)}</title><link>${x(link)}</link><guid>${x(link)}</guid><pubDate>${date}</pubDate><description>${x(desc)}</description>${d.category ? `<category>${x(d.category)}</category>` : ''}</item>`;
      })
      .join('');
    c.header('Content-Type', 'application/rss+xml; charset=utf-8');
    return c.body(
      `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${x(s.name)}</title><link>${x(base)}</link><description>${x(s.tagline || s.seo.defaultDescription)}</description><language>${x(lang ? langInfo(lang).locale : s.locale)}</language><atom:link href="${x(feedBase)}/feed.xml" rel="self" type="application/rss+xml"/>${entries}</channel></rss>`,
    );
  });

  app.get('/:key{[a-f0-9]{32}\\.txt}', async (c) => {
    const s = await getSettings();
    if (c.req.param('key') !== `${s.seo.indexNowKey}.txt`) return c.notFound();
    return c.text(s.seo.indexNowKey);
  });

  /* ---------- search ---------- */

  app.get('/suche', async (c) => {
    const ctx = await ctxFor(c);
    const q = (c.req.query('q') ?? '').trim().slice(0, 100);
    const collections = ctx.collections.filter((x) => x.id === 'pages' || x.route || x.list_route);
    let results: { title: string; href: string; text: string }[] = [];
    const lang = currentLang();
    if (q) {
      // In another language: its translations, plus originals that have none.
      const cfg = lang ? langInfo(lang).pg : 'german';
      const like = '%' + q.replace(/[%_]/g, '') + '%';
      const translatedRows = lang
        ? await sql`
        select e.id, e.collection, e.slug, e.published_data as data, ts_rank(to_tsvector(${cfg}::regconfig, t.published_data::text), websearch_to_tsquery(${cfg}::regconfig, ${q})) as rank
        from entry_translations t join entries e on e.id = t.entry_id
        where t.lang = ${lang} and t.status = 'published' and e.status = 'published' and e.collection = any(${collections.map((x) => x.id)})
          and ((coalesce(e.published_data ->> 'access', 'public') = 'public' and to_tsvector(${cfg}::regconfig, t.published_data::text) @@ websearch_to_tsquery(${cfg}::regconfig, ${q}))
            or t.published_data ->> 'title' ilike ${like})
          and coalesce(e.published_data -> 'seo' ->> 'noindex', 'false') <> 'true'
        order by rank desc limit 30`
        : [];
      const mainRows = await sql`
        select id, collection, slug, published_data as data,
               ts_rank(to_tsvector('german', published_data::text), websearch_to_tsquery('german', ${q})) as rank
        from entries
        where status = 'published' and collection = any(${collections.map((x) => x.id)})
          and ((coalesce(published_data ->> 'access', 'public') = 'public' and to_tsvector('german', published_data::text) @@ websearch_to_tsquery('german', ${q}))
            or published_data ->> 'title' ilike ${'%' + q.replace(/[%_]/g, '') + '%'})
          and coalesce(published_data -> 'seo' ->> 'noindex', 'false') <> 'true'
          ${lang ? sql`and not exists (select 1 from entry_translations t where t.entry_id = entries.id and t.lang = ${lang} and t.status = 'published')` : sql``}
        order by rank desc limit 30`;
      const rows = await localized(
        [...translatedRows, ...mainRows].sort((a, b) => Number(b.rank) - Number(a.rank)).slice(0, 30) as unknown as {
          id: string;
          collection: string;
          slug: string;
          data: EntryData;
        }[],
      );
      results = rows
        .map((r) => {
          const col = collections.find((x) => x.id === r.collection)!;
          const d = r.data as EntryData;
          const href = entryPath(col, r.slug as string) ?? col.list_route;
          // Members-only entries are found by their title and show only their excerpt.
          const body = entryAccess(d) === 'public' ? (d.description ? stripHtml(String(d.description)) : '') || blocksText(d.blocks) : '';
          return href ? { title: d.title, href, text: excerpt((d.excerpt as string) || body, 180) } : null;
        })
        .filter((x): x is { title: string; href: string; text: string } => x !== null);
    }
    const body = html`<div class="wrap" style="padding-block:var(--sp-s)">
      <h1 style="font-size:var(--step-5);margin-bottom:1.5rem">Suche</h1>
      <form class="search-form" role="search">
        <label class="sr" for="sq">Suchbegriff</label><input id="sq" name="q" type="search" value="${q}" autofocus /><button class="btn">Suchen</button>
      </form>
      ${q
        ? html`<p class="muted" style="margin-top:1.5rem">${results.length ? `${results.length} Treffer für «${q}»` : `Keine Treffer für «${q}». Versuch ein anderes Wort.`}</p>`
        : ''}
      <ul class="results">
        ${results.map((r) => html`<li><a href="${r.href}">${r.title}</a>${r.text ? html`<p class="muted" style="margin:.35rem 0 0">${r.text}</p>` : ''}</li>`)}
      </ul>
    </div>`;
    return sendHtml(c, await renderSystemPage(ctx, { title: q ? `Suche: ${q}` : 'Suche', body }));
  });

  /* printable menu (save as PDF from the browser) */
  app.get('/karte/druck', async (c) => {
    const s = await getSettings();
    if (!s.modules.includes('menu')) return c.notFound();
    const ctx = await ctxFor(c);
    const { css } = themeCss(s);
    const menu = await renderMenu(ctx, { daily: false, allergens: true });
    const page = `<!doctype html><html lang="${s.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Karte – ${html`${s.name}`}</title><meta name="robots" content="noindex"><style>${css}
      @page{size:A4;margin:16mm 14mm}body{background:#fff;color:#111;--bg:#fff;--ink:#111;--ink-2:#444;--line:#bbb}.print-head{text-align:center;margin-bottom:10mm}.print-head h1{font-size:2.4rem}.mn-cat{break-inside:avoid-page}.dish{break-inside:avoid}.no-print{margin:1rem 0}@media print{.no-print{display:none}}</style></head><body><div class="wrap" style="padding-block:2rem"><p class="no-print"><button class="btn" onclick="print()">Drucken oder als PDF sichern</button></p><header class="print-head"><h1>${html`${s.name}`}</h1><p class="muted">${html`${[s.business.street, `${s.business.zip} ${s.business.city}`.trim(), s.business.phone].filter(Boolean).join(' · ')}`}</p></header>${menu}</div></body></html>`;
    c.header('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; font-src 'self'");
    return sendHtml(c, page);
  });

  /* ---------- pages (catch-all) ---------- */

  app.get('*', async (c) => {
    const url = new URL(c.req.url);
    let path = decodeURIComponent(url.pathname);
    if (path.length > 1 && path.endsWith('/')) return c.redirect(path.replace(/\/+$/, '') + url.search, 301);
    if (path !== path.toLowerCase() && !path.startsWith('/media')) path = path.toLowerCase();

    const [redirect] = await sql`select id, to_path, code from redirects where from_path = ${path}`;
    if (redirect) {
      void sql`update redirects set hits = hits + 1 where id = ${redirect.id}`.catch(() => {});
      if (redirect.code === 410) return c.body('Diese Seite wurde entfernt.', 410);
      return c.redirect(redirect.to_path + url.search, redirect.code as 301 | 302);
    }

    const s = await getSettings();
    const ageOk = unsign(getCookie(c, AGE_COOKIE), await appSecret()) === '1';
    const cart = s.modules.includes('shop') ? (await cartItems(c)).reduce((n, i) => n + i.q, 0) : 0;
    // Members see other content (and «Mein Konto» in the header): one cached copy per level.
    const member = s.modules.includes('members') ? await currentMember(c) : null;
    const key = `${currentLang() ?? ''}|${path}?${url.searchParams}|${ageOk ? 1 : 0}|${cart}|${timeBucket()}|${c.get('user') && !s.firstPublishedAt ? 'staff' : ''}|${member?.level ?? ''}`;
    const send = (body: string, etag: string) => {
      const res = sendHtml(c, body, 200, etag);
      if (member) res.headers.set('Cache-Control', 'private, no-cache');
      return res;
    };
    const hit = cacheGet(key);
    if (hit) {
      if (c.req.header('if-none-match') === hit.etag) return c.body(null, 304);
      return send(hit.html, hit.etag);
    }

    const staff = Boolean(c.get('user'));
    if (!s.firstPublishedAt && !staff) return holdingPage(c, s);
    const resolved = await resolve(path);
    if (!resolved) return notFoundPage(c);
    const ctx = await ctxFor(c);
    const body = resolved.kind === 'entry' ? await renderPage(ctx, resolved.collection, resolved.entry) : await renderList(ctx, resolved.collection);
    const etag = cacheSet(key, body);
    return send(body, etag);
  });
}

function totalsHtml(q: { subtotal: number; discount: number; shipping: number; total: number; vat: { rate: number; amount: number }[]; currency: string; needsShipping: boolean }) {
  return html`<div class="totals">
    <div><span>Zwischensumme</span><span>${formatPrice(q.subtotal)}</span></div>
    ${q.discount ? html`<div><span>Rabatt</span><span>−${formatPrice(q.discount)}</span></div>` : ''}${q.needsShipping
      ? html`<div><span>Versand</span><span>${q.shipping ? formatPrice(q.shipping) : 'gratis'}</span></div>`
      : ''}
    <div class="grand"><span>Total ${q.currency}</span><span>${formatPrice(q.total)}</span></div>
    ${q.vat.map((v) => html`<div class="muted"><span>inkl. ${v.rate}% MwSt.</span><span>${formatPrice(v.amount)}</span></div>`)}
  </div>`;
}

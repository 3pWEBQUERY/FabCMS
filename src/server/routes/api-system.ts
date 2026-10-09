import type { Hono } from 'hono';
import { formatIban, validQrIban } from '../../shared/qrbill';
import { deleteMember } from '../members';
import { z } from 'zod';
import { createHmac } from 'node:crypto';
import QRCode from 'qrcode';
import { Readable } from 'node:stream';
import { sql, json } from '../db';
import { audit, requireAnyCap, requireCap, requireUser, type AppEnv } from '../auth';
import { getSettings, updateSettings, bumpGeneration } from '../settings';
import { activeCollections, listCollections, uniqueSlug } from '../content';
import { badRequest, forbidden, HttpError, notFound } from '../lib/http';
import { stats } from '../analytics';
import { seedSite, modulesFor } from '../seed';
import { legalPages } from '../legal';
import { createBackup, restoreBackup } from '../backup';
import { exportZip } from '../export';
import { storage } from '../storage';
import { env, s3Configured } from '../env';
import { mailConfigured, sendMail } from '../mail';
import { sha256, token } from '../lib/crypto';
import { rateLimit } from '../lib/ratelimit';
import { analyzeSeo, fullTitle } from '../../shared/seo-analyze';
import { blocksImages, blocksLinks } from '../../shared/blocks';
import { entryPath, matchRoute } from '../../shared/paths';
import { SECTOR_MAP } from '../../shared/collections';
import { THEMES } from '../../site/themes';
import { FONT_PAIRS } from '../../site/fonts';
import { can } from '../../shared/roles';
import { shortId } from '../../shared/text';
import type { EntryData, SiteSettings } from '../../shared/types';
import { HOOK_EVENTS } from '../../shared/hooks';
import { defaultLang, isLang, LANGS } from '../../shared/i18n';
import { checkHookCode, runHook } from '../hooks';

/** Settings keys and the capability needed to change them. */
const DESIGN_KEYS = new Set(['theme']);
const DEV_KEYS = new Set(['webhooks', 'hooks', 'roleModes', 'security']);

async function geocode(s: SiteSettings): Promise<{ lat: number; lng: number } | null> {
  const q = [s.business.street, s.business.zip, s.business.city, s.business.country].filter(Boolean).join(', ');
  if (!s.business.city) return null;
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': `NovaCMS/0.1 (${env.publicUrl})`, 'Accept-Language': 'de' },
      signal: AbortSignal.timeout(6000),
    });
    const [hit] = (await r.json()) as { lat: string; lon: string }[];
    return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
  } catch {
    return null;
  }
}

async function publicBase() {
  const s = await getSettings();
  return (s.baseUrl || env.publicUrl).replace(/\/$/, '');
}

export function systemApi(app: Hono<AppEnv>) {
  /* ---------- settings ---------- */

  app.get('/api/settings', async (c) => {
    const user = requireUser(c);
    const s = await getSettings();
    const safe = can(user.role, 'dev') ? s : { ...s, webhooks: [], hooks: [] };
    return c.json({
      settings: safe,
      themes: THEMES.map(({ css: _css, ...t }) => t),
      fontPairs: FONT_PAIRS,
      system: {
        storage: s3Configured() ? 'bucket' : 'local',
        mail: mailConfigured(),
        stripe: Boolean(env.stripe.secretKey),
        stripeWebhook: Boolean(env.stripe.webhookSecret),
        turnstile: Boolean(env.turnstile.siteKey),
        publicUrl: env.publicUrl,
      },
    });
  });

  app.patch('/api/settings', async (c) => {
    const user = requireAnyCap(c, 'settings.manage', 'design.manage');
    const patch = (await c.req.json()) as Partial<SiteSettings>;
    for (const key of Object.keys(patch)) {
      if (DEV_KEYS.has(key) && !can(user.role, 'dev')) throw forbidden('Diese Einstellung ist der Werkbank vorbehalten.');
      if (DESIGN_KEYS.has(key) && !can(user.role, 'design.manage')) throw forbidden();
      if (!DESIGN_KEYS.has(key) && !can(user.role, 'settings.manage')) throw forbidden();
    }
    if (patch.theme && (patch.theme.tokens !== undefined || patch.theme.css !== undefined) && !can(user.role, 'dev'))
      throw forbidden('Eigenes CSS und Design-Tokens gibt es in der Werkbank.');
    if (patch.baseUrl !== undefined && patch.baseUrl && !/^https?:\/\/[^/]+$/.test(patch.baseUrl.replace(/\/$/, '')))
      throw badRequest('Die Adresse muss wie «https://www.beispiel.ch» aussehen.');
    if (patch.shop?.iban) {
      patch.shop.iban = formatIban(patch.shop.iban);
      if (!validQrIban(patch.shop.iban)) throw badRequest('Für die QR-Rechnung braucht es eine gültige IBAN aus der Schweiz oder Liechtenstein.');
    }
    if (patch.webhooks) {
      for (const w of patch.webhooks) {
        if (!/^https:\/\//.test(w.url)) throw badRequest('Webhooks müssen eine https-Adresse haben.');
        w.id ||= shortId();
        w.secret ||= token(24);
      }
    }
    if (patch.languages) {
      const main = defaultLang({ locale: patch.locale ?? (await getSettings()).locale });
      patch.languages = [...new Set(patch.languages)].filter((l) => isLang(l) && l !== main);
    }
    if (patch.locale && !LANGS.some((l) => l.locale === patch.locale)) throw badRequest('Diese Sprache gibt es nicht.');
    if (patch.hooks) {
      if (!Array.isArray(patch.hooks) || patch.hooks.length > 50) throw badRequest('Höchstens 50 Hooks.');
      for (const h of patch.hooks) {
        if (!HOOK_EVENTS.some((e) => e.value === h.event)) throw badRequest('Unbekanntes Ereignis für einen Hook.');
        h.id ||= shortId();
        h.name =
          String(h.name ?? '')
            .trim()
            .slice(0, 80) || 'Hook';
        h.collection = h.event === 'form.beforeSubmit' ? '' : String(h.collection ?? '');
        h.code = String(h.code ?? '');
        h.active = Boolean(h.active);
        const problem = await checkHookCode(h.code);
        if (problem) throw badRequest(`Hook «${h.name}»: ${problem}`);
      }
    }
    const before = await getSettings();
    // Arrays and nav are replaced as a whole.
    let next = await updateSettings(patch);
    const b = next.business;
    const old = before.business;
    if (patch.business && (b.street !== old.street || b.zip !== old.zip || b.city !== old.city || !b.lat)) {
      const geo = await geocode(next);
      next = await updateSettings({ business: { ...next.business, lat: geo?.lat, lng: geo?.lng } });
    }
    await audit(c, 'settings.update', 'settings', '', { keys: Object.keys(patch) });
    return c.json({ settings: next });
  });

  /** Runs a hook against real data without saving anything. */
  app.post('/api/hooks/test', async (c) => {
    requireCap(c, 'dev');
    const { code, event, collection } = z
      .object({ code: z.string().max(20_000), event: z.enum(['entry.beforeSave', 'entry.beforePublish', 'form.beforeSubmit']), collection: z.string().default('') })
      .parse(await c.req.json());
    let sample: Record<string, unknown>;
    if (event === 'form.beforeSubmit') {
      const [f] = await sql`select id, name, fields from forms order by created_at limit 1`;
      const fields = Object.fromEntries(
        ((f?.fields as { name: string; type: string }[]) ?? [])
          .filter((x) => x.type !== 'step' && x.type !== 'file')
          .map((x) => [x.name, x.type === 'email' ? 'test@example.ch' : 'Test']),
      );
      sample = { form: { id: f?.id ?? '', name: f?.name ?? 'Kontakt' }, fields, page: '/kontakt', spam: false };
    } else {
      const [e] = collection
        ? await sql`select collection, slug, data from entries where collection = ${collection} order by updated_at desc limit 1`
        : await sql`select collection, slug, data from entries where collection <> 'sections' order by updated_at desc limit 1`;
      sample = {
        collection: e?.collection ?? (collection || 'pages'),
        slug: e?.slug ?? 'beispiel',
        ...(event === 'entry.beforeSave' ? { isNew: false } : {}),
        data: e?.data ?? { title: 'Beispiel' },
      };
    }
    return c.json({ input: sample, run: await runHook(code, sample) });
  });

  app.post('/api/webhooks/test', async (c) => {
    requireCap(c, 'dev');
    const { url } = z.object({ url: z.string().url() }).parse(await c.req.json());
    const s = await getSettings();
    const hook = s.webhooks.find((w) => w.url === url);
    if (!hook) throw notFound('Speichere den Webhook zuerst.');
    const body = JSON.stringify({ event: 'test', site: env.publicUrl, at: new Date().toISOString(), data: { message: 'Hallo von Nova' } });
    const sig = createHmac('sha256', hook.secret).update(body).digest('hex');
    const started = Date.now();
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Nova-Signature': `sha256=${sig}` },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      return c.json({ ok: r.ok, status: r.status, ms: Date.now() - started });
    } catch (e) {
      return c.json({ ok: false, status: 0, error: (e as Error).message, ms: Date.now() - started });
    }
  });

  /* ---------- onboarding ---------- */

  /** Reads name, description, colours, address and hours from an existing website. */
  app.get('/api/onboarding/import', async (c) => {
    requireCap(c, 'settings.manage');
    const raw = c.req.query('url') ?? '';
    let url: URL;
    try {
      url = new URL(/^https?:\/\//.test(raw) ? raw : `https://${raw}`);
    } catch {
      throw badRequest('Das sieht nicht nach einer Web-Adresse aus.');
    }
    if (
      !/^https?:$/.test(url.protocol) ||
      /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[|0\.)/.test(url.hostname) ||
      url.hostname.endsWith('.internal') ||
      url.hostname.endsWith('.railway.internal')
    )
      throw badRequest('Diese Adresse kann Nova nicht abrufen.');
    if (!rateLimit(`import:${requireUser(c).id}`, 10, 60_000).ok) throw new HttpError(429, 'Bitte warte kurz.');
    const r = await fetch(url, { headers: { 'User-Agent': 'NovaCMS-Import/0.1' }, redirect: 'follow', signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!r?.ok) throw badRequest('Die Website hat nicht geantwortet. Du kannst die Angaben auch selbst eintragen.');
    const html = (await r.text()).slice(0, 600_000);
    const meta = (name: string) =>
      new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i').exec(html)?.[1] ??
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`, 'i').exec(html)?.[1];
    const decode = (s?: string) =>
      s
        ?.replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .trim();
    const out: Record<string, unknown> = {
      name: decode(meta('og:site_name') ?? /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.split(/[|–\-·]/)[0]),
      description: decode(meta('description') ?? meta('og:description')),
      themeColor: meta('theme-color'),
      image: meta('og:image'),
    };
    for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const data = JSON.parse(m[1]);
        const items = (Array.isArray(data) ? data : (data['@graph'] ?? [data])) as Record<string, any>[];
        const biz = items.find((i) => i.address || i.telephone || i.openingHoursSpecification);
        if (biz) {
          const a = biz.address ?? {};
          out.business = {
            type: biz['@type'],
            legalName: biz.name,
            street: a.streetAddress,
            zip: a.postalCode,
            city: a.addressLocality,
            country: a.addressCountry?.name ?? a.addressCountry,
            phone: biz.telephone,
            email: biz.email,
          };
          const spec = ([] as Record<string, any>[]).concat(biz.openingHoursSpecification ?? []);
          if (spec.length) {
            const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            out.hours = days.map((d, i) => {
              const slots = spec
                .filter((s) => ([] as string[]).concat(s.dayOfWeek ?? []).some((x) => String(x).endsWith(d)))
                .map((s) => ({ from: String(s.opens).slice(0, 5), to: String(s.closes).slice(0, 5) }));
              return { day: i + 1, closed: slots.length === 0, slots };
            });
          }
          break;
        }
      } catch {
        /* ignore invalid JSON-LD */
      }
    }
    return c.json({ imported: out });
  });

  /** Step 2 of the assistant: create starter content so step 3 can preview it. */
  app.post('/api/onboarding/seed', async (c) => {
    const user = requireCap(c, 'settings.manage');
    const body = z
      .object({
        sectors: z.array(z.string()).min(1, 'Wähl mindestens eine Sparte.').max(4),
        name: z.string().trim().min(1, 'Wie heisst dein Projekt?').max(80),
        imported: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(await c.req.json());
    const s = await getSettings();
    if (s.setupDone) throw badRequest('Die Einrichtung ist schon abgeschlossen.');
    const sectors = body.sectors.filter((x) => SECTOR_MAP[x]);
    const seeded = await seedSite(sectors, body.name, user.id);
    const imp = (body.imported ?? {}) as { description?: string; business?: Partial<SiteSettings['business']>; hours?: SiteSettings['hours'] };
    const business = { ...s.business, type: SECTOR_MAP[sectors[0]]?.businessType ?? 'LocalBusiness', legalName: body.name };
    if (imp.business) for (const [k, v] of Object.entries(imp.business)) if (typeof v === 'string' && v) (business as Record<string, unknown>)[k] = v;
    const adult = sectors.includes('adult');
    const [first] = sectors.map((x) => SECTOR_MAP[x]);
    await updateSettings({
      name: body.name,
      tagline: seeded.tagline,
      sectors,
      modules: modulesFor(sectors),
      business,
      hours: imp.hours ?? s.hours,
      nav: seeded.nav,
      footer: { text: seeded.footer, columns: [] },
      theme: { ...s.theme, id: first?.themes[0] ?? 'kante', palette: 'default' },
      seo: { ...s.seo, defaultDescription: imp.description ?? '', adult },
      ageGate: { ...s.ageGate, enabled: adult },
    });
    if (business.city) {
      const geo = await geocode(await getSettings());
      if (geo) await updateSettings({ business: { ...business, ...geo } });
    }
    return c.json({ themes: first?.themes ?? ['kante', 'bistro', 'feuilleton'] });
  });

  app.post('/api/onboarding/finish', async (c) => {
    const user = requireCap(c, 'settings.manage');
    const body = z
      .object({ theme: z.string(), palette: z.string().default('default'), mode: z.enum(['studio', 'werkbank']), baseUrl: z.string().optional() })
      .parse(await c.req.json());
    const s = await getSettings();
    if (!THEMES.some((t) => t.id === body.theme)) throw badRequest('Unbekannter Stil.');
    const baseUrl = body.baseUrl?.trim() ? body.baseUrl.trim().replace(/\/$/, '') : s.baseUrl;
    if (baseUrl && !/^https?:\/\/[^/\s]+$/.test(baseUrl)) throw badRequest('Die Domain muss wie «https://www.beispiel.ch» aussehen.');
    await updateSettings({ theme: { ...s.theme, id: body.theme, palette: body.palette }, setupDone: true, baseUrl });
    if (user.allowed_modes.includes(body.mode)) await sql`update users set mode = ${body.mode} where id = ${user.id}`;
    await audit(c, 'setup.complete', 'settings', '', { sectors: s.sectors });
    return c.json({ ok: true });
  });

  /** First «Veröffentlichen» of the whole site: until then visitors see a holding page. */
  app.post('/api/site/launch', async (c) => {
    requireCap(c, 'content.publish');
    const s = await getSettings();
    const first = !s.firstPublishedAt;
    if (first) await updateSettings({ firstPublishedAt: new Date().toISOString() });
    await audit(c, 'site.launch');
    return c.json({ firstPublish: first, url: await publicBase() });
  });

  /* ---------- legal ---------- */

  app.post('/api/legal/generate', async (c) => {
    const user = requireCap(c, 'settings.manage');
    const s = await getSettings();
    const created: { id: string; slug: string; title: string }[] = [];
    for (const page of legalPages(s)) {
      const data = { title: page.title, blocks: page.blocks, seo: { noindex: false } };
      const [existing] = await sql`select id from entries where collection = 'pages' and slug = ${page.slug}`;
      if (existing) {
        await sql`update entries set data = ${json(data)}, version = version + 1, updated_at = now() where id = ${existing.id}`;
        await sql`insert into revisions (entry_id, data, kind, user_id) values (${existing.id}, ${json(data)}, 'import', ${user.id})`;
        created.push({ id: existing.id as string, slug: page.slug, title: page.title });
      } else {
        const slug = await uniqueSlug('pages', page.slug);
        const [e] = await sql`insert into entries (collection, slug, data, author_id) values ('pages', ${slug}, ${json(data)}, ${user.id}) returning id`;
        created.push({ id: e.id as string, slug, title: page.title });
      }
    }
    await updateSettings({ legal: { generatedAt: new Date().toISOString() } });
    await audit(c, 'legal.generate');
    return c.json({ pages: created });
  });

  /* ---------- dashboard, checklist, stats ---------- */

  app.get('/api/dashboard', async (c) => {
    const user = requireUser(c);
    const s = await getSettings();
    const [counts] = await sql`
      select (select count(*)::int from submissions where not read) as unread,
             (select count(*)::int from comments where status = 'pending') as comments,
             (select count(*)::int from orders where status = 'paid') as to_ship,
             (select count(*)::int from entries where status = 'review') as review,
             (select count(*)::int from contacts where status = 'new') as new_leads,
             (select count(*)::int from media where mime like 'image/%' and alt = '' and not private) as missing_alt,
             (select count(*)::int from bookings where status = 'pending' and starts_at > now()) as pending_bookings,
             (select count(*)::int from bookings where status = 'confirmed' and (starts_at at time zone ${s.timezone})::date = (now() at time zone ${s.timezone})::date) as today_bookings`;
    const recent = await sql`
      select e.id, e.collection, e.slug, e.status, e.data ->> 'title' as title, e.updated_at, u.name as author_name
      from entries e left join users u on u.id = e.author_id
      where e.collection <> 'sections' ${can(user.role, 'content.edit') ? sql`` : sql`and e.author_id = ${user.id}`}
      order by e.updated_at desc limit 6`;
    const [home] = await sql`select id from entries where collection = 'pages' and slug = ''`;
    const legal = await sql`select slug, status from entries where collection = 'pages' and slug in ('impressum', 'datenschutz')`;
    const [customPage] = await sql`select 1 from entries where collection = 'pages' and updated_at > created_at + interval '5 seconds' and author_id = ${user.id} limit 1`;
    const domainOk = Boolean(s.baseUrl) && !/\.up\.railway\.app$/.test(new URL(s.baseUrl).hostname);
    const checklist = [
      { id: 'logo', label: 'Logo hochladen', done: Boolean(s.logo), href: '/admin/einstellungen/website' },
      { id: 'contact', label: 'Adresse und Kontakt eintragen', done: Boolean(s.business.email && s.business.city), href: '/admin/einstellungen/website' },
      { id: 'page', label: 'Startseite mit eigenen Worten füllen', done: Boolean(customPage), href: home ? `/admin/seiten/${home.id}` : '/admin/seiten' },
      { id: 'legal', label: 'Impressum und Datenschutz prüfen', done: legal.filter((l) => l.status === 'published').length >= 2, href: '/admin/einstellungen/rechtliches' },
      { id: 'domain', label: 'Eigene Domain verbinden', done: domainOk, href: '/admin/einstellungen/domain' },
      { id: 'publish', label: 'Website veröffentlichen', done: Boolean(s.firstPublishedAt), href: home ? `/admin/seiten/${home.id}` : '/admin/seiten' },
    ];
    const st = can(user.role, 'settings.manage') || can(user.role, 'leads.view') ? await stats(7, s.timezone) : null;
    return c.json({ counts, recent, checklist, stats: st, sessions: user.sessions_count, site: { name: s.name, baseUrl: await publicBase() } });
  });

  app.get('/api/stats', async (c) => {
    requireAnyCap(c, 'settings.manage', 'leads.view', 'orders.view');
    const s = await getSettings();
    return c.json(await stats(Number(c.req.query('days')) || 30, s.timezone));
  });

  /* ---------- site-wide SEO check ---------- */

  app.get('/api/seo/site-check', async (c) => {
    requireAnyCap(c, 'content.edit', 'settings.manage');
    const s = await getSettings();
    const collections = await activeCollections();
    const entries = await sql`select id, collection, slug, published_data as data from entries where status = 'published'`;
    const media = await sql`select id, alt from media where mime like 'image/%'`;
    const alts = Object.fromEntries(media.map((m) => [m.id as string, m.alt as string]));
    const redirects = new Set((await sql`select from_path from redirects`).map((r) => r.from_path as string));
    const known = new Set<string>(['/', '/suche', '/warenkorb', '/kasse', '/feed.xml', '/karte/druck']);
    for (const col of collections) if (col.list_route) known.add(col.list_route);
    const pathOf = new Map<string, string>();
    for (const e of entries) {
      const col = collections.find((x) => x.id === e.collection);
      const p = col ? entryPath(col, e.slug as string) : null;
      if (p) {
        known.add(p);
        pathOf.set(e.id as string, p);
      }
    }
    const linkedTo = new Set<string>(
      s.nav.flatMap((n) => [n.href, ...(n.children ?? []).map((x) => x.href)]).concat(s.footer.columns.flatMap((col) => col.links.map((l) => l.href))),
    );
    const issues: { kind: string; severity: 'bad' | 'warn'; message: string; entryId?: string; title?: string }[] = [];
    const titles = new Map<string, { id: string; title: string }[]>();

    for (const e of entries) {
      const col = collections.find((x) => x.id === e.collection);
      if (!col) continue;
      const d = e.data as EntryData;
      const path = pathOf.get(e.id as string);
      if (path) {
        const t = fullTitle({ title: d.title, seo: d.seo ?? {}, isHome: path === '/', siteName: s.name, titleTemplate: s.seo.titleTemplate });
        titles.set(t, [...(titles.get(t) ?? []), { id: e.id as string, title: d.title }]);
      }
      for (const l of blocksLinks(d.blocks)) {
        const href = l.href.split('#')[0].split('?')[0];
        if (!href.startsWith('/') || href.startsWith('//') || href.startsWith('/media/')) continue;
        linkedTo.add(href);
        const ok = known.has(href) || redirects.has(href) || collections.some((x) => x.route && matchRoute(x.route, href));
        if (!ok) issues.push({ kind: 'broken-link', severity: 'bad', message: `Link auf «${href}» führt ins Leere.`, entryId: e.id as string, title: d.title });
      }
      const missing = blocksImages(d.blocks).filter((i) => alts[i.media] === '');
      for (const field of col.fields.filter((f) => f.type === 'image' || f.type === 'images')) {
        const ids = ([] as unknown[]).concat(d[field.key] ?? []).filter((x): x is string => typeof x === 'string');
        for (const id of ids) if (alts[id] === '') missing.push({ blockId: '', media: id });
      }
      if (missing.length) issues.push({ kind: 'alt', severity: 'bad', message: `${missing.length} Bild(er) ohne Alt-Text.`, entryId: e.id as string, title: d.title });
      if (path && !d.seo?.description && col.id === 'pages' && path !== '/')
        issues.push({ kind: 'description', severity: 'warn', message: 'Keine eigene Beschreibung für Suchmaschinen.', entryId: e.id as string, title: d.title });
      if (path && d.seo?.noindex) issues.push({ kind: 'noindex', severity: 'warn', message: 'Für Suchmaschinen gesperrt.', entryId: e.id as string, title: d.title });
      if (col.id === 'pages' && path) {
        const r = analyzeSeo({
          title: d.title,
          slug: e.slug as string,
          isHome: path === '/',
          ownH1: false,
          seo: d.seo ?? {},
          blocks: d.blocks ?? [],
          siteName: s.name,
          titleTemplate: s.seo.titleTemplate,
          alts,
        });
        if (r.checks.some((x) => x.id === 'h1' && x.status === 'bad'))
          issues.push({ kind: 'h1', severity: 'bad', message: 'Keine Hauptüberschrift (H1).', entryId: e.id as string, title: d.title });
      }
    }
    for (const [t, list] of titles)
      if (list.length > 1)
        for (const x of list)
          issues.push({ kind: 'duplicate-title', severity: 'warn', message: `Gleicher Seitentitel wie ${list.length - 1} andere: «${t}».`, entryId: x.id, title: x.title });
    for (const e of entries) {
      if (e.collection !== 'pages') continue;
      const p = pathOf.get(e.id as string);
      if (!p || p === '/' || ['/impressum', '/datenschutz', '/agb'].includes(p)) continue;
      if (!linkedTo.has(p))
        issues.push({
          kind: 'orphan',
          severity: 'warn',
          message: 'Keine andere Seite verlinkt hierher – Besucher finden sie kaum.',
          entryId: e.id as string,
          title: (e.data as EntryData).title,
        });
    }
    const order = { bad: 0, warn: 1 };
    issues.sort((a, b) => order[a.severity] - order[b.severity]);
    return c.json({ issues, checked: entries.length });
  });

  /* ---------- redirects ---------- */

  app.get('/api/redirects', async (c) => {
    requireAnyCap(c, 'settings.manage', 'content.publish');
    return c.json({ redirects: await sql`select * from redirects order by created_at desc` });
  });

  app.post('/api/redirects', async (c) => {
    requireAnyCap(c, 'settings.manage', 'content.publish');
    const b = z
      .object({
        from_path: z.string().regex(/^\/[^\s]*$/, 'Die alte Adresse muss mit / beginnen.'),
        to_path: z.string().min(1),
        code: z.union([z.literal(301), z.literal(302), z.literal(410)]).default(301),
      })
      .parse(await c.req.json());
    const from = b.from_path.replace(/\/+$/, '') || '/';
    if (from === b.to_path) throw badRequest('Eine Weiterleitung auf sich selbst geht nicht.');
    const [r] =
      await sql`insert into redirects (from_path, to_path, code) values (${from.toLowerCase()}, ${b.to_path}, ${b.code}) on conflict (from_path) do update set to_path = excluded.to_path, code = excluded.code returning *`;
    bumpGeneration();
    return c.json({ redirect: r });
  });

  app.delete('/api/redirects/:id', async (c) => {
    requireAnyCap(c, 'settings.manage', 'content.publish');
    await sql`delete from redirects where id = ${c.req.param('id')}`;
    bumpGeneration();
    return c.json({ ok: true });
  });

  /* ---------- audit ---------- */

  app.get('/api/audit', async (c) => {
    requireCap(c, 'audit.view');
    const rows = await sql`
      select a.*, u.name as user_name from audit_log a left join users u on u.id = a.user_id
      order by a.created_at desc limit ${Math.min(1000, Number(c.req.query('limit')) || 200)}`;
    return c.json({ entries: rows });
  });

  /* ---------- API tokens ---------- */

  app.get('/api/tokens', async (c) => {
    requireCap(c, 'dev');
    return c.json({ tokens: await sql`select id, name, scopes, last_used_at, created_at from api_tokens order by created_at desc` });
  });

  app.post('/api/tokens', async (c) => {
    const user = requireCap(c, 'dev');
    const b = z.object({ name: z.string().trim().min(1).max(80), scopes: z.array(z.enum(['read', 'write'])).min(1) }).parse(await c.req.json());
    const raw = `nova_${token(24)}`;
    const [t] =
      await sql`insert into api_tokens (name, token_hash, scopes, created_by) values (${b.name}, ${sha256(raw)}, ${b.scopes}, ${user.id}) returning id, name, scopes, created_at`;
    await audit(c, 'token.create', 'token', t.id as string, { scopes: b.scopes });
    return c.json({ token: t, secret: raw });
  });

  app.delete('/api/tokens/:id', async (c) => {
    requireCap(c, 'dev');
    await sql`delete from api_tokens where id = ${c.req.param('id')}`;
    await audit(c, 'token.delete', 'token', c.req.param('id'));
    return c.json({ ok: true });
  });

  /* ---------- data: export, privacy, SQL, backups ---------- */

  app.get('/api/export', async (c) => {
    requireCap(c, 'privacy.manage');
    await audit(c, 'export.full');
    const s = await getSettings();
    c.header('Content-Type', 'application/zip');
    c.header('Content-Disposition', `attachment; filename="nova-export-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.zip"`);
    return c.body(exportZip());
  });

  async function personData(email: string) {
    const e = email.trim().toLowerCase();
    const contacts = await sql`select * from contacts where lower(email) = ${e}`;
    const submissions = await sql`
      select s.*, f.name as form_name from submissions s join forms f on f.id = s.form_id
      where s.contact_id = any(${contacts.map((x) => x.id as string)}::uuid[]) or exists (select 1 from jsonb_each_text(s.data) kv where lower(kv.value) = ${e})`;
    const orders = await sql`select * from orders where lower(email) = ${e}`;
    const comments = await sql`select * from comments where lower(email) = ${e}`;
    const users = await sql`select id, email, name, role, created_at from users where lower(email) = ${e}`;
    const bookings = await sql`select id, starts_at, party_size, name, email, phone, note, status, created_at from bookings where lower(email) = ${e}`;
    const subscribers = await sql`select id, email, name, status, source, ip, created_at, confirmed_at, unsubscribed_at from subscribers where lower(email) = ${e}`;
    const members = await sql`select id, email, name, status, email_verified_at, paid_until, subscription_status, created_at, last_login_at from members where lower(email) = ${e}`;
    const ticketOrders = await sql`select id, entry_title, name, email, phone, items, total, status, created_at from ticket_orders where lower(email) = ${e}`;
    const waitlist = await sql`select id, entry_id, name, email, created_at from ticket_waitlist where lower(email) = ${e}`;
    const donations =
      await sql`select id, amount, currency, interval, campaign, name, email, street, zip, city, status, created_at, paid_at from donations where lower(email) = ${e}`;
    const foodOrders =
      await sql`select id, number, mode, slot_at, name, phone, email, street, zip, city, items, total, status, created_at from food_orders where lower(email) = ${e}`;
    return { contacts, submissions, orders, comments, users, bookings, subscribers, members, ticketOrders, waitlist, donations, foodOrders };
  }

  app.get('/api/privacy', async (c) => {
    requireCap(c, 'privacy.manage');
    const email = c.req.query('email') ?? '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('Bitte gib eine E-Mail-Adresse ein.');
    const d = await personData(email);
    await audit(c, 'privacy.lookup', 'person', sha256(email.toLowerCase()).slice(0, 12));
    if (c.req.query('download') === '1') {
      c.header('Content-Disposition', `attachment; filename="auskunft-${email.replace(/[^a-z0-9@.]/gi, '_')}.json"`);
      return c.json({ email, exportedAt: new Date().toISOString(), ...d });
    }
    return c.json({ counts: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.length])), ...d });
  });

  app.post('/api/privacy/delete', async (c) => {
    requireCap(c, 'privacy.manage');
    const { email } = z.object({ email: z.string().email() }).parse(await c.req.json());
    const d = await personData(email);
    if (d.users.length) throw badRequest('Zu dieser Adresse gehört ein Benutzerkonto. Lösche es unter «Team».');
    await sql.begin(async (tx) => {
      await tx`delete from submissions where id = any(${d.submissions.map((s) => s.id as string)}::uuid[])`;
      await tx`delete from contacts where id = any(${d.contacts.map((s) => s.id as string)}::uuid[])`;
      await tx`delete from comments where id = any(${d.comments.map((s) => s.id as string)}::uuid[])`;
      await tx`delete from subscribers where id = any(${d.subscribers.map((s) => s.id as string)}::uuid[])`;
      await tx`
        update food_orders set name = 'Gelöscht', email = ${'geloescht-' + shortId(6) + '@invalid'}, phone = '', street = '', note = ''
        where id = any(${d.foodOrders.map((s) => s.id as string)}::uuid[])`;
      // Donations are accounting records too: keep amount and date, drop the person.
      await tx`delete from donations where status <> 'paid' and id = any(${d.donations.map((s) => s.id as string)}::uuid[])`;
      await tx`
        update donations set name = 'Gelöscht', email = ${'geloescht-' + shortId(6) + '@invalid'}, street = '', zip = '', city = '', message = '', anonymous = true
        where status = 'paid' and id = any(${d.donations.map((s) => s.id as string)}::uuid[])`;
      await tx`delete from ticket_waitlist where id = any(${d.waitlist.map((s) => s.id as string)}::uuid[])`;
      // Paid tickets are accounting records: anonymise. Free ones go.
      await tx`delete from ticket_orders where id = any(${d.ticketOrders.filter((o) => !o.total).map((s) => s.id as string)}::uuid[])`;
      await tx`
        update ticket_orders set name = 'Gelöscht', email = ${'geloescht-' + shortId(6) + '@invalid'}, phone = ''
        where id = any(${d.ticketOrders.filter((o) => o.total).map((s) => s.id as string)}::uuid[])`;
      // Bookings stay as occupied time in the plan, without the person.
      await tx`
        update bookings set name = 'Gelöscht', email = '', phone = '', note = '', internal_note = ''
        where id = any(${d.bookings.map((s) => s.id as string)}::uuid[])`;
      // Orders are accounting records (10 years in CH): anonymise instead of deleting.
      await tx`
        update orders set email = ${'geloescht-' + shortId(6) + '@invalid'},
          customer = jsonb_build_object('name', 'Gelöscht', 'street', '', 'zip', customer ->> 'zip', 'city', customer ->> 'city', 'country', customer ->> 'country', 'phone', '', 'company', ''),
          note = '' where id = any(${d.orders.map((s) => s.id as string)}::uuid[])`;
    });
    // Member accounts last: this also ends a running subscription at Stripe.
    for (const m of d.members) await deleteMember(m.id as string);
    await audit(c, 'privacy.delete', 'person', sha256(email.toLowerCase()).slice(0, 12), { submissions: d.submissions.length, orders: d.orders.length });
    bumpGeneration();
    return c.json({
      deleted: { submissions: d.submissions.length, contacts: d.contacts.length, comments: d.comments.length, subscribers: d.subscribers.length, members: d.members.length },
      anonymizedOrders: d.orders.length,
      anonymizedBookings: d.bookings.length,
    });
  });

  /** Read-only SQL for the owner (Werkbank): one statement, read-only transaction, 5 s timeout. */
  app.post('/api/sql', async (c) => {
    requireCap(c, 'data.sql');
    const { query } = z.object({ query: z.string().min(1).max(10_000) }).parse(await c.req.json());
    const started = Date.now();
    try {
      const rows = await sql.begin('read only', async (tx) => {
        await tx`set local statement_timeout = 5000`;
        return tx.unsafe(query.replace(/;\s*$/, ''));
      });
      await audit(c, 'sql.query', '', '', { query: query.slice(0, 500) });
      const list = (rows as unknown as Record<string, unknown>[]).slice(0, 1000);
      return c.json({ columns: list[0] ? Object.keys(list[0]) : [], rows: list, truncated: (rows as unknown[]).length > 1000, ms: Date.now() - started });
    } catch (e) {
      throw badRequest((e as Error).message);
    }
  });

  app.get('/api/backups', async (c) => {
    requireCap(c, 'privacy.manage');
    return c.json({ backups: await sql`select * from backups order by created_at desc` });
  });

  app.post('/api/backups', async (c) => {
    requireCap(c, 'privacy.manage');
    const b = await createBackup('manual');
    await audit(c, 'backup.create', 'backup', b.id);
    return c.json({ backup: b });
  });

  app.get('/api/backups/:id/download', async (c) => {
    requireCap(c, 'privacy.manage');
    const [b] = await sql`select storage_key from backups where id = ${c.req.param('id')}`;
    if (!b) throw notFound();
    const url = await storage.presign(b.storage_key as string, 300, (b.storage_key as string).split('/').pop());
    if (url) return c.redirect(url, 302);
    const obj = await storage.get(b.storage_key as string);
    if (!obj) throw notFound();
    c.header('Content-Type', 'application/gzip');
    c.header('Content-Disposition', `attachment; filename="${(b.storage_key as string).split('/').pop()}"`);
    return c.body(Readable.toWeb(obj.body) as ReadableStream);
  });

  app.post('/api/backups/:id/restore', async (c) => {
    requireCap(c, 'data.sql');
    await restoreBackup(c.req.param('id'));
    await audit(c, 'backup.restore', 'backup', c.req.param('id'));
    return c.json({ ok: true });
  });

  /* ---------- search for the command palette ---------- */

  app.get('/api/search', async (c) => {
    const user = requireUser(c);
    const q = (c.req.query('q') ?? '').trim();
    if (q.length < 2) return c.json({ results: [] });
    const like = `%${q.replace(/[%_]/g, '')}%`;
    const own = can(user.role, 'content.edit') ? sql`` : sql`and author_id = ${user.id}`;
    const entries = await sql`
      select id, collection, slug, status, data ->> 'title' as title from entries
      where (data ->> 'title' ilike ${like} or slug ilike ${like}) ${own} order by updated_at desc limit 12`;
    const media = await sql`select id, filename, alt, version from media where (filename ilike ${like} or alt ilike ${like}) and not private and mime like 'image/%' limit 5`;
    const contacts = can(user.role, 'leads.view') ? await sql`select id, name, email from contacts where name ilike ${like} or email ilike ${like} limit 5` : [];
    const orders = can(user.role, 'orders.view') ? await sql`select id, number, email from orders where number ilike ${like} or email ilike ${like} limit 5` : [];
    const cols = await listCollections();
    return c.json({
      results: [
        ...entries.map((e) => ({
          kind: 'entry',
          id: e.id,
          collection: e.collection,
          collectionName: cols.find((x) => x.id === e.collection)?.singular ?? e.collection,
          title: e.title || '(ohne Titel)',
          status: e.status,
        })),
        ...media.map((m) => ({ kind: 'media', id: m.id, title: m.filename, thumb: `/media/${m.id}/v${m.version}/160.webp` })),
        ...contacts.map((x) => ({ kind: 'contact', id: x.id, title: x.name || x.email, subtitle: x.email })),
        ...orders.map((x) => ({ kind: 'order', id: x.id, title: `Bestellung ${x.number}`, subtitle: x.email })),
      ],
    });
  });

  /* ---------- QR codes (tables, flyers) ---------- */

  app.get('/api/qr', async (c) => {
    requireUser(c);
    const url = c.req.query('url') ?? '';
    if (!/^https?:\/\//.test(url) || url.length > 500) throw badRequest('Ungültige Adresse.');
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } });
    c.header('Content-Type', 'image/svg+xml');
    if (c.req.query('download')) c.header('Content-Disposition', 'attachment; filename="qr.svg"');
    return c.body(svg);
  });

  /* ---------- mail test ---------- */

  app.post('/api/mail/test', async (c) => {
    const user = requireCap(c, 'settings.manage');
    const ok = await sendMail({ to: user.email, subject: 'Test von Nova', text: 'Wenn du das liest, funktioniert der E-Mail-Versand.' });
    return c.json({ ok, configured: mailConfigured() });
  });
}

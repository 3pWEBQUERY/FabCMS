import { statsConfig, statsCsp } from '../shared/stats-services';
import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { ZodError } from 'zod';
import { loadUser, type AppEnv } from './auth';
import { HttpError } from './lib/http';
import { publicRoutes } from './routes/public';
import { apiRoutes } from './routes/api';
import { adminRoutes } from './routes/admin';
import { headlessRoutes } from './routes/headless';
import { getSettings } from './settings';
import { env } from './env';
import { sql } from './db';
import { currentLang, langOfPath, localizeHtml, localizePath, pathMap, requestLang } from './translations';
import { extraLangs, UNPREFIXED, type Lang } from '../shared/i18n';

/**
 * The outer layer handles languages: /fr/… is mapped to the main-language
 * path before routing, the request runs with that language, and links and
 * redirects in the answer are mapped back. Everything inside works with
 * main-language paths only.
 */
export function createApp() {
  const inner = buildApp();
  const outer = new Hono();
  outer.all('*', async (c) => {
    const req = c.req.raw;
    const url = new URL(req.url);
    const headers = new Headers(req.headers);
    let lang: Lang | null = null;
    if (/^\/[a-z]{2}(?:\/|$)/i.test(url.pathname) && !UNPREFIXED.test(url.pathname)) {
      const s = await getSettings();
      // Case matters for tokens (/fr/bestellung/AbC…): compare in lower case, keep the original for the app.
      const raw = decodeURIComponent(url.pathname).replace(/\/+$/, '') || '/';
      const path = raw.toLowerCase();
      lang = langOfPath(path, extraLangs(s));
      if (lang) {
        const map = await pathMap(lang);
        if (!map.toMain.has(path)) {
          // Old address of a translation whose slug changed.
          const [r] = await sql`select to_path, code from redirects where from_path = ${path}`;
          if (r) return c.redirect(String(r.to_path) + url.search, Number(r.code) === 302 ? 302 : 301);
        }
        const main = map.toMain.get(path) ?? (raw.slice(lang.length + 1) || '/');
        // /fr/kontakt when the French page lives at /fr/contact: one address per page.
        const own = map.toLocal.get(main);
        if (own && own !== path && req.method === 'GET') return c.redirect(own + url.search, 301);
        url.pathname = main;
      }
    }
    // Forms post to /_nova/… without a prefix: they answer in the language of the page they came from.
    if (!lang && url.pathname.startsWith('/_nova/')) {
      const ref = req.headers.get('referer');
      try {
        const from = ref ? new URL(ref) : null;
        if (from && from.host === url.host) lang = langOfPath(from.pathname.toLowerCase(), extraLangs(await getSettings()));
      } catch {
        /* no usable referer */
      }
    }
    const next = new Request(url, { method: req.method, headers, body: req.body, redirect: 'manual', signal: req.signal, duplex: 'half' } as RequestInit);
    return lang ? requestLang.run(lang, () => inner.fetch(next, c.env)) : inner.fetch(next, c.env);
  });
  return outer;
}

function buildApp() {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    await next();
    const path = c.req.path;
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
    if (env.production) c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    // Preview deployments never end up in a search index, whatever the settings say.
    if (env.preview.on) c.header('X-Robots-Tag', 'noindex, nofollow');
    const type = c.res.headers.get('Content-Type') ?? '';
    if (!type.includes('text/html') || c.res.headers.has('Content-Security-Policy')) return;
    if (path.startsWith('/admin')) {
      c.header(
        'Content-Security-Policy',
        "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-src 'self'; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      );
      c.header('X-Frame-Options', 'DENY');
    } else {
      const s = await getSettings();
      const stats = statsCsp(statsConfig(s));
      const scripts = ["'self'", 'https://challenges.cloudflare.com', ...stats.script, ...(s.security.allowCustomScripts ? ["'unsafe-inline'", 'https:'] : [])];
      c.header(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          "img-src 'self' data: https:",
          "style-src 'self' 'unsafe-inline'",
          `script-src ${scripts.join(' ')}`,
          "font-src 'self'",
          `connect-src ${["'self'", ...stats.connect].join(' ')}`,
          'frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.openstreetmap.org https://challenges.cloudflare.com',
          "media-src 'self' https:",
          // Only Nova's own admin may frame pages (canvas, previews).
          "frame-ancestors 'self'",
          "base-uri 'self'",
          "form-action 'self' https://checkout.stripe.com",
        ].join('; '),
      );
    }
  });

  // Server-sent events must not be buffered by compression.
  const gzip = compress();
  app.use('*', (c, next) => (c.req.path === '/api/notifications/stream' ? next() : gzip(c, next)));
  app.use('*', loadUser);
  // Other languages: links and redirect targets point to /fr/… (runs before compression).
  app.use('*', async (c, next) => {
    await next();
    const lang = currentLang();
    if (!lang) return;
    const loc = c.res.headers.get('Location');
    if (loc?.startsWith('/')) c.res.headers.set('Location', localizePath(await pathMap(lang), lang, loc));
    if ((c.res.headers.get('Content-Type') ?? '').includes('text/html') && c.res.body) {
      const res = c.res;
      const body = await localizeHtml(await res.text(), lang);
      const h = new Headers(res.headers);
      h.delete('Content-Length');
      c.res = new Response(body, { status: res.status, headers: h });
    }
  });

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message, details: err.details }, err.status as 400);
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return c.json({ error: `Ungültige Eingabe${first?.path.length ? ` bei «${first.path.join('.')}»` : ''}: ${first?.message ?? ''}`, details: err.issues }, 400);
    }
    if (err instanceof SyntaxError && c.req.path.startsWith('/api')) return c.json({ error: 'Die Anfrage enthält kein gültiges JSON.' }, 400);
    console.error(`[error] ${c.req.method} ${c.req.path}`, err);
    if (c.req.path.startsWith('/api')) return c.json({ error: 'Da ist auf dem Server etwas schiefgelaufen. Versuch es nochmals – deine Daten sind gesichert.' }, 500);
    return c.text('Da ist etwas schiefgelaufen. Bitte versuch es gleich nochmals.', 500);
  });

  app.get('/healthz', (c) => c.json({ ok: true }));

  apiRoutes(app);
  headlessRoutes(app);
  adminRoutes(app);
  publicRoutes(app);
  return app;
}

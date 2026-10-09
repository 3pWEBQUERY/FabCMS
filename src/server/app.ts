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

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    await next();
    const path = c.req.path;
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
    if (env.production) c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
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
      const scripts = ["'self'", 'https://challenges.cloudflare.com', ...(s.security.allowCustomScripts ? ["'unsafe-inline'", 'https:'] : [])];
      c.header(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          "img-src 'self' data: https:",
          "style-src 'self' 'unsafe-inline'",
          `script-src ${scripts.join(' ')}`,
          "font-src 'self'",
          "connect-src 'self'",
          "frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.openstreetmap.org https://challenges.cloudflare.com",
          "media-src 'self' https:",
          // Only Nova's own admin may frame pages (canvas, previews).
          "frame-ancestors 'self'",
          "base-uri 'self'",
          "form-action 'self' https://checkout.stripe.com",
        ].join('; '),
      );
    }
  });

  app.use('*', compress());
  app.use('*', loadUser);

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

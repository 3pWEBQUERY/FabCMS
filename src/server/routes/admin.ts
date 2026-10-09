import type { Hono } from 'hono';
import { existsSync, readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import type { AppEnv } from '../auth';
import { env } from '../env';

/** Serves the built admin SPA from dist/admin. In development Vite serves it on :5173. */
const ROOT = join(process.cwd(), 'dist', 'admin');
const TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

export function adminRoutes(app: Hono<AppEnv>) {
  app.get('/admin', (c) => c.redirect('/admin/', 301));
  app.get('/admin/*', (c) => {
    if (!existsSync(join(ROOT, 'index.html'))) {
      if (!env.production) return c.redirect(`http://localhost:5173${c.req.path}`, 302);
      return c.text('Die Verwaltung wurde nicht gebaut. Führe «npm run build» aus.', 500);
    }
    const rel = normalize(c.req.path.replace(/^\/admin\/?/, ''));
    const file = join(ROOT, rel);
    if (rel && !rel.startsWith('..') && file.startsWith(ROOT) && existsSync(file) && statSync(file).isFile()) {
      const ext = file.slice(file.lastIndexOf('.'));
      c.header('Content-Type', TYPES[ext] ?? 'application/octet-stream');
      c.header('Cache-Control', rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
      return c.body(Readable.toWeb(createReadStream(file)) as ReadableStream);
    }
    c.header('Cache-Control', 'no-cache');
    return c.html(readFileSync(join(ROOT, 'index.html'), 'utf8'));
  });
}

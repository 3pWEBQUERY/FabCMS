import type { Hono } from 'hono';
import { z } from 'zod';
import { audit, requireCap, type AppEnv } from '../auth';
import { badRequest, notFound } from '../lib/http';
import { parseUpload } from '../importer/parse';
import { fetchFeed, fetchWordPress, getJob, keepBundle, startImport, summarize } from '../importer/run';

/** Import from WordPress, Squarespace, Wix (feed), Shopify, Markdown: analyse first, then run with progress. */
export function importApi(app: Hono<AppEnv>) {
  app.post('/api/import/upload', async (c) => {
    requireCap(c, 'settings.manage');
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) throw badRequest('Bitte eine Datei wählen.');
    if (file.size > 60 * 1024 * 1024) throw badRequest('Die Datei ist grösser als 60 MB.');
    try {
      const bundle = parseUpload(file.name, Buffer.from(await file.arrayBuffer()));
      if (!bundle.items.length) throw new Error('In der Datei sind keine Beiträge, Seiten oder Produkte.');
      return c.json({ id: keepBundle(bundle), summary: summarize(bundle) });
    } catch (e) {
      throw badRequest((e as Error).message);
    }
  });

  app.post('/api/import/url', async (c) => {
    requireCap(c, 'settings.manage');
    const b = z.object({ kind: z.enum(['wordpress', 'feed']), url: z.string().trim().min(3).max(500) }).parse(await c.req.json());
    try {
      const bundle = b.kind === 'wordpress' ? await fetchWordPress(b.url) : await fetchFeed(b.url);
      if (!bundle.items.length) throw new Error('Dort sind keine öffentlichen Beiträge oder Seiten zu finden.');
      return c.json({ id: keepBundle(bundle), summary: summarize(bundle) });
    } catch (e) {
      throw badRequest((e as Error).message);
    }
  });

  app.post('/api/import/run', async (c) => {
    const u = requireCap(c, 'settings.manage');
    const b = z.object({ id: z.string(), publish: z.boolean(), images: z.boolean(), redirects: z.boolean() }).parse(await c.req.json());
    try {
      const job = startImport(b.id, { ...b, userId: u.id });
      await audit(c, 'import.start', '', '', { total: job.total, publish: b.publish });
      return c.json({ job });
    } catch (e) {
      throw badRequest((e as Error).message);
    }
  });

  app.get('/api/import/jobs/:id', async (c) => {
    requireCap(c, 'settings.manage');
    const job = getJob(c.req.param('id'));
    if (!job) throw notFound();
    return c.json({ job });
  });
}

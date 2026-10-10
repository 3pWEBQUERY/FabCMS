import type { Hono } from 'hono';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { z } from 'zod';
import { sql, json } from '../db';
import { audit, requireAnyCap, requireCap, type AppEnv } from '../auth';
import { bumpMediaVersion, deleteMedia, isImage, refreshPlaceholder, replaceMedia, storeUpload, effectiveSize } from '../media';
import { storage } from '../storage';
import { badRequest, notFound } from '../lib/http';
import { bumpGeneration } from '../settings';
import { queueVideo } from '../video';
import type { MediaItem } from '../../shared/types';

function withUrls(m: MediaItem & { private?: boolean }) {
  const image = isImage(m);
  const size = image ? effectiveSize(m) : null;
  const poster = m.video?.status === 'ready' && m.video.poster ? `/media/${m.id}/video/${m.video.poster.split('/').pop()}` : null;
  return {
    ...m,
    image,
    effective: size,
    thumb: image ? `/media/${m.id}/v${m.version}/480.webp` : poster,
    preview: image ? `/media/${m.id}/v${m.version}/1280.webp` : null,
    url: image ? `/media/${m.id}/v${m.version}/1920.webp` : `/media/${m.id}/file/${encodeURIComponent(m.filename)}`,
  };
}

export function mediaApi(app: Hono<AppEnv>) {
  app.get('/api/media', async (c) => {
    requireAnyCap(c, 'media.upload', 'content.edit');
    const q = c.req.query();
    const limit = Math.min(200, Number(q.limit) || 60);
    const offset = Number(q.offset) || 0;
    const folder = q.folder !== undefined && q.folder !== '*' ? sql`and folder = ${q.folder}` : sql``;
    const type =
      q.type === 'image' ? sql`and mime like 'image/%'` : q.type === 'video' ? sql`and mime like 'video/%'` : q.type === 'file' ? sql`and mime not like 'image/%'` : sql``;
    const search = q.q ? sql`and (filename ilike ${'%' + q.q.replace(/[%_]/g, '') + '%'} or alt ilike ${'%' + q.q.replace(/[%_]/g, '') + '%'} or ${q.q} = any(tags))` : sql``;
    const missingAlt = q.missingAlt === '1' ? sql`and mime like 'image/%' and alt = ''` : sql``;
    const priv = q.private === '1' ? sql`` : sql`and not private`;
    const rows = await sql`
      select *, count(*) over() as total from media where true ${folder} ${type} ${search} ${missingAlt} ${priv}
      order by created_at desc limit ${limit} offset ${offset}`;
    const folders = await sql`select folder, count(*)::int as n from media where not private group by folder order by folder`;
    return c.json({ media: rows.map((r) => withUrls(r as unknown as MediaItem)), total: Number(rows[0]?.total ?? 0), folders });
  });

  app.get('/api/media/:id', async (c) => {
    requireAnyCap(c, 'media.upload', 'content.edit');
    const [m] = await sql`select * from media where id = ${c.req.param('id')}`;
    if (!m) throw notFound();
    return c.json({ media: withUrls(m as unknown as MediaItem) });
  });

  app.post('/api/media', async (c) => {
    const user = requireCap(c, 'media.upload');
    const body = await c.req.parseBody({ all: true });
    const files = ([] as unknown[]).concat(body.file ?? body['file[]'] ?? []).filter((f): f is File => f instanceof File);
    if (!files.length) throw badRequest('Keine Datei empfangen.');
    const folder = typeof body.folder === 'string' ? body.folder.slice(0, 80) : '';
    const priv = body.private === '1';
    const out = [];
    for (const f of files) {
      const m = await storeUpload({ buffer: Buffer.from(await f.arrayBuffer()), filename: f.name, folder, userId: user.id, private: priv });
      out.push(withUrls(m));
    }
    await audit(c, 'media.upload', 'media', out.map((m) => m.id).join(','), { count: out.length });
    return c.json({ media: out });
  });

  /** Make the web versions of a video again (after a failure, or once ffmpeg is installed). */
  app.post('/api/media/:id/video', async (c) => {
    requireCap(c, 'media.upload');
    const [m] = await sql`select id, mime, private from media where id = ${c.req.param('id')}`;
    if (!m) throw notFound();
    if (!String(m.mime).startsWith('video/') || m.private) throw badRequest('Das geht nur mit Videos aus der Mediathek.');
    await queueVideo(m.id as string);
    const [row] = await sql`select * from media where id = ${m.id}`;
    return c.json({ media: withUrls(row as unknown as MediaItem) });
  });

  app.patch('/api/media/:id', async (c) => {
    requireCap(c, 'media.upload');
    const id = c.req.param('id');
    const body = z
      .object({
        alt: z.string().max(300).optional(),
        caption: z.string().max(500).optional(),
        folder: z.string().max(80).optional(),
        tags: z.array(z.string().max(40)).max(30).optional(),
        focus: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
        edits: z
          .object({
            crop: z
              .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().min(0.01).max(1), h: z.number().min(0.01).max(1) })
              .nullable()
              .optional(),
            rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
            brightness: z.number().min(0.5).max(1.5).optional(),
          })
          .optional(),
      })
      .parse(await c.req.json());
    const [m] = await sql`select * from media where id = ${id}`;
    if (!m) throw notFound();
    if (body.alt !== undefined) await sql`update media set alt = ${body.alt.trim()} where id = ${id}`;
    if (body.caption !== undefined) await sql`update media set caption = ${body.caption.trim()} where id = ${id}`;
    if (body.folder !== undefined) await sql`update media set folder = ${body.folder.trim()} where id = ${id}`;
    if (body.tags) await sql`update media set tags = ${body.tags} where id = ${id}`;
    if (body.focus) await sql`update media set focus = ${json(body.focus)} where id = ${id}`;
    if (body.edits) {
      const crop = body.edits.crop;
      if (crop && (crop.x + crop.w > 1.0001 || crop.y + crop.h > 1.0001)) throw badRequest('Der Zuschnitt liegt ausserhalb des Bildes.');
      await sql`update media set edits = ${json(body.edits)} where id = ${id}`;
      await bumpMediaVersion(id);
      await refreshPlaceholder(id);
    }
    bumpGeneration();
    const [next] = await sql`select * from media where id = ${id}`;
    return c.json({ media: withUrls(next as unknown as MediaItem) });
  });

  /** A new file under the same id – everything that uses it shows the new one. */
  app.post('/api/media/:id/replace', async (c) => {
    requireCap(c, 'media.upload');
    const body = await c.req.parseBody();
    const f = body.file;
    if (!(f instanceof File)) throw badRequest('Keine Datei empfangen.');
    const m = await replaceMedia(c.req.param('id'), { buffer: Buffer.from(await f.arrayBuffer()), filename: f.name });
    bumpGeneration();
    await audit(c, 'media.replace', 'media', m.id, { filename: m.filename });
    return c.json({ media: withUrls(m) });
  });

  /** Many files at once: into a folder, a tag more, or away (files in use only when asked twice). */
  app.post('/api/media/bulk', async (c) => {
    const body = z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(500),
        action: z.enum(['move', 'tag', 'delete']),
        folder: z.string().max(80).optional(),
        tag: z.string().min(1).max(40).optional(),
        force: z.boolean().optional(),
      })
      .parse(await c.req.json());
    requireCap(c, body.action === 'delete' ? 'media.manage' : 'media.upload');
    const done: string[] = [];
    const inUse: string[] = [];
    for (const id of [...new Set(body.ids)]) {
      if (body.action === 'move') await sql`update media set folder = ${(body.folder ?? '').trim()} where id = ${id}`;
      else if (body.action === 'tag') await sql`update media set tags = array_append(tags, ${body.tag!.trim()}) where id = ${id} and not (${body.tag!.trim()} = any(tags))`;
      else {
        if (!body.force) {
          const [used] = await sql`select 1 from entries where data::text like ${'%' + id + '%'} or coalesce(published_data::text, '') like ${'%' + id + '%'} limit 1`;
          const [inSettings] = await sql`select 1 from settings where key = 'site' and value::text like ${'%' + id + '%'}`;
          if (used || inSettings) {
            inUse.push(id);
            continue;
          }
        }
        if ((await sql`select 1 from media where id = ${id}`).length) await deleteMedia(id);
      }
      done.push(id);
    }
    bumpGeneration();
    await audit(c, `media.bulk.${body.action}`, 'media', undefined, { done: done.length, inUse: inUse.length });
    return c.json({ done, inUse });
  });

  /** Where is this file used? Shown before deleting. */
  app.get('/api/media/:id/usage', async (c) => {
    requireAnyCap(c, 'media.upload', 'content.edit');
    const id = c.req.param('id');
    const rows = await sql`
      select id, collection, data ->> 'title' as title from entries
      where data::text like ${'%' + id + '%'} or coalesce(published_data::text, '') like ${'%' + id + '%'} limit 50`;
    const [settings] = await sql`select 1 from settings where key = 'site' and value::text like ${'%' + id + '%'}`;
    return c.json({ usage: rows, settings: Boolean(settings) });
  });

  app.delete('/api/media/:id', async (c) => {
    requireCap(c, 'media.manage');
    const id = c.req.param('id');
    const [m] = await sql`select filename from media where id = ${id}`;
    if (!m) throw notFound();
    await deleteMedia(id);
    bumpGeneration();
    await audit(c, 'media.delete', 'media', id, { filename: m.filename });
    return c.json({ ok: true });
  });

  /** The unedited image (orientation-corrected) as the base for the image editor. */
  app.get('/api/media/:id/source', async (c) => {
    requireCap(c, 'media.upload');
    const [m] = await sql`select storage_key, mime from media where id = ${c.req.param('id')}`;
    if (!m || !isImage(m as { mime: string })) throw notFound();
    const buf = await storage.getBuffer(m.storage_key as string);
    if (!buf) throw notFound();
    const out = await sharp(buf).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    c.header('Content-Type', 'image/webp');
    c.header('Cache-Control', 'private, max-age=600');
    return c.body(new Uint8Array(out));
  });

  /** Private files (form uploads, consent documents) for signed-in staff only. */
  app.get('/api/media/:id/download', async (c) => {
    requireAnyCap(c, 'media.upload', 'leads.view', 'content.edit');
    const [m] = await sql`select storage_key, filename, mime from media where id = ${c.req.param('id')}`;
    if (!m) throw notFound();
    const url = await storage.presign(m.storage_key, 300, m.filename);
    if (url) return c.redirect(url, 302);
    const obj = await storage.get(m.storage_key);
    if (!obj) throw notFound();
    c.header('Content-Type', m.mime);
    c.header('Content-Disposition', `attachment; filename="${String(m.filename).replace(/"/g, '')}"`);
    return c.body(Readable.toWeb(obj.body) as ReadableStream);
  });
}

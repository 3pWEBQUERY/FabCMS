import sharp from 'sharp';
import { queueVideo } from './video';
import { extname } from 'node:path';
import { sql } from './db';
import { storage } from './storage';
import type { MediaEdits, MediaItem } from '../shared/types';
import { badRequest } from './lib/http';

export const VARIANT_WIDTHS = [160, 320, 480, 640, 960, 1280, 1600, 1920, 2560] as const;
export type VariantFormat = 'avif' | 'webp' | 'jpg';

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/heic', 'image/heif']);
const FILE_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.zip': 'application/zip',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.epub': 'application/epub+zip',
};

export const MAX_UPLOAD = 100 * 1024 * 1024;

function magicMatches(buf: Buffer, ext: string): boolean {
  const head = buf.subarray(0, 12);
  switch (ext) {
    case '.pdf':
      return head.subarray(0, 4).toString() === '%PDF';
    case '.zip':
    case '.docx':
    case '.xlsx':
    case '.epub':
      return head[0] === 0x50 && head[1] === 0x4b;
    case '.mp4':
    case '.mov':
    case '.m4a':
      return head.subarray(4, 8).toString() === 'ftyp';
    case '.webm':
      return head.readUInt32BE(0) === 0x1a45dfa3;
    case '.mp3':
      return head.subarray(0, 3).toString() === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
    case '.txt':
    case '.csv':
      return !buf.subarray(0, 4096).includes(0);
    default:
      return false;
  }
}

export interface UploadInput {
  buffer: Buffer;
  filename: string;
  folder?: string;
  userId?: string | null;
  alt?: string;
  private?: boolean;
}

export async function storeUpload(input: UploadInput): Promise<MediaItem> {
  const { buffer } = input;
  if (buffer.length === 0) throw badRequest('Die Datei ist leer.');
  if (buffer.length > MAX_UPLOAD) throw badRequest('Die Datei ist grösser als 100 MB.');
  const filename = input.filename.replace(/[^\w.\-äöüÄÖÜ ]+/g, '_').slice(0, 140) || 'datei';
  const ext = extname(filename).toLowerCase();

  let mime: string;
  let width: number | null = null;
  let height: number | null = null;
  let storedExt = ext;

  // Images are identified by decoding them, not by trusting the extension.
  const meta = await sharp(buffer, { failOn: 'error' })
    .metadata()
    .catch(() => null);
  if (meta?.format && meta.format !== 'svg' && ['jpeg', 'png', 'webp', 'avif', 'gif', 'heif'].includes(meta.format)) {
    mime = meta.format === 'jpeg' ? 'image/jpeg' : meta.format === 'heif' ? 'image/avif' : `image/${meta.format}`;
    const swap = (meta.orientation ?? 1) >= 5;
    width = (swap ? meta.height : meta.width) ?? null;
    height = (swap ? meta.width : meta.height) ?? null;
    storedExt = meta.format === 'jpeg' ? '.jpg' : `.${meta.format === 'heif' ? 'avif' : meta.format}`;
    if (width && height && width * height > 80_000_000) throw badRequest('Das Bild hat zu viele Pixel (über 80 Megapixel).');
  } else if (FILE_TYPES[ext] && magicMatches(buffer, ext)) {
    mime = FILE_TYPES[ext];
  } else {
    throw badRequest(
      'Dieser Dateityp wird nicht unterstützt. Erlaubt sind Bilder (JPG, PNG, WebP, AVIF, GIF), PDF, Videos (MP4, WebM), Audio und Office-Dokumente.',
    );
  }

  const [row] = await sql`
    insert into media (storage_key, filename, mime, size, width, height, alt, folder, uploaded_by, private)
    values ('', ${filename}, ${mime}, ${buffer.length}, ${width}, ${height}, ${input.alt ?? ''}, ${input.folder ?? ''},
            ${input.userId ?? null}, ${input.private ?? false})
    returning id`;
  const key = `media/${row.id}/original${storedExt}`;
  await storage.put(key, buffer, mime);
  await sql`update media set storage_key = ${key} where id = ${row.id}`;
  if (width) await storePlaceholder(row.id as string, buffer, {});
  if (mime.startsWith('video/') && !input.private) await queueVideo(row.id as string);
  const [item] = await sql`select * from media where id = ${row.id}`;
  return item as unknown as MediaItem;
}

/**
 * Main colour and a ~24 px WebP of the (edited) image. The site shows them,
 * blurred, until the real image has loaded. Images with transparency get none:
 * the preview would stay visible behind transparent areas.
 */
export async function computePlaceholder(original: Buffer, edits: MediaEdits): Promise<{ color: string; lqip: string }> {
  const small = await renderVariant(original, edits, 24, 'webp');
  const stats = await sharp(small).stats();
  if (!stats.isOpaque) return { color: '', lqip: '' };
  const { r, g, b } = stats.dominant;
  const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  return { color: hex, lqip: small.toString('base64') };
}

async function storePlaceholder(id: string, original: Buffer, edits: MediaEdits) {
  const p = await computePlaceholder(original, edits).catch(() => ({ color: '', lqip: '' }));
  await sql`update media set color = ${p.color}, lqip = ${p.lqip} where id = ${id}`;
}

/** After an edit (crop, rotation, brightness) the preview has to match again. */
export async function refreshPlaceholder(id: string): Promise<void> {
  const [m] = await sql`select storage_key, mime, edits from media where id = ${id}`;
  if (!m || !IMAGE_MIMES.has(m.mime)) return;
  const original = await storage.getBuffer(m.storage_key);
  if (original) await storePlaceholder(id, original, m.edits as MediaEdits);
}

/** Images uploaded before placeholders existed get theirs in the background, a few at a time. */
export async function backfillPlaceholders(limit = 500): Promise<number> {
  const rows = await sql`select id from media where color is null and mime like 'image/%' and mime <> 'image/svg+xml' order by created_at desc limit ${limit}`;
  for (const r of rows) await refreshPlaceholder(r.id as string).catch(() => sql`update media set color = '', lqip = '' where id = ${r.id}`);
  return rows.length;
}

export const isImage = (m: { mime: string }) => IMAGE_MIMES.has(m.mime);

/** Size of the image after crop and rotation – used for width/height attributes. */
export function effectiveSize(m: Pick<MediaItem, 'width' | 'height' | 'edits'>): { width: number; height: number } {
  let w = m.width ?? 1;
  let h = m.height ?? 1;
  const r = m.edits?.rotate ?? 0;
  if (r === 90 || r === 270) [w, h] = [h, w];
  const c = m.edits?.crop;
  if (c) {
    w = Math.max(1, Math.round(w * c.w));
    h = Math.max(1, Math.round(h * c.h));
  }
  return { width: w, height: h };
}

const inflight = new Map<string, Promise<Buffer>>();
const hot = new Map<string, Buffer>();
let hotBytes = 0;
const HOT_LIMIT = 64 * 1024 * 1024;

function remember(key: string, buf: Buffer) {
  if (buf.length > 2 * 1024 * 1024) return;
  hot.set(key, buf);
  hotBytes += buf.length;
  for (const [k, v] of hot) {
    if (hotBytes <= HOT_LIMIT) break;
    hot.delete(k);
    hotBytes -= v.length;
  }
}

export async function renderVariant(original: Buffer, edits: MediaEdits, width: number, format: VariantFormat): Promise<Buffer> {
  let img = sharp(original, { failOn: 'none', animated: false }).rotate();
  if (edits.rotate) img = sharp(await img.toBuffer()).rotate(edits.rotate);
  if (edits.crop) {
    const { data, info } = await img.toBuffer({ resolveWithObject: true });
    const c = edits.crop;
    const left = Math.max(0, Math.round(c.x * info.width));
    const top = Math.max(0, Math.round(c.y * info.height));
    img = sharp(data).extract({
      left,
      top,
      width: Math.max(1, Math.min(info.width - left, Math.round(c.w * info.width))),
      height: Math.max(1, Math.min(info.height - top, Math.round(c.h * info.height))),
    });
  }
  if (edits.brightness && edits.brightness !== 1) img = img.modulate({ brightness: edits.brightness });
  img = img.resize({ width, withoutEnlargement: true });
  switch (format) {
    case 'avif':
      return img.avif({ quality: 52, effort: 3 }).toBuffer();
    case 'webp':
      return img.webp({ quality: 78, effort: 4 }).toBuffer();
    default:
      return img.flatten({ background: '#ffffff' }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
  }
}

/**
 * Returns a resized variant, generating and caching it in the bucket on first
 * request. Variant URLs contain the media version, so they're immutable.
 */
export async function getVariant(id: string, version: number, width: number, format: VariantFormat): Promise<Buffer | null> {
  const key = `media/${id}/v${version}/${width}.${format}`;
  const cached = hot.get(key);
  if (cached) return cached;
  const running = inflight.get(key);
  if (running) return running;

  const job = (async () => {
    const stored = await storage.getBuffer(key);
    if (stored) {
      remember(key, stored);
      return stored;
    }
    const [m] = await sql`select storage_key, mime, edits, version, private from media where id = ${id}`;
    if (!m || m.private || m.version !== version || !IMAGE_MIMES.has(m.mime)) throw new Error('missing');
    const original = await storage.getBuffer(m.storage_key);
    if (!original) throw new Error('missing');
    const buf = await renderVariant(original, m.edits as MediaEdits, width, format);
    await storage.put(key, buf, format === 'jpg' ? 'image/jpeg' : `image/${format}`);
    remember(key, buf);
    return buf;
  })();
  inflight.set(key, job);
  try {
    return await job;
  } catch {
    return null;
  } finally {
    inflight.delete(key);
  }
}

export async function deleteMedia(id: string): Promise<void> {
  await storage.deletePrefix(`media/${id}/`);
  await sql`delete from media where id = ${id}`;
  for (const k of [...hot.keys()]) if (k.startsWith(`media/${id}/`)) hot.delete(k);
}

/** After an edit, bump the version so new variant URLs are used, and drop old variants. */
export async function bumpMediaVersion(id: string): Promise<void> {
  const [m] = await sql`update media set version = version + 1 where id = ${id} returning version`;
  const prev = (m?.version ?? 1) - 1;
  const old = await storage.list(`media/${id}/v${prev}/`);
  await Promise.all(old.map((o) => storage.delete(o.key)));
}

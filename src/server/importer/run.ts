import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { sql } from '../db';
import { createEntry, getCollection, publishEntry } from '../content';
import { getSettings, updateSettings, bumpGeneration } from '../settings';
import { storeUpload } from '../media';
import { token } from '../lib/crypto';
import { createBlock } from '../../shared/blocks';
import { sanitizeRichText } from '../../shared/richtext';
import { entryPath } from '../../shared/paths';
import { fromWpRest, parseFeed, type ImportBundle, type ImportItem } from './parse';
import type { Block } from '../../shared/types';

/* ---------- fetching from other sites, without reaching into our own network ---------- */

function privateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || (v.startsWith('::ffff:') && privateAddress(v.slice(7)));
}

/** GET with a size limit, timeout and no access to private addresses (also after redirects). */
export async function safeFetch(url: string, maxBytes = 25 * 1024 * 1024, hops = 4): Promise<{ buffer: Buffer; type: string; url: string }> {
  let current = url;
  for (let i = 0; i <= hops; i++) {
    const u = new URL(current);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Nur http(s)-Adressen.');
    const addrs = isIP(u.hostname) ? [{ address: u.hostname }] : await lookup(u.hostname, { all: true });
    if (!addrs.length || addrs.some((a) => privateAddress(a.address))) throw new Error(`${u.hostname} ist keine öffentliche Adresse.`);
    const r = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'Nova-Import/1 (+https://github.com)' } });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      current = new URL(r.headers.get('location')!, current).toString();
      continue;
    }
    if (!r.ok) throw new Error(`${u.hostname} antwortet mit ${r.status}.`);
    const len = Number(r.headers.get('content-length') ?? 0);
    if (len > maxBytes) throw new Error('Die Datei ist zu gross.');
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > maxBytes) throw new Error('Die Datei ist zu gross.');
      chunks.push(Buffer.from(chunk));
    }
    return { buffer: Buffer.concat(chunks), type: r.headers.get('content-type') ?? '', url: current };
  }
  throw new Error('Zu viele Weiterleitungen.');
}

/* ---------- reading a live site ---------- */

const normalizeSite = (input: string) => {
  const v = input.trim();
  return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
};

/** WordPress: the REST API has everything public, with featured images and terms. */
export async function fetchWordPress(site: string): Promise<ImportBundle> {
  const base = normalizeSite(site);
  const root = `${base.origin}${base.pathname.replace(/\/$/, '')}/wp-json`;
  const info = await safeFetch(`${root}`).catch(() => null);
  if (!info || !info.type.includes('json'))
    throw new Error('Unter dieser Adresse antwortet keine WordPress-Schnittstelle. Nimm stattdessen die Exportdatei (Werkzeuge → Daten exportieren).');
  const name = (JSON.parse(info.buffer.toString('utf8')) as { name?: string }).name ?? base.hostname;
  const all = async (kind: 'posts' | 'pages') => {
    const out: Record<string, unknown>[] = [];
    for (let page = 1; page <= 50; page++) {
      const r = await safeFetch(`${root}/wp/v2/${kind}?per_page=100&page=${page}&_embed=1`).catch(() => null);
      if (!r) break;
      const list = JSON.parse(r.buffer.toString('utf8')) as Record<string, unknown>[];
      if (!Array.isArray(list) || !list.length) break;
      out.push(...list);
      if (list.length < 100) break;
    }
    return out;
  };
  return fromWpRest(await all('posts'), await all('pages'), name);
}

/** Wix and others: the blog feed. A site address gets the usual feed paths tried. */
export async function fetchFeed(input: string): Promise<ImportBundle> {
  const u = normalizeSite(input);
  const candidates = /\.(xml|rss|atom)$|feed/i.test(u.pathname)
    ? [u.toString()]
    : [`${u.origin}/blog-feed.xml`, `${u.origin}/feed`, `${u.origin}/rss.xml`, `${u.origin}/feed.xml`, `${u.origin}/rss`];
  for (const c of candidates) {
    const r = await safeFetch(c).catch(() => null);
    if (r && /<rss|<feed/.test(r.buffer.toString('utf8', 0, 2000))) return parseFeed(r.buffer.toString('utf8'));
  }
  throw new Error('Unter dieser Adresse ist kein Feed zu finden. Bei Wix heisst er meist «…/blog-feed.xml».');
}

/* ---------- HTML → blocks ---------- */

export type ImageResolver = (src: string, alt: string) => Promise<string | null>;

const attr = (tag: string, name: string) =>
  new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i')
    .exec(tag)
    ?.slice(2, 4)
    .find((x) => x !== undefined) ?? '';
const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");

/** Text stays text (sanitized), images become image blocks in the media library, in the original order. */
export async function htmlToBlocks(html: string, resolve: ImageResolver): Promise<Block[]> {
  const blocks: Block[] = [];
  const pushText = (chunk: string) => {
    const body = sanitizeRichText(chunk)
      .replace(/<p>\s*(<br>\s*)*<\/p>/g, '')
      .trim();
    if (!body || !body.replace(/<[^>]+>/g, '').trim()) return;
    const prev = blocks[blocks.length - 1];
    if (prev?.type === 'text' && !prev.props.heading) prev.props.body = `${prev.props.body}${body}`;
    else blocks.push(createBlock('text', { heading: '', body }));
  };
  // Figures (with caption) first, then loose images; links around images are dropped.
  const re = /<figure\b[^>]*>([\s\S]*?)<\/figure>|(?:<a\b[^>]*>\s*)?<img\b[^>]*>(?:\s*<\/a>)?/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    pushText(html.slice(last, m.index));
    last = re.lastIndex;
    const img = /<img\b[^>]*>/i.exec(m[0])?.[0];
    if (!img) {
      pushText(m[1] ?? '');
      continue;
    }
    // WordPress keeps the full size in data attributes or srcset; take the largest we can find.
    const srcset = attr(img, 'srcset')
      .split(',')
      .map((s) => s.trim().split(/\s+/))
      .sort((a, b) => parseInt(b[1] ?? '0') - parseInt(a[1] ?? '0'))[0]?.[0];
    const src = decode(attr(img, 'data-orig-file') || attr(img, 'data-full-url') || srcset || attr(img, 'src'));
    const caption = m[1] ? (/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i.exec(m[1])?.[1] ?? '').replace(/<[^>]+>/g, '').trim() : '';
    const id = src ? await resolve(src, decode(attr(img, 'alt'))) : null;
    if (id) blocks.push(createBlock('image', { image: id, caption }));
  }
  pushText(html.slice(last));
  return blocks;
}

/* ---------- running an import ---------- */

export interface ImportJob {
  id: string;
  status: 'running' | 'done' | 'failed';
  total: number;
  done: number;
  created: { kind: string; title: string; path: string | null; id: string }[];
  redirects: number;
  images: number;
  errors: string[];
  modules: string[];
  startedAt: string;
}

const bundles = new Map<string, { bundle: ImportBundle; expires: number }>();
const jobs = new Map<string, ImportJob>();

export function keepBundle(bundle: ImportBundle): string {
  const id = token(12);
  const now = Date.now();
  for (const [k, v] of bundles) if (v.expires < now) bundles.delete(k);
  bundles.set(id, { bundle, expires: now + 60 * 60_000 });
  return id;
}

export const getJob = (id: string) => jobs.get(id) ?? null;

export function summarize(bundle: ImportBundle) {
  const count = (k: string) => bundle.items.filter((i) => i.kind === k).length;
  return {
    source: bundle.source,
    label: bundle.label,
    counts: { post: count('post'), page: count('page'), product: count('product') },
    drafts: bundle.items.filter((i) => !i.published).length,
    sample: bundle.items.slice(0, 8).map((i) => ({ kind: i.kind, title: i.title, date: i.date, published: i.published })),
    warnings: bundle.warnings,
  };
}

const COLLECTION = { post: 'posts', page: 'pages', product: 'products' } as const;
const MODULE = { post: 'blog', page: null, product: 'shop' } as const;

export function startImport(bundleId: string, opts: { publish: boolean; images: boolean; redirects: boolean; userId: string }): ImportJob {
  const entry = bundles.get(bundleId);
  if (!entry) throw new Error('Die Vorschau ist abgelaufen. Bitte die Datei nochmals hochladen.');
  bundles.delete(bundleId);
  const job: ImportJob = {
    id: token(12),
    status: 'running',
    total: entry.bundle.items.length,
    done: 0,
    created: [],
    redirects: 0,
    images: 0,
    errors: [],
    modules: [],
    startedAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);
  void run(entry.bundle, opts, job).catch((e) => {
    job.status = 'failed';
    job.errors.push((e as Error).message);
  });
  return job;
}

async function run(bundle: ImportBundle, opts: { publish: boolean; images: boolean; redirects: boolean; userId: string }, job: ImportJob): Promise<void> {
  // Turn on what the content needs (blog for posts, shop for products).
  const s = await getSettings();
  const needed = [...new Set(bundle.items.map((i) => MODULE[i.kind]).filter((m): m is 'blog' | 'shop' => m !== null))].filter((m) => !s.modules.includes(m));
  if (needed.length) {
    await updateSettings({ modules: [...s.modules, ...needed] });
    job.modules = needed;
  }
  const cache = new Map<string, string | null>();
  const resolverFor =
    (item: ImportItem): ImageResolver =>
    async (src, alt) => {
      if (!opts.images || !src || src.startsWith('data:')) return null;
      const key = src;
      if (cache.has(key)) return cache.get(key)!;
      let id: string | null = null;
      try {
        let buffer: Buffer;
        let name = decodeURIComponent(src.split(/[?#]/)[0].split('/').pop() || 'bild.jpg');
        if (/^https?:\/\//i.test(src)) buffer = (await safeFetch(src)).buffer;
        else if (bundle.files) {
          // Relative path inside a Markdown zip.
          const dir = (item.sourcePath ?? '').split('/').slice(0, -1);
          const parts = [...(src.startsWith('/') ? [] : dir), ...src.replace(/^\//, '').split('/')];
          const resolved: string[] = [];
          for (const p of parts) p === '..' ? resolved.pop() : p !== '.' && p && resolved.push(p);
          const path = resolved.join('/');
          const file = bundle.files.get(path) ?? [...bundle.files].find(([k]) => k.endsWith(`/${path}`) || k.endsWith(src.replace(/^\.?\//, '')))?.[1];
          if (!file) throw new Error(`Bild «${src}» fehlt in der ZIP-Datei.`);
          buffer = Buffer.from(file);
        } else return null;
        if (!/\.(jpe?g|png|gif|webp|avif)$/i.test(name)) name += '.jpg';
        const m = await storeUpload({ buffer, filename: name, folder: 'Import', userId: opts.userId, alt });
        id = m.id;
        job.images++;
      } catch (e) {
        job.errors.push(`Bild ${src.slice(0, 120)}: ${(e as Error).message}`);
      }
      cache.set(key, id);
      return id;
    };

  const ctx = { userId: opts.userId, canCode: false, studioOnly: false };
  for (const item of bundle.items) {
    try {
      const resolve = resolverFor(item);
      const blocks = await htmlToBlocks(item.html, resolve);
      const cover = item.cover ? await resolve(item.cover, item.title) : null;
      const seo = { title: item.seoTitle, description: item.seoDescription };
      let data: Record<string, unknown>;
      if (item.kind === 'product') {
        const images = (await Promise.all(item.images.map((src) => resolve(src, item.title)))).filter((x): x is string => Boolean(x));
        data = {
          title: item.title,
          price: item.price ?? null,
          comparePrice: item.comparePrice && item.price && item.comparePrice > item.price ? item.comparePrice : null,
          images,
          description: sanitizeRichText(item.html),
          category: item.category,
          sku: item.sku ?? '',
          stock: item.stock ?? null,
          variants: (item.variants ?? []).map((v) => ({ name: v.name, price: v.price !== item.price ? v.price : null, stock: v.stock, sku: v.sku })),
          seo,
        };
      } else if (item.kind === 'post') {
        data = { title: item.title, excerpt: item.excerpt, cover, date: item.date, category: item.category, tags: item.tags, blocks, seo };
      } else {
        data = { title: item.title, blocks: cover ? [createBlock('image', { image: cover, caption: '' }), ...blocks] : blocks, seo };
      }
      const collection = COLLECTION[item.kind];
      const e = await createEntry(collection, data, ctx, item.slug || undefined);
      let live = false;
      if (opts.publish && item.published) {
        try {
          await publishEntry(e.id, opts.userId);
          live = true;
        } catch (err) {
          job.errors.push(`«${item.title}» bleibt Entwurf: ${(err as Error).message}`);
        }
      }
      const col = await getCollection(collection);
      const path = entryPath(col, e.slug);
      job.created.push({ kind: item.kind, title: item.title, path: live ? path : null, id: e.id });
      // The old address keeps working: 301 to the new one.
      if (opts.redirects && item.oldPath && path && item.oldPath !== path) {
        const [r] = await sql`insert into redirects (from_path, to_path, code) values (${item.oldPath}, ${path}, 301) on conflict (from_path) do nothing returning id`;
        if (r) job.redirects++;
      }
    } catch (e) {
      job.errors.push(`«${item.title}»: ${(e as Error).message}`);
    }
    job.done++;
  }
  bumpGeneration();
  job.status = 'done';
}

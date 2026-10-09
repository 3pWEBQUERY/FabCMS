import { XMLParser } from 'fast-xml-parser';
import { marked } from 'marked';
import { parse as parseYaml } from 'yaml';
import { unzipSync, strFromU8 } from 'fflate';
import { slugify } from '../../shared/text';

/**
 * Import: everything is first turned into the same list of items, whatever
 * the source – WordPress/Squarespace (WXR), WordPress REST, RSS/Atom (Wix,
 * Medium, Ghost …), Shopify CSV, Markdown. The runner then creates entries.
 */

export type ImportKind = 'post' | 'page' | 'product';

export interface ImportVariant {
  name: string;
  price: number | null;
  stock: number | null;
  sku: string;
}

export interface ImportItem {
  kind: ImportKind;
  title: string;
  slug: string;
  html: string;
  excerpt: string;
  date: string | null; // YYYY-MM-DD
  published: boolean;
  category: string;
  tags: string[];
  cover: string | null; // URL or zip:path
  images: string[];
  oldPath: string | null; // path on the old site, for redirects
  seoTitle: string;
  seoDescription: string;
  price?: number | null;
  comparePrice?: number | null;
  sku?: string;
  stock?: number | null;
  variants?: ImportVariant[];
  /** Markdown in a zip: the file's own path, to resolve relative image paths. */
  sourcePath?: string;
}

export interface ImportBundle {
  source: 'wordpress' | 'squarespace' | 'rss' | 'shopify' | 'markdown';
  label: string;
  items: ImportItem[];
  warnings: string[];
  /** Files from a zip, for images referenced by relative path. */
  files?: Map<string, Uint8Array>;
}

const str = (v: unknown): string =>
  (v === undefined || v === null ? '' : typeof v === 'object' && '#text' in (v as object) ? String((v as { '#text': unknown })['#text']) : String(v)).trim();
const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const day = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  // WordPress writes «2024-03-01 09:00:00»; feeds use RFC 822 dates.
  const d = new Date(/^\d{4}-\d{2}-\d{2} \d/.test(s) ? s.replace(' ', 'T') : s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const pathOf = (url: string): string | null => {
  try {
    const p = new URL(url).pathname.replace(/\/+$/, '');
    return p && p !== '/' ? decodeURIComponent(p).toLowerCase() : null;
  } catch {
    return url.startsWith('/') ? url.replace(/\/+$/, '').toLowerCase() || null : null;
  }
};
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/* ---------- HTML clean-up shared by all sources ---------- */

/** WordPress stores paragraphs as blank lines («wpautop»); turn them into <p>. */
export function autop(html: string): string {
  if (/<(p|div|h[1-6]|ul|ol|blockquote|figure|table)\b/i.test(html)) return html;
  return html
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (/^<(img|figure)/i.test(p) ? p : `<p>${p.replace(/\n/g, '<br>')}</p>`))
    .join('\n');
}

export function cleanHtml(html: string): string {
  return autop(
    html
      .replace(/<!--[\s\S]*?-->/g, '') // Gutenberg block markers
      .replace(/\[caption[^\]]*\]([\s\S]*?)\[\/caption\]/gi, '<figure>$1</figure>')
      .replace(/\[(gallery|embed|video|audio|contact-form[^\]]*|et_pb_[^\]]*|vc_[^\]]*|\/[a-z_-]+)[^\]]*\]/gi, '')
      .replace(/\r\n/g, '\n'),
  );
}

/* ---------- WordPress & Squarespace (WXR) ---------- */

export function parseWxr(xml: string): ImportBundle {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    isArray: (name) => ['item', 'category', 'wp:postmeta'].includes(name),
  });
  const doc = parser.parse(xml);
  const channel = doc?.rss?.channel;
  if (!channel) throw new Error('Das ist keine WordPress-Exportdatei (WXR). In WordPress: Werkzeuge → Daten exportieren → Alle Inhalte.');
  const generator = str(channel.generator);
  const source = /squarespace/i.test(generator) || /squarespace/i.test(str(channel.link)) ? 'squarespace' : 'wordpress';
  const items = arr(channel.item) as Record<string, unknown>[];
  const attachments = new Map<string, string>();
  for (const it of items) if (str(it['wp:post_type']) === 'attachment') attachments.set(str(it['wp:post_id']), str(it['wp:attachment_url']));
  const out: ImportItem[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  for (const it of items) {
    const type = str(it['wp:post_type']);
    if (type !== 'post' && type !== 'page') {
      if (type && type !== 'attachment' && type !== 'nav_menu_item' && !type.startsWith('wp_')) skipped++;
      continue;
    }
    const status = str(it['wp:status']);
    if (status === 'trash' || status === 'auto-draft' || status === 'inherit') continue;
    const cats = arr(it.category as Record<string, unknown>[]);
    const meta = arr(it['wp:postmeta'] as Record<string, unknown>[]);
    const thumb = meta.find((m) => str(m['wp:meta_key']) === '_thumbnail_id');
    const seo = (k: string) => str(meta.find((m) => str(m['wp:meta_key']) === k)?.['wp:meta_value']);
    const title = str(it.title) || '(ohne Titel)';
    const html = cleanHtml(str(it['content:encoded']));
    out.push({
      kind: type === 'page' ? 'page' : 'post',
      title,
      slug: slugify(str(it['wp:post_name']) || title),
      html,
      excerpt: textOf(str(it['excerpt:encoded'])).slice(0, 300),
      date: day(it['wp:post_date']) ?? day(it.pubDate),
      published: status === 'publish',
      category: str(cats.find((c) => (c as Record<string, string>)['@_domain'] === 'category')),
      tags: cats
        .filter((c) => (c as Record<string, string>)['@_domain'] === 'post_tag')
        .map(str)
        .filter(Boolean),
      cover: thumb ? (attachments.get(str(thumb['wp:meta_value'])) ?? null) : null,
      images: [],
      oldPath: pathOf(str(it.link)),
      seoTitle: seo('_yoast_wpseo_title') || seo('rank_math_title'),
      seoDescription: seo('_yoast_wpseo_metadesc') || seo('rank_math_description'),
    });
  }
  if (skipped) warnings.push(`${skipped} Einträge anderer Typen (z. B. Produkte aus Plugins) werden nicht übernommen.`);
  return { source, label: source === 'squarespace' ? 'Squarespace' : `WordPress${str(channel.title) ? ` – ${str(channel.title)}` : ''}`, items: out, warnings };
}

/* ---------- WordPress REST API (from a live site) ---------- */

export function fromWpRest(posts: Record<string, any>[], pages: Record<string, any>[], siteName: string): ImportBundle {
  const map = (p: Record<string, any>, kind: ImportKind): ImportItem => {
    const terms = (p._embedded?.['wp:term'] ?? []).flat() as { taxonomy: string; name: string }[];
    return {
      kind,
      title: textOf(p.title?.rendered ?? '') || '(ohne Titel)',
      slug: slugify(p.slug ?? ''),
      html: cleanHtml(p.content?.rendered ?? ''),
      excerpt: textOf(p.excerpt?.rendered ?? '').slice(0, 300),
      date: day(p.date),
      published: p.status === 'publish',
      category: terms.find((t) => t.taxonomy === 'category')?.name ?? '',
      tags: terms.filter((t) => t.taxonomy === 'post_tag').map((t) => t.name),
      cover: p._embedded?.['wp:featuredmedia']?.[0]?.source_url ?? null,
      images: [],
      oldPath: pathOf(p.link ?? ''),
      seoTitle: p.yoast_head_json?.title ?? '',
      seoDescription: p.yoast_head_json?.description ?? '',
    };
  };
  return { source: 'wordpress', label: `WordPress – ${siteName}`, items: [...posts.map((p) => map(p, 'post')), ...pages.map((p) => map(p, 'page'))], warnings: [] };
}

/* ---------- RSS & Atom (Wix blog feed, Medium, Ghost, Substack …) ---------- */

export function parseFeed(xml: string): ImportBundle {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    isArray: (name) => ['item', 'entry', 'category', 'link'].includes(name),
  });
  const doc = parser.parse(xml);
  const warnings = [
    'Ein Feed enthält meist nur die neusten Beiträge (oft 20). Für ältere Beiträge den Feed mehrmals mit «?page=2» o. ä. importieren, falls die Plattform das anbietet.',
  ];
  if (doc?.rss?.channel) {
    const ch = doc.rss.channel;
    if (/wordpress/i.test(str(ch.generator)))
      warnings.push('Das ist ein WordPress-Feed. Mit der WordPress-Exportdatei oder der Website-Adresse kommt alles mit, nicht nur die neusten Beiträge.');
    const items = arr(ch.item) as Record<string, any>[];
    return {
      source: 'rss',
      label: str(ch.title) || 'Feed',
      warnings,
      items: items.map((it) => {
        const html = cleanHtml(str(it['content:encoded']) || str(it.description));
        const cover =
          it['media:content']?.['@_url'] ?? it['media:thumbnail']?.['@_url'] ?? (String(it.enclosure?.['@_type'] ?? '').startsWith('image/') ? it.enclosure['@_url'] : null);
        const link = str(arr(it.link)[0]);
        return {
          kind: 'post' as const,
          title: textOf(str(it.title)) || '(ohne Titel)',
          slug: slugify(pathOf(link)?.split('/').pop() || str(it.title)),
          html,
          excerpt: textOf(str(it.description)).slice(0, 300),
          date: day(it.pubDate) ?? day(it['dc:date']),
          published: true,
          category: str(arr(it.category)[0]),
          tags: arr(it.category).slice(1).map(str).filter(Boolean),
          cover: cover ? String(cover) : null,
          images: [],
          oldPath: pathOf(link),
          seoTitle: '',
          seoDescription: '',
        };
      }),
    };
  }
  if (doc?.feed) {
    const entries = arr(doc.feed.entry) as Record<string, any>[];
    return {
      source: 'rss',
      label: str(doc.feed.title) || 'Feed',
      warnings,
      items: entries.map((e) => {
        const link = (arr(e.link) as Record<string, string>[]).find((l) => !l['@_rel'] || l['@_rel'] === 'alternate')?.['@_href'] ?? '';
        return {
          kind: 'post' as const,
          title: textOf(str(e.title)) || '(ohne Titel)',
          slug: slugify(pathOf(link)?.split('/').pop() || str(e.title)),
          html: cleanHtml(str(e.content) || str(e.summary)),
          excerpt: textOf(str(e.summary)).slice(0, 300),
          date: day(e.published) ?? day(e.updated),
          published: true,
          category: str((arr(e.category)[0] as Record<string, string> | undefined)?.['@_term']),
          tags: [],
          cover: null,
          images: [],
          oldPath: pathOf(link),
          seoTitle: '',
          seoDescription: '',
        };
      }),
    };
  }
  throw new Error('Das ist weder ein RSS- noch ein Atom-Feed.');
}

/* ---------- Shopify products CSV ---------- */

/** RFC 4180 CSV (quotes, commas and line breaks inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const cents = (v: string) => {
  const n = Number(
    String(v)
      .replace(/[^\d.,-]/g, '')
      .replace(',', '.'),
  );
  return v.trim() && Number.isFinite(n) ? Math.round(n * 100) : null;
};

export function parseShopifyCsv(text: string): ImportBundle {
  const [head, ...rows] = parseCsv(text);
  if (!head?.includes('Handle')) throw new Error('Das ist kein Shopify-Produktexport. In Shopify: Produkte → Exportieren → «Alle Produkte», CSV für Excel oder Numbers.');
  const col = (r: string[], name: string) => r[head.indexOf(name)] ?? '';
  const byHandle = new Map<string, string[][]>();
  for (const r of rows) {
    const h = col(r, 'Handle');
    if (!h) continue;
    if (!byHandle.has(h)) byHandle.set(h, []);
    byHandle.get(h)!.push(r);
  }
  const items: ImportItem[] = [];
  for (const [handle, group] of byHandle) {
    const first = group[0];
    const variants: ImportVariant[] = group
      .filter((r) => col(r, 'Variant Price') || col(r, 'Option1 Value'))
      .map((r) => ({
        name: [1, 2, 3]
          .map((n) => col(r, `Option${n} Value`))
          .filter((v) => v && v !== 'Default Title')
          .join(' / '),
        price: cents(col(r, 'Variant Price')),
        stock: col(r, 'Variant Inventory Qty') ? Number(col(r, 'Variant Inventory Qty')) : null,
        sku: col(r, 'Variant SKU'),
      }));
    const images = [...new Set(group.map((r) => col(r, 'Image Src')).filter(Boolean))];
    const real = variants.filter((v) => v.name);
    const price = variants[0]?.price ?? null;
    const status = col(first, 'Status');
    items.push({
      kind: 'product',
      title: col(first, 'Title') || handle,
      slug: slugify(handle),
      html: cleanHtml(col(first, 'Body (HTML)')),
      excerpt: '',
      date: null,
      published: status ? status === 'active' : col(first, 'Published').toLowerCase() !== 'false',
      category: col(first, 'Type') || col(first, 'Product Category').split('>').pop()?.trim() || '',
      tags: col(first, 'Tags')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      cover: images[0] ?? null,
      images,
      oldPath: `/products/${handle}`,
      seoTitle: col(first, 'SEO Title'),
      seoDescription: col(first, 'SEO Description'),
      price,
      comparePrice: cents(col(first, 'Variant Compare At Price')),
      sku: real.length ? '' : (variants[0]?.sku ?? ''),
      stock: real.length ? null : (variants[0]?.stock ?? null),
      variants: real,
    });
  }
  return { source: 'shopify', label: 'Shopify-Produkte', items, warnings: [] };
}

/* ---------- Markdown (single file or zip: Jekyll, Hugo, Astro, Obsidian …) ---------- */

export function parseMarkdownFile(path: string, text: string): ImportItem {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  let fm: Record<string, unknown> = {};
  let body = text;
  if (m) {
    try {
      fm = (parseYaml(m[1]) as Record<string, unknown>) ?? {};
    } catch {
      fm = {};
    }
    body = m[2];
  }
  const base = path
    .split('/')
    .pop()!
    .replace(/\.(md|markdown|mdx)$/i, '');
  // Jekyll file names start with the date: 2024-03-01-my-post.md
  const dated = /^(\d{4}-\d{2}-\d{2})-(.+)$/.exec(base);
  const h1 = /^#\s+(.+)$/m.exec(body);
  const title = String(fm.title ?? h1?.[1] ?? dated?.[2]?.replace(/-/g, ' ') ?? base).trim();
  if (!fm.title && h1) body = body.replace(h1[0], '');
  const isPage = String(fm.layout ?? fm.type ?? '').toLowerCase() === 'page' || /(^|\/)(pages?|seiten)\//i.test(path);
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? v.split(',').map((s) => s.trim()) : []);
  const cats = list(fm.categories ?? fm.category);
  const cover = (fm.cover ?? fm.image ?? fm.featured_image ?? fm.thumbnail ?? null) as string | null;
  const html = marked.parse(body, { async: false, gfm: true }) as string;
  return {
    kind: isPage ? 'page' : 'post',
    title,
    slug: slugify(String(fm.slug ?? dated?.[2] ?? base)),
    html,
    excerpt: String(fm.description ?? fm.excerpt ?? fm.summary ?? '').slice(0, 300),
    date: day(fm.date ?? dated?.[1]),
    published: !(fm.draft === true || fm.published === false),
    category: cats[0] ?? '',
    tags: list(fm.tags),
    cover: cover ? String(cover) : null,
    images: [],
    oldPath: typeof fm.permalink === 'string' ? fm.permalink.replace(/\/+$/, '').toLowerCase() : null,
    seoTitle: '',
    seoDescription: String(fm.description ?? ''),
  };
}

export function parseMarkdownZip(buf: Uint8Array): ImportBundle {
  const files = unzipSync(buf);
  const all = new Map<string, Uint8Array>();
  const items: ImportItem[] = [];
  for (const [name, data] of Object.entries(files)) {
    if (name.startsWith('__MACOSX/') || name.endsWith('/')) continue;
    all.set(name, data);
  }
  for (const [name, data] of all)
    if (/\.(md|markdown|mdx)$/i.test(name) && !/(^|\/)(readme|license)\.md$/i.test(name)) items.push({ ...parseMarkdownFile(name, strFromU8(data)), sourcePath: name });
  if (!items.length) throw new Error('In der ZIP-Datei sind keine Markdown-Dateien (.md).');
  return { source: 'markdown', label: 'Markdown', items, warnings: [], files: all };
}

/** Picks the parser from the file's name and content. */
export function parseUpload(filename: string, buf: Buffer): ImportBundle {
  const name = filename.toLowerCase();
  if (name.endsWith('.zip')) return parseMarkdownZip(new Uint8Array(buf));
  const text = buf.toString('utf8');
  if (name.endsWith('.csv')) return parseShopifyCsv(text);
  if (/\.(md|markdown|mdx)$/.test(name)) return { source: 'markdown', label: 'Markdown', items: [parseMarkdownFile(name, text)], warnings: [] };
  if (/<wp:wxr_version>|xmlns:wp=/.test(text.slice(0, 5000))) return parseWxr(text);
  if (/<rss|<feed/.test(text.slice(0, 2000))) return parseFeed(text);
  throw new Error('Dieses Dateiformat kennt Nova nicht. Möglich sind: WordPress/Squarespace-XML, RSS/Atom, Shopify-CSV, Markdown (.md oder .zip).');
}

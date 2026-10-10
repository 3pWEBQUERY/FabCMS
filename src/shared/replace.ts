/**
 * Search and replace across content. Only text people read changes: in rich
 * text only what stands between the tags (as the browser shows it), never
 * ids, kinds or references of blocks and elements.
 */

export interface ReplaceOptions {
  find: string;
  replace: string;
  caseSensitive?: boolean;
  /** «Bern» doesn't hit «Berner». */
  wholeWord?: boolean;
}

export interface Hit {
  /** Path in the data, e.g. `blocks.2.props.body`. */
  path: string;
  before: string;
  match: string;
  after: string;
}

/** Keys that hold structure, not text. */
const SKIP = new Set(['id', 'type', 'kind', 'ref', 'lock', 'variant', 'level', 'icon', 'shape', 'collection', 'template_for']);
const CONTEXT = 40;

export function matcher(o: ReplaceOptions): RegExp | null {
  if (!o.find) return null;
  const esc = o.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Word edges that know umlauts and accents (\b doesn't).
  const src = o.wholeWord ? `(?<![\\p{L}\\p{N}_])${esc}(?![\\p{L}\\p{N}_])` : esc;
  return new RegExp(src, `gu${o.caseSensitive ? '' : 'i'}`);
}

const looksHtml = (s: string) => /<\/?[a-z][^>]*>/i.test(s);
const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&');
const encode = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;');

function snippets(text: string, re: RegExp, path: string, out: Hit[]) {
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    out.push({
      path,
      before: (i > CONTEXT ? '…' : '') + text.slice(Math.max(0, i - CONTEXT), i),
      match: m[0],
      after: text.slice(i + m[0].length, i + m[0].length + CONTEXT) + (i + m[0].length + CONTEXT < text.length ? '…' : ''),
    });
  }
}

/** One string: the new value and what was found in it. */
export function replaceInText(s: string, re: RegExp, replacement: string, path: string, hits: Hit[]): string {
  if (!looksHtml(s)) {
    snippets(s, re, path, hits);
    return s.replace(re, () => replacement);
  }
  // Rich text: only the text between tags, compared as it reads (entities decoded).
  const plain = decode(s.replace(/<[^>]*>/g, ''));
  snippets(plain, re, path, hits);
  return s
    .split(/(<[^>]*>)/)
    .map((part, i) => {
      if (i % 2 === 1) return part;
      const text = decode(part);
      re.lastIndex = 0;
      if (!re.test(text)) return part;
      re.lastIndex = 0;
      return encode(text.replace(re, () => replacement));
    })
    .join('');
}

/** Walks any stored value; returns the replaced copy and every hit with its path. */
export function replaceDeep<T>(value: T, o: ReplaceOptions, path = ''): { value: T; hits: Hit[] } {
  const re = matcher(o);
  const hits: Hit[] = [];
  if (!re) return { value, hits };
  const walk = (v: unknown, p: string): unknown => {
    if (typeof v === 'string') return replaceInText(v, re, o.replace, p, hits);
    if (Array.isArray(v)) return v.map((x, i) => walk(x, p ? `${p}.${i}` : String(i)));
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = SKIP.has(k) ? x : walk(x, p ? `${p}.${k}` : k);
      return out;
    }
    return v;
  };
  return { value: walk(value, path) as T, hits };
}

/** Site settings with text people read: name, contact, menu, footer, notes. Keys, tokens and secrets stay out. */
export const SETTINGS_TEXT = [
  'name',
  'tagline',
  'business.legalName',
  'business.street',
  'business.zip',
  'business.city',
  'business.phone',
  'business.email',
  'hoursNote',
  'social',
  'header.cta',
  'footer',
  'nav',
  'seo.titleTemplate',
  'seo.defaultDescription',
  'ageGate.text',
  'shop.invoiceNote',
  'shop.terms',
  'ordering.note',
  'donations.receiptNote',
  'members.planName',
  'members.perks',
] as const;

const getAt = (o: unknown, path: string) => path.split('.').reduce<unknown>((x, k) => (x && typeof x === 'object' ? (x as Record<string, unknown>)[k] : undefined), o);
function setAt<T>(o: T, path: string, v: unknown): T {
  const [k, ...rest] = path.split('.');
  const cur = (o ?? {}) as Record<string, unknown>;
  return { ...cur, [k]: rest.length ? setAt(cur[k], rest.join('.'), v) : v } as T;
}

/** The settings with the replacement applied to their text parts only. */
export function replaceInSettings<T>(settings: T, o: ReplaceOptions): { value: T; hits: Hit[] } {
  let next = settings;
  const hits: Hit[] = [];
  for (const p of SETTINGS_TEXT) {
    const cur = getAt(settings, p);
    if (cur === undefined || cur === null) continue;
    const r = replaceDeep(cur, o, p);
    if (r.hits.length) {
      hits.push(...r.hits);
      next = setAt(next, p, r.value);
    }
  }
  return { value: next, hits };
}

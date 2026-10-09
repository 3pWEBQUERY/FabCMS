import type { FieldDef } from './fields';
import type { EntryData, SiteSettings } from './types';

/** Languages Nova speaks – the Swiss national languages plus English. */
export type Lang = 'de' | 'fr' | 'it' | 'en';
export const LANGS: { id: Lang; name: string; native: string; locale: string; pg: string }[] = [
  { id: 'de', name: 'Deutsch', native: 'Deutsch', locale: 'de-CH', pg: 'german' },
  { id: 'fr', name: 'Französisch', native: 'Français', locale: 'fr-CH', pg: 'french' },
  { id: 'it', name: 'Italienisch', native: 'Italiano', locale: 'it-CH', pg: 'italian' },
  { id: 'en', name: 'Englisch', native: 'English', locale: 'en', pg: 'english' },
];
export const isLang = (v: unknown): v is Lang => typeof v === 'string' && LANGS.some((l) => l.id === v);
export const langInfo = (l: string) => LANGS.find((x) => x.id === l) ?? LANGS[0];

/** Main language from the site locale («de-CH» → de). */
export const defaultLang = (s: Pick<SiteSettings, 'locale'>): Lang => {
  const l = (s.locale ?? 'de').slice(0, 2);
  return isLang(l) ? l : 'de';
};
/** Additional languages that are switched on (never the main language). */
export const extraLangs = (s: Pick<SiteSettings, 'locale' | 'languages'>): Lang[] => (s.languages ?? []).filter((l): l is Lang => isLang(l) && l !== defaultLang(s));
export const siteLangs = (s: Pick<SiteSettings, 'locale' | 'languages'>): Lang[] => [defaultLang(s), ...extraLangs(s)];

/** Field types whose content is text and gets translated. Everything else is shared by all languages. */
const TEXT_TYPES = new Set(['text', 'textarea', 'richtext', 'link', 'blocks', 'json', 'form']);
const SHARED_KEYS = new Set(['access', 'consent', 'adult']);

/** Whether a field differs per language (text) or is shared by all languages (prices, images, dates …). */
export const isTranslatable = (f: FieldDef): boolean => !SHARED_KEYS.has(f.key) && (TEXT_TYPES.has(f.type) || (f.type === 'group' && (f.fields ?? []).some(isTranslatable)));

function textOf(f: FieldDef, value: unknown): unknown {
  if (value === undefined) return undefined;
  if (f.type === 'group' && Array.isArray(value)) {
    const sub = (f.fields ?? []).filter((x) => TEXT_TYPES.has(x.type) || x.type === 'group');
    if (!sub.length) return undefined;
    return value.map((item) => Object.fromEntries(sub.map((x) => [x.key, textOf(x, (item as Record<string, unknown>)?.[x.key])]).filter(([, v]) => v !== undefined)));
  }
  return TEXT_TYPES.has(f.type) ? value : undefined;
}

/** The part of an entry's data that a translation holds: text fields, blocks and SEO. */
export function translatableData(fields: FieldDef[], data: Record<string, unknown>, hasBlocks: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (SHARED_KEYS.has(f.key)) continue;
    const v = textOf(f, data[f.key]);
    if (v !== undefined) out[f.key] = v;
  }
  if (hasBlocks && data.blocks !== undefined) out.blocks = data.blocks;
  if (data.seo !== undefined) out.seo = data.seo;
  if (typeof data.title === 'string') out.title = data.title;
  return out;
}

function mergeGroup(f: FieldDef, base: unknown, tr: unknown): unknown {
  if (!Array.isArray(base)) return base;
  if (!Array.isArray(tr)) return base;
  return base.map((item, i) => {
    const t = tr[i] as Record<string, unknown> | undefined;
    if (!t || typeof item !== 'object' || !item) return item;
    const next = { ...(item as Record<string, unknown>) };
    for (const sub of f.fields ?? []) {
      if (sub.type === 'group') next[sub.key] = mergeGroup(sub, next[sub.key], t[sub.key]);
      else if (TEXT_TYPES.has(sub.type) && filled(t[sub.key])) next[sub.key] = t[sub.key];
    }
    return next;
  });
}
const filled = (v: unknown) => v !== undefined && v !== null && v !== '';

/**
 * Original data with the translation laid over it. Empty translated fields
 * fall back to the original, so a half-done translation never shows holes.
 */
export function mergeTranslation<T extends Record<string, unknown> | EntryData>(
  fields: FieldDef[],
  base: T,
  tr: Record<string, unknown> | null | undefined,
  hasBlocks: boolean,
): T {
  if (!tr) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const f of fields) {
    if (SHARED_KEYS.has(f.key)) continue;
    if (f.type === 'group') out[f.key] = mergeGroup(f, out[f.key], tr[f.key]);
    else if (TEXT_TYPES.has(f.type) && filled(tr[f.key])) out[f.key] = tr[f.key];
  }
  if (typeof tr.title === 'string' && tr.title) out.title = tr.title;
  if (hasBlocks && Array.isArray(tr.blocks) && tr.blocks.length) out.blocks = tr.blocks;
  if (tr.seo && typeof tr.seo === 'object') out.seo = { ...((out.seo as object) ?? {}), ...Object.fromEntries(Object.entries(tr.seo).filter(([, v]) => filled(v))) };
  return out as T;
}

/** Site texts that differ per language (Einstellungen → Sprachen). */
export interface SiteTranslation {
  name?: string;
  tagline?: string;
  hoursNote?: string;
  footerText?: string;
  ctaLabel?: string;
  description?: string;
  /** Menu labels by nav item id. */
  nav?: Record<string, string>;
  /** Footer column titles by index. */
  columns?: string[];
  /** Footer link labels by href. */
  links?: Record<string, string>;
}

/** Settings as a visitor in this language sees them. */
export function localizeSettings(s: SiteSettings, lang: Lang): SiteSettings {
  if (lang === defaultLang(s)) return s;
  const t = s.translations?.[lang] ?? {};
  const pick = (v: string | undefined, fallback: string) => (v && v.trim() ? v : fallback);
  type Nav = SiteSettings['nav'][number];
  const nav = (items: Nav[]): Nav[] => items.map((i) => ({ ...i, label: pick(t.nav?.[i.id], i.label), children: i.children ? nav(i.children) : i.children }));
  return {
    ...s,
    locale: langInfo(lang).locale,
    name: pick(t.name, s.name),
    tagline: pick(t.tagline, s.tagline),
    hoursNote: pick(t.hoursNote, s.hoursNote),
    nav: nav(s.nav),
    header: { ...s.header, cta: s.header.cta ? { ...s.header.cta, label: pick(t.ctaLabel, s.header.cta.label) } : s.header.cta },
    footer: {
      ...s.footer,
      text: pick(t.footerText, s.footer.text),
      columns: s.footer.columns.map((c, i) => ({ ...c, title: pick(t.columns?.[i], c.title), links: c.links.map((l) => ({ ...l, label: pick(t.links?.[l.href], l.label) })) })),
    },
    seo: { ...s.seo, defaultDescription: pick(t.description, s.seo.defaultDescription) },
  };
}

/** Paths that never get a language prefix (assets, admin, API, webhooks). */
export const UNPREFIXED = /^\/(_nova|media|admin|api|robots\.txt|sitemap\.xml|healthz|favicon|\.well-known)(\/|$|\?)/;

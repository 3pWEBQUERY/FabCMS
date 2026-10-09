import { AsyncLocalStorage } from 'node:async_hooks';
import { sql, json } from './db';
import { badRequest, HttpError, notFound } from './lib/http';
import { activeCollections, getCollection, sanitizeEntryData, type SaveContext } from './content';
import { bumpGeneration, contentGeneration, getSettings, mainLang } from './settings';
import { entryPath, RESERVED_PREFIXES } from '../shared/paths';
import { slugify } from '../shared/text';
import { defaultLang, extraLangs, isLang, mergeTranslation, translatableData, UNPREFIXED, type Lang } from '../shared/i18n';
import type { CollectionDef, Entry, EntryData } from '../shared/types';

/**
 * Translations lay the text of another language over an entry. Everything
 * inside the app works with the main language's paths; the outermost layer
 * (app.ts) maps /fr/… in and out, and this module knows the mapping.
 */

/** Language of the current request; set once per request in app.ts. */
export const requestLang = new AsyncLocalStorage<Lang>();
/** Language a visitor sees on this request – the main language unless under /fr/ etc. */
export function pageLang(): Lang {
  return requestLang.getStore() ?? mainLang();
}
/** null = main language, nothing to translate. */
export function currentLang(): Lang | null {
  const l = requestLang.getStore();
  return l && l !== mainLang() ? l : null;
}

/** Language to store with a booking or order made now ('' = main language). */
export const storedLang = (): string => currentLang() ?? '';

/** Runs fn in the language stored with a booking or order – for mails sent later (webhooks, reminders, staff actions). */
export function inStoredLang<T>(stored: string | null | undefined, fn: () => Promise<T>): Promise<T> {
  const want = isLang(stored) ? stored : mainLang();
  return want === pageLang() ? fn() : requestLang.run(want, fn);
}

export interface TranslationRow {
  entry_id: string;
  lang: Lang;
  collection: string;
  slug: string;
  status: 'draft' | 'published';
  data: Record<string, unknown>;
  published_data: Record<string, unknown> | null;
  published_slug: string | null;
  published_at: string | null;
  version: number;
  updated_at: string;
}

/* ---------- reading: overlay for the website ---------- */

/**
 * Overlays published translations on rows (id + data) of one collection or
 * mixed collections. In the main language this returns the rows untouched.
 */
export async function localized<T extends { id: string; data: unknown; collection?: string }>(rows: T[], collection?: string | CollectionDef): Promise<T[]> {
  const lang = currentLang();
  if (!lang || !rows.length) return rows;
  const trs =
    await sql`select entry_id, collection, published_data from entry_translations where lang = ${lang} and status = 'published' and entry_id = any(${rows.map((r) => r.id)}::uuid[])`;
  if (!trs.length) return rows;
  const byId = new Map(trs.map((t) => [t.entry_id as string, t]));
  const cols = new Map((await activeCollections()).map((c) => [c.id, c]));
  return rows.map((r) => {
    const t = byId.get(r.id);
    if (!t) return r;
    const col = typeof collection === 'object' ? collection : cols.get(typeof collection === 'string' ? collection : (r.collection ?? (t.collection as string)));
    if (!col) return r;
    return { ...r, data: mergeTranslation(col.fields, (r.data ?? {}) as EntryData, t.published_data as Record<string, unknown>, col.has_blocks), translated: true };
  });
}
export async function localizedOne<T extends { id: string; data: unknown; collection?: string }>(row: T | undefined, collection?: string | CollectionDef): Promise<T | undefined> {
  return row ? (await localized([row], collection))[0] : row;
}

/* ---------- paths ---------- */

interface PathMap {
  gen: number;
  /** main-language path → path in this language */
  toLocal: Map<string, string>;
  /** path in this language → main-language path */
  toMain: Map<string, string>;
}
const maps = new Map<Lang, PathMap>();

export async function pathMap(lang: Lang): Promise<PathMap> {
  const hit = maps.get(lang);
  if (hit && hit.gen === contentGeneration()) return hit;
  const cols = new Map((await activeCollections()).map((c) => [c.id, c]));
  const rows = await sql`
    select e.collection, e.slug, t.published_slug from entry_translations t join entries e on e.id = t.entry_id
    where t.lang = ${lang} and t.status = 'published' and e.status = 'published'`;
  const map: PathMap = { gen: contentGeneration(), toLocal: new Map(), toMain: new Map() };
  for (const r of rows) {
    const c = cols.get(r.collection as string);
    if (!c) continue;
    const main = entryPath(c, r.slug as string);
    const local = entryPath(c, (r.published_slug as string) ?? (r.slug as string));
    if (!main || !local) continue;
    const prefixed = local === '/' ? `/${lang}` : `/${lang}${local}`;
    map.toLocal.set(main, prefixed);
    map.toMain.set(prefixed, main);
  }
  maps.set(lang, map);
  return map;
}

const splitPath = (href: string) => {
  const i = href.search(/[?#]/);
  return i < 0 ? [href, ''] : [href.slice(0, i), href.slice(i)];
};

/** Main-language path (with query/hash) → the same page in `lang`. */
export function localizePath(map: PathMap, lang: Lang, href: string): string {
  if (!href.startsWith('/') || href.startsWith('//') || UNPREFIXED.test(href)) return href;
  const [p, rest] = splitPath(href);
  if (p === `/${lang}` || p.startsWith(`/${lang}/`)) return href;
  const local = map.toLocal.get(p) ?? (p === '/' ? `/${lang}` : `/${lang}${p}`);
  return local + rest;
}

/** Which language a path belongs to, given the switched-on languages. */
export function langOfPath(path: string, langs: Lang[]): Lang | null {
  const m = /^\/([a-z]{2})(?:\/|$)/.exec(path);
  return m && langs.includes(m[1] as Lang) ? (m[1] as Lang) : null;
}

/** For hreflang and the language switcher: the page's address in every language that has it. */
export async function alternates(mainPathOf: string, opts: { onlyTranslated?: boolean } = {}): Promise<{ lang: Lang; path: string; translated: boolean }[]> {
  const s = await getSettings();
  const out: { lang: Lang; path: string; translated: boolean }[] = [{ lang: defaultLang(s), path: mainPathOf, translated: true }];
  for (const l of extraLangs(s)) {
    const m = await pathMap(l);
    const translated = m.toLocal.has(mainPathOf);
    if (opts.onlyTranslated && !translated) continue;
    out.push({ lang: l, path: localizePath(m, l, mainPathOf), translated });
  }
  return out;
}

/** Rewrites internal links in a rendered page and in redirect targets. */
export async function localizeHtml(htmlText: string, lang: Lang): Promise<string> {
  const m = await pathMap(lang);
  return htmlText.replace(
    /(\s(?:href|action)=")(\/[^"]*)"/g,
    (_, attr: string, href: string) => `${attr}${localizePath(m, lang, href.replace(/&amp;/g, '&')).replace(/&/g, '&amp;')}"`,
  );
}

/* ---------- editing ---------- */

/** The entry as the editor sees it in another language: original with the draft translation laid over it. */
export async function translationView(e: Entry, lang: Lang): Promise<Entry & { lang: Lang; translated: boolean }> {
  const c = await getCollection(e.collection);
  const [t] = (await sql`select * from entry_translations where entry_id = ${e.id} and lang = ${lang}`) as unknown as TranslationRow[];
  if (!t) return { ...e, lang, translated: false, status: 'draft', version: 0, published_data: null, published_at: null, data: e.data };
  return {
    ...e,
    lang,
    translated: true,
    slug: t.slug,
    status: t.status,
    version: t.version,
    data: mergeTranslation(c.fields, e.data, t.data, c.has_blocks),
    published_data: t.published_data ? mergeTranslation(c.fields, (e.published_data ?? e.data) as EntryData, t.published_data, c.has_blocks) : null,
    published_at: t.published_at,
    updated_at: t.updated_at,
  };
}

async function uniqueTranslationSlug(c: CollectionDef, lang: Lang, wanted: string, entryId: string): Promise<string> {
  let base = slugify(wanted);
  if (c.id === 'pages' && RESERVED_PREFIXES.includes(base.split('/')[0])) base = `seite-${base}`;
  if (c.id !== 'pages') base = base.replace(/\//g, '-');
  if (!base) base = c.id === 'pages' ? 'seite' : 'eintrag';
  let slug = base;
  for (let i = 2; ; i++) {
    const [hit] = await sql`select 1 from entry_translations where collection = ${c.id} and lang = ${lang} and slug = ${slug} and entry_id <> ${entryId}`;
    if (!hit) return slug;
    slug = `${base}-${i}`;
  }
}

export async function saveTranslation(e: Entry, lang: Lang, input: { data: Record<string, unknown>; slug?: string; baseVersion?: number }, ctx: SaveContext) {
  await assertLang(lang);
  const c = await getCollection(e.collection);
  const clean = sanitizeEntryData(c, input.data, e.data, ctx);
  const text = translatableData(c.fields, clean as Record<string, unknown>, c.has_blocks);
  const [cur] = await sql`select version, slug from entry_translations where entry_id = ${e.id} and lang = ${lang}`;
  if (cur && input.baseVersion !== undefined && input.baseVersion !== cur.version)
    throw new HttpError(409, 'Jemand anderes hat diese Übersetzung in der Zwischenzeit geändert. Lade neu, um die aktuelle Fassung zu sehen.', { version: cur.version });
  // The home page keeps its empty address in every language.
  const isHome = c.id === 'pages' && e.slug === '';
  const wanted = isHome
    ? ''
    : input.slug !== undefined && input.slug !== (cur?.slug as string | undefined)
      ? input.slug || String(text.title ?? '')
      : ((cur?.slug as string) ?? String(text.title ?? e.slug));
  const slug = isHome ? '' : wanted === cur?.slug ? (cur.slug as string) : await uniqueTranslationSlug(c, lang, wanted, e.id);
  await sql`
    insert into entry_translations (entry_id, lang, collection, slug, data, updated_by)
    values (${e.id}, ${lang}, ${c.id}, ${slug}, ${json(text)}, ${ctx.userId || null})
    on conflict (entry_id, lang) do update set data = excluded.data, slug = excluded.slug, version = entry_translations.version + 1, updated_at = now(), updated_by = excluded.updated_by`;
  return translationView(e, lang);
}

export async function publishTranslation(e: Entry, lang: Lang) {
  await assertLang(lang);
  if (e.status !== 'published') throw badRequest('Veröffentliche zuerst das Original – die Übersetzung erscheint zusammen mit ihm.');
  const c = await getCollection(e.collection);
  const [t] = await sql`select * from entry_translations where entry_id = ${e.id} and lang = ${lang}`;
  if (!t) throw badRequest('Es gibt noch keine Übersetzung zum Veröffentlichen.');
  await sql.begin(async (tx) => {
    await tx`update entry_translations set published_data = data, published_slug = slug, status = 'published', published_at = coalesce(published_at, now()), updated_at = now() where entry_id = ${e.id} and lang = ${lang}`;
    const own = entryPath(c, t.slug as string);
    if (own) await tx`delete from redirects where from_path = ${own === '/' ? `/${lang}` : `/${lang}${own}`}`;
    // Changed address of a live translation: old link keeps working.
    if (t.published_slug !== null && t.published_slug !== t.slug) {
      const from = entryPath(c, t.published_slug as string);
      const to = entryPath(c, t.slug as string);
      if (from && to && from !== to) {
        const pre = (p: string) => (p === '/' ? `/${lang}` : `/${lang}${p}`);
        await tx`delete from redirects where from_path = ${pre(to)}`;
        await tx`insert into redirects (from_path, to_path, code, auto) values (${pre(from)}, ${pre(to)}, 301, true) on conflict (from_path) do update set to_path = excluded.to_path`;
      }
    }
  });
  bumpGeneration();
  return translationView(e, lang);
}

export async function unpublishTranslation(e: Entry, lang: Lang) {
  await sql`update entry_translations set status = 'draft', published_data = null, updated_at = now() where entry_id = ${e.id} and lang = ${lang}`;
  bumpGeneration();
  return translationView(e, lang);
}

export async function discardTranslation(e: Entry, lang: Lang) {
  const [t] =
    await sql`update entry_translations set data = published_data, slug = coalesce(published_slug, slug), version = version + 1, updated_at = now() where entry_id = ${e.id} and lang = ${lang} and published_data is not null returning 1`;
  if (!t) throw badRequest('Es gibt keine veröffentlichte Fassung, zu der man zurückkehren könnte.');
  return translationView(e, lang);
}

export async function deleteTranslation(e: Entry, lang: Lang) {
  await sql`delete from entry_translations where entry_id = ${e.id} and lang = ${lang}`;
  bumpGeneration();
}

/** Per entry: which languages exist and in which state (for lists and the editor's switcher). */
export async function translationStatus(ids: string[]): Promise<Map<string, { lang: Lang; status: string; changed: boolean }[]>> {
  const out = new Map<string, { lang: Lang; status: string; changed: boolean }[]>();
  if (!ids.length) return out;
  const rows =
    await sql`select entry_id, lang, status, (published_data is distinct from data or published_slug is distinct from slug) as changed from entry_translations where entry_id = any(${ids}::uuid[])`;
  for (const r of rows) {
    const list = out.get(r.entry_id as string) ?? [];
    list.push({ lang: r.lang as Lang, status: r.status as string, changed: r.status === 'published' && Boolean(r.changed) });
    out.set(r.entry_id as string, list);
  }
  return out;
}

async function assertLang(lang: string): Promise<void> {
  const s = await getSettings();
  if (!isLang(lang) || !extraLangs(s).includes(lang)) throw notFound('Diese Sprache ist auf der Website nicht eingeschaltet (Einstellungen → Sprachen).');
}
export async function parseLang(v: string | undefined | null): Promise<Lang | null> {
  if (!v) return null;
  const s = await getSettings();
  if (v === defaultLang(s)) return null;
  await assertLang(v);
  return v as Lang;
}

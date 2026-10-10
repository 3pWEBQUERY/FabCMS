import { createHash } from 'node:crypto';
import { sql } from './db';
import { env } from './env';
import { activeCollections } from './content';
import { getSettings, mainLang, onContentChange } from './settings';
import { localized } from './translations';
import { blocksText } from '../shared/blocks';
import { entryAccess } from '../shared/members';
import { stripHtml } from '../shared/text';
import { langInfo, mergeTranslation, siteLangs, type Lang } from '../shared/i18n';
import type { CollectionDef, EntryData } from '../shared/types';

/**
 * Site search. Postgres full-text search is always there; with MEILI_HOST,
 * Meilisearch does the matching (typos, word beginnings, better ranking).
 *
 * Meilisearch only answers «which entries»: what a visitor may see, the
 * address and the text shown still come from the database, so an index
 * that lags behind can never show something unpublished. If Meilisearch is
 * down, the search quietly falls back to Postgres.
 */

export interface SearchRow {
  id: string;
  collection: string;
  slug: string;
  data: EntryData;
}

export const meiliConfigured = () => Boolean(env.meili.host);

/** Collections whose entries have an address of their own. */
export const searchable = (cols: CollectionDef[]) => cols.filter((x) => x.id === 'pages' || x.route || x.list_route);

/* ---------- Postgres ---------- */

async function pgIds(q: string, lang: Lang | null, cols: string[]): Promise<string[]> {
  const main = langInfo(mainLang()).pg;
  const like = `%${q.replace(/[%_\\]/g, '')}%`;
  const translated = lang
    ? await sql`
        select e.id, ts_rank(to_tsvector(${langInfo(lang).pg}::regconfig, t.published_data::text), websearch_to_tsquery(${langInfo(lang).pg}::regconfig, ${q})) as rank
        from entry_translations t join entries e on e.id = t.entry_id
        where t.lang = ${lang} and t.status = 'published' and e.status = 'published' and e.collection = any(${cols})
          and ((coalesce(e.published_data ->> 'access', 'public') = 'public' and to_tsvector(${langInfo(lang).pg}::regconfig, t.published_data::text) @@ websearch_to_tsquery(${langInfo(lang).pg}::regconfig, ${q}))
            or t.published_data ->> 'title' ilike ${like})
          and coalesce(e.published_data -> 'seo' ->> 'noindex', 'false') <> 'true'
        order by rank desc limit 30`
    : [];
  const original = await sql`
    select id, ts_rank(to_tsvector(${main}::regconfig, published_data::text), websearch_to_tsquery(${main}::regconfig, ${q})) as rank
    from entries
    where status = 'published' and collection = any(${cols})
      and ((coalesce(published_data ->> 'access', 'public') = 'public' and to_tsvector(${main}::regconfig, published_data::text) @@ websearch_to_tsquery(${main}::regconfig, ${q}))
        or published_data ->> 'title' ilike ${like})
      and coalesce(published_data -> 'seo' ->> 'noindex', 'false') <> 'true'
      ${lang ? sql`and not exists (select 1 from entry_translations t where t.entry_id = entries.id and t.lang = ${lang} and t.status = 'published')` : sql``}
    order by rank desc limit 30`;
  return [...translated, ...original]
    .sort((a, b) => Number(b.rank) - Number(a.rank))
    .slice(0, 30)
    .map((r) => r.id as string);
}

/* ---------- Meilisearch ---------- */

async function meili<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${env.meili.host}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(env.meili.key ? { Authorization: `Bearer ${env.meili.key}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Meilisearch ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
  return (await r.json()) as T;
}
const idx = () => `/indexes/${encodeURIComponent(env.meili.index)}`;

interface Doc {
  id: string;
  entry: string;
  lang: string;
  collection: string;
  title: string;
  text: string;
}

/** One document per entry and language; a language without a translation gets the original, as the site shows it. */
async function buildDocs(): Promise<Doc[]> {
  const s = await getSettings();
  const cols = searchable(await activeCollections());
  if (!cols.length) return [];
  const rows = await sql`
    select id, collection, published_data as data from entries
    where status = 'published' and collection = any(${cols.map((c) => c.id)})
      and coalesce(published_data -> 'seo' ->> 'noindex', 'false') <> 'true'`;
  const langs = siteLangs(s);
  const trs =
    langs.length > 1 ? await sql`select entry_id, lang, published_data from entry_translations where status = 'published' and entry_id = any(${rows.map((r) => r.id)})` : [];
  const docs: Doc[] = [];
  for (const r of rows) {
    const col = cols.find((c) => c.id === r.collection)!;
    for (const lang of langs) {
      const tr = lang === langs[0] ? null : trs.find((t) => t.entry_id === r.id && t.lang === lang);
      const d = (tr ? mergeTranslation(col.fields, r.data as EntryData, tr.published_data as Record<string, unknown>, col.has_blocks) : r.data) as EntryData;
      // Members-only entries are found by their title only.
      const text =
        entryAccess(d) === 'public'
          ? [d.description ? stripHtml(String(d.description)) : '', d.excerpt ? String(d.excerpt) : '', blocksText(d.blocks)].filter(Boolean).join(' ')
          : '';
      docs.push({ id: `${r.id}-${lang}`, entry: r.id as string, lang, collection: col.id, title: d.title ?? '', text: text.slice(0, 20_000) });
    }
  }
  return docs;
}

const pushed = new Map<string, string>();
let state: { ok: boolean; at: string | null; error: string | null; documents: number } = { ok: false, at: null, error: null, documents: 0 };
let running: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let fresh = true;

async function syncOnce() {
  if (fresh) {
    await meili('POST', '/indexes', { uid: env.meili.index, primaryKey: 'id' }).catch(() => undefined); // exists already: fine
    await meili('PATCH', `${idx()}/settings`, { searchableAttributes: ['title', 'text'], filterableAttributes: ['lang', 'collection'], displayedAttributes: ['entry', 'lang'] });
  }
  const docs = await buildDocs();
  const hash = (d: Doc) => createHash('sha1').update(JSON.stringify(d)).digest('base64');
  const changed = docs.filter((d) => pushed.get(d.id) !== hash(d));
  const ids = new Set(docs.map((d) => d.id));
  // First run: ask the index what it holds; afterwards we know.
  const known = fresh
    ? (await meili<{ results: { id: string }[] }>('GET', `${idx()}/documents?fields=id&limit=100000`).catch(() => ({ results: [] }))).results.map((r) => r.id)
    : [...pushed.keys()];
  const gone = known.filter((id) => !ids.has(id));
  for (let i = 0; i < changed.length; i += 1000) await meili('POST', `${idx()}/documents`, changed.slice(i, i + 1000));
  if (gone.length) await meili('POST', `${idx()}/documents/delete-batch`, gone);
  for (const d of changed) pushed.set(d.id, hash(d));
  for (const id of gone) pushed.delete(id);
  fresh = false;
  state = { ok: true, at: new Date().toISOString(), error: null, documents: docs.length };
}

/** Brings the index up to date (one run at a time; a change during a run triggers another). */
export function syncSearch(): Promise<void> {
  if (!meiliConfigured()) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      try {
        await syncOnce();
      } catch (e) {
        state = { ...state, ok: false, error: (e as Error).message };
        fresh = true; // start over next time, the index may have been reset
        console.error('[search]', (e as Error).message);
      }
    } while (again);
  })().finally(() => (running = null));
  return running;
}

export const searchIdle = () => running ?? Promise.resolve();

/** Everything again – after a Meilisearch reset, or from the button in the settings. */
export function rebuildSearch(): Promise<void> {
  pushed.clear();
  fresh = true;
  return syncSearch();
}

export function searchStatus() {
  return { engine: meiliConfigured() ? ('meilisearch' as const) : ('postgres' as const), ...state };
}

/** Keeps the index current: shortly after each change, and once an hour from scratch. */
export function startSearchSync() {
  if (!meiliConfigured()) return;
  onContentChange(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void syncSearch(), 1500);
  });
  setInterval(() => void rebuildSearch(), 60 * 60_000).unref();
  void syncSearch();
}

async function meiliIds(q: string, lang: Lang, cols: string[]): Promise<string[]> {
  const filter = `lang = "${lang}" AND collection IN [${cols.map((c) => JSON.stringify(c)).join(', ')}]`;
  const r = await meili<{ hits: { entry: string }[] }>('POST', `${idx()}/search`, { q, filter, limit: 30, attributesToRetrieve: ['entry'] });
  return r.hits.map((h) => h.entry);
}

/* ---------- search ---------- */

/** Entries matching q in the visitor's language, best first, as the site shows them. */
export async function searchSite(q: string, lang: Lang | null, collections: CollectionDef[]): Promise<SearchRow[]> {
  const cols = searchable(collections).map((c) => c.id);
  if (!q || !cols.length) return [];
  let ids: string[] | null = null;
  if (meiliConfigured() && state.ok) ids = await meiliIds(q, lang ?? mainLang(), cols).catch(() => null);
  ids ??= await pgIds(q, lang, cols);
  if (!ids.length) return [];
  const rows = (await sql`
    select id, collection, slug, published_data as data from entries
    where id = any(${ids}) and status = 'published' and collection = any(${cols})`) as unknown as SearchRow[];
  const order = new Map(ids.map((id, i) => [id, i]));
  return (await localized(rows)).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}

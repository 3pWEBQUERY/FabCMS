import { sql } from '../server/db';
import { localized, localizedOne } from '../server/translations';
import type { Block, CollectionDef, EntryData, FormDef } from '../shared/types';
import type { Review } from '../shared/reviews';
import { applyOverrides, componentEls, type El, type Overrides } from '../shared/elements';

export interface PublicEntry {
  id: string;
  slug: string;
  data: EntryData;
  published_at: string | null;
  updated_at: string;
  author_name: string | null;
  sort_index: number;
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  category?: string;
  sortField?: string;
  sortDir?: 'asc' | 'desc';
  where?: (e: PublicEntry) => boolean;
}

const SORT_SAFE = /^[a-zA-Z_][a-zA-Z0-9_]{0,40}$/;

/** Published entries of a collection, sorted by the collection's default sort. */
export async function publishedEntries(c: CollectionDef, o: ListOptions = {}): Promise<{ items: PublicEntry[]; total: number }> {
  const field = o.sortField ?? c.sort?.field ?? 'published_at';
  const dir = (o.sortDir ?? c.sort?.dir ?? 'desc') === 'asc' ? sql`asc` : sql`desc`;
  const order =
    field === 'sort'
      ? sql`e.sort_index ${dir}`
      : field === 'published_at' || field === 'created_at'
        ? sql`e.published_at ${dir} nulls last`
        : SORT_SAFE.test(field)
          ? sql`e.published_data ->> ${field} ${dir} nulls last, e.published_at desc`
          : sql`e.published_at desc`;
  const cat = o.category ? sql`and lower(e.published_data ->> 'category') = lower(${o.category})` : sql``;
  const rows = await sql`
    select e.id, e.slug, e.published_data as data, e.published_at, e.updated_at, e.sort_index, u.name as author_name,
           count(*) over() as total
    from entries e left join users u on u.id = e.author_id
    where e.collection = ${c.id} and e.status = 'published' ${cat}
    order by ${order}
    limit ${o.limit ?? 100} offset ${o.offset ?? 0}`;
  return { items: await localized(rows as unknown as PublicEntry[], c), total: Number(rows[0]?.total ?? 0) };
}

export async function categoriesOf(collection: string): Promise<string[]> {
  const rows = await sql`
    select distinct published_data ->> 'category' as c from entries
    where collection = ${collection} and status = 'published' and coalesce(published_data ->> 'category', '') <> ''
    order by 1`;
  return rows.map((r) => r.c as string);
}

export async function getForm(id: unknown): Promise<FormDef | null> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [f] = await sql`select * from forms where id = ${id}`;
  return (f as unknown as FormDef) ?? null;
}

export async function sectionBlocks(id: unknown, preview: boolean): Promise<{ title: string; blocks: Block[] } | null> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [s] = await sql`select data, published_data from entries where id = ${id} and collection = 'sections'`;
  if (!s) return null;
  const raw = (preview ? s.data : s.published_data) as EntryData | null;
  const d = raw ? ((await localizedOne({ id, data: raw }, 'sections'))?.data as EntryData) : null;
  return d ? { title: d.title, blocks: d.blocks ?? [] } : null;
}

/**
 * The blocks with every component instance replaced by its original's elements
 * (with the instance's own texts) – so descriptions, search and reading time see them.
 */
export async function expandComponents(blocks: Block[] | undefined, preview = false): Promise<Block[]> {
  const list = blocks ?? [];
  if (!list.some((b) => b.type === 'layout' && JSON.stringify(b.props.els ?? []).includes('"kind":"component"'))) return list;
  const masters = new Map<string, El[]>();
  const expand = async (els: El[], depth: number): Promise<El[]> => {
    const out: El[] = [];
    for (const el of els) {
      if (el.kind !== 'component') {
        out.push(el.children ? { ...el, children: await expand(el.children, depth) } : el);
        continue;
      }
      const ref = typeof el.props.ref === 'string' ? el.props.ref : '';
      if (!masters.has(ref)) masters.set(ref, ref && depth < 3 ? componentEls((await sectionBlocks(ref, preview))?.blocks) : []);
      const own = applyOverrides(masters.get(ref) ?? [], el.props.overrides as Overrides | undefined);
      out.push({ id: el.id, kind: 'box', props: {}, children: depth < 3 ? await expand(own, depth + 1) : [] });
    }
    return out;
  };
  return Promise.all(list.map(async (b) => (b.type === 'layout' ? { ...b, props: { ...b.props, els: await expand((b.props.els as El[]) ?? [], 0) } } : b)));
}

/** Published pop-ups (sections of kind «popup») in the page's language, newest change first. */
export async function livePopups(): Promise<{ id: string; title: string; data: EntryData }[]> {
  const rows = await sql`
    select id, published_data as data from entries
    where collection = 'sections' and status = 'published' and published_data ->> 'kind' = 'popup'
    order by updated_at desc limit 10`;
  const list = await Promise.all(rows.map((r) => localizedOne({ id: r.id as string, data: r.data as EntryData }, 'sections')));
  return list.filter((x): x is NonNullable<typeof x> => Boolean(x)).map((x) => ({ id: x.id, title: x.data.title, data: x.data }));
}

/** The page template of a content type: the most recently changed «sections» entry of kind «template» for it. */
export async function entryTemplate(collection: string, preview: boolean): Promise<{ id: string; title: string; blocks: Block[] } | null> {
  const col = preview ? sql`data` : sql`published_data`;
  const [s] = await sql`
    select id from entries
    where collection = 'sections' and ${col} ->> 'kind' = 'template' and ${col} ->> 'template_for' = ${collection}
    order by updated_at desc limit 1`;
  if (!s) return null;
  const t = await sectionBlocks(s.id as string, preview);
  return t ? { id: s.id as string, ...t } : null;
}

/** An entry to show while a template is designed: the newest published one of its type. */
export async function sampleEntry(collection: string): Promise<PublicEntry | null> {
  const [e] = await sql`
    select e.id, e.slug, e.published_data as data, e.published_at, e.updated_at, e.sort_index, null as author_name
    from entries e where e.collection = ${collection} and e.status = 'published' and e.published_data is not null
    order by e.published_at desc nulls last limit 1`;
  return e ? ((await localizedOne(e as unknown as PublicEntry, collection)) as PublicEntry) : null;
}

export async function approvedComments(entryId: string) {
  return sql`select id, name, body, created_at from comments where entry_id = ${entryId} and status = 'approved' and rating is null order by created_at`;
}

/** Approved reviews of a product, newest first. */
export async function approvedReviews(entryId: string): Promise<Review[]> {
  const rows = await sql`
    select name, rating, body, verified, created_at from comments
    where entry_id = ${entryId} and status = 'approved' and rating is not null order by created_at desc limit 200`;
  return rows as unknown as Review[];
}

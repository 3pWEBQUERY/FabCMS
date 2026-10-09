import { sql } from '../server/db';
import type { Block, CollectionDef, EntryData, FormDef } from '../shared/types';

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
  return { items: rows as unknown as PublicEntry[], total: Number(rows[0]?.total ?? 0) };
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
  const d = (preview ? s.data : s.published_data) as EntryData | null;
  return d ? { title: d.title, blocks: d.blocks ?? [] } : null;
}

export async function approvedComments(entryId: string) {
  return sql`select id, name, body, created_at from comments where entry_id = ${entryId} and status = 'approved' order by created_at`;
}

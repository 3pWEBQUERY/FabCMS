/**
 * The «Inhaltsschleife»: which entries a list in the free layout shows.
 * Its settings live on the list element; this module checks them and turns
 * them into what the database query needs. Nothing here touches the
 * database, so the editor, the renderer and the tests share it.
 */

import type { CollectionDef, EntryData } from './types';

export const LOOP_SORTS = ['newest', 'oldest', 'title', 'order', 'random', 'field-asc', 'field-desc'] as const;
export const LOOP_TIMES = ['all', 'upcoming', 'past'] as const;
export const LOOP_RELATED = ['none', 'category', 'tags'] as const;
export const MAX_RULES = 4;

export type LoopSort = (typeof LOOP_SORTS)[number];

export interface LoopRule {
  /** A field of the content type. */
  field: string;
  /** The value it must have; for lists (tags, choices) one of its values. «true»/«false» for yes/no fields. */
  is: string;
}

export interface LoopQuery {
  collection: string;
  limit: number;
  offset: number;
  sort: LoopSort;
  sortField: string;
  category: string;
  tag: string;
  rules: LoopRule[];
  /** Entries like the one the page shows: same category, or sharing a tag. */
  related: (typeof LOOP_RELATED)[number];
  /** Leave out the entry the page shows. */
  excludeCurrent: boolean;
  /** Dated content (events, courses …): only what is still to come, or what is over. */
  time: (typeof LOOP_TIMES)[number];
  paginate: boolean;
  /** Shown when nothing matches; empty = nothing at all. */
  empty: string;
}

const KEY = /^[a-zA-Z_][a-zA-Z0-9_]{0,40}$/;
const one = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => ((list as readonly string[]).includes(String(v)) ? (String(v) as T) : fallback);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const int = (v: unknown, min: number, max: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback);

/** The loop's settings as stored: every value checked, defaults filled in. */
export function loopQuery(p: Record<string, unknown>): LoopQuery {
  const rules = Array.isArray(p.rules)
    ? p.rules
        .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object')
        .map((r) => ({ field: typeof r.field === 'string' && KEY.test(r.field) ? r.field : '', is: text(r.is, 120) }))
        // A rule still being filled in stays; the query skips it until it has a value.
        .filter((r) => r.field)
        .slice(0, MAX_RULES)
    : [];
  return {
    collection: typeof p.collection === 'string' && /^[a-z][a-z0-9_]{1,40}$/.test(p.collection) ? p.collection : 'posts',
    limit: int(p.limit, 1, 48, 3),
    offset: int(p.offset, 0, 200, 0),
    sort: one(p.sort, LOOP_SORTS, 'newest'),
    sortField: typeof p.sortField === 'string' && KEY.test(p.sortField) ? p.sortField : '',
    category: text(p.category, 80),
    tag: text(p.tag, 80),
    rules,
    related: one(p.related, LOOP_RELATED, 'none'),
    excludeCurrent: p.excludeCurrent === true,
    time: one(p.time, LOOP_TIMES, 'all'),
    paginate: p.paginate === true,
    empty: text(p.empty, 200),
  };
}

/** The date a content type is sorted and split in time by: its start, else its first date field. */
export function timeField(c: CollectionDef): string | null {
  const dated = c.fields.filter((f) => f.type === 'date' || f.type === 'datetime');
  return (dated.find((f) => f.key === 'start') ?? dated.find((f) => f.key === 'date') ?? dated[0])?.key ?? null;
}

/** Fields a rule can test: those with a few known values. */
export const ruleFields = (c: CollectionDef) => c.fields.filter((f) => ['select', 'multiselect', 'tags', 'boolean', 'text', 'number'].includes(f.type) && KEY.test(f.key));

/** Fields a loop can be sorted by. */
export const sortFields = (c: CollectionDef) => c.fields.filter((f) => ['text', 'number', 'money', 'date', 'datetime', 'select'].includes(f.type) && KEY.test(f.key));

/** Wall time in the site's time zone, as dated fields store it («2026-10-11T09:30»). */
export function localNow(now: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** What «like this entry» means for the entry a page shows: its category, or its tags. */
export function relatedTo(q: LoopQuery, current: EntryData | null | undefined): { category?: string; tags?: string[] } | null {
  if (q.related === 'none' || !current) return null;
  if (q.related === 'category') return typeof current.category === 'string' && current.category ? { category: current.category } : { tags: [] };
  const tags = Array.isArray(current.tags) ? current.tags.filter((x): x is string => typeof x === 'string' && x.length > 0).map((x) => x.toLowerCase()) : [];
  return { tags };
}

/** The query parameter of a loop's page number – one per loop, so two loops on a page page on their own. */
export const pageParam = (elId: string) => `seite-${elId}`;

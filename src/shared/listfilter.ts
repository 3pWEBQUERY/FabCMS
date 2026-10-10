import type { FieldDef } from './fields';

/**
 * Filters of a content list, the same in the address bar, in saved views and
 * on the server: status, search, author, last change and one value per
 * choosing field (category, select, tags, yes/no).
 */
export interface ListFilter {
  status?: string;
  q?: string;
  /** A user id, or «me». */
  author?: string;
  /** Changed within this many days. */
  updated?: string;
  /** Field key → value. */
  fields?: Record<string, string>;
}

export const UPDATED_DAYS = ['1', '7', '30', '90'] as const;
const FIELD_TYPES = ['select', 'boolean', 'tags', 'multiselect'];

/** Fields a list can be filtered by. */
export function filterFields(fields: FieldDef[]): FieldDef[] {
  return fields.filter((f) => FIELD_TYPES.includes(f.type) || (f.key === 'category' && f.type === 'text'));
}

/** As query parameters: `status`, `q`, `author`, `updated` and `f.<key>`. */
export function filterToParams(f: ListFilter): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ['status', 'q', 'author', 'updated'] as const) if (f[k]) out[k] = f[k]!;
  for (const [k, v] of Object.entries(f.fields ?? {})) if (v !== '') out[`f.${k}`] = v;
  return out;
}

export function paramsToFilter(p: Record<string, string | undefined>): ListFilter {
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) if (k.startsWith('f.') && v) fields[k.slice(2)] = v;
  const f: ListFilter = {};
  if (p.status) f.status = p.status;
  if (p.q) f.q = p.q;
  if (p.author) f.author = p.author;
  if (p.updated && (UPDATED_DAYS as readonly string[]).includes(p.updated)) f.updated = p.updated;
  if (Object.keys(fields).length) f.fields = fields;
  return f;
}

/** How many filters are set (search and status count too). */
export const filterCount = (f: ListFilter) => ['status', 'q', 'author', 'updated'].filter((k) => f[k as keyof ListFilter]).length + Object.keys(f.fields ?? {}).length;

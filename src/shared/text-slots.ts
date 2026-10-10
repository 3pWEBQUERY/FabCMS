import { BLOCK_MAP } from './blocks';
import type { FieldDef, LinkValue } from './fields';
import type { Block } from './types';

/**
 * The texts of an entry, each with the place it lives in the data. Used for
 * the translation draft: the server reads them from the original, the editor
 * writes the chosen suggestions back into the translation. Blocks are
 * addressed by id ("#abc"), so a translation whose blocks were moved around
 * still gets each text in the right place.
 */

export type SlotPath = (string | number)[];
export type SlotKind = 'plain' | 'multi' | 'rich';
export interface TextSlot {
  path: SlotPath;
  kind: SlotKind;
  text: string;
  /** Character limit of the field, if any. */
  max?: number;
}

/** Same as isTranslatable in i18n.ts: these keys are shared by all languages. */
const SHARED_KEYS = new Set(['access', 'consent', 'adult']);

const KIND: Record<string, SlotKind> = { text: 'plain', textarea: 'multi', richtext: 'rich' };
const filled = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

function walk(fields: FieldDef[], obj: unknown, base: SlotPath, out: TextSlot[]) {
  if (!obj || typeof obj !== 'object') return;
  const o = obj as Record<string, unknown>;
  for (const f of fields) {
    if (SHARED_KEYS.has(f.key)) continue;
    const v = o[f.key];
    if (KIND[f.type]) {
      if (filled(v)) out.push({ path: [...base, f.key], kind: KIND[f.type], text: v, max: f.maxLength });
    } else if (f.type === 'link') {
      const label = (v as LinkValue | null)?.label;
      if (filled(label)) out.push({ path: [...base, f.key, 'label'], kind: 'plain', text: label });
    } else if (f.type === 'group' && Array.isArray(v)) {
      v.forEach((item, i) => walk(f.fields ?? [], item, [...base, f.key, i], out));
    }
  }
}

export function blockSlots(blocks: Block[] | undefined): TextSlot[] {
  const out: TextSlot[] = [];
  for (const b of blocks ?? []) {
    const def = BLOCK_MAP[b.type];
    if (def) walk(def.fields, b.props, ['blocks', `#${b.id}`, 'props'], out);
  }
  return out;
}

/** All texts of an entry: title, fields, blocks, search snippet. */
export function entrySlots(col: { fields: FieldDef[]; has_blocks: boolean; title_field: string }, data: Record<string, unknown>): TextSlot[] {
  const out: TextSlot[] = [];
  if (!col.fields.some((f) => f.key === col.title_field) && filled(data.title)) out.push({ path: ['title'], kind: 'plain', text: data.title });
  walk(
    col.fields.filter((f) => f.type !== 'blocks'),
    data,
    [],
    out,
  );
  if (col.has_blocks) out.push(...blockSlots(data.blocks as Block[] | undefined));
  const seo = data.seo as { title?: unknown; description?: unknown } | undefined;
  if (filled(seo?.title)) out.push({ path: ['seo', 'title'], kind: 'plain', text: seo.title, max: 70 });
  if (filled(seo?.description)) out.push({ path: ['seo', 'description'], kind: 'multi', text: seo.description, max: 160 });
  return out;
}

const pathKey = (p: SlotPath) => p.join('/');
export { pathKey as slotKey };

function child(cur: unknown, seg: string | number): unknown {
  if (cur === null || cur === undefined) return undefined;
  if (typeof seg === 'string' && seg.startsWith('#') && Array.isArray(cur)) return cur.find((x) => (x as { id?: string })?.id === seg.slice(1));
  return (cur as Record<string | number, unknown>)[seg];
}

export function getAt(data: unknown, path: SlotPath): unknown {
  return path.reduce(child, data);
}

/** Returns a copy of data with value at path; unchanged data if the place no longer exists. */
export function setAt<T>(data: T, path: SlotPath, value: unknown): T {
  if (!path.length) return value as T;
  const [seg, ...rest] = path;
  if (Array.isArray(data)) {
    const i = typeof seg === 'string' && seg.startsWith('#') ? data.findIndex((x) => (x as { id?: string })?.id === seg.slice(1)) : Number(seg);
    if (i < 0 || i >= data.length) return data;
    const item = setAt(data[i], rest, value);
    if (item === data[i]) return data;
    const next = data.slice();
    next[i] = item;
    return next as T;
  }
  const o = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  // A link without label yet, or the search snippet: create the object on the way.
  if (rest.length && (o[seg] === null || o[seg] === undefined) && typeof rest[0] === 'string' && !rest[0].startsWith('#')) return { ...o, [seg]: setAt({}, rest, value) } as T;
  if (rest.length && (o[seg] === null || typeof o[seg] !== 'object')) return data;
  const inner = setAt(o[seg], rest, value);
  return inner === o[seg] ? data : ({ ...o, [seg]: inner } as T);
}

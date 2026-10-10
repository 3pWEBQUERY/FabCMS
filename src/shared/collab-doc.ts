import * as Y from 'yjs';
import type { Block, EntryData } from './types';

/**
 * Entry data as a Yjs document, so several people can edit at once:
 *
 *   data (Y.Map)
 *     title, excerpt, seo, … → plain JSON values (last writer wins per field)
 *     blocks (Y.Array)       → one Y.Map per block
 *       id, type, lock, …    → plain values
 *       props (Y.Map)        → one entry per prop (last writer wins per prop)
 *
 * Two people in different blocks, or in different props of the same block,
 * never overwrite each other. Used by the editor and by the server room.
 */

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

export const dataMap = (doc: Y.Doc) => doc.getMap<unknown>('data');

function blockToY(b: Block): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  const props = new Y.Map<unknown>();
  for (const [pk, pv] of Object.entries((b.props as Record<string, unknown>) ?? {})) props.set(pk, structuredClone(pv));
  // (A Y.Map not yet in a document answers has() with false, so props are set once, explicitly.)
  m.set('props', props);
  for (const [k, v] of Object.entries(b)) if (k !== 'props') m.set(k, structuredClone(v));
  return m;
}

function blockFromY(m: Y.Map<unknown>): Block {
  const out: Record<string, unknown> = {};
  for (const [k, v] of m.entries()) out[k] = k === 'props' && v instanceof Y.Map ? v.toJSON() : v;
  return out as unknown as Block;
}

/** The entry data the document currently holds. */
export function toData(doc: Y.Doc): EntryData {
  const out: Record<string, unknown> = {};
  for (const [k, v] of dataMap(doc).entries()) out[k] = k === 'blocks' && v instanceof Y.Array ? v.toArray().map((b) => blockFromY(b as Y.Map<unknown>)) : v;
  return out as EntryData;
}

function updateBlock(m: Y.Map<unknown>, b: Block) {
  for (const [k, v] of Object.entries(b)) {
    if (k === 'props') {
      let props = m.get('props');
      if (!(props instanceof Y.Map)) {
        props = new Y.Map<unknown>();
        m.set('props', props);
      }
      const ym = props as Y.Map<unknown>;
      const next = (v as Record<string, unknown>) ?? {};
      for (const [pk, pv] of Object.entries(next)) if (!same(ym.get(pk), pv)) ym.set(pk, structuredClone(pv));
      for (const pk of [...ym.keys()]) if (!(pk in next)) ym.delete(pk);
    } else if (!same(m.get(k), v)) m.set(k, structuredClone(v));
  }
  for (const k of [...m.keys()]) if (k !== 'props' && !(k in b)) m.delete(k);
}

function syncBlocks(arr: Y.Array<Y.Map<unknown>>, next: Block[]) {
  // Walk the target order: keep blocks in place, move by delete+insert, add new ones, drop the rest.
  for (let i = 0; i < next.length; i++) {
    const want = next[i];
    const cur = i < arr.length ? arr.get(i) : null;
    if (cur && cur.get('id') === want.id) {
      updateBlock(cur, want);
      continue;
    }
    let found = -1;
    for (let j = i + 1; j < arr.length; j++) if (arr.get(j).get('id') === want.id) found = j;
    if (found >= 0) arr.delete(found, 1);
    arr.insert(i, [blockToY(want)]);
  }
  if (arr.length > next.length) arr.delete(next.length, arr.length - next.length);
}

/**
 * Brings the document to `next` with as few changes as possible, in one
 * transaction tagged with `origin` (the editor's undo tracks its own origin).
 */
export function applyData(doc: Y.Doc, next: EntryData, origin: unknown = null): void {
  doc.transact(() => {
    const map = dataMap(doc);
    const data = next as Record<string, unknown>;
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      if (k === 'blocks' && Array.isArray(v)) {
        let arr = map.get('blocks');
        if (!(arr instanceof Y.Array)) {
          arr = new Y.Array<Y.Map<unknown>>();
          map.set('blocks', arr);
        }
        syncBlocks(arr as Y.Array<Y.Map<unknown>>, v as Block[]);
      } else if (!same(map.get(k), v)) map.set(k, structuredClone(v));
    }
    for (const k of [...map.keys()]) if (!(k in data) || data[k] === undefined) map.delete(k);
  }, origin);
}

/** Blocks whose content differs between two versions (for re-rendering only those). */
export function changedBlocks(prev: EntryData | null, next: EntryData): { changed: string[]; structure: boolean } {
  const a = prev?.blocks ?? [];
  const b = next.blocks ?? [];
  const structure = a.length !== b.length || a.some((x, i) => x.id !== b[i]?.id);
  const before = new Map(a.map((x) => [x.id, x]));
  return { changed: b.filter((x) => !same(before.get(x.id), x)).map((x) => x.id), structure };
}

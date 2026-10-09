import type { Block, EntryData } from '../../shared/types';

/** Immutable set by dotted path: setIn(obj, 'items.0.title', 'x'). */
export function setIn<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.');
  const key: string | number = Array.isArray(obj) ? Number(head) : head;
  const copy: any = Array.isArray(obj) ? [...obj] : { ...(obj as object) };
  copy[key] = rest.length ? setIn(copy[key] ?? (/^\d+$/.test(rest[0]) ? [] : {}), rest.join('.'), value) : value;
  return copy;
}

export function updateBlock(data: EntryData, id: string, fn: (b: Block) => Block): EntryData {
  return { ...data, blocks: (data.blocks ?? []).map((b) => (b.id === id ? fn(b) : b)) };
}

export function changedBlockIds(a: Block[] = [], b: Block[] = []): string[] {
  const before = new Map(a.map((x) => [x.id, JSON.stringify(x)]));
  return b.filter((x) => before.get(x.id) !== JSON.stringify(x)).map((x) => x.id);
}

/** Tells the canvas iframe what to do. */
export function postToCanvas(frame: HTMLIFrameElement | null, msg: Record<string, unknown>) {
  frame?.contentWindow?.postMessage({ nova: 1, ...msg }, location.origin);
}

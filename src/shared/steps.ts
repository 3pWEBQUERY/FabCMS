import { BLOCK_MAP } from './blocks';
import { EL_DEFS, type El } from './elements';
import type { Block, EntryData } from './types';

/**
 * What one step in the editor did, for the list of steps in «Verlauf»:
 * the kind of change and what it touched. `what` is a label in German
 * (translated where it is shown); `named` is a name the user gave and stays
 * as it is.
 */
export interface StepLabel {
  kind: 'add' | 'del' | 'move' | 'style' | 'motion' | 'edit' | 'field' | 'seo' | 'many';
  what?: string;
  named?: string;
  /** «many»: how many elements or blocks changed at once. */
  n?: number;
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const blockWhat = (b: Block) => ({ what: BLOCK_MAP[b.type]?.label ?? b.type });
const elWhat = (el: El) => (el.name ? { named: el.name } : { what: EL_DEFS[el.kind]?.label ?? el.kind });

interface Spot {
  el: El;
  parent: string | null;
  index: number;
}

function spots(els: unknown): Map<string, Spot> {
  const out = new Map<string, Spot>();
  const walk = (list: El[], parent: string | null) =>
    list.forEach((el, index) => {
      out.set(el.id, { el, parent, index });
      if (el.children) walk(el.children, el.id);
    });
  if (Array.isArray(els)) walk(els as El[], null);
  return out;
}

/** The elements of a free layout that changed, each with what happened to it. */
function elChanges(before: unknown, after: unknown): StepLabel[] {
  const a = spots(before);
  const b = spots(after);
  const out: StepLabel[] = [];
  for (const [id, now] of b) {
    const was = a.get(id);
    if (!was) {
      // Only the outermost of a pasted or wrapped group counts.
      if (!now.parent || a.has(now.parent)) out.push({ kind: 'add', ...elWhat(now.el) });
      continue;
    }
    const { children: _c1, ...x } = was.el;
    const { children: _c2, ...y } = now.el;
    if (was.parent !== now.parent) out.push({ kind: 'move', ...elWhat(now.el) });
    else if (!same(x.design, y.design) || x.use !== y.use) out.push({ kind: 'style', ...elWhat(now.el) });
    else if (!same(x.motion, y.motion)) out.push({ kind: 'motion', ...elWhat(now.el) });
    else if (!same(x, y)) out.push({ kind: 'edit', ...elWhat(now.el) });
  }
  for (const [id, was] of a) if (!b.has(id) && (!was.parent || b.has(was.parent))) out.push({ kind: 'del', ...elWhat(was.el) });
  // Moving one element within its container shifts the others: show the one that moved.
  if (!out.length) {
    const moved = [...b].filter(([id, now]) => a.get(id)!.index !== now.index);
    if (moved.length) {
      const biggest = moved.reduce((m, x) => (Math.abs(a.get(x[0])!.index - x[1].index) > Math.abs(a.get(m[0])!.index - m[1].index) ? x : m));
      out.push({ kind: 'move', ...elWhat(biggest[1].el) });
    }
  }
  return out;
}

function blockChanges(before: Block[], after: Block[]): StepLabel[] {
  const a = new Map(before.map((x) => [x.id, x]));
  const ids = new Set(after.map((x) => x.id));
  const out: StepLabel[] = [];
  for (const b of after) {
    const was = a.get(b.id);
    if (!was) out.push({ kind: 'add', ...blockWhat(b) });
    else if (was !== b && !same(was, b)) {
      const { els: e1, ...p1 } = was.props;
      const { els: e2, ...p2 } = b.props;
      if (!same(e1, e2)) out.push(...elChanges(e1, e2));
      if (!same(was.style, b.style)) out.push({ kind: 'style', ...blockWhat(b) });
      else if (!same(p1, p2) || was.type !== b.type || !same(was.lock, b.lock)) out.push({ kind: 'edit', ...blockWhat(b) });
    }
  }
  for (const x of before) if (!ids.has(x.id)) out.push({ kind: 'del', ...blockWhat(x) });
  if (!out.length) {
    const order = before.filter((x) => ids.has(x.id)).map((x) => x.id);
    const moved = after.find((x, i) => order[i] !== x.id);
    if (moved) out.push({ kind: 'move', ...blockWhat(moved) });
  }
  return out;
}

/** Names one step from what the page looked like before and after it. */
export function describeStep(before: EntryData, after: EntryData): StepLabel {
  const changes = blockChanges(before.blocks ?? [], after.blocks ?? []);
  if (changes.length === 1) return changes[0];
  if (changes.length > 1) {
    // Everything of the same kind on the same thing (e.g. three images added): one line.
    const kinds = new Set(changes.map((c) => c.kind));
    return kinds.size === 1 && ['add', 'del'].includes(changes[0].kind) ? { ...changes[0], n: changes.length } : { kind: 'many', n: changes.length };
  }
  if (!same(before.seo, after.seo)) return { kind: 'seo' };
  const key = Object.keys({ ...before, ...after }).find((k) => k !== 'blocks' && k !== 'seo' && !same(before[k], after[k]));
  return { kind: 'field', what: key };
}

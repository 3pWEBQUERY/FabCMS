/**
 * «Farben dieser Seite»: every colour the designs of a page use – of its
 * blocks, their elements and component variants, on every screen size and on
 * hover – and replacing one of them everywhere at once.
 */

import type { Design, Gradient, StyleProps } from './design';
import type { El, Variant } from './elements';
import type { Block } from './types';

const COLOR_PROPS = ['color', 'bg', 'borderColor', 'accent', 'overlay'] as const;
const LAYERS = ['desktop', 'tablet', 'mobile', 'hover'] as const;

/** One way of writing a colour: `#C33` and `#cc3333` are the same, tokens stay as they are. */
export function colorKey(v: string): string {
  const s = v.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : s;
}

/** Calls `visit` with every colour of a design; what it returns replaces the colour. */
function mapDesign(d: Design | undefined, visit: (c: string) => string): Design | undefined {
  if (!d) return d;
  let changed = false;
  const out: Design = { ...d };
  const grad = (g: Gradient | undefined): Gradient | undefined => {
    if (!g || !Array.isArray(g.stops)) return g;
    let moved = false;
    const stops = g.stops.map((s) => {
      if (typeof s?.color !== 'string') return s;
      const next = visit(s.color);
      if (next === s.color) return s;
      moved = true;
      return { ...s, color: next };
    });
    return moved ? { ...g, stops } : g;
  };
  for (const layer of LAYERS) {
    const p = d[layer];
    if (!p) continue;
    const q: StyleProps = { ...p };
    let touched = false;
    for (const k of COLOR_PROPS) {
      const v = p[k];
      if (typeof v !== 'string') continue;
      const next = visit(v);
      if (next !== v) {
        q[k] = next;
        touched = true;
      }
    }
    for (const k of ['gradient', 'textGradient'] as const) {
      const g = grad(p[k]);
      if (g !== p[k]) {
        q[k] = g;
        touched = true;
      }
    }
    if (p.shadow && typeof p.shadow === 'object' && typeof p.shadow.color === 'string') {
      const next = visit(p.shadow.color);
      if (next !== p.shadow.color) {
        q.shadow = { ...p.shadow, color: next };
        touched = true;
      }
    }
    if (touched) {
      out[layer] = q;
      changed = true;
    }
  }
  return changed ? out : d;
}

/** Every design of the blocks, walked in order: `visit` sees each colour and returns what stands there afterwards. */
function eachDesign(blocks: Block[], visit: (c: string) => string, skip: (b: Block) => boolean = () => false): Block[] {
  return blocks.map((b) => {
    if (skip(b)) return b;
    let next = b;
    const own = mapDesign(b.style?.design, visit);
    if (own !== b.style?.design) next = { ...next, style: { ...next.style, design: own } };
    if (b.type === 'layout') {
      const els = (b.props.els as El[] | undefined) ?? [];
      const mapEls = (list: El[]): El[] =>
        list.map((el) => {
          const design = mapDesign(el.design, visit);
          const children = el.children ? mapEls(el.children) : el.children;
          return design === el.design && children === el.children ? el : { ...el, design, ...(children ? { children } : {}) };
        });
      const nextEls = mapEls(els);
      const variants = (b.props.variants as Variant[] | undefined)?.map((v) => {
        let moved = false;
        const designs = Object.fromEntries(
          Object.entries(v.designs ?? {}).map(([id, d]) => {
            const m = mapDesign(d, visit);
            if (m !== d) moved = true;
            return [id, m];
          }),
        ) as Record<string, Design>;
        return moved ? { ...v, designs } : v;
      });
      const variantsChanged = variants?.some((v, i) => v !== (b.props.variants as Variant[])[i]);
      if (nextEls.some((el, i) => el !== els[i]) || variantsChanged) next = { ...next, props: { ...next.props, els: nextEls, ...(variantsChanged ? { variants } : {}) } };
    }
    return next;
  });
}

/** The colours a page uses, most used first. */
export function pageColors(blocks: Block[]): { value: string; count: number }[] {
  const seen = new Map<string, { value: string; count: number }>();
  eachDesign(blocks, (c) => {
    const key = colorKey(c);
    const hit = seen.get(key);
    if (hit) hit.count++;
    else seen.set(key, { value: c, count: 1 });
    return c;
  });
  return [...seen.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** The page with one colour replaced by another wherever a design uses it; `skip`: blocks to leave alone (locked ones). */
export function replaceColor(blocks: Block[], from: string, to: string, skip?: (b: Block) => boolean): Block[] {
  const want = colorKey(from);
  return eachDesign(blocks, (c) => (colorKey(c) === want ? to : c), skip);
}

/**
 * Geometry of the free canvas, in percent of the canvas: lining elements
 * up, spacing them evenly and finding the line a drag snaps to.
 */

export interface Rect {
  l: number;
  t: number;
  w: number;
  h: number;
}

export type AlignHow = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'hspace' | 'vspace';

/**
 * Moves the rects in place: one lines up with the canvas, several with each
 * other. Spacing needs three or more and goes by their middles – the outer
 * two stay, also when they overlap.
 */
export function alignRects<T extends Rect>(rects: T[], how: AlignHow): T[] {
  if (!rects.length) return rects;
  const one = rects.length === 1;
  const L = one ? 0 : Math.min(...rects.map((b) => b.l));
  const R = one ? 100 : Math.max(...rects.map((b) => b.l + b.w));
  const T = one ? 0 : Math.min(...rects.map((b) => b.t));
  const B = one ? 100 : Math.max(...rects.map((b) => b.t + b.h));
  if (how === 'hspace' || how === 'vspace') {
    if (rects.length < 3) return rects;
    const x = how === 'hspace';
    const mid = (b: Rect) => (x ? b.l + b.w / 2 : b.t + b.h / 2);
    const sorted = [...rects].sort((a, b) => mid(a) - mid(b));
    const from = mid(sorted[0]);
    const step = (mid(sorted[sorted.length - 1]) - from) / (sorted.length - 1);
    sorted.forEach((b, i) => {
      if (x) b.l = from + step * i - b.w / 2;
      else b.t = from + step * i - b.h / 2;
    });
    return rects;
  }
  for (const b of rects) {
    if (how === 'left') b.l = L;
    else if (how === 'center') b.l = (L + R) / 2 - b.w / 2;
    else if (how === 'right') b.l = R - b.w;
    else if (how === 'top') b.t = T;
    else if (how === 'middle') b.t = (T + B) / 2 - b.h / 2;
    else if (how === 'bottom') b.t = B - b.h;
  }
  return rects;
}

/** The nearest line within `range` that one of `points` snaps to: how far to shift, and where the guide goes. */
export function snapTo(points: number[], lines: number[], range: number): { by: number; at: number } | null {
  let best: { by: number; at: number } | null = null;
  for (const p of points)
    for (const l of lines) {
      const by = l - p;
      if (Math.abs(by) <= range && (!best || Math.abs(by) < Math.abs(best.by))) best = { by, at: l };
    }
  return best;
}

/** Lines to snap to: the canvas edges and middle, and the edges and middles of the other elements. */
export const snapLines = (others: Rect[], axis: 'x' | 'y') => [
  0,
  50,
  100,
  ...others.flatMap((o) => (axis === 'x' ? [o.l, o.l + o.w / 2, o.l + o.w] : [o.t, o.t + o.h / 2, o.t + o.h])),
];

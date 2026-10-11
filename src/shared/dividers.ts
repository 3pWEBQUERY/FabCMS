/**
 * Shape dividers: a wave, a slant or a curve along the top or bottom edge of
 * a section, so it flows into the next one instead of ending in a straight
 * line. Drawn as SVG in the colour of the neighbouring section (by default the
 * page's own background), behind the content unless it should lie in front.
 */

import { cssColor } from './design';

export const DIVIDER_SHAPES = ['wave', 'waves', 'curve', 'tilt', 'triangle', 'zigzag', 'mountains'] as const;
export type DividerShape = (typeof DIVIDER_SHAPES)[number];

export interface Divider {
  shape: DividerShape;
  /** Height in px on wide screens; phones get 60 % of it. */
  height: number;
  /** Colour or theme token ($bg – the page's background –, $surface …); empty = the page's background. */
  color?: string;
  /** Mirrored left to right. */
  flip?: boolean;
  /** Upside down: the shape bulges the other way. */
  invert?: boolean;
  /** In front of the content instead of behind it. */
  front?: boolean;
}
export type Dividers = { top?: Divider; bottom?: Divider };

export const DIVIDER_HEIGHT = { min: 16, max: 320, default: 80 } as const;

const zigzag = (() => {
  const teeth = 24;
  const w = 1200 / teeth;
  let d = 'M0,120V80';
  for (let i = 0; i < teeth; i++) d += `L${i * w + w / 2},40L${(i + 1) * w},80`;
  return `${d}V120Z`;
})();

/** The shapes in a 1200 × 120 box, filled at the bottom – the part that belongs to the neighbouring section. */
const PATHS: Record<DividerShape, [string, number][]> = {
  wave: [['M0,64C150,112 350,16 600,64C850,112 1050,16 1200,64V120H0Z', 1]],
  waves: [
    ['M0,40C200,90 400,0 600,40C800,80 1000,10 1200,50V120H0Z', 0.3],
    ['M0,66C250,20 450,110 700,60C900,22 1050,92 1200,70V120H0Z', 0.6],
    ['M0,86C300,52 500,120 800,82C1000,56 1100,96 1200,90V120H0Z', 1],
  ],
  curve: [['M0,120C300,0 900,0 1200,120Z', 1]],
  tilt: [['M0,120L1200,0V120Z', 1]],
  triangle: [['M0,120L600,0L1200,120Z', 1]],
  zigzag: [[zigzag, 1]],
  mountains: [
    ['M0,120L180,30L380,95L640,8L900,88L1060,40L1200,96V120Z', 0.45],
    ['M0,120L240,70L470,108L720,52L980,110L1200,74V120Z', 1],
  ],
};

function cleanOne(input: unknown): Divider | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const d = input as Record<string, unknown>;
  if (!(DIVIDER_SHAPES as readonly string[]).includes(d.shape as string)) return undefined;
  const n = Number(d.height);
  const height = Number.isFinite(n) ? Math.min(DIVIDER_HEIGHT.max, Math.max(DIVIDER_HEIGHT.min, Math.round(n))) : DIVIDER_HEIGHT.default;
  const color = typeof d.color === 'string' && cssColor(d.color) ? d.color.trim() : undefined;
  return {
    shape: d.shape as DividerShape,
    height,
    ...(color ? { color } : {}),
    ...(d.flip === true ? { flip: true } : {}),
    ...(d.invert === true ? { invert: true } : {}),
    ...(d.front === true ? { front: true } : {}),
  };
}

/** Dividers as sent by the editor: known shapes, a sensible height, a real colour; none – nothing. */
export function cleanDividers(input: unknown): Dividers | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const raw = input as Record<string, unknown>;
  const top = cleanOne(raw.top);
  const bottom = cleanOne(raw.bottom);
  return top || bottom ? { ...(top ? { top } : {}), ...(bottom ? { bottom } : {}) } : undefined;
}

/** The SVG of a shape (also the editor's previews). */
export const dividerSvg = (shape: DividerShape) =>
  `<svg viewBox="0 0 1200 120" preserveAspectRatio="none" focusable="false">${PATHS[shape].map(([d, o]) => `<path d="${d}"${o < 1 ? ` opacity="${o}"` : ''}/>`).join('')}</svg>`;

/** One divider at the top or bottom edge of a section (themes.ts places and sizes it). */
export function dividerHtml(where: 'top' | 'bottom', d: Divider): string {
  // «Hintergrund» is the page's: a section with a colour of its own sets --bg for itself.
  const color = cssColor(d.color)?.replace(/var\(--bg\)/g, 'var(--page-bg)');
  const style = [`--dh:${d.height}px`, color ? `--dc:${color}` : '', d.flip || d.invert ? `--dt:scale(${d.flip ? -1 : 1},${d.invert ? -1 : 1})` : ''].filter(Boolean).join(';');
  return `<div class="bdiv bdiv-${where}${d.front ? ' front' : ''}" aria-hidden="true" style="${style}">${dividerSvg(d.shape)}</div>`;
}

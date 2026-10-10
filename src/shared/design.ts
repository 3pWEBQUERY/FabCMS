/**
 * Design of a block or element: CSS-like properties per breakpoint and for
 * hover, set visually in the editor and compiled to scoped CSS.
 *
 * Desktop is the base; tablet and phone only hold what differs (like
 * Webflow's cascade). Every value is checked when it is compiled – unknown
 * keys and anything that is not a plain length, number, colour or token is
 * dropped, so nothing typed into the panel can break out of the rule.
 *
 * Tokens start with `$`: `$accent`, `$s-4`, `$step-3` → `var(--accent)` …
 * A colour token can carry an opacity: `$accent/40`.
 */

import { motionVars, type Motion } from './motion';

export type DesignBp = 'desktop' | 'tablet' | 'mobile';
export type DesignState = 'normal' | 'hover';
export const DESIGN_BPS: DesignBp[] = ['desktop', 'tablet', 'mobile'];

/** Same limits as the theme (hide-tablet / hide-mobile). */
export const BP_MEDIA: Record<Exclude<DesignBp, 'desktop'>, string> = { tablet: '(max-width:64rem)', mobile: '(max-width:40rem)' };

export interface GradientStop {
  color: string;
  at: number;
}
export interface Gradient {
  type: 'linear' | 'radial';
  angle?: number;
  stops: GradientStop[];
}
export interface Shadow {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
  inset?: boolean;
}

export interface StyleProps {
  /* layout */
  display?: 'block' | 'flex' | 'grid' | 'none';
  direction?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  wrap?: boolean;
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  gap?: string;
  columns?: number;
  /** Blocks: content sits at the top, in the middle or at the bottom of a tall section. */
  vAlign?: 'start' | 'center' | 'end';
  /* place in the parent */
  alignSelf?: 'auto' | 'start' | 'center' | 'end' | 'stretch';
  grow?: number;
  order?: number;
  span?: number;
  /* spacing */
  mt?: string;
  mr?: string;
  mb?: string;
  ml?: string;
  pt?: string;
  pr?: string;
  pb?: string;
  pl?: string;
  /* size */
  width?: string;
  minWidth?: string;
  maxWidth?: string;
  height?: string;
  minHeight?: string;
  maxHeight?: string;
  /** Blocks: width of the content column (the theme's --max). */
  contentWidth?: string;
  aspect?: string;
  overflow?: 'visible' | 'hidden' | 'auto';
  fit?: 'cover' | 'contain' | 'fill';
  /* position */
  position?: 'static' | 'relative' | 'absolute' | 'sticky' | 'fixed';
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  z?: number;
  /* typography */
  font?: 'display' | 'body' | 'mono';
  fontSize?: string;
  weight?: number;
  lineHeight?: string;
  tracking?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  italic?: boolean;
  underline?: boolean;
  color?: string;
  accent?: string;
  /* background */
  bg?: string;
  gradient?: Gradient;
  bgImage?: string;
  bgSize?: 'cover' | 'contain' | 'auto';
  bgPosition?: string;
  bgRepeat?: boolean;
  bgFixed?: boolean;
  overlay?: string;
  /* border */
  borderWidth?: string;
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'none';
  borderColor?: string;
  radius?: string;
  radiusTL?: string;
  radiusTR?: string;
  radiusBR?: string;
  radiusBL?: string;
  /* effects */
  shadow?: 'none' | 's' | 'm' | 'l' | 'xl' | Shadow;
  opacity?: number;
  blur?: string;
  backdrop?: string;
  rotate?: number;
  scale?: number;
  x?: string;
  y?: string;
  cursor?: 'auto' | 'pointer' | 'default';
}

export interface Design {
  desktop?: StyleProps;
  tablet?: StyleProps;
  mobile?: StyleProps;
  hover?: StyleProps;
  /** Hover transition in ms. */
  transition?: number;
}

/* ---------- tokens ---------- */

export const COLOR_TOKENS = ['accent', 'accent-ink', 'ink', 'ink-2', 'bg', 'surface', 'line', 'inv-bg', 'inv-ink', 'inv-ink2'] as const;
export const SPACE_TOKENS = ['s-1', 's-2', 's-3', 's-4', 's-5', 's-6', 's-7', 'sp-s', 'sp-m', 'sp-l', 'gutter', 'max', 'measure'] as const;
export const SIZE_TOKENS = ['step-n2', 'step-n1', 'step-0', 'step-1', 'step-2', 'step-3', 'step-4', 'step-5', 'step-6', 'step-7', 'step-8'] as const;
const TOKENS = new Set<string>([...COLOR_TOKENS, ...SPACE_TOKENS, ...SIZE_TOKENS]);

const NUM = String.raw`-?(?:\d+(?:\.\d+)?|\.\d+)`;
const LENGTH = new RegExp(`^${NUM}(?:px|rem|em|%|vw|vh|svh|dvh|ch|fr)?$`);
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC_COLOR = /^(?:rgba?|hsla?|oklch|oklab)\([0-9.,%\s/+-]+\)$/i;

function token(v: string): string | null {
  const m = /^\$([a-z0-9-]+)$/.exec(v);
  return m && TOKENS.has(m[1]) ? `var(--${m[1]})` : null;
}

/** A length: 12px, 1.5rem, 50%, auto, $s-4 … */
export function cssLength(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v === 0 ? '0' : `${v}px`;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  if (s === 'auto' || s === 'none') return s;
  if (s.startsWith('$')) return token(s);
  if (LENGTH.test(s)) return /^-?0+(?:\.0+)?$/.test(s) ? '0' : /[a-z%]$/i.test(s) ? s : `${s}px`;
  return null;
}

/** A colour: #hex, rgb()/hsl()/oklch(), transparent, currentColor, $token or $token/40. */
export function cssColor(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s === 'transparent' || s === 'currentColor') return s;
  if (HEX.test(s) || FUNC_COLOR.test(s)) return s;
  const m = /^\$([a-z0-9-]+)(?:\/(\d{1,3}))?$/.exec(s);
  if (m && (COLOR_TOKENS as readonly string[]).includes(m[1])) {
    const alpha = m[2] === undefined ? 100 : Math.min(100, Number(m[2]));
    return alpha >= 100 ? `var(--${m[1]})` : `color-mix(in srgb,var(--${m[1]}) ${alpha}%,transparent)`;
  }
  return null;
}

const num = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null);
const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | null => (typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null);

export const SHADOWS: Record<'s' | 'm' | 'l' | 'xl', string> = {
  s: '0 1px 2px color-mix(in srgb,var(--ink) 10%,transparent),0 1px 3px color-mix(in srgb,var(--ink) 8%,transparent)',
  m: '0 4px 12px -2px color-mix(in srgb,var(--ink) 14%,transparent),0 2px 4px color-mix(in srgb,var(--ink) 6%,transparent)',
  l: '0 14px 32px -8px color-mix(in srgb,var(--ink) 22%,transparent),0 4px 10px color-mix(in srgb,var(--ink) 8%,transparent)',
  xl: '0 30px 60px -15px color-mix(in srgb,var(--ink) 32%,transparent),0 10px 20px -5px color-mix(in srgb,var(--ink) 10%,transparent)',
};

function gradientCss(g: Gradient | undefined): string | null {
  if (!g || !Array.isArray(g.stops)) return null;
  const stops = g.stops
    .map((s) => {
      const c = cssColor(s?.color);
      const at = num(s?.at, 0, 100);
      return c ? `${c}${at === null ? '' : ` ${at}%`}` : null;
    })
    .filter(Boolean);
  if (stops.length < 2) return null;
  return g.type === 'radial' ? `radial-gradient(circle at center,${stops.join(',')})` : `linear-gradient(${num(g.angle, 0, 360) ?? 180}deg,${stops.join(',')})`;
}

function shadowCss(s: StyleProps['shadow']): string | null {
  if (s === 'none') return 'none';
  if (typeof s === 'string') return SHADOWS[s as keyof typeof SHADOWS] ?? null;
  if (!s || typeof s !== 'object') return null;
  const c = cssColor(s.color) ?? 'color-mix(in srgb,var(--ink) 20%,transparent)';
  const n = (v: unknown, min: number, max: number) => `${num(v, min, max) ?? 0}px`;
  return `${s.inset ? 'inset ' : ''}${n(s.x, -200, 200)} ${n(s.y, -200, 200)} ${n(s.blur, 0, 300)} ${n(s.spread, -100, 100)} ${c}`;
}

const JUSTIFY = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between', around: 'space-around', evenly: 'space-evenly' } as const;
const ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch', baseline: 'baseline' } as const;
const FONTS = { display: 'var(--font-display)', body: 'var(--font-body)', mono: 'ui-monospace,SFMono-Regular,Menlo,monospace' } as const;

export interface CompileOptions {
  /** Media id → image URL for background images; unknown ids are left out. */
  image?: (id: string) => string | null;
}

/** The declarations for one set of properties, e.g. `padding-top:2rem;color:var(--accent)`. */
export function styleDeclarations(p: StyleProps | undefined, opts: CompileOptions = {}): string {
  if (!p || typeof p !== 'object') return '';
  const out: string[] = [];
  const add = (prop: string, v: string | number | null | undefined) => {
    if (v !== null && v !== undefined && v !== '') out.push(`${prop}:${v}`);
  };
  // A theme token set from itself (--accent:var(--accent)) is a cycle and would wipe the colour out.
  const addVar = (name: string, v: string | null) => {
    if (v && !v.includes(`var(${name})`)) add(name, v);
  };

  // layout
  const display = pick(p.display, ['block', 'flex', 'grid', 'none'] as const);
  add('display', display);
  if (display === 'grid' && num(p.columns, 1, 12)) add('grid-template-columns', `repeat(${num(p.columns, 1, 12)},minmax(0,1fr))`);
  add('flex-direction', pick(p.direction, ['row', 'column', 'row-reverse', 'column-reverse'] as const));
  if (typeof p.wrap === 'boolean') add('flex-wrap', p.wrap ? 'wrap' : 'nowrap');
  const justify = pick(p.justify, Object.keys(JUSTIFY) as (keyof typeof JUSTIFY)[]);
  if (justify) add('justify-content', JUSTIFY[justify]);
  const align = pick(p.align, Object.keys(ALIGN) as (keyof typeof ALIGN)[]);
  if (align) add('align-items', ALIGN[align]);
  add('gap', cssLength(p.gap));
  const vAlign = pick(p.vAlign, ['start', 'center', 'end'] as const);
  if (vAlign) {
    add('display', 'flex');
    add('flex-direction', 'column');
    add('justify-content', JUSTIFY[vAlign]);
  }
  const self = pick(p.alignSelf, ['auto', 'start', 'center', 'end', 'stretch'] as const);
  if (self) add('align-self', self === 'auto' ? 'auto' : ALIGN[self]);
  add('flex-grow', num(p.grow, 0, 10));
  add('order', num(p.order, -20, 20));
  if (num(p.span, 1, 12)) add('grid-column', `span ${num(p.span, 1, 12)}`);

  // spacing
  for (const [k, prop] of [
    ['mt', 'margin-top'],
    ['mr', 'margin-right'],
    ['mb', 'margin-bottom'],
    ['ml', 'margin-left'],
    ['pt', 'padding-top'],
    ['pr', 'padding-right'],
    ['pb', 'padding-bottom'],
    ['pl', 'padding-left'],
  ] as const)
    add(prop, cssLength(p[k]));

  // size
  for (const [k, prop] of [
    ['width', 'width'],
    ['minWidth', 'min-width'],
    ['maxWidth', 'max-width'],
    ['height', 'height'],
    ['minHeight', 'min-height'],
    ['maxHeight', 'max-height'],
  ] as const)
    add(prop, cssLength(p[k]));
  add('--max', cssLength(p.contentWidth));
  if (typeof p.aspect === 'string' && /^\d{1,4}\s*\/\s*\d{1,4}$/.test(p.aspect)) add('aspect-ratio', p.aspect.replace(/\s/g, ''));
  add('overflow', pick(p.overflow, ['visible', 'hidden', 'auto'] as const));
  add('object-fit', pick(p.fit, ['cover', 'contain', 'fill'] as const));

  // position
  add('position', pick(p.position, ['static', 'relative', 'absolute', 'sticky', 'fixed'] as const));
  for (const k of ['top', 'right', 'bottom', 'left'] as const) add(k, cssLength(p[k]));
  add('z-index', num(p.z, -10, 999));

  // typography
  const font = pick(p.font, ['display', 'body', 'mono'] as const);
  if (font) add('font-family', FONTS[font]);
  add('font-size', cssLength(p.fontSize));
  add('font-weight', num(p.weight, 100, 950));
  if (typeof p.lineHeight === 'string' && /^\d(?:\.\d{1,3})?$/.test(p.lineHeight)) add('line-height', p.lineHeight);
  else add('line-height', cssLength(p.lineHeight));
  add('letter-spacing', cssLength(p.tracking));
  add('text-align', pick(p.textAlign, ['left', 'center', 'right', 'justify'] as const));
  add('text-transform', pick(p.textTransform, ['none', 'uppercase', 'lowercase', 'capitalize'] as const));
  if (typeof p.italic === 'boolean') add('font-style', p.italic ? 'italic' : 'normal');
  if (typeof p.underline === 'boolean') add('text-decoration-line', p.underline ? 'underline' : 'none');
  const color = cssColor(p.color);
  if (color) {
    // Blocks and their parts read the theme's colours: overriding the tokens restyles everything inside.
    add('color', color);
    addVar('--ink', color);
    addVar('--ink-2', `color-mix(in srgb,${color} 72%,transparent)`);
  }
  addVar('--accent', cssColor(p.accent));

  // background: overlay over gradient over image, on top of the colour
  const bg = cssColor(p.bg);
  if (bg) {
    add('background-color', bg);
    addVar('--bg', bg);
  }
  const layers: string[] = [];
  const overlay = cssColor(p.overlay);
  if (overlay) layers.push(`linear-gradient(${overlay},${overlay})`);
  const grad = gradientCss(p.gradient);
  if (grad) layers.push(grad);
  const img = typeof p.bgImage === 'string' && /^[\w-]{1,64}$/.test(p.bgImage) ? opts.image?.(p.bgImage) : null;
  if (img && /^[\w/.:-]+$/.test(img)) layers.push(`url("${img}")`);
  if (layers.length) {
    add('background-image', layers.join(','));
    if (img) {
      add('background-size', pick(p.bgSize, ['cover', 'contain', 'auto'] as const) ?? 'cover');
      add('background-position', typeof p.bgPosition === 'string' && /^(?:(?:\d{1,3}%|center|top|bottom|left|right)\s?){1,2}$/.test(p.bgPosition) ? p.bgPosition : 'center');
      add('background-repeat', p.bgRepeat ? 'repeat' : 'no-repeat');
      if (p.bgFixed) add('background-attachment', 'fixed');
    }
  }

  // border
  add('border-width', cssLength(p.borderWidth));
  add('border-style', pick(p.borderStyle, ['solid', 'dashed', 'dotted', 'none'] as const) ?? (cssLength(p.borderWidth) ? 'solid' : null));
  add('border-color', cssColor(p.borderColor));
  add('border-radius', cssLength(p.radius));
  add('border-top-left-radius', cssLength(p.radiusTL));
  add('border-top-right-radius', cssLength(p.radiusTR));
  add('border-bottom-right-radius', cssLength(p.radiusBR));
  add('border-bottom-left-radius', cssLength(p.radiusBL));

  // effects
  add('box-shadow', shadowCss(p.shadow));
  const opacity = num(p.opacity, 0, 100);
  if (opacity !== null) add('opacity', opacity / 100);
  const blur = cssLength(p.blur);
  if (blur) add('filter', `blur(${blur})`);
  const backdrop = cssLength(p.backdrop);
  if (backdrop) add('backdrop-filter', `blur(${backdrop})`);
  const tf: string[] = [];
  const x = cssLength(p.x);
  const y = cssLength(p.y);
  if (x || y) tf.push(`translate(${x ?? 0},${y ?? 0})`);
  if (num(p.rotate, -360, 360)) tf.push(`rotate(${num(p.rotate, -360, 360)}deg)`);
  if (num(p.scale, 0, 5) !== null && p.scale !== 1) tf.push(`scale(${num(p.scale, 0, 5)})`);
  if (tf.length) add('transform', tf.join(' '));
  add('cursor', pick(p.cursor, ['auto', 'pointer', 'default'] as const));

  return out.join(';');
}

/**
 * Scoped CSS for `selector`. `forceHover` adds a class that shows the hover
 * look without the mouse (the editor uses it while hover is being designed).
 */
export function designCss(selector: string, d: Design | undefined, opts: CompileOptions & { forceHover?: string } = {}): string {
  if (!d || typeof d !== 'object') return '';
  const out: string[] = [];
  const base = styleDeclarations(d.desktop, opts);
  const hover = styleDeclarations(d.hover, opts);
  const ms = num(d.transition, 0, 3000) ?? 250;
  const transition = hover ? `transition:color ${ms}ms,background-color ${ms}ms,border-color ${ms}ms,box-shadow ${ms}ms,transform ${ms}ms,opacity ${ms}ms,filter ${ms}ms` : '';
  if (base || transition) out.push(`${selector}{${[base, transition].filter(Boolean).join(';')}}`);
  for (const bp of ['tablet', 'mobile'] as const) {
    const decl = styleDeclarations(d[bp], opts);
    if (decl) out.push(`@media ${BP_MEDIA[bp]}{${selector}{${decl}}}`);
  }
  if (hover) {
    out.push(`@media (hover:hover){${selector}:hover{${hover}}}`);
    if (opts.forceHover) out.push(`${selector}.${opts.forceHover}{${hover}}`);
  }
  return out.join('');
}

/** The id a block's section carries in the page – its anchor if that is a valid id. */
export const blockDomId = (b: { id: string; style?: { anchor?: string } }) => (b.style?.anchor && /^[A-Za-z][\w-]{0,63}$/.test(b.style.anchor) ? b.style.anchor : `b-${b.id}`);

/** Everything a block's style element holds: its design and the timing of its animation. */
export function blockCss(selector: string, style: { design?: Design; motion?: Motion } | undefined, opts: CompileOptions & { forceHover?: string } = {}): string {
  const vars = motionVars(style?.motion);
  return designCss(selector, style?.design, opts) + (vars ? `${selector}{${vars}}` : '');
}

/** Media ids used as background images (so the renderer can look them up first). */
export function designImages(d: Design | undefined): string[] {
  if (!d) return [];
  return [d.desktop, d.tablet, d.mobile, d.hover].map((p) => p?.bgImage).filter((x): x is string => typeof x === 'string' && x.length > 0);
}

/** The value in effect at a breakpoint: phone falls back to tablet, tablet to desktop. */
export function effective<K extends keyof StyleProps>(d: Design | undefined, bp: DesignBp, key: K): { value: StyleProps[K] | undefined; from: DesignBp | null } {
  const chain: DesignBp[] = bp === 'mobile' ? ['mobile', 'tablet', 'desktop'] : bp === 'tablet' ? ['tablet', 'desktop'] : ['desktop'];
  for (const b of chain) {
    const v = d?.[b]?.[key];
    if (v !== undefined) return { value: v, from: b };
  }
  return { value: undefined, from: null };
}

/** Sets (or with `undefined` removes) one property; empty layers disappear. */
export function setDesign<K extends keyof StyleProps>(d: Design | undefined, layer: DesignBp | 'hover', key: K, value: StyleProps[K] | undefined): Design {
  const next: Design = { ...(d ?? {}) };
  const props: StyleProps = { ...(next[layer] ?? {}) };
  if (value === undefined || value === '' || value === null) delete props[key];
  else props[key] = value;
  if (Object.keys(props).length) next[layer] = props;
  else delete next[layer];
  return next;
}

export const isEmptyDesign = (d: Design | undefined) => !d || (DESIGN_BPS.every((b) => !d[b] || !Object.keys(d[b]!).length) && (!d.hover || !Object.keys(d.hover).length));

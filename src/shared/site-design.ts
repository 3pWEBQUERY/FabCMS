/**
 * «Eigene Designs» – like Bricks' theme styles: a whole look of the website
 * built from scratch, next to the curated styles. Several can be kept; one is
 * active, the others are drafts that can be previewed with the real pages
 * before going live.
 */

export const DESIGN_BASES = ['neutral', 'kante', 'bistro', 'salon', 'feuilleton'] as const;
export type DesignBase = (typeof DESIGN_BASES)[number];

export interface DesignColors {
  bg: string;
  surface: string;
  ink: string;
  ink2: string;
  line: string;
  accent: string;
  accentInk: string;
  /** Inverted sections. */
  invBg: string;
  invInk: string;
  invInk2: string;
  invLine: string;
  dark: boolean;
}

export interface SiteDesign {
  id: string;
  name: string;
  /** The theme its rules come from – «neutral» brings none of its own. */
  base: DesignBase;
  colors: DesignColors;
  fonts: { display: string; body: string };
  type: {
    /** Body text in px on wide screens (phones a little smaller). */
    base: number;
    /** Step from one size to the next (1.125 small differences … 1.414 dramatic). */
    ratio: number;
    headingWeight: number;
    /** em, e.g. -0.02 */
    headingTracking: number;
    headingLeading: number;
    headingCase: 'none' | 'uppercase';
    headingItalic: boolean;
    bodyLeading: number;
  };
  buttons: {
    shape: 'square' | 'rounded' | 'pill';
    style: 'solid' | 'outline';
    case: 'none' | 'uppercase';
    weight: number;
    size: 's' | 'm' | 'l';
  };
  links: { underline: 'always' | 'hover' };
  layout: {
    /** Widest content in rem. */
    max: number;
    /** Space between sections: 0.7 … 1.4 */
    rhythm: number;
    /** Corners of pictures, cards and fields in px. */
    radius: number;
  };
  updatedAt?: string;
}

export const MAX_DESIGNS = 12;

const HEX = /^#[0-9a-f]{6}$/i;
const num = (v: unknown, min: number, max: number, fallback: number, step = 0) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  return step ? Number((Math.round(n / step) * step).toFixed(4)) : n;
};
const one = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => ((list as readonly string[]).includes(String(v)) ? (v as T) : fallback);
const color = (v: unknown, fallback: string) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : fallback);

/** A fresh start: quiet, light, readable – everything still to be decided. */
export const BLANK_COLORS: DesignColors = {
  bg: '#ffffff',
  surface: '#f3f3f1',
  ink: '#16161a',
  ink2: '#5b5b63',
  line: '#e2e2de',
  accent: '#2f5bd8',
  accentInk: '#ffffff',
  invBg: '#16161a',
  invInk: '#f6f6f4',
  invInk2: '#b4b4bb',
  invLine: '#34343b',
  dark: false,
};

export function blankDesign(id: string, name: string): SiteDesign {
  return {
    id,
    name,
    base: 'neutral',
    colors: { ...BLANK_COLORS },
    fonts: { display: 'instrument-sans', body: 'instrument-sans' },
    type: { base: 17, ratio: 1.25, headingWeight: 600, headingTracking: -0.02, headingLeading: 1.1, headingCase: 'none', headingItalic: false, bodyLeading: 1.6 },
    buttons: { shape: 'rounded', style: 'solid', case: 'none', weight: 600, size: 'm' },
    links: { underline: 'always' },
    layout: { max: 76, rhythm: 1, radius: 8 },
  };
}

/** Only what makes sense; fonts only from the website's own (`fonts`). */
export function cleanDesign(input: unknown, fonts: readonly string[]): SiteDesign | null {
  if (!input || typeof input !== 'object') return null;
  const x = input as Record<string, unknown>;
  const id = typeof x.id === 'string' && /^[a-z0-9-]{1,24}$/.test(x.id) ? x.id : null;
  if (!id) return null;
  const blank = blankDesign(id, '');
  const c = (x.colors ?? {}) as Record<string, unknown>;
  const t = (x.type ?? {}) as Record<string, unknown>;
  const b = (x.buttons ?? {}) as Record<string, unknown>;
  const l = (x.layout ?? {}) as Record<string, unknown>;
  const f = (x.fonts ?? {}) as Record<string, unknown>;
  const font = (v: unknown, fallback: string) => (typeof v === 'string' && fonts.includes(v) ? v : fonts.includes(fallback) ? fallback : (fonts[0] ?? fallback));
  return {
    id,
    name: (typeof x.name === 'string' ? x.name.replace(/[<>]/g, '').trim().slice(0, 60) : '') || 'Eigenes Design',
    base: one(x.base, DESIGN_BASES, 'neutral'),
    colors: {
      ...(Object.fromEntries((Object.keys(BLANK_COLORS) as (keyof DesignColors)[]).filter((k) => k !== 'dark').map((k) => [k, color(c[k], BLANK_COLORS[k] as string)])) as Omit<
        DesignColors,
        'dark'
      >),
      dark: c.dark === true,
    },
    fonts: { display: font(f.display, blank.fonts.display), body: font(f.body, blank.fonts.body) },
    type: {
      base: num(t.base, 14, 22, 17, 0.5),
      ratio: num(t.ratio, 1.1, 1.5, 1.25, 0.005),
      headingWeight: num(t.headingWeight, 300, 900, 600, 100),
      headingTracking: num(t.headingTracking, -0.08, 0.2, -0.02, 0.005),
      headingLeading: num(t.headingLeading, 0.85, 1.5, 1.1, 0.05),
      headingCase: one(t.headingCase, ['none', 'uppercase'] as const, 'none'),
      headingItalic: t.headingItalic === true,
      bodyLeading: num(t.bodyLeading, 1.2, 2, 1.6, 0.05),
    },
    buttons: {
      shape: one(b.shape, ['square', 'rounded', 'pill'] as const, 'rounded'),
      style: one(b.style, ['solid', 'outline'] as const, 'solid'),
      case: one(b.case, ['none', 'uppercase'] as const, 'none'),
      weight: num(b.weight, 400, 800, 600, 100),
      size: one(b.size, ['s', 'm', 'l'] as const, 'm'),
    },
    links: { underline: one((x.links as Record<string, unknown> | undefined)?.underline, ['always', 'hover'] as const, 'always') },
    layout: { max: num(l.max, 48, 110, 76, 1), rhythm: num(l.rhythm, 0.6, 1.6, 1, 0.05), radius: num(l.radius, 0, 40, 8, 1) },
    ...(typeof x.updatedAt === 'string' && !Number.isNaN(Date.parse(x.updatedAt)) ? { updatedAt: new Date(x.updatedAt).toISOString() } : {}),
  };
}

export function cleanDesigns(input: unknown, fonts: readonly string[]): SiteDesign[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: SiteDesign[] = [];
  for (const raw of input) {
    const d = cleanDesign(raw, fonts);
    if (!d || seen.has(d.id)) continue;
    seen.add(d.id);
    out.push(d);
    if (out.length >= MAX_DESIGNS) break;
  }
  return out;
}

/** The design in use: the active one if it still exists. */
export function activeDesign(s: { designs?: SiteDesign[]; activeDesign?: string | null }): SiteDesign | null {
  return (s.activeDesign && s.designs?.find((d) => d.id === s.activeDesign)) || null;
}

/** A short fingerprint of what a design looks like – for caches of pictures made from it (OG images). */
export function designKey(d: SiteDesign): string {
  const text = JSON.stringify([d.colors, d.fonts, d.type.headingItalic]);
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return `own-${d.id}-${(h >>> 0).toString(36)}`;
}

/** Fluid type steps from a base size and ratio: phones a little tighter, wide screens as chosen. */
export function designScale(basePx: number, ratio: number): string {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  const fluid = (min: number, max: number, minVw = 22, maxVw = 80) => {
    const slope = (max - min) / (maxVw - minVw);
    return `clamp(${r(min)}rem, ${r(min - slope * minVw)}rem + ${r(slope * 100)}vw, ${r(max)}rem)`;
  };
  const base = basePx / 16;
  const phoneRatio = 1 + (ratio - 1) * 0.8;
  const out: string[] = [];
  for (let i = -2; i <= 8; i++) out.push(`--step-${i < 0 ? `n${-i}` : i}:${fluid(base * 0.94 * Math.pow(phoneRatio, i), base * Math.pow(ratio, i))}`);
  return out.join(';');
}

const BTN_RADIUS = { square: '2px', rounded: '10px', pill: '999px' } as const;
const BTN_PAD = { s: '.55em 1.05em', m: '.75em 1.4em', l: '.95em 1.8em' } as const;
const BTN_SIZE = { s: 'var(--step-n1)', m: 'var(--step-0)', l: 'var(--step-1)' } as const;

/** The design's own tokens and rules, laid over its base theme. */
export function siteDesignCss(d: SiteDesign): string {
  const t = d.type;
  const b = d.buttons;
  const tokens = [
    designScale(t.base, t.ratio),
    `--display-weight:${t.headingWeight}`,
    `--display-tracking:${t.headingTracking}em`,
    `--display-leading:${t.headingLeading}`,
    `--btn-radius:${BTN_RADIUS[b.shape]}`,
    `--btn-pad:${BTN_PAD[b.size]}`,
    `--btn-size:${BTN_SIZE[b.size]}`,
    `--btn-weight:${b.weight}`,
    `--btn-case:${b.case}`,
    `--btn-tracking:${b.case === 'uppercase' ? '.08em' : '0'}`,
    `--btn-font:var(--font-body)`,
    ...(b.style === 'solid'
      ? ['--btn-bg:var(--accent)', '--btn-ink:var(--accent-ink)', '--btn-border:0']
      : ['--btn-bg:transparent', '--btn-ink:var(--accent)', '--btn-border:1.5px solid var(--accent)']),
    `--radius:${d.layout.radius}px`,
    `--field-radius:${Math.min(12, d.layout.radius)}px`,
    `--chip-radius:${Math.min(999, d.layout.radius * 2)}px`,
  ];
  const rules = [
    `:root{${tokens.join(';')}}`,
    `body{line-height:${d.type.bodyLeading}}`,
    `h1,h2,h3,h4{text-transform:${t.headingCase};font-style:${t.headingItalic ? 'italic' : 'normal'}}`,
    `.btn{border-radius:var(--btn-radius)}`,
    ...(d.links.underline === 'hover'
      ? [
          '.prose a,.el-text a{text-decoration-color:transparent}',
          '.prose a:hover,.el-text a:hover,.prose a:focus-visible,.el-text a:focus-visible{text-decoration-color:currentColor}',
        ]
      : []),
  ];
  return rules.join('\n');
}

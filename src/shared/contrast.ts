/**
 * Contrast of text against what is behind it, as WCAG 2.2 measures it
 * (1.4.3): normal text needs 4.5:1, large text 3:1. Large is 24px, or
 * 18.66px (14pt) when bold.
 */

/** sRGB 0–255 with alpha 0–1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** One place on a page where text is hard to read, as the editor shows it. */
export interface ContrastIssue {
  block: string;
  /** Free-layout elements around the text, nearest first. */
  els: string[];
  text: string;
  ratio: number;
  need: number;
  fg: string;
  bg: string;
  /** A text colour that reaches the needed contrast, or null when none does. */
  fix: string | null;
  /** The colour comes from the block or element itself, so setting its text colour helps. */
  own: boolean;
  /** Text in the site's header or footer (then `block` is empty): its colours come from the site design. */
  global?: 'header' | 'footer';
  /** Measured with the designed hover look on. */
  hover?: boolean;
}

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export const luminance = (c: Rgba) => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);

export function contrastRatio(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** A colour with transparency laid over an opaque one. */
export function composite(top: Rgba, below: Rgba): Rgba {
  const a = top.a;
  return { r: top.r * a + below.r * (1 - a), g: top.g * a + below.g * (1 - a), b: top.b * a + below.b * (1 - a), a: 1 };
}

export const needFor = (sizePx: number, weight: number) => (sizePx >= 24 || (sizePx >= 18.66 && weight >= 700) ? 3 : 4.5);

/** Rounded down to one decimal, so «4.5» is never shown for 4.47. */
export const formatRatio = (r: number) => (Math.floor(r * 10) / 10).toFixed(1);

export function toHex(c: Rgba): string {
  return (
    '#' +
    [c.r, c.g, c.b]
      .map((v) =>
        Math.round(Math.min(255, Math.max(0, v)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

export function parseHex(hex: string): Rgba | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1];
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
}

/**
 * The text colour closest to `fg` that reaches `need` on `bg`: the same hue,
 * moved towards black or white – whichever needs the smaller step. The
 * colour's own transparency is kept, so muted text stays muted.
 */
export function fixColor(fg: Rgba, bg: Rgba, need: number): string | null {
  const towards = (end: number) => {
    const at = (t: number): Rgba => ({ r: fg.r + (end - fg.r) * t, g: fg.g + (end - fg.g) * t, b: fg.b + (end - fg.b) * t, a: fg.a });
    // A little above the limit, so rounding to whole numbers can't drop below it.
    const passes = (t: number) => contrastRatio(composite(at(t), bg), bg) >= need + 0.05;
    if (!passes(1)) return null;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (passes(mid)) hi = mid;
      else lo = mid;
    }
    return { t: hi, color: at(hi) };
  };
  const options = [towards(0), towards(255)].filter((x): x is { t: number; color: Rgba } => Boolean(x));
  if (!options.length) return null;
  options.sort((a, b) => a.t - b.t);
  return toHex(options[0].color);
}

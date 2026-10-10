import { join } from 'node:path';

/**
 * Fonts are self-hosted from the @fontsource packages. Loading them from
 * Google's CDN would transfer visitor IPs to Google (LG München, 2022).
 */

const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

interface FontSource {
  family: string;
  stack: string;
  pkg: string;
  /** File name prefix inside the package, e.g. "fraunces". */
  base: string;
  /** Axis part of the variable file name ("wght", "soft") or a static weight ("400"). */
  axis: string;
  /** The files live in the repository's fonts/ folder instead of the package (scripts/instance-fonts.py). */
  local?: boolean;
  weight: string;
  italic: boolean;
}

export const FONTS: Record<string, FontSource> = {
  'instrument-sans': {
    family: 'Instrument Sans',
    stack: "'Instrument Sans', ui-sans-serif, system-ui, sans-serif",
    pkg: '@fontsource-variable/instrument-sans',
    base: 'instrument-sans',
    axis: 'wght',
    weight: '400 700',
    italic: true,
  },
  'instrument-serif': {
    family: 'Instrument Serif',
    stack: "'Instrument Serif', ui-serif, Georgia, serif",
    pkg: '@fontsource/instrument-serif',
    base: 'instrument-serif',
    axis: '400',
    weight: '400',
    italic: true,
  },
  fraunces: {
    family: 'Fraunces',
    stack: "'Fraunces', ui-serif, Georgia, serif",
    pkg: '@fontsource-variable/fraunces',
    base: 'fraunces',
    // Fixed at SOFT 100, the only value Bistro uses: 37 instead of 62 KB for the LCP heading.
    axis: 'soft100',
    local: true,
    weight: '100 900',
    italic: true,
  },
  'hanken-grotesk': {
    family: 'Hanken Grotesk',
    stack: "'Hanken Grotesk', ui-sans-serif, system-ui, sans-serif",
    pkg: '@fontsource-variable/hanken-grotesk',
    base: 'hanken-grotesk',
    axis: 'wght',
    weight: '100 900',
    italic: true,
  },
  'bodoni-moda': {
    family: 'Bodoni Moda',
    stack: "'Bodoni Moda', 'Didot', ui-serif, serif",
    pkg: '@fontsource-variable/bodoni-moda',
    base: 'bodoni-moda',
    axis: 'wght',
    weight: '400 900',
    italic: true,
  },
  newsreader: {
    family: 'Newsreader',
    stack: "'Newsreader', ui-serif, Georgia, serif",
    pkg: '@fontsource-variable/newsreader',
    base: 'newsreader',
    axis: 'wght',
    weight: '200 800',
    italic: true,
  },
};

export interface FontPair {
  id: string;
  label: string;
  display: keyof typeof FONTS;
  body: keyof typeof FONTS;
}

export const FONT_PAIRS: FontPair[] = [
  { id: 'kante', label: 'Instrument Sans', display: 'instrument-sans', body: 'instrument-sans' },
  { id: 'bistro', label: 'Fraunces & Hanken Grotesk', display: 'fraunces', body: 'hanken-grotesk' },
  { id: 'salon', label: 'Bodoni Moda & Instrument Sans', display: 'bodoni-moda', body: 'instrument-sans' },
  { id: 'feuilleton', label: 'Newsreader', display: 'newsreader', body: 'newsreader' },
  { id: 'atelier', label: 'Instrument Serif & Instrument Sans', display: 'instrument-serif', body: 'instrument-sans' },
  { id: 'werkstatt', label: 'Hanken Grotesk', display: 'hanken-grotesk', body: 'hanken-grotesk' },
];

export function fontFile(f: FontSource, subset: 'latin' | 'latin-ext', style: 'normal' | 'italic') {
  return `${f.base}-${subset}-${f.axis}-${style}.woff2`;
}

/** Whitelist of servable font files → absolute package path. */
export const FONT_FILES: Map<string, string> = new Map(
  Object.values(FONTS).flatMap((f) =>
    (['latin', 'latin-ext'] as const).flatMap((subset) =>
      (f.italic ? (['normal', 'italic'] as const) : (['normal'] as const)).map((style) => {
        const file = fontFile(f, subset, style);
        return [file, f.local ? join(process.cwd(), 'fonts', file) : `${f.pkg}/files/${file}`] as [string, string];
      }),
    ),
  ),
);

export function fontFaces(keys: string[]): string {
  const out: string[] = [];
  for (const key of [...new Set(keys)]) {
    const f = FONTS[key];
    if (!f) continue;
    for (const style of f.italic ? ['normal', 'italic'] : ['normal']) {
      for (const [subset, range] of [
        ['latin', LATIN],
        ['latin-ext', LATIN_EXT],
      ] as const) {
        out.push(
          `@font-face{font-family:'${f.family}';font-style:${style};font-display:swap;font-weight:${f.weight};src:url(/_nova/fonts/${fontFile(f, subset, style as 'normal')}) format('woff2');unicode-range:${range}}`,
        );
      }
    }
  }
  return out.join('');
}

export function fontPreload(key: string, style: 'normal' | 'italic' = 'normal'): string {
  const f = FONTS[key];
  if (!f || (style === 'italic' && !f.italic)) return '';
  return `/_nova/fonts/${fontFile(f, 'latin', style)}`;
}

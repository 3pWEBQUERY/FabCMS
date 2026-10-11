/**
 * Own fonts: files uploaded to the media library (WOFF2, WOFF, TTF, OTF),
 * grouped into families with their cuts – weight and italic – and chosen in
 * an own design like the fonts that come with Nova.
 */

export const FONT_FORMATS = ['woff2', 'woff', 'truetype', 'opentype'] as const;
export type FontFormat = (typeof FONT_FORMATS)[number];

export interface CustomFontFace {
  /** Media id of the file. */
  media: string;
  /** Its file name – part of the address it is served at. */
  file: string;
  format: FontFormat;
  /** «400», or a range for variable fonts: «100 900». */
  weight: string;
  style: 'normal' | 'italic';
}

export interface CustomFont {
  /** «cf-…» – how designs refer to it. */
  id: string;
  family: string;
  /** What stands in while it loads, or where it can't. */
  fallback: 'sans' | 'serif' | 'mono';
  faces: CustomFontFace[];
}

export const MAX_CUSTOM_FONTS = 10;
export const MAX_FONT_FACES = 12;
export const FONT_FILE_EXT = /\.(woff2|woff|ttf|otf)$/i;

export const FALLBACK_STACKS: Record<CustomFont['fallback'], string> = {
  sans: 'ui-sans-serif, system-ui, sans-serif',
  serif: 'ui-serif, Georgia, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

const MEDIA_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WEIGHT = /^[1-9]00( [1-9]00)?$/;

/** The format a file name says it is in. */
export function fontFormatOf(file: string): FontFormat | null {
  const ext = FONT_FILE_EXT.exec(file)?.[1].toLowerCase();
  return ext === 'woff2' ? 'woff2' : ext === 'woff' ? 'woff' : ext === 'ttf' ? 'truetype' : ext === 'otf' ? 'opentype' : null;
}

const WEIGHT_WORDS: [RegExp, number][] = [
  [/(extra|ultra)[\s_-]?light/, 200],
  [/(semi|demi)[\s_-]?bold/, 600],
  [/(extra|ultra)[\s_-]?bold/, 800],
  [/hairline|thin/, 100],
  [/light/, 300],
  [/medium/, 500],
  [/bold/, 700],
  [/black|heavy/, 900],
  [/regular|normal|book|roman/, 400],
];

/**
 * What a file name tells about its cut: «Inter-SemiBoldItalic.woff2» is
 * Inter, 600, italic; «Fraunces[wght].ttf» or «…-Variable» covers all weights.
 */
export function guessFace(file: string): { family: string; weight: string; style: CustomFontFace['style'] } {
  const name = file.replace(FONT_FILE_EXT, '');
  const low = name.toLowerCase();
  // «[wght]» – or «_wght_» once the brackets are gone from the stored file name.
  const variable = /\[[^\]]*wght[^\]]*\]|[-_ ]wght(?![a-z])|variable|[-_ ]vf(?![a-z])/.test(low);
  const style = /italic|oblique|[-_]it\b/.test(low) ? 'italic' : 'normal';
  const weight = variable ? '100 900' : String(WEIGHT_WORDS.find(([re]) => re.test(low))?.[1] ?? 400);
  const family =
    name
      .replace(/\[[^\]]*\]/g, '')
      // CamelCase cut names glued to the family: «InterBold» → «Inter Bold».
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[-_]+/g, ' ')
      .replace(
        /\b(variable|vf|wght|italic|oblique|it|regular|normal|book|roman|hairline|thin|extra|ultra|semi|demi|light|medium|bold|black|heavy|web|webfont|latin|subset)\b/gi,
        ' ',
      )
      .replace(/\b\d{3}\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'Eigene Schrift';
  return { family: cleanFamily(family), weight, style };
}

/** A family name that is safe inside CSS quotes. */
export const cleanFamily = (v: unknown) =>
  (typeof v === 'string' ? v : '')
    .replace(/[^\p{L}\p{N} .-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);

export const customFontId = (family: string) =>
  `cf-${
    family
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20) || 'schrift'
  }`;

export function cleanCustomFonts(input: unknown): CustomFont[] {
  if (!Array.isArray(input)) return [];
  const out: CustomFont[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const x = raw as Record<string, unknown>;
    const id = typeof x.id === 'string' && /^cf-[a-z0-9-]{1,24}$/.test(x.id) ? x.id : null;
    const family = cleanFamily(x.family);
    if (!id || !family || out.some((f) => f.id === id)) continue;
    const faces: CustomFontFace[] = [];
    for (const f of Array.isArray(x.faces) ? x.faces : []) {
      if (!f || typeof f !== 'object') continue;
      const face = f as Record<string, unknown>;
      const file = typeof face.file === 'string' ? face.file.replace(/[/\\]/g, '').slice(0, 120) : '';
      const format = fontFormatOf(file);
      if (typeof face.media !== 'string' || !MEDIA_ID.test(face.media) || !format) continue;
      faces.push({
        media: face.media.toLowerCase(),
        file,
        format,
        weight: typeof face.weight === 'string' && WEIGHT.test(face.weight) ? face.weight : '400',
        style: face.style === 'italic' ? 'italic' : 'normal',
      });
      if (faces.length >= MAX_FONT_FACES) break;
    }
    out.push({ id, family, fallback: x.fallback === 'serif' || x.fallback === 'mono' ? x.fallback : 'sans', faces });
    if (out.length >= MAX_CUSTOM_FONTS) break;
  }
  return out;
}

/** The CSS font stack of an own font. */
export const customFontStack = (f: CustomFont) => `'${f.family}', ${FALLBACK_STACKS[f.fallback]}`;

/** The address a cut is served at (the media library's original file). */
export const fontFaceUrl = (face: CustomFontFace) => `/media/${face.media}/file/${encodeURIComponent(face.file)}`;

/** @font-face rules for the own fonts in use. */
export function customFontFaces(fonts: CustomFont[], used: string[]): string {
  return fonts
    .filter((f) => used.includes(f.id))
    .flatMap((f) =>
      f.faces.map(
        (face) =>
          `@font-face{font-family:'${f.family}';src:url('${fontFaceUrl(face)}') format('${face.format}');font-weight:${face.weight};font-style:${face.style};font-display:swap}`,
      ),
    )
    .join('\n');
}

/**
 * Saved styles: a design with a name, kept with the site settings and used
 * by any number of blocks and elements. They carry the class `st-<id>`; the
 * style's rules come first and weigh less than an id, so whatever a block or
 * element sets itself still wins. Change the style, and every place using it
 * changes with it.
 */

import { blockCss, designCss, designImages, type CompileOptions, type Design } from './design';
import { elementsCss, variantsCss, walkEls, type El, type Variant } from './elements';
import type { Block } from './types';

export interface SavedStyle {
  id: string;
  name: string;
  design: Design;
}

export const STYLE_ID = /^[a-z0-9]{6,12}$/;
export const MAX_STYLES = 100;

/** Saved styles as sent by the editor: names trimmed and unique, ids checked, designs kept small. */
export function cleanStyles(input: unknown): SavedStyle[] {
  if (!Array.isArray(input)) return [];
  const out: SavedStyle[] = [];
  const names = new Set<string>();
  for (const s of input) {
    if (!s || typeof s !== 'object') continue;
    const { id, name, design } = s as Record<string, unknown>;
    const label = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
    if (typeof id !== 'string' || !STYLE_ID.test(id) || !label || names.has(label.toLowerCase()) || out.some((x) => x.id === id)) continue;
    if (!design || typeof design !== 'object' || Array.isArray(design) || JSON.stringify(design).length > 20_000) continue;
    names.add(label.toLowerCase());
    out.push({ id, name: label, design: design as Design });
    if (out.length >= MAX_STYLES) break;
  }
  return out;
}

/** The style a block or element uses, if it is a valid id. */
export const styleOf = (use: unknown): string | null => (typeof use === 'string' && STYLE_ID.test(use) ? use : null);

/** Every style a block uses – itself, its elements and variants. */
export function stylesUsed(b: Block): string[] {
  const out = new Set<string>();
  const own = styleOf(b.style?.use);
  if (own) out.add(own);
  if (b.type === 'layout') walkEls((b.props.els as El[] | undefined) ?? [], (el) => void (styleOf(el.use) && out.add(el.use!)));
  return [...out];
}

/** The rules of these styles. Two classes outweigh the theme's single ones; ids (own design) still win. */
export function savedStylesCss(ids: Iterable<string>, styles: SavedStyle[], opts: CompileOptions & { forceHover?: string } = {}): string {
  const out: string[] = [];
  for (const id of new Set(ids)) {
    const s = styles.find((x) => x.id === id);
    if (s) out.push(designCss(`.st-${s.id}.st-${s.id}`, s.design, opts));
  }
  return out.join('');
}

/** Background images the used styles need. */
export function savedStyleImages(ids: Iterable<string>, styles: SavedStyle[]): string[] {
  const want = new Set(ids);
  return styles.filter((s) => want.has(s.id)).flatMap((s) => designImages(s.design));
}

/**
 * Everything a block's style element holds: the saved styles it uses, then
 * its own design, its elements and variants. The editor builds the same
 * string while someone designs, before the server answers.
 */
export function blockLookCss(selector: string, b: Block, styles: SavedStyle[], opts: CompileOptions & { forceHover?: string } = {}): string {
  const s = b.style ?? {};
  const layout = b.type === 'layout';
  return (
    savedStylesCss(stylesUsed(b), styles, opts) +
    blockCss(selector, s, opts) +
    (layout ? elementsCss((b.props.els as El[] | undefined) ?? [], opts) + variantsCss(b.props.variants as Variant[] | undefined, opts) : '')
  );
}

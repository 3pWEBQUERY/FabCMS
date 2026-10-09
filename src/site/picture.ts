import { html, type Html } from './html';
import type { MediaItem } from '../shared/types';
import { effectiveSize, VARIANT_WIDTHS } from '../server/media';

export interface PictureOptions {
  /** CSS sizes attribute. */
  sizes?: string;
  /** Largest width that makes sense for this slot. */
  maxWidth?: number;
  alt?: string;
  className?: string;
  /** Above the fold: eager + high priority (LCP). */
  priority?: boolean;
  /** Forces a crop via CSS aspect-ratio, respecting the focus point. */
  ratio?: string;
}

export const variantUrl = (m: Pick<MediaItem, 'id' | 'version'>, width: number, format: 'avif' | 'webp' | 'jpg') =>
  `/media/${m.id}/v${m.version}/${width}.${format}`;

export function originalUrl(m: Pick<MediaItem, 'id' | 'filename'>) {
  return `/media/${m.id}/file/${encodeURIComponent(m.filename)}`;
}

/**
 * While the image loads, its box shows the main colour with a blurred 24 px
 * preview on top (an SVG blur, so it looks soft instead of blocky). Opaque
 * images cover it completely once they arrive; no JavaScript involved.
 */
function placeholder(m: MediaItem, pos: string): string {
  if (!m.color) return '';
  if (!m.lqip) return `;background:${m.color}`;
  const { width, height } = effectiveSize(m);
  const h = Math.max(1, Math.round((24 * height) / width));
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 ${h}'><filter id='b' color-interpolation-filters='sRGB'><feGaussianBlur stdDeviation='1.6'/><feComponentTransfer><feFuncA type='discrete' tableValues='1 1'/></feComponentTransfer></filter><image width='24' height='${h}' preserveAspectRatio='none' filter='url(#b)' href='data:image/webp;base64,${m.lqip}'/></svg>`;
  return `;background:${m.color} url("data:image/svg+xml,${encodeURIComponent(svg)}") ${pos}/cover no-repeat`;
}

export function picture(m: MediaItem | null, o: PictureOptions = {}): Html {
  if (!m) return html``;
  if (!m.mime.startsWith('image/')) return html``;
  const { width, height } = effectiveSize(m);
  const max = Math.min(o.maxWidth ?? 2560, width);
  const widths = VARIANT_WIDTHS.filter((w) => w <= max);
  if (!widths.length || widths[widths.length - 1] < max) widths.push(VARIANT_WIDTHS.find((w) => w >= max) ?? 2560);
  const set = (fmt: 'avif' | 'webp' | 'jpg') => widths.map((w) => `${variantUrl(m, w, fmt)} ${Math.min(w, width)}w`).join(', ');
  const sizes = o.sizes ?? '100vw';
  const fallbackW = widths.find((w) => w >= 960) ?? widths[widths.length - 1];
  const pos = `${Math.round((m.focus?.x ?? 0.5) * 100)}% ${Math.round((m.focus?.y ?? 0.5) * 100)}%`;
  const style = `object-position:${pos}${o.ratio ? `;aspect-ratio:${o.ratio};object-fit:cover;width:100%;height:auto` : ''}${placeholder(m, pos)}`;
  return html`<picture class="${o.className ?? ''}"><source type="image/avif" srcset="${set('avif')}" sizes="${sizes}"><source type="image/webp" srcset="${set('webp')}" sizes="${sizes}"><img src="${variantUrl(m, fallbackW, 'jpg')}" srcset="${set('jpg')}" sizes="${sizes}" width="${width}" height="${height}" alt="${o.alt ?? m.alt ?? ''}" style="${style}" ${o.priority ? html`fetchpriority="high" loading="eager"` : html`loading="lazy"`} decoding="async"></picture>`;
}

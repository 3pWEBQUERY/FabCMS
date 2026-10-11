/**
 * Moving backgrounds of a section: a muted video in a loop, or a slideshow of
 * pictures that fade into each other (optionally slowly zooming, «Ken Burns»).
 * They sit behind the content and under the overlay colour; visitors who ask
 * for less motion see the first picture or the video's poster, standing still.
 */

export type BgMedia =
  /** `phones`: also play on narrow screens – otherwise they get the poster (saves their data). */
  { kind: 'video'; video: string; poster?: string; phones?: boolean } | { kind: 'slides'; images: string[]; effect: 'fade' | 'kenburns'; seconds: number };

export const MAX_SLIDES = 8;
export const SLIDE_SECONDS = { min: 3, max: 20, default: 6 } as const;

const MEDIA_ID = /^[\w-]{1,64}$/;
const id = (v: unknown) => (typeof v === 'string' && MEDIA_ID.test(v) ? v : undefined);

/** A moving background as sent by the editor: only known kinds with media ids; nothing usable – none. */
export function cleanBgMedia(input: unknown): BgMedia | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const m = input as Record<string, unknown>;
  if (m.kind === 'video') {
    const video = id(m.video);
    if (!video) return undefined;
    const poster = id(m.poster);
    return { kind: 'video', video, ...(poster ? { poster } : {}), ...(m.phones === true ? { phones: true } : {}) };
  }
  if (m.kind === 'slides') {
    const images = [...new Set((Array.isArray(m.images) ? m.images : []).map(id).filter((x): x is string => Boolean(x)))].slice(0, MAX_SLIDES);
    if (!images.length) return undefined;
    const n = Number(m.seconds);
    const seconds = Number.isFinite(n) ? Math.min(SLIDE_SECONDS.max, Math.max(SLIDE_SECONDS.min, Math.round(n))) : SLIDE_SECONDS.default;
    return { kind: 'slides', images, effect: m.effect === 'kenburns' ? 'kenburns' : 'fade', seconds };
  }
  return undefined;
}

/** Media ids a moving background uses (for loading them and for «where is this file used»). */
export const bgMediaIds = (m: BgMedia | undefined): string[] => (!m ? [] : m.kind === 'video' ? [m.video, ...(m.poster ? [m.poster] : [])] : m.images);

const pct = (n: number) => `${Math.round(n * 1000) / 1000}%`;

/**
 * The slideshow as CSS: one loop for all slides, each starting its turn a
 * little earlier than the one before, so one is always in full view. One
 * picture alone stands still (with Ken Burns it still zooms, once).
 */
export function slidesCss(selector: string, key: string, n: number, seconds: number, effect: 'fade' | 'kenburns'): string {
  const total = n * seconds;
  const fade = Math.min(1.2, seconds / 3);
  const zoom = effect === 'kenburns';
  if (n < 2)
    return zoom ? `@keyframes bgz-${key}{from{transform:scale(1)}to{transform:scale(1.12)}}${selector} .bgm-slide img{animation:bgz-${key} ${seconds * 2}s ease-out both}` : '';
  // In view from the moment it has faded in until the next one has.
  const inEnd = (fade / total) * 100;
  const outStart = ((seconds + fade) / total) * 100;
  const outEnd = Math.min(100, ((seconds + 2 * fade) / total) * 100);
  const rules = [
    `@keyframes bgf-${key}{0%{opacity:0}${pct(inEnd)}{opacity:1}${pct(outStart)}{opacity:1}${pct(outEnd)}{opacity:0}100%{opacity:0}}`,
    `${selector} .bgm-slide{opacity:0;animation:bgf-${key} ${total}s linear infinite}`,
  ];
  if (zoom) {
    rules.push(`@keyframes bgz-${key}{0%{transform:scale(1)}${pct(outEnd)}{transform:scale(1.12)}100%{transform:scale(1.12)}}`);
    rules.push(`${selector} .bgm-slide img{animation:bgz-${key} ${total}s linear infinite}`);
  }
  // The first one is already in view when the page opens.
  for (let i = 0; i < n; i++) {
    const delay = `${Math.round((i * seconds - fade) * 100) / 100}s`;
    rules.push(`${selector} .bgm-slide:nth-child(${i + 1}),${selector} .bgm-slide:nth-child(${i + 1}) img{animation-delay:${delay}}`);
  }
  return rules.join('');
}

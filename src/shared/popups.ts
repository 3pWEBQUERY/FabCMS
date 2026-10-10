/**
 * Pop-ups: a «sections» entry of kind «popup», designed with blocks like any
 * page, shown on the website when its trigger fires – after some seconds, a
 * share of the page scrolled, or when the mouse heads for the tab bar.
 * How often one person sees it is kept in their browser only.
 */

import { localToUtc } from './events';

export type PopupTrigger = 'delay' | 'scroll' | 'exit';
export type PopupFrequency = 'once' | 'days' | 'session';
export type PopupPosition = 'center' | 'corner' | 'bar';
export type PopupSize = 's' | 'm' | 'l';

export interface PopupConf {
  trigger: PopupTrigger;
  /** Seconds after the page opened. */
  delay: number;
  /** Percent of the page scrolled. */
  scroll: number;
  frequency: PopupFrequency;
  /** Days before it may show again (frequency «days»). */
  days: number;
  position: PopupPosition;
  size: PopupSize;
  /** Only on these paths (none = everywhere); a trailing «*» matches everything below. */
  paths: string[];
  /** Never on these paths. */
  skip: string[];
  /** Local wall time in the site's time zone («2026-12-01T08:00»), like every datetime field. */
  from: string | null;
  until: string | null;
}

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const clamp = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== '' && v !== null ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

/** One address pattern per line: «/shop», «/blog/*»; full URLs keep only their path. */
export function pathList(v: unknown): string[] {
  if (typeof v !== 'string') return [];
  const out = v
    .split(/[\n,]+/)
    .map((line) => line.trim().replace(/^https?:\/\/[^/]+/i, ''))
    .filter(Boolean)
    .map((p) => (p.startsWith('/') ? p : `/${p}`).replace(/\/+$/, '').replace(/\*+$/, '*') || '/');
  return [...new Set(out)].slice(0, 50);
}

const time = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) ? v.slice(0, 16) : null);

/** The pop-up settings of a section, with every value checked and defaults filled in. */
export function popupConf(data: Record<string, unknown>): PopupConf {
  return {
    trigger: pick(data.popup_trigger, ['delay', 'scroll', 'exit'] as const, 'delay'),
    delay: clamp(data.popup_delay, 0, 600, 8),
    scroll: clamp(data.popup_scroll, 5, 100, 50),
    frequency: pick(data.popup_frequency, ['once', 'days', 'session'] as const, 'days'),
    days: clamp(data.popup_days, 1, 365, 14),
    position: pick(data.popup_position, ['center', 'corner', 'bar'] as const, 'center'),
    size: pick(data.popup_size, ['s', 'm', 'l'] as const, 'm'),
    paths: pathList(data.popup_paths),
    skip: pathList(data.popup_skip),
    from: time(data.popup_from),
    until: time(data.popup_until),
  };
}

/** «/blog/*» matches /blog and everything below it; other patterns match exactly. */
export function pathMatches(pattern: string, path: string): boolean {
  const p = path.replace(/\/+$/, '') || '/';
  if (pattern.endsWith('/*')) {
    const base = pattern.slice(0, -2) || '/';
    return base === '/' || p === base || p.startsWith(`${base}/`);
  }
  if (pattern.endsWith('*')) return p.startsWith(pattern.slice(0, -1));
  return p === pattern;
}

/** Whether a pop-up belongs on this page at all. */
export const popupOnPath = (conf: PopupConf, path: string) => !conf.skip.some((p) => pathMatches(p, path)) && (!conf.paths.length || conf.paths.some((p) => pathMatches(p, path)));

/** Start and end as instants (ms). Cached pages carry them, so the browser decides on the day itself. */
export function popupWindow(conf: PopupConf, timeZone: string): { from: number | null; until: number | null } {
  return { from: localToUtc(conf.from, timeZone)?.getTime() ?? null, until: localToUtc(conf.until, timeZone)?.getTime() ?? null };
}

/** Whether a pop-up belongs on this page at this moment. */
export function popupShowsOn(conf: PopupConf, path: string, now: Date, timeZone: string): boolean {
  const { from, until } = popupWindow(conf, timeZone);
  if (from !== null && from > now.getTime()) return false;
  if (until !== null && until <= now.getTime()) return false;
  return popupOnPath(conf, path);
}

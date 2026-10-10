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

/** Pop-ups running now or still to come, with their settings; ended and empty ones are gone for good. */
export function runningPopups<T extends { id: string; data: Record<string, unknown> }>(list: T[], now: number, timeZone: string) {
  return list
    .map((p) => {
      const conf = popupConf(p.data);
      return { ...p, conf, win: popupWindow(conf, timeZone) };
    })
    .filter((p) => Array.isArray(p.data.blocks) && p.data.blocks.length > 0 && (p.win.until === null || p.win.until > now));
}

/* ---------- A/B test: pop-ups that take turns ---------- */

/**
 * Pop-ups linked with «Im Wechsel mit» form a group; a group of two or more
 * is a test. Links count both ways and chain (A–B, B–C is one test of three).
 * Returns each tested pop-up's group, its members sorted – the first one
 * names the group.
 */
export function abGroups(list: { id: string; ab?: unknown }[]): Map<string, string[]> {
  const ids = new Set(list.map((p) => p.id));
  const parent = new Map<string, string>();
  const root = (id: string): string => {
    let r = id;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  for (const p of list) {
    const other = typeof p.ab === 'string' ? p.ab : '';
    if (!ids.has(other) || other === p.id) continue;
    const [a, b] = [root(p.id), root(other)];
    if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);
  }
  const members = new Map<string, string[]>();
  for (const id of ids) members.set(root(id), [...(members.get(root(id)) ?? []), id]);
  const out = new Map<string, string[]>();
  for (const group of members.values()) if (group.length > 1) for (const id of group) out.set(id, [...group].sort());
  return out;
}

export interface AbVariant {
  id: string;
  shown: number;
  clicked: number;
}

/** Below this many views per pop-up, nobody is named a winner. */
export const AB_MIN_SHOWN = 100;

// Two-sided 95 %, split over the comparisons of the leader with each other pop-up (Bonferroni).
const Z_95 = [1.96, 2.241, 2.394, 2.498, 2.576, 2.638, 2.69, 2.734, 2.773];

export interface AbVerdict {
  /** The pop-up clicked most often (by rate), or null while there is no difference at all. */
  leader: string | null;
  /** The lead is not chance: at 95 % against every other pop-up. */
  sure: boolean;
  /** Some pop-up has not been shown often enough to tell. */
  needMore: boolean;
}

/** Which pop-up of a test does better, and whether that is more than chance (two-proportion z-test). */
export function abVerdict(variants: AbVariant[]): AbVerdict {
  const rate = (v: AbVariant) => (v.shown ? v.clicked / v.shown : 0);
  const needMore = variants.length < 2 || variants.some((v) => v.shown < AB_MIN_SHOWN);
  const sorted = [...variants].sort((a, b) => rate(b) - rate(a));
  const best = sorted[0];
  if (!best || sorted.length < 2 || rate(best) === rate(sorted[1])) return { leader: null, sure: false, needMore };
  const crit = Z_95[Math.min(sorted.length - 2, Z_95.length - 1)];
  const sure =
    !needMore &&
    sorted.slice(1).every((v) => {
      const pooled = (best.clicked + v.clicked) / (best.shown + v.shown);
      const se = Math.sqrt(pooled * (1 - pooled) * (1 / best.shown + 1 / v.shown));
      return se > 0 && (rate(best) - rate(v)) / se >= crit;
    });
  return { leader: best.id, sure, needMore };
}

/**
 * «Nur zeigen, wenn …»: conditions under which an element appears. They are
 * checked on the server while the page is drawn – what does not hold is not in
 * the HTML at all, so members-only parts never reach anyone else.
 *
 * Everything a condition reads is also part of the page cache's key: member
 * level, cart, language, the address with its parameters, and the clock in
 * five-minute steps.
 */

import type { MemberLevel } from './members';

export const COND_KINDS = ['member', 'time', 'days', 'open', 'lang', 'cart', 'param', 'field'] as const;
export type CondKind = (typeof COND_KINDS)[number];
export const MAX_CONDS = 4;

export type Cond =
  /** Signed in as a member of the website, a paying one, or not signed in. */
  | { if: 'member'; is: 'in' | 'paid' | 'out' }
  /** From and until a moment, as wall time in the site's time zone («2026-12-24T18:00»). */
  | { if: 'time'; from?: string; until?: string }
  /** On these weekdays: 1 = Monday … 7 = Sunday. */
  | { if: 'days'; days: number[] }
  /** Opening hours: open right now, or closed. */
  | { if: 'open'; is: 'open' | 'closed' }
  | { if: 'lang'; is: string }
  | { if: 'cart'; is: 'empty' | 'full' }
  /** The address carries a parameter (?aktion=herbst); empty value = any. */
  | { if: 'param'; key: string; is: string }
  /** The entry of the loop or page: a field has a value, or this one. */
  | { if: 'field'; key: string; is: string };

const KEY = /^[a-zA-Z_][a-zA-Z0-9_-]{0,40}$/;
const WALL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[<>]/g, '').trim().slice(0, max) : '');

/** Conditions as sent by the editor: only known kinds with valid values, at most four. */
export function cleanConds(input: unknown): Cond[] {
  if (!Array.isArray(input)) return [];
  const out: Cond[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const c = raw as Record<string, unknown>;
    switch (c.if) {
      case 'member':
        if (c.is === 'in' || c.is === 'paid' || c.is === 'out') out.push({ if: 'member', is: c.is });
        break;
      case 'time': {
        const from = typeof c.from === 'string' && WALL.test(c.from) ? c.from : undefined;
        const until = typeof c.until === 'string' && WALL.test(c.until) ? c.until : undefined;
        if (from || until) out.push({ if: 'time', ...(from ? { from } : {}), ...(until ? { until } : {}) });
        break;
      }
      case 'days': {
        const days = Array.isArray(c.days) ? [...new Set(c.days.filter((d): d is number => Number.isInteger(d) && d >= 1 && d <= 7))].sort() : [];
        if (days.length) out.push({ if: 'days', days });
        break;
      }
      case 'open':
        if (c.is === 'open' || c.is === 'closed') out.push({ if: 'open', is: c.is });
        break;
      case 'lang':
        if (typeof c.is === 'string' && /^[a-z]{2}$/.test(c.is)) out.push({ if: 'lang', is: c.is });
        break;
      case 'cart':
        if (c.is === 'empty' || c.is === 'full') out.push({ if: 'cart', is: c.is });
        break;
      case 'param':
      case 'field':
        if (typeof c.key === 'string' && KEY.test(c.key)) out.push({ if: c.if, key: c.key, is: text(c.is, 120) });
        break;
    }
    if (out.length >= MAX_CONDS) break;
  }
  return out;
}

/** What the conditions are checked against – gathered once per page. */
export interface CondEnv {
  member: MemberLevel | null;
  /** Wall time in the site's time zone, «2026-12-24T18:00». */
  now: string;
  /** 1 = Monday … 7 = Sunday, in the site's time zone. */
  day: number;
  /** null: no opening hours set. */
  open: boolean | null;
  lang: string;
  cart: number;
  query: URLSearchParams;
  /** A field of the entry the element shows (loop or page); undefined outside of one. */
  field?: (key: string) => unknown;
}

const filled = (v: unknown) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== '' && v !== false);
const matches = (v: unknown, want: string) => (Array.isArray(v) ? v : [v]).some((x) => String(x ?? '').toLowerCase() === want.toLowerCase());

/** Whether every condition holds. No conditions: always. */
export function condsHold(conds: Cond[] | undefined, env: CondEnv): boolean {
  for (const c of conds ?? []) {
    switch (c.if) {
      case 'member':
        if (c.is === 'out' ? env.member !== null : c.is === 'paid' ? env.member !== 'paid' : env.member === null) return false;
        break;
      case 'time':
        if ((c.from && env.now < c.from) || (c.until && env.now >= c.until)) return false;
        break;
      case 'days':
        if (!c.days.includes(env.day)) return false;
        break;
      case 'open':
        // Without opening hours nothing is «open» – and nothing «closed» either.
        if (env.open === null || env.open !== (c.is === 'open')) return false;
        break;
      case 'lang':
        if (env.lang !== c.is) return false;
        break;
      case 'cart':
        if (env.cart > 0 !== (c.is === 'full')) return false;
        break;
      case 'param': {
        const v = env.query.get(c.key);
        if (v === null || (c.is && v.toLowerCase() !== c.is.toLowerCase())) return false;
        break;
      }
      case 'field': {
        if (!env.field) return false;
        const v = env.field(c.key);
        if (c.is ? !matches(v, c.is) : !filled(v)) return false;
        break;
      }
    }
  }
  return true;
}

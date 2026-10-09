import type { EntryData } from './types';
import { zonedToUtc } from './booking';

/** Events & Kurse: dates and ticket categories, shared by server, site and admin. */

export interface TicketCategory {
  name: string;
  /** Cents; 0 = free. */
  price: number;
  /** null = no limit. */
  capacity: number | null;
  note: string;
}

export interface Session {
  start: Date;
  end: Date | null;
}

/** Datetime fields hold local wall time («2026-10-24T19:30») in the site's time zone. */
export function localToUtc(v: unknown, timeZone: string): Date | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(v);
  if (!m) return null;
  return zonedToUtc(m[1], Number(m[2]) * 60 + Number(m[3]), timeZone);
}

/** All dates of an event (one) or a course (several), sorted. */
export function sessionsOf(d: EntryData, timeZone: string): Session[] {
  const raw = Array.isArray(d.sessions) ? (d.sessions as { start?: string; end?: string }[]) : [{ start: d.start as string, end: d.end as string }];
  return raw
    .map((s) => ({ start: localToUtc(s.start, timeZone), end: localToUtc(s.end, timeZone) }))
    .filter((s): s is Session => s.start !== null)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function ticketCategories(d: EntryData): TicketCategory[] {
  const list = Array.isArray(d.tickets) ? (d.tickets as Record<string, unknown>[]) : [];
  return list
    .map((t) => ({
      name: String(t.name ?? '').trim(),
      price: Math.max(0, Math.round(Number(t.price) || 0)),
      capacity: t.capacity === null || t.capacity === undefined || t.capacity === '' ? null : Math.max(0, Math.round(Number(t.capacity))),
      note: String(t.note ?? ''),
    }))
    .filter((t) => t.name);
}

const dayFmt = (tz: string) => new Intl.DateTimeFormat('de-CH', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
const timeFmt = (tz: string) => new Intl.DateTimeFormat('de-CH', { timeZone: tz, hour: '2-digit', minute: '2-digit' });

/** «Sa., 24. Oktober 2026, 19:30–22:00» or across days «Sa., 24. Oktober 2026, 19:30 – So., 25. Oktober 2026, 02:00». */
export function formatSession(s: Session, tz: string): string {
  const day = dayFmt(tz).format(s.start);
  const from = timeFmt(tz).format(s.start);
  if (!s.end) return `${day}, ${from}`;
  const sameDay = dayFmt(tz).format(s.end) === day;
  return sameDay ? `${day}, ${from}–${timeFmt(tz).format(s.end)}` : `${day}, ${from} – ${dayFmt(tz).format(s.end)}, ${timeFmt(tz).format(s.end)}`;
}

/** Short date for cards: «24. Okt.» plus weekday and time. */
export function dateBadge(d: Date, tz: string): { day: string; month: string; weekday: string; time: string } {
  const parts = new Intl.DateTimeFormat('de-CH', { timeZone: tz, day: 'numeric', month: 'short', weekday: 'short' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { day: get('day'), month: get('month').replace('.', ''), weekday: get('weekday').replace('.', ''), time: timeFmt(tz).format(d) };
}

export const MAX_TICKETS_PER_ORDER = 10;

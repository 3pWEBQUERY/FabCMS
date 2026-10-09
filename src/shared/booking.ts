import type { OpeningHoursDay } from './types';

/** Reservation & Termine: pure availability logic, shared by server, site and tests. */

export interface BookingService {
  id: string;
  name: string;
  description: string;
  duration_min: number;
  buffer_min: number;
  price: number | null;
  deposit: number;
  resource_ids: string[];
  active: boolean;
  sort_index: number;
}

export interface BookingResource {
  id: string;
  name: string;
  kind: 'table' | 'staff' | 'room';
  capacity: number;
  hours: OpeningHoursDay[] | null;
  ical_url: string;
  active: boolean;
  sort_index: number;
}

export interface BookingRules {
  /** Minutes between possible start times. */
  slotStep: number;
  /** How long before the start a booking must be made. */
  leadMinutes: number;
  /** How far ahead bookings are possible. */
  horizonDays: number;
  maxParty: number;
}

export interface Busy {
  resourceId: string | null; // null = everything (closure)
  start: Date;
  end: Date;
}

export interface Slot {
  time: string; // HH:MM local
  start: Date;
  resourceId: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const minutesToTime = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Offset of `timeZone` from UTC at `instant`, in minutes (Zurich in summer: +120). */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** The instant of a local wall-clock time («2026-10-24», 19:30) in the site's time zone. */
export function zonedToUtc(day: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  // Two passes settle the offset also on days where it changes (DST).
  let t = guess - offsetMinutes(new Date(guess), timeZone) * 60_000;
  t = guess - offsetMinutes(new Date(t), timeZone) * 60_000;
  return new Date(t);
}

/** Local calendar day «YYYY-MM-DD» and weekday (1 = Monday) of an instant. */
export function localDay(instant: Date, timeZone: string): { day: string; weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    day: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')) + 1,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

function weekdayOf(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

/** Resources that can take this service for this many people, best fit first. */
export function eligibleResources(service: BookingService, resources: BookingResource[], party: number): BookingResource[] {
  return resources
    .filter((r) => r.active && (!service.resource_ids.length || service.resource_ids.includes(r.id)))
    .filter((r) => r.kind === 'staff' || r.capacity >= party)
    .sort((a, b) => (a.kind === 'staff' ? 0 : a.capacity - b.capacity) || a.sort_index - b.sort_index);
}

/**
 * Start times on `day` where at least one suitable resource is free for the
 * whole duration plus buffer, inside its opening hours, respecting lead time
 * and horizon. Each slot names the resource it would go to.
 */
export function computeSlots(input: {
  day: string;
  timeZone: string;
  businessHours: OpeningHoursDay[];
  service: BookingService;
  resources: BookingResource[];
  party: number;
  busy: Busy[];
  rules: BookingRules;
  now: Date;
}): Slot[] {
  const { day, timeZone, service, party, busy, rules, now } = input;
  if (party < 1 || party > rules.maxParty) return [];
  const earliest = now.getTime() + rules.leadMinutes * 60_000;
  const latest = now.getTime() + rules.horizonDays * 86_400_000;
  const weekday = weekdayOf(day);
  const length = (service.duration_min + service.buffer_min) * 60_000;
  const step = Math.max(5, rules.slotStep);
  const found = new Map<string, Slot>();
  for (const r of eligibleResources(service, input.resources, party)) {
    const hours = (r.hours ?? input.businessHours).find((h) => h.day === weekday);
    if (!hours || hours.closed) continue;
    const mine = busy.filter((b) => b.resourceId === null || b.resourceId === r.id);
    for (const s of hours.slots) {
      const from = toMin(s.from);
      let to = toMin(s.to);
      if (to <= from) to += 24 * 60; // open past midnight
      for (let m = from; m + service.duration_min <= to; m += step) {
        const time = minutesToTime(m);
        if (found.has(time)) continue;
        const start = zonedToUtc(day, m, timeZone);
        const t = start.getTime();
        if (t < earliest || t > latest) continue;
        const end = t + length;
        if (mine.some((b) => b.start.getTime() < end && b.end.getTime() > t)) continue;
        found.set(time, { time, start, resourceId: r.id });
      }
    }
  }
  return [...found.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}

export const BOOKING_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'muted' | 'bad' }> = {
  pending: { label: 'Offen', tone: 'warn' },
  awaiting_payment: { label: 'Wartet auf Anzahlung', tone: 'warn' },
  confirmed: { label: 'Bestätigt', tone: 'ok' },
  done: { label: 'Erledigt', tone: 'muted' },
  no_show: { label: 'Nicht erschienen', tone: 'bad' },
  cancelled: { label: 'Storniert', tone: 'muted' },
};

/** Statuses that hold a table or a person. */
export const BLOCKING_STATUSES = ['pending', 'awaiting_payment', 'confirmed'];

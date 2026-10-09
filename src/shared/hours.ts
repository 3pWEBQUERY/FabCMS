import type { OpeningHoursDay } from './types';

export const DAY_NAMES = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const DAY_SHORT = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const SCHEMA_DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Day (1–7, Monday first) and minutes since midnight in the site's time zone. */
export function zonedNow(timezone: string, now = new Date()): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')) + 1;
  return { day, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

export function formatSlots(d: OpeningHoursDay | undefined): string {
  if (!d || d.closed || !d.slots.length) return 'geschlossen';
  return d.slots.map((s) => `${s.from}–${s.to}`).join(', ');
}

export interface OpenStatus {
  open: boolean;
  label: string;
}

export function openStatus(hours: OpeningHoursDay[], timezone: string, now = new Date()): OpenStatus | null {
  if (!hours?.length) return null;
  const { day, minutes } = zonedNow(timezone, now);
  const today = hours.find((h) => h.day === day);
  if (today && !today.closed) {
    for (const s of today.slots) {
      const from = toMin(s.from);
      let to = toMin(s.to);
      if (to <= from) to += 24 * 60;
      if (minutes >= from && minutes < to) return { open: true, label: `Jetzt geöffnet – bis ${s.to}` };
      if (minutes < from) return { open: false, label: `Geschlossen – öffnet heute um ${s.from}` };
    }
  }
  for (let i = 1; i <= 7; i++) {
    const d = ((day - 1 + i) % 7) + 1;
    const next = hours.find((h) => h.day === d);
    if (next && !next.closed && next.slots.length) {
      const when = i === 1 ? 'morgen' : `am ${DAY_NAMES[d]}`;
      return { open: false, label: `Geschlossen – öffnet ${when} um ${next.slots[0].from}` };
    }
  }
  return { open: false, label: 'Geschlossen' };
}

/** Groups consecutive days with identical hours: "Mo–Fr 09:00–18:00". */
export function compactHours(hours: OpeningHoursDay[]): { days: string; time: string }[] {
  const sorted = [...hours].sort((a, b) => a.day - b.day);
  const out: { from: number; to: number; time: string }[] = [];
  for (const h of sorted) {
    const time = formatSlots(h);
    const last = out[out.length - 1];
    if (last && last.time === time && last.to === h.day - 1) last.to = h.day;
    else out.push({ from: h.day, to: h.day, time });
  }
  return out.map((g) => ({ days: g.from === g.to ? DAY_SHORT[g.from] : `${DAY_SHORT[g.from]}–${DAY_SHORT[g.to]}`, time: g.time }));
}

export function schemaOpeningHours(hours: OpeningHoursDay[]) {
  return hours
    .filter((h) => !h.closed)
    .flatMap((h) => h.slots.map((s) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: SCHEMA_DAYS[h.day], opens: s.from, closes: s.to })));
}

/** Reads what people actually type: «9», «930», «9.30», «9h30», «18:15» → "HH:MM" (or null). */
export function parseTime(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/\s*uhr$/, '');
  const m = /^(\d{1,2})(?:[:.h,](\d{2}))?$/.exec(t) ?? /^(\d{1,2})(\d{2})$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return `${String(h % 24).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

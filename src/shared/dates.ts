/** Calendar days as "YYYY-MM-DD" (local, no time zone) and the Swiss way of writing them. */

export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

const pad = (n: number) => String(n).padStart(2, '0');

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromIsoDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}

export function addDays(s: string, n: number): string {
  const d = fromIsoDay(s)!;
  d.setDate(d.getDate() + n);
  return isoDay(d);
}

/** Same day in another month, clamped to that month's length (31. Jan + 1 → 28./29. Feb). */
export function addMonths(s: string, n: number): string {
  const d = fromIsoDay(s)!;
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), last));
  return isoDay(target);
}

/** "2026-10-09" → "09.10.2026" */
export function formatDay(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

/** "2026-10-09" → "Freitag, 9. Oktober 2026" (for screen readers and titles); other languages via Intl. */
export function longDay(s: string, locale = 'de-CH'): string {
  const d = fromIsoDay(s);
  if (!d) return '';
  if (locale.startsWith('de')) return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

/**
 * Reads what people type: «9.10.2026», «9.10.26», «9.10.» (this year), «9/10/2026»,
 * «2026-10-09», «heute», «morgen», «übermorgen». Returns "YYYY-MM-DD" or null.
 */
export function parseDay(raw: string, today: Date = new Date()): string | null {
  const t = raw.trim().toLowerCase();
  const rel: Record<string, number> = { heute: 0, morgen: 1, übermorgen: 2, gestern: -1 };
  if (t in rel) return addDays(isoDay(today), rel[t]);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const ch = /^(\d{1,2})[./-](\d{1,2})[./-]?(\d{2}|\d{4})?$/.exec(t);
  let y: number, mo: number, d: number;
  if (iso) [y, mo, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (ch) {
    d = Number(ch[1]);
    mo = Number(ch[2]);
    y = ch[3] === undefined ? today.getFullYear() : ch[3].length === 2 ? 2000 + Number(ch[3]) : Number(ch[3]);
  } else return null;
  const s = `${y}-${pad(mo)}-${pad(d)}`;
  return fromIsoDay(s) ? s : null;
}

/** The 6×7 days shown for a month, starting on Monday. */
export function monthGrid(year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => isoDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
}

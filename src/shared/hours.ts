import type { OpeningHoursDay } from './types';
import type { Lang } from './i18n';

export const DAY_NAMES = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const DAY_SHORT = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Day names per language, index 1 = Monday. */
export const DAYS: Record<Lang, { long: string[]; short: string[] }> = {
  de: { long: DAY_NAMES, short: DAY_SHORT },
  fr: { long: ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'], short: ['', 'lu', 'ma', 'me', 'je', 've', 'sa', 'di'] },
  it: { long: ['', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'], short: ['', 'lu', 'ma', 'me', 'gi', 've', 'sa', 'do'] },
  en: { long: ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], short: ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
};

const PHRASES: Record<Lang, { closed: string; closedCap: string; openUntil: string; opensToday: string; opensTomorrow: string; opensOn: string }> = {
  de: { closed: 'geschlossen', closedCap: 'Geschlossen', openUntil: 'Jetzt geöffnet – bis {t}', opensToday: 'Geschlossen – öffnet heute um {t}', opensTomorrow: 'Geschlossen – öffnet morgen um {t}', opensOn: 'Geschlossen – öffnet am {d} um {t}' },
  fr: { closed: 'fermé', closedCap: 'Fermé', openUntil: 'Ouvert maintenant – jusqu’à {t}', opensToday: 'Fermé – ouvre aujourd’hui à {t}', opensTomorrow: 'Fermé – ouvre demain à {t}', opensOn: 'Fermé – ouvre {d} à {t}' },
  it: { closed: 'chiuso', closedCap: 'Chiuso', openUntil: 'Aperto ora – fino alle {t}', opensToday: 'Chiuso – apre oggi alle {t}', opensTomorrow: 'Chiuso – apre domani alle {t}', opensOn: 'Chiuso – apre {d} alle {t}' },
  en: { closed: 'closed', closedCap: 'Closed', openUntil: 'Open now – until {t}', opensToday: 'Closed – opens today at {t}', opensTomorrow: 'Closed – opens tomorrow at {t}', opensOn: 'Closed – opens {d} at {t}' },
};
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w)\}/g, (_, k: string) => v[k] ?? '');
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

export function formatSlots(d: OpeningHoursDay | undefined, lang: Lang = 'de'): string {
  if (!d || d.closed || !d.slots.length) return PHRASES[lang].closed;
  return d.slots.map((s) => `${s.from}–${s.to}`).join(', ');
}

export interface OpenStatus {
  open: boolean;
  label: string;
}

export function openStatus(hours: OpeningHoursDay[], timezone: string, now = new Date(), lang: Lang = 'de'): OpenStatus | null {
  if (!hours?.length) return null;
  const p = PHRASES[lang];
  const { day, minutes } = zonedNow(timezone, now);
  const today = hours.find((h) => h.day === day);
  if (today && !today.closed) {
    for (const s of today.slots) {
      const from = toMin(s.from);
      let to = toMin(s.to);
      if (to <= from) to += 24 * 60;
      if (minutes >= from && minutes < to) return { open: true, label: fill(p.openUntil, { t: s.to }) };
      if (minutes < from) return { open: false, label: fill(p.opensToday, { t: s.from }) };
    }
  }
  for (let i = 1; i <= 7; i++) {
    const d = ((day - 1 + i) % 7) + 1;
    const next = hours.find((h) => h.day === d);
    if (next && !next.closed && next.slots.length) {
      const t = next.slots[0].from;
      return { open: false, label: i === 1 ? fill(p.opensTomorrow, { t }) : fill(p.opensOn, { d: DAYS[lang].long[d], t }) };
    }
  }
  return { open: false, label: p.closedCap };
}

/** Groups consecutive days with identical hours: "Mo–Fr 09:00–18:00". */
export function compactHours(hours: OpeningHoursDay[], lang: Lang = 'de'): { days: string; time: string }[] {
  const short = DAYS[lang].short;
  const sorted = [...hours].sort((a, b) => a.day - b.day);
  const out: { from: number; to: number; time: string }[] = [];
  for (const h of sorted) {
    const time = formatSlots(h, lang);
    const last = out[out.length - 1];
    if (last && last.time === time && last.to === h.day - 1) last.to = h.day;
    else out.push({ from: h.day, to: h.day, time });
  }
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  return out.map((g) => ({ days: g.from === g.to ? cap(short[g.from]) : `${cap(short[g.from])}–${cap(short[g.to])}`, time: g.time }));
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

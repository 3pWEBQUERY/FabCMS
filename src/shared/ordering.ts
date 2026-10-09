import type { OpeningHoursDay } from './types';
import { localDay, minutesToTime, zonedToUtc } from './booking';

/** Bestellung & Lieferung: time slots and totals, shared by server, site and tests. */

export interface FoodLine {
  id: string;
  title: string;
  size: string;
  price: number; // cents per piece
  q: number;
  vat: 'reduced' | 'standard';
  /** Index of the chosen price on the dish (cart only). */
  s?: number;
}

export interface SlotDay {
  day: string; // YYYY-MM-DD local
  label: string; // «Heute», «Morgen», «Sa., 24. Okt.»
  slots: { at: string; time: string }[]; // at = ISO instant
}

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

/**
 * Times a guest can choose: inside the opening hours, not earlier than now
 * plus the kitchen's preparation time, on a regular grid. Today and the next
 * days, until `days` days with slots are found (closed days are skipped).
 */
export function orderSlots(input: { hours: OpeningHoursDay[]; timeZone: string; now: Date; prepMinutes: number; slotMinutes: number; days?: number }): SlotDay[] {
  const { hours, timeZone, now } = input;
  const step = Math.max(5, input.slotMinutes);
  const earliest = now.getTime() + Math.max(0, input.prepMinutes) * 60_000;
  const out: SlotDay[] = [];
  const today = localDay(now, timeZone).day;
  for (let i = 0; i < 8 && out.length < (input.days ?? 2); i++) {
    const noonUtc = zonedToUtc(today, 12 * 60, timeZone).getTime() + i * 86_400_000;
    const { day, weekday } = localDay(new Date(noonUtc), timeZone);
    const h = hours.find((x) => x.day === weekday);
    if (!h || h.closed) continue;
    const slots: SlotDay['slots'] = [];
    for (const s of h.slots) {
      const from = toMin(s.from);
      let to = toMin(s.to);
      if (to <= from) to += 24 * 60;
      // First slot a little after opening (kitchen warms up), last one at closing.
      for (let m = Math.ceil((from + step) / step) * step; m <= to; m += step) {
        const at = zonedToUtc(day, m, timeZone);
        if (at.getTime() < earliest) continue;
        slots.push({ at: at.toISOString(), time: minutesToTime(m) });
      }
    }
    if (!slots.length) continue;
    const label =
      i === 0 ? 'Heute' : i === 1 ? 'Morgen' : new Intl.DateTimeFormat('de-CH', { timeZone, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(noonUtc));
    out.push({ day, label, slots });
  }
  return out;
}

export function foodTotals(lines: FoodLine[], deliveryFee: number, rates: { standard: number; reduced: number }) {
  const subtotal = lines.reduce((n, l) => n + l.price * l.q, 0);
  const total = subtotal + deliveryFee;
  // Prices include VAT. The delivery follows the food (reduced rate).
  const byRate = new Map<number, number>();
  for (const l of lines) {
    const r = l.vat === 'standard' ? rates.standard : rates.reduced;
    byRate.set(r, (byRate.get(r) ?? 0) + l.price * l.q);
  }
  if (deliveryFee) byRate.set(rates.reduced, (byRate.get(rates.reduced) ?? 0) + deliveryFee);
  const vat = [...byRate]
    .filter(([r]) => r > 0)
    .map(([rate, gross]) => ({ rate, amount: Math.round((gross * rate) / (100 + rate)) }))
    .sort((a, b) => b.rate - a.rate);
  return { subtotal, deliveryFee, total, vat };
}

export const FOOD_STATUS: Record<string, { label: string; guest: string }> = {
  pending_payment: { label: 'Zahlung offen', guest: 'Wir warten noch auf die Zahlung.' },
  new: { label: 'Neu', guest: 'Deine Bestellung ist angekommen.' },
  preparing: { label: 'In Zubereitung', guest: 'Die Küche ist dran.' },
  ready: { label: 'Bereit', guest: 'Fertig – du kannst sie abholen.' },
  out: { label: 'Unterwegs', guest: 'Ist unterwegs zu dir.' },
  done: { label: 'Abgeschlossen', guest: 'Erledigt. En Guete!' },
  cancelled: { label: 'Storniert', guest: 'Diese Bestellung wurde storniert.' },
};

import { randomBytes } from 'node:crypto';
import { sql } from './db';
import { env } from './env';
import { getSettings, updateSettings, bumpGeneration, mainLang } from './settings';
import { token } from './lib/crypto';
import { badRequest, notFound } from './lib/http';
import { sendMail } from './mail';
import { notify } from './notify';
import { inStoredLang, pageLang, storedLang } from './translations';
import { T, tr } from '../site/i18n';
import { langInfo, type Lang } from '../shared/i18n';
import { formatMoney } from '../shared/text';
import { BLOCKING_STATUSES, computeSlots, localDay, zonedToUtc, type BookingResource, type BookingService, type Busy, type Slot } from '../shared/booking';
import type { SiteSettings } from '../shared/types';

export interface Booking {
  id: string;
  service_id: string | null;
  resource_id: string | null;
  starts_at: string;
  ends_at: string;
  party_size: number;
  name: string;
  email: string;
  phone: string;
  note: string;
  internal_note: string;
  status: string;
  source: string;
  token: string;
  deposit: number;
  created_at: string;
}

const base = (s: SiteSettings) => (s.baseUrl || env.publicUrl).replace(/\/$/, '');

export async function listServices(activeOnly = false): Promise<BookingService[]> {
  const rows = await sql`select * from booking_services ${activeOnly ? sql`where active` : sql``} order by sort_index, name`;
  return rows as unknown as BookingService[];
}

export async function listResources(activeOnly = false): Promise<BookingResource[]> {
  const rows = await sql`select * from booking_resources ${activeOnly ? sql`where active` : sql``} order by sort_index, name`;
  return rows as unknown as BookingResource[];
}

/** Everything that blocks time between two instants: live bookings and closures. */
async function busyBetween(from: Date, to: Date, ignoreBooking?: string): Promise<Busy[]> {
  const [bookings, blocks] = await Promise.all([
    sql`select id, resource_id, starts_at, ends_at from bookings
        where status = any(${BLOCKING_STATUSES}) and starts_at < ${to} and ends_at > ${from}`,
    sql`select resource_id, starts_at, ends_at from booking_blocks where starts_at < ${to} and ends_at > ${from}`,
  ]);
  return [
    ...bookings.filter((b) => b.id !== ignoreBooking).map((b) => ({ resourceId: b.resource_id as string, start: new Date(b.starts_at), end: new Date(b.ends_at) })),
    ...blocks.map((b) => ({ resourceId: (b.resource_id as string | null) ?? null, start: new Date(b.starts_at), end: new Date(b.ends_at) })),
  ];
}

const dayRange = (day: string, tz: string) => ({ from: zonedToUtc(day, 0, tz), to: zonedToUtc(day, 24 * 60 + 12 * 60, tz) });

/** Staff (phone bookings) may book today, far ahead and for larger groups. */
const staffRules = (r: SiteSettings['booking']) => ({ ...r, leadMinutes: -24 * 60, horizonDays: 3650, maxParty: 99 });

export async function slotsFor(serviceId: string, day: string, party: number, now = new Date(), staff = false): Promise<Slot[]> {
  const s = await getSettings();
  const [services, resources] = await Promise.all([listServices(true), listResources(true)]);
  const service = services.find((x) => x.id === serviceId);
  if (!service) return [];
  const { from, to } = dayRange(day, s.timezone);
  return computeSlots({ day, timeZone: s.timezone, businessHours: s.hours, service, resources, party, busy: await busyBetween(from, to), rules: staff ? staffRules(s.booking) : s.booking, now });
}

/** Which of the next `count` days have at least one free time (for the day picker). */
export async function openDays(serviceId: string, party: number, firstDay: string, count: number, now = new Date()): Promise<{ day: string; free: number }[]> {
  const s = await getSettings();
  const [services, resources] = await Promise.all([listServices(true), listResources(true)]);
  const service = services.find((x) => x.id === serviceId);
  if (!service) return [];
  const days = Array.from({ length: count }, (_, i) => localDay(new Date(zonedToUtc(firstDay, 12 * 60, s.timezone).getTime() + i * 86_400_000), s.timezone).day);
  const busy = await busyBetween(dayRange(days[0], s.timezone).from, dayRange(days[days.length - 1], s.timezone).to);
  return days.map((day) => ({ day, free: computeSlots({ day, timeZone: s.timezone, businessHours: s.hours, service, resources, party, busy, rules: s.booking, now }).length }));
}

export interface BookingInput {
  serviceId: string;
  day: string;
  time: string;
  party: number;
  name: string;
  email: string;
  phone?: string;
  note?: string;
}

/**
 * Books a slot. A transaction-wide lock serialises bookings, and the slot is
 * computed again inside it, so two people can never get the same table.
 * Staff may pick a resource and book outside the rules (phone, walk-in).
 */
export async function createBooking(input: BookingInput, opts: { staff?: boolean; resourceId?: string | null; source?: string } = {}): Promise<Booking> {
  const s = await getSettings();
  if (!input.name.trim()) throw badRequest(T('Bitte gib deinen Namen an.'));
  if (!opts.staff && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw badRequest(T('Bitte gib eine gültige E-Mail-Adresse an, damit wir dir die Bestätigung schicken können.'));
  const services = await listServices(!opts.staff);
  const service = services.find((x) => x.id === input.serviceId);
  if (!service) throw badRequest(T('Dieses Angebot kann gerade nicht gebucht werden.'));
  const [h, m] = input.time.split(':').map(Number);
  const start = zonedToUtc(input.day, h * 60 + m, s.timezone);
  const end = new Date(start.getTime() + (service.duration_min + service.buffer_min) * 60_000);
  const deposit = !opts.staff && service.deposit > 0 && env.stripe.secretKey ? service.deposit : 0;
  const status = deposit ? 'awaiting_payment' : opts.staff || s.booking.autoConfirm ? 'confirmed' : 'pending';

  const booking = await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('nova-booking'))`;
    let resourceId = opts.resourceId ?? null;
    if (opts.staff && resourceId) {
      // The team picked the table or person themselves: it only has to be free.
      const clash = (await busyBetween(start, end)).some((x) => x.resourceId === null || x.resourceId === resourceId);
      if (clash) throw badRequest('Dort ist zu dieser Zeit schon etwas eingetragen.');
    } else {
      const resources = await listResources(true);
      const { from, to } = dayRange(input.day, s.timezone);
      const busy = await busyBetween(from, to);
      const rules = opts.staff ? staffRules(s.booking) : s.booking;
      const slot = computeSlots({ day: input.day, timeZone: s.timezone, businessHours: s.hours, service, resources, party: input.party, busy, rules, now: new Date() }).find(
        (x) => x.time === input.time,
      );
      if (!slot) throw badRequest(T('Diese Zeit ist leider gerade vergeben worden. Bitte wähle eine andere.'));
      resourceId = slot.resourceId;
    }
    const [row] = await tx`
      insert into bookings (service_id, resource_id, starts_at, ends_at, party_size, name, email, phone, note, status, source, token, deposit, lang)
      values (${service.id}, ${resourceId}, ${start}, ${end}, ${input.party}, ${input.name.trim().slice(0, 120)}, ${input.email.trim().toLowerCase().slice(0, 200)},
              ${(input.phone ?? '').trim().slice(0, 40)}, ${(input.note ?? '').trim().slice(0, 1000)}, ${status}, ${opts.source ?? 'web'}, ${token(18)}, ${deposit}, ${opts.staff ? '' : storedLang()})
      returning *`;
    return row as unknown as Booking;
  });
  bumpGeneration();
  if (!opts.staff) {
    const when = formatWhen(booking.starts_at, s);
    void notify({
      kind: 'booking',
      cap: 'bookings.manage',
      title: `${status === 'pending' ? 'Neue Anfrage' : 'Neue Reservation'}: ${booking.name}`,
      body: `${when} · ${s.booking.mode === 'table' ? `${booking.party_size} Pers.` : service.name}${status === 'pending' ? ' – bitte bestätigen' : ''}`,
      href: `/reservationen?tag=${localDay(new Date(booking.starts_at), s.timezone).day}&id=${booking.id}`,
    });
    if (status !== 'awaiting_payment') void bookingMail(booking.id, status === 'pending' ? 'received' : 'confirmed');
    void notifyBusiness(booking, service, s);
  }
  return booking;
}

/** Date and time of a booking; German unless a language is given (visitor pages and mails). */
export function formatWhen(iso: string | Date, s: SiteSettings, lang: Lang = 'de'): string {
  const when = new Date(iso).toLocaleString(langInfo(lang).locale, { timeZone: s.timezone, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  return tr(lang, '{when} Uhr', { when });
}

async function notifyBusiness(b: Booking, service: BookingService, s: SiteSettings) {
  const to = s.booking.notifyEmail || s.business.email;
  if (!to) return;
  await sendMail({
    to,
    subject: `${b.status === 'pending' ? 'Reservationsanfrage' : 'Neue Reservation'}: ${b.name}, ${formatWhen(b.starts_at, s)}`,
    replyTo: b.email || undefined,
    text: [
      `${b.name} hat ${s.booking.mode === 'table' ? `für ${b.party_size} Personen` : `«${service.name}»`} gebucht:`,
      formatWhen(b.starts_at, s),
      '',
      b.phone ? `Telefon: ${b.phone}` : '',
      b.email ? `E-Mail: ${b.email}` : '',
      b.note ? `Bemerkung: ${b.note}` : '',
      '',
      b.status === 'pending' ? 'Die Anfrage wartet auf deine Bestätigung:' : 'Im Tagesplan:',
      `${base(s)}/admin/reservationen?tag=${localDay(new Date(b.starts_at), s.timezone).day}&id=${b.id}`,
    ]
      .filter((l, i, all) => l !== '' || (all[i - 1] !== '' && i > 0))
      .join('\n'),
  });
}

/* ---------- calendar files ---------- */

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (t: string) => t.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);

function vevent(b: Booking & { service_name?: string | null; resource_name?: string | null }, s: SiteSettings, forStaff: boolean): string[] {
  const durationEnd = new Date(b.ends_at);
  const title = forStaff ? `${b.name} (${s.booking.mode === 'table' ? `${b.party_size} P.` : b.service_name ?? 'Termin'})${b.resource_name ? ` · ${b.resource_name}` : ''}` : `${b.service_name ?? T('Reservation')} – ${s.name}`;
  const address = [s.business.street, [s.business.zip, s.business.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [
    'BEGIN:VEVENT',
    `UID:${b.id}@nova`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(new Date(b.starts_at))}`,
    `DTEND:${icsDate(durationEnd)}`,
    `SUMMARY:${icsText(title)}`,
    address ? `LOCATION:${icsText(address)}` : '',
    forStaff ? `DESCRIPTION:${icsText([b.phone, b.email, b.note].filter(Boolean).join('\n'))}` : `DESCRIPTION:${icsText(T('Ansehen oder absagen: {link}', { link: `${base(s)}/buchung/${b.token}` }))}`,
    b.status === 'cancelled' ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
    'END:VEVENT',
  ].filter(Boolean);
}

const calendar = (events: string[][], name: string) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nova CMS//Reservation//DE', `X-WR-CALNAME:${icsText(name)}`, 'CALSCALE:GREGORIAN', ...events.flat(), 'END:VCALENDAR'].join('\r\n');

const withNames = (where: ReturnType<typeof sql>) => sql`
  select b.*, sv.name as service_name, r.name as resource_name
  from bookings b left join booking_services sv on sv.id = b.service_id left join booking_resources r on r.id = b.resource_id
  where ${where}`;

export async function bookingByToken(t: string) {
  const [b] = await withNames(sql`b.token = ${t}`);
  return (b as unknown as Booking & { service_name: string | null; resource_name: string | null }) ?? null;
}

export async function guestIcs(t: string): Promise<string | null> {
  const s = await getSettings();
  const b = await bookingByToken(t);
  return b ? calendar([vevent(b, s, false)], s.name) : null;
}

/** Subscription feed for the team's calendar (Google, Apple, Outlook): the next 90 days. */
export async function staffFeed(feedToken: string): Promise<string | null> {
  const s = await getSettings();
  if (!s.booking.feedToken || feedToken !== s.booking.feedToken) return null;
  const rows = await withNames(sql`b.status = any(${BLOCKING_STATUSES}) and b.starts_at > now() - interval '7 days' and b.starts_at < now() + interval '90 days'`);
  return calendar(
    rows.map((b) => vevent(b as unknown as Booking, s, true)),
    `${s.name} – Reservationen`,
  );
}

export async function ensureFeedToken(): Promise<string> {
  const s = await getSettings();
  if (s.booking.feedToken) return s.booking.feedToken;
  const t = randomBytes(18).toString('base64url');
  await updateSettings({ booking: { ...s.booking, feedToken: t } });
  return t;
}

/* ---------- guest mails ---------- */

export async function bookingMail(id: string, kind: 'received' | 'confirmed' | 'cancelled' | 'reminder'): Promise<void> {
  const s = await getSettings();
  const [b] = await withNames(sql`b.id = ${id}`);
  if (!b || !b.email) return;
  if ((b.lang || mainLang()) !== pageLang()) return inStoredLang(b.lang as string, () => bookingMail(id, kind));
  // The guest's language during their own request (booking, cancelling); otherwise the main language.
  const when = formatWhen(b.starts_at as string, s, pageLang());
  const n = b.party_size as number;
  const what = s.booking.mode === 'table' ? (n === 1 ? T('für {n} Person', { n }) : T('für {n} Personen', { n })) : `«${b.service_name ?? T('Termin')}»`;
  const link = `${base(s)}/buchung/${b.token}`;
  const subject = {
    received: T('Deine Anfrage bei {name}', { name: s.name }),
    confirmed: T('Bestätigt: {when}', { when }),
    cancelled: T('Abgesagt: {when}', { when }),
    reminder: T('Bis bald: {when}', { when }),
  }[kind];
  const lead = {
    received: T('danke für deine Anfrage {what} am {when}. Wir melden uns, sobald wir sie bestätigt haben.', { what, when }),
    confirmed: T('wir freuen uns auf dich: {when}, {what}.', { what, when }),
    cancelled: T('deine Reservation am {when} ist abgesagt.', { when }),
    reminder: T('zur Erinnerung: {when}, {what}.', { what, when }),
  }[kind];
  const address = [s.business.street, [s.business.zip, s.business.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  await sendMail({
    to: b.email as string,
    subject,
    replyTo: s.business.email || undefined,
    text: [
      T('Hallo {name},', { name: String(b.name).split(' ')[0] }),
      '',
      lead,
      address && kind !== 'cancelled' ? `\n${s.name}, ${address}` : '',
      kind !== 'cancelled' ? `\n${T('Ansehen oder absagen: {link}', { link })}` : '',
      '',
      `${s.name}${s.business.phone ? ` · ${s.business.phone}` : ''}`,
    ].join('\n'),
    attachments: kind === 'confirmed' || kind === 'reminder' ? [{ filename: 'reservation.ics', content: calendar([vevent(b as unknown as Booking, s, false)], s.name), contentType: 'text/calendar' }] : undefined,
  });
}

/* ---------- status changes ---------- */

export async function setBookingStatus(id: string, status: string, opts: { mail?: boolean } = {}): Promise<Booking> {
  const [b] = await sql`update bookings set status = ${status}, updated_at = now() where id = ${id} returning *`;
  if (!b) throw notFound();
  bumpGeneration();
  if (opts.mail && (status === 'confirmed' || status === 'cancelled')) void bookingMail(id, status);
  return b as unknown as Booking;
}

/** A guest cancels with the link from the mail, until `cancelHours` before the start. */
export async function cancelByGuest(t: string): Promise<{ ok: boolean; message: string }> {
  const s = await getSettings();
  const b = await bookingByToken(t);
  if (!b) throw notFound();
  if (!BLOCKING_STATUSES.includes(b.status)) return { ok: false, message: T('Diese Reservation ist nicht mehr aktiv.') };
  if (new Date(b.starts_at).getTime() - Date.now() < s.booking.cancelHours * 3_600_000)
    return { ok: false, message: s.business.phone ? T('So kurzfristig geht das nur noch telefonisch: {phone}.', { phone: s.business.phone }) : T('So kurzfristig geht das nur noch telefonisch.') };
  await setBookingStatus(b.id, 'cancelled', { mail: true });
  void notify({ kind: 'booking', cap: 'bookings.manage', title: `Abgesagt: ${b.name}`, body: formatWhen(b.starts_at, s), href: `/reservationen?tag=${localDay(new Date(b.starts_at), s.timezone).day}` });
  return { ok: true, message: T('Deine Reservation ist abgesagt. Schade – vielleicht ein anderes Mal.') };
}

/** Moves a booking (staff): new time and/or resource; the overlap check still applies. */
export async function moveBooking(id: string, change: { day: string; time: string; resourceId: string | null; party: number }): Promise<Booking> {
  const s = await getSettings();
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('nova-booking'))`;
    const [b] = await tx`select * from bookings where id = ${id}`;
    if (!b) throw notFound();
    const [service] = await tx`select * from booking_services where id = ${b.service_id}`;
    const length = ((service?.duration_min ?? 60) + (service?.buffer_min ?? 0)) * 60_000;
    const [h, m] = change.time.split(':').map(Number);
    const start = zonedToUtc(change.day, h * 60 + m, s.timezone);
    const end = new Date(start.getTime() + length);
    if (change.resourceId) {
      const busy = (await busyBetween(start, end, id)).filter((x) => x.resourceId === null || x.resourceId === change.resourceId);
      if (busy.length) throw badRequest('Zu dieser Zeit ist dort schon etwas eingetragen.');
    }
    const [next] = await tx`update bookings set starts_at = ${start}, ends_at = ${end}, resource_id = ${change.resourceId}, party_size = ${change.party}, updated_at = now() where id = ${id} returning *`;
    bumpGeneration();
    return next as unknown as Booking;
  });
}

/* ---------- jobs ---------- */

/** Reminder mails «reminderHours» before the start, once per booking. */
export async function sendReminders(): Promise<number> {
  const s = await getSettings();
  if (!s.modules.includes('booking') || !s.booking.reminderHours) return 0;
  const due = await sql`
    update bookings set reminder_sent_at = now()
    where status = 'confirmed' and reminder_sent_at is null and email <> ''
      and starts_at > now() and starts_at < now() + make_interval(hours => ${s.booking.reminderHours})
      and created_at < now() - interval '1 hour'
    returning id`;
  for (const r of due) await bookingMail(r.id as string, 'reminder');
  return due.length;
}

/** Bookings whose deposit was never paid release their table after 30 minutes. */
export async function releaseUnpaid(): Promise<void> {
  const n = await sql`update bookings set status = 'cancelled', updated_at = now() where status = 'awaiting_payment' and created_at < now() - interval '30 minutes' returning id`;
  if (n.length) bumpGeneration();
}

/** Minimal iCalendar reader: busy times (VEVENT start/end) from another calendar. */
export function parseIcsBusy(ics: string): { start: Date; end: Date }[] {
  const text = ics.replace(/\r?\n[ \t]/g, ''); // unfold long lines
  const out: { start: Date; end: Date }[] = [];
  for (const ev of text.split('BEGIN:VEVENT').slice(1)) {
    const body = ev.split('END:VEVENT')[0];
    if (/^STATUS:CANCELLED/m.test(body) || /^TRANSP:TRANSPARENT/m.test(body)) continue;
    const read = (k: string) => {
      const m = new RegExp(`^${k}(;[^:]*)?:(.+)$`, 'm').exec(body);
      if (!m) return null;
      const v = m[2].trim();
      const d = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v);
      if (!d) return null;
      // All-day entries block the whole day; local times without Z are read as UTC (rare in exports).
      return new Date(Date.UTC(+d[1], +d[2] - 1, +d[3], +(d[4] ?? 0), +(d[5] ?? 0), +(d[6] ?? 0)));
    };
    const start = read('DTSTART');
    const end = read('DTEND') ?? (start ? new Date(start.getTime() + 3_600_000) : null);
    if (start && end && end > start) out.push({ start, end });
  }
  return out;
}

/** Busy times from each resource's linked calendar replace the previously imported ones. */
export async function importCalendars(): Promise<void> {
  const resources = (await listResources(true)).filter((r) => /^https:\/\//.test(r.ical_url));
  for (const r of resources) {
    try {
      const res = await fetch(r.ical_url.replace(/^webcal:/, 'https:'), { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const busy = parseIcsBusy(await res.text()).filter((b) => b.end.getTime() > Date.now() && b.start.getTime() < Date.now() + 180 * 86_400_000);
      await sql.begin(async (tx) => {
        await tx`delete from booking_blocks where resource_id = ${r.id} and source = 'ical'`;
        for (const b of busy.slice(0, 2000)) await tx`insert into booking_blocks (resource_id, starts_at, ends_at, reason, source) values (${r.id}, ${b.start}, ${b.end}, 'Kalender', 'ical')`;
      });
    } catch (e) {
      console.warn(`[booking] Kalender von «${r.name}» nicht lesbar: ${(e as Error).message}`);
    }
  }
  if (resources.length) bumpGeneration();
}

/* ---------- deposit via Stripe ---------- */

export async function depositCheckoutUrl(b: Booking): Promise<string> {
  const s = await getSettings();
  const [service] = await sql`select name from booking_services where id = ${b.service_id}`;
  const fields = new URLSearchParams({
    mode: 'payment',
    success_url: `${base(s)}/buchung/${b.token}?bezahlt=1`,
    cancel_url: `${base(s)}/buchung/${b.token}?abgebrochen=1`,
    customer_email: b.email,
    client_reference_id: b.id,
    'metadata[booking_id]': b.id,
    locale: pageLang(),
    'line_items[0][price_data][currency]': s.shop.currency.toLowerCase(),
    'line_items[0][price_data][unit_amount]': String(b.deposit),
    'line_items[0][price_data][product_data][name]': T('Anzahlung {what} – {when}', { what: service?.name ?? T('Reservation'), when: formatWhen(b.starts_at, s, pageLang()) }),
    'line_items[0][quantity]': '1',
  });
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.stripe.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': `booking-${b.id}` },
    body: fields.toString(),
  });
  const body = (await r.json()) as { url?: string; id?: string; error?: { message: string } };
  if (!r.ok || !body.url) throw badRequest(T('Die Anzahlung konnte nicht gestartet werden: {error}', { error: body.error?.message ?? r.status }));
  await sql`update bookings set payment_ref = ${body.id ?? null} where id = ${b.id}`;
  return body.url;
}

export async function depositPaid(bookingId: string, ref: string): Promise<void> {
  const s = await getSettings();
  const [b] = await sql`
    update bookings set status = ${s.booking.autoConfirm ? 'confirmed' : 'pending'}, payment_ref = ${ref}, updated_at = now()
    where id = ${bookingId} and status = 'awaiting_payment' returning id, status, deposit`;
  if (!b) return;
  bumpGeneration();
  void bookingMail(bookingId, b.status === 'confirmed' ? 'confirmed' : 'received');
  void notify({ kind: 'paid', cap: 'bookings.manage', title: `Anzahlung erhalten: ${formatMoney(b.deposit as number, s.shop.currency)}`, body: 'Die Reservation ist gesichert.', href: '/reservationen' });
}


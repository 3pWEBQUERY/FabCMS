import { randomInt } from 'node:crypto';
import QRCode from 'qrcode';
import { sql, json } from './db';
import { env } from './env';
import { getSettings, bumpGeneration, mainLang } from './settings';
import { token } from './lib/crypto';
import { badRequest, notFound } from './lib/http';
import { sendMail } from './mail';
import { notify } from './notify';
import { formatMoney } from '../shared/text';
import { formatSession, sessionsOf, ticketCategories, MAX_TICKETS_PER_ORDER, type TicketCategory } from '../shared/events';
import type { EntryData, SiteSettings } from '../shared/types';
import { inStoredLang, pageLang, storedLang } from './translations';
import { L, T } from '../site/i18n';

/**
 * Events & Kurse share one engine: an order of one or more tickets for an
 * entry (event or course), free or paid through Stripe. Quotas are checked
 * under a lock, so two buyers can't get the last place twice.
 */

export interface TicketOrder {
  id: string;
  entry_id: string | null;
  entry_title: string;
  name: string;
  email: string;
  phone: string;
  items: { category: string; qty: number; price: number }[];
  total: number;
  currency: string;
  status: 'pending' | 'paid' | 'cancelled';
  token: string;
  payment_ref: string | null;
  source: string;
  created_at: string;
  paid_at: string | null;
}

export interface TicketEntry {
  id: string;
  collection: 'events' | 'courses';
  slug: string;
  data: EntryData;
}

/** Unpaid orders hold their places this long, then they are released. */
export const HOLD_MINUTES = 30;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I: read out loud at the door
const base = (s: SiteSettings) => (s.baseUrl || env.publicUrl).replace(/\/$/, '');

function ticketCode(): string {
  let c = '';
  for (let i = 0; i < 8; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

export async function ticketEntry(id: string): Promise<TicketEntry | null> {
  const [e] = await sql`
    select id, collection, published_slug as slug, published_data as data from entries
    where id = ${id} and status = 'published' and collection in ('events', 'courses')`;
  return (e as unknown as TicketEntry) ?? null;
}

/** Places taken per category: paid tickets plus unpaid ones still on hold. */
export async function takenPerCategory(entryId: string, db: typeof sql = sql): Promise<Map<string, number>> {
  const rows = await db`
    select t.category, count(*)::int as n from tickets t join ticket_orders o on o.id = t.order_id
    where t.entry_id = ${entryId}
      and (o.status = 'paid' or (o.status = 'pending' and o.created_at > now() - make_interval(mins => ${HOLD_MINUTES})))
    group by t.category`;
  return new Map(rows.map((r) => [r.category as string, r.n as number]));
}

export interface Availability extends TicketCategory {
  left: number | null; // null = unlimited
}

export async function availability(entry: TicketEntry): Promise<Availability[]> {
  const taken = await takenPerCategory(entry.id);
  return ticketCategories(entry.data).map((c) => ({ ...c, left: c.capacity === null ? null : Math.max(0, c.capacity - (taken.get(c.name) ?? 0)) }));
}

/** Sales close when the event (or the first course date) begins. */
export function salesOpen(entry: TicketEntry, s: SiteSettings, now = new Date()): boolean {
  if (entry.data.cancelled) return false;
  const first = sessionsOf(entry.data, s.timezone)[0];
  return Boolean(first) && first.start.getTime() > now.getTime();
}

export function describeWhen(entry: Pick<TicketEntry, 'data'>, s: SiteSettings): string {
  const sessions = sessionsOf(entry.data, s.timezone);
  if (!sessions.length) return '';
  if (sessions.length === 1) return formatSession(sessions[0], s.timezone, L());
  return T('{n} Termine ab {date}', { n: sessions.length, date: formatSession(sessions[0], s.timezone, L()) });
}

export async function createTicketOrder(input: {
  entryId: string;
  quantities: Record<string, number>;
  name: string;
  email: string;
  phone?: string;
  source?: 'web' | 'admin';
  /** Staff may add guests to a sold-out list or after sales closed. */
  override?: boolean;
}): Promise<TicketOrder> {
  const s = await getSettings();
  const entry = await ticketEntry(input.entryId);
  if (!entry) throw notFound();
  const name = input.name.trim().slice(0, 120);
  const email = input.email.trim().toLowerCase().slice(0, 200);
  if (!name) throw badRequest(T('Bitte gib deinen Namen an.'));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw badRequest(T('Bitte gib eine gültige E-Mail-Adresse an – dorthin schicken wir die Tickets.'));
  if (!input.override && !salesOpen(entry, s)) throw badRequest(T(entry.data.cancelled ? 'Dieser Anlass ist abgesagt.' : 'Die Anmeldung ist geschlossen.'));
  const categories = ticketCategories(entry.data);
  const items = categories.map((c) => ({ category: c.name, qty: Math.max(0, Math.floor(Number(input.quantities[c.name]) || 0)), price: c.price })).filter((i) => i.qty > 0);
  const count = items.reduce((n, i) => n + i.qty, 0);
  if (!count) throw badRequest(T('Wähle mindestens ein Ticket.'));
  if (count > MAX_TICKETS_PER_ORDER && !input.override) throw badRequest(T('Pro Bestellung gehen höchstens {max} Tickets.', { max: MAX_TICKETS_PER_ORDER }));
  const total = items.reduce((n, i) => n + i.qty * i.price, 0);
  if (total > 0 && !env.stripe.secretKey && input.source !== 'admin') throw badRequest(T('Die Online-Zahlung ist gerade nicht eingerichtet. Melde dich bitte direkt bei uns.'));

  const order = await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('nova-tickets'))`;
    if (!input.override) {
      const taken = await takenPerCategory(entry.id, tx as unknown as typeof sql);
      for (const i of items) {
        const cat = categories.find((c) => c.name === i.category)!;
        if (cat.capacity === null) continue;
        const left = cat.capacity - (taken.get(cat.name) ?? 0);
        if (left < i.qty) throw badRequest(left <= 0 ? T('«{name}» ist ausverkauft.', { name: cat.name }) : T('Für «{name}» sind nur noch {n} Plätze frei.', { name: cat.name, n: left }));
      }
    }
    // Free tickets and those the team issues at the box office count as paid right away.
    const paid = total === 0 || input.source === 'admin';
    const [o] = await tx`
      insert into ticket_orders (entry_id, entry_title, name, email, phone, items, total, currency, status, token, source, paid_at, lang)
      values (${entry.id}, ${entry.data.title}, ${name}, ${email}, ${(input.phone ?? '').slice(0, 40)}, ${json(items)}, ${total}, ${s.shop.currency},
        ${paid ? 'paid' : 'pending'}, ${token(18)}, ${input.source ?? 'web'}, ${paid ? new Date() : null}, ${input.source === 'admin' ? '' : storedLang()})
      returning *`;
    for (const i of items)
      for (let k = 0; k < i.qty; k++) await tx`insert into tickets (order_id, entry_id, category, code) values (${o.id}, ${entry.id}, ${i.category}, ${ticketCode()})`;
    return o as unknown as TicketOrder;
  });
  bumpGeneration();
  if (order.status === 'paid') await afterPaid(order);
  return order;
}

async function afterPaid(o: TicketOrder): Promise<void> {
  await ticketMail(o.id);
  const n = o.items.reduce((k, i) => k + i.qty, 0);
  void notify({
    kind: 'order',
    cap: 'events.manage',
    title: `${n} ${n === 1 ? 'Ticket' : 'Tickets'}: ${o.entry_title}`,
    body: `${o.name}${o.total ? ` · ${formatMoney(o.total, o.currency)}` : ''}`,
    href: `/tickets?event=${o.entry_id}`,
  });
}

export async function orderByToken(t: string): Promise<TicketOrder | null> {
  const [o] = await sql`select * from ticket_orders where token = ${t}`;
  return (o as unknown as TicketOrder) ?? null;
}

export async function ticketsOf(orderId: string) {
  return sql`select id, category, code, checked_in_at from tickets where order_id = ${orderId} order by category, created_at`;
}

/** SVG QR code that opens the check-in page in the admin when scanned with any phone camera. */
export async function ticketQr(code: string, s: SiteSettings): Promise<string> {
  return QRCode.toString(`${base(s)}/admin/einlass?code=${code}`, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } });
}

export async function ticketCheckoutUrl(o: TicketOrder): Promise<string> {
  const s = await getSettings();
  const fields: Record<string, string | number> = {
    mode: 'payment',
    success_url: `${base(s)}/tickets/${o.token}?bezahlt=1`,
    cancel_url: `${base(s)}/tickets/${o.token}?abgebrochen=1`,
    customer_email: o.email,
    client_reference_id: o.id,
    'metadata[ticket_order_id]': o.id,
    // Stripe ends the session with our hold, so nobody pays for places that were released.
    expires_at: Math.floor(Date.now() / 1000) + HOLD_MINUTES * 60 + 60,
    locale: pageLang(),
  };
  o.items
    .filter((i) => i.price > 0)
    .forEach((i, k) => {
      fields[`line_items[${k}][price_data][currency]`] = o.currency.toLowerCase();
      fields[`line_items[${k}][price_data][unit_amount]`] = i.price;
      fields[`line_items[${k}][price_data][product_data][name]`] = `${o.entry_title} – ${i.category}`;
      fields[`line_items[${k}][quantity]`] = i.qty;
    });
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.stripe.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': `tickets-${o.id}` },
    body: Object.entries(fields)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&'),
  });
  const body = (await r.json()) as { url?: string; id?: string; error?: { message: string } };
  if (!r.ok || !body.url) throw badRequest(T('Die Zahlung konnte nicht gestartet werden: {error}', { error: body.error?.message ?? r.status }));
  await sql`update ticket_orders set payment_ref = ${body.id ?? null} where id = ${o.id}`;
  return body.url;
}

export async function ticketsPaid(orderId: string, ref: string): Promise<void> {
  const [o] = await sql`
    update ticket_orders set status = 'paid', paid_at = now(), payment_ref = ${ref}
    where id = ${orderId} and status = 'pending' returning *`;
  if (!o) {
    // Paid after the hold ran out: the places were released. Take them back if still free, else tell the team.
    const [late] = await sql`select * from ticket_orders where id = ${orderId} and status = 'cancelled'`;
    if (late) {
      await sql`update ticket_orders set status = 'paid', paid_at = now(), payment_ref = ${ref} where id = ${orderId}`;
      void notify({
        kind: 'system',
        cap: 'events.manage',
        title: `Späte Zahlung: ${late.name}`,
        body: `${late.entry_title} – bitte prüfen, ob noch Platz ist.`,
        href: `/tickets?event=${late.entry_id}`,
      });
      await afterPaid({ ...(late as unknown as TicketOrder), status: 'paid' });
    }
    return;
  }
  bumpGeneration();
  await afterPaid(o as unknown as TicketOrder);
}

/** Scheduler: unpaid orders give their places back after the hold. */
export async function releaseUnpaidTickets(): Promise<number> {
  const rows = await sql`
    update ticket_orders set status = 'cancelled'
    where status = 'pending' and created_at < now() - make_interval(mins => ${HOLD_MINUTES + 5}) returning entry_id`;
  if (rows.length) {
    bumpGeneration();
    for (const id of new Set(rows.map((r) => r.entry_id as string))) await offerFreedPlaces(id);
  }
  return rows.length;
}

export async function cancelTicketOrder(orderId: string): Promise<TicketOrder> {
  const [o] = await sql`update ticket_orders set status = 'cancelled' where id = ${orderId} and status <> 'cancelled' returning *`;
  if (!o) throw badRequest('Diese Bestellung ist schon storniert.');
  bumpGeneration();
  const s = await getSettings();
  await sendMail({
    to: o.email as string,
    subject: T('Storniert: {title}', { title: o.entry_title }),
    replyTo: s.business.email || undefined,
    kind: 'tickets',
    vars: { name: String(o.name).split(' ')[0], title: String(o.entry_title) },
    text: [
      T('Hallo {name},', { name: String(o.name).split(' ')[0] }),
      '',
      `${T('deine Tickets für «{title}» sind storniert.', { title: o.entry_title })}${o.total ? ` ${T('Eine Rückzahlung erhältst du auf dem gleichen Weg, wie du bezahlt hast.')}` : ''}`,
      '',
      s.name,
    ].join('\n'),
  });
  if (o.entry_id) await offerFreedPlaces(o.entry_id as string);
  return o as unknown as TicketOrder;
}

/** A place freed up: the first people on the waitlist hear about it (first come, first served). */
export async function offerFreedPlaces(entryId: string): Promise<void> {
  const entry = await ticketEntry(entryId);
  const s = await getSettings();
  if (!entry || !salesOpen(entry, s)) return;
  const free = (await availability(entry)).reduce((n, a) => n + (a.left ?? 99), 0);
  if (!free) return;
  const path = `/${entry.collection === 'events' ? 'events' : 'kurse'}/${entry.slug}`;
  const waiting = await sql`
    update ticket_waitlist set notified_at = now()
    where id in (select id from ticket_waitlist where entry_id = ${entryId} and notified_at is null order by created_at limit ${Math.min(free, 20)})
    returning name, email`;
  for (const w of waiting)
    await sendMail({
      to: w.email as string,
      subject: T('Ein Platz ist frei: {title}', { title: entry.data.title }),
      replyTo: s.business.email || undefined,
      kind: 'tickets',
      vars: { name: String(w.name).split(' ')[0], title: String(entry.data.title ?? '') },
      text: [
        T('Hallo {name},', { name: String(w.name).split(' ')[0] }),
        '',
        T('für «{title}» ({when}) ist wieder ein Platz frei. Wer zuerst kommt …', { title: entry.data.title, when: describeWhen(entry, s) }),
        '',
        `${base(s)}${path}#tickets`,
        '',
        s.name,
      ].join('\n'),
    });
}

export async function joinWaitlist(entryId: string, name: string, email: string): Promise<void> {
  const entry = await ticketEntry(entryId);
  if (!entry || entry.data.waitlist === false) throw notFound();
  const e = email.trim().toLowerCase();
  if (!name.trim()) throw badRequest(T('Bitte gib deinen Namen an.'));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw badRequest(T('Bitte gib eine gültige E-Mail-Adresse an.'));
  await sql`
    insert into ticket_waitlist (entry_id, name, email) values (${entryId}, ${name.trim().slice(0, 120)}, ${e})
    on conflict (entry_id, lower(email)) do update set notified_at = null`;
}

export interface CheckInResult {
  status: 'ok' | 'already' | 'unpaid' | 'cancelled' | 'unknown';
  code: string;
  ticket?: { category: string; name: string; entry_title: string; entry_id: string | null; checked_in_at: string | null };
  progress?: { checked: number; total: number };
}

/** At the door: one scan, one answer. A second scan of the same code says when it was used. */
export async function checkIn(rawCode: string, userId: string): Promise<CheckInResult> {
  const code = rawCode
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^(.{4})(.{4})$/, '$1-$2');
  const [t] = await sql`
    select t.id, t.category, t.checked_in_at, t.entry_id, o.name, o.entry_title, o.status
    from tickets t join ticket_orders o on o.id = t.order_id where t.code = ${code}`;
  if (!t) return { status: 'unknown', code };
  const ticket = {
    category: t.category as string,
    name: t.name as string,
    entry_title: t.entry_title as string,
    entry_id: t.entry_id as string | null,
    checked_in_at: t.checked_in_at as string | null,
  };
  const progress = async () => {
    const [p] = await sql`
      select count(*) filter (where t.checked_in_at is not null)::int as checked, count(*)::int as total
      from tickets t join ticket_orders o on o.id = t.order_id where t.entry_id = ${t.entry_id} and o.status = 'paid'`;
    return { checked: p.checked as number, total: p.total as number };
  };
  if (t.status === 'cancelled') return { status: 'cancelled', code, ticket };
  if (t.status !== 'paid') return { status: 'unpaid', code, ticket };
  if (t.checked_in_at) return { status: 'already', code, ticket, progress: await progress() };
  const [done] = await sql`update tickets set checked_in_at = now(), checked_in_by = ${userId} where id = ${t.id} and checked_in_at is null returning checked_in_at`;
  if (!done) return { status: 'already', code, ticket, progress: await progress() };
  return { status: 'ok', code, ticket: { ...ticket, checked_in_at: done.checked_in_at as string }, progress: await progress() };
}

export async function ticketMail(orderId: string): Promise<void> {
  const s = await getSettings();
  const [o] = await sql`select * from ticket_orders where id = ${orderId}`;
  if (!o) return;
  if ((o.lang || mainLang()) !== pageLang()) return inStoredLang(o.lang as string, () => ticketMail(orderId));
  const entry = o.entry_id ? await ticketEntry(o.entry_id as string) : null;
  const list = await ticketsOf(o.id as string);
  const when = entry ? describeWhen(entry, s) : '';
  const where = entry ? [entry.data.venue, entry.data.address || [s.business.street, s.business.city].filter(Boolean).join(', ')].filter(Boolean).join(', ') : '';
  await sendMail({
    to: o.email as string,
    subject: T(list.length === 1 ? 'Dein Ticket: {title}' : 'Deine Tickets: {title}', { title: o.entry_title }),
    replyTo: s.business.email || undefined,
    kind: 'tickets',
    vars: { name: String(o.name).split(' ')[0], title: String(o.entry_title) },
    text: [
      T('Hallo {name},', { name: String(o.name).split(' ')[0] }),
      '',
      T(list.length === 1 ? 'danke! Dein Platz ist reserviert:' : 'danke! Deine {n} Plätze sind reserviert:', { n: list.length }),
      '',
      String(o.entry_title),
      when,
      where,
      '',
      ...list.map((t) => `${t.category}: ${t.code}`),
      '',
      T('Tickets mit QR-Code (zum Vorzeigen am Eingang oder Ausdrucken):'),
      `${base(s)}/tickets/${o.token}`,
      '',
      s.name,
    ]
      .filter((l) => l !== undefined)
      .join('\n'),
    attachments: entry ? [{ filename: 'termin.ics', content: entryIcs(entry, s), contentType: 'text/calendar' }] : undefined,
  });
}

/* ---------- calendar ---------- */

const icsDate = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
const icsText = (v: unknown) =>
  String(v ?? '')
    .replace(/[\\;,]/g, (m) => `\\${m}`)
    .replace(/\n/g, '\\n');

export function entryIcs(entry: TicketEntry, s: SiteSettings): string {
  const url = `${base(s)}/${entry.collection === 'events' ? 'events' : 'kurse'}/${entry.slug}`;
  const location = [entry.data.venue, entry.data.address || [s.business.street, `${s.business.zip} ${s.business.city}`.trim()].filter(Boolean).join(', ')]
    .filter(Boolean)
    .join(', ');
  const events = sessionsOf(entry.data, s.timezone).map((x, i) =>
    [
      'BEGIN:VEVENT',
      `UID:${entry.id}-${i}@nova`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(x.start)}`,
      `DTEND:${icsDate(x.end ?? new Date(x.start.getTime() + 2 * 3_600_000))}`,
      `SUMMARY:${icsText(entry.data.title)}`,
      location ? `LOCATION:${icsText(location)}` : '',
      `URL:${url}`,
      entry.data.cancelled ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
      'END:VEVENT',
    ]
      .filter(Boolean)
      .join('\r\n'),
  );
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//Nova//${icsText(s.name)}//DE`, 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR'].join('\r\n');
}

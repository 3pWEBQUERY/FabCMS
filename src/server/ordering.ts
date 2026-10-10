import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { inStoredLang, localized, pageLang, storedLang } from './translations';
import { sql, json } from './db';
import { env } from './env';
import { appSecret, getSettings, mainLang } from './settings';
import { sign, token, unsign } from './lib/crypto';
import { badRequest, notFound } from './lib/http';
import { sendMail } from './mail';
import { notify } from './notify';
import { formatMoney } from '../shared/text';
import { localDay } from '../shared/booking';
import { FOOD_STATUS, foodTotals, orderSlots, type FoodLine } from '../shared/ordering';
import type { EntryData, SiteSettings } from '../shared/types';
import type { Lang } from '../shared/i18n';
import { L, T } from '../site/i18n';

/** Bestellung & Lieferung: a small cart of dishes, a time slot, pickup or delivery, pay online or on site. */

export const FOOD_COOKIE = 'nova_food';
const HOLD_MINUTES = 30;
const base = (s: SiteSettings) => (s.baseUrl || env.publicUrl).replace(/\/$/, '');

export interface FoodCartItem {
  d: string; // dish entry id
  s: number; // index of the price (size)
  q: number;
}

export interface FoodOrder {
  id: string;
  number: number;
  mode: 'pickup' | 'delivery';
  slot_at: string;
  name: string;
  phone: string;
  email: string;
  street: string;
  zip: string;
  city: string;
  note: string;
  items: FoodLine[];
  subtotal: number;
  delivery_fee: number;
  total: number;
  vat: { rate: number; amount: number }[];
  currency: string;
  payment: 'online' | 'onsite';
  status: keyof typeof FOOD_STATUS;
  token: string;
  created_at: string;
  paid_at: string | null;
}

/* ---------- cart (signed cookie, works without JavaScript) ---------- */

export async function readFoodCart(c: Context): Promise<FoodCartItem[]> {
  const v = unsign(getCookie(c, FOOD_COOKIE), await appSecret());
  if (!v) return [];
  try {
    const items = JSON.parse(Buffer.from(v, 'base64url').toString('utf8')) as FoodCartItem[];
    return Array.isArray(items) ? items.filter((i) => /^[0-9a-f-]{36}$/.test(i.d) && Number.isInteger(i.s) && Number.isInteger(i.q) && i.q > 0).slice(0, 40) : [];
  } catch {
    return [];
  }
}

export async function writeFoodCart(c: Context, items: FoodCartItem[]): Promise<void> {
  setCookie(c, FOOD_COOKIE, sign(Buffer.from(JSON.stringify(items.slice(0, 40))).toString('base64url'), await appSecret()), {
    httpOnly: true,
    sameSite: 'Lax',
    secure: env.production,
    path: '/',
    maxAge: 60 * 60 * 12,
  });
}

export interface Dish {
  id: string;
  data: EntryData;
}

export async function orderableDishes(): Promise<Dish[]> {
  const rows = await sql`
    select id, published_data as data from entries
    where collection = 'dishes' and status = 'published' and coalesce(published_data ->> 'online', 'true') <> 'false'
    order by sort_index, published_data ->> 'title'`;
  return localized(rows as unknown as Dish[], 'dishes');
}

function pricesOf(d: EntryData): { label: string; price: number }[] {
  return ((d.prices as { label?: string; price?: number }[] | undefined) ?? [])
    .map((p) => ({ label: String(p.label ?? ''), price: Math.round(Number(p.price) || 0) }))
    .filter((p) => p.price > 0);
}

/** Current lines of the cart; dishes that went offline or sold out drop out. */
export async function cartLines(items: FoodCartItem[]): Promise<FoodLine[]> {
  if (!items.length) return [];
  const rows = await sql`
    select id, published_data as data from entries
    where id = any(${items.map((i) => i.d)}::uuid[]) and collection = 'dishes' and status = 'published'`.then((r) => localized(r as unknown as Dish[], 'dishes'));
  const lines: FoodLine[] = [];
  for (const i of items) {
    const r = rows.find((x) => x.id === i.d);
    if (!r || r.data.soldOut || r.data.online === false) continue;
    const p = pricesOf(r.data)[i.s];
    if (!p) continue;
    lines.push({ id: i.d, title: String(r.data.title), size: p.label, price: p.price, q: Math.min(50, i.q), vat: r.data.vat === 'standard' ? 'standard' : 'reduced', s: i.s });
  }
  return lines;
}

export function addToFoodCart(items: FoodCartItem[], add: FoodCartItem): FoodCartItem[] {
  const hit = items.find((i) => i.d === add.d && i.s === add.s);
  if (hit) hit.q = Math.min(50, hit.q + add.q);
  else items.push({ ...add, q: Math.min(50, add.q) });
  return items.filter((i) => i.q > 0);
}

export function slotsNow(s: SiteSettings, now = new Date(), lang?: Lang) {
  return orderSlots({ hours: s.hours, timeZone: s.timezone, now, prepMinutes: s.ordering.prepMinutes, slotMinutes: s.ordering.slotMinutes, days: 2, lang });
}

export function deliversTo(s: SiteSettings, zip: string): boolean {
  return s.ordering.delivery && s.ordering.deliveryZips.includes(zip.trim());
}

/* ---------- placing an order ---------- */

export async function placeFoodOrder(input: {
  cart: FoodCartItem[];
  mode: string;
  slot: string;
  name: string;
  phone: string;
  email: string;
  street?: string;
  zip?: string;
  city?: string;
  note?: string;
  payment: string;
}): Promise<FoodOrder> {
  const s = await getSettings();
  const o = s.ordering;
  if (o.paused) throw badRequest(T('Die Küche nimmt gerade keine Bestellungen an. Bitte versuch es etwas später.'));
  const mode = input.mode === 'delivery' ? 'delivery' : 'pickup';
  if (mode === 'pickup' && !o.pickup) throw badRequest(T('Abholen ist gerade nicht möglich.'));
  if (mode === 'delivery' && !o.delivery) throw badRequest(T('Liefern ist gerade nicht möglich.'));
  const lines = await cartLines(input.cart);
  if (!lines.length) throw badRequest(T('Der Warenkorb ist leer – oder ein Gericht ist inzwischen ausverkauft.'));
  const slot = slotsNow(s)
    .flatMap((d) => d.slots)
    .find((x) => x.at === input.slot);
  if (!slot) throw badRequest(T('Diese Zeit ist nicht mehr möglich. Bitte wähle eine andere.'));
  const name = input.name.trim().slice(0, 120);
  const phone = input.phone.trim().slice(0, 40);
  const email = input.email.trim().toLowerCase().slice(0, 200);
  if (!name) throw badRequest(T('Bitte gib deinen Namen an.'));
  if (phone.replace(/\D/g, '').length < 9) throw badRequest(T('Bitte gib eine Telefonnummer an – falls etwas ist, rufen wir an.'));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw badRequest(T('Bitte gib eine gültige E-Mail-Adresse an.'));
  const zip = (input.zip ?? '').trim();
  if (mode === 'delivery') {
    if (!(input.street ?? '').trim() || !zip) throw badRequest(T('Bitte gib die Lieferadresse an.'));
    if (!deliversTo(s, zip)) throw badRequest(T('Nach {zip} liefern wir leider nicht. Möglich: {zips}. Oder hol die Bestellung ab.', { zip, zips: o.deliveryZips.join(', ') }));
  }
  const fee = mode === 'delivery' ? o.deliveryFee : 0;
  const totals = foodTotals(lines, fee, s.shop.vatRates);
  if (mode === 'delivery' && totals.subtotal < o.deliveryMin)
    throw badRequest(
      T('Liefern ab {min} Bestellwert. Es fehlen noch {missing}.', { min: formatMoney(o.deliveryMin, s.shop.currency), missing: formatMoney(o.deliveryMin - totals.subtotal, s.shop.currency) }),
    );
  const payment = input.payment === 'onsite' ? 'onsite' : 'online';
  if (payment === 'online' && !env.stripe.secretKey) throw badRequest(T('Online bezahlen geht gerade nicht. Bitte wähle «vor Ort bezahlen».'));
  if (payment === 'onsite' && !o.payOnSite) throw badRequest(T('Bitte bezahle online.'));

  const order = await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('nova-food-orders'))`;
    // Numbers start at 1 every day (local time): easy to call out at the counter.
    const today = localDay(new Date(), s.timezone).day;
    const [n] = await tx`
      select coalesce(max(number), 0) + 1 as next from food_orders
      where (created_at at time zone ${s.timezone})::date = ${today}::date`;
    const [row] = await tx`
      insert into food_orders (number, mode, slot_at, name, phone, email, street, zip, city, note, items, subtotal, delivery_fee, total, vat, currency, payment, status, token, lang)
      values (${n.next}, ${mode}, ${slot.at}, ${name}, ${phone}, ${email}, ${(input.street ?? '').trim().slice(0, 120)}, ${zip.slice(0, 12)}, ${(input.city ?? '').trim().slice(0, 80)},
        ${(input.note ?? '').trim().slice(0, 500)}, ${json(lines.map(({ s: _s, ...l }) => l))}, ${totals.subtotal}, ${fee}, ${totals.total}, ${json(totals.vat)}, ${s.shop.currency}, ${payment},
        ${payment === 'online' ? 'pending_payment' : 'new'}, ${token(18)}, ${storedLang()})
      returning *`;
    return row as unknown as FoodOrder;
  });
  if (order.status === 'new') await announce(order);
  return order;
}

async function announce(o: FoodOrder): Promise<void> {
  const s = await getSettings();
  const when = new Date(o.slot_at).toLocaleTimeString('de-CH', { timeZone: s.timezone, hour: '2-digit', minute: '2-digit' });
  void notify({
    kind: 'order',
    cap: 'orders.manage',
    title: `Bestellung ${o.number}: ${o.mode === 'delivery' ? 'Lieferung' : 'Abholung'} ${when}`,
    body: `${o.name} · ${formatMoney(o.total, o.currency)}${o.payment === 'onsite' ? ' (vor Ort)' : ''}`,
    href: '/kueche',
  });
  await foodMail(o, 'received');
}

export async function foodMail(o: FoodOrder, kind: 'received' | 'ready' | 'out' | 'cancelled'): Promise<void> {
  const stored = (o as { lang?: string }).lang;
  if ((stored || mainLang()) !== pageLang()) return inStoredLang(stored, () => foodMail(o, kind));
  const s = await getSettings();
  const when = new Date(o.slot_at).toLocaleString(L(), { timeZone: s.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const n = o.number;
  const lead = {
    received: o.mode === 'delivery' ? T('danke für deine Bestellung Nr. {n}! Wir liefern {when}.', { n, when }) : T('danke für deine Bestellung Nr. {n}! Abholbereit {when}.', { n, when }),
    ready: T('deine Bestellung Nr. {n} ist bereit. Bis gleich!', { n }),
    out: T('deine Bestellung Nr. {n} ist unterwegs zu dir.', { n }),
    cancelled: `${T('deine Bestellung Nr. {n} wurde storniert.', { n })}${o.paid_at ? ` ${T('Den Betrag erstatten wir auf dem gleichen Weg zurück.')}` : ''}`,
  }[kind];
  const lines = o.items.map((l) => `${l.q} × ${l.title}${l.size ? ` (${l.size})` : ''}  ${formatMoney(l.price * l.q, o.currency)}`);
  await sendMail({
    to: o.email,
    subject: {
      received: T('Bestellung Nr. {n} bei {name}', { n, name: s.name }),
      ready: T('Bereit zum Abholen: Nr. {n}', { n }),
      out: T('Unterwegs: Nr. {n}', { n }),
      cancelled: T('Storniert: Nr. {n}', { n }),
    }[kind],
    replyTo: s.business.email || undefined,
    kind: 'food',
    vars: { name: o.name.split(' ')[0], number: n },
    text: [
      T('Hallo {name},', { name: o.name.split(' ')[0] }),
      '',
      lead,
      ...(kind === 'received'
        ? [
            '',
            ...lines,
            o.delivery_fee ? `${T('Lieferung')}  ${formatMoney(o.delivery_fee, o.currency)}` : '',
            `${T('Total')}  ${formatMoney(o.total, o.currency)} – ${o.payment === 'onsite' ? (o.mode === 'delivery' ? T('bezahlen bei Lieferung') : T('bezahlen bei Abholung')) : T('bezahlt')}`,
            '',
            o.mode === 'pickup' && s.business.street ? T('Abholen: {place}', { place: `${s.name}, ${s.business.street}, ${s.business.zip} ${s.business.city}` }) : '',
            T('Status ansehen: {link}', { link: `${base(s)}/essen/${o.token}` }),
          ]
        : []),
      '',
      `${s.name}${s.business.phone ? ` · ${s.business.phone}` : ''}`,
    ]
      .filter((l) => l !== '')
      .join('\n'),
  });
}

export async function foodCheckoutUrl(o: FoodOrder): Promise<string> {
  const s = await getSettings();
  const fields: Record<string, string | number> = {
    mode: 'payment',
    success_url: `${base(s)}/essen/${o.token}?bezahlt=1`,
    cancel_url: `${base(s)}/essen/${o.token}?abgebrochen=1`,
    customer_email: o.email,
    client_reference_id: o.id,
    'metadata[food_order_id]': o.id,
    expires_at: Math.floor(Date.now() / 1000) + HOLD_MINUTES * 60 + 60,
    locale: pageLang(),
  };
  const lines = [
    ...o.items.map((l) => ({ name: `${l.title}${l.size ? ` (${l.size})` : ''}`, amount: l.price, q: l.q })),
    ...(o.delivery_fee ? [{ name: T('Lieferung'), amount: o.delivery_fee, q: 1 }] : []),
  ];
  lines.forEach((l, k) => {
    fields[`line_items[${k}][price_data][currency]`] = o.currency.toLowerCase();
    fields[`line_items[${k}][price_data][unit_amount]`] = l.amount;
    fields[`line_items[${k}][price_data][product_data][name]`] = l.name;
    fields[`line_items[${k}][quantity]`] = l.q;
  });
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.stripe.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': `food-${o.id}` },
    body: Object.entries(fields)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&'),
  });
  const body = (await r.json()) as { url?: string; id?: string; error?: { message: string } };
  if (!r.ok || !body.url) throw badRequest(T('Die Zahlung konnte nicht gestartet werden: {error}', { error: body.error?.message ?? r.status }));
  await sql`update food_orders set payment_ref = ${body.id ?? null} where id = ${o.id}`;
  return body.url;
}

export async function foodPaid(id: string, ref: string): Promise<void> {
  const [o] = await sql`
    update food_orders set status = 'new', paid_at = now(), payment_ref = ${ref}, updated_at = now()
    where id = ${id} and status = 'pending_payment' returning *`;
  if (o) await announce(o as unknown as FoodOrder);
}

export async function foodOrderByToken(t: string): Promise<FoodOrder | null> {
  const [o] = await sql`select * from food_orders where token = ${t}`;
  return (o as unknown as FoodOrder) ?? null;
}

const NEXT: Record<string, string[]> = {
  new: ['preparing', 'cancelled'],
  preparing: ['ready', 'out', 'cancelled'],
  ready: ['done', 'cancelled'],
  out: ['done'],
  done: [],
  pending_payment: ['cancelled'],
  cancelled: [],
};

export async function setFoodStatus(id: string, status: string): Promise<FoodOrder> {
  const [cur] = await sql`select * from food_orders where id = ${id}`;
  if (!cur) throw notFound();
  if (!NEXT[cur.status as string]?.includes(status))
    throw badRequest(`Von «${FOOD_STATUS[cur.status as string].label}» geht es nicht zu «${FOOD_STATUS[status]?.label ?? status}».`);
  const [o] = await sql`update food_orders set status = ${status}, updated_at = now() where id = ${id} returning *`;
  const order = o as unknown as FoodOrder;
  if (status === 'ready' && order.mode === 'pickup') void foodMail(order, 'ready');
  if (status === 'out') void foodMail(order, 'out');
  if (status === 'cancelled' && cur.status !== 'pending_payment') void foodMail(order, 'cancelled');
  return order;
}

/** Scheduler: online orders never paid give up their slot. */
export async function releaseUnpaidFood(): Promise<void> {
  await sql`update food_orders set status = 'cancelled', updated_at = now() where status = 'pending_payment' and created_at < now() - make_interval(mins => ${HOLD_MINUTES + 5})`;
}

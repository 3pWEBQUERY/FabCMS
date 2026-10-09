import { createHmac, timingSafeEqual } from 'node:crypto';
import { sql, json } from './db';
import { env } from './env';
import { getSettings, bumpGeneration } from './settings';
import { sign, unsign, token } from './lib/crypto';
import { badRequest } from './lib/http';
import { emit } from './events';
import { notify } from './notify';
import { sendMail } from './mail';
import { formatMoney } from '../shared/text';
import type { EntryData, SiteSettings } from '../shared/types';

/* ---------- Cart cookie ---------- */

export const CART_COOKIE = 'nova_cart';

export interface CartItem {
  p: string; // product entry id
  v: number | null; // variant index
  q: number;
}

export function decodeCart(cookie: string | undefined, secret: string): CartItem[] {
  const value = unsign(cookie, secret);
  if (!value) return [];
  try {
    const items = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as CartItem[];
    return Array.isArray(items)
      ? items
          .filter((i) => typeof i.p === 'string' && /^[0-9a-f-]{36}$/.test(i.p) && Number.isInteger(i.q) && i.q > 0)
          .slice(0, 50)
      : [];
  } catch {
    return [];
  }
}

export function encodeCart(items: CartItem[], secret: string): string {
  return sign(Buffer.from(JSON.stringify(items.slice(0, 50))).toString('base64url'), secret);
}

export function addToCart(items: CartItem[], add: CartItem): CartItem[] {
  const existing = items.find((i) => i.p === add.p && i.v === add.v);
  if (existing) existing.q = Math.min(99, existing.q + add.q);
  else items.push({ ...add, q: Math.min(99, add.q) });
  return items;
}

/* ---------- Quote ---------- */

export interface QuoteLine {
  productId: string;
  variant: number | null;
  title: string;
  variantName: string | null;
  slug: string;
  image: string | null;
  unit: number;
  qty: number;
  total: number;
  vatRate: number;
  digital: boolean;
  available: number | null;
  sku: string;
}

export interface Quote {
  lines: QuoteLine[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  vat: { rate: number; amount: number }[];
  coupon: { code: string; ok: boolean; message: string } | null;
  needsShipping: boolean;
  problems: string[];
  currency: string;
}

type Product = { id: string; slug: string; published_data: EntryData };

function variantOf(p: Product, v: number | null) {
  const variants = (p.published_data.variants as { name: string; price?: number | null; stock?: number | null; sku?: string }[]) ?? [];
  return v === null ? null : variants[v] ?? undefined;
}

export async function quote(
  items: CartItem[],
  opts: { couponCode?: string; shippingMethod?: 'ship' | 'pickup' } = {},
  tx: typeof sql = sql,
): Promise<Quote> {
  const s = await getSettings();
  const ids = [...new Set(items.map((i) => i.p))];
  const products = ids.length
    ? ((await tx`select id, slug, published_data from entries where id = any(${ids}::uuid[]) and collection = 'products' and status = 'published'`) as unknown as Product[])
    : [];
  const problems: string[] = [];
  const lines: QuoteLine[] = [];
  for (const it of items) {
    const p = products.find((x) => x.id === it.p);
    if (!p) {
      problems.push('Ein Produkt in deinem Warenkorb ist nicht mehr erhältlich und wurde entfernt.');
      continue;
    }
    const d = p.published_data;
    const variant = variantOf(p, it.v);
    if (variant === undefined) {
      problems.push(`Die gewählte Variante von «${d.title}» gibt es nicht mehr.`);
      continue;
    }
    const unit = variant?.price ?? (d.price as number);
    const available = variant ? variant.stock ?? null : ((d.stock as number | null | undefined) ?? null);
    let qty = it.q;
    if (available !== null && qty > available) {
      qty = Math.max(0, available);
      problems.push(available === 0 ? `«${d.title}» ist ausverkauft.` : `Von «${d.title}» sind nur noch ${available} Stück da.`);
    }
    if (qty === 0) continue;
    lines.push({
      productId: p.id,
      variant: it.v,
      title: d.title,
      variantName: variant?.name ?? null,
      slug: p.slug,
      image: ((d.images as string[]) ?? [])[0] ?? null,
      unit,
      qty,
      total: unit * qty,
      vatRate: s.shop.vatRates[(d.vat as 'standard' | 'reduced' | 'none') ?? 'standard'] ?? s.shop.vatRates.standard,
      digital: Boolean(d.digital),
      available,
      sku: variant?.sku || (d.sku as string) || '',
    });
  }
  const subtotal = lines.reduce((sum, l) => sum + l.total, 0);

  let discount = 0;
  let coupon: Quote['coupon'] = null;
  if (opts.couponCode?.trim()) {
    const code = opts.couponCode.trim();
    const [c] = await tx`select * from coupons where upper(code) = upper(${code}) and active`;
    if (!c) coupon = { code, ok: false, message: 'Diesen Gutscheincode kennen wir nicht.' };
    else if (c.valid_until && new Date(c.valid_until) < new Date()) coupon = { code, ok: false, message: 'Dieser Gutschein ist abgelaufen.' };
    else if (c.max_uses !== null && c.uses >= c.max_uses) coupon = { code, ok: false, message: 'Dieser Gutschein wurde schon zu oft eingelöst.' };
    else if (subtotal < c.min_total) coupon = { code, ok: false, message: `Dieser Gutschein gilt ab ${formatMoney(c.min_total)} Bestellwert.` };
    else {
      discount = c.kind === 'percent' ? Math.round((subtotal * Math.min(100, c.value)) / 100) : Math.min(subtotal, c.value);
      coupon = { code: c.code, ok: true, message: c.kind === 'percent' ? `${c.value} % Rabatt` : `${formatMoney(c.value)} Rabatt` };
    }
  }

  const needsShipping = lines.some((l) => !l.digital);
  const method = opts.shippingMethod ?? 'ship';
  const afterDiscount = subtotal - discount;
  const shipping =
    needsShipping && method === 'ship' ? (s.shop.shipping.freeFrom !== null && afterDiscount >= s.shop.shipping.freeFrom ? 0 : s.shop.shipping.flat) : 0;
  const total = afterDiscount + shipping;

  // VAT is included in prices (B2C). Discounts reduce each rate proportionally,
  // shipping is taxed at the standard rate.
  const byRate = new Map<number, number>();
  for (const l of lines) byRate.set(l.vatRate, (byRate.get(l.vatRate) ?? 0) + l.total);
  const vat: Quote['vat'] = [];
  for (const [rate, gross] of byRate) {
    const share = subtotal ? gross - Math.round((discount * gross) / subtotal) : 0;
    if (rate > 0) vat.push({ rate, amount: Math.round((share * rate) / (100 + rate)) });
  }
  if (shipping > 0) {
    const rate = s.shop.vatRates.standard;
    const existing = vat.find((v) => v.rate === rate);
    const amount = Math.round((shipping * rate) / (100 + rate));
    if (existing) existing.amount += amount;
    else vat.push({ rate, amount });
  }
  return { lines, subtotal, discount, shipping, total, vat: vat.sort((a, b) => b.rate - a.rate), coupon, needsShipping, problems, currency: s.shop.currency };
}

/* ---------- Stock ---------- */

async function adjustStock(tx: typeof sql, productId: string, variant: number | null, delta: number) {
  // Both the working copy and the live copy carry the stock so the editor stays in sync.
  for (const col of ['data', 'published_data'] as const) {
    const path = variant === null ? '{stock}' : `{variants,${variant},stock}`;
    const c = sql(col);
    await tx`
      update entries set ${c} = jsonb_set(${c}, ${path}::text[], to_jsonb(greatest(0, (${c} #>> ${path}::text[])::int + ${delta})))
      where id = ${productId} and ${c} #>> ${path}::text[] is not null and (${c} #>> ${path}::text[]) ~ '^-?[0-9]+$'`;
  }
}

/* ---------- Orders ---------- */

export interface CheckoutInput {
  email: string;
  name: string;
  phone?: string;
  street?: string;
  zip?: string;
  city?: string;
  country?: string;
  company?: string;
  note?: string;
  shippingMethod: 'ship' | 'pickup';
  payment: 'stripe' | 'invoice';
  coupon?: string;
  acceptTerms: boolean;
}

export function paymentOptions(s: SiteSettings) {
  return {
    stripe: Boolean(env.stripe.secretKey),
    invoice: s.shop.invoiceEnabled,
  };
}

export async function createOrder(items: CartItem[], input: CheckoutInput): Promise<{ id: string; token: string; number: string; total: number }> {
  const s = await getSettings();
  const opts = paymentOptions(s);
  if (input.payment === 'stripe' && !opts.stripe) throw badRequest('Online-Zahlung ist gerade nicht verfügbar.');
  if (input.payment === 'invoice' && !opts.invoice) throw badRequest('Kauf auf Rechnung ist nicht verfügbar.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw badRequest('Bitte gib eine gültige E-Mail-Adresse an.');
  if (!input.name.trim()) throw badRequest('Bitte gib deinen Namen an.');
  if (!input.acceptTerms) throw badRequest('Bitte bestätige die AGB.');

  const result = await sql.begin(async (tx) => {
    const ids = [...new Set(items.map((i) => i.p))];
    if (ids.length) await tx`select id from entries where id = any(${ids}::uuid[]) for update`;
    const q = await quote(items, { couponCode: input.coupon, shippingMethod: input.shippingMethod }, tx as unknown as typeof sql);
    if (!q.lines.length) throw badRequest('Dein Warenkorb ist leer.');
    if (q.problems.length) throw badRequest(q.problems.join(' '));
    if (q.coupon && !q.coupon.ok) throw badRequest(q.coupon.message);
    if (q.needsShipping && input.shippingMethod === 'ship' && !(input.street && input.zip && input.city))
      throw badRequest('Für den Versand brauchen wir Strasse, PLZ und Ort.');
    if (q.needsShipping && input.shippingMethod === 'ship' && !s.shop.shipping.countries.includes(input.country ?? 'CH'))
      throw badRequest('In dieses Land liefern wir leider nicht.');

    for (const l of q.lines) if (l.available !== null) await adjustStock(tx as unknown as typeof sql, l.productId, l.variant, -l.qty);
    if (q.coupon?.ok) await tx`update coupons set uses = uses + 1 where upper(code) = upper(${q.coupon.code})`;

    const [{ n }] = await tx`select nextval('order_number_seq') as n`;
    const number = `${s.shop.orderPrefix}${n}`;
    const orderToken = token(18);
    const customer = {
      name: input.name.trim(),
      company: input.company?.trim() ?? '',
      phone: input.phone?.trim() ?? '',
      street: input.street?.trim() ?? '',
      zip: input.zip?.trim() ?? '',
      city: input.city?.trim() ?? '',
      country: input.country ?? 'CH',
      shippingMethod: input.shippingMethod,
    };
    const [o] = await tx`
      insert into orders (number, token, email, customer, items, subtotal, discount, shipping, total, vat, currency, coupon, payment_method, note)
      values (${number}, ${orderToken}, ${input.email.trim().toLowerCase()}, ${json(customer)}, ${json(q.lines)}, ${q.subtotal}, ${q.discount},
              ${q.shipping}, ${q.total}, ${json(q.vat)}, ${q.currency}, ${q.coupon?.ok ? q.coupon.code : null}, ${input.payment}, ${input.note?.trim() ?? ''})
      returning id`;
    bumpGeneration();
    emit('order.created', { id: o.id, number, total: q.total, email: input.email });
    return { id: o.id as string, token: orderToken, number, total: q.total, lines: q.lines };
  });
  // Told after the commit, so nobody is notified about an order that was rolled back.
  const pay = input.payment === 'invoice' ? 'auf Rechnung' : 'online, Zahlung offen';
  void notify({ kind: 'order', cap: 'orders.view', title: `Neue Bestellung ${result.number}`, body: `${input.name.trim()} · ${formatMoney(result.total, s.shop.currency)} · ${pay}`, href: `/bestellungen/${result.id}` });
  for (const l of result.lines) {
    if (l.available === null) continue;
    const left = Math.max(0, l.available - l.qty);
    if (left > 3) continue;
    const what = `${l.title}${l.variantName ? ` (${l.variantName})` : ''}`;
    void notify({ kind: 'stock', cap: 'orders.view', title: left === 0 ? `Ausverkauft: ${what}` : `Nur noch ${left} an Lager: ${what}`, body: 'Bestand im Produkt anpassen, sobald Nachschub da ist.', href: `/inhalte/products/${l.productId}` });
  }
  return { id: result.id, token: result.token, number: result.number, total: result.total };
}

export async function cancelOrder(orderId: string, reason: string): Promise<void> {
  await sql.begin(async (tx) => {
    const [o] = await tx`select * from orders where id = ${orderId} for update`;
    if (!o || o.status !== 'pending') return;
    for (const l of o.items as QuoteLine[]) if (l.available !== null) await adjustStock(tx as unknown as typeof sql, l.productId, l.variant, l.qty);
    if (o.coupon) await tx`update coupons set uses = greatest(0, uses - 1) where upper(code) = upper(${o.coupon})`;
    await tx`update orders set status = 'cancelled', note = trim(note || ' ' || ${reason}), updated_at = now() where id = ${orderId}`;
  });
  bumpGeneration();
}

export async function markPaid(orderId: string, ref: string): Promise<void> {
  const [o] = await sql`
    update orders set status = 'paid', paid_at = now(), payment_ref = ${ref}, updated_at = now()
    where id = ${orderId} and status = 'pending' returning *`;
  if (!o) return;
  emit('order.paid', { id: o.id, number: o.number, total: o.total, email: o.email });
  void notify({ kind: 'paid', cap: 'orders.view', title: `Bestellung ${o.number} bezahlt`, body: `${(o.customer as { name?: string }).name || o.email} · ${formatMoney(o.total as number, o.currency as string)} – bereit zum Versand.`, href: `/bestellungen/${o.id}` });
  await sql`insert into analytics_events (kind, path, visitor, goal, value_cents) values ('goal', '/kasse', 'server', 'order', ${o.total})`;
  await sendOrderMails(o.id as string);
}

export async function sendOrderMails(orderId: string): Promise<void> {
  const s = await getSettings();
  const [o] = await sql`select * from orders where id = ${orderId}`;
  if (!o) return;
  const lines = (o.items as QuoteLine[]).map((l) => `${l.qty} × ${l.title}${l.variantName ? ` (${l.variantName})` : ''}  ${formatMoney(l.total)}`).join('\n');
  const base = (s.baseUrl || env.publicUrl).replace(/\/$/, '');
  const paid = o.status === 'paid';
  const text = [
    `Hallo ${o.customer.name}`,
    '',
    paid ? `Danke für deine Bestellung ${o.number}. Die Zahlung ist eingegangen.` : `Danke für deine Bestellung ${o.number}.`,
    '',
    lines,
    o.discount ? `Rabatt  −${formatMoney(o.discount)}` : '',
    o.shipping ? `Versand  ${formatMoney(o.shipping)}` : '',
    `Total  ${formatMoney(o.total)} (inkl. MwSt.)`,
    '',
    o.payment_method === 'invoice' && !paid ? `Bitte überweise den Betrag innert 30 Tagen.\n${s.shop.invoiceNote}` : '',
    `Bestellung ansehen: ${base}/bestellung/${o.token}`,
    '',
    s.name,
  ]
    .filter((l) => l !== '')
    .join('\n');
  await sendMail({ to: o.email, subject: `${s.name}: Bestellung ${o.number}`, text, replyTo: s.business.email || undefined });
  const notify = s.shop.notifyEmail || s.business.email;
  if (notify) await sendMail({ to: notify, subject: `Neue Bestellung ${o.number} – ${formatMoney(o.total)}`, text: `${o.customer.name} <${o.email}>\n\n${lines}\n\n${base}/admin/bestellungen` });
}

/* ---------- Stripe (REST, no SDK) ---------- */

function form(obj: Record<string, string | number | undefined>): string {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

export async function stripeCheckoutUrl(orderId: string): Promise<string> {
  const s = await getSettings();
  const [o] = await sql`select * from orders where id = ${orderId}`;
  const base = (s.baseUrl || env.publicUrl).replace(/\/$/, '');
  const fields: Record<string, string | number | undefined> = {
    mode: 'payment',
    success_url: `${base}/bestellung/${o.token}?bezahlt=1`,
    cancel_url: `${base}/bestellung/${o.token}?abgebrochen=1`,
    customer_email: o.email,
    client_reference_id: o.id,
    'metadata[order_id]': o.id,
    locale: 'de',
  };
  const cur = String(o.currency).toLowerCase();
  if (o.discount > 0) {
    // Stripe needs coupon objects for discounts; one summarised line keeps totals exact.
    fields['line_items[0][price_data][currency]'] = cur;
    fields['line_items[0][price_data][unit_amount]'] = o.total;
    fields['line_items[0][price_data][product_data][name]'] = `Bestellung ${o.number}`;
    fields['line_items[0][quantity]'] = 1;
  } else {
    const lines = o.items as QuoteLine[];
    lines.forEach((l, i) => {
      fields[`line_items[${i}][price_data][currency]`] = cur;
      fields[`line_items[${i}][price_data][unit_amount]`] = l.unit;
      fields[`line_items[${i}][price_data][product_data][name]`] = l.variantName ? `${l.title} – ${l.variantName}` : l.title;
      fields[`line_items[${i}][quantity]`] = l.qty;
    });
    if (o.shipping > 0) {
      const i = lines.length;
      fields[`line_items[${i}][price_data][currency]`] = cur;
      fields[`line_items[${i}][price_data][unit_amount]`] = o.shipping;
      fields[`line_items[${i}][price_data][product_data][name]`] = 'Versand';
      fields[`line_items[${i}][quantity]`] = 1;
    }
  }
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.stripe.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': `order-${o.id}` },
    body: form(fields),
  });
  const body = (await r.json()) as { url?: string; id?: string; error?: { message: string } };
  if (!r.ok || !body.url) throw badRequest(`Die Zahlung konnte nicht gestartet werden: ${body.error?.message ?? r.status}`);
  await sql`update orders set payment_ref = ${body.id ?? null} where id = ${o.id}`;
  return body.url;
}

export function verifyStripeSignature(payload: string, header: string | undefined, secret: string, toleranceSec = 300): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return header
    .split(',')
    .filter((p) => p.startsWith('v1='))
    .some((p) => {
      const sig = Buffer.from(p.slice(3));
      const exp = Buffer.from(expected);
      return sig.length === exp.length && timingSafeEqual(sig, exp);
    });
}

export async function handleStripeEvent(event: { type: string; data: { object: Record<string, any> } }): Promise<void> {
  const obj = event.data.object;
  const orderId = (obj.metadata?.order_id ?? obj.client_reference_id) as string | undefined;
  if (!orderId) return;
  switch (event.type) {
    case 'checkout.session.completed':
      if (obj.payment_status === 'paid') await markPaid(orderId, String(obj.payment_intent ?? obj.id));
      break;
    case 'checkout.session.async_payment_succeeded':
      await markPaid(orderId, String(obj.payment_intent ?? obj.id));
      break;
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed':
      await cancelOrder(orderId, 'Zahlung nicht abgeschlossen.');
      break;
  }
}

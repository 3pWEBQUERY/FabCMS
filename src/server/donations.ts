import { sql } from './db';
import { env } from './env';
import { getSettings, bumpGeneration, mainLang } from './settings';
import { token } from './lib/crypto';
import { badRequest, notFound } from './lib/http';
import { sendMail } from './mail';
import { notify } from './notify';
import { formatMoney } from '../shared/text';
import type { SiteSettings } from '../shared/types';
import { html, type Html } from '../site/html';
import { L, T } from '../site/i18n';
import { inStoredLang, pageLang, storedLang } from './translations';

/**
 * Spenden: once or monthly through Stripe. Each collected payment is its own
 * row, so totals, campaigns and annual receipts are simple sums.
 */

export interface Donation {
  id: string;
  amount: number;
  currency: string;
  interval: 'once' | 'month';
  campaign: string;
  name: string;
  email: string;
  street: string;
  zip: string;
  city: string;
  anonymous: boolean;
  message: string;
  status: 'pending' | 'paid' | 'cancelled';
  token: string;
  stripe_subscription: string | null;
  parent_id: string | null;
  subscription_active: boolean;
  created_at: string;
  paid_at: string | null;
}

export const MIN_DONATION = 500; // CHF 5: below that, card fees eat the gift
const MAX_DONATION = 10_000_00 * 10; // CHF 100'000 online; above that, people call
const base = (s: SiteSettings) => (s.baseUrl || env.publicUrl).replace(/\/$/, '');
export const recipientName = (s: SiteSettings) => s.donations.recipient || s.business.legalName || s.name;

/** «50» or «50.–» or «1'000» → cents. */
export function parseAmount(v: unknown): number {
  const s = String(v ?? '')
    .replace(/[’'\s]/g, '')
    .replace(/[.,]–$/, '')
    .replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export async function createDonation(input: {
  amount: number;
  interval: 'once' | 'month';
  campaign: string;
  name: string;
  email: string;
  street?: string;
  zip?: string;
  city?: string;
  anonymous: boolean;
  message?: string;
}): Promise<Donation> {
  const s = await getSettings();
  if (!env.stripe.secretKey) throw badRequest(T('Online-Spenden sind gerade nicht eingerichtet. Danke, wenn du per Überweisung spendest!'));
  if (input.amount < MIN_DONATION) throw badRequest(T('Online geht es ab {min} – darunter fressen die Gebühren die Spende auf.', { min: formatMoney(MIN_DONATION, s.shop.currency) }));
  if (input.amount > MAX_DONATION) throw badRequest(T('Für so grosse Beträge melde dich bitte direkt bei uns. Danke!'));
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw badRequest(T('Bitte gib eine gültige E-Mail-Adresse an – für die Bestätigung.'));
  const [d] = await sql`
    insert into donations (amount, currency, interval, campaign, name, email, street, zip, city, anonymous, message, token, lang)
    values (${input.amount}, ${s.shop.currency}, ${input.interval}, ${input.campaign.slice(0, 120)}, ${input.name.trim().slice(0, 120)}, ${email},
      ${(input.street ?? '').slice(0, 120)}, ${(input.zip ?? '').slice(0, 12)}, ${(input.city ?? '').slice(0, 80)}, ${input.anonymous}, ${(input.message ?? '').slice(0, 500)}, ${token(18)}, ${storedLang()})
    returning *`;
  return d as unknown as Donation;
}

async function stripePost(path: string, fields: Record<string, string | number | undefined>, idem?: string): Promise<Record<string, any>> {
  const r = await fetch(`https://api.stripe.com${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.stripe.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded', ...(idem ? { 'Idempotency-Key': idem } : {}) },
    body: Object.entries(fields)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&'),
  });
  const json = (await r.json()) as Record<string, any>;
  if (!r.ok) throw badRequest(T('Die Zahlung konnte nicht gestartet werden: {error}', { error: json.error?.message ?? r.status }));
  return json;
}

export async function donationCheckoutUrl(d: Donation): Promise<string> {
  const s = await getSettings();
  const monthly = d.interval === 'month';
  const label = `${T('Spende')}${d.campaign ? `: ${d.campaign}` : ''} – ${recipientName(s)}`;
  const body = await stripePost(
    '/v1/checkout/sessions',
    {
      mode: monthly ? 'subscription' : 'payment',
      success_url: `${base(s)}/spende/${d.token}?danke=1`,
      cancel_url: `${base(s)}/spende/${d.token}?abgebrochen=1`,
      customer_email: d.email,
      client_reference_id: d.id,
      'metadata[donation_id]': d.id,
      ...(monthly ? { 'subscription_data[metadata][donation_id]': d.id } : { 'payment_intent_data[metadata][donation_id]': d.id, submit_type: 'donate' }),
      'line_items[0][quantity]': 1,
      'line_items[0][price_data][currency]': d.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': d.amount,
      'line_items[0][price_data][product_data][name]': label,
      ...(monthly ? { 'line_items[0][price_data][recurring][interval]': 'month' } : {}),
      locale: pageLang(),
    },
    `donation-${d.id}`,
  );
  await sql`update donations set stripe_session = ${body.id ?? null} where id = ${d.id}`;
  return body.url as string;
}

async function thankYou(d: Donation, first: boolean): Promise<void> {
  const stored = (d as { lang?: string }).lang;
  if ((stored || mainLang()) !== pageLang()) return inStoredLang(stored, () => thankYou(d, first));
  const s = await getSettings();
  const amount = formatMoney(d.amount, d.currency);
  await sendMail({
    to: d.email,
    subject: first ? T('Danke für deine Spende an {name}', { name: recipientName(s) }) : T('Monatliche Spende: {amount} – danke!', { amount }),
    replyTo: s.business.email || undefined,
    text: [
      d.name ? T('Hallo {name},', { name: d.name.split(' ')[0] }) : T('Hallo,'),
      '',
      first
        ? d.interval === 'month'
          ? d.campaign
            ? T('herzlichen Dank für deine monatliche Spende von {amount} für «{campaign}». Sie kommt an.', { amount, campaign: d.campaign })
            : T('herzlichen Dank für deine monatliche Spende von {amount}. Sie kommt an.', { amount })
          : d.campaign
            ? T('herzlichen Dank für deine Spende von {amount} für «{campaign}». Sie kommt an.', { amount, campaign: d.campaign })
            : T('herzlichen Dank für deine Spende von {amount}. Sie kommt an.', { amount })
        : T('auch diesen Monat sind {amount} bei uns angekommen. Danke, dass du dabei bleibst.', { amount }),
      '',
      T(d.interval === 'month' ? 'Bestätigung und Verwaltung deiner monatlichen Spende: {url}' : 'Bestätigung: {url}', { url: `${base(s)}/spende/${d.token}` }),
      s.donations.taxDeductible ? T('Eine Spendenbestätigung fürs Steueramt kannst du dort ausdrucken; Anfang Jahr schicken wir gern eine fürs ganze Jahr.') : '',
      '',
      recipientName(s),
    ]
      .filter((l) => l !== '')
      .join('\n'),
  });
}

/** checkout.session.completed / async success for one-off donations, first month of monthly ones. */
export async function donationPaid(donationId: string, ref: string, subscription: string | null): Promise<void> {
  const [d] = await sql`
    update donations set status = 'paid', paid_at = now(), payment_ref = ${ref},
      stripe_subscription = coalesce(${subscription}, stripe_subscription), subscription_active = ${Boolean(subscription)}
    where id = ${donationId} and status = 'pending' returning *`;
  if (!d) return;
  bumpGeneration(); // campaign progress
  await thankYou(d as unknown as Donation, true);
  void notify({
    kind: 'paid',
    cap: 'donations.manage',
    title: `Spende: ${formatMoney(d.amount as number, d.currency as string)}${d.interval === 'month' ? ' monatlich' : ''}`,
    body: `${d.anonymous ? 'Anonym' : d.name || d.email}${d.campaign ? ` · ${d.campaign}` : ''}`,
    href: '/spenden',
  });
}

/** invoice.paid for the following months: one new row per month. */
export async function donationRenewed(subscription: string, invoiceId: string, amount: number, billingReason: string): Promise<void> {
  if (billingReason === 'subscription_create') return; // the first month is the original row
  const [first] = await sql`select * from donations where stripe_subscription = ${subscription} and parent_id is null`;
  if (!first) return;
  const [d] = await sql`
    insert into donations (amount, currency, interval, campaign, name, email, street, zip, city, anonymous, message, status, token, stripe_subscription, payment_ref, parent_id, paid_at, lang)
    select ${amount || first.amount}, currency, interval, campaign, name, email, street, zip, city, anonymous, '', 'paid', ${token(18)}, stripe_subscription, ${invoiceId}, id, now(), lang
    from donations where id = ${first.id}
      and not exists (select 1 from donations where payment_ref = ${invoiceId})
    returning *`;
  if (!d) return;
  bumpGeneration();
  await thankYou({ ...(d as unknown as Donation), token: first.token as string }, false);
}

export async function donationSubscriptionEnded(subscription: string): Promise<void> {
  await sql`update donations set subscription_active = false where stripe_subscription = ${subscription}`;
}

/** The donor stops a monthly donation from their private page. */
export async function stopMonthly(t: string): Promise<Donation> {
  const [d] = await sql`select * from donations where token = ${t} and parent_id is null`;
  if (!d) throw notFound();
  if (!d.stripe_subscription || !d.subscription_active) throw badRequest(T('Diese Spende läuft nicht monatlich.'));
  const r = await fetch(`https://api.stripe.com/v1/subscriptions/${d.stripe_subscription}`, { method: 'DELETE', headers: { Authorization: `Bearer ${env.stripe.secretKey}` } });
  if (!r.ok && r.status !== 404) throw badRequest(T('Das hat nicht geklappt. Bitte versuch es später nochmals oder schreib uns.'));
  await donationSubscriptionEnded(d.stripe_subscription as string);
  void notify({
    kind: 'system',
    cap: 'donations.manage',
    title: `Monatliche Spende beendet: ${d.name || d.email}`,
    body: formatMoney(d.amount as number, d.currency as string),
    href: '/spenden',
  });
  return { ...(d as unknown as Donation), subscription_active: false };
}

export async function donationByToken(t: string): Promise<Donation | null> {
  const [d] = await sql`select * from donations where token = ${t}`;
  return (d as unknown as Donation) ?? null;
}

/** Collected so far for a campaign (or everything), and how many people gave. */
export async function campaignTotal(campaign: string): Promise<{ total: number; donors: number }> {
  const [r] = await sql`
    select coalesce(sum(amount), 0)::int as total, count(distinct lower(email))::int as donors
    from donations where status = 'paid' and (${campaign} = '' or campaign = ${campaign})`;
  return { total: r.total as number, donors: r.donors as number };
}

/** Scheduler: checkouts never completed are dropped after a day. */
export async function dropAbandonedDonations(): Promise<void> {
  await sql`delete from donations where status = 'pending' and created_at < now() - interval '1 day'`;
}

/** Printable receipt: one payment, or all of a year (annual receipt for the tax return). */
export function receiptBody(
  s: SiteSettings,
  donor: { name: string; email: string; street: string; zip: string; city: string; currency: string },
  rows: { amount: number; paid_at: string }[],
  period: string | null,
  campaign = '',
): Html {
  const total = rows.reduce((n, r) => n + r.amount, 0);
  const date = (v: unknown) => new Date(v as string).toLocaleDateString(L(), { day: '2-digit', month: '2-digit', year: 'numeric' });
  const address = [donor.name, donor.street, `${donor.zip} ${donor.city}`.trim()].filter(Boolean);
  const issuer = [recipientName(s), s.business.street, `${s.business.zip} ${s.business.city}`.trim()].filter(Boolean);
  const when = period ?? (rows[0] ? T('am {date}', { date: date(rows[0].paid_at) }) : '');
  const confirmed = T(
    rows.length > 1 ? 'Wir bestätigen mit Dank, dass {donor} {when} folgende Spenden an {recipient} geleistet hat:' : 'Wir bestätigen mit Dank, dass {donor} {when} folgende Spende an {recipient} geleistet hat:',
    { donor: donor.name || donor.email, when, recipient: recipientName(s) },
  );
  return html`<div class="wrap receipt">
    <p class="no-print actions"><button class="btn" type="button" onclick="print()">${T('Drucken oder als PDF sichern')}</button></p>
    <header>
      <div><strong>${issuer[0]}</strong>${issuer.slice(1).map((l) => html`<br />${l}`)}</div>
      <div class="receipt-to">${address.map((l, i) => (i ? html`<br />${l}` : html`${l}`))}</div>
    </header>
    <h1>${T('Spendenbestätigung')}</h1>
    <p>${confirmed}</p>
    <table class="receipt-table">
      <thead>
        <tr>
          <th>${T('Datum')}</th>
          <th class="num">${T('Betrag')}</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(
          (r) =>
            html`<tr>
              <td>${date(r.paid_at)}</td>
              <td class="num">${formatMoney(r.amount, donor.currency)}</td>
            </tr>`,
        )}
      </tbody>
      <tfoot>
        <tr>
          <th>${T('Total')}</th>
          <th class="num">${formatMoney(total, donor.currency)}</th>
        </tr>
      </tfoot>
    </table>
    ${campaign ? html`<p>${T('Verwendungszweck: {campaign}', { campaign })}</p>` : ''}
    <p>${T('Es wurden keine Gegenleistungen erbracht.')}${s.donations.receiptNote ? ` ${s.donations.receiptNote}` : ''}</p>
    <p class="muted">${s.business.city ? `${s.business.city}, ` : ''}${date(new Date())} · ${recipientName(s)}</p>
  </div>`;
}

import type { Context, Hono } from 'hono';
import type { AppEnv } from '../auth';
import { html, raw, type Html } from '../../site/html';
import { renderSystemPage } from '../../site/render';
import { getSettings } from '../settings';
import { sql } from '../db';
import { clientIp } from '../lib/http';
import { rateLimit } from '../lib/ratelimit';
import { recordGoal } from '../analytics';
import { formatMoney } from '../../shared/text';
import { createDonation, donationByToken, donationCheckoutUrl, parseAmount, receiptBody, recipientName, stopMonthly } from '../donations';
import { ctxFor, looksLikeSpam, notFoundPage, sendHtml } from './public';
import { creditorOf, QR_BILL_CSS, qrBillHtml } from '../qrbill';
import { isQrIban, qrBillProblems, referenceFor } from '../../shared/qrbill';
import { L, T } from '../../site/i18n';

/** Donation form target, the donor's private page (thank you, monthly, receipt). */
export function donationsPublicRoutes(app: Hono<AppEnv>) {
  const page = async (c: Context, title: string, body: Html) => {
    c.header('Cache-Control', 'no-store');
    return sendHtml(c, await renderSystemPage(await ctxFor(c), { title, body, noindex: true }));
  };

  app.post('/_nova/spenden', async (c) => {
    const s = await getSettings();
    if (!s.modules.includes('donations')) return c.notFound();
    const body = (await c.req.parseBody()) as Record<string, string>;
    const pagePath = String(body._back ?? '/').startsWith('/') ? String(body._back) : '/';
    const block = String(body._block ?? '')
      .replace(/[^\w-]/g, '')
      .slice(0, 40);
    const fail = (msg: string) => {
      const u = new URL(pagePath, 'http://x');
      u.searchParams.set('d_err', msg);
      u.searchParams.set('d_block', block);
      return c.redirect(`${u.pathname}${u.search}#dn-${block}-box`, 303);
    };
    if (looksLikeSpam(body)) return c.redirect(pagePath, 303);
    if (!rateLimit(`donate:${clientIp(c)}`, 6, 10 * 60_000).ok) return fail(T('Zu viele Versuche. Bitte warte ein paar Minuten.'));
    // An own amount wins over the preselected chip.
    const amount = parseAmount(body.own) || parseAmount(body.amount);
    try {
      const d = await createDonation({
        amount,
        interval: body.interval === 'month' ? 'month' : 'once',
        campaign: String(body.campaign ?? ''),
        name: String(body.name ?? ''),
        email: String(body.email ?? ''),
        street: body.street,
        zip: body.zip,
        city: body.city,
        anonymous: body.anonymous === '1',
        message: body.message,
      });
      await recordGoal('donation', clientIp(c), c.req.header('user-agent') ?? '', pagePath, amount);
      return c.redirect(await donationCheckoutUrl(d), 303);
    } catch (e) {
      return fail((e as Error).message);
    }
  });

  /** Payment slip with QR code for donations by bank transfer: the payer fills in the amount. */
  app.get('/_nova/spenden/einzahlungsschein', async (c) => {
    const s = await getSettings();
    const iban = s.donations.iban || s.shop.iban;
    const creditor = { ...creditorOf(s), name: recipientName(s) };
    if (!s.modules.includes('donations') || !iban || qrBillProblems(iban, creditor).length) return notFoundPage(c);
    const campaign = String(c.req.query('kampagne') ?? '').slice(0, 120);
    const ref = referenceFor(iban, isQrIban(iban) ? String(Date.now()).slice(-10) : '');
    const bill = qrBillHtml({ iban, creditor, amount: null, currency: s.shop.currency === 'EUR' ? 'EUR' : 'CHF', debtor: null, reference: ref.value, message: campaign ? `Spende: ${campaign}` : 'Spende' });
    c.header('Cache-Control', 'no-store');
    return c.html(
      html`<!doctype html><html lang="${L()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${T('Einzahlungsschein')} – ${recipientName(s)}</title><style>${raw(
        QR_BILL_CSS,
      )}body{margin:0;background:#f3f2ee;font-family:Arial,Helvetica,sans-serif}.sheet{max-width:210mm;margin:0 auto;padding:12mm 0}.top{padding:0 6mm 10mm}h1{font-size:18pt;margin:0 0 3mm}p{margin:0 0 3mm}button{font:inherit;padding:2mm 4mm}@page{size:A4;margin:0}@media print{body{background:#fff}.top{display:none}.sheet{padding:0;position:fixed;bottom:0}}</style></head><body><div class="sheet"><div class="top"><h1>${T('Danke für deine Spende!')}</h1><p>${T('Scanne den QR-Code mit deiner Banking-App oder drucke den Einzahlungsschein aus. Den Betrag wählst du selbst.')}</p><button onclick="print()">${T('Drucken')}</button></div>${bill}</div></body></html>`.value,
    );
  });

  app.get('/spende/:token', async (c) => {
    const s = await getSettings();
    const d = await donationByToken(c.req.param('token'));
    if (!d) return notFoundPage(c);
    const q = c.req.query();
    const amount = formatMoney(d.amount, d.currency);
    const monthly = d.interval === 'month';
    const months = monthly
      ? await sql`select count(*)::int as n, coalesce(sum(amount), 0)::int as total from donations where (id = ${d.id} or parent_id = ${d.id}) and status = 'paid'`
      : [];
    const status =
      d.status === 'paid'
        ? html`<p class="form-ok" role="status">
            ${q.danke ? `${T('Danke!')} ` : ''}${monthly
              ? d.subscription_active
                ? T('Deine monatliche Spende von {amount} läuft.', { amount })
                : T('Deine monatliche Spende ist beendet. Danke für alles!')
              : T('Deine Spende von {amount} ist angekommen.', { amount })}
          </p>`
        : d.status === 'pending'
          ? q.abgebrochen
            ? html`<p class="form-err" role="status">${T('Die Zahlung wurde abgebrochen – es wurde nichts belastet.')}</p>`
            : html`<p class="muted">${T('Die Zahlung wird noch bestätigt. Das dauert meist nur Sekunden – lade die Seite gleich nochmals.')}</p>`
          : html`<p class="muted">${T('Diese Spende wurde nicht abgeschlossen.')}</p>`;
    const body = html`<div class="wrap acct wide">
      <p class="label">${T('Spende an {name}', { name: recipientName(s) })}</p>
      <h1>${T(d.status === 'paid' ? 'Herzlichen Dank' : 'Deine Spende')}</h1>
      ${status}
      <dl class="booking-facts">
        <div>
          <dt>${T('Betrag')}</dt>
          <dd>${amount}${monthly ? ` ${T('pro Monat')}` : ''}</dd>
        </div>
        ${d.campaign
          ? html`<div>
              <dt>${T('Für')}</dt>
              <dd>${d.campaign}</dd>
            </div>`
          : ''}${monthly && months[0]
          ? html`<div>
              <dt>${T('Bisher')}</dt>
              <dd>${T(months[0].n === 1 ? '{n} Monat' : '{n} Monate', { n: months[0].n as number })}, ${formatMoney(months[0].total as number, d.currency)}</dd>
            </div>`
          : ''}
      </dl>
      <div class="actions">
        ${d.status === 'paid' && s.donations.taxDeductible ? html`<a class="btn-2" href="/spende/${d.token}/bestaetigung">${T('Spendenbestätigung')}</a>` : ''}${monthly &&
        d.subscription_active
          ? q.beenden
            ? ''
            : html`<a class="btn-2" href="/spende/${d.token}?beenden=1#beenden">${T('Monatliche Spende beenden')}</a>`
          : ''}
      </div>
      ${q.beenden && d.subscription_active
        ? html`<form class="bk-confirm" id="beenden" method="post" action="/spende/${d.token}/beenden">
            <p>${T('Ab nächstem Monat wird nichts mehr abgebucht. Bisherige Spenden bleiben – danke dafür!')}</p>
            <div class="actions"><button class="btn">${T('Ja, beenden')}</button><a class="btn-2" href="/spende/${d.token}">${T('Nein, weiter spenden')}</a></div>
          </form>`
        : ''}
    </div>`;
    return page(c, T('Deine Spende'), body);
  });

  app.post('/spende/:token/beenden', async (c) => {
    try {
      await stopMonthly(c.req.param('token'));
      return c.redirect(`/spende/${c.req.param('token')}`, 303);
    } catch (e) {
      return page(c, T('Spende'), html`<div class="wrap acct"><p class="form-err">${(e as Error).message}</p></div>`);
    }
  });

  /** Printable receipt: this payment, or for monthly donations everything of the year asked (?jahr=2026). */
  app.get('/spende/:token/bestaetigung', async (c) => {
    const s = await getSettings();
    const d = await donationByToken(c.req.param('token'));
    if (!d || d.status !== 'paid' || !s.donations.taxDeductible) return notFoundPage(c);
    const year = Number(c.req.query('jahr')) || new Date(d.paid_at ?? d.created_at).getFullYear();
    const rows =
      d.interval === 'month'
        ? await sql`
            select amount, paid_at from donations where (id = ${d.parent_id ?? d.id} or parent_id = ${d.parent_id ?? d.id}) and status = 'paid'
              and extract(year from paid_at) = ${year} order by paid_at`
        : [{ amount: d.amount, paid_at: d.paid_at }];
    const body = receiptBody(s, d, rows as unknown as { amount: number; paid_at: string }[], d.interval === 'month' ? T('im Jahr {year}', { year }) : null, d.campaign);
    return page(c, T('Spendenbestätigung'), body);
  });
}

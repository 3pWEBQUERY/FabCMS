import { raw, html } from '../site/html';
import { themeCss } from '../site/themes';
import { getSettings } from './settings';
import { orderQrBill, type QuoteLine } from './shop';
import { QR_BILL_CSS, qrBillHtml } from './qrbill';
import { formatPrice } from '../shared/text';

/** Printable invoice (A4); open invoices carry the Swiss QR bill at the bottom of the page. */
export async function invoiceHtml(o: Record<string, any>) {
  const s = await getSettings();
  const b = s.business;
  const { css } = themeCss(s);
  const lines = o.items as QuoteLine[];
  // Open invoices get the Swiss QR bill at the bottom of the page.
  const bill = o.status === 'pending' && o.payment_method === 'invoice' ? await orderQrBill(o) : null;
  return html`<!doctype html>
    <html lang="de-CH">
      <head>
        <meta charset="utf-8" />
        <title>Rechnung ${o.number}</title>
        <style>
          ${raw(css)}${raw(QR_BILL_CSS)} .qrb-page {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            justify-content: center;
          }
          @media screen {
            .qrb-page {
              position: static;
              margin-top: 3rem;
            }
          }
          body {
            background: #fff;
            color: #111;
            --bg: #fff;
            --ink: #111;
            --ink-2: #555;
            --line: #ccc;
            font-size: 11pt;
          }
          @page {
            size: A4;
            margin: 18mm;
          }
          .inv {
            max-width: 48rem;
            margin: 0 auto;
            padding: 2rem 0;
          }
          .inv header {
            display: flex;
            justify-content: space-between;
            gap: 2rem;
            margin-bottom: 3rem;
          }
          .inv h1 {
            font-size: 1.8rem;
            margin-bottom: 0.5rem;
          }
          .addr {
            margin: 2rem 0 3rem;
            font-style: normal;
          }
        </style>
      </head>
      <body>
        <div class="inv">
          <header>
            <div>
              <strong style="font-size:1.3rem">${s.name}</strong><br />${b.legalName && b.legalName !== s.name ? html`${b.legalName}<br />` : ''}${b.street}<br />${b.zip}
              ${b.city}<br />${b.email}${b.uid ? html`<br />${b.uid}` : ''}
            </div>
            <div style="text-align:right">
              <h1>Rechnung</h1>
              Nr. ${o.number}<br />${new Date(o.created_at).toLocaleDateString('de-CH')}
            </div>
          </header>
          <address class="addr">
            ${o.customer.company ? html`${o.customer.company}<br />` : ''}${o.customer.name}<br />${o.customer.street}<br />${o.customer.zip} ${o.customer.city}
          </address>
          <table class="cart-table">
            <thead>
              <tr>
                <th>Artikel</th>
                <th class="num">Menge</th>
                <th class="num">Preis</th>
                <th class="num">Total</th>
              </tr>
            </thead>
            <tbody>
              ${lines.map(
                (l) =>
                  html`<tr>
                    <td>${l.title}${l.variantName ? ` (${l.variantName})` : ''}${l.sku ? html`<br /><span class="muted">${l.sku}</span>` : ''}</td>
                    <td class="num">${l.qty}</td>
                    <td class="num">${formatPrice(l.unit)}</td>
                    <td class="num">${formatPrice(l.total)}</td>
                  </tr>`,
              )}
            </tbody>
          </table>
          <div class="totals">
            <div><span>Zwischensumme</span><span>${formatPrice(o.subtotal)}</span></div>
            ${o.discount ? html`<div><span>Rabatt${o.coupon ? ` (${o.coupon})` : ''}</span><span>−${formatPrice(o.discount)}</span></div>` : ''}${o.shipping
              ? html`<div><span>Versand</span><span>${formatPrice(o.shipping)}</span></div>`
              : ''}
            <div class="grand"><span>Total ${o.currency}</span><span>${formatPrice(o.total)}</span></div>
            ${(o.vat as { rate: number; amount: number }[]).map((v) => html`<div class="muted"><span>inkl. ${v.rate}% MwSt.</span><span>${formatPrice(v.amount)}</span></div>`)}
          </div>
          <p style="margin-top:3rem">
            ${o.status === 'pending' && o.payment_method === 'invoice'
              ? html`Zahlbar innert 30 Tagen. <span style="white-space:pre-line">${s.shop.invoiceNote}</span>`
              : `Bezahlt${o.paid_at ? ` am ${new Date(o.paid_at).toLocaleDateString('de-CH')}` : ''}. Danke!`}
          </p>
        </div>
        ${bill ? html`<div class="qrb-page">${qrBillHtml(bill)}</div>` : ''}
      </body>
    </html>`;
}

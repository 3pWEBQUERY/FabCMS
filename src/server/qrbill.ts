import QRCode from 'qrcode';
import { html, raw, type Html } from '../site/html';
import { T } from '../site/i18n';
import { formatIban, formatReference, isQrIban, qrPayload, type QrAddress, type QrBillData } from '../shared/qrbill';
import type { SiteSettings } from '../shared/types';

/**
 * The payment part with receipt, 210 × 105 mm, as the standard lays it out:
 * Arial/Helvetica, fixed type sizes, 46 mm QR code with the Swiss cross,
 * corner marks where the payer writes by hand. Print at 100 %.
 */

/** QR code as SVG, 46 × 46 mm, with the 7 × 7 mm Swiss cross in the middle. */
function qrSvg(payload: string): string {
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const cells: string[] = [];
  for (let y = 0; y < n; y++) {
    let run = -1;
    for (let x = 0; x <= n; x++) {
      const dark = x < n && qr.modules.get(y, x);
      if (dark && run < 0) run = x;
      if (!dark && run >= 0) {
        cells.push(`M${run} ${y}h${x - run}v1h-${x - run}z`);
        run = -1;
      }
    }
  }
  // Cross: 7 mm of 46 mm, white border included (standard: 7 × 7 mm with 0.5 mm white frame).
  const s = (7 / 46) * n;
  const c = n / 2;
  const bar = s * 0.62;
  const arm = s * 0.19;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="46mm" height="46mm" shape-rendering="crispEdges" role="img" aria-label="Swiss QR Code"><path d="${cells.join('')}" fill="#000"/><rect x="${c - s / 2}" y="${c - s / 2}" width="${s}" height="${s}" fill="#fff"/><rect x="${c - s / 2 + s * 0.07}" y="${c - s / 2 + s * 0.07}" width="${s * 0.86}" height="${s * 0.86}" fill="#000"/><rect x="${c - arm / 2}" y="${c - bar / 2}" width="${arm}" height="${bar}" fill="#fff"/><rect x="${c - bar / 2}" y="${c - arm / 2}" width="${bar}" height="${arm}" fill="#fff"/></svg>`;
}

/** Empty field with corner marks, for amount or payer written by hand. */
function corners(wMm: number, hMm: number): Html {
  const l = 3;
  const p = `M0 ${l}V0H${l}M${wMm - l} 0H${wMm}V${l}M${wMm} ${hMm - l}V${hMm}H${wMm - l}M${l} ${hMm}H0V${hMm - l}`;
  // Half the stroke would fall outside the box: widen the view by it.
  return raw(
    `<svg class="qrb-box" width="${wMm}mm" height="${hMm}mm" viewBox="-0.15 -0.15 ${wMm + 0.3} ${hMm + 0.3}" aria-hidden="true"><path d="${p}" fill="none" stroke="#000" stroke-width="0.25" stroke-linecap="square"/></svg>`,
  );
}

const addr = (a: QrAddress) => html`${a.name}<br />${a.street ? html`${a.street}<br />` : ''}${a.country !== 'CH' ? `${a.country}-` : ''}${a.zip} ${a.city}`;
const amountText = (cents: number) => (cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export function qrBillHtml(d: QrBillData): Html {
  const payload = qrPayload(d);
  const refType = isQrIban(d.iban) ? 'QRR' : 'SCOR';
  const ref = d.reference ? formatReference(refType, d.reference) : '';
  const account = html`${formatIban(d.iban)}<br />${addr(d.creditor)}`;
  return html`<section class="qrb" aria-label="${T('Zahlteil QR-Rechnung')}">
    <div class="qrb-receipt">
      <h2>${T('Empfangsschein')}</h2>
      <div class="qrb-info">
        <h3>${T('Konto / Zahlbar an')}</h3>
        <p>${account}</p>
        ${ref
          ? html`<h3>${T('Referenz')}</h3>
              <p>${ref}</p>`
          : ''}
        <h3>${d.debtor ? T('Zahlbar durch') : T('Zahlbar durch (Name/Adresse)')}</h3>
        ${d.debtor ? html`<p>${addr(d.debtor)}</p>` : corners(52, 20)}
      </div>
      <div class="qrb-amount">
        <div>
          <h3>${T('Währung')}</h3>
          <p>${d.currency}</p>
        </div>
        <div>
          <h3>${T('Betrag')}</h3>
          ${d.amount === null ? corners(30, 10) : html`<p>${amountText(d.amount)}</p>`}
        </div>
      </div>
      <p class="qrb-accept">${T('Annahmestelle')}</p>
    </div>
    <div class="qrb-pay">
      <div class="qrb-left">
        <h2>${T('Zahlteil')}</h2>
        <div class="qrb-qr">${raw(qrSvg(payload))}</div>
        <div class="qrb-amount">
          <div>
            <h3>${T('Währung')}</h3>
            <p>${d.currency}</p>
          </div>
          <div>
            <h3>${T('Betrag')}</h3>
            ${d.amount === null ? corners(40, 15) : html`<p>${amountText(d.amount)}</p>`}
          </div>
        </div>
      </div>
      <div class="qrb-info">
        <h3>${T('Konto / Zahlbar an')}</h3>
        <p>${account}</p>
        ${ref
          ? html`<h3>${T('Referenz')}</h3>
              <p>${ref}</p>`
          : ''}${d.message
          ? html`<h3>${T('Zusätzliche Informationen')}</h3>
              <p>${d.message}</p>`
          : ''}
        <h3>${d.debtor ? T('Zahlbar durch') : T('Zahlbar durch (Name/Adresse)')}</h3>
        ${d.debtor ? html`<p>${addr(d.debtor)}</p>` : corners(65, 25)}
      </div>
    </div>
  </section>`;
}

/** Styles in millimetres and points, as the standard asks. Shared by every page that prints a QR bill. */
export const QR_BILL_CSS = `
.qrb{width:210mm;height:105mm;display:flex;box-sizing:border-box;border-top:0.2mm dashed #000;position:relative;font-family:Arial,Helvetica,"Liberation Sans",sans-serif;color:#000;background:#fff;break-inside:avoid;page-break-inside:avoid}
.qrb::before{content:"✂";position:absolute;top:-2.4mm;left:20mm;font-size:3.6mm;line-height:1;background:#fff;font-family:"DejaVu Sans","Segoe UI Symbol",sans-serif}
.qrb h2{font-size:11pt;font-weight:700;margin:0 0 5mm;line-height:1}
.qrb h3{font-weight:700;margin:0;line-height:1.2}
.qrb p{margin:0 0 2.8mm;line-height:1.25;word-break:break-word}
.qrb-receipt{width:62mm;padding:5mm;box-sizing:border-box;border-right:0.2mm dashed #000;display:flex;flex-direction:column}
.qrb-receipt h3{font-size:6pt}.qrb-receipt p{font-size:8pt}
.qrb-receipt .qrb-info{height:56mm;overflow:hidden}
.qrb-pay{width:148mm;padding:5mm;box-sizing:border-box;display:flex;gap:5mm}
.qrb-pay h3{font-size:8pt}.qrb-pay p{font-size:10pt}
.qrb-left{width:51mm;display:flex;flex-direction:column}
.qrb-qr{width:46mm;height:46mm;margin:0 0 5mm}
.qrb-qr svg{display:block}
.qrb-pay .qrb-info{flex:1;min-width:0}
.qrb-amount{display:flex;gap:4mm;align-items:flex-start}
.qrb-amount{gap:0}
.qrb-amount>div:first-child{width:15mm}
.qrb-pay .qrb-amount>div:first-child{width:13mm}
.qrb-left .qrb-amount{width:54mm}
.qrb-box{display:block;margin-top:1mm}
.qrb-accept{margin-top:auto!important;text-align:right;font-size:6pt!important;font-weight:700}
@media print{.qrb{margin:0}}
`;

export function creditorOf(s: SiteSettings): QrAddress {
  return { name: s.business.legalName || s.name, street: s.business.street, zip: s.business.zip, city: s.business.city, country: s.business.country || 'CH' };
}

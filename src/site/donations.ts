import { html, raw, type Html } from './html';
import type { RenderContext } from './context';
import { env } from '../server/env';
import { campaignTotal, MIN_DONATION, parseAmount, recipientName } from '../server/donations';
import { formatMoney } from '../shared/text';
import { validQrIban } from '../shared/qrbill';
import { t } from './i18n';

type P = Record<string, unknown>;

/** Block «Spenden»: amounts as chips, own amount, once or monthly, progress towards the goal. */
export async function donateBlock(ctx: RenderContext, id: string, p: P, head: Html): Promise<Html> {
  const s = ctx.settings;
  const cur = s.shop.currency;
  const campaign = String(p.campaign ?? '').trim();
  const goal = Number(p.goal) || 0;
  const amounts = String(p.amounts ?? '20, 50, 100')
    .split(/[,;\s]+/)
    .map(parseAmount)
    .filter((a) => a >= MIN_DONATION)
    .slice(0, 6);
  const q = ctx.query;
  const err = q.get('d_err') && q.get('d_block') === id ? q.get('d_err') : null;
  const fid = (n: string) => `dn-${id}-${n}`;
  const money = (c: number) => formatMoney(c, cur).replace(/\.00$/, '.–');

  let progress: Html = html``;
  if (goal > 0 || p.showTotal) {
    const sum = await campaignTotal(campaign);
    const pct = goal ? Math.min(100, Math.round((sum.total / goal) * 100)) : 0;
    progress = html`<div class="dn-progress">
      ${goal
        ? html`<div class="dn-bar" role="progressbar" aria-label="${t(ctx, 'Spendenziel')}" aria-valuemin="0" aria-valuemax="${goal / 100}" aria-valuenow="${sum.total / 100}">
            <span style="width:${pct}%"></span>
          </div>`
        : ''}
      <p>
        <strong class="num">${money(sum.total)}</strong>${goal ? html` ${t(ctx, 'von {amount}', { amount: money(goal) })}` : ` ${t(ctx, 'gesammelt')}`}${sum.donors
          ? html` · ${t(ctx, sum.donors === 1 ? '{n} Person hat gespendet' : '{n} Personen haben gespendet', { n: sum.donors })}`
          : ''}
      </p>
    </div>`;
  }

  const iban = s.donations.iban || s.shop.iban;
  const bank = iban
    ? html`<div class="dn-bank"><p class="label">${t(ctx, 'Per Überweisung')}</p><p>${recipientName(s)}<br><span class="num">${iban}</span>${campaign ? html`<br>${t(ctx, 'Vermerk: {campaign}', { campaign })}` : ''}</p>${
        validQrIban(iban) && s.business.zip && s.business.city
          ? html`<p><a class="btn-2" href="/_nova/spenden/einzahlungsschein${campaign ? `?kampagne=${encodeURIComponent(campaign)}` : ''}" target="_blank" rel="nofollow">${t(ctx, 'Einzahlungsschein mit QR-Code')}</a></p>`
          : ''
      }</div>`
    : html``;

  if (!env.stripe.secretKey)
    return html`<div class="wrap dn" id="${fid('box')}">
      ${head}${progress}${bank ||
      html`<p class="muted">${ctx.edit ? 'Für Online-Spenden braucht es Stripe; für Überweisungen trag unter Einstellungen → Spenden die IBAN ein.' : ''}</p>`}
    </div>`;

  const chips = amounts.map(
    (a, i) =>
      html`<label class="dn-chip"
        ><input type="radio" name="amount" value="${a / 100}" ${i === Math.min(1, amounts.length - 1) ? raw(' checked') : ''} /><span>${money(a)}</span></label
      >`,
  );
  return html`<div class="wrap dn" id="${fid('box')}">
    ${head}${progress}
    <form class="nform dn-form" method="post" action="/_nova/spenden">
      ${err ? html`<p class="form-err" role="alert">${err}</p>` : ''}
      <input type="hidden" name="_back" value="${ctx.path}" /><input type="hidden" name="_block" value="${id}" /><input type="hidden" name="campaign" value="${campaign}" /><input
        type="hidden"
        name="_t"
        value="${Date.now().toString(36)}"
      />
      <div class="hp" aria-hidden="true">
        <label>${t(ctx, 'Bitte leer lassen')} <input type="text" name="website" tabindex="-1" autocomplete="off" /></label>
      </div>
      ${p.monthly !== false
        ? html`<fieldset class="dn-interval">
            <legend class="sr">${t(ctx, 'Wie oft?')}</legend>
            <label class="dn-seg"><input type="radio" name="interval" value="once" checked /><span>${t(ctx, 'Einmalig')}</span></label
            ><label class="dn-seg"><input type="radio" name="interval" value="month" /><span>${t(ctx, 'Monatlich')}</span></label>
          </fieldset>`
        : ''}
      <fieldset class="dn-amounts">
        <legend>${t(ctx, 'Betrag')}</legend>
        <div class="dn-chips">
          ${chips}<label class="dn-own" for="${fid('own')}"
            ><span class="sr">${t(ctx, 'Anderer Betrag in {currency}', { currency: cur })}</span><span aria-hidden="true">${cur}</span
            ><input id="${fid('own')}" name="own" inputmode="decimal" placeholder="${t(ctx, 'Anderer Betrag')}" autocomplete="off" maxlength="9"
          /></label>
        </div>
      </fieldset>
      <div class="dn-person">
        <div class="fld"><label for="${fid('name')}">${t(ctx, 'Name')}</label><input id="${fid('name')}" name="name" autocomplete="name" maxlength="120" required /></div>
        <div class="fld"><label for="${fid('email')}">${t(ctx, 'E-Mail')}</label><input id="${fid('email')}" type="email" name="email" autocomplete="email" maxlength="200" required /></div>
      </div>
      ${s.donations.taxDeductible
        ? html`<details class="dn-more">
            <summary>${t(ctx, 'Adresse für die Spendenbestätigung (fürs Steueramt)')}</summary>
            <div class="dn-address">
              <div class="fld"><label for="${fid('street')}">${t(ctx, 'Strasse')}</label><input id="${fid('street')}" name="street" autocomplete="street-address" maxlength="120" /></div>
              <div class="fld"><label for="${fid('zip')}">${t(ctx, 'PLZ')}</label><input id="${fid('zip')}" name="zip" autocomplete="postal-code" maxlength="12" inputmode="numeric" /></div>
              <div class="fld"><label for="${fid('city')}">${t(ctx, 'Ort')}</label><input id="${fid('city')}" name="city" autocomplete="address-level2" maxlength="80" /></div>
            </div>
          </details>`
        : ''}
      <div class="fld check"><input type="checkbox" id="${fid('anon')}" name="anonymous" value="1" /><label for="${fid('anon')}">${t(ctx, 'Meinen Namen nicht öffentlich nennen')}</label></div>
      <div class="dn-submit">
        <button class="btn">${t(ctx, 'Jetzt spenden')}</button>
        <p class="muted">
          ${t(ctx, 'Sicher über Stripe: TWINT, Karte, Apple Pay, Google Pay.')} ${p.monthly !== false ? `${t(ctx, 'Monatliche Spenden lassen sich jederzeit mit einem Klick beenden.')} ` : ''}<a
            href="/datenschutz"
            >${t(ctx, 'Datenschutz')}</a
          >
        </p>
      </div>
    </form>
    ${bank
      ? html`<details class="dn-more">
          <summary>${t(ctx, 'Lieber per Überweisung?')}</summary>
          ${bank}
        </details>`
      : ''}
  </div>`;
}

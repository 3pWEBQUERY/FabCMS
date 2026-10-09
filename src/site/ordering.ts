import { html, raw, type Html } from './html';
import type { RenderContext } from './context';
import { env } from '../server/env';
import { formatMoney } from '../shared/text';
import { ALLERGENS } from '../shared/collections';
import { FOOD_STATUS, foodTotals, type FoodLine, type SlotDay } from '../shared/ordering';
import type { Dish, FoodOrder } from '../server/ordering';
import type { EntryData } from '../shared/types';

/** Bestellung & Lieferung on the website: menu with «+», cart, checkout, live status. Works without JavaScript. */

const money = (ctx: RenderContext, c: number) => formatMoney(c, ctx.settings.shop.currency);
const prices = (d: EntryData) =>
  ((d.prices as { label?: string; price?: number }[] | undefined) ?? [])
    .map((p) => ({ label: String(p.label ?? ''), price: Math.round(Number(p.price) || 0) }))
    .filter((p) => p.price > 0);

function cartBox(ctx: RenderContext, lines: FoodLine[], checkout: boolean): Html {
  const o = ctx.settings.ordering;
  if (!lines.length)
    return html`<aside class="fo-cart" id="warenkorb" aria-labelledby="fo-cart-h">
      <h2 id="fo-cart-h">Deine Bestellung</h2>
      <p class="muted">Noch leer. Tipp auf «+» bei einem Gericht.</p>
    </aside>`;
  const t = foodTotals(lines, 0, ctx.settings.shop.vatRates);
  return html`<aside class="fo-cart" id="warenkorb" aria-labelledby="fo-cart-h">
    <h2 id="fo-cart-h">Deine Bestellung</h2>
    <ul class="fo-lines">
      ${lines.map(
        (l) =>
          html`<li>
            <span class="fo-q num">${l.q}×</span><span class="fo-t">${l.title}${l.size ? html` <span class="muted">${l.size}</span>` : ''}</span
            ><span class="num">${money(ctx, l.price * l.q)}</span>${checkout
              ? ''
              : html`<form method="post" action="/bestellen/menge" class="fo-step">
                  <input type="hidden" name="d" value="${l.id}" /><input type="hidden" name="s" value="${l.s ?? 0}" /><button
                    name="q"
                    value="${l.q - 1}"
                    aria-label="Eins weniger: ${l.title}"
                  >
                    −</button
                  ><button name="q" value="${l.q + 1}" aria-label="Eins mehr: ${l.title}">+</button>
                </form>`}
          </li>`,
      )}
    </ul>
    <p class="fo-sum"><span>Zwischensumme</span><strong class="num">${money(ctx, t.subtotal)}</strong></p>
    ${o.delivery && !checkout ? html`<p class="muted fo-small">Lieferung ${money(ctx, o.deliveryFee)}, ab ${money(ctx, o.deliveryMin)} Bestellwert.</p>` : ''}${checkout
      ? ''
      : html`<a class="btn fo-go" href="/bestellen/kasse">Weiter zur Bestellung</a>`}
  </aside>`;
}

export function orderPage(ctx: RenderContext, dishes: Dish[], lines: FoodLine[], slots: SlotDay[]): Html {
  const o = ctx.settings.ordering;
  const groups = new Map<string, Dish[]>();
  for (const d of dishes) {
    const cat = String(d.data.category || 'Weiteres');
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(d);
  }
  const first = slots[0]?.slots[0];
  const added = ctx.query.get('hinzu');
  const banner = o.paused
    ? html`<p class="form-err" role="status">Die Küche ist gerade voll und nimmt keine neuen Bestellungen an. Bitte versuch es etwas später.</p>`
    : !first
      ? html`<p class="form-err" role="status">Gerade sind keine Bestellungen möglich – schau während der Öffnungszeiten wieder vorbei.</p>`
      : html`<p class="fo-next">
          ${[o.pickup ? 'Abholen' : '', o.delivery ? 'Liefern lassen' : ''].filter(Boolean).join(' oder ')} · frühestens ${slots[0].label.toLowerCase()} ${first.time} Uhr
        </p>`;
  return html`<div class="wrap fo">
    <div class="fo-head">
      <p class="label">${ctx.settings.name}</p>
      <h1>Online bestellen</h1>
      ${banner}${o.note ? html`<p class="muted">${o.note}</p>` : ''}${added
        ? html`<p class="form-ok fo-added" role="status">${added} ist in deiner Bestellung. <a href="#warenkorb">Ansehen</a></p>`
        : ''}
    </div>
    <div class="fo-layout">
      <div class="fo-menu">
        ${[...groups].map(
          ([cat, list]) =>
            html`<section aria-labelledby="fo-${cat.replace(/\W+/g, '-')}">
              <h2 id="fo-${cat.replace(/\W+/g, '-')}">${cat}</h2>
              <ul class="fo-dishes">
                ${list.map((d) => {
                  const ps = prices(d.data);
                  const allergens = ((d.data.allergens as string[]) ?? []).map((a) => ALLERGENS.find((x) => x.value === a)?.short ?? a);
                  return html`<li class="fo-dish${d.data.soldOut ? ' is-off' : ''}" id="d-${d.id}">
                    <div class="fo-dish-text">
                      <strong>${d.data.title}</strong>${d.data.description ? html`<p>${d.data.description as string}</p>` : ''}${allergens.length && ctx.settings.menu.showAllergens
                        ? html`<p class="fo-small muted">Allergene: ${allergens.join(', ')}</p>`
                        : ''}
                    </div>
                    <div class="fo-buy">
                      ${d.data.soldOut
                        ? html`<span class="muted fo-small">Heute ausverkauft</span>`
                        : ps.map(
                            (p, i) =>
                              html`<form method="post" action="/bestellen/dazu">
                                <input type="hidden" name="d" value="${d.id}" /><input type="hidden" name="s" value="${i}" /><button
                                  class="fo-add"
                                  aria-label="${d.data.title}${p.label ? ` ${p.label}` : ''} hinzufügen, ${money(ctx, p.price)}"
                                >
                                  ${p.label ? html`<span class="fo-size">${p.label}</span>` : ''}<span class="num">${money(ctx, p.price)}</span
                                  ><span class="fo-plus" aria-hidden="true">+</span>
                                </button>
                              </form>`,
                          )}
                    </div>
                  </li>`;
                })}
              </ul>
            </section>`,
        )}
      </div>
      ${cartBox(ctx, lines, false)}
    </div>
    ${lines.length
      ? html`<a class="fo-bar" href="#warenkorb"
          ><span>Bestellung ansehen <span class="fo-count">${lines.reduce((n, l) => n + l.q, 0)}</span></span
          ><strong class="num"
            >${money(
              ctx,
              lines.reduce((n, l) => n + l.price * l.q, 0),
            )}</strong
          ></a
        >`
      : ''}
  </div>`;
}

export function checkoutPage(ctx: RenderContext, lines: FoodLine[], slots: SlotDay[], values: Record<string, string>, error: string | null): Html {
  const s = ctx.settings;
  const o = s.ordering;
  const v = (k: string) => values[k] ?? '';
  const mode = v('mode') || (o.pickup ? 'pickup' : 'delivery');
  const online = Boolean(env.stripe.secretKey);
  const payment = v('payment') || (online ? 'online' : 'onsite');
  const radio = (name: string, value: string, label: Html | string, current: string, hint = '') =>
    html`<label class="fo-choice"
      ><input type="radio" name="${name}" value="${value}" ${value === current ? raw(' checked') : ''} required /><span
        ><strong>${label}</strong>${hint ? html`<span class="muted">${hint}</span>` : ''}</span
      ></label
    >`;
  return html`<div class="wrap fo">
    <div class="fo-head">
      <p class="label"><a href="/bestellen">← Zur Karte</a></p>
      <h1>Bestellen</h1>
    </div>
    <div class="fo-layout">
      <form class="nform fo-checkout" method="post" action="/bestellen/kasse">
        ${error ? html`<p class="form-err" role="alert">${error}</p>` : ''}
        <input type="hidden" name="_t" value="${Date.now().toString(36)}" />
        <div class="hp" aria-hidden="true">
          <label>Bitte leer lassen <input type="text" name="website" tabindex="-1" autocomplete="off" /></label>
        </div>
        <fieldset>
          <legend>Wie?</legend>
          <div class="fo-choices">
            ${o.pickup ? radio('mode', 'pickup', 'Abholen', mode, s.business.street ? `${s.business.street}, ${s.business.city}` : '') : ''}${o.delivery
              ? radio('mode', 'delivery', 'Liefern', mode, `${money(ctx, o.deliveryFee)}, ab ${money(ctx, o.deliveryMin)} · PLZ ${o.deliveryZips.join(', ')}`)
              : ''}
          </div>
        </fieldset>
        <fieldset>
          <legend>Wann?</legend>
          <div class="fld">
            <label for="fo-slot">Uhrzeit</label
            ><select id="fo-slot" name="slot" required>
              ${slots.map(
                (d) =>
                  html`<optgroup label="${d.label}">
                    ${d.slots.map((x) => html`<option value="${x.at}" ${x.at === v('slot') ? raw(' selected') : ''}>${d.label}, ${x.time} Uhr</option>`)}
                  </optgroup>`,
              )}
            </select>
          </div>
        </fieldset>
        <fieldset>
          <legend>Wer?</legend>
          <div class="fo-grid">
            <div class="fld"><label for="fo-name">Name</label><input id="fo-name" name="name" required autocomplete="name" maxlength="120" value="${v('name')}" /></div>
            <div class="fld">
              <label for="fo-phone">Telefon</label><input id="fo-phone" type="tel" name="phone" required autocomplete="tel" maxlength="40" value="${v('phone')}" />
            </div>
            <div class="fld fo-wide">
              <label for="fo-email">E-Mail</label><input id="fo-email" type="email" name="email" required autocomplete="email" maxlength="200" value="${v('email')}" />
            </div>
          </div>
        </fieldset>
        ${o.delivery
          ? html`<fieldset class="fo-address">
              <legend>Lieferadresse <span class="muted">(nur beim Liefern)</span></legend>
              <div class="fo-grid">
                <div class="fld fo-wide">
                  <label for="fo-street">Strasse und Nr.</label><input id="fo-street" name="street" autocomplete="street-address" maxlength="120" value="${v('street')}" />
                </div>
                <div class="fld">
                  <label for="fo-zip">PLZ</label><input id="fo-zip" name="zip" inputmode="numeric" autocomplete="postal-code" maxlength="12" value="${v('zip')}" />
                </div>
                <div class="fld"><label for="fo-city">Ort</label><input id="fo-city" name="city" autocomplete="address-level2" maxlength="80" value="${v('city')}" /></div>
              </div>
            </fieldset>`
          : ''}
        <div class="fld">
          <label for="fo-note">Bemerkung <span class="muted">(freiwillig)</span></label
          ><textarea id="fo-note" name="note" maxlength="500" rows="2" placeholder="z. B. ohne Zwiebeln, 2. Stock links">${v('note')}</textarea>
        </div>
        <fieldset>
          <legend>Bezahlen</legend>
          <div class="fo-choices">
            ${online ? radio('payment', 'online', 'Jetzt online', payment, 'TWINT, Karte, Apple Pay, Google Pay') : ''}${o.payOnSite
              ? radio('payment', 'onsite', mode === 'delivery' ? 'Bei der Lieferung' : 'Bei der Abholung', payment, 'Bar oder TWINT')
              : ''}
          </div>
        </fieldset>
        <div class="fo-submit">
          <button class="btn">Verbindlich bestellen</button>
          <p class="muted fo-small">Preise inkl. MwSt. <a href="/datenschutz">Datenschutz</a></p>
        </div>
      </form>
      ${cartBox(ctx, lines, true)}
    </div>
  </div>`;
}

export function statusPage(ctx: RenderContext, o: FoodOrder, q: URLSearchParams): Html {
  const s = ctx.settings;
  const when = new Date(o.slot_at).toLocaleString('de-CH', { timeZone: s.timezone, weekday: 'long', hour: '2-digit', minute: '2-digit' });
  const steps = o.mode === 'delivery' ? ['new', 'preparing', 'out', 'done'] : ['new', 'preparing', 'ready', 'done'];
  const at = steps.indexOf(o.status);
  return html`<div class="wrap fo fo-status">
    <p class="label">Bestellung</p>
    <h1>Nr. ${o.number}</h1>
    ${q.get('abgebrochen') && o.status === 'pending_payment'
      ? html`<p class="form-err" role="status">Die Zahlung wurde abgebrochen. <a href="/essen/${o.token}/bezahlen">Nochmals versuchen</a></p>`
      : html`<p class="fo-big" role="status" aria-live="polite">${FOOD_STATUS[o.status].guest}</p>`}${at >= 0
      ? html`<ol class="fo-steps">
          ${steps.map((st, i) => html`<li class="${i < at ? 'done' : i === at ? 'now' : ''}">${FOOD_STATUS[st].label}</li>`)}
        </ol>`
      : ''}
    <dl class="booking-facts">
      <div>
        <dt>${o.mode === 'delivery' ? 'Lieferung' : 'Abholung'}</dt>
        <dd>${when} Uhr</dd>
      </div>
      ${o.mode === 'delivery'
        ? html`<div>
            <dt>Adresse</dt>
            <dd>${o.street}, ${o.zip} ${o.city}</dd>
          </div>`
        : s.business.street
          ? html`<div>
              <dt>Wo</dt>
              <dd>${s.name}, ${s.business.street}, ${s.business.zip} ${s.business.city}</dd>
            </div>`
          : ''}
      <div>
        <dt>Bestellt</dt>
        <dd>${o.items.map((l) => html`${l.q}× ${l.title}${l.size ? ` (${l.size})` : ''}<br />`)}</dd>
      </div>
      <div>
        <dt>Total</dt>
        <dd>${money(ctx, o.total)} · ${o.payment === 'online' ? (o.paid_at ? 'bezahlt' : 'Zahlung offen') : 'bezahlen vor Ort'}</dd>
      </div>
    </dl>
    ${s.business.phone ? html`<p class="muted">Fragen? <a href="tel:${s.business.phone.replace(/[^+\d]/g, '')}">${s.business.phone}</a></p>` : ''}
  </div>`;
}

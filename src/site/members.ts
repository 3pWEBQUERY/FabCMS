import { html, raw, type Html } from './html';
import type { RenderContext } from './context';
import { env } from '../server/env';
import { formatMoney } from '../shared/text';
import type { Access } from '../shared/members';
import { t, L } from './i18n';

/** Header link: «Anmelden» or «Mein Konto». */
export function accountLink(ctx: RenderContext): Html {
  if (!ctx.settings.modules.includes('members')) return html``;
  if (ctx.member) return html`<a class="acct-link" href="/konto" ${ctx.path.startsWith('/konto') ? raw(' aria-current="page"') : ''}>${t(ctx, 'Mein Konto')}</a>`;
  return html`<a class="acct-link" href="/konto/anmelden?weiter=${encodeURIComponent(ctx.path)}">${t(ctx, 'Anmelden')}</a>`;
}

function price(ctx: RenderContext): string {
  const m = ctx.settings.members;
  const amount = formatMoney(m.price, ctx.settings.shop.currency, L(ctx));
  return m.interval === 'year' ? t(ctx, '{price} pro Jahr', { price: amount }) : t(ctx, '{price} pro Monat', { price: amount });
}

const paidAvailable = (ctx: RenderContext) => ctx.settings.members.price > 0 && Boolean(env.stripe.secretKey);

function perks(ctx: RenderContext): Html {
  const list = ctx.settings.members.perks
    .split('\n')
    .map((l) => l.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean);
  return list.length
    ? html`<ul class="gate-perks">
        ${list.map((p) => html`<li>${p}</li>`)}
      </ul>`
    : html``;
}

/** What to offer someone who may not see this yet: sign in, an account, or the paid membership. */
function actions(ctx: RenderContext, access: Access): Html {
  const next = encodeURIComponent(ctx.path);
  const open = ctx.settings.members.registration === 'open';
  if (!ctx.member) {
    const register =
      open && (access === 'members' || paidAvailable(ctx))
        ? html`<a class="btn" href="/konto/registrieren?weiter=${next}">${access === 'paid' ? t(ctx, 'Mitglied werden') : t(ctx, 'Konto erstellen')}</a>`
        : '';
    return html`<div class="gate-actions">${register}<a class="${register ? 'btn-2' : 'btn'}" href="/konto/anmelden?weiter=${next}">${t(ctx, 'Anmelden')}</a></div>`;
  }
  if (access === 'paid' && paidAvailable(ctx))
    return html`<form class="gate-actions" method="post" action="/konto/abo">
      <input type="hidden" name="weiter" value="${ctx.path}" /><button class="btn">${t(ctx, '{plan} abschliessen – {price}', { plan: ctx.settings.members.planName, price: price(ctx) })}</button>
    </form>`;
  return html``;
}

export function gate(ctx: RenderContext, access: Access): Html {
  const m = ctx.settings.members;
  const paid = access === 'paid';
  const title = !ctx.member
    ? paid
      ? t(ctx, 'Weiterlesen mit der {plan}', { plan: m.planName })
      : t(ctx, 'Weiterlesen mit deinem Konto')
    : paidAvailable(ctx)
      ? t(ctx, 'Weiterlesen mit der {plan}', { plan: m.planName })
      : t(ctx, 'Dieser Inhalt ist Teil der {plan}', { plan: m.planName });
  const text = !ctx.member
    ? paid
      ? paidAvailable(ctx)
        ? t(ctx, '{price}, jederzeit kündbar.', { price: price(ctx) })
        : t(ctx, 'Melde dich an, wenn du schon dabei bist.')
      : m.registration === 'open'
        ? t(ctx, 'Das Konto ist kostenlos und in einer Minute erstellt.')
        : t(ctx, 'Melde dich mit deinem Konto an. Neue Konten gibt es auf Einladung.')
    : paidAvailable(ctx)
      ? t(ctx, '{price}, jederzeit kündbar. Bezahlt wird sicher über Stripe.', { price: price(ctx) })
      : t(ctx, 'Den Zugang vergibt {site} persönlich – schreib uns einfach.', { site: ctx.settings.name });
  return html`<section class="wrap gate" id="zugang" aria-labelledby="gate-h">
    <div class="gate-box">
      <span class="gate-lock" aria-hidden="true"></span>
      <p class="label">${paid ? t(ctx, 'Für zahlende Mitglieder') : t(ctx, 'Für Mitglieder')}</p>
      <h2 id="gate-h">${title}</h2>
      <p>${text}</p>
      ${paid ? perks(ctx) : ''}${actions(ctx, access)}
    </div>
  </section>`;
}

/** Block «Mitgliedschaft»: what it costs, what you get, and the next step for this visitor. */
export function membershipBox(ctx: RenderContext, p: { heading?: string; intro?: string }, head: Html): Html {
  const m = ctx.settings.members;
  const paid = paidAvailable(ctx);
  const next = encodeURIComponent(ctx.path);
  let cta: Html;
  if (!ctx.member)
    cta =
      m.registration === 'open'
        ? html`<a class="btn" href="/konto/registrieren?weiter=${next}">${paid ? t(ctx, 'Mitglied werden') : t(ctx, 'Konto erstellen')}</a
            ><a class="btn-2" href="/konto/anmelden?weiter=${next}">${t(ctx, 'Schon dabei? Anmelden')}</a>`
        : html`<a class="btn" href="/konto/anmelden?weiter=${next}">${t(ctx, 'Anmelden')}</a>`;
  else if (ctx.member.level === 'paid')
    cta = html`<p class="form-ok" style="margin:0">${t(ctx, 'Du bist dabei. Danke!')}</p>
      <a class="btn-2" href="/konto">${t(ctx, 'Mein Konto')}</a>`;
  else if (paid)
    cta = html`<form method="post" action="/konto/abo"><input type="hidden" name="weiter" value="${ctx.path}" /><button class="btn">${t(ctx, '{plan} abschliessen', { plan: m.planName })}</button></form>`;
  else cta = html`<a class="btn-2" href="/konto">${t(ctx, 'Mein Konto')}</a>`;
  return html`<div class="wrap">
    ${head}
    <div class="plan">
      <div class="plan-head">
        <h3>${m.planName}</h3>
        ${paid
          ? html`<p class="plan-price"><span class="num">${formatMoney(m.price, ctx.settings.shop.currency, L(ctx))}</span> ${m.interval === 'year' ? t(ctx, 'pro Jahr') : t(ctx, 'pro Monat')}</p>`
          : html`<p class="plan-price">${t(ctx, 'Kostenlos')}</p>`}
      </div>
      ${perks(ctx)}
      <div class="gate-actions">${cta}</div>
      ${paid ? html`<p class="plan-note">${t(ctx, 'Jederzeit kündbar. Bezahlt wird sicher über Stripe.')}</p>` : ''}
    </div>
  </div>`;
}

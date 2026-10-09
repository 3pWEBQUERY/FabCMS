import { html, raw, type Html } from './html';
import type { RenderContext } from './context';
import { env } from '../server/env';
import { formatMoney } from '../shared/text';
import type { Access } from '../shared/members';

/** Header link: «Anmelden» or «Mein Konto». */
export function accountLink(ctx: RenderContext): Html {
  if (!ctx.settings.modules.includes('members')) return html``;
  if (ctx.member) return html`<a class="acct-link" href="/konto" ${ctx.path.startsWith('/konto') ? raw(' aria-current="page"') : ''}>Mein Konto</a>`;
  return html`<a class="acct-link" href="/konto/anmelden?weiter=${encodeURIComponent(ctx.path)}">Anmelden</a>`;
}

function price(ctx: RenderContext): string {
  const m = ctx.settings.members;
  return `${formatMoney(m.price, ctx.settings.shop.currency)} pro ${m.interval === 'year' ? 'Jahr' : 'Monat'}`;
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
        ? html`<a class="btn" href="/konto/registrieren?weiter=${next}">${access === 'paid' ? 'Mitglied werden' : 'Konto erstellen'}</a>`
        : '';
    return html`<div class="gate-actions">${register}<a class="${register ? 'btn-2' : 'btn'}" href="/konto/anmelden?weiter=${next}">Anmelden</a></div>`;
  }
  if (access === 'paid' && paidAvailable(ctx))
    return html`<form class="gate-actions" method="post" action="/konto/abo">
      <input type="hidden" name="weiter" value="${ctx.path}" /><button class="btn">${ctx.settings.members.planName} abschliessen – ${price(ctx)}</button>
    </form>`;
  return html``;
}

export function gate(ctx: RenderContext, access: Access): Html {
  const m = ctx.settings.members;
  const paid = access === 'paid';
  const title = !ctx.member
    ? paid
      ? `Weiterlesen mit der ${m.planName}`
      : 'Weiterlesen mit deinem Konto'
    : paidAvailable(ctx)
      ? `Weiterlesen mit der ${m.planName}`
      : `Dieser Inhalt ist Teil der ${m.planName}`;
  const text = !ctx.member
    ? paid
      ? paidAvailable(ctx)
        ? `${price(ctx)}, jederzeit kündbar.`
        : 'Melde dich an, wenn du schon dabei bist.'
      : m.registration === 'open'
        ? 'Das Konto ist kostenlos und in einer Minute erstellt.'
        : 'Melde dich mit deinem Konto an. Neue Konten gibt es auf Einladung.'
    : paidAvailable(ctx)
      ? `${price(ctx)}, jederzeit kündbar. Bezahlt wird sicher über Stripe.`
      : `Den Zugang vergibt ${ctx.settings.name} persönlich – schreib uns einfach.`;
  return html`<section class="wrap gate" id="zugang" aria-labelledby="gate-h">
    <div class="gate-box">
      <span class="gate-lock" aria-hidden="true"></span>
      <p class="label">${paid ? 'Für zahlende Mitglieder' : 'Für Mitglieder'}</p>
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
        ? html`<a class="btn" href="/konto/registrieren?weiter=${next}">${paid ? 'Mitglied werden' : 'Konto erstellen'}</a
            ><a class="btn-2" href="/konto/anmelden?weiter=${next}">Schon dabei? Anmelden</a>`
        : html`<a class="btn" href="/konto/anmelden?weiter=${next}">Anmelden</a>`;
  else if (ctx.member.level === 'paid')
    cta = html`<p class="form-ok" style="margin:0">Du bist dabei. Danke!</p>
      <a class="btn-2" href="/konto">Mein Konto</a>`;
  else if (paid)
    cta = html`<form method="post" action="/konto/abo"><input type="hidden" name="weiter" value="${ctx.path}" /><button class="btn">${m.planName} abschliessen</button></form>`;
  else cta = html`<a class="btn-2" href="/konto">Mein Konto</a>`;
  return html`<div class="wrap">
    ${head}
    <div class="plan">
      <div class="plan-head">
        <h3>${m.planName}</h3>
        ${paid
          ? html`<p class="plan-price"><span class="num">${formatMoney(m.price, ctx.settings.shop.currency)}</span> pro ${m.interval === 'year' ? 'Jahr' : 'Monat'}</p>`
          : html`<p class="plan-price">Kostenlos</p>`}
      </div>
      ${perks(ctx)}
      <div class="gate-actions">${cta}</div>
      ${paid ? html`<p class="plan-note">Jederzeit kündbar. Bezahlt wird sicher über Stripe.</p>` : ''}
    </div>
  </div>`;
}

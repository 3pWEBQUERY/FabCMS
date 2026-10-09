import type { Hono } from 'hono';
import type { AppEnv } from '../auth';
import { html } from '../../site/html';
import { renderSystemPage } from '../../site/render';
import { getSettings } from '../settings';
import { env } from '../env';
import { clientIp } from '../lib/http';
import { rateLimit } from '../lib/ratelimit';
import { recordGoal } from '../analytics';
import { BOOKING_STATUS } from '../../shared/booking';
import { formatMoney } from '../../shared/text';
import { bookingByToken, cancelByGuest, createBooking, depositCheckoutUrl, formatWhen, guestIcs, staffFeed } from '../booking';
import { ctxFor, looksLikeSpam, notFoundPage, sendHtml } from './public';
import { t, T } from '../../site/i18n';

/** Booking on the website: the block's form posts here; guests manage their booking via a private link. */
export function bookingPublicRoutes(app: Hono<AppEnv>) {
  app.post('/_nova/booking', async (c) => {
    const s = await getSettings();
    if (!s.modules.includes('booking')) return c.notFound();
    const body = (await c.req.parseBody()) as Record<string, string>;
    const back = String(body._back ?? '/').startsWith('/') ? String(body._back) : '/';
    const fail = (msg: string) => {
      const u = new URL(back, 'http://x');
      u.searchParams.set('b_err', msg);
      return c.redirect(`${u.pathname}${u.search}#buchen`, 303);
    };
    if (looksLikeSpam(body)) return c.redirect(back, 303);
    if (!rateLimit(`booking:${clientIp(c)}`, 6, 10 * 60_000).ok) return fail(T('Zu viele Versuche. Bitte warte ein paar Minuten.'));
    try {
      const b = await createBooking({
        serviceId: body.service,
        day: body.day,
        time: body.time,
        party: Math.max(1, Number(body.party) || 1),
        name: body.name ?? '',
        email: body.email ?? '',
        phone: body.phone,
        note: body.note,
      });
      await recordGoal('booking', clientIp(c), c.req.header('user-agent') ?? '', back);
      if (b.status === 'awaiting_payment') return c.redirect(await depositCheckoutUrl(b), 303);
      return c.redirect(`/buchung/${b.token}?neu=1`, 303);
    } catch (e) {
      return fail((e as Error).message);
    }
  });

  app.get('/buchung/:token{[A-Za-z0-9_-]+\\.ics}', async (c) => {
    const ics = await guestIcs(c.req.param('token').replace(/\.ics$/, ''));
    if (!ics) return c.notFound();
    c.header('Content-Type', 'text/calendar; charset=utf-8');
    c.header('Content-Disposition', 'attachment; filename="reservation.ics"');
    return c.body(ics);
  });

  app.get('/_nova/booking/feed/:token{[A-Za-z0-9_-]+\\.ics}', async (c) => {
    const ics = await staffFeed(c.req.param('token').replace(/\.ics$/, ''));
    if (!ics) return c.notFound();
    c.header('Content-Type', 'text/calendar; charset=utf-8');
    c.header('Cache-Control', 'no-store');
    return c.body(ics);
  });

  app.get('/buchung/:token/anzahlung', async (c) => {
    const b = await bookingByToken(c.req.param('token'));
    if (!b || b.status !== 'awaiting_payment' || !env.stripe.secretKey) return c.redirect(`/buchung/${c.req.param('token')}`, 303);
    return c.redirect(await depositCheckoutUrl(b), 303);
  });

  app.post('/buchung/:token/absagen', async (c) => {
    const r = await cancelByGuest(c.req.param('token'));
    return c.redirect(`/buchung/${c.req.param('token')}?${r.ok ? 'abgesagt=1' : `hinweis=${encodeURIComponent(r.message)}`}`, 303);
  });

  app.get('/buchung/:token', async (c) => {
    const s = await getSettings();
    const b = await bookingByToken(c.req.param('token'));
    if (!b) return notFoundPage(c);
    const q = c.req.query();
    const ctx = await ctxFor(c);
    const status = BOOKING_STATUS[b.status] ? { ...BOOKING_STATUS[b.status], label: t(ctx, BOOKING_STATUS[b.status].label) } : { label: b.status, tone: 'muted' };
    const active = ['pending', 'awaiting_payment', 'confirmed'].includes(b.status);
    const future = new Date(b.starts_at).getTime() > Date.now();
    const what =
      s.booking.mode === 'table' ? (b.party_size === 1 ? t(ctx, '{n} Person', { n: b.party_size }) : t(ctx, '{n} Personen', { n: b.party_size })) : (b.service_name ?? t(ctx, 'Termin'));
    const message = q.neu
      ? b.status === 'pending'
        ? t(ctx, 'Danke! Deine Anfrage ist da. Wir bestätigen sie so bald wie möglich per E-Mail.')
        : t(ctx, 'Danke! Deine Reservation ist bestätigt. Die Bestätigung kommt auch per E-Mail.')
      : q.bezahlt
        ? t(ctx, 'Danke für die Anzahlung. Deine Reservation ist gesichert.')
        : q.abgesagt
          ? t(ctx, 'Deine Reservation ist abgesagt. Schade – vielleicht ein anderes Mal.')
          : q.abgebrochen
            ? t(ctx, 'Die Zahlung wurde abgebrochen. Ohne Anzahlung wird die Zeit nach 30 Minuten wieder freigegeben.')
            : (q.hinweis ?? '');
    const body = html`<div class="wrap booking-page" style="padding-block:var(--sp-s);max-width:40rem">
      <p class="label">${s.booking.mode === 'table' ? t(ctx, 'Reservation') : t(ctx, 'Termin')}</p>
      <h1 style="font-size:var(--step-5);margin:.5rem 0 1.5rem">${formatWhen(b.starts_at, s, ctx.lang)}</h1>
      ${message ? html`<p class="${q.abgebrochen || q.hinweis ? 'form-err' : 'form-ok'}" role="status">${message}</p>` : ''}
      <dl class="booking-facts">
        <div><dt>${t(ctx, 'Was')}</dt><dd>${what}</dd></div>
        <div><dt>${t(ctx, 'Name')}</dt><dd>${b.name}</dd></div>
        <div><dt>${t(ctx, 'Status')}</dt><dd><span class="bk-status ${status.tone}">${status.label}</span></dd></div>
        ${b.note ? html`<div><dt>${t(ctx, 'Bemerkung')}</dt><dd>${b.note}</dd></div>` : ''}
        ${s.business.street ? html`<div><dt>${t(ctx, 'Wo')}</dt><dd>${s.name}, ${s.business.street}, ${s.business.zip} ${s.business.city}</dd></div>` : ''}
      </dl>
      ${
        b.status === 'awaiting_payment' && env.stripe.secretKey
          ? html`<p><a class="btn" href="/buchung/${b.token}/anzahlung">${t(ctx, 'Anzahlung {amount} bezahlen', { amount: formatMoney(b.deposit, s.shop.currency) })}</a></p>`
          : ''
      }
      ${
        active && future
          ? html`<div class="actions"><a class="btn-2" href="/buchung/${b.token}.ics">${t(ctx, 'In den Kalender eintragen')}</a>${
              q.absagen
                ? ''
                : html`<a class="btn-2 bk-cancel" href="/buchung/${b.token}?absagen=1#absagen">${t(ctx, 'Absagen')}</a>`
            }</div>${
              q.absagen
                ? html`<form class="bk-confirm" id="absagen" method="post" action="/buchung/${b.token}/absagen"><p>${t(ctx, 'Wirklich absagen? Die Zeit wird dann für andere frei.')}</p><div class="actions"><button class="btn">${t(ctx, 'Ja, absagen')}</button><a class="btn-2" href="/buchung/${b.token}">${t(ctx, 'Nein, behalten')}</a></div></form>`
                : ''
            }`
          : ''
      }
      ${s.business.phone ? html`<p class="muted" style="margin-top:2rem">${t(ctx, 'Fragen?')} <a href="tel:${s.business.phone.replace(/\s/g, '')}">${s.business.phone}</a></p>` : ''}
    </div>`;
    c.header('Cache-Control', 'no-store');
    return sendHtml(c, await renderSystemPage(ctx, { title: t(ctx, 'Deine Reservation'), body, noindex: true }));
  });
}

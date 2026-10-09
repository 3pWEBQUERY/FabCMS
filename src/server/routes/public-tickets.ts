import type { Context, Hono } from 'hono';
import type { AppEnv } from '../auth';
import { html, raw } from '../../site/html';
import { renderSystemPage } from '../../site/render';
import { getSettings } from '../settings';
import { env } from '../env';
import { clientIp } from '../lib/http';
import { rateLimit } from '../lib/ratelimit';
import { recordGoal } from '../analytics';
import { formatMoney } from '../../shared/text';
import { ticketCategories } from '../../shared/events';
import { createTicketOrder, describeWhen, entryIcs, joinWaitlist, orderByToken, ticketCheckoutUrl, ticketEntry, ticketQr, ticketsOf } from '../tickets';
import { ctxFor, looksLikeSpam, notFoundPage, sendHtml } from './public';

/** Ticket order form target, waitlist, the buyer's ticket page with QR codes, calendar file. */
export function ticketsPublicRoutes(app: Hono<AppEnv>) {
  const back = (c: Context, path: string, params: Record<string, string>) => {
    const u = new URL(path.startsWith('/') ? path : '/', 'http://x');
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return c.redirect(`${u.pathname}${u.search}#tickets`, 303);
  };

  app.post('/_nova/tickets/:entry{[0-9a-f-]{36}}', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, string>;
    const page = String(body._back ?? '/');
    if (looksLikeSpam(body)) return back(c, page, {});
    if (!rateLimit(`tickets:${clientIp(c)}`, 8, 10 * 60_000).ok) return back(c, page, { t_err: 'Zu viele Versuche. Bitte warte ein paar Minuten.' });
    const entry = await ticketEntry(c.req.param('entry'));
    if (!entry) return c.notFound();
    // Quantities come as q_0, q_1 … in the order of the categories.
    const quantities: Record<string, number> = {};
    ticketCategories(entry.data).forEach((cat, i) => (quantities[cat.name] = Number(body[`q_${i}`] ?? 0)));
    try {
      const order = await createTicketOrder({ entryId: entry.id, quantities, name: body.name ?? '', email: body.email ?? '' });
      await recordGoal('ticket', clientIp(c), c.req.header('user-agent') ?? '', page, order.total || null);
      if (order.status === 'pending') return c.redirect(await ticketCheckoutUrl(order), 303);
      return c.redirect(`/tickets/${order.token}?neu=1`, 303);
    } catch (e) {
      return back(c, page, { t_err: (e as Error).message });
    }
  });

  app.post('/_nova/tickets/:entry{[0-9a-f-]{36}}/warteliste', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, string>;
    const page = String(body._back ?? '/');
    if (looksLikeSpam(body)) return back(c, page, { t_wait: '1' });
    if (!rateLimit(`waitlist:${clientIp(c)}`, 5, 10 * 60_000).ok) return back(c, page, { t_err: 'Zu viele Versuche. Bitte warte ein paar Minuten.' });
    try {
      await joinWaitlist(c.req.param('entry'), body.name ?? '', body.email ?? '');
      return back(c, page, { t_wait: '1' });
    } catch (e) {
      return back(c, page, { t_err: (e as Error).message });
    }
  });

  app.get('/_nova/ics/:entry{[0-9a-f-]{36}\\.ics}', async (c) => {
    const entry = await ticketEntry(c.req.param('entry').replace(/\.ics$/, ''));
    if (!entry) return c.notFound();
    c.header('Content-Type', 'text/calendar; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="${entry.slug || 'termin'}.ics"`);
    return c.body(entryIcs(entry, await getSettings()));
  });

  app.get('/tickets/:token/bezahlen', async (c) => {
    const o = await orderByToken(c.req.param('token'));
    if (!o || o.status !== 'pending' || !env.stripe.secretKey) return c.redirect(`/tickets/${c.req.param('token')}`, 303);
    return c.redirect(await ticketCheckoutUrl(o), 303);
  });

  app.get('/tickets/:token', async (c) => {
    const s = await getSettings();
    const o = await orderByToken(c.req.param('token'));
    if (!o) return notFoundPage(c);
    const q = c.req.query();
    const entry = o.entry_id ? await ticketEntry(o.entry_id) : null;
    const list = await ticketsOf(o.id);
    const course = entry?.collection === 'courses';
    const when = entry ? describeWhen(entry, s) : '';
    const where = entry ? [entry.data.venue, entry.data.address || [s.business.street, s.business.city].filter(Boolean).join(', ')].filter(Boolean).join(', ') : '';
    const message =
      o.status === 'cancelled'
        ? html`<p class="form-err" role="status">${q.abgebrochen ? 'Die Zahlung wurde abgebrochen, die Plätze sind wieder frei.' : 'Diese Bestellung ist storniert.'}</p>`
        : o.status === 'pending'
          ? html`<p class="form-err" role="status">
                ${q.abgebrochen ? 'Die Zahlung wurde abgebrochen.' : 'Die Zahlung ist noch offen.'} Die Plätze bleiben 30 Minuten für dich reserviert.
              </p>
              <p><a class="btn" href="/tickets/${o.token}/bezahlen">${formatMoney(o.total, o.currency)} bezahlen</a></p>`
          : q.neu || q.bezahlt
            ? html`<p class="form-ok" role="status">
                Danke! ${course ? 'Deine Anmeldung ist bestätigt.' : list.length === 1 ? 'Hier ist dein Ticket.' : 'Hier sind deine Tickets.'} Wir haben
                ${list.length === 1 ? 'es' : 'sie'} dir auch per E-Mail geschickt.
              </p>`
            : '';
    const qrs = o.status === 'paid' ? await Promise.all(list.map((t) => ticketQr(t.code as string, s))) : [];
    const body = html`<div class="wrap tk-page">
      <p class="label">${course ? 'Anmeldung' : list.length === 1 ? 'Ticket' : 'Tickets'}</p>
      <h1>${o.entry_title}</h1>
      ${when || where ? html`<p class="lead">${when}${when && where ? html`<br />` : ''}${where}</p>` : ''}${message}${o.status === 'paid'
        ? html`<ol class="tk-tickets">
              ${list.map(
                (t, i) =>
                  html`<li class="tk-ticket${t.checked_in_at ? ' used' : ''}">
                    <div class="tk-qr" role="img" aria-label="QR-Code für Ticket ${t.code as string}">${raw(qrs[i])}</div>
                    <div class="tk-info">
                      <span class="label">${t.category as string}</span><strong>${o.name}</strong><span class="tk-code num">${t.code as string}</span>${t.checked_in_at
                        ? html`<span class="muted">Eingelöst</span>`
                        : ''}<span class="muted">${i + 1} von ${list.length}</span>
                    </div>
                  </li>`,
              )}
            </ol>
            <div class="actions no-print">
              ${entry ? html`<a class="btn-2" href="/_nova/ics/${entry.id}.ics">In den Kalender</a>` : ''}<button class="btn-2" type="button" onclick="print()">Drucken</button>
            </div>
            <p class="muted no-print">Am Eingang den QR-Code zeigen – auf dem Handy oder ausgedruckt. ${o.total ? `Bezahlt: ${formatMoney(o.total, o.currency)}.` : ''}</p>`
        : ''}${s.business.email ? html`<p class="muted no-print" style="margin-top:2rem">Fragen? <a href="mailto:${s.business.email}">${s.business.email}</a></p>` : ''}
    </div>`;
    c.header('Cache-Control', 'no-store');
    return sendHtml(c, await renderSystemPage(await ctxFor(c), { title: o.entry_title, body, noindex: true }));
  });
}

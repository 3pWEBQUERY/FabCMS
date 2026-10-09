import type { Context, Hono } from 'hono';
import type { AppEnv } from '../auth';
import { html, type Html } from '../../site/html';
import { T } from '../../site/i18n';
import { renderSystemPage } from '../../site/render';
import { getSettings } from '../settings';
import { clientIp } from '../lib/http';
import { rateLimit } from '../lib/ratelimit';
import { recordGoal } from '../analytics';
import { langOfPath, localizePath, pathMap, requestLang } from '../translations';
import { extraLangs, type Lang } from '../../shared/i18n';
import { confirmSubscription, subscribe, subscriberByToken, unsubscribe } from '../newsletter';
import { ctxFor, looksLikeSpam, notFoundPage, sendHtml } from './public';

/** Sign-up form target, confirmation link and unsubscribe page (also RFC 8058 one-click). */
export function newsletterPublicRoutes(app: Hono<AppEnv>) {
  app.post('/_nova/newsletter', async (c) => {
    const s = await getSettings();
    if (!s.modules.includes('newsletter')) return c.notFound();
    const body = (await c.req.parseBody()) as Record<string, string>;
    const page = String(body._page ?? '/').startsWith('/') ? String(body._page) : '/';
    const block = String(body._block ?? '')
      .replace(/[^\w-]/g, '')
      .slice(0, 40);
    // /_nova/… has no language prefix: the page the form was on tells the language (message, mail, way back).
    let from = '';
    try {
      from = new URL(c.req.header('referer') ?? '').pathname;
    } catch {
      /* no referrer */
    }
    const lang: Lang | null = langOfPath(String(body._lang ? `/${body._lang}/` : from).toLowerCase(), extraLangs(s));
    const map = lang ? await pathMap(lang) : null;
    const back = (params: Record<string, string>) => {
      const u = new URL(page, 'http://x');
      for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
      const to = `${u.pathname}${u.search}`;
      return c.redirect(`${lang && map ? localizePath(map, lang, to) : to}#nl-${block}-box`, 303);
    };
    const run = async () => {
      // Bots get the same answer as people, so they learn nothing.
      if (looksLikeSpam(body)) return back({ nl: block });
      if (!rateLimit(`newsletter:${clientIp(c)}`, 5, 10 * 60_000).ok)
        return back({
          nl_err: block,
          meldung: T('Zu viele Versuche. Bitte warte ein paar Minuten.'),
        });
      try {
        await subscribe({
          email: String(body.email ?? ''),
          name: body.name,
          source: page,
          ip: clientIp(c),
        });
        await recordGoal('newsletter', clientIp(c), c.req.header('user-agent') ?? '', page);
        return back({ nl: block });
      } catch (e) {
        return back({ nl_err: block, meldung: T((e as Error).message) });
      }
    };
    return lang ? requestLang.run(lang, run) : run();
  });

  const page = async (c: Context, title: string, body: Html) => {
    c.header('Cache-Control', 'no-store');
    return sendHtml(c, await renderSystemPage(await ctxFor(c), { title, body, noindex: true }));
  };

  app.get('/newsletter/bestaetigen/:token', async (c) => {
    const s = await getSettings();
    const r = await confirmSubscription(c.req.param('token'));
    if (r.status === 'unknown')
      return page(
        c,
        T('Link nicht mehr gültig'),
        html`<div class="wrap sys-msg">
          <h1>${T('Dieser Link ist nicht mehr gültig.')}</h1>
          <p>${T('Bestätigungslinks verfallen nach 30 Tagen. Melde dich einfach noch einmal an.')}</p>
          <p><a class="btn" href="/">${T('Zur Startseite')}</a></p>
        </div>`,
      );
    return page(
      c,
      T('Anmeldung bestätigt'),
      html`<div class="wrap sys-msg">
        <p class="label">Newsletter</p>
        <h1>${r.status === 'already' ? T('Du bist schon dabei.') : T('Danke, du bist dabei!')}</h1>
        <p>
          ${T('Ab jetzt bekommst du Neues von {name} an', { name: s.name })}
          <strong>${r.subscriber!.email}</strong>. ${T('Abmelden kannst du dich mit dem Link unten in jeder E-Mail.')}
        </p>
        <p><a class="btn" href="/">${T('Zur Startseite')}</a></p>
      </div>`,
    );
  });

  app.get('/newsletter/abmelden/:token', async (c) => {
    const s = await getSettings();
    const t = c.req.param('token');
    if (t === 'vorschau')
      return page(
        c,
        'Abmelden',
        html`<div class="wrap sys-msg">
          <h1>Vorschau</h1>
          <p>In der echten E-Mail führt dieser Link zur Abmeldung der Person, die sie bekommen hat.</p>
        </div>`,
      );
    const sub = await subscriberByToken(t);
    if (!sub) return notFoundPage(c);
    if (sub.status === 'unsubscribed' || c.req.query('fertig'))
      return page(
        c,
        T('Abgemeldet'),
        html`<div class="wrap sys-msg">
          <p class="label">Newsletter</p>
          <h1>${T('Du bist abgemeldet.')}</h1>
          <p>${T('{email} bekommt keinen Newsletter von {name} mehr. Schade – aber danke fürs Lesen.', { email: sub.email, name: s.name })}</p>
          <form method="post" action="/newsletter/wieder/${t}">
            <button class="btn-2">${T('Doch wieder anmelden')}</button>
          </form>
        </div>`,
      );
    return page(
      c,
      T('Newsletter abmelden'),
      html`<div class="wrap sys-msg">
        <p class="label">Newsletter</p>
        <h1>${T('Abmelden?')}</h1>
        <p>${T('{email} bekommt dann keinen Newsletter von {name} mehr.', { email: sub.email, name: s.name })}</p>
        <form method="post" action="/newsletter/abmelden/${t}">
          <button class="btn">${T('Ja, abmelden')}</button>
        </form>
      </div>`,
    );
  });

  // The button above, and mail clients' one-click unsubscribe (body «List-Unsubscribe=One-Click»).
  app.post('/newsletter/abmelden/:token', async (c) => {
    const sub = await unsubscribe(c.req.param('token'));
    if (!sub) return c.notFound();
    const form = (await c.req.parseBody().catch(() => ({}))) as Record<string, unknown>;
    const oneClick = String(form['List-Unsubscribe'] ?? '') === 'One-Click';
    if (oneClick) return c.text(T('Abgemeldet.'));
    return c.redirect(`/newsletter/abmelden/${c.req.param('token')}?fertig=1`, 303);
  });

  app.post('/newsletter/wieder/:token', async (c) => {
    const sub = await subscriberByToken(c.req.param('token'));
    if (!sub) return c.notFound();
    // Back on the list only through a fresh confirmation – same rule as a new sign-up.
    await subscribe({
      email: sub.email,
      name: sub.name,
      source: 'wieder angemeldet',
      ip: clientIp(c),
    });
    return page(
      c,
      T('Bitte bestätigen'),
      html`<div class="wrap sys-msg">
        <p class="label">Newsletter</p>
        <h1>${T('Schau in dein Postfach.')}</h1>
        <p>${T('Wir haben dir eine E-Mail geschickt. Ein Klick auf den Link darin, und du bist wieder dabei.')}</p>
      </div>`,
    );
  });
}

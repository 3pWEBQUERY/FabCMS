import type { Context, Hono } from 'hono';
import type { AppEnv } from '../auth';
import { esc, html, raw, SafeHtml, type Html } from '../../site/html';
import { L, T } from '../../site/i18n';
import { renderSystemPage } from '../../site/render';
import { getSettings } from '../settings';
import { sql } from '../db';
import { env } from '../env';
import { clientIp, HttpError } from '../lib/http';
import { rateLimit } from '../lib/ratelimit';
import { verifyPassword } from '../lib/crypto';
import { recordGoal } from '../analytics';
import {
  billingPortalUrl,
  changePassword,
  currentMember,
  deleteMember,
  endMemberSession,
  loginMember,
  paidPlanAvailable,
  priceLabel,
  registerMember,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  safeNext,
  startMemberSession,
  subscriptionCheckoutUrl,
  tokenValid,
  UnverifiedError,
  verifyMember,
  type CurrentMember,
} from '../members';
import { ctxFor, looksLikeSpam, notFoundPage, sendHtml } from './public';

type Form = Record<string, string>;
const forgot = () => html`<a href="/konto/passwort-vergessen">${T('Passwort vergessen?')}</a>`;
/** A translated sentence with markup in its placeholders; the sentence itself is trusted, plain values are escaped. */
const rich = (de: string, params: Record<string, Html | string>) =>
  raw(T(de, Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v instanceof SafeHtml ? v.value : esc(v)]))));

/** Member pages: sign in, sign up, confirm, password, account, subscription. Server-rendered, no JavaScript needed. */
export function membersPublicRoutes(app: Hono<AppEnv>) {
  // Everything below only exists with the module switched on.
  app.use('/konto/*', async (c, next) => {
    if (!(await getSettings()).modules.includes('members')) return notFoundPage(c);
    // Lax cookies already stay home on cross-site posts; an explicit origin check costs nothing.
    if (c.req.method === 'POST') {
      const origin = c.req.header('origin');
      const host = c.req.header('x-forwarded-host') ?? c.req.header('host');
      if (origin && host && new URL(origin).host !== host) throw new HttpError(403, T('Anfrage von fremder Herkunft abgelehnt.'));
    }
    await next();
  });
  app.use('/konto', async (c, next) => {
    if (!(await getSettings()).modules.includes('members')) return notFoundPage(c);
    await next();
  });

  const page = async (c: Context, title: string, body: Html, status = 200) => {
    c.header('Cache-Control', 'no-store');
    return sendHtml(c, await renderSystemPage(await ctxFor(c), { title: T(title), body, noindex: true }), status);
  };
  const form = async (c: Context) => (await c.req.parseBody()) as Form;
  const err = (msg: string | null) => (msg ? html`<p class="form-err" role="alert">${T(msg)}</p>` : '');
  const ok = (msg: string | null) => (msg ? html`<p class="form-ok" role="status">${T(msg)}</p>` : '');
  const fld = (id: string, label: string, input: Html, extra: Html | string = '') => html`<div class="fld"><label for="${id}">${T(label)}</label>${input}${extra}</div>`;
  const hidden = (name: string, value: string) => html`<input type="hidden" name="${name}" value="${value}" />`;
  const nextQ = (next: string) => (next !== '/konto' ? `?weiter=${encodeURIComponent(next)}` : '');
  const requireMember = async (c: Context): Promise<CurrentMember | Response> => {
    const m = await currentMember(c);
    return m ?? c.redirect(`/konto/anmelden?weiter=${encodeURIComponent(c.req.path)}`, 303);
  };

  /* ---------- sign in ---------- */

  const loginPage = async (c: Context, o: { next: string; email?: string; error?: string | null; unverified?: string; status?: number }) => {
    const s = await getSettings();
    return page(
      c,
      'Anmelden',
      html`<div class="wrap acct">
        <p class="label">${s.name}</p>
        <h1>${T('Anmelden')}</h1>
        ${err(o.error ?? null)}${o.unverified
          ? html`<form method="post" action="/konto/bestaetigung-erneut">${hidden('email', o.unverified)}<button class="btn-2">${T('Bestätigungslink nochmals schicken')}</button></form>`
          : ''}
        <form class="nform" method="post" action="/konto/anmelden">
          ${hidden('weiter', o.next)}
          ${fld('m-email', 'E-Mail', html`<input id="m-email" type="email" name="email" required autocomplete="username" maxlength="200" value="${o.email ?? ''}" />`)}
          ${fld(
            'm-pw',
            'Passwort',
            html`<input id="m-pw" type="password" name="password" required autocomplete="current-password" maxlength="200" />`,
            html`<span class="hint">${forgot()}</span>`,
          )}
          <div><button class="btn">${T('Anmelden')}</button></div>
        </form>
        ${s.members.registration === 'open'
          ? html`<p class="acct-alt">${T('Noch kein Konto?')} <a href="/konto/registrieren${nextQ(o.next)}">${T('Konto erstellen')}</a></p>`
          : ''}
      </div>`,
      o.status,
    );
  };

  app.get('/konto/anmelden', async (c) => {
    const next = safeNext(c.req.query('weiter'));
    if (await currentMember(c)) return c.redirect(next, 303);
    return loginPage(c, { next, error: c.req.query('abgelaufen') ? 'Bitte melde dich nochmals an.' : null });
  });

  app.post('/konto/anmelden', async (c) => {
    const f = await form(c);
    const next = safeNext(f.weiter);
    const email = String(f.email ?? '')
      .trim()
      .toLowerCase();
    const ip = clientIp(c);
    if (!rateLimit(`member-login:${ip}`, 10, 15 * 60_000).ok || !rateLimit(`member-login:${email}`, 6, 15 * 60_000).ok)
      return loginPage(c, { next, email, error: 'Zu viele Versuche. Bitte warte eine Viertelstunde.', status: 429 });
    try {
      const m = await loginMember(email, String(f.password ?? ''));
      await startMemberSession(c, m.id);
      return c.redirect(next, 303);
    } catch (e) {
      if (e instanceof UnverifiedError) return loginPage(c, { next, email, error: e.message, unverified: e.email, status: 403 });
      return loginPage(c, { next, email, error: (e as Error).message, status: (e as HttpError).status ?? 400 });
    }
  });

  app.post('/konto/abmelden', async (c) => {
    await endMemberSession(c);
    return c.redirect('/', 303);
  });

  /* ---------- sign up ---------- */

  const registerPage = async (c: Context, o: { next: string; values?: Form; error?: string | null; status?: number }) => {
    const s = await getSettings();
    if (s.members.registration !== 'open')
      return page(
        c,
        'Konto erstellen',
        html`<div class="wrap acct">
          <p class="label">${s.name}</p>
          <h1>${T('Nur auf Einladung')}</h1>
          <p>${T('Neue Konten richtet {name} selbst ein. Hast du eine Einladung bekommen? Der Link darin führt direkt zum Passwort.', { name: s.name })}</p>
          <p><a class="btn-2" href="/konto/anmelden${nextQ(o.next)}">${T('Anmelden')}</a></p>
        </div>`,
      );
    const v = o.values ?? {};
    const paid = paidPlanAvailable(s);
    return page(
      c,
      'Konto erstellen',
      html`<div class="wrap acct">
        <p class="label">${s.name}</p>
        <h1>${T('Konto erstellen')}</h1>
        ${paid && s.members.perks
          ? html`<p class="lead">${T('Kostenlos. Für alles Weitere gibt es danach die {plan} ({price}).', { plan: s.members.planName, price: priceLabel(s) })}</p>`
          : ''}${err(o.error ?? null)}
        <form class="nform" method="post" action="/konto/registrieren">
          ${hidden('weiter', o.next)}${hidden('_t', Date.now().toString(36))}
          <div class="hp" aria-hidden="true">
            <label>${T('Bitte leer lassen')} <input type="text" name="website" tabindex="-1" autocomplete="off" /></label>
          </div>
          ${fld('r-name', 'Name', html`<input id="r-name" name="name" required autocomplete="name" maxlength="80" value="${v.name ?? ''}" />`)}
          ${fld('r-email', 'E-Mail', html`<input id="r-email" type="email" name="email" required autocomplete="email" maxlength="200" value="${v.email ?? ''}" />`)}
          ${fld(
            'r-pw',
            'Passwort',
            html`<input id="r-pw" type="password" name="password" required minlength="10" maxlength="200" autocomplete="new-password" aria-describedby="r-pw-h" />`,
            html`<span class="hint" id="r-pw-h">${T('Mindestens 10 Zeichen. Ein Satz ist leichter zu merken als Sonderzeichen.')}</span>`,
          )}
          ${s.modules.includes('newsletter')
            ? html`<div class="fld check">
                <input type="checkbox" id="r-nl" name="newsletter" value="1" ${v.newsletter ? raw(' checked') : ''} /><label for="r-nl">${T('Newsletter abonnieren')}</label>
              </div>`
            : ''}
          <div><button class="btn">${T('Konto erstellen')}</button></div>
          <p class="muted" style="font-size:var(--step-n1);margin:0">${rich('Wir speichern Name und E-Mail für dein Konto. Mehr in der {link}.', {
            link: html`<a href="/datenschutz">${T('Datenschutzerklärung')}</a>`,
          })}</p>
        </form>
        <p class="acct-alt">${T('Schon dabei?')} <a href="/konto/anmelden${nextQ(o.next)}">${T('Anmelden')}</a></p>
      </div>`,
      o.status,
    );
  };

  app.get('/konto/registrieren', async (c) => {
    const next = safeNext(c.req.query('weiter'));
    if (c.req.query('gesendet'))
      return page(
        c,
        'Fast geschafft',
        html`<div class="wrap acct">
          <p class="label">${T('Konto')}</p>
          <h1>${T('Schau in dein Postfach.')}</h1>
          <p>${T('Wir haben dir einen Link geschickt. Ein Klick darauf bestätigt deine E-Mail-Adresse, danach bist du angemeldet.')}</p>
          <p class="muted">${rich('Nichts angekommen? Schau im Spam-Ordner nach oder {link} – dort kannst du den Link nochmals anfordern.', {
            link: html`<a href="/konto/anmelden">${T('melde dich an')}</a>`,
          })}</p>
        </div>`,
      );
    if (await currentMember(c)) return c.redirect(next, 303);
    return registerPage(c, { next });
  });

  app.post('/konto/registrieren', async (c) => {
    const f = await form(c);
    const next = safeNext(f.weiter);
    if (looksLikeSpam(f)) return c.redirect('/konto/registrieren?gesendet=1', 303);
    if (!rateLimit(`member-register:${clientIp(c)}`, 5, 60 * 60_000).ok)
      return registerPage(c, { next, values: f, error: 'Zu viele Versuche. Bitte versuch es später nochmals.', status: 429 });
    try {
      await registerMember({ email: String(f.email ?? ''), name: String(f.name ?? ''), password: String(f.password ?? ''), newsletter: f.newsletter === '1', next });
      await recordGoal('signup', clientIp(c), c.req.header('user-agent') ?? '', next);
      return c.redirect('/konto/registrieren?gesendet=1', 303);
    } catch (e) {
      return registerPage(c, { next, values: f, error: (e as Error).message, status: 400 });
    }
  });

  /* ---------- confirmation link ---------- */

  // A button instead of confirming on GET: mail scanners open links, people press buttons.
  app.get('/konto/bestaetigen/:token', async (c) => {
    const t = c.req.param('token');
    const next = safeNext(c.req.query('weiter'));
    if (!(await tokenValid(t, 'verify')))
      return page(
        c,
        'Link abgelaufen',
        html`<div class="wrap acct">
          <h1>${T('Dieser Link ist nicht mehr gültig.')}</h1>
          <p>${T('Vielleicht hast du dein Konto schon bestätigt – dann kannst du dich einfach anmelden. Sonst schicken wir dir gerne einen neuen Link.')}</p>
          <div class="actions"><a class="btn" href="/konto/anmelden">${T('Anmelden')}</a></div>
        </div>`,
      );
    return page(
      c,
      'Konto bestätigen',
      html`<div class="wrap acct">
        <p class="label">${T('Konto')}</p>
        <h1>${T('Fast geschafft.')}</h1>
        <p>${T('Ein Klick noch, dann ist deine E-Mail-Adresse bestätigt und du bist angemeldet.')}</p>
        <form method="post" action="/konto/bestaetigen/${t}">${hidden('weiter', next)}<button class="btn">${T('Konto bestätigen')}</button></form>
      </div>`,
    );
  });

  app.post('/konto/bestaetigen/:token', async (c) => {
    const f = await form(c);
    const m = await verifyMember(c.req.param('token'));
    if (!m) return c.redirect(`/konto/bestaetigen/${c.req.param('token')}`, 303);
    await startMemberSession(c, m.id);
    const next = safeNext(f.weiter);
    return c.redirect(next === '/konto' ? '/konto?ok=willkommen' : next, 303);
  });

  app.post('/konto/bestaetigung-erneut', async (c) => {
    const f = await form(c);
    if (rateLimit(`member-resend:${clientIp(c)}`, 3, 60 * 60_000).ok) await resendVerification(String(f.email ?? ''));
    return c.redirect('/konto/registrieren?gesendet=1', 303);
  });

  /* ---------- password ---------- */

  app.get('/konto/passwort-vergessen', async (c) => {
    const sent = Boolean(c.req.query('gesendet'));
    return page(
      c,
      'Passwort vergessen',
      html`<div class="wrap acct">
        <p class="label">${T('Konto')}</p>
        <h1>${T('Passwort vergessen?')}</h1>
        ${sent
          ? ok('Wenn es zu dieser Adresse ein Konto gibt, ist der Link unterwegs. Er gilt zwei Stunden.')
          : html`<p>${T('Kein Problem. Gib deine E-Mail-Adresse ein, wir schicken dir einen Link für ein neues Passwort.')}</p>
              <form class="nform" method="post" action="/konto/passwort-vergessen">
                ${fld('f-email', 'E-Mail', html`<input id="f-email" type="email" name="email" required autocomplete="email" maxlength="200" />`)}
                <div><button class="btn">${T('Link schicken')}</button></div>
              </form>`}
        <p class="acct-alt"><a href="/konto/anmelden">${T('Zurück zur Anmeldung')}</a></p>
      </div>`,
    );
  });

  app.post('/konto/passwort-vergessen', async (c) => {
    const f = await form(c);
    if (rateLimit(`member-reset:${clientIp(c)}`, 5, 60 * 60_000).ok) await requestPasswordReset(String(f.email ?? ''));
    return c.redirect('/konto/passwort-vergessen?gesendet=1', 303);
  });

  const resetPage = async (c: Context, t: string, error: string | null = null, status = 200) =>
    page(
      c,
      'Neues Passwort',
      html`<div class="wrap acct">
        <p class="label">${T('Konto')}</p>
        <h1>${T('Neues Passwort')}</h1>
        ${err(error)}
        <form class="nform" method="post" action="/konto/passwort/${t}">
          ${fld(
            'n-pw',
            'Neues Passwort',
            html`<input id="n-pw" type="password" name="password" required minlength="10" maxlength="200" autocomplete="new-password" aria-describedby="n-pw-h" />`,
            html`<span class="hint" id="n-pw-h">${T('Mindestens 10 Zeichen.')}</span>`,
          )}
          <div><button class="btn">${T('Speichern und anmelden')}</button></div>
        </form>
      </div>`,
      status,
    );

  app.get('/konto/passwort/:token', async (c) => {
    const t = c.req.param('token');
    if (!(await tokenValid(t, 'reset')))
      return page(
        c,
        'Link abgelaufen',
        html`<div class="wrap acct">
          <h1>${T('Dieser Link ist abgelaufen.')}</h1>
          <p>${T('Aus Sicherheitsgründen gilt er nur kurz. Fordere einfach einen neuen an.')}</p>
          <p><a class="btn" href="/konto/passwort-vergessen">${T('Neuen Link anfordern')}</a></p>
        </div>`,
      );
    return resetPage(c, t);
  });

  app.post('/konto/passwort/:token', async (c) => {
    const t = c.req.param('token');
    const f = await form(c);
    try {
      const id = await resetPassword(t, String(f.password ?? ''));
      await startMemberSession(c, id);
      return c.redirect('/konto?ok=passwort', 303);
    } catch (e) {
      return resetPage(c, t, (e as Error).message, 400);
    }
  });

  /* ---------- account ---------- */

  const MESSAGES: Record<string, string> = {
    willkommen: 'Willkommen! Deine E-Mail-Adresse ist bestätigt.',
    passwort: 'Dein neues Passwort ist gespeichert.',
    profil: 'Gespeichert.',
    abo: 'Danke! Deine Mitgliedschaft ist aktiv. Die Quittung kommt per E-Mail von Stripe.',
  };

  const accountPage = async (c: Context, m: CurrentMember, error: string | null = null, status = 200) => {
    const s = await getSettings();
    const q = c.req.query();
    const until = m.paid_until ? new Date(m.paid_until).toLocaleDateString(L(), { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const plan =
      m.level === 'paid'
        ? m.subscription_status === 'canceling'
          ? T('{plan} – gekündigt, läuft bis {date}', { plan: s.members.planName, date: until })
          : m.subscription_status === 'past_due'
            ? T('{plan} – die letzte Zahlung ist offen', { plan: s.members.planName })
            : m.stripe_subscription && ['active', 'trialing'].includes(m.subscription_status)
              ? until
                ? T('{plan} – verlängert sich am {date}', { plan: s.members.planName, date: until })
                : s.members.planName
              : until
                ? T('{plan} bis {date}', { plan: s.members.planName, date: until })
                : s.members.planName
        : T('Kostenloses Konto');
    // Coming back from Stripe: the webhook may still be on its way.
    const message = q.ok === 'abo' || q.abo ? MESSAGES.abo : (MESSAGES[q.ok ?? ''] ?? null);
    const next = q.weiter ? safeNext(q.weiter) : null;
    return page(
      c,
      'Mein Konto',
      html`<div class="wrap acct wide">
        <p class="label">${T('Mein Konto')}</p>
        <h1>${T('Hallo {name}', { name: m.name.split(' ')[0] || m.name })}</h1>
        ${ok(message)}${err(error)}${next && next !== '/konto' ? html`<p><a class="btn" href="${next}">${T('Weiter, wo du warst')}</a></p>` : ''}
        <section class="acct-sec">
          <h2>${T('Mitgliedschaft')}</h2>
          <p class="acct-plan">${plan}</p>
          <div class="actions">
            ${m.level !== 'paid' && paidPlanAvailable(s)
              ? html`<form method="post" action="/konto/abo"><button class="btn">${T('{plan} abschliessen – {price}', {
                  plan: s.members.planName,
                  price: priceLabel(s),
                })}</button></form>`
              : ''}${m.stripe_customer && env.stripe.secretKey
              ? html`<form method="post" action="/konto/abo/verwalten"><button class="btn-2">${T('Abo, Karte und Quittungen')}</button></form>`
              : ''}
          </div>
        </section>
        <section class="acct-sec">
          <h2>${T('Angaben')}</h2>
          <form class="nform" method="post" action="/konto/profil">
            ${fld('a-name', 'Name', html`<input id="a-name" name="name" required maxlength="80" autocomplete="name" value="${m.name}" />`)}
            ${fld(
              'a-email',
              'E-Mail',
              html`<input id="a-email" type="email" value="${m.email}" disabled />`,
              html`<span class="hint">${T('Für eine neue Adresse schreib uns kurz.')}</span>`,
            )}
            <div><button class="btn-2">${T('Speichern')}</button></div>
          </form>
        </section>
        <section class="acct-sec">
          <h2>${T('Passwort ändern')}</h2>
          <form class="nform" method="post" action="/konto/passwort-aendern">
            <input type="text" name="username" value="${m.email}" autocomplete="username" hidden />
            ${fld('a-cur', 'Bisheriges Passwort', html`<input id="a-cur" type="password" name="current" required autocomplete="current-password" maxlength="200" />`)}
            ${fld('a-new', 'Neues Passwort', html`<input id="a-new" type="password" name="password" required minlength="10" maxlength="200" autocomplete="new-password" />`)}
            <div><button class="btn-2">${T('Passwort ändern')}</button></div>
          </form>
        </section>
        <section class="acct-sec">
          <div class="actions">
            <form method="post" action="/konto/abmelden"><button class="btn-2">${T('Abmelden')}</button></form>
            ${q.loeschen ? '' : html`<a class="acct-danger" href="/konto?loeschen=1#loeschen">${T('Konto löschen')}</a>`}
          </div>
          ${q.loeschen
            ? html`<form class="nform bk-confirm" id="loeschen" method="post" action="/konto/loeschen">
                <p>
                  <strong>${T('Konto wirklich löschen?')}</strong> ${m.stripe_subscription && m.level === 'paid' ? `${T('Dein Abo wird sofort beendet.')} ` : ''}${T(
                    'Alles, was zu deinem Konto gehört, wird gelöscht. Das lässt sich nicht rückgängig machen.',
                  )}
                </p>
                <input type="text" name="username" value="${m.email}" autocomplete="username" hidden />${fld(
                  'd-pw',
                  'Zur Sicherheit: dein Passwort',
                  html`<input id="d-pw" type="password" name="password" required autocomplete="current-password" maxlength="200" />`,
                )}
                <div class="actions"><button class="btn">${T('Ja, löschen')}</button><a class="btn-2" href="/konto">${T('Nein, behalten')}</a></div>
              </form>`
            : ''}
        </section>
      </div>`,
      status,
    );
  };

  app.get('/konto', async (c) => {
    const m = await requireMember(c);
    if (m instanceof Response) return m;
    return accountPage(c, m);
  });

  app.post('/konto/profil', async (c) => {
    const m = await requireMember(c);
    if (m instanceof Response) return m;
    const name = String((await form(c)).name ?? '')
      .trim()
      .slice(0, 80);
    if (!name) return accountPage(c, m, 'Der Name darf nicht leer sein.', 400);
    await sql`update members set name = ${name} where id = ${m.id}`;
    return c.redirect('/konto?ok=profil', 303);
  });

  app.post('/konto/passwort-aendern', async (c) => {
    const m = await requireMember(c);
    if (m instanceof Response) return m;
    const f = await form(c);
    if (!rateLimit(`member-pw:${m.id}`, 5, 15 * 60_000).ok) return accountPage(c, m, 'Zu viele Versuche. Bitte warte eine Viertelstunde.', 429);
    try {
      await changePassword(m.id, String(f.current ?? ''), String(f.password ?? ''));
      return c.redirect('/konto?ok=passwort', 303);
    } catch (e) {
      return accountPage(c, m, (e as Error).message, 400);
    }
  });

  app.post('/konto/abo', async (c) => {
    const m = await currentMember(c);
    const next = safeNext((await form(c)).weiter);
    if (!m) return c.redirect(`/konto/anmelden?weiter=${encodeURIComponent(next)}`, 303);
    try {
      return c.redirect(await subscriptionCheckoutUrl(m, next), 303);
    } catch (e) {
      return accountPage(c, m, (e as Error).message, 400);
    }
  });

  app.post('/konto/abo/verwalten', async (c) => {
    const m = await requireMember(c);
    if (m instanceof Response) return m;
    try {
      return c.redirect(await billingPortalUrl(m), 303);
    } catch (e) {
      return accountPage(c, m, (e as Error).message, 400);
    }
  });

  app.post('/konto/loeschen', async (c) => {
    const m = await requireMember(c);
    if (m instanceof Response) return m;
    const f = await form(c);
    const [row] = await sql`select password_hash from members where id = ${m.id}`;
    if (!rateLimit(`member-del:${m.id}`, 5, 15 * 60_000).ok || !(await verifyPassword(String(f.password ?? ''), row.password_hash as string)))
      return accountPage(c, m, 'Das Passwort stimmt nicht.', 400);
    await deleteMember(m.id);
    await endMemberSession(c);
    const s = await getSettings();
    return page(
      c,
      'Konto gelöscht',
      html`<div class="wrap acct">
        <h1>${T('Dein Konto ist gelöscht.')}</h1>
        <p>${T('Danke, dass du dabei warst. Alles Gute von {name}!', { name: s.name })}</p>
        <p><a class="btn-2" href="/">${T('Zur Startseite')}</a></p>
      </div>`,
    );
  });
}

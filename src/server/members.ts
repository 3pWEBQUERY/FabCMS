import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { sql } from './db';
import { env } from './env';
import { getSettings } from './settings';
import { hashPassword, sha256, token, verifyPassword } from './lib/crypto';
import { badRequest, HttpError, notFound } from './lib/http';
import { sendMail } from './mail';
import { notify } from './notify';
import { currentLang, localizePath, pageLang, pathMap } from './translations';
import { L, T } from '../site/i18n';
import { memberLevel, type MemberLevel } from '../shared/members';
import { formatMoney } from '../shared/text';
import type { SiteSettings } from '../shared/types';

/**
 * Mitgliederbereich: accounts for visitors of the website. Kept apart from
 * the team's admin users on purpose – own table, own cookie, no way into
 * the admin.
 */

export const MEMBER_COOKIE = 'nova_member';
const SESSION_DAYS = 60;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DUMMY_HASH = 'scrypt$32768$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

export interface Member {
  id: string;
  email: string;
  name: string;
  status: 'active' | 'blocked';
  email_verified_at: string | null;
  newsletter_optin: boolean;
  paid_until: string | null;
  stripe_customer: string | null;
  stripe_subscription: string | null;
  subscription_status: string;
  note: string;
  created_at: string;
  last_login_at: string | null;
}

export interface CurrentMember extends Member {
  level: MemberLevel;
  session_id: string;
}

const base = (s: SiteSettings) => (s.baseUrl || env.publicUrl).replace(/\/$/, '');
/** A site path in the language of the current request (/konto → /fr/konto). Not for token links: language paths are matched in lower case. */
async function here(path: string): Promise<string> {
  const lang = currentLang();
  return lang ? localizePath(await pathMap(lang), lang, path) : path;
}
const PUBLIC_COLUMNS = sql`id, email, name, status, email_verified_at, newsletter_optin, paid_until, stripe_customer, stripe_subscription, subscription_status, note, created_at, last_login_at`;

/** A same-site path to go back to after signing in; anything else falls back to the account page. */
export function safeNext(v: unknown): string {
  const s = typeof v === 'string' ? v : '';
  return s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') ? s.slice(0, 500) : '/konto';
}

export function priceLabel(s: SiteSettings): string {
  const price = formatMoney(s.members.price, s.shop.currency, L());
  return s.members.interval === 'year' ? T('{price} pro Jahr', { price }) : T('{price} pro Monat', { price });
}

/* ---------- sessions ---------- */

export async function startMemberSession(c: Context, memberId: string): Promise<void> {
  const raw = token(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await sql`insert into member_sessions (id, member_id, expires_at) values (${sha256(raw)}, ${memberId}, ${expires})`;
  await sql`update members set last_login_at = now() where id = ${memberId}`;
  setCookie(c, MEMBER_COOKIE, raw, { httpOnly: true, sameSite: 'Lax', secure: env.production, path: '/', expires });
}

export async function endMemberSession(c: Context): Promise<void> {
  const raw = getCookie(c, MEMBER_COOKIE);
  if (raw) await sql`delete from member_sessions where id = ${sha256(raw)}`;
  deleteCookie(c, MEMBER_COOKIE, { path: '/' });
}

// One lookup per request, however often a page asks.
const perRequest = new WeakMap<Request, Promise<CurrentMember | null>>();

export function currentMember(c: Context): Promise<CurrentMember | null> {
  const raw = getCookie(c, MEMBER_COOKIE);
  if (!raw) return Promise.resolve(null);
  let p = perRequest.get(c.req.raw);
  if (!p) {
    p = (async () => {
      const [row] = await sql`
        select s.id as session_id, m.id, m.email, m.name, m.status, m.email_verified_at, m.newsletter_optin, m.paid_until,
          m.stripe_customer, m.stripe_subscription, m.subscription_status, m.note, m.created_at, m.last_login_at
        from member_sessions s join members m on m.id = s.member_id
        where s.id = ${sha256(raw)} and s.expires_at > now() and m.status = 'active'`;
      if (!row) return null;
      const m = row as unknown as Member & { session_id: string };
      return { ...m, level: memberLevel(m) };
    })();
    perRequest.set(c.req.raw, p);
  }
  return p;
}

/* ---------- mails ---------- */

async function linkToken(memberId: string, kind: 'verify' | 'reset', hours: number): Promise<string> {
  const raw = token(24);
  await sql`delete from member_tokens where member_id = ${memberId} and kind = ${kind}`;
  await sql`insert into member_tokens (id, member_id, kind, expires_at) values (${sha256(raw)}, ${memberId}, ${kind}, ${new Date(Date.now() + hours * 3_600_000)})`;
  return raw;
}

async function useToken(raw: string, kind: 'verify' | 'reset'): Promise<string | null> {
  const [row] = await sql`delete from member_tokens where id = ${sha256(raw)} and kind = ${kind} and expires_at > now() returning member_id`;
  return (row?.member_id as string) ?? null;
}

async function mail(to: string, subject: string, lines: string[]): Promise<void> {
  const s = await getSettings();
  await sendMail({ to, subject, replyTo: s.business.email || undefined, text: [...lines, '', s.name].join('\n') });
}

const hello = (name: string) => (name ? `Hallo ${name.split(' ')[0]},` : 'Hallo,');
/** Greeting in mails a visitor triggers themselves (in the language of their request). */
const helloT = (name: string) => (name ? T('Hallo {name},', { name: name.split(' ')[0] }) : T('Hallo,'));

/* ---------- sign-up, confirmation, sign-in ---------- */

export function checkPassword(pw: string): void {
  if (pw.length < 10) throw badRequest('Das Passwort braucht mindestens 10 Zeichen. Ein Satz ist leichter zu merken als Sonderzeichen.');
  if (pw.length > 200) throw badRequest('Das Passwort ist zu lang.');
}

/**
 * Creates the account and sends the confirmation link. The visible answer is
 * the same for new and known addresses, so the form does not reveal members.
 */
export async function registerMember(input: { email: string; name: string; password: string; newsletter: boolean; next: string }): Promise<void> {
  const s = await getSettings();
  if (s.members.registration !== 'open') throw badRequest('Neue Konten gibt es nur auf Einladung.');
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim().slice(0, 80);
  if (!EMAIL.test(email) || email.length > 200) throw badRequest('Bitte gib eine gültige E-Mail-Adresse ein.');
  if (!name) throw badRequest('Wie heisst du?');
  checkPassword(input.password);
  const [existing] = await sql`select id, name, email_verified_at from members where lower(email) = ${email}`;
  if (existing?.email_verified_at) {
    await mail(email, T('Dein Konto bei {name}', { name: s.name }), [
      helloT(existing.name as string),
      '',
      T('jemand wollte mit dieser Adresse ein neues Konto anlegen. Du hast aber schon eines.'),
      T('Anmelden: {url}', { url: `${base(s)}${await here('/konto/anmelden')}` }),
      T('Passwort vergessen? {url}', { url: `${base(s)}${await here('/konto/passwort-vergessen')}` }),
      '',
      T('Warst du das nicht? Dann kannst du diese E-Mail ignorieren.'),
    ]);
    return;
  }
  const hash = await hashPassword(input.password);
  const [m] = existing
    ? await sql`update members set name = ${name}, password_hash = ${hash}, newsletter_optin = ${input.newsletter} where id = ${existing.id} returning id`
    : await sql`
        insert into members (email, name, password_hash, newsletter_optin) values (${email}, ${name}, ${hash}, ${input.newsletter})
        on conflict ((lower(email))) do nothing returning id`;
  if (!m) return;
  const t = await linkToken(m.id as string, 'verify', 72);
  // Back to the visitor's language after confirming (the confirmation page itself has no language prefix).
  const after = currentLang() ? await here(input.next === '/konto' ? '/konto?ok=willkommen' : input.next) : input.next;
  const next = after !== '/konto' ? `?weiter=${encodeURIComponent(after)}` : '';
  await mail(email, T('Bitte bestätige dein Konto bei {name}', { name: s.name }), [
    helloT(name),
    '',
    T('willkommen! Ein Klick bestätigt deine E-Mail-Adresse, danach bist du angemeldet:'),
    '',
    `${base(s)}/konto/bestaetigen/${t}${next}`,
    '',
    T('Der Link gilt drei Tage. Hast du dich nicht registriert? Dann ignoriere diese E-Mail einfach.'),
  ]);
}

export async function verifyMember(raw: string): Promise<Member | null> {
  const id = await useToken(raw, 'verify');
  if (!id) return null;
  const [m] = await sql`update members set email_verified_at = coalesce(email_verified_at, now()) where id = ${id} returning ${PUBLIC_COLUMNS}`;
  if (!m) return null;
  const s = await getSettings();
  // The click proves the address, so a ticked newsletter box needs no second confirmation.
  if (m.newsletter_optin && s.modules.includes('newsletter')) {
    await sql`
      insert into subscribers (email, name, token, source, status, confirmed_at) values (${m.email}, ${m.name}, ${token(24)}, 'konto', 'active', now())
      on conflict ((lower(email))) do update set status = 'active', confirmed_at = now(), unsubscribed_at = null`;
    await sql`update members set newsletter_optin = false where id = ${m.id}`;
  }
  void notify({ kind: 'system', cap: 'members.manage', title: `Neues Mitglied: ${m.name}`, body: m.email as string, href: `/mitglieder?id=${m.id}` });
  return m as unknown as Member;
}

export async function resendVerification(email: string): Promise<void> {
  const s = await getSettings();
  const [m] = await sql`select id, name, email from members where lower(email) = ${email.trim().toLowerCase()} and email_verified_at is null`;
  if (!m) return;
  const t = await linkToken(m.id as string, 'verify', 72);
  await mail(m.email as string, T('Bitte bestätige dein Konto bei {name}', { name: s.name }), [
    helloT(m.name as string),
    '',
    T('hier ist der Link nochmals:'),
    '',
    `${base(s)}/konto/bestaetigen/${t}`,
  ]);
}

export class UnverifiedError extends HttpError {
  constructor(public email: string) {
    super(403, 'Bitte bestätige zuerst deine E-Mail-Adresse. Den Link haben wir dir bei der Registrierung geschickt.');
  }
}

export async function loginMember(email: string, password: string): Promise<Member> {
  const [m] = await sql`select id, password_hash, status, email_verified_at, email from members where lower(email) = ${email.trim().toLowerCase()}`;
  // Same work for unknown addresses, so timing doesn't reveal members.
  const ok = await verifyPassword(password, (m?.password_hash as string) ?? DUMMY_HASH);
  if (!m || !ok) throw new HttpError(401, 'E-Mail oder Passwort stimmen nicht.');
  if (m.status === 'blocked') throw new HttpError(403, 'Dieses Konto ist gesperrt. Melde dich bei uns, wenn das ein Irrtum ist.');
  if (!m.email_verified_at) throw new UnverifiedError(m.email as string);
  return m as unknown as Member;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const s = await getSettings();
  const [m] = await sql`select id, name, email from members where lower(email) = ${email.trim().toLowerCase()} and status = 'active'`;
  if (!m) return;
  const t = await linkToken(m.id as string, 'reset', 2);
  await mail(m.email as string, T('Neues Passwort für {name}', { name: s.name }), [
    helloT(m.name as string),
    '',
    T('mit diesem Link legst du ein neues Passwort fest. Er gilt zwei Stunden:'),
    '',
    `${base(s)}/konto/passwort/${t}`,
    '',
    T('Hast du das nicht angefordert? Dann bleibt alles, wie es ist.'),
  ]);
}

export async function tokenValid(raw: string, kind: 'verify' | 'reset'): Promise<boolean> {
  const [row] = await sql`select 1 from member_tokens where id = ${sha256(raw)} and kind = ${kind} and expires_at > now()`;
  return Boolean(row);
}

export async function resetPassword(raw: string, password: string): Promise<string> {
  checkPassword(password);
  const id = await useToken(raw, 'reset');
  if (!id) throw badRequest('Der Link ist abgelaufen. Fordere einfach einen neuen an.');
  // Clicking the mailed link also proves the address (relevant for invitations).
  await sql`update members set password_hash = ${await hashPassword(password)}, email_verified_at = coalesce(email_verified_at, now()) where id = ${id}`;
  await sql`delete from member_sessions where member_id = ${id}`;
  return id;
}

export async function changePassword(memberId: string, current: string, next: string): Promise<void> {
  const [m] = await sql`select password_hash from members where id = ${memberId}`;
  if (!m || !(await verifyPassword(current, m.password_hash as string))) throw badRequest('Das bisherige Passwort stimmt nicht.');
  checkPassword(next);
  await sql`update members set password_hash = ${await hashPassword(next)} where id = ${memberId}`;
}

/** Team adds someone: they get a link to choose their own password (valid 7 days). */
export async function inviteMember(input: { email: string; name: string; paidUntil?: string | null }): Promise<Member> {
  const s = await getSettings();
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email)) throw badRequest('Bitte gib eine gültige E-Mail-Adresse ein.');
  const [m] = await sql`
    insert into members (email, name, password_hash, paid_until) values (${email}, ${input.name.trim().slice(0, 80)}, ${DUMMY_HASH}, ${input.paidUntil ?? null})
    on conflict ((lower(email))) do nothing returning ${PUBLIC_COLUMNS}`;
  if (!m) throw badRequest('Zu dieser Adresse gibt es schon ein Konto.');
  const t = await linkToken(m.id as string, 'reset', 7 * 24);
  await mail(email, `Dein Zugang zu ${s.name}`, [
    hello(m.name as string),
    '',
    `${s.name} hat ein Konto für dich angelegt. Leg hier dein Passwort fest, dann bist du drin:`,
    '',
    `${base(s)}/konto/passwort/${t}`,
    '',
    'Der Link gilt sieben Tage.',
  ]);
  return m as unknown as Member;
}

export async function getMember(id: string): Promise<Member> {
  const [m] = await sql`select ${PUBLIC_COLUMNS} from members where id = ${id}`;
  if (!m) throw notFound();
  return m as unknown as Member;
}

export async function deleteMember(id: string): Promise<void> {
  const m = await getMember(id);
  if (m.stripe_subscription && ['active', 'trialing', 'past_due'].includes(m.subscription_status))
    await stripe('DELETE', `/v1/subscriptions/${m.stripe_subscription}`).catch(() => {});
  await sql`delete from members where id = ${id}`;
}

/* ---------- paid membership (Stripe subscriptions, REST) ---------- */

async function stripe(method: 'POST' | 'DELETE', path: string, fields: Record<string, string | number | undefined> = {}): Promise<Record<string, any>> {
  const body = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  const r = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.stripe.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'POST' ? body : undefined,
  });
  const json = (await r.json()) as Record<string, any>;
  if (!r.ok) throw badRequest(`Stripe: ${json.error?.message ?? r.status}`);
  return json;
}

export const paidPlanAvailable = (s: SiteSettings) => s.members.price > 0 && Boolean(env.stripe.secretKey);

export async function subscriptionCheckoutUrl(m: Member, next: string): Promise<string> {
  const s = await getSettings();
  if (!paidPlanAvailable(s)) throw badRequest('Die bezahlte Mitgliedschaft ist gerade nicht verfügbar.');
  const back = base(s);
  const body = await stripe('POST', '/v1/checkout/sessions', {
    mode: 'subscription',
    success_url: `${back}${await here('/konto')}?abo=1&weiter=${encodeURIComponent(next)}`,
    cancel_url: `${back}${await here(next)}`,
    ...(m.stripe_customer ? { customer: m.stripe_customer } : { customer_email: m.email }),
    client_reference_id: m.id,
    'metadata[member_id]': m.id,
    'subscription_data[metadata][member_id]': m.id,
    'line_items[0][quantity]': 1,
    'line_items[0][price_data][currency]': s.shop.currency.toLowerCase(),
    'line_items[0][price_data][unit_amount]': s.members.price,
    'line_items[0][price_data][recurring][interval]': s.members.interval,
    'line_items[0][price_data][product_data][name]': `${s.members.planName} – ${s.name}`,
    locale: pageLang(),
  });
  return body.url as string;
}

/** Stripe's own page for card, invoices and cancelling. */
export async function billingPortalUrl(m: Member): Promise<string> {
  const s = await getSettings();
  if (!m.stripe_customer || !env.stripe.secretKey) throw badRequest('Zu diesem Konto gibt es kein Abo.');
  const body = await stripe('POST', '/v1/billing_portal/sessions', { customer: m.stripe_customer, return_url: `${base(s)}${await here('/konto')}`, locale: pageLang() });
  return body.url as string;
}

const periodEnd = (sub: Record<string, any>): Date | null => {
  // Newer API versions moved the period to the subscription items.
  const t = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  return typeof t === 'number' ? new Date(t * 1000) : null;
};

export async function handleMemberStripeEvent(event: { type: string; data: { object: Record<string, any> } }): Promise<void> {
  const obj = event.data.object;
  if (event.type === 'checkout.session.completed' && obj.mode === 'subscription') {
    const id = obj.metadata?.member_id ?? obj.client_reference_id;
    if (!id) return;
    const [m] = await sql`
      update members set stripe_customer = ${obj.customer ?? null}, stripe_subscription = ${obj.subscription ?? null}, subscription_status = 'active'
      where id = ${id} returning name, email`;
    if (m) void notify({ kind: 'paid', cap: 'members.manage', title: `Neue Mitgliedschaft: ${m.name}`, body: m.email as string, href: `/mitglieder?id=${id}` });
    return;
  }
  if (event.type.startsWith('customer.subscription.')) {
    // «canceling»: cancelled, but paid until the end of the period (paid_until carries that date).
    const status = event.type === 'customer.subscription.deleted' ? 'canceled' : obj.status === 'active' && obj.cancel_at_period_end ? 'canceling' : String(obj.status ?? '');
    await sql`
      update members set subscription_status = ${status}, stripe_subscription = ${obj.id}, stripe_customer = coalesce(stripe_customer, ${obj.customer ?? null}),
        paid_until = coalesce(${periodEnd(obj)}, paid_until)
      where stripe_subscription = ${obj.id} or id::text = ${obj.metadata?.member_id ?? ''}`;
  }
}

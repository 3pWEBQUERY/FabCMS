import type { Hono } from 'hono';
import { sql, json } from './db';
import { env } from './env';
import { requireCap, type AppEnv } from './auth';
import { getSettings } from './settings';
import { sendMail } from './mail';
import { token } from './lib/crypto';
import { quote, type CartItem } from './shop';
import { inStoredLang, storedLang } from './translations';
import { formatMoney } from '../shared/text';
import { T } from '../site/i18n';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Someone ticked «remind me» at the checkout: keep their cart for one mail.
 * Anyone can type any address, so an address gets at most one reminder a week.
 */
export async function rememberCart(input: { email: string; name: string; items: CartItem[] }): Promise<boolean> {
  const s = await getSettings();
  const email = input.email.trim().toLowerCase().slice(0, 200);
  if (!s.modules.includes('shop') || !s.shop.cartReminders.enabled || !EMAIL.test(email) || !input.items.length) return false;
  const [recent] = await sql`select 1 from cart_reminders where lower(email) = ${email} and sent_at > now() - interval '7 days'`;
  if (recent) return false;
  await sql`delete from cart_reminders where lower(email) = ${email} and sent_at is null and ordered_at is null`;
  const hours = Math.min(72, Math.max(1, s.shop.cartReminders.hours));
  await sql`
    insert into cart_reminders (token, email, name, items, lang, remind_at)
    values (${token(18)}, ${email}, ${input.name.trim().slice(0, 80)}, ${json(input.items.slice(0, 50))}, ${storedLang()}, now() + ${hours} * interval '1 hour')`;
  return true;
}

/** The box was unticked again: nothing is kept. */
export async function forgetCart(email: string): Promise<void> {
  await sql`delete from cart_reminders where lower(email) = ${email.trim().toLowerCase()} and sent_at is null and ordered_at is null`;
}

/** An order from this address: no reminder any more, and a sent one counts as having worked. */
export async function cartOrdered(email: string): Promise<void> {
  await sql`
    update cart_reminders set ordered_at = now()
    where lower(email) = ${email.trim().toLowerCase()} and ordered_at is null and created_at > now() - interval '14 days'`;
}

/** Back from the mail: the cart as it was. */
export async function restoreCart(tok: string): Promise<CartItem[] | null> {
  const [r] = await sql`select items from cart_reminders where token = ${tok} and email <> ''`;
  return r ? (r.items as CartItem[]) : null;
}

/** «Forget my cart» from the mail: the row goes at once. */
export async function dropCart(tok: string): Promise<boolean> {
  return (await sql`delete from cart_reminders where token = ${tok}`).count > 0;
}

/** Sends the reminders that are due, each once, in the language the cart was filled in. */
export async function sendCartReminders(): Promise<number> {
  const s = await getSettings();
  if (!s.modules.includes('shop') || !s.shop.cartReminders.enabled) return 0;
  const due = await sql`
    update cart_reminders set sent_at = now()
    where id in (select id from cart_reminders where sent_at is null and ordered_at is null and remind_at <= now() and email <> '' order by remind_at limit 50)
    returning *`;
  for (const r of due) await inStoredLang(r.lang as string, () => reminderMail(r)).catch((e) => console.error('[warenkorb]', e));
  return due.length;
}

async function reminderMail(r: Record<string, any>): Promise<void> {
  const s = await getSettings();
  // Today's prices and what is still there; nothing left, nothing to say.
  const q = await quote(r.items as CartItem[], {});
  if (!q.lines.length) return;
  const base = (s.baseUrl || env.publicUrl).replace(/\/$/, '');
  const lines = q.lines.map((l) => `${l.qty} × ${l.title}${l.variantName ? ` (${l.variantName})` : ''}  ${formatMoney(l.total)}`).join('\n');
  const name = String(r.name ?? '').split(' ')[0];
  const text = [
    name ? T('Hallo {name}', { name }) : T('Hallo'),
    '',
    T('Du hast etwas in den Warenkorb gelegt, aber die Bestellung nicht abgeschlossen. Es liegt noch für dich bereit:'),
    '',
    lines,
    '',
    T('Bestellung abschliessen: {url}', { url: `${base}/warenkorb/zurueck/${r.token}` }),
    '',
    T('Diese Erinnerung kommt nur einmal. Möchtest du, dass wir deinen Warenkorb sofort vergessen, genügt ein Klick: {url}', { url: `${base}/warenkorb/vergessen/${r.token}` }),
    '',
    s.name,
  ].join('\n');
  await sendMail({
    to: r.email as string,
    subject: T('{site}: Dein Warenkorb wartet', { site: s.name }),
    text,
    replyTo: s.business.email || undefined,
    kind: 'cart',
    vars: { name },
  });
}

/** Names, addresses and items go after 14 days; the bare counts after 90. */
export async function cleanCartReminders(): Promise<void> {
  await sql`update cart_reminders set email = '', name = '', items = '[]' where created_at < now() - interval '14 days' and email <> ''`;
  await sql`delete from cart_reminders where created_at < now() - interval '90 days'`;
}

export function cartRemindersApi(app: Hono<AppEnv>) {
  app.get('/api/shop/cart-reminders', async (c) => {
    requireCap(c, 'orders.view');
    const [r] = await sql`
      select count(*) filter (where sent_at is not null)::int as sent,
             count(*) filter (where sent_at is not null and ordered_at > sent_at)::int as ordered,
             count(*) filter (where sent_at is null and ordered_at is null)::int as waiting
      from cart_reminders where created_at > now() - interval '90 days'`;
    return c.json(r);
  });
}

import type { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { sql } from './db';
import { env } from './env';
import { audit, requireCap, type AppEnv } from './auth';
import { getSettings } from './settings';
import { sendMail } from './mail';
import { badRequest, notFound } from './lib/http';
import { inStoredLang } from './translations';
import { formatMoney } from '../shared/text';
import { giftCardCode } from '../shared/giftcards';
import { T } from '../site/i18n';
import type { QuoteLine } from './shop';

const newCode = () => giftCardCode((n) => randomBytes(n));

async function insertCard(tx: typeof sql, card: { amount: number; currency: string; orderId: string | null; email: string; note: string; validUntil: string | null }) {
  // A clash in 31^12 codes is next to impossible – but a second try costs nothing.
  for (let i = 0; i < 3; i++) {
    const [row] = await tx`
      insert into gift_cards (code, initial, balance, currency, order_id, email, note, valid_until)
      values (${newCode()}, ${card.amount}, ${card.amount}, ${card.currency}, ${card.orderId}, ${card.email}, ${card.note}, ${card.validUntil})
      on conflict (code) do nothing returning *`;
    if (row) return row;
  }
  throw new Error('Kein freier Gutscheincode gefunden.');
}

/** After payment: one card per gift card bought, mailed to the buyer. Twice paid is still once issued. */
export async function issueGiftCards(orderId: string): Promise<void> {
  const [o] = await sql`select * from orders where id = ${orderId}`;
  if (!o || !['paid', 'fulfilled'].includes(o.status as string)) return;
  const lines = (o.items as QuoteLine[]).filter((l) => l.giftCard);
  if (!lines.length) return;
  const cards = await sql.begin(async (tx) => {
    const [had] = await tx`select 1 from gift_cards where order_id = ${orderId} limit 1`;
    if (had) return [];
    const out: Record<string, any>[] = [];
    for (const l of lines)
      for (let i = 0; i < l.qty; i++)
        out.push(await insertCard(tx as unknown as typeof sql, { amount: l.unit, currency: o.currency as string, orderId, email: o.email as string, note: '', validUntil: null }));
    return out;
  });
  if (cards.length) await inStoredLang(o.lang as string, () => giftCardMail(o.email as string, String((o.customer as { name?: string }).name ?? ''), cards));
}

async function giftCardMail(to: string, name: string, cards: Record<string, any>[]): Promise<void> {
  const s = await getSettings();
  const base = (s.baseUrl || env.publicUrl).replace(/\/$/, '');
  const first = name.split(' ')[0];
  await sendMail({
    to,
    subject: cards.length === 1 ? T('Dein Geschenkgutschein von {site}', { site: s.name }) : T('Deine Geschenkgutscheine von {site}', { site: s.name }),
    text: [
      first ? T('Hallo {name}', { name: first }) : T('Hallo'),
      '',
      T('Hier ist der Code – zum Verschenken oder selbst Einlösen. Er wird an der Kasse ins Gutscheinfeld eingegeben; was übrig bleibt, bleibt auf dem Gutschein.'),
      '',
      ...cards.flatMap((c) => [
        `${c.code}  ·  ${formatMoney(c.initial as number, c.currency as string)}`,
        T('Zum Ausdrucken: {url}', { url: `${base}/gutschein/${c.id}?code=${c.code}` }),
        '',
      ]),
      s.name,
    ].join('\n'),
    replyTo: s.business.email || undefined,
    kind: 'giftcard',
    vars: { name: first, amount: formatMoney(cards[0].initial as number, cards[0].currency as string) },
  });
}

/** A cancelled or refunded order: what it took from a card goes back on it. */
export async function giveBackGiftCard(tx: typeof sql, o: Record<string, any>): Promise<void> {
  if (!o.gift_card || !(o.gift_amount > 0)) return;
  const [card] = await tx`update gift_cards set balance = balance + ${o.gift_amount} where code = ${o.gift_card} returning id`;
  if (card) await tx`insert into gift_card_uses (card_id, order_id, amount) values (${card.id}, ${o.id}, ${o.gift_amount})`;
  await tx`update orders set gift_amount = 0 where id = ${o.id}`;
}

/** Refunded: the money spent from a card returns to it, and cards this order bought stop working. */
export async function refundGiftCards(orderId: string): Promise<void> {
  await sql.begin(async (tx) => {
    const [o] = await tx`select * from orders where id = ${orderId} for update`;
    if (!o) return;
    await giveBackGiftCard(tx as unknown as typeof sql, o);
    await tx`update gift_cards set active = false where order_id = ${orderId}`;
  });
}

export function giftCardsApi(app: Hono<AppEnv>) {
  app.get('/api/gift-cards', async (c) => {
    requireCap(c, 'orders.view');
    const cards = await sql`
      select g.*, o.number as order_number,
        (select count(*)::int from gift_card_uses u where u.card_id = g.id and u.amount < 0) as uses
      from gift_cards g left join orders o on o.id = g.order_id
      order by g.created_at desc limit 500`;
    return c.json({ cards });
  });

  /** Made by hand, e.g. sold at the counter – mailed when an address is given. */
  app.post('/api/gift-cards', async (c) => {
    requireCap(c, 'orders.manage');
    const s = await getSettings();
    const body = z
      .object({
        amount: z.number().int().min(100, 'Ein Gutschein hat mindestens 1.– Wert.').max(1_000_000),
        email: z.string().trim().max(200).optional(),
        name: z.string().trim().max(80).optional(),
        note: z.string().trim().max(300).optional(),
        validUntil: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
      })
      .parse(await c.req.json());
    if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) throw badRequest('Bitte gib eine gültige E-Mail-Adresse an.');
    const card = await insertCard(sql, {
      amount: body.amount,
      currency: s.shop.currency,
      orderId: null,
      email: body.email?.toLowerCase() ?? '',
      note: body.note ?? '',
      validUntil: body.validUntil ?? null,
    });
    if (body.email) await giftCardMail(body.email, body.name ?? '', [card]);
    await audit(c, 'giftcard.create', 'gift_card', card.id as string, { amount: body.amount });
    return c.json({ card });
  });

  app.patch('/api/gift-cards/:id', async (c) => {
    requireCap(c, 'orders.manage');
    const { active } = z.object({ active: z.boolean() }).parse(await c.req.json());
    const [card] = await sql`update gift_cards set active = ${active} where id = ${c.req.param('id')} returning *`;
    if (!card) throw notFound();
    await audit(c, active ? 'giftcard.activate' : 'giftcard.deactivate', 'gift_card', card.id as string);
    return c.json({ card });
  });
}

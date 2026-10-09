import type { Hono } from 'hono';
import { z } from 'zod';
import { sql } from '../db';
import { audit, requireCap, type AppEnv } from '../auth';
import { notFound } from '../lib/http';
import { getSettings, updateSettings } from '../settings';
import { env } from '../env';
import { setFoodStatus } from '../ordering';
import { localDay } from '../../shared/booking';
import { formatMoney } from '../../shared/text';
import { html } from '../../site/html';

export function orderingApi(app: Hono<AppEnv>) {
  /* the kitchen board: everything open, plus today's finished ones */
  app.get('/api/kitchen', async (c) => {
    requireCap(c, 'orders.manage');
    const s = await getSettings();
    const today = localDay(new Date(), s.timezone).day;
    const orders = await sql`
      select * from food_orders
      where status in ('new', 'preparing', 'ready', 'out')
         or ((slot_at at time zone ${s.timezone})::date = ${today}::date and status in ('done', 'cancelled', 'pending_payment'))
      order by slot_at, number`;
    const [sum] = await sql`
      select count(*) filter (where status <> 'cancelled' and status <> 'pending_payment')::int as count,
             coalesce(sum(total) filter (where status <> 'cancelled' and status <> 'pending_payment'), 0)::int as revenue
      from food_orders where (created_at at time zone ${s.timezone})::date = ${today}::date`;
    return c.json({ orders, today: sum, settings: s.ordering, stripe: Boolean(env.stripe.secretKey), timezone: s.timezone, currency: s.shop.currency });
  });

  app.post('/api/kitchen/:id/status', async (c) => {
    requireCap(c, 'orders.manage');
    const { status } = z.object({ status: z.enum(['preparing', 'ready', 'out', 'done', 'cancelled']) }).parse(await c.req.json());
    const o = await setFoodStatus(c.req.param('id'), status);
    if (status === 'cancelled') await audit(c, 'food.cancel', 'food_order', o.id);
    return c.json({ order: o });
  });

  app.put('/api/kitchen/settings', async (c) => {
    requireCap(c, 'settings.manage');
    const b = z
      .object({
        pickup: z.boolean(),
        delivery: z.boolean(),
        deliveryZips: z.array(z.string().regex(/^\d{4,5}$/, 'Postleitzahlen bitte als Zahlen, z. B. 8400.')).max(200),
        deliveryFee: z.number().int().min(0).max(100_00),
        deliveryMin: z.number().int().min(0).max(1000_00),
        prepMinutes: z
          .number()
          .int()
          .min(5)
          .max(24 * 60),
        slotMinutes: z.number().int().min(5).max(120),
        payOnSite: z.boolean(),
        note: z.string().max(300),
      })
      .parse(await c.req.json());
    const s = await updateSettings({ ordering: { ...(await getSettings()).ordering, ...b } });
    await audit(c, 'food.settings');
    return c.json({ settings: s.ordering });
  });

  /** «Küche voll»: anyone in the kitchen can pause new orders. */
  app.post('/api/kitchen/pause', async (c) => {
    requireCap(c, 'orders.manage');
    const { paused } = z.object({ paused: z.boolean() }).parse(await c.req.json());
    const s = await updateSettings({ ordering: { ...(await getSettings()).ordering, paused } });
    await audit(c, paused ? 'food.pause' : 'food.resume');
    return c.json({ settings: s.ordering });
  });

  /** Kitchen ticket for an 80 mm receipt printer (or any printer). */
  app.get('/api/kitchen/:id/bon', async (c) => {
    requireCap(c, 'orders.manage');
    const s = await getSettings();
    const [o] = await sql`select * from food_orders where id = ${c.req.param('id')}`;
    if (!o) throw notFound();
    const time = new Date(o.slot_at).toLocaleTimeString('de-CH', { timeZone: s.timezone, hour: '2-digit', minute: '2-digit' });
    const items = o.items as { title: string; size: string; q: number; price: number }[];
    const page = html`<!doctype html>
      <html lang="de">
        <head>
          <meta charset="utf-8" />
          <title>Bon ${o.number}</title>
          <style>
            @page {
              size: 80mm auto;
              margin: 4mm;
            }
            body {
              font:
                14px/1.35 ui-monospace,
                Menlo,
                Consolas,
                monospace;
              width: 72mm;
              margin: 0 auto;
              color: #000;
            }
            h1 {
              font-size: 28px;
              margin: 0;
            }
            .big {
              font-size: 18px;
              font-weight: 700;
            }
            hr {
              border: 0;
              border-top: 1px dashed #000;
              margin: 8px 0;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            td {
              vertical-align: top;
              padding: 2px 0;
            }
            td.q {
              width: 2.5em;
              font-weight: 700;
            }
            td.p {
              text-align: right;
              white-space: nowrap;
            }
            .note {
              border: 2px solid #000;
              padding: 4px;
              margin-top: 6px;
              font-weight: 700;
            }
            @media screen {
              body {
                padding: 16px;
              }
            }
          </style>
        </head>
        <body onload="print()">
          <h1>Nr. ${o.number}</h1>
          <p class="big">${o.mode === 'delivery' ? 'LIEFERN' : 'ABHOLEN'} ${time}</p>
          <p>${o.name}<br />${o.phone}${o.mode === 'delivery' ? html`<br />${o.street}<br />${o.zip} ${o.city}` : ''}</p>
          <hr />
          <table>
            ${items.map(
              (i) =>
                html`<tr>
                  <td class="q">${i.q}×</td>
                  <td>${i.title}${i.size ? ` (${i.size})` : ''}</td>
                  <td class="p">${formatMoney(i.price * i.q, o.currency)}</td>
                </tr>`,
            )}
          </table>
          ${o.note ? html`<div class="note">${o.note}</div>` : ''}
          <hr />
          <table>
            <tr>
              <td>Total</td>
              <td class="p"><strong>${formatMoney(o.total, o.currency)}</strong></td>
            </tr>
            <tr>
              <td colspan="2">
                ${o.payment === 'online' ? (o.paid_at ? 'BEZAHLT (online)' : 'Zahlung offen') : 'BEZAHLEN BEI ' + (o.mode === 'delivery' ? 'LIEFERUNG' : 'ABHOLUNG')}
              </td>
            </tr>
          </table>
        </body>
      </html>`;
    c.header('Content-Type', 'text/html; charset=utf-8');
    c.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'");
    return c.body(page.toString());
  });
}

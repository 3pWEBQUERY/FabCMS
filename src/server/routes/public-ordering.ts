import type { Context, Hono } from 'hono';
import type { AppEnv } from '../auth';
import type { Html } from '../../site/html';
import { renderSystemPage } from '../../site/render';
import { checkoutPage, orderPage, statusPage } from '../../site/ordering';
import { getSettings } from '../settings';
import { env } from '../env';
import { clientIp } from '../lib/http';
import { rateLimit } from '../lib/ratelimit';
import { recordGoal } from '../analytics';
import { addToFoodCart, cartLines, foodCheckoutUrl, foodOrderByToken, orderableDishes, placeFoodOrder, readFoodCart, slotsNow, writeFoodCart } from '../ordering';
import { ctxFor, looksLikeSpam, notFoundPage, sendHtml } from './public';

/** /bestellen (menu + cart), /bestellen/kasse (checkout), /essen/:token (status). */
export function orderingPublicRoutes(app: Hono<AppEnv>) {
  const on = async () => (await getSettings()).modules.includes('ordering');
  const page = async (c: Context, title: string, body: Html, status = 200) => {
    c.header('Cache-Control', 'no-store');
    return sendHtml(c, await renderSystemPage(await ctxFor(c), { title, body, description: `Online bestellen bei ${(await getSettings()).name}` }), status);
  };

  app.get('/bestellen', async (c) => {
    if (!(await on())) return notFoundPage(c);
    const s = await getSettings();
    const ctx = await ctxFor(c);
    const lines = await cartLines(await readFoodCart(c));
    c.header('Cache-Control', 'no-store');
    return sendHtml(
      c,
      await renderSystemPage(ctx, {
        title: 'Online bestellen',
        body: orderPage(ctx, await orderableDishes(), lines, slotsNow(s)),
        description: `Take-away und Lieferung von ${s.name}`,
      }),
    );
  });

  app.post('/bestellen/dazu', async (c) => {
    if (!(await on())) return c.notFound();
    const body = (await c.req.parseBody()) as Record<string, string>;
    const d = String(body.d ?? '');
    const s = Math.max(0, Number(body.s) || 0);
    if (!/^[0-9a-f-]{36}$/.test(d)) return c.redirect('/bestellen', 303);
    const items = addToFoodCart(await readFoodCart(c), { d, s, q: 1 });
    const added = (await cartLines(items)).find((l) => l.id === d);
    await writeFoodCart(c, items);
    return c.redirect(`/bestellen${added ? `?hinzu=${encodeURIComponent(added.title)}` : ''}#d-${d}`, 303);
  });

  app.post('/bestellen/menge', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, string>;
    const items = await readFoodCart(c);
    const hit = items.find((x) => x.d === body.d && x.s === Number(body.s));
    if (hit) hit.q = Math.max(0, Math.min(50, Number(body.q) || 0));
    await writeFoodCart(
      c,
      items.filter((x) => x.q > 0),
    );
    return c.redirect('/bestellen#warenkorb', 303);
  });

  app.get('/bestellen/kasse', async (c) => {
    if (!(await on())) return notFoundPage(c);
    const s = await getSettings();
    const lines = await cartLines(await readFoodCart(c));
    if (!lines.length) return c.redirect('/bestellen', 303);
    const ctx = await ctxFor(c);
    return page(c, 'Bestellen', checkoutPage(ctx, lines, slotsNow(s), {}, s.ordering.paused ? 'Die Küche nimmt gerade keine Bestellungen an.' : null));
  });

  app.post('/bestellen/kasse', async (c) => {
    if (!(await on())) return c.notFound();
    const s = await getSettings();
    const body = (await c.req.parseBody()) as Record<string, string>;
    const cart = await readFoodCart(c);
    const again = async (msg: string, status = 400) => page(c, 'Bestellen', checkoutPage(await ctxFor(c), await cartLines(cart), slotsNow(s), body, msg), status);
    if (looksLikeSpam(body)) return c.redirect('/bestellen', 303);
    if (!rateLimit(`food:${clientIp(c)}`, 6, 10 * 60_000).ok) return again('Zu viele Versuche. Bitte warte ein paar Minuten.', 429);
    try {
      const o = await placeFoodOrder({
        cart,
        mode: body.mode,
        slot: body.slot,
        name: body.name ?? '',
        phone: body.phone ?? '',
        email: body.email ?? '',
        street: body.street,
        zip: body.zip,
        city: body.city,
        note: body.note,
        payment: body.payment,
      });
      await writeFoodCart(c, []);
      await recordGoal('food', clientIp(c), c.req.header('user-agent') ?? '', '/bestellen', o.total);
      if (o.status === 'pending_payment') return c.redirect(await foodCheckoutUrl(o), 303);
      return c.redirect(`/essen/${o.token}`, 303);
    } catch (e) {
      return again((e as Error).message);
    }
  });

  app.get('/essen/:token/bezahlen', async (c) => {
    const o = await foodOrderByToken(c.req.param('token'));
    if (!o || o.status !== 'pending_payment' || !env.stripe.secretKey) return c.redirect(`/essen/${c.req.param('token')}`, 303);
    return c.redirect(await foodCheckoutUrl(o), 303);
  });

  app.get('/essen/:token', async (c) => {
    const o = await foodOrderByToken(c.req.param('token'));
    if (!o) return notFoundPage(c);
    const ctx = await ctxFor(c);
    // While the kitchen works on it, the page refreshes itself (no JavaScript needed).
    if (['pending_payment', 'new', 'preparing', 'ready', 'out'].includes(o.status)) c.header('Refresh', '30');
    c.header('Cache-Control', 'no-store');
    return sendHtml(c, await renderSystemPage(ctx, { title: `Bestellung Nr. ${o.number}`, body: statusPage(ctx, o, new URL(c.req.url).searchParams), noindex: true }));
  });
}

import type { Hono } from 'hono';
import { z } from 'zod';
import { sql } from '../db';
import { audit, requireCap, type AppEnv } from '../auth';
import { notFound } from '../lib/http';
import { getSettings } from '../settings';
import { availability, cancelTicketOrder, checkIn, createTicketOrder, describeWhen, ticketEntry, ticketMail } from '../tickets';
import { sessionsOf } from '../../shared/events';
import { entryPath } from '../../shared/paths';
import { activeCollections } from '../content';

const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",;\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function ticketsApi(app: Hono<AppEnv>) {
  /* overview: every event and course with sales */
  app.get('/api/tickets', async (c) => {
    requireCap(c, 'events.manage');
    const s = await getSettings();
    const entries = await sql`
      select id, collection, published_slug as slug, published_data as data from entries
      where collection in ('events', 'courses') and status = 'published'
      order by published_data ->> 'start' asc nulls last`;
    const stats = await sql`
      select o.entry_id, count(t.id)::int as sold, count(t.checked_in_at)::int as checked
      from ticket_orders o join tickets t on t.order_id = o.id where o.status = 'paid' group by o.entry_id`;
    const revenue = await sql`select entry_id, sum(total)::int as revenue from ticket_orders where status = 'paid' group by entry_id`;
    const waiting = await sql`select entry_id, count(*)::int as n from ticket_waitlist where notified_at is null group by entry_id`;
    const now = Date.now();
    const list = await Promise.all(
      entries.map(async (e) => {
        const sessions = sessionsOf(e.data, s.timezone);
        const last = sessions[sessions.length - 1];
        const avail = await availability({ id: e.id as string, collection: e.collection as 'events' | 'courses', slug: e.slug as string, data: e.data });
        const capacity = avail.some((a) => a.capacity === null) ? null : avail.reduce((n, a) => n + (a.capacity ?? 0), 0);
        const st = stats.find((x) => x.entry_id === e.id);
        return {
          id: e.id,
          collection: e.collection,
          title: e.data.title,
          when: describeWhen({ data: e.data }, s),
          start: sessions[0]?.start ?? null,
          past: last ? (last.end ?? last.start).getTime() < now : false,
          cancelled: Boolean(e.data.cancelled),
          ticketed: avail.length > 0,
          sold: st?.sold ?? 0,
          checked: st?.checked ?? 0,
          capacity,
          revenue: revenue.find((x) => x.entry_id === e.id)?.revenue ?? 0,
          waiting: waiting.find((x) => x.entry_id === e.id)?.n ?? 0,
        };
      }),
    );
    return c.json({ entries: list, currency: s.shop.currency });
  });

  app.get('/api/tickets/:entry{[0-9a-f-]{36}}', async (c) => {
    requireCap(c, 'events.manage');
    const s = await getSettings();
    const entry = await ticketEntry(c.req.param('entry'));
    if (!entry) throw notFound();
    const col = (await activeCollections()).find((x) => x.id === entry.collection);
    const orders = await sql`
      select o.id, o.name, o.email, o.phone, o.items, o.total, o.currency, o.status, o.source, o.created_at, o.paid_at, o.token,
        coalesce(json_agg(json_build_object('id', t.id, 'category', t.category, 'code', t.code, 'checked_in_at', t.checked_in_at) order by t.category) filter (where t.id is not null), '[]') as tickets
      from ticket_orders o left join tickets t on t.order_id = o.id
      where o.entry_id = ${entry.id} group by o.id order by o.created_at desc`;
    const waitlist = await sql`select id, name, email, created_at, notified_at from ticket_waitlist where entry_id = ${entry.id} order by created_at`;
    return c.json({
      entry: {
        id: entry.id,
        collection: entry.collection,
        title: entry.data.title,
        when: describeWhen(entry, s),
        path: col ? entryPath(col, entry.slug) : null,
        cancelled: Boolean(entry.data.cancelled),
      },
      categories: await availability(entry),
      orders,
      waitlist,
    });
  });

  app.get('/api/tickets/:entry{[0-9a-f-]{36}}/teilnehmer.csv', async (c) => {
    requireCap(c, 'events.manage');
    const entry = await ticketEntry(c.req.param('entry'));
    if (!entry) throw notFound();
    const rows = await sql`
      select o.name, o.email, o.phone, t.category, t.code, t.checked_in_at, o.total, o.created_at
      from tickets t join ticket_orders o on o.id = t.order_id
      where t.entry_id = ${entry.id} and o.status = 'paid' order by o.name, t.category`;
    const body = [
      ['Name', 'E-Mail', 'Telefon', 'Kategorie', 'Code', 'Eingecheckt', 'Bestellt'],
      ...rows.map((r) => [r.name, r.email, r.phone, r.category, r.code, r.checked_in_at ? new Date(r.checked_in_at).toISOString() : '', new Date(r.created_at).toISOString()]),
    ]
      .map((r) => r.map(csvCell).join(';'))
      .join('\r\n');
    await audit(c, 'tickets.export', 'entry', entry.id);
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="teilnehmer-${entry.slug || 'event'}.csv"`);
    return c.body(`﻿${body}`);
  });

  /* box office / registration by phone: paid on the spot, may exceed the quota */
  app.post('/api/tickets/:entry{[0-9a-f-]{36}}/orders', async (c) => {
    requireCap(c, 'events.manage');
    const b = z
      .object({
        name: z.string(),
        email: z.string(),
        phone: z.string().max(40).default(''),
        quantities: z.record(z.string(), z.number().int().min(0).max(100)),
        override: z.boolean().default(false),
      })
      .parse(await c.req.json());
    const o = await createTicketOrder({
      entryId: c.req.param('entry'),
      quantities: b.quantities,
      name: b.name,
      email: b.email,
      phone: b.phone,
      source: 'admin',
      override: b.override,
    });
    await audit(c, 'tickets.add', 'ticket_order', o.id, { override: b.override });
    return c.json({ order: o });
  });

  app.post('/api/ticket-orders/:id/cancel', async (c) => {
    requireCap(c, 'events.manage');
    const o = await cancelTicketOrder(c.req.param('id'));
    await audit(c, 'tickets.cancel', 'ticket_order', o.id);
    return c.json({ order: o });
  });

  app.post('/api/ticket-orders/:id/resend', async (c) => {
    requireCap(c, 'events.manage');
    await ticketMail(c.req.param('id'));
    return c.json({ ok: true });
  });

  app.delete('/api/ticket-waitlist/:id', async (c) => {
    requireCap(c, 'events.manage');
    await sql`delete from ticket_waitlist where id = ${c.req.param('id')}`;
    return c.json({ ok: true });
  });

  /* the door */
  app.post('/api/tickets/checkin', async (c) => {
    const u = requireCap(c, 'events.manage');
    const { code } = z.object({ code: z.string().min(4).max(40) }).parse(await c.req.json());
    return c.json(await checkIn(code, u.id));
  });

  app.post('/api/tickets/:id/undo-checkin', async (c) => {
    requireCap(c, 'events.manage');
    await sql`update tickets set checked_in_at = null, checked_in_by = null where id = ${c.req.param('id')}`;
    return c.json({ ok: true });
  });
}

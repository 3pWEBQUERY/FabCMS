import type { Hono } from 'hono';
import { z } from 'zod';
import { sql, json } from '../db';
import { audit, requireCap, type AppEnv } from '../auth';
import { badRequest, notFound } from '../lib/http';
import { bumpGeneration, getSettings } from '../settings';
import { env } from '../env';
import { createBooking, ensureFeedToken, listResources, listServices, moveBooking, setBookingStatus, slotsFor, importCalendars } from '../booking';
import { zonedToUtc } from '../../shared/booking';

const hoursSchema = z
  .array(z.object({ day: z.number().int().min(1).max(7), closed: z.boolean(), slots: z.array(z.object({ from: z.string().regex(/^\d{2}:\d{2}$/), to: z.string().regex(/^\d{2}:\d{2}$/) })).max(3) }))
  .length(7)
  .nullable();

const serviceBody = z.object({
  name: z.string().trim().min(1, 'Gib dem Angebot einen Namen.').max(120),
  description: z.string().max(400).default(''),
  duration_min: z.number().int().min(5, 'Mindestens 5 Minuten.').max(24 * 60),
  buffer_min: z.number().int().min(0).max(240).default(0),
  price: z.number().int().min(0).nullable().default(null),
  deposit: z.number().int().min(0).default(0),
  resource_ids: z.array(z.string().uuid()).default([]),
  active: z.boolean().default(true),
  sort_index: z.number().int().default(0),
});

const resourceBody = z.object({
  name: z.string().trim().min(1, 'Gib einen Namen an, z. B. «Tisch 4» oder «Lea».').max(80),
  kind: z.enum(['table', 'staff', 'room']),
  capacity: z.number().int().min(1).max(500),
  hours: hoursSchema.default(null),
  ical_url: z
    .string()
    .trim()
    .max(1000)
    .refine((u) => !u || /^(https|webcal):\/\//.test(u), 'Der Kalender-Link muss mit https:// oder webcal:// beginnen.')
    .default(''),
  active: z.boolean().default(true),
  sort_index: z.number().int().default(0),
});

const dayRe = /^\d{4}-\d{2}-\d{2}$/;
const timeRe = /^\d{2}:\d{2}$/;

export function bookingApi(app: Hono<AppEnv>) {
  /* setup: services, resources, closures, calendar feed */
  app.get('/api/booking/setup', async (c) => {
    requireCap(c, 'bookings.manage');
    const s = await getSettings();
    const [services, resources, blocks] = await Promise.all([
      listServices(),
      listResources(),
      sql`select * from booking_blocks where source = 'manual' and ends_at > now() order by starts_at limit 200`,
    ]);
    const feed = `${(s.baseUrl || env.publicUrl).replace(/\/$/, '')}/_nova/booking/feed/${await ensureFeedToken()}.ics`;
    return c.json({ services, resources, blocks, feed, stripe: Boolean(env.stripe.secretKey) });
  });

  app.post('/api/booking/services', async (c) => {
    requireCap(c, 'settings.manage');
    const b = serviceBody.parse(await c.req.json());
    const [row] = await sql`
      insert into booking_services (name, description, duration_min, buffer_min, price, deposit, resource_ids, active, sort_index)
      values (${b.name}, ${b.description}, ${b.duration_min}, ${b.buffer_min}, ${b.price}, ${b.deposit}, ${b.resource_ids}, ${b.active}, ${b.sort_index}) returning *`;
    bumpGeneration();
    return c.json({ service: row });
  });
  app.put('/api/booking/services/:id', async (c) => {
    requireCap(c, 'settings.manage');
    const b = serviceBody.parse(await c.req.json());
    const [row] = await sql`
      update booking_services set name = ${b.name}, description = ${b.description}, duration_min = ${b.duration_min}, buffer_min = ${b.buffer_min},
        price = ${b.price}, deposit = ${b.deposit}, resource_ids = ${b.resource_ids}, active = ${b.active}, sort_index = ${b.sort_index}
      where id = ${c.req.param('id')} returning *`;
    if (!row) throw notFound();
    bumpGeneration();
    return c.json({ service: row });
  });
  app.delete('/api/booking/services/:id', async (c) => {
    requireCap(c, 'settings.manage');
    await sql`delete from booking_services where id = ${c.req.param('id')}`;
    bumpGeneration();
    return c.json({ ok: true });
  });

  app.post('/api/booking/resources', async (c) => {
    requireCap(c, 'settings.manage');
    const b = resourceBody.parse(await c.req.json());
    const [row] = await sql`
      insert into booking_resources (name, kind, capacity, hours, ical_url, active, sort_index)
      values (${b.name}, ${b.kind}, ${b.kind === 'staff' ? 1 : b.capacity}, ${b.hours ? json(b.hours) : null}, ${b.ical_url}, ${b.active}, ${b.sort_index}) returning *`;
    bumpGeneration();
    if (b.ical_url) void importCalendars();
    return c.json({ resource: row });
  });
  app.put('/api/booking/resources/:id', async (c) => {
    requireCap(c, 'settings.manage');
    const b = resourceBody.parse(await c.req.json());
    const [row] = await sql`
      update booking_resources set name = ${b.name}, kind = ${b.kind}, capacity = ${b.kind === 'staff' ? 1 : b.capacity}, hours = ${b.hours ? json(b.hours) : null},
        ical_url = ${b.ical_url}, active = ${b.active}, sort_index = ${b.sort_index}
      where id = ${c.req.param('id')} returning *`;
    if (!row) throw notFound();
    bumpGeneration();
    if (b.ical_url) void importCalendars();
    return c.json({ resource: row });
  });
  app.delete('/api/booking/resources/:id', async (c) => {
    requireCap(c, 'settings.manage');
    await sql`delete from booking_resources where id = ${c.req.param('id')}`;
    bumpGeneration();
    return c.json({ ok: true });
  });

  /* closures: holidays, private events, a day off */
  app.post('/api/booking/blocks', async (c) => {
    requireCap(c, 'bookings.manage');
    const s = await getSettings();
    const b = z
      .object({ from: z.string().regex(dayRe), to: z.string().regex(dayRe), resource_id: z.string().uuid().nullable().default(null), reason: z.string().max(200).default('') })
      .parse(await c.req.json());
    if (b.to < b.from) throw badRequest('Das Ende liegt vor dem Anfang.');
    const [row] = await sql`
      insert into booking_blocks (resource_id, starts_at, ends_at, reason)
      values (${b.resource_id}, ${zonedToUtc(b.from, 0, s.timezone)}, ${zonedToUtc(b.to, 24 * 60, s.timezone)}, ${b.reason}) returning *`;
    bumpGeneration();
    return c.json({ block: row });
  });
  app.delete('/api/booking/blocks/:id', async (c) => {
    requireCap(c, 'bookings.manage');
    await sql`delete from booking_blocks where id = ${c.req.param('id')} and source = 'manual'`;
    bumpGeneration();
    return c.json({ ok: true });
  });

  /* the day plan */
  app.get('/api/bookings', async (c) => {
    requireCap(c, 'bookings.manage');
    const s = await getSettings();
    const from = c.req.query('from') ?? '';
    const to = c.req.query('to') ?? from;
    if (!dayRe.test(from) || !dayRe.test(to)) throw badRequest('Ungültiges Datum.');
    const [bookings, blocks, pending] = await Promise.all([
      sql`
        select b.*, sv.name as service_name, r.name as resource_name from bookings b
        left join booking_services sv on sv.id = b.service_id left join booking_resources r on r.id = b.resource_id
        where b.starts_at >= ${zonedToUtc(from, 0, s.timezone)} and b.starts_at < ${zonedToUtc(to, 24 * 60, s.timezone)}
        order by b.starts_at`,
      sql`select * from booking_blocks where starts_at < ${zonedToUtc(to, 24 * 60, s.timezone)} and ends_at > ${zonedToUtc(from, 0, s.timezone)} order by starts_at`,
      sql`select b.id, b.name, b.starts_at, b.party_size from bookings b where b.status = 'pending' and b.starts_at > now() order by b.starts_at limit 50`,
    ]);
    return c.json({ bookings, blocks, pending });
  });

  app.get('/api/booking/slots', async (c) => {
    requireCap(c, 'bookings.manage');
    const day = c.req.query('day') ?? '';
    if (!dayRe.test(day)) throw badRequest('Ungültiges Datum.');
    const slots = await slotsFor(c.req.query('service') ?? '', day, Number(c.req.query('party')) || 1, new Date(), true);
    return c.json({ slots: slots.map((x) => ({ time: x.time, resourceId: x.resourceId })) });
  });

  /* phone and walk-in bookings by the team */
  app.post('/api/bookings', async (c) => {
    requireCap(c, 'bookings.manage');
    const b = z
      .object({
        serviceId: z.string().uuid({ message: 'Wähle, was gebucht wird.' }),
        day: z.string().regex(dayRe),
        time: z.string().regex(timeRe, 'Gib eine Uhrzeit an.'),
        party: z.number().int().min(1).max(99),
        resourceId: z.string().uuid().nullable().default(null),
        name: z.string().trim().min(1, 'Gib einen Namen an.').max(120),
        email: z.string().max(200).default(''),
        phone: z.string().max(40).default(''),
        note: z.string().max(1000).default(''),
        source: z.enum(['phone', 'walk_in', 'web']).default('phone'),
        mail: z.boolean().default(false),
      })
      .parse(await c.req.json());
    const booking = await createBooking(b, { staff: true, resourceId: b.resourceId, source: b.source });
    await audit(c, 'booking.create', 'booking', booking.id, { name: b.name, day: b.day, time: b.time });
    if (b.mail && b.email) await setBookingStatus(booking.id, 'confirmed', { mail: true });
    return c.json({ booking });
  });

  app.patch('/api/bookings/:id', async (c) => {
    requireCap(c, 'bookings.manage');
    const id = c.req.param('id');
    const b = z
      .object({
        status: z.enum(['pending', 'confirmed', 'cancelled', 'no_show', 'done']).optional(),
        mail: z.boolean().default(true),
        internal_note: z.string().max(2000).optional(),
        move: z.object({ day: z.string().regex(dayRe), time: z.string().regex(timeRe), resourceId: z.string().uuid().nullable(), party: z.number().int().min(1).max(99) }).optional(),
      })
      .parse(await c.req.json());
    if (b.move) await moveBooking(id, b.move);
    if (b.internal_note !== undefined) await sql`update bookings set internal_note = ${b.internal_note}, updated_at = now() where id = ${id}`;
    if (b.status) {
      await setBookingStatus(id, b.status, { mail: b.mail });
      await audit(c, `booking.${b.status}`, 'booking', id);
    }
    const [row] = await sql`
      select b.*, sv.name as service_name, r.name as resource_name from bookings b
      left join booking_services sv on sv.id = b.service_id left join booking_resources r on r.id = b.resource_id where b.id = ${id}`;
    if (!row) throw notFound();
    return c.json({ booking: row });
  });
}

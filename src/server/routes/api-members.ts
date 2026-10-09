import type { Hono } from 'hono';
import { z } from 'zod';
import { sql } from '../db';
import { audit, requireCap, type AppEnv } from '../auth';
import { notFound } from '../lib/http';
import { getSettings, updateSettings } from '../settings';
import { env } from '../env';
import { deleteMember, getMember, inviteMember } from '../members';
import { memberLevel } from '../../shared/members';

const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",;\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function membersApi(app: Hono<AppEnv>) {
  app.get('/api/members', async (c) => {
    requireCap(c, 'members.manage');
    const s = await getSettings();
    const filter = c.req.query('filter') ?? 'all';
    const q = `%${(c.req.query('q') ?? '').trim().toLowerCase()}%`;
    const paid = sql`(subscription_status in ('active', 'trialing', 'past_due') or paid_until > now())`;
    const where =
      filter === 'paid'
        ? sql`and ${paid}`
        : filter === 'free'
          ? sql`and not ${paid} and email_verified_at is not null`
          : filter === 'unverified'
            ? sql`and email_verified_at is null`
            : filter === 'blocked'
              ? sql`and status = 'blocked'`
              : sql``;
    const rows = await sql`
      select id, email, name, status, email_verified_at, paid_until, stripe_customer, stripe_subscription, subscription_status, note, created_at, last_login_at
      from members where (lower(email) like ${q} or lower(name) like ${q}) ${where}
      order by created_at desc limit 500`;
    const [counts] = await sql`
      select count(*)::int as all, count(*) filter (where ${paid})::int as paid,
             count(*) filter (where email_verified_at is null)::int as unverified,
             count(*) filter (where status = 'blocked')::int as blocked
      from members`;
    return c.json({
      members: rows.map((m) => ({ ...m, level: memberLevel(m as never) })),
      counts,
      settings: s.members,
      stripe: Boolean(env.stripe.secretKey),
      webhook: Boolean(env.stripe.webhookSecret),
    });
  });

  app.get('/api/members.csv', async (c) => {
    requireCap(c, 'members.manage');
    const rows = await sql`select name, email, status, email_verified_at, paid_until, subscription_status, created_at, last_login_at from members order by created_at`;
    const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : '');
    const body = [
      ['Name', 'E-Mail', 'Status', 'Bestätigt', 'Bezahlt bis', 'Abo', 'Seit', 'Zuletzt angemeldet'],
      ...rows.map((r) => [r.name, r.email, r.status, iso(r.email_verified_at), iso(r.paid_until), r.subscription_status, iso(r.created_at), iso(r.last_login_at)]),
    ]
      .map((r) => r.map(csvCell).join(';'))
      .join('\r\n');
    await audit(c, 'members.export');
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="mitglieder-${new Date().toISOString().slice(0, 10)}.csv"`);
    return c.body(`﻿${body}`);
  });

  app.put('/api/members/settings', async (c) => {
    requireCap(c, 'members.manage');
    const b = z
      .object({
        registration: z.enum(['open', 'invite']),
        planName: z.string().trim().min(1, 'Gib der Mitgliedschaft einen Namen.').max(60),
        price: z.number().int().min(0).max(1_000_000),
        interval: z.enum(['month', 'year']),
        perks: z.string().max(2000),
      })
      .parse(await c.req.json());
    const s = await updateSettings({ members: b });
    await audit(c, 'members.settings', '', '', { registration: b.registration, price: b.price, interval: b.interval });
    return c.json({ settings: s.members });
  });

  app.post('/api/members', async (c) => {
    requireCap(c, 'members.manage');
    const b = z
      .object({
        email: z.string(),
        name: z.string().max(80).default(''),
        paidUntil: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .default(null),
      })
      .parse(await c.req.json());
    const m = await inviteMember({ email: b.email, name: b.name, paidUntil: b.paidUntil ? `${b.paidUntil}T23:59:59Z` : null });
    await audit(c, 'members.invite', 'member', m.id);
    return c.json({ member: m });
  });

  app.patch('/api/members/:id', async (c) => {
    requireCap(c, 'members.manage');
    const id = c.req.param('id');
    const b = z
      .object({
        name: z.string().trim().min(1).max(80).optional(),
        status: z.enum(['active', 'blocked']).optional(),
        // Free access granted by hand («Zugang schenken»); null removes it.
        paid_until: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
        note: z.string().max(2000).optional(),
      })
      .parse(await c.req.json());
    await getMember(id);
    if (b.name !== undefined) await sql`update members set name = ${b.name} where id = ${id}`;
    if (b.note !== undefined) await sql`update members set note = ${b.note} where id = ${id}`;
    if (b.paid_until !== undefined) await sql`update members set paid_until = ${b.paid_until ? `${b.paid_until}T23:59:59Z` : null} where id = ${id}`;
    if (b.status !== undefined) {
      await sql`update members set status = ${b.status} where id = ${id}`;
      // Blocking ends every open session right away.
      if (b.status === 'blocked') await sql`delete from member_sessions where member_id = ${id}`;
    }
    await audit(c, 'members.update', 'member', id, { status: b.status, paid_until: b.paid_until });
    const m = await getMember(id);
    return c.json({ member: { ...m, level: memberLevel(m) } });
  });

  app.delete('/api/members/:id', async (c) => {
    requireCap(c, 'members.manage');
    const id = c.req.param('id');
    const [exists] = await sql`select 1 from members where id = ${id}`;
    if (!exists) throw notFound();
    await deleteMember(id);
    await audit(c, 'members.delete', 'member', id);
    return c.json({ ok: true });
  });
}

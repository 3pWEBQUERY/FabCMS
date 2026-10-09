import type { Hono } from 'hono';
import { z } from 'zod';
import { sql } from '../db';
import { audit, requireCap, type AppEnv } from '../auth';
import { badRequest } from '../lib/http';
import { getSettings, updateSettings } from '../settings';
import { env } from '../env';
import { receiptBody } from '../donations';
import { renderSystemPage, createContext } from '../../site/render';
import { activeCollections } from '../content';

const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",;\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const yearOf = (v: string | undefined) => (Number(v) > 2000 && Number(v) < 3000 ? Number(v) : new Date().getFullYear());

export function donationsApi(app: Hono<AppEnv>) {
  app.get('/api/donations', async (c) => {
    requireCap(c, 'donations.manage');
    const s = await getSettings();
    const year = yearOf(c.req.query('jahr'));
    const campaign = c.req.query('kampagne') ?? null;
    const rows = await sql`
      select id, amount, currency, interval, campaign, name, email, anonymous, status, parent_id, subscription_active, created_at, paid_at, token
      from donations where status = 'paid' and extract(year from paid_at) = ${year} ${campaign !== null ? sql`and campaign = ${campaign}` : sql``}
      order by paid_at desc limit 1000`;
    const [kpi] = await sql`
      select coalesce(sum(amount), 0)::int as total, count(*)::int as count, count(distinct lower(email))::int as donors
      from donations where status = 'paid' and extract(year from paid_at) = ${year}`;
    const [monthly] = await sql`select count(*)::int as n, coalesce(sum(amount), 0)::int as sum from donations where parent_id is null and subscription_active`;
    const campaigns = await sql`
      select campaign, coalesce(sum(amount), 0)::int as total, count(*)::int as count from donations
      where status = 'paid' and extract(year from paid_at) = ${year} group by campaign order by 2 desc`;
    const years = await sql`select distinct extract(year from paid_at)::int as y from donations where status = 'paid' order by 1 desc`;
    return c.json({
      year,
      years: years.map((y) => y.y as number),
      donations: rows,
      kpi: { ...kpi, monthly: monthly.n, monthlySum: monthly.sum },
      campaigns,
      settings: s.donations,
      currency: s.shop.currency,
      stripe: Boolean(env.stripe.secretKey),
    });
  });

  app.get('/api/donations.csv', async (c) => {
    requireCap(c, 'donations.manage');
    const year = yearOf(c.req.query('jahr'));
    const rows = await sql`
      select paid_at, amount, currency, interval, campaign, name, email, street, zip, city, anonymous, payment_ref
      from donations where status = 'paid' and extract(year from paid_at) = ${year} order by paid_at`;
    const body = [
      ['Datum', 'Betrag', 'Währung', 'Rhythmus', 'Kampagne', 'Name', 'E-Mail', 'Strasse', 'PLZ', 'Ort', 'Anonym', 'Zahlungsreferenz'],
      ...rows.map((r) => [
        new Date(r.paid_at).toISOString().slice(0, 10),
        ((r.amount as number) / 100).toFixed(2),
        r.currency,
        r.interval === 'month' ? 'monatlich' : 'einmalig',
        r.campaign,
        r.name,
        r.email,
        r.street,
        r.zip,
        r.city,
        r.anonymous ? 'ja' : '',
        r.payment_ref,
      ]),
    ]
      .map((r) => r.map(csvCell).join(';'))
      .join('\r\n');
    await audit(c, 'donations.export', '', '', { year });
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="spenden-${year}.csv"`);
    return c.body(`﻿${body}`);
  });

  /** Annual receipts: one line per donor with the year's sum. */
  app.get('/api/donations/donors', async (c) => {
    requireCap(c, 'donations.manage');
    const year = yearOf(c.req.query('jahr'));
    const rows = await sql`
      select lower(email) as email, max(name) as name, sum(amount)::int as total, count(*)::int as count,
        bool_or(street <> '' and zip <> '') as has_address
      from donations where status = 'paid' and extract(year from paid_at) = ${year}
      group by lower(email) order by 3 desc`;
    return c.json({ year, donors: rows });
  });

  app.get('/api/donations/receipt', async (c) => {
    requireCap(c, 'donations.manage');
    const s = await getSettings();
    const year = yearOf(c.req.query('jahr'));
    const email = (c.req.query('email') ?? '').toLowerCase();
    const rows = await sql`
      select amount, paid_at, name, email, street, zip, city, currency from donations
      where status = 'paid' and lower(email) = ${email} and extract(year from paid_at) = ${year} order by paid_at`;
    if (!rows.length) throw badRequest('Für diese Adresse gibt es in diesem Jahr keine Spenden.');
    const last = [...rows].reverse().find((r) => r.street) ?? rows[rows.length - 1];
    const donor = { name: last.name as string, email, street: last.street as string, zip: last.zip as string, city: last.city as string, currency: last.currency as string };
    const ctx = createContext({ settings: s, collections: await activeCollections(), path: '/spende', base: s.baseUrl || env.publicUrl });
    const body = receiptBody(s, donor, rows as unknown as { amount: number; paid_at: string }[], `im Jahr ${year}`);
    c.header('Content-Type', 'text/html; charset=utf-8');
    return c.body(await renderSystemPage(ctx, { title: `Spendenbestätigung ${year}`, body, noindex: true }));
  });

  app.put('/api/donations/settings', async (c) => {
    requireCap(c, 'donations.manage');
    const b = z
      .object({
        recipient: z.string().max(120),
        iban: z
          .string()
          .max(40)
          .transform((v) => v.replace(/\s+/g, ' ').trim().toUpperCase())
          .refine((v) => !v || /^[A-Z]{2}\d{2}[A-Z0-9 ]{10,36}$/.test(v), 'Die IBAN sieht nicht richtig aus.'),
        taxDeductible: z.boolean(),
        receiptNote: z.string().max(400),
      })
      .parse(await c.req.json());
    const s = await updateSettings({ donations: b });
    await audit(c, 'donations.settings');
    return c.json({ settings: s.donations });
  });
}

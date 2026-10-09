import type { Hono } from 'hono';
import { invoiceHtml } from '../invoice';
import { z } from 'zod';
import { sql, json } from '../db';
import { audit, requireAnyCap, requireCap, type AppEnv } from '../auth';
import { badRequest, notFound, toCsv } from '../lib/http';
import { bumpGeneration, getSettings } from '../settings';
import { cancelOrder, markPaid, sendOrderMails, type QuoteLine } from '../shop';
import { slugify, shortId, formatMoney, formatPrice } from '../../shared/text';
import type { FormDef } from '../../shared/types';

const formField = z.object({
  id: z.string().max(24),
  type: z.enum(['text', 'email', 'tel', 'textarea', 'select', 'checkbox', 'date', 'number', 'file', 'step']),
  label: z.string().trim().min(1, 'Jedes Feld braucht eine Beschriftung.').max(200),
  name: z.string().max(60),
  required: z.boolean(),
  options: z.array(z.string().max(120)).max(50).optional(),
  placeholder: z.string().max(120).optional(),
  help: z.string().max(300).optional(),
  showIf: z.object({ field: z.string(), equals: z.string() }).nullable().optional(),
});

const formBody = z.object({
  name: z.string().trim().min(1, 'Gib dem Formular einen Namen.').max(120),
  fields: z.array(formField).max(60),
  settings: z.object({
    submitLabel: z.string().max(60).default('Senden'),
    successMessage: z.string().max(500).default('Danke! Wir melden uns bald.'),
    notifyEmail: z.string().max(200).default(''),
    createLead: z.boolean().default(true),
    turnstile: z.boolean().default(false),
  }),
});

function normalizeFields(fields: z.infer<typeof formField>[]) {
  const used = new Set<string>();
  return fields.map((f) => {
    let name = slugify(f.name || f.label).replace(/-/g, '_').replace(/\//g, '_') || 'feld';
    if (f.type === 'step') name = `step_${f.id}`;
    let n = name;
    for (let i = 2; used.has(n) || ['website', '_t', '_page'].includes(n); i++) n = `${name}_${i}`;
    used.add(n);
    return { ...f, name: n, id: f.id || shortId(8) };
  });
}

export function businessApi(app: Hono<AppEnv>) {
  /* ---------- forms ---------- */

  app.get('/api/forms', async (c) => {
    requireAnyCap(c, 'forms.manage', 'content.edit');
    const rows = await sql`
      select f.*, (select count(*)::int from submissions s where s.form_id = f.id) as submissions,
             (select count(*)::int from submissions s where s.form_id = f.id and not s.read) as unread
      from forms f order by f.created_at`;
    return c.json({ forms: rows });
  });

  app.post('/api/forms', async (c) => {
    requireCap(c, 'forms.manage');
    const body = formBody.parse(await c.req.json());
    const [f] = await sql`insert into forms (name, fields, settings) values (${body.name}, ${json(normalizeFields(body.fields))}, ${json(body.settings)}) returning *`;
    await audit(c, 'form.create', 'form', f.id as string);
    return c.json({ form: f });
  });

  app.put('/api/forms/:id', async (c) => {
    requireCap(c, 'forms.manage');
    const body = formBody.parse(await c.req.json());
    const [f] = await sql`
      update forms set name = ${body.name}, fields = ${json(normalizeFields(body.fields))}, settings = ${json(body.settings)}, updated_at = now()
      where id = ${c.req.param('id')} returning *`;
    if (!f) throw notFound();
    bumpGeneration();
    await audit(c, 'form.update', 'form', f.id as string);
    return c.json({ form: f });
  });

  app.delete('/api/forms/:id', async (c) => {
    requireCap(c, 'forms.manage');
    const id = c.req.param('id');
    const [{ n }] = await sql`select count(*)::int as n from submissions where form_id = ${id}`;
    if (n > 0 && c.req.query('force') !== '1') throw badRequest(`Dieses Formular hat ${n} Einträge. Exportiere sie zuerst oder bestätige das Löschen.`, { count: n });
    await sql`delete from forms where id = ${id}`;
    bumpGeneration();
    await audit(c, 'form.delete', 'form', id, { submissions: n });
    return c.json({ ok: true });
  });

  app.get('/api/forms/:id/submissions', async (c) => {
    requireAnyCap(c, 'forms.manage', 'leads.view');
    const [form] = await sql`select * from forms where id = ${c.req.param('id')}`;
    if (!form) throw notFound();
    const rows = await sql`select * from submissions where form_id = ${form.id} order by created_at desc limit 1000`;
    if (c.req.query('format') === 'csv') {
      const fields = (form as unknown as FormDef).fields.filter((f) => f.type !== 'step');
      const csv = toCsv(
        rows.map((r) => ({
          Datum: new Date(r.created_at).toLocaleString('de-CH'),
          ...Object.fromEntries(fields.map((f) => [f.label, f.type === 'file' ? (r.files as { field: string; filename: string }[]).find((x) => x.field === f.name)?.filename ?? '' : (r.data as Record<string, string>)[f.name] ?? ''])),
          Seite: r.page,
        })),
      );
      c.header('Content-Type', 'text/csv; charset=utf-8');
      c.header('Content-Disposition', `attachment; filename="${slugify(form.name as string) || 'formular'}.csv"`);
      return c.body(csv);
    }
    return c.json({ form, submissions: rows });
  });

  app.patch('/api/submissions/:id', async (c) => {
    requireAnyCap(c, 'forms.manage', 'leads.view');
    const { read } = z.object({ read: z.boolean() }).parse(await c.req.json());
    await sql`update submissions set read = ${read} where id = ${c.req.param('id')}`;
    return c.json({ ok: true });
  });

  app.delete('/api/submissions/:id', async (c) => {
    requireCap(c, 'forms.manage');
    await sql`delete from submissions where id = ${c.req.param('id')}`;
    await audit(c, 'submission.delete', 'submission', c.req.param('id'));
    return c.json({ ok: true });
  });

  /* ---------- contacts (CRM-light) ---------- */

  app.get('/api/contacts', async (c) => {
    requireCap(c, 'leads.view');
    const q = c.req.query();
    const status = q.status ? sql`and status = ${q.status}` : sql``;
    const search = q.q ? sql`and (name ilike ${'%' + q.q + '%'} or email ilike ${'%' + q.q + '%'} or company ilike ${'%' + q.q + '%'})` : sql``;
    const rows = await sql`
      select c.*, (select count(*)::int from submissions s where s.contact_id = c.id) as submissions,
             (select max(created_at) from submissions s where s.contact_id = c.id) as last_contact
      from contacts c where true ${status} ${search} order by c.updated_at desc limit 1000`;
    if (q.format === 'csv') {
      c.header('Content-Type', 'text/csv; charset=utf-8');
      c.header('Content-Disposition', 'attachment; filename="kontakte.csv"');
      return c.body(
        toCsv(
          rows.map((r) => ({
            Name: r.name,
            'E-Mail': r.email,
            Telefon: r.phone,
            Firma: r.company,
            Status: r.status,
            Quelle: r.source,
            Wert: r.value_cents ? formatPrice(r.value_cents) : '',
            Erstellt: new Date(r.created_at).toLocaleDateString('de-CH'),
          })),
        ),
      );
    }
    return c.json({ contacts: rows });
  });

  app.get('/api/contacts/:id', async (c) => {
    requireCap(c, 'leads.view');
    const [ct] = await sql`select * from contacts where id = ${c.req.param('id')}`;
    if (!ct) throw notFound();
    const submissions = await sql`select s.*, f.name as form_name, f.fields from submissions s join forms f on f.id = s.form_id where s.contact_id = ${ct.id} order by s.created_at desc`;
    const orders = ct.email ? await sql`select id, number, total, status, created_at from orders where lower(email) = lower(${ct.email}) order by created_at desc` : [];
    return c.json({ contact: ct, submissions, orders });
  });

  const contactBody = z.object({
    name: z.string().max(120).optional(),
    email: z.string().email().nullable().optional(),
    phone: z.string().max(60).optional(),
    company: z.string().max(120).optional(),
    status: z.enum(['new', 'contacted', 'offer', 'won', 'lost']).optional(),
    value_cents: z.number().int().min(0).nullable().optional(),
    note: z.string().max(4000).optional(),
  });

  app.post('/api/contacts', async (c) => {
    const user = requireCap(c, 'leads.view');
    const b = contactBody.parse(await c.req.json());
    const [ct] = await sql`
      insert into contacts (name, email, phone, company, status, source, notes)
      values (${b.name ?? ''}, ${b.email ?? null}, ${b.phone ?? ''}, ${b.company ?? ''}, ${b.status ?? 'new'}, 'manuell',
              ${json(b.note ? [{ id: shortId(), text: b.note, at: new Date().toISOString(), by: user.name }] : [])})
      returning *`;
    return c.json({ contact: ct });
  });

  app.patch('/api/contacts/:id', async (c) => {
    const user = requireCap(c, 'leads.view');
    const id = c.req.param('id');
    const b = contactBody.parse(await c.req.json());
    const [cur] = await sql`select * from contacts where id = ${id}`;
    if (!cur) throw notFound();
    const notes = b.note ? [...(cur.notes as unknown[]), { id: shortId(), text: b.note, at: new Date().toISOString(), by: user.name }] : cur.notes;
    const [ct] = await sql`
      update contacts set name = ${b.name ?? cur.name}, email = ${b.email === undefined ? cur.email : b.email}, phone = ${b.phone ?? cur.phone},
        company = ${b.company ?? cur.company}, status = ${b.status ?? cur.status},
        value_cents = ${b.value_cents === undefined ? cur.value_cents : b.value_cents}, notes = ${json(notes)}, updated_at = now()
      where id = ${id} returning *`;
    return c.json({ contact: ct });
  });

  app.delete('/api/contacts/:id', async (c) => {
    requireCap(c, 'privacy.manage');
    await sql`delete from contacts where id = ${c.req.param('id')}`;
    await audit(c, 'contact.delete', 'contact', c.req.param('id'));
    return c.json({ ok: true });
  });

  /* ---------- orders ---------- */

  app.get('/api/orders', async (c) => {
    requireCap(c, 'orders.view');
    const q = c.req.query();
    const status = q.status ? sql`and status = ${q.status}` : sql``;
    const rows = await sql`select * from orders where true ${status} order by created_at desc limit 1000`;
    if (q.format === 'csv') {
      c.header('Content-Type', 'text/csv; charset=utf-8');
      c.header('Content-Disposition', 'attachment; filename="bestellungen.csv"');
      return c.body(
        toCsv(
          rows.map((o) => ({
            Nummer: o.number,
            Datum: new Date(o.created_at).toLocaleString('de-CH'),
            Status: o.status,
            Name: o.customer.name,
            'E-Mail': o.email,
            Artikel: (o.items as QuoteLine[]).map((l) => `${l.qty}× ${l.title}${l.variantName ? ` (${l.variantName})` : ''}`).join(', '),
            Zwischensumme: formatPrice(o.subtotal),
            Rabatt: formatPrice(o.discount),
            Versand: formatPrice(o.shipping),
            Total: formatPrice(o.total),
            MwSt: (o.vat as { rate: number; amount: number }[]).map((v) => `${v.rate}%: ${formatPrice(v.amount)}`).join(', '),
            Zahlung: o.payment_method,
            Gutschein: o.coupon ?? '',
          })),
        ),
      );
    }
    const [sum] = await sql`select coalesce(sum(total) filter (where status in ('paid','fulfilled')), 0)::int as revenue, count(*) filter (where status = 'paid')::int as to_ship from orders`;
    return c.json({ orders: rows, summary: sum });
  });

  app.get('/api/orders/:id', async (c) => {
    requireCap(c, 'orders.view');
    const [o] = await sql`select * from orders where id = ${c.req.param('id')}`;
    if (!o) throw notFound();
    return c.json({ order: o });
  });

  app.patch('/api/orders/:id', async (c) => {
    requireCap(c, 'orders.manage');
    const id = c.req.param('id');
    const { status, note } = z.object({ status: z.enum(['paid', 'fulfilled', 'cancelled', 'refunded']).optional(), note: z.string().max(2000).optional() }).parse(await c.req.json());
    const [o] = await sql`select status from orders where id = ${id}`;
    if (!o) throw notFound();
    if (status === 'paid' && o.status === 'pending') await markPaid(id, 'manuell');
    else if (status === 'cancelled' && o.status === 'pending') await cancelOrder(id, 'Manuell storniert.');
    else if (status) {
      const allowed: Record<string, string[]> = { paid: ['fulfilled', 'refunded'], fulfilled: ['refunded'], pending: [] };
      if (!allowed[o.status]?.includes(status)) throw badRequest('Dieser Statuswechsel ist nicht möglich.');
      await sql`update orders set status = ${status}, updated_at = now() where id = ${id}`;
    }
    if (note !== undefined) await sql`update orders set note = ${note} where id = ${id}`;
    await audit(c, 'order.update', 'order', id, { status });
    const [next] = await sql`select * from orders where id = ${id}`;
    return c.json({ order: next });
  });

  app.post('/api/orders/:id/resend', async (c) => {
    requireCap(c, 'orders.manage');
    await sendOrderMails(c.req.param('id'));
    return c.json({ ok: true });
  });

  /** Printable invoice. */
  app.get('/_nova/invoice/:id', async (c) => {
    requireCap(c, 'orders.view');
    const [o] = await sql`select * from orders where id = ${c.req.param('id')}`;
    if (!o) throw notFound();
    const page = await invoiceHtml(o);
    c.header('Cache-Control', 'no-store');
    return c.html(page.value);
  });

  /* ---------- coupons ---------- */

  app.get('/api/coupons', async (c) => {
    requireCap(c, 'orders.manage');
    return c.json({ coupons: await sql`select * from coupons order by created_at desc` });
  });

  const couponBody = z.object({
    code: z.string().trim().min(3, 'Der Code braucht mindestens 3 Zeichen.').max(40).regex(/^[A-Za-z0-9_-]+$/, 'Nur Buchstaben, Zahlen, - und _.'),
    kind: z.enum(['percent', 'fixed']),
    value: z.number().int().positive(),
    min_total: z.number().int().min(0).default(0),
    max_uses: z.number().int().positive().nullable().default(null),
    valid_until: z.string().nullable().default(null),
    active: z.boolean().default(true),
  });

  app.post('/api/coupons', async (c) => {
    requireCap(c, 'orders.manage');
    const b = couponBody.parse(await c.req.json());
    if (b.kind === 'percent' && b.value > 100) throw badRequest('Mehr als 100 % Rabatt geht nicht.');
    const [dup] = await sql`select 1 from coupons where upper(code) = upper(${b.code})`;
    if (dup) throw badRequest('Diesen Code gibt es schon.');
    const [cp] = await sql`
      insert into coupons (code, kind, value, min_total, max_uses, valid_until, active)
      values (${b.code.toUpperCase()}, ${b.kind}, ${b.value}, ${b.min_total}, ${b.max_uses}, ${b.valid_until}, ${b.active}) returning *`;
    await audit(c, 'coupon.create', 'coupon', cp.id as string, { code: cp.code });
    return c.json({ coupon: cp });
  });

  app.patch('/api/coupons/:id', async (c) => {
    requireCap(c, 'orders.manage');
    const { active } = z.object({ active: z.boolean() }).parse(await c.req.json());
    const [cp] = await sql`update coupons set active = ${active} where id = ${c.req.param('id')} returning *`;
    return c.json({ coupon: cp });
  });

  app.delete('/api/coupons/:id', async (c) => {
    requireCap(c, 'orders.manage');
    await sql`delete from coupons where id = ${c.req.param('id')}`;
    return c.json({ ok: true });
  });

  /* ---------- comments ---------- */

  app.get('/api/comments', async (c) => {
    requireCap(c, 'comments.moderate');
    const status = c.req.query('status') ?? 'pending';
    const rows = await sql`
      select k.*, e.data ->> 'title' as entry_title, e.slug as entry_slug from comments k join entries e on e.id = k.entry_id
      where k.status = ${status} order by k.created_at desc limit 500`;
    return c.json({ comments: rows });
  });

  app.patch('/api/comments/:id', async (c) => {
    requireCap(c, 'comments.moderate');
    const { status } = z.object({ status: z.enum(['pending', 'approved', 'spam']) }).parse(await c.req.json());
    await sql`update comments set status = ${status} where id = ${c.req.param('id')}`;
    bumpGeneration();
    return c.json({ ok: true });
  });

  app.delete('/api/comments/:id', async (c) => {
    requireCap(c, 'comments.moderate');
    await sql`delete from comments where id = ${c.req.param('id')}`;
    bumpGeneration();
    return c.json({ ok: true });
  });

  app.get('/api/shop/summary', async (c) => {
    requireCap(c, 'orders.view');
    const s = await getSettings();
    const [r] = await sql`
      select coalesce(sum(total) filter (where status in ('paid','fulfilled') and created_at > now() - interval '30 days'), 0)::int as revenue30,
             count(*) filter (where status = 'paid')::int as to_ship, count(*) filter (where status = 'pending')::int as open
      from orders`;
    return c.json({ ...r, revenue30Label: formatMoney(r.revenue30 as number, s.shop.currency) });
  });
}

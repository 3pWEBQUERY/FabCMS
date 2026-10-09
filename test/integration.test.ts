import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { sql } from '../src/server/db';
import { migrate } from '../src/server/migrate';
import { syncBuiltinCollections, invalidateCollections } from '../src/server/content';
import { invalidateSettings, bumpGeneration } from '../src/server/settings';
import { createApp } from '../src/server/app';
import type { Entry } from '../src/shared/types';
import { outbox } from '../src/server/mail';
import { env } from '../src/server/env';
import { handleStripeEvent } from '../src/server/shop';

/**
 * Runs against a real Postgres (TEST_DATABASE_URL, default: local nova_test).
 * The schema is dropped and rebuilt for every run.
 */
let reachable = true;
try {
  await sql`select 1`;
} catch {
  reachable = false;
}

const app = createApp();
const jar = new Map<string, string>();

async function req(method: string, path: string, body?: unknown, opts: { cookies?: Map<string, string>; headers?: Record<string, string>; form?: Record<string, string> } = {}) {
  const cookies = opts.cookies ?? jar;
  const headers: Record<string, string> = { 'X-Nova': '1', ...opts.headers };
  if (cookies.size) headers.cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  let payload: BodyInit | undefined;
  if (opts.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(opts.form).toString();
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await app.request(path, { method, headers, body: payload, redirect: 'manual' });
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(';');
    const [k, ...v] = pair.split('=');
    cookies.set(k, v.join('='));
  }
  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data: data as any, headers: res.headers };
}

describe.skipIf(!reachable)('Nova against Postgres', () => {
  beforeAll(async () => {
    await sql.unsafe('drop schema public cascade; create schema public;');
    await rm('.data/test-uploads', { recursive: true, force: true });
    await migrate(join(process.cwd(), 'migrations'));
    invalidateCollections();
    invalidateSettings();
    await syncBuiltinCollections();
  });
  afterAll(async () => {
    await sql.end();
  });

  it('protects the first-run setup with the setup code', async () => {
    const bad = await req('POST', '/api/setup', { code: '000-000', name: 'X', email: 'x@example.ch', password: 'langes-passwort-1' });
    expect(bad.status).toBe(400);
    const ok = await req('POST', '/api/setup', { code: '111-222', name: 'Sandra', email: 'sandra@example.ch', password: 'langes-passwort-1' });
    expect(ok.status).toBe(200);
    const again = await req('POST', '/api/setup', { code: '111-222', name: 'Y', email: 'y@example.ch', password: 'langes-passwort-1' }, { cookies: new Map() });
    expect(again.status).toBe(403);
  });

  it('rejects state changes without the CSRF header', async () => {
    const r = await app.request('/api/logout', { method: 'POST', headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
    expect(r.status).toBe(403);
  });

  it('seeds a restaurant with shop and renders it', async () => {
    const seed = await req('POST', '/api/onboarding/seed', { sectors: ['restaurant', 'shop'], name: 'Gasthaus Linde' });
    expect(seed.status).toBe(200);
    expect(seed.data.themes[0]).toBe('bistro');
    const fin = await req('POST', '/api/onboarding/finish', { theme: 'bistro', palette: 'default', mode: 'studio' });
    expect(fin.status).toBe(200);
    // Before the first publish visitors only see the holding page …
    const anon = await req('GET', '/', undefined, { cookies: new Map() });
    expect(anon.data).toContain('Hier entsteht etwas');
    // … staff see the real site.
    const staff = await req('GET', '/');
    expect(staff.data).toContain('Saisonale Küche');
    await req('POST', '/api/site/launch');
    const home = await req('GET', '/', undefined, { cookies: new Map() });
    expect(home.status).toBe(200);
    expect(home.data).toContain('<h1 class="h"');
    expect(home.data).toContain('"@type":"Restaurant"');
    const karte = await req('GET', '/karte', undefined, { cookies: new Map() });
    expect(karte.data).toContain('"@type":"Menu"');
    expect(karte.data).toContain('Allergene');
  });

  it('serves sitemap, robots and feed-free 404', async () => {
    const sm = await req('GET', '/sitemap.xml');
    expect(sm.data).toContain('<loc>');
    expect(sm.data).toContain('/karte');
    const robots = await req('GET', '/robots.txt');
    expect(robots.data).toContain('Sitemap:');
    const nf = await req('GET', '/gibt-es-nicht', undefined, { cookies: new Map() });
    expect(nf.status).toBe(404);
  });

  it('creates a 301 when the address of a live page changes', async () => {
    const { data } = await req('POST', '/api/entries', { collection: 'pages', data: { title: 'Team', blocks: [] } });
    const id = data.entry.id as string;
    expect((await req('POST', `/api/entries/${id}/publish`, {})).status).toBe(200);
    const cur = await req('GET', `/api/entries/${id}`);
    await req('PUT', `/api/entries/${id}`, { data: cur.data.entry.data, slug: 'unser-team', baseVersion: cur.data.entry.version });
    await req('POST', `/api/entries/${id}/publish`, {});
    const old = await req('GET', '/team', undefined, { cookies: new Map() });
    expect(old.status).toBe(301);
    expect(old.headers.get('location')).toBe('/unser-team');
  });

  it('detects concurrent edits via the version number', async () => {
    const { data } = await req('POST', '/api/entries', { collection: 'pages', data: { title: 'Konflikt' } });
    const e = data.entry as Entry;
    expect((await req('PUT', `/api/entries/${e.id}`, { data: e.data, baseVersion: e.version })).status).toBe(200);
    expect((await req('PUT', `/api/entries/${e.id}`, { data: e.data, baseVersion: e.version })).status).toBe(409);
  });

  it('enforces protected zones for Studio users', async () => {
    // Owner in Werkbank locks a block.
    await req('PATCH', '/api/me', { mode: 'werkbank' });
    const { data } = await req('POST', '/api/entries', {
      collection: 'pages',
      data: { title: 'Gesperrt', blocks: [{ id: 'aaa', type: 'text', props: { heading: 'Alt', body: '<p>x</p>', width: 'narrow' }, style: { tone: 'muted' }, lock: 'layout' }] },
    });
    const id = data.entry.id;
    await req('PATCH', '/api/me', { mode: 'studio' });
    const cur = (await req('GET', `/api/entries/${id}`)).data.entry as Entry;
    // Studio tries to restyle, change the width and delete the block.
    const attempt = { ...cur.data, blocks: [{ ...cur.data.blocks![0], props: { heading: 'Neu', body: '<p>y</p>', width: 'wide' }, style: { tone: 'inverse' }, lock: 'none' }] };
    const r = await req('PUT', `/api/entries/${id}`, { data: attempt, baseVersion: cur.version });
    const b = r.data.entry.data.blocks[0];
    expect(b.props.heading).toBe('Neu');
    expect(b.props.width).toBe('narrow');
    expect(b.style.tone).toBe('muted');
    expect(b.lock).toBe('layout');
    const del = await req('PUT', `/api/entries/${id}`, { data: { ...cur.data, blocks: [] }, baseVersion: r.data.entry.version });
    expect(del.data.entry.data.blocks).toHaveLength(1);
  });

  it('sanitizes rich text and strips code for non-developers', async () => {
    const { data } = await req('POST', '/api/entries', {
      collection: 'pages',
      data: { title: 'XSS', blocks: [{ id: 'b1', type: 'text', props: { body: '<p>ok<img src=x onerror=alert(1)></p>' } }] },
    });
    expect(data.entry.data.blocks[0].props.body).toBe('<p>ok</p>');
  });

  it('calculates the cart with Swiss VAT, shipping and coupons', async () => {
    const shop = new Map<string, string>();
    const products = await sql`select id, slug, published_data from entries where collection = 'products' and published_data ->> 'title' like 'Kaffee%'`;
    const kaffee = products[0];
    await req('POST', '/api/coupons', { code: 'LINDE10', kind: 'percent', value: 10 });
    const add = await req('POST', '/warenkorb/add', undefined, { cookies: shop, headers: { Accept: 'application/json' }, form: { product: kaffee.id, qty: '2' } });
    expect(add.data).toMatchObject({ ok: true, count: 2 });
    const cart = await req('GET', '/warenkorb?gutschein=LINDE10', undefined, { cookies: shop });
    // 2 × 14.90 = 29.80, −10 % = 26.82, + 9.– shipping = 35.82
    expect(cart.data).toContain('29.80');
    expect(cart.data).toContain('35.82');
    // reduced VAT 2.6 % on goods, standard 8.1 % on shipping
    expect(cart.data).toContain('inkl. 2.6% MwSt.');
    expect(cart.data).toContain('inkl. 8.1% MwSt.');
    const order = await req('POST', '/kasse', undefined, {
      cookies: shop,
      form: { name: 'Erika', email: 'erika@example.ch', street: 'Weg 1', zip: '8000', city: 'Zürich', country: 'CH', shippingMethod: 'ship', payment: 'invoice', coupon: 'LINDE10', acceptTerms: '1' },
    });
    expect(order.status).toBe(303);
    expect(order.headers.get('location')).toMatch(/^\/bestellung\//);
    const [o] = await sql`select total, discount, status from orders`;
    expect(o).toMatchObject({ total: 3582, discount: 298, status: 'pending' });
    const [stock] = await sql`select (published_data ->> 'stock')::int as s, (data ->> 'stock')::int as d from entries where id = ${kaffee.id}`;
    expect(stock).toEqual({ s: 38, d: 38 });
  });

  it('accepts form submissions, rejects bots silently, creates a lead', async () => {
    const [form] = await sql`select id, fields from forms where name = 'Kontakt'`;
    const anon = new Map<string, string>();
    const bot = await req('POST', `/_nova/forms/${form.id}`, undefined, { cookies: anon, headers: { Accept: 'application/json' }, form: { website: 'spam', _t: Date.now().toString(36), name: 'Bot' } });
    expect(bot.data.ok).toBe(true);
    const human = await req('POST', `/_nova/forms/${form.id}`, undefined, {
      cookies: anon,
      headers: { Accept: 'application/json' },
      form: { _t: (Date.now() - 5000).toString(36), name: 'Hans', e_mail: 'hans@example.ch', nachricht: 'Habt ihr offen?' },
    });
    expect(human.data.ok).toBe(true);
    const subs = await sql`select data from submissions`;
    expect(subs).toHaveLength(1);
    const [lead] = await sql`select email, status from contacts`;
    expect(lead).toMatchObject({ email: 'hans@example.ch', status: 'new' });
  });

  it('notifies the team in the admin and tracks what was read', async () => {
    await new Promise((r) => setTimeout(r, 50)); // notifications are written after the response
    const list = await req('GET', '/api/notifications');
    const n = list.data.items.find((x: { title: string }) => x.title === 'Neue Anfrage: Kontakt');
    expect(n).toMatchObject({ kind: 'form', read: false, body: 'Hans · hans@example.ch' });
    expect(list.data.unread).toBeGreaterThan(0);
    const read = await req('POST', '/api/notifications/read', {});
    expect(read.data.unread).toBe(0);
  });

  it('exposes published content through the headless API', async () => {
    const list = await req('GET', '/api/v1/dishes?limit=3&filter[category]=Desserts', undefined, { cookies: new Map() });
    expect(list.status).toBe(200);
    expect(list.data.data.length).toBeGreaterThan(0);
    expect(list.data.data.every((d: any) => d.data.category === 'Desserts')).toBe(true);
    const write = await req('POST', '/api/v1/dishes', { data: { title: 'X' } }, { cookies: new Map() });
    expect(write.status).toBe(401);
  });

  it('answers privacy requests and anonymises orders', async () => {
    const info = await req('GET', '/api/privacy?email=erika@example.ch');
    expect(info.data.counts.orders).toBe(1);
    await req('POST', '/api/privacy/delete', { email: 'erika@example.ch' });
    const [o] = await sql`select email, customer ->> 'name' as name, total from orders`;
    expect(o.email).toMatch(/@invalid$/);
    expect(o.name).toBe('Gelöscht');
    expect(o.total).toBe(3582);
  });

  it('books tables online without double bookings, and guests can cancel', async () => {
    const settings = await req('GET', '/api/settings');
    const modules = [...new Set([...settings.data.settings.modules, 'booking'])];
    // Opening hours every day 11–23 so the test does not depend on today's weekday.
    const hours = [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, closed: false, slots: [{ from: '11:00', to: '23:00' }] }));
    await req('PATCH', '/api/settings', { modules, hours, booking: { ...settings.data.settings.booking, leadMinutes: 0, autoConfirm: true } });
    const table = await req('POST', '/api/booking/resources', { name: 'Fenstertisch', kind: 'table', capacity: 4 });
    expect(table.status).toBe(200);
    // Bound to this one table, so the second guest really competes for it.
    const svc = await req('POST', '/api/booking/services', { name: 'Fenster', duration_min: 120, resource_ids: [table.data.resource.id] });
    expect(svc.status).toBe(200);

    const day = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const slots = await req('GET', `/api/booking/slots?service=${svc.data.service.id}&day=${day}&party=2`);
    expect(slots.data.slots.map((x: { time: string }) => x.time)).toContain('19:00');

    const guest = new Map<string, string>();
    const form = (name: string) => ({ service: svc.data.service.id, day, time: '19:00', party: '2', name, email: `${name.toLowerCase()}@example.ch`, _t: (Date.now() - 5000).toString(36), _back: '/reservation' });
    const first = await req('POST', '/_nova/booking', undefined, { cookies: guest, form: form('Anna') });
    expect(first.status).toBe(303);
    const where = first.headers.get('location')!;
    expect(where).toMatch(/^\/buchung\/[\w-]+\?neu=1$/);
    // The only table is taken now: the same time must be refused.
    const second = await req('POST', '/_nova/booking', undefined, { cookies: guest, form: form('Beat') });
    expect(second.headers.get('location')).toContain('b_err=');
    const [count] = await sql`select count(*)::int as n from bookings where status = 'confirmed' and service_id = ${svc.data.service.id}`;
    expect(count.n).toBe(1);

    const page = await req('GET', where, undefined, { cookies: new Map() });
    expect(page.data).toContain('Deine Reservation ist bestätigt');
    const ics = await req('GET', where.replace('?neu=1', '.ics'), undefined, { cookies: new Map() });
    expect(ics.data).toContain('BEGIN:VEVENT');
    const cancel = await req('POST', `${where.replace('?neu=1', '')}/absagen`, undefined, { cookies: new Map(), form: {} });
    expect(cancel.headers.get('location')).toContain('abgesagt=1');
    const freeAgain = await req('GET', `/api/booking/slots?service=${svc.data.service.id}&day=${day}&party=2`);
    expect(freeAgain.data.slots.map((x: { time: string }) => x.time)).toContain('19:00');

    // The team can book by phone, but not onto a table that is taken.
    const phone = await req('POST', '/api/bookings', { serviceId: svc.data.service.id, day, time: '12:00', party: 3, name: 'Telefon', resourceId: table.data.resource.id });
    expect(phone.status).toBe(200);
    const clash = await req('POST', '/api/bookings', { serviceId: svc.data.service.id, day, time: '13:00', party: 2, name: 'Zu früh', resourceId: table.data.resource.id });
    expect(clash.status).toBe(400);
    await new Promise((r) => setTimeout(r, 50));
    const notes = await req('GET', '/api/notifications');
    expect(notes.data.items.some((n: { title: string }) => n.title === 'Neue Reservation: Anna')).toBe(true);
  });

  it('runs the newsletter with double opt-in, automatic sending and one-click unsubscribe', async () => {
    const settings = await req('GET', '/api/settings');
    const modules = [...new Set([...settings.data.settings.modules, 'newsletter', 'blog'])];
    await req('PATCH', '/api/settings', { modules });
    expect((await req('PUT', '/api/newsletter/settings', { auto: 'each', weekday: 1 })).status).toBe(200);

    const visitor = new Map<string, string>();
    const form = { email: 'Lea@Example.ch', name: 'Lea Muster', _page: '/journal', _block: 'nl1', _t: (Date.now() - 5000).toString(36) };
    const sent = await req('POST', '/_nova/newsletter', undefined, { cookies: visitor, form });
    expect(sent.status).toBe(303);
    expect(sent.headers.get('location')).toBe('/journal?nl=nl1#nl-nl1-box');
    // Same address again: no second row, same answer.
    await req('POST', '/_nova/newsletter', undefined, { cookies: visitor, form });
    const subs = await sql`select * from subscribers`;
    expect(subs).toHaveLength(1);
    const invite = outbox.filter((m) => m.to === 'lea@example.ch');
    expect(invite).toHaveLength(1);
    expect(invite[0].text).toContain(`/newsletter/bestaetigen/${subs[0].token}`);
    expect(subs[0]).toMatchObject({ email: 'lea@example.ch', status: 'pending', source: '/journal' });
    // Bots get the same redirect but nothing is stored.
    await req('POST', '/_nova/newsletter', undefined, { cookies: visitor, form: { ...form, email: 'bot@example.ch', website: 'spam' } });
    expect(await sql`select 1 from subscribers where email = 'bot@example.ch'`).toHaveLength(0);

    const confirmed = await req('GET', `/newsletter/bestaetigen/${subs[0].token}`, undefined, { cookies: new Map() });
    expect(confirmed.data).toContain('Danke, du bist dabei!');
    const [active] = await sql`select status, confirmed_at from subscribers`;
    expect(active.status).toBe('active');
    expect(active.confirmed_at).not.toBeNull();

    // A new post goes out on its own, once.
    const post = await req('POST', '/api/entries', { collection: 'posts', data: { title: 'Herbstmenü ist da', excerpt: 'Kürbis, Pilze und Wild.' } });
    await req('POST', `/api/entries/${post.data.entry.id}/publish`, {});
    await new Promise((r) => setTimeout(r, 300));
    const issues = await sql`select * from newsletters where auto`;
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ subject: 'Herbstmenü ist da', status: 'sent' });
    expect(issues[0].recipients).toBe(1);
    const mail = outbox.find((m) => m.subject === 'Herbstmenü ist da')!;
    expect(mail.html).toContain('Hallo Lea,');
    expect(mail.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    await req('POST', `/api/entries/${post.data.entry.id}/publish`, {});
    await new Promise((r) => setTimeout(r, 100));
    expect(await sql`select 1 from newsletters where auto`).toHaveLength(1);

    const preview = await req('POST', '/api/newsletter/preview', { subject: 'Test', intro: 'Hallo zusammen.\n\nZweiter Absatz.', entry_ids: [post.data.entry.id] });
    expect(preview.data.html).toContain('Herbstmenü ist da');
    expect(preview.data.html).toContain('/journal/');
    expect(preview.data.html).toContain('<p style="margin:0 0 16px">Zweiter Absatz.</p>');
    expect(preview.data.text).toContain('Abmelden: ');

    // Mail clients' one-click unsubscribe (RFC 8058).
    const out = await req('POST', `/newsletter/abmelden/${subs[0].token}`, undefined, { cookies: new Map(), form: { 'List-Unsubscribe': 'One-Click' } });
    expect(out.status).toBe(200);
    const [gone] = await sql`select status from subscribers`;
    expect(gone.status).toBe('unsubscribed');

    const info = await req('GET', '/api/privacy?email=lea@example.ch');
    expect(info.data.counts.subscribers).toBe(1);
  });

  it('keeps members-only content behind the paywall everywhere, and members get in', async () => {
    const settings = await req('GET', '/api/settings');
    await req('PATCH', '/api/settings', { modules: [...new Set([...settings.data.settings.modules, 'members', 'blog'])] });
    const text = (body: string) => ({ id: Math.random().toString(36).slice(2), type: 'text', props: { heading: '', body } });
    const post = await req('POST', '/api/entries', {
      collection: 'posts',
      data: { title: 'Nur für Mitglieder', excerpt: 'Ein Blick hinter die Kulissen.', access: 'members', blocks: [text('<p>Der Einstieg ist für alle.</p>'), text('<p>Geheimzutat Kardamom.</p>')] },
    });
    await req('POST', `/api/entries/${post.data.entry.id}/publish`, {});
    const path = `/journal/${post.data.entry.slug}`;

    const anon = await req('GET', path, undefined, { cookies: new Map() });
    expect(anon.status).toBe(200);
    expect(anon.data).toContain('Weiterlesen mit deinem Konto');
    expect(anon.data).toContain('Der Einstieg ist für alle.');
    expect(anon.data).not.toContain('Kardamom');
    expect(anon.data).toContain('"isAccessibleForFree":false');
    // Nothing leaks through search, feed or the public API.
    expect((await req('GET', '/suche?q=Kardamom', undefined, { cookies: new Map() })).data).not.toContain('Kardamom</');
    expect((await req('GET', '/feed.xml', undefined, { cookies: new Map() })).data).not.toContain('Kardamom');
    expect(JSON.stringify((await req('GET', '/api/v1/posts', undefined, { cookies: new Map() })).data)).not.toContain('Kardamom');

    // Sign up → confirmation link → signed in.
    const visitor = new Map<string, string>();
    outbox.length = 0;
    const reg = await req('POST', '/konto/registrieren', undefined, {
      cookies: visitor,
      form: { name: 'Mia Keller', email: 'mia@example.ch', password: 'ein langes passwort', weiter: path, _t: (Date.now() - 5000).toString(36) },
    });
    expect(reg.headers.get('location')).toBe('/konto/registrieren?gesendet=1');
    const early = await req('POST', '/konto/anmelden', undefined, { cookies: visitor, form: { email: 'mia@example.ch', password: 'ein langes passwort' } });
    expect(early.status).toBe(403);
    const link = outbox.find((m) => m.to === 'mia@example.ch')!.text.match(/\/konto\/bestaetigen\/[\w-]+\?weiter=[^\s]+/)![0];
    expect((await req('GET', link, undefined, { cookies: visitor })).data).toContain('Konto bestätigen');
    const token = link.split('/')[3].split('?')[0];
    const confirmed = await req('POST', `/konto/bestaetigen/${token}`, undefined, { cookies: visitor, form: { weiter: path } });
    expect(confirmed.headers.get('location')).toBe(path);
    expect(visitor.get('nova_member')).toBeTruthy();

    const member = await req('GET', path, undefined, { cookies: visitor });
    expect(member.data).toContain('Kardamom');
    expect(member.data).toContain('Mein Konto');
    expect(member.headers.get('cache-control')).toContain('private');
    // The page cache keeps the two apart.
    expect((await req('GET', path, undefined, { cookies: new Map() })).data).not.toContain('Kardamom');

    // Paid content: a free account is not enough, granted access is.
    const current = await req('GET', `/api/entries/${post.data.entry.id}`);
    await req('PUT', `/api/entries/${post.data.entry.id}`, { data: { ...current.data.entry.data, access: 'paid' } });
    await req('POST', `/api/entries/${post.data.entry.id}/publish`, {});
    expect((await req('GET', path, undefined, { cookies: visitor })).data).not.toContain('Kardamom');
    const list = await req('GET', '/api/members');
    const mia = list.data.members.find((m: { email: string }) => m.email === 'mia@example.ch');
    expect(mia.level).toBe('member');
    const nextYear = `${new Date().getFullYear() + 1}-12-31`;
    expect((await req('PATCH', `/api/members/${mia.id}`, { paid_until: nextYear })).data.member.level).toBe('paid');
    expect((await req('GET', path, undefined, { cookies: visitor })).data).toContain('Kardamom');

    // Blocking ends the session at once.
    await req('PATCH', `/api/members/${mia.id}`, { status: 'blocked' });
    expect((await req('GET', path, undefined, { cookies: visitor })).data).not.toContain('Kardamom');
    await req('PATCH', `/api/members/${mia.id}`, { status: 'active' });

    // Forgot password → link → new password works.
    outbox.length = 0;
    await req('POST', '/konto/passwort-vergessen', undefined, { cookies: new Map(), form: { email: 'mia@example.ch' } });
    const reset = outbox[0].text.match(/\/konto\/passwort\/[\w-]+/)![0];
    expect((await req('POST', reset, undefined, { cookies: new Map(), form: { password: 'noch ein langes passwort' } })).headers.get('location')).toBe('/konto?ok=passwort');
    const login = await req('POST', '/konto/anmelden', undefined, { cookies: new Map(), form: { email: 'mia@example.ch', password: 'noch ein langes passwort', weiter: '/konto' } });
    expect(login.headers.get('location')).toBe('/konto');

    const info = await req('GET', '/api/privacy?email=mia@example.ch');
    expect(info.data.counts.members).toBe(1);
  });

  it('sells tickets within the quota, checks them in once, and fills freed places from the waitlist', async () => {
    const settings = await req('GET', '/api/settings');
    await req('PATCH', '/api/settings', { modules: [...new Set([...settings.data.settings.modules, 'events', 'courses'])] });
    const local = (days: number, time: string) => `${new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)}T${time}`;
    const ev = await req('POST', '/api/entries', {
      collection: 'events',
      data: { title: 'Weindegustation', start: local(10, '19:00'), end: local(10, '22:00'), venue: 'Gewölbekeller', tickets: [{ name: 'Eintritt', price: null, capacity: 2 }] },
    });
    expect(ev.status).toBe(200);
    await req('POST', `/api/entries/${ev.data.entry.id}/publish`, {});
    const path = `/events/${ev.data.entry.slug}`;
    const page = await req('GET', path, undefined, { cookies: new Map() });
    expect(page.data).toContain('Tickets bestellen');
    expect(page.data).toContain('"@type":"Event"');
    expect(page.data).toContain('Gewölbekeller');

    const buyer = new Map<string, string>();
    const form = (name: string, qty: string) => ({ q_0: qty, name, email: `${name.toLowerCase()}@example.ch`, _back: path, _t: (Date.now() - 5000).toString(36) });
    outbox.length = 0;
    const first = await req('POST', `/_nova/tickets/${ev.data.entry.id}`, undefined, { cookies: buyer, form: form('Lena', '2') });
    const where = first.headers.get('location')!;
    expect(where).toMatch(/^\/tickets\/[\w-]+\?neu=1$/);
    expect(outbox[0].subject).toBe('Deine Tickets: Weindegustation');
    expect(outbox[0].attachments?.[0].content).toContain('BEGIN:VEVENT');
    const sold = await req('POST', `/_nova/tickets/${ev.data.entry.id}`, undefined, { cookies: buyer, form: form('Jon', '1') });
    expect(decodeURIComponent(sold.headers.get('location')!)).toContain('ausverkauft');

    const ticketPage = await req('GET', where, undefined, { cookies: new Map() });
    expect((ticketPage.data.match(/<svg/g) ?? []).length).toBe(2);
    const codes = await sql`select code from tickets where entry_id = ${ev.data.entry.id} order by code`;
    expect(ticketPage.data).toContain(codes[0].code);

    // Sold out: the waitlist takes over.
    expect((await req('GET', path, undefined, { cookies: new Map() })).data).toContain('Auf die Warteliste');
    const wait = await req('POST', `/_nova/tickets/${ev.data.entry.id}/warteliste`, undefined, { cookies: buyer, form: { name: 'Jon', email: 'jon@example.ch', _back: path, _t: (Date.now() - 5000).toString(36) } });
    expect(wait.headers.get('location')).toContain('t_wait=1');

    // At the door: once, then «already»; lower case and without dash works too.
    const ok = await req('POST', '/api/tickets/checkin', { code: codes[0].code.toLowerCase().replace('-', '') });
    expect(ok.data).toMatchObject({ status: 'ok', ticket: { name: 'Lena', category: 'Eintritt' }, progress: { checked: 1, total: 2 } });
    expect((await req('POST', '/api/tickets/checkin', { code: codes[0].code })).data.status).toBe('already');
    expect((await req('POST', '/api/tickets/checkin', { code: 'ZZZZ-ZZZZ' })).data.status).toBe('unknown');

    // Cancelling frees the places and tells the waitlist.
    const [order] = await sql`select id from ticket_orders where entry_id = ${ev.data.entry.id} and status = 'paid'`;
    outbox.length = 0;
    await req('POST', `/api/ticket-orders/${order.id}/cancel`);
    expect(outbox.map((m) => m.subject)).toContain('Ein Platz ist frei: Weindegustation');
    expect((await req('POST', '/api/tickets/checkin', { code: codes[1].code })).data.status).toBe('cancelled');

    // Paid tickets need Stripe; without it the form says so instead of failing later.
    const paid = await req('POST', '/api/entries', { collection: 'events', data: { title: 'Gala', start: local(20, '18:00'), tickets: [{ name: 'Gala', price: 9000, capacity: 50 }] } });
    await req('POST', `/api/entries/${paid.data.entry.id}/publish`, {});
    expect((await req('GET', `/events/${paid.data.entry.slug}`, undefined, { cookies: new Map() })).data).toContain('Die Online-Anmeldung ist gerade nicht möglich');

    // A course with three dates: sorted by its first date, all three in the calendar file.
    const course = await req('POST', '/api/entries', {
      collection: 'courses',
      data: { title: 'Brotbackkurs', sessions: [{ start: local(14, '18:00') }, { start: local(7, '18:00'), end: local(7, '21:00') }, { start: local(21, '18:00') }], tickets: [{ name: 'Teilnahme', capacity: 8 }] },
    });
    expect(course.data.entry.data.start).toBe(local(7, '18:00'));
    await req('POST', `/api/entries/${course.data.entry.id}/publish`, {});
    expect((await req('GET', '/kurse', undefined, { cookies: new Map() })).data).toContain('3 Termine');
    const ics = await req('GET', `/_nova/ics/${course.data.entry.id}.ics`, undefined, { cookies: new Map() });
    expect((ics.data.match(/BEGIN:VEVENT/g) ?? []).length).toBe(3);
  });

  it('takes donations once and monthly, counts campaigns and issues receipts', async () => {
    const settings = await req('GET', '/api/settings');
    await req('PATCH', '/api/settings', { modules: [...new Set([...settings.data.settings.modules, 'donations'])] });
    await req('PUT', '/api/donations/settings', { recipient: 'Velowerk', iban: 'CH93 0076 2011 6238 5295 7', taxDeductible: true, receiptNote: 'Steuerbefreit seit 2019.' });
    const page = await req('POST', '/api/entries', {
      collection: 'pages',
      slug: 'spenden',
      data: { title: 'Spenden', blocks: [{ id: 'dn1', type: 'donate', props: { heading: 'Helfen', campaign: 'Werkstatt', goal: 100000, amounts: '20, 50', monthly: true } }] },
    });
    await req('POST', `/api/entries/${page.data.entry.id}/publish`, {});
    // Without Stripe the block shows the bank details instead of a form.
    const noStripe = await req('GET', '/spenden', undefined, { cookies: new Map() });
    expect(noStripe.data).toContain('CH93 0076 2011 6238 5295 7');
    expect(noStripe.data).not.toContain('Jetzt spenden');

    // With Stripe (simulated): checkout, then the webhook.
    const realFetch = globalThis.fetch;
    const sent: string[] = [];
    env.stripe.secretKey = 'sk_test_nova';
    bumpGeneration(); // keys only change with a restart in real life
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      if (String(url).startsWith('https://api.stripe.com/')) {
        sent.push(String(init?.body ?? ''));
        return new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }), { status: 200 });
      }
      return realFetch(url, init);
    }) as typeof fetch;
    try {
      expect((await req('GET', '/spenden', undefined, { cookies: new Map() })).data).toContain('Jetzt spenden');
      const form = { amount: '50', own: '', interval: 'month', campaign: 'Werkstatt', name: 'Rita Graf', email: 'rita@example.ch', zip: '8000', city: 'Zürich', street: 'Bahnhofstrasse 1', _back: '/spenden', _block: 'dn1', _t: (Date.now() - 5000).toString(36) };
      const tooSmall = await req('POST', '/_nova/spenden', undefined, { cookies: new Map(), form: { ...form, own: '2' } });
      expect(new URL(tooSmall.headers.get('location')!, 'http://x').searchParams.get('d_err')).toMatch(/ab CHF.5\.00/);
      const go = await req('POST', '/_nova/spenden', undefined, { cookies: new Map(), form });
      expect(go.headers.get('location')).toBe('https://checkout.stripe.com/c/pay/cs_test_1');
      expect(sent[0]).toContain('mode=subscription');
      expect(sent[0]).toContain('recurring%5D%5Binterval%5D=month');
      const [d] = await sql`select * from donations where email = 'rita@example.ch'`;
      expect(d.amount).toBe(5000);
      outbox.length = 0;
      await handleStripeEvent({ type: 'checkout.session.completed', data: { object: { mode: 'subscription', metadata: { donation_id: d.id }, subscription: 'sub_1', id: 'cs_test_1' } } });
      await handleStripeEvent({ type: 'invoice.paid', data: { object: { id: 'in_1', subscription: 'sub_1', amount_paid: 5000, billing_reason: 'subscription_create' } } });
      await handleStripeEvent({ type: 'invoice.paid', data: { object: { id: 'in_2', subscription: 'sub_1', amount_paid: 5000, billing_reason: 'subscription_cycle' } } });
      await handleStripeEvent({ type: 'invoice.paid', data: { object: { id: 'in_2', subscription: 'sub_1', amount_paid: 5000, billing_reason: 'subscription_cycle' } } });
      expect(outbox[0].subject).toBe('Danke für deine Spende an Velowerk');
      const rows = await sql`select amount, status from donations where email = 'rita@example.ch' and status = 'paid'`;
      expect(rows).toHaveLength(2); // first month + one renewal, the duplicate webhook ignored
      // The campaign bar counts both months.
      expect((await req('GET', '/spenden', undefined, { cookies: new Map() })).data).toMatch(/CHF.100\.–/);
      const receipt = await req('GET', `/spende/${d.token}/bestaetigung`, undefined, { cookies: new Map() });
      expect(receipt.data).toContain('Spendenbestätigung');
      expect(receipt.data).toMatch(/CHF.100\.00/);
      expect(receipt.data).toContain('Steuerbefreit seit 2019.');
      const donors = await req('GET', `/api/donations/donors?jahr=${new Date().getFullYear()}`);
      expect(donors.data.donors[0]).toMatchObject({ email: 'rita@example.ch', total: 10000, count: 2 });
    } finally {
      globalThis.fetch = realFetch;
      env.stripe.secretKey = '';
    }
  });

  it('lists properties with filters and turns inquiries into contacts', async () => {
    const settings = await req('GET', '/api/settings');
    await req('PATCH', '/api/settings', { modules: [...new Set([...settings.data.settings.modules, 'realestate'])] });
    const make = async (data: Record<string, unknown>) => {
      const r = await req('POST', '/api/entries', { collection: 'properties', data });
      expect(r.status).toBe(200);
      await req('POST', `/api/entries/${r.data.entry.id}/publish`, {});
      return r.data.entry;
    };
    const flat = await make({ title: 'Dachwohnung', offer: 'rent', kind: 'apartment', rooms: 3.5, area: 90, price: 260000, city: 'Winterthur', zip: '8400', street: 'Geheimweg 1', showStreet: false, features: ['balcony'] });
    await make({ title: 'Villa', offer: 'buy', kind: 'house', rooms: 7, price: 250000000, city: 'Küsnacht', zip: '8700' });
    await make({ title: 'Studio', offer: 'rent', kind: 'apartment', rooms: 1, price: 120000, city: 'Winterthur', zip: '8400', status: 'done' });

    const all = await req('GET', '/immobilien', undefined, { cookies: new Map() });
    expect(all.data).toContain('Dachwohnung');
    expect(all.data).toContain('Villa');
    expect(all.data).not.toContain('>Studio<'); // rented ones drop out of the search
    const rent3 = await req('GET', '/immobilien?angebot=rent&zimmer=3&bis=3000&ort=winter', undefined, { cookies: new Map() });
    expect(rent3.data).toContain('Dachwohnung');
    expect(rent3.data).not.toContain('Villa');
    expect(rent3.data).toContain('1 Objekt');

    const page = await req('GET', `/immobilien/${flat.slug}`, undefined, { cookies: new Map() });
    expect(page.data).toContain('"@type":"RealEstateListing"');
    expect(page.data).toMatch(/CHF.2.600\.– \/ Mt\./);
    expect(page.data).not.toContain('Geheimweg'); // street only when allowed
    expect(page.data).toContain('Balkon / Terrasse');

    const sent = await req('POST', `/_nova/immobilien/${flat.id}/anfrage`, undefined, {
      cookies: new Map(),
      form: { name: 'Tom Meier', email: 'tom@example.ch', phone: '079 123 45 67', message: 'Ist die Wohnung noch frei?', visit: '1', _t: (Date.now() - 5000).toString(36) },
    });
    expect(sent.headers.get('location')).toBe(`/immobilien/${flat.slug}?anfrage=1#anfrage`);
    const [contact] = await sql`select * from contacts where email = 'tom@example.ch'`;
    expect(contact.source).toBe('Immobilie: Dachwohnung');
    expect(contact.notes[0].text).toContain('möchte besichtigen');
    await new Promise((r) => setTimeout(r, 50));
    const notes = await req('GET', '/api/notifications');
    expect(notes.data.items.some((n: { title: string }) => n.title === 'Anfrage: Dachwohnung')).toBe(true);
  });

  it('takes take-away and delivery orders into the kitchen', async () => {
    const settings = await req('GET', '/api/settings');
    const hours = [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, closed: false, slots: [{ from: '00:00', to: '23:45' }] }));
    await req('PATCH', '/api/settings', { modules: [...new Set([...settings.data.settings.modules, 'menu', 'ordering'])], hours });
    await req('PUT', '/api/kitchen/settings', { pickup: true, delivery: true, deliveryZips: ['8400'], deliveryFee: 500, deliveryMin: 4000, prepMinutes: 20, slotMinutes: 15, payOnSite: true, note: '' });
    const dish = await req('POST', '/api/entries', { collection: 'dishes', data: { title: 'Pizza Margherita', category: 'Pizza', prices: [{ label: '', price: 1900 }] } });
    await req('POST', `/api/entries/${dish.data.entry.id}/publish`, {});
    const guest = new Map<string, string>();
    const menu = await req('GET', '/bestellen', undefined, { cookies: guest });
    expect(menu.data).toContain('Pizza Margherita');
    await req('POST', '/bestellen/dazu', undefined, { cookies: guest, form: { d: dish.data.entry.id, s: '0' } });
    const added = await req('POST', '/bestellen/dazu', undefined, { cookies: guest, form: { d: dish.data.entry.id, s: '0' } });
    expect(decodeURIComponent(added.headers.get('location')!)).toContain('hinzu=Pizza Margherita');
    const checkout = await req('GET', '/bestellen/kasse', undefined, { cookies: guest });
    const slot = checkout.data.match(/<option value="([^"]+Z)"/)![1];
    const form = { mode: 'delivery', slot, name: 'Nina Roth', phone: '079 555 66 77', email: 'nina@example.ch', street: 'Bahnhofplatz 1', zip: '8001', city: 'Zürich', payment: 'onsite', _t: (Date.now() - 5000).toString(36) };
    // Outside the delivery area, then below the minimum (2 × 19 = 38 < 40).
    expect((await req('POST', '/bestellen/kasse', undefined, { cookies: guest, form })).data).toContain('Nach 8001 liefern wir leider nicht');
    expect((await req('POST', '/bestellen/kasse', undefined, { cookies: guest, form: { ...form, zip: '8400', city: 'Winterthur' } })).data).toContain('Liefern ab');
    outbox.length = 0;
    const done = await req('POST', '/bestellen/kasse', undefined, { cookies: guest, form: { ...form, mode: 'pickup', zip: '', street: '' } });
    expect(done.headers.get('location')).toMatch(/^\/essen\/[\w-]+$/);
    expect(outbox[0].subject).toMatch(/^Bestellung Nr\. 1 bei /);
    const status = await req('GET', done.headers.get('location')!, undefined, { cookies: guest });
    expect(status.data).toContain('Deine Bestellung ist angekommen.');
    expect(status.headers.get('refresh')).toBe('30');
    expect((await req('GET', '/bestellen', undefined, { cookies: guest })).data).toContain('Noch leer');

    const board = await req('GET', '/api/kitchen');
    const order = board.data.orders.find((o: { name: string }) => o.name === 'Nina Roth');
    expect(order).toMatchObject({ number: 1, status: 'new', total: 3800, payment: 'onsite' });
    expect(order.vat[0].rate).toBe(2.6);
    expect((await req('POST', `/api/kitchen/${order.id}/status`, { status: 'done' })).status).toBe(400); // no skipping
    await req('POST', `/api/kitchen/${order.id}/status`, { status: 'preparing' });
    outbox.length = 0;
    await req('POST', `/api/kitchen/${order.id}/status`, { status: 'ready' });
    await new Promise((r) => setTimeout(r, 50));
    expect(outbox[0].subject).toBe('Bereit zum Abholen: Nr. 1');
    const bon = await req('GET', `/api/kitchen/${order.id}/bon`);
    expect(bon.data).toContain('ABHOLEN');

    // «Küche voll» stops new orders.
    await req('POST', '/api/kitchen/pause', { paused: true });
    await req('POST', '/bestellen/dazu', undefined, { cookies: guest, form: { d: dish.data.entry.id, s: '0' } });
    expect((await req('POST', '/bestellen/kasse', undefined, { cookies: guest, form: { ...form, mode: 'pickup' } })).data).toContain('keine Bestellungen');
    await req('POST', '/api/kitchen/pause', { paused: false });
  });

  it('puts the Swiss QR bill on open invoices', async () => {
    const settings = await req('GET', '/api/settings');
    const bad = await req('PATCH', '/api/settings', { shop: { ...settings.data.settings.shop, iban: 'CH93 0076 2011 6238 5295 8' } });
    expect(bad.status).toBe(400);
    await req('PATCH', '/api/settings', {
      shop: { ...settings.data.settings.shop, iban: 'ch9300762011623852957' },
      business: { ...settings.data.settings.business, legalName: 'Gasthaus Linde GmbH', street: 'Dorfstrasse 1', zip: '8400', city: 'Winterthur' },
    });
    expect((await req('GET', '/api/settings')).data.settings.shop.iban).toBe('CH93 0076 2011 6238 5295 7');
    const [o] = await sql`select token, number from orders where payment_method = 'invoice' limit 1`;
    await sql`update orders set status = 'pending' where token = ${o.token}`;
    const page = await req('GET', `/bestellung/${o.token}/rechnung`, undefined, { cookies: new Map() });
    expect(page.data).toContain('Zahlteil');
    expect(page.data).toContain('Empfangsschein');
    expect(page.data).toContain('aria-label="Swiss QR Code"');
    expect(page.data).toContain('CH93 0076 2011 6238 5295 7');
    expect(page.data).toMatch(/RF\d{2}/);
  });

  it('offers passkeys and rejects forged answers', async () => {
    const reg = await req('POST', '/api/me/passkeys/options', {}, { headers: { host: 'nova.example.ch', 'x-forwarded-proto': 'https' } });
    expect(reg.data.rp.id).toBe('nova.example.ch');
    expect(reg.data.authenticatorSelection.residentKey).toBe('required');
    const forged = await req('POST', '/api/me/passkeys', { response: { id: 'x', rawId: 'x', type: 'public-key', response: { clientDataJSON: 'e30', attestationObject: 'oA' } } });
    expect(forged.status).toBe(400);
    const login = await req('POST', '/api/login/passkey/options', {}, { cookies: new Map() });
    expect(login.data.key).toMatch(/^[\w-]{20,}$/);
    expect(login.data.options.allowCredentials).toEqual([]);
    const unknown = await req('POST', '/api/login/passkey', { key: login.data.key, response: { id: 'unbekannt', rawId: 'unbekannt', type: 'public-key', response: {} } }, { cookies: new Map() });
    expect(unknown.status).toBe(401);
    // A challenge is good for one try only.
    const again = await req('POST', '/api/login/passkey', { key: login.data.key, response: { id: 'unbekannt' } }, { cookies: new Map() });
    expect(again.status).toBe(400);
  });

  it('imports a WordPress export with redirects from the old addresses', async () => {
    const form = new FormData();
    form.append('file', new File([readFileSync(join(process.cwd(), 'test/fixtures/wordpress.xml'))], 'export.xml', { type: 'text/xml' }));
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const up = await app.request('/api/import/upload', { method: 'POST', body: form, headers: { 'X-Nova': '1', cookie } });
    const analysed = (await up.json()) as { id: string; summary: { counts: Record<string, number>; drafts: number } };
    expect(analysed.summary.counts).toEqual({ post: 2, page: 1, product: 0 });
    expect(analysed.summary.drafts).toBe(1);
    const started = await req('POST', '/api/import/run', { id: analysed.id, publish: true, images: false, redirects: true });
    let job = started.data.job;
    for (let i = 0; i < 50 && job.status === 'running'; i++) {
      await new Promise((r) => setTimeout(r, 50));
      job = (await req('GET', `/api/import/jobs/${job.id}`)).data.job;
    }
    expect(job).toMatchObject({ status: 'done', done: 3, redirects: 2 });
    const [post] = await sql`select status, published_data from entries where collection = 'posts' and slug = 'fruehlingstour'`;
    expect(post.status).toBe('published');
    expect(post.published_data).toMatchObject({ category: 'Touren', tags: ['See', 'Frühling'], date: '2024-03-01' });
    const [draft] = await sql`select status from entries where collection = 'posts' and slug = 'entwurf'`;
    expect(draft.status).toBe('draft');
    const old = await req('GET', '/2024/03/fruehlingstour/', undefined, { cookies: new Map() });
    expect(old.status).toBe(301);
    const target = await req('GET', old.headers.get('location')!, undefined, { cookies: new Map() });
    expect(target.headers.get('location')).toBe('/journal/fruehlingstour');
    expect((await req('GET', '/journal/fruehlingstour', undefined, { cookies: new Map() })).data).toContain('Romanshorn');
    // The same preview can't be imported twice.
    expect((await req('POST', '/api/import/run', { id: analysed.id, publish: true, images: false, redirects: true })).status).toBe(400);
  });

  it('keeps authors out of other people’s work', async () => {
    const created = await req('POST', '/api/users', { email: 'luca@example.ch', name: 'Luca', role: 'author' });
    const author = new Map<string, string>();
    await req('POST', '/api/login', { email: 'luca@example.ch', password: created.data.temporaryPassword }, { cookies: author });
    const pages = await req('GET', '/api/entries?collection=pages', undefined, { cookies: author });
    expect(pages.data.entries).toHaveLength(0);
    const post = await req('POST', '/api/entries', { collection: 'posts', data: { title: 'Mein Beitrag' } }, { cookies: author });
    expect(post.status).toBe(200);
    const pub = await req('POST', `/api/entries/${post.data.entry.id}/publish`, {}, { cookies: author });
    expect(pub.data.review).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    const ownerNotes = await req('GET', '/api/notifications');
    expect(ownerNotes.data.items[0]).toMatchObject({ kind: 'review', title: 'Freigabe erbeten: Mein Beitrag', read: false });
    // Authors don't get what their role can't act on (form entries, reviews).
    const authorNotes = await req('GET', '/api/notifications', undefined, { cookies: author });
    expect(authorNotes.data.items).toHaveLength(0);
    const settings = await req('PATCH', '/api/settings', { name: 'Gehackt' }, { cookies: author });
    expect(settings.status).toBe(403);
  });
});

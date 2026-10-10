import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { videoQueueIdle } from '../src/server/video';
import { searchIdle, startSearchSync } from '../src/server/search';
import { storage } from '../src/server/storage';
import { createServer, type AddressInfo } from 'node:net';
import { serve } from '@hono/node-server';
import WebSocket from 'ws';
import sharp from 'sharp';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { attachCollab } from '../src/server/collab';
import { applyData, toData } from '../src/shared/collab-doc';
import { rm } from 'node:fs/promises';
import { sql } from '../src/server/db';
import { migrate } from '../src/server/migrate';
import { syncBuiltinCollections, invalidateCollections, unpublishDue } from '../src/server/content';
import { deliveriesIdle, settleNow } from '../src/server/events';
import { cleanCartReminders, sendCartReminders } from '../src/server/cart-reminders';
import { createHmac } from 'node:crypto';
import { invalidateSettings, bumpGeneration } from '../src/server/settings';
import { createApp } from '../src/server/app';
import type { Entry } from '../src/shared/types';
import { outbox } from '../src/server/mail';
import { foodMail } from '../src/server/ordering';
import { tr } from '../src/site/i18n';
import { totpCode } from '../src/server/lib/crypto';
import { resetRateLimits } from '../src/server/lib/ratelimit';
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
const ffmpegHere = spawnSync('ffmpeg', ['-version']).status === 0;
const storageHas = (key: string) => storage.exists(key);
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
    // Another template replaces the starter content instead of adding to it.
    const alt = await req('POST', '/api/onboarding/seed', { sectors: ['restaurant', 'shop'], name: 'Gasthaus Linde', template: 'fine-dining' });
    expect(alt.status).toBe(200);
    expect(alt.data.templates.map((x: { id: string }) => x.id)).toEqual(['wirtshaus', 'fine-dining', 'cafe']);
    expect(alt.data).toMatchObject({ template: 'fine-dining', themes: ['salon', 'feuilleton'] });
    expect((await req('GET', '/')).data).toContain('Sieben Gänge');
    expect((await req('GET', '/gutscheine')).status).toBe(200);
    expect((await req('POST', '/api/onboarding/seed', { sectors: ['restaurant'], name: 'X', template: 'gibt-es-nicht' })).status).toBe(400);
    const seed = await req('POST', '/api/onboarding/seed', { sectors: ['restaurant', 'shop'], name: 'Gasthaus Linde' });
    expect(seed.status).toBe(200);
    expect(seed.data.themes[0]).toBe('bistro');
    expect(seed.data.template).toBe('wirtshaus');
    expect((await req('GET', '/gutscheine')).status).toBe(404);
    const [{ n: forms }] = await sql`select count(*)::int as n from forms where name like 'Gutschein%'`;
    expect(forms).toBe(0);
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
    // A new page that takes the old address owns it again: the redirect must not hide it.
    const { data: again } = await req('POST', '/api/entries', { collection: 'pages', data: { title: 'Team', blocks: [] } });
    expect(again.entry.slug).toBe('team');
    await req('POST', `/api/entries/${again.entry.id}/publish`, {});
    expect((await req('GET', '/team', undefined, { cookies: new Map() })).status).toBe(200);
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
      form: {
        name: 'Erika',
        email: 'erika@example.ch',
        street: 'Weg 1',
        zip: '8000',
        city: 'Zürich',
        country: 'CH',
        shippingMethod: 'ship',
        payment: 'invoice',
        coupon: 'LINDE10',
        acceptTerms: '1',
      },
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
    const bot = await req('POST', `/_nova/forms/${form.id}`, undefined, {
      cookies: anon,
      headers: { Accept: 'application/json' },
      form: { website: 'spam', _t: Date.now().toString(36), name: 'Bot' },
    });
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

  it('answers GraphQL queries generated from the content types', async () => {
    const anon = { cookies: new Map() };
    const q = await req(
      'POST',
      '/api/v1/graphql',
      { query: '{ site { name } dishes(limit: 2, filter: {category: "Desserts"}) { total items { title slug prices { label price } allergens } } }' },
      anon,
    );
    expect(q.status).toBe(200);
    expect(q.data.errors).toBeUndefined();
    expect(q.data.data.site.name).toBe('Gasthaus Linde');
    expect(q.data.data.dishes.items.length).toBeGreaterThan(0);
    const slug = q.data.data.dishes.items[0].slug;
    const one = await req(
      'GET',
      `/api/v1/graphql?query=${encodeURIComponent('query($s: String) { dish(slug: $s) { title url } }')}&variables=${encodeURIComponent(JSON.stringify({ s: slug }))}`,
      undefined,
      anon,
    );
    expect(one.data.data.dish.title).toBe(q.data.data.dishes.items[0].title);

    // Schema as SDL, unknown fields and too deep queries are rejected before anything runs.
    expect((await req('GET', '/api/v1/graphql/schema.graphql', undefined, anon)).data).toContain('type Dish {');
    expect((await req('POST', '/api/v1/graphql', { query: '{ dishes { items { nope } } }' }, anon)).status).toBe(400);
    const tooDeep = '{ site { name } ' + 'pages { items { '.repeat(5) + 'title' + ' } }'.repeat(5) + ' }';
    expect((await req('POST', '/api/v1/graphql', { query: tooDeep }, anon)).data.errors[0].message).toMatch(/verschachtelt/);

    // Writes need a token with write scope; GET never mutates.
    const create =
      'mutation { createDish(data: {title: \"Zitronentarte\", category: \"Desserts\", prices: [{label: \"\", price: 1200}]}, publish: true) { id title status prices { price } } }';
    expect((await req('POST', '/api/v1/graphql', { query: create }, anon)).data.errors[0].message).toMatch(/Schreibrecht/);
    const token = (await req('POST', '/api/tokens', { name: 'GraphQL', scopes: ['read', 'write'] })).data.secret;
    const auth = { cookies: new Map(), headers: { authorization: `Bearer ${token}` } };
    expect((await req('GET', `/api/v1/graphql?query=${encodeURIComponent(create)}`, undefined, auth)).status).toBe(405);
    const made = await req('POST', '/api/v1/graphql', { query: create }, auth);
    expect(made.data.data.createDish).toMatchObject({ title: 'Zitronentarte', status: 'published' });
  });

  it('runs sandboxed hooks on save, publish and form submissions', async () => {
    const hook = (name: string, event: string, code: string, collection = '') => ({ id: '', name, event, collection, code, active: true });
    const broken = await req('PATCH', '/api/settings', { hooks: [hook('Kaputt', 'entry.beforeSave', 'function hook( {')] });
    expect(broken.status).toBe(400);
    expect(broken.data.error).toMatch(/Kaputt.*SyntaxError/);
    const saved = await req('PATCH', '/api/settings', {
      hooks: [
        hook(
          'Titel bereinigen',
          'entry.beforeSave',
          'function hook(e) { e.data.title = String(e.data.title).replace(/\\s+/g, " ").trim(); e.data.series = "Hook"; return e; }',
          'posts',
        ),
        hook('Kurzfassung nötig', 'entry.beforePublish', 'function hook(e) { if (!e.data.excerpt) throw new Error("Bitte zuerst eine Kurzfassung schreiben."); }', 'posts'),
        hook(
          'Spamregeln',
          'form.beforeSubmit',
          'function hook(e) { if (/casino/i.test(e.fields.nachricht)) e.spam = true; if (e.fields.name === "Nein") throw new Error("Bitte mit echtem Namen."); e.fields.name = e.fields.name.toUpperCase(); return e; }',
        ),
      ],
    });
    expect(saved.status).toBe(200);
    expect(saved.data.settings.hooks.every((h: { id: string }) => h.id)).toBe(true);

    const post = await req('POST', '/api/entries', { collection: 'posts', data: { title: '  Hallo   Welt ' } });
    expect(post.data.entry.data).toMatchObject({ title: 'Hallo Welt', series: 'Hook' });
    // Only for the chosen content type.
    const dish = await req('POST', '/api/entries', { collection: 'dishes', data: { title: '  Rösti ', category: 'Hauptgänge', prices: [{ label: '', price: 1800 }] } });
    expect(dish.data.entry.data.series).toBeUndefined();
    const blocked = await req('POST', `/api/entries/${post.data.entry.id}/publish`, {});
    expect(blocked.status).toBe(400);
    expect(blocked.data.error).toBe('Bitte zuerst eine Kurzfassung schreiben.');
    await req('PUT', `/api/entries/${post.data.entry.id}`, { data: { ...post.data.entry.data, excerpt: 'Kurz.' } });
    expect((await req('POST', `/api/entries/${post.data.entry.id}/publish`, {})).status).toBe(200);

    const [form] = await sql`select id from forms where name = 'Kontakt'`;
    const send = (fields: Record<string, string>) =>
      req('POST', `/_nova/forms/${form.id}`, undefined, {
        cookies: new Map(),
        headers: { Accept: 'application/json' },
        form: { _t: (Date.now() - 5000).toString(36), e_mail: 'x@example.ch', ...fields },
      });
    const before = (await sql`select count(*)::int as n from submissions`)[0].n;
    expect((await send({ name: 'Bot', nachricht: 'Online CASINO' })).data.ok).toBe(true);
    const rejected = await send({ name: 'Nein', nachricht: 'Hallo' });
    expect(rejected.data).toEqual({ ok: false, message: 'Bitte mit echtem Namen.' });
    expect((await send({ name: 'Vreni', nachricht: 'Tisch für zwei?' })).data.ok).toBe(true);
    const subs = await sql`select data from submissions order by created_at desc`;
    expect(subs.length - before).toBe(1);
    expect(subs[0].data.name).toBe('VRENI');

    await req('PATCH', '/api/settings', { hooks: [] });
  });

  it('syncs content as files with the CLI, without overwriting newer changes', async () => {
    const token = (await req('POST', '/api/tokens', { name: 'CLI', scopes: ['read', 'write'] })).data.secret;
    const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
    await new Promise((r) => server.once('listening', r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const dir = mkdtempSync(join(tmpdir(), 'nova-cli-'));
    const cli = (...args: string[]) =>
      new Promise<{ code: number; out: string }>((resolve) =>
        execFile(process.execPath, [join(process.cwd(), 'src/cli/nova.ts'), ...args], { cwd: dir, env: { ...process.env, NOVA_TOKEN: token } }, (err, stdout, stderr) =>
          resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, out: stdout + stderr }),
        ),
      );
    try {
      expect((await cli('init', url)).code).toBe(0);
      expect((await cli('pull')).out).toMatch(/Einträge aus \d+ Inhaltstypen/);
      const file = join(dir, 'content/dishes', readdirSync(join(dir, 'content/dishes'))[0]);
      const entry = JSON.parse(readFileSync(file, 'utf8'));
      writeFileSync(file, JSON.stringify({ ...entry, data: { ...entry.data, title: 'Aus Git' } }));
      writeFileSync(join(dir, 'content/dishes/neu-aus-git.json'), JSON.stringify({ data: { title: 'Neu aus Git', category: 'Desserts', prices: [{ label: '', price: 900 }] } }));
      const status = (await cli('status')).out;
      expect(status).toContain('+ dishes/neu-aus-git.json (neu)');
      expect(status).toContain(`~ dishes/${entry.slug}.json (geändert)`);
      const pushed = await cli('push', '--publish');
      expect(pushed.out).toContain('✓ 2 hochgeladen');
      const [live] = await sql`select published_data ->> 'title' as title from entries where id = ${entry.id}`;
      expect(live.title).toBe('Aus Git');
      expect(JSON.parse(readFileSync(join(dir, 'content/dishes/neu-aus-git.json'), 'utf8')).id).toMatch(/^[0-9a-f-]{36}$/);

      // Someone edits the same dish in the Studio meanwhile: push refuses, pull keeps the local edit.
      await sql`update entries set version = version + 1 where id = ${entry.id}`;
      const again = JSON.parse(readFileSync(file, 'utf8'));
      writeFileSync(file, JSON.stringify({ ...again, data: { ...again.data, title: 'Veraltet' } }));
      const stale = await cli('push');
      expect(stale.code).toBe(1);
      expect(stale.out).toContain('inzwischen geändert');
      expect((await cli('pull')).out).toContain('lokal geändert');
      expect((await cli('graphql', '{ site { name } }')).out).toContain('Gasthaus Linde');
    } finally {
      server.close();
      rmSync(dir, { recursive: true, force: true });
    }
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
    const form = (name: string) => ({
      service: svc.data.service.id,
      day,
      time: '19:00',
      party: '2',
      name,
      email: `${name.toLowerCase()}@example.ch`,
      _t: (Date.now() - 5000).toString(36),
      _back: '/reservation',
    });
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
      data: {
        title: 'Nur für Mitglieder',
        excerpt: 'Ein Blick hinter die Kulissen.',
        access: 'members',
        blocks: [text('<p>Der Einstieg ist für alle.</p>'), text('<p>Geheimzutat Kardamom.</p>')],
      },
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
    const gq = await req('POST', '/api/v1/graphql', { query: '{ posts { items { title blocks } } }' }, { cookies: new Map() });
    expect(JSON.stringify(gq.data)).toContain('Nur für Mitglieder');
    expect(JSON.stringify(gq.data)).not.toContain('Kardamom');

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
    const login = await req('POST', '/konto/anmelden', undefined, {
      cookies: new Map(),
      form: { email: 'mia@example.ch', password: 'noch ein langes passwort', weiter: '/konto' },
    });
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
    const wait = await req('POST', `/_nova/tickets/${ev.data.entry.id}/warteliste`, undefined, {
      cookies: buyer,
      form: { name: 'Jon', email: 'jon@example.ch', _back: path, _t: (Date.now() - 5000).toString(36) },
    });
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
    const paid = await req('POST', '/api/entries', {
      collection: 'events',
      data: { title: 'Gala', start: local(20, '18:00'), tickets: [{ name: 'Gala', price: 9000, capacity: 50 }] },
    });
    await req('POST', `/api/entries/${paid.data.entry.id}/publish`, {});
    expect((await req('GET', `/events/${paid.data.entry.slug}`, undefined, { cookies: new Map() })).data).toContain('Die Online-Anmeldung ist gerade nicht möglich');

    // A course with three dates: sorted by its first date, all three in the calendar file.
    const course = await req('POST', '/api/entries', {
      collection: 'courses',
      data: {
        title: 'Brotbackkurs',
        sessions: [{ start: local(14, '18:00') }, { start: local(7, '18:00'), end: local(7, '21:00') }, { start: local(21, '18:00') }],
        tickets: [{ name: 'Teilnahme', capacity: 8 }],
      },
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
      const form = {
        amount: '50',
        own: '',
        interval: 'month',
        campaign: 'Werkstatt',
        name: 'Rita Graf',
        email: 'rita@example.ch',
        zip: '8000',
        city: 'Zürich',
        street: 'Bahnhofstrasse 1',
        _back: '/spenden',
        _block: 'dn1',
        _t: (Date.now() - 5000).toString(36),
      };
      const tooSmall = await req('POST', '/_nova/spenden', undefined, { cookies: new Map(), form: { ...form, own: '2' } });
      expect(new URL(tooSmall.headers.get('location')!, 'http://x').searchParams.get('d_err')).toMatch(/ab CHF.5\.00/);
      const go = await req('POST', '/_nova/spenden', undefined, { cookies: new Map(), form });
      expect(go.headers.get('location')).toBe('https://checkout.stripe.com/c/pay/cs_test_1');
      expect(sent[0]).toContain('mode=subscription');
      expect(sent[0]).toContain('recurring%5D%5Binterval%5D=month');
      const [d] = await sql`select * from donations where email = 'rita@example.ch'`;
      expect(d.amount).toBe(5000);
      outbox.length = 0;
      await handleStripeEvent({
        type: 'checkout.session.completed',
        data: { object: { mode: 'subscription', metadata: { donation_id: d.id }, subscription: 'sub_1', id: 'cs_test_1' } },
      });
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
    const flat = await make({
      title: 'Dachwohnung',
      offer: 'rent',
      kind: 'apartment',
      rooms: 3.5,
      area: 90,
      price: 260000,
      city: 'Winterthur',
      zip: '8400',
      street: 'Geheimweg 1',
      showStreet: false,
      features: ['balcony'],
    });
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
    // Swiss grouping: ’ or ' depending on the ICU version of Node (the latter escaped in HTML).
    expect(page.data).toMatch(/CHF.2(?:’|'|&#39;)600\.– \/ Mt\./);
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
    await req('PUT', '/api/kitchen/settings', {
      pickup: true,
      delivery: true,
      deliveryZips: ['8400'],
      deliveryFee: 500,
      deliveryMin: 4000,
      prepMinutes: 20,
      slotMinutes: 15,
      payOnSite: true,
      note: '',
    });
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
    const form = {
      mode: 'delivery',
      slot,
      name: 'Nina Roth',
      phone: '079 555 66 77',
      email: 'nina@example.ch',
      street: 'Bahnhofplatz 1',
      zip: '8001',
      city: 'Zürich',
      payment: 'onsite',
      _t: (Date.now() - 5000).toString(36),
    };
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
    const unknown = await req(
      'POST',
      '/api/login/passkey',
      { key: login.data.key, response: { id: 'unbekannt', rawId: 'unbekannt', type: 'public-key', response: {} } },
      { cookies: new Map() },
    );
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

  it('serves translations under /fr with their own addresses, shared prices and hreflang', async () => {
    const anon = { cookies: new Map() };
    const settings = (await req('GET', '/api/settings')).data.settings;
    const navKontakt = settings.nav.find((n: { href: string }) => n.href === '/kontakt');
    const saved = await req('PATCH', '/api/settings', {
      languages: ['fr', 'de', 'xx'],
      translations: { fr: { tagline: 'Cuisine de saison', nav: navKontakt ? { [navKontakt.id]: 'Contact' } : {} } },
    });
    expect(saved.data.settings.languages).toEqual(['fr']);
    const [page] = await sql`select id, data from entries where collection = 'pages' and slug = 'kontakt'`;

    // Untranslated: the original under /fr, French around it, but not indexed.
    const fallback = await req('GET', '/fr/kontakt', undefined, anon);
    expect(fallback.status).toBe(200);
    expect(fallback.data).toContain('<html lang="fr-CH"');
    expect(fallback.data).toContain('name="robots" content="noindex');
    expect(fallback.data).toContain('href="/fr"');

    // Translate and publish.
    const draft = await req('PUT', `/api/entries/${page.id}?lang=fr`, { data: { ...page.data, title: 'Contact' }, slug: 'contact' });
    expect(draft.data.entry).toMatchObject({ lang: 'fr', translated: true, status: 'draft', slug: 'contact' });
    expect((await req('GET', '/fr/contact', undefined, anon)).status).toBe(404);
    expect((await req('POST', `/api/entries/${page.id}/publish?lang=fr`, {})).status).toBe(200);
    const fr = await req('GET', '/fr/contact', undefined, anon);
    expect(fr.status).toBe(200);
    expect(fr.data).toContain('<title>Contact ·');
    expect(fr.data).toMatch(/<link rel="canonical" href="[^"]*\/fr\/contact">/);
    expect(fr.data).toMatch(/hreflang="de" href="[^"]*\/kontakt"/);
    expect(fr.data).toMatch(/hreflang="fr" href="[^"]*\/fr\/contact"/);
    expect(fr.data).not.toContain('noindex');
    // System texts in French too; the German page keeps its German.
    expect(fr.data).toContain('Aller au contenu');
    expect(fr.data).toContain('aria-label="Langue"');
    expect(fr.data).not.toContain('Zum Inhalt springen');
    // A form sent from a French page answers in French and leads back to the French page.
    const formId = (await sql`select id from forms where name = 'Kontakt'`)[0].id;
    const sent = await req('POST', `/_nova/forms/${formId}`, undefined, {
      cookies: new Map(),
      headers: { referer: 'http://localhost/fr/contact' },
      form: { _t: (Date.now() - 5000).toString(36), _page: '/kontakt', e_mail: 'nicht-gueltig' },
    });
    expect(sent.status).toBe(303);
    expect(sent.headers.get('location')).toMatch(/^\/fr\/contact\?/);
    expect(decodeURIComponent(sent.headers.get('location')!)).not.toMatch(/Bitte|fülle/);
    // Links inside the French site lead to French addresses; the switcher to both.
    expect(fr.data).toContain('href="/fr/contact"');
    expect(fr.data).not.toMatch(/href="\/kontakt"/);
    if (navKontakt) expect(fr.data).toContain('aria-current="page">Contact</a>');
    expect((await req('GET', '/fr', undefined, anon)).data).toContain('Cuisine de saison');
    expect((await req('GET', '/fr/kontakt', undefined, anon)).headers.get('location')).toBe('/fr/contact');
    const de = await req('GET', '/kontakt', undefined, anon);
    expect(de.data).toContain('<html lang="de-CH"');
    expect(de.data).toContain('Zum Inhalt springen');
    expect(de.data).toMatch(/hreflang="fr" href="[^"]*\/fr\/contact"/);
    expect((await req('GET', '/', undefined, anon)).data).not.toContain('Cuisine de saison');
    const sitemap = (await req('GET', '/sitemap.xml', undefined, anon)).data as string;
    expect(sitemap).toMatch(/<loc>[^<]*\/fr\/contact<\/loc>/);
    expect(sitemap).toContain('xhtml:link rel="alternate" hreflang="fr"');

    // Text is translated, prices stay shared.
    const [dish] = await sql`select id, data from entries where collection = 'dishes' and status = 'published' order by sort_index limit 1`;
    const price = dish.data.prices[0].price;
    await req('PUT', `/api/entries/${dish.id}?lang=fr`, { data: { ...dish.data, title: 'Plat du jour', prices: [{ label: 'grand', price: 1 }] } });
    await req('POST', `/api/entries/${dish.id}/publish?lang=fr`, {});
    const [t] = await sql`select published_data from entry_translations where entry_id = ${dish.id} and lang = 'fr'`;
    expect(t.published_data.prices[0]).toEqual({ label: 'grand' });
    const menu = await req('GET', '/fr/karte', undefined, anon);
    expect(menu.data).toContain('Plat du jour');
    expect((await req('GET', '/karte', undefined, anon)).data).not.toContain('Plat du jour');
    const gql = await req('POST', '/api/v1/graphql', { query: '{ dishes(limit: 50) { items { title prices { price } } } }' }, anon);
    expect(JSON.stringify(gql.data)).not.toContain('Plat du jour');
    const gqlFr = await req('POST', '/api/v1/graphql?lang=fr', { query: '{ dishes(limit: 50) { items { title prices { price } } } }' }, anon);
    expect(gqlFr.data.data.dishes.items).toContainEqual({ title: 'Plat du jour', prices: [{ price }] });
    expect(JSON.stringify((await req('GET', '/api/v1/dishes?limit=50&lang=fr', undefined, anon)).data)).toContain('Plat du jour');
    expect((await req('GET', '/api/v1/pages/contact?lang=fr', undefined, anon)).status).toBe(404);
    expect((await req('GET', '/api/v1/pages/kontakt?lang=fr', undefined, anon)).data.data.data.title).toBe('Contact');

    // Mails sent later (kitchen, reminders, webhooks) speak the language the order was placed in.
    outbox.length = 0;
    const order = {
      number: 7,
      mode: 'pickup',
      slot_at: new Date().toISOString(),
      name: 'Claire Dubois',
      email: 'claire@example.ch',
      items: [],
      currency: 'CHF',
      total: 0,
      delivery_fee: 0,
      payment: 'onsite',
      token: 'x',
      paid_at: null,
    };
    await foodMail({ ...order, lang: 'fr' } as never, 'ready');
    await foodMail({ ...order, lang: '' } as never, 'ready');
    expect(outbox.map((m) => m.subject)).toEqual([tr('fr', 'Bereit zum Abholen: Nr. {n}', { n: 7 }), 'Bereit zum Abholen: Nr. 7']);
    expect(outbox[0].subject).not.toContain('Bereit');
    expect(outbox[0].text).toContain('Bonjour Claire,');

    // Languages that are switched off don't exist.
    await req('PATCH', '/api/settings', { languages: [] });
    expect((await req('GET', '/fr/contact', undefined, anon)).status).toBe(404);
    expect((await req('GET', `/api/entries/${page.id}?lang=fr`)).status).toBe(404);
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

  it('edits together in real time: shared document, one writer, changes from outside', async () => {
    const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
    await new Promise((r) => server.once('listening', r));
    attachCollab(server as never);
    const port = (server.address() as AddressInfo).port;
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const [page] = await sql`select id, data from entries where collection = 'pages' and slug = 'kontakt'`;

    const connect = (headers: Record<string, string>) =>
      new Promise<{ doc: Y.Doc; ws: WebSocket; statuses: { t: string; message?: string }[]; send: (type: number, body: string) => void }>((resolve, reject) => {
        const doc = new Y.Doc();
        const ws = new WebSocket(`ws://127.0.0.1:${port}/api/collab/${page.id}`, { headers: { origin: `http://127.0.0.1:${port}`, ...headers } });
        const statuses: { t: string; message?: string }[] = [];
        const raw = (b: Uint8Array) => ws.readyState === ws.OPEN && ws.send(b);
        ws.on('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
        ws.on('open', () => {
          const e = encoding.createEncoder();
          encoding.writeVarUint(e, 0);
          syncProtocol.writeSyncStep1(e, doc);
          raw(encoding.toUint8Array(e));
        });
        ws.on('message', (data: Buffer) => {
          const d = decoding.createDecoder(new Uint8Array(data));
          const type = decoding.readVarUint(d);
          if (type === 0) {
            const reply = encoding.createEncoder();
            encoding.writeVarUint(reply, 0);
            const kind = syncProtocol.readSyncMessage(d, reply, doc, ws);
            if (encoding.length(reply) > 1) raw(encoding.toUint8Array(reply));
            if (kind === syncProtocol.messageYjsSyncStep2) resolve({ doc, ws, statuses, send });
          } else if (type === 2) statuses.push(JSON.parse(decoding.readVarString(d)));
        });
        doc.on('update', (u: Uint8Array, origin: unknown) => {
          if (origin === ws) return;
          const e = encoding.createEncoder();
          encoding.writeVarUint(e, 0);
          syncProtocol.writeUpdate(e, u);
          raw(encoding.toUint8Array(e));
        });
        const send = (type: number, body: string) => {
          const e = encoding.createEncoder();
          encoding.writeVarUint(e, type);
          encoding.writeVarString(e, body);
          raw(encoding.toUint8Array(e));
        };
      });
    const until = async (check: () => boolean) => {
      for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 20));
      expect(check()).toBe(true);
    };

    try {
      // No session, or a page from elsewhere: no connection.
      await expect(connect({})).rejects.toThrow('HTTP 401');
      await expect(connect({ cookie, origin: 'https://evil.example' })).rejects.toThrow('HTTP 403');

      const a = await connect({ cookie });
      const b = await connect({ cookie });
      expect(toData(a.doc)).toEqual(toData(b.doc));
      const first = toData(a.doc).blocks![0];
      // At the same time: A edits a prop of the first block, B the title.
      const da = toData(a.doc);
      applyData(a.doc, { ...da, blocks: da.blocks!.map((x, i) => (i === 0 ? { ...x, props: { ...x.props, heading: 'Gleichzeitig A' } } : x)) });
      applyData(b.doc, { ...toData(b.doc), title: 'Kontakt (B)' });
      await until(() => toData(a.doc).title === 'Kontakt (B)' && (toData(b.doc).blocks![0].props as { heading?: string }).heading === 'Gleichzeitig A');

      // The room saves (on request here), once, for everyone.
      a.send(3, '{}');
      await until(() => a.statuses.some((x) => x.t === 'saved') && b.statuses.some((x) => x.t === 'saved'));
      const [saved] = await sql`select data from entries where id = ${page.id}`;
      expect(saved.data.title).toBe('Kontakt (B)');
      expect(saved.data.blocks.find((x: { id: string }) => x.id === first.id).props.heading).toBe('Gleichzeitig A');
      expect((await sql`select 1 from entry_ydocs where entry_id = ${page.id}`).length).toBe(1);

      // Changed elsewhere (API, CLI): the open editors follow.
      const cur = await req('GET', `/api/entries/${page.id}`);
      await req('PUT', `/api/entries/${page.id}`, { data: { ...cur.data.entry.data, title: 'Von aussen' } });
      await until(() => toData(b.doc).title === 'Von aussen');

      // A hook that says no: everyone sees why, nothing is lost in the shared document.
      await req('PATCH', '/api/settings', {
        hooks: [{ id: '', name: 'Nein', event: 'entry.beforeSave', collection: 'pages', code: 'function hook() { throw new Error("Bitte nicht jetzt."); }', active: true }],
      });
      applyData(a.doc, { ...toData(a.doc), title: 'Abgelehnt' });
      a.send(3, '{}');
      await until(() => b.statuses.some((x) => x.t === 'error' && x.message === 'Bitte nicht jetzt.'));
      expect(toData(b.doc).title).toBe('Abgelehnt');
      await req('PATCH', '/api/settings', { hooks: [] });
      a.ws.close();
      b.ws.close();
    } finally {
      server.close();
    }
  });

  it('keeps comments on entries, with threads, mentions and personal notices', async () => {
    const [post] = await sql`select id from entries where data ->> 'title' = 'Mein Beitrag'`;
    const lucaId = (await sql`select id from users where email = 'luca@example.ch'`)[0].id;
    const rea = await req('POST', '/api/users', { email: 'rea@example.ch', name: 'Rea Keller', role: 'editor' });
    expect(rea.status).toBe(200);

    // A comment with a mention reaches only the person mentioned.
    const first = await req('POST', `/api/entries/${post.id}/comments`, { body: '@Luca kannst du den Titel noch schärfen?' });
    expect(first.status).toBe(200);
    expect(first.data.comment.mentions).toEqual([lucaId]);
    await new Promise((r) => setTimeout(r, 50)); // notices are written after the response
    const [mention] = await sql`select kind, title, href, user_id from notifications where kind = 'mention'`;
    expect(mention).toMatchObject({ title: 'Sandra hat dich erwähnt: Mein Beitrag', user_id: lucaId });
    expect(mention.href).toBe(`/inhalte/posts/${post.id}?kommentar=${first.data.comment.id}`);
    const reaUser = new Map<string, string>();
    await req('POST', '/api/login', { email: 'rea@example.ch', password: rea.data.temporaryPassword }, { cookies: reaUser });
    expect((await req('GET', '/api/notifications', undefined, { cookies: reaUser })).data.items.some((n: { kind: string }) => n.kind === 'mention')).toBe(false);
    expect((await req('GET', '/api/notifications')).data.items.some((n: { kind: string }) => n.kind === 'mention')).toBe(false);

    // Resolve, then a reply reopens the thread and tells the others in it.
    await req('PATCH', `/api/entry-comments/${first.data.comment.id}`, { resolved: true });
    const reply = await req('POST', `/api/entries/${post.id}/comments`, { body: 'Mach ich.', parentId: first.data.comment.id }, { cookies: reaUser });
    expect(reply.status).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
    const list = await req('GET', `/api/entries/${post.id}/comments`);
    expect(list.data.comments).toHaveLength(2);
    expect(list.data.comments[0].resolved_at).toBeNull();
    expect(list.data.people.map((p: { name: string }) => p.name)).toContain('Rea Keller');
    const [replied] = await sql`select title, user_id from notifications where title like 'Rea Keller hat geantwortet%'`;
    expect(replied.user_id).toBe((await sql`select id from users where email = 'sandra@example.ch'`)[0].id);

    // Pinned to a block; replies stay on the thread's block.
    const [page] = await sql`select id, data from entries where collection = 'pages' and slug = 'kontakt'`;
    const blockId = page.data.blocks[0].id;
    const pinned = await req('POST', `/api/entries/${page.id}/comments`, { body: 'Bild fehlt', blockId });
    expect(pinned.data.comment.block_id).toBe(blockId);

    // Rights: only the writer edits; deleting others' comments needs publishing rights.
    const edit = await req('PATCH', `/api/entry-comments/${first.data.comment.id}`, { body: 'Geändert' }, { cookies: reaUser });
    expect(edit.status).toBe(403);
    const tim = await req('POST', '/api/users', { email: 'tim@example.ch', name: 'Tim', role: 'author' });
    const timUser = new Map<string, string>();
    await req('POST', '/api/login', { email: 'tim@example.ch', password: tim.data.temporaryPassword }, { cookies: timUser });
    expect((await req('DELETE', `/api/entry-comments/${first.data.comment.id}`, undefined, { cookies: timUser })).status).toBe(403);
    // Authors see comments only on their own entries.
    expect((await req('GET', `/api/entries/${page.id}/comments`, undefined, { cookies: timUser })).status).toBe(403);
    expect((await req('POST', `/api/entries/${post.id}/comments`, { body: '   ' })).status).toBe(400);
    expect((await req('DELETE', `/api/entry-comments/${reply.data.comment.id}`)).status).toBe(200);
  });

  it('makes suggestions with the KI-Assistent only when switched on, and never saves them', async () => {
    expect((await req('GET', '/api/settings')).data.system.ai).toBe(false);
    const off = await req('POST', '/api/ai/rewrite', { text: 'Hallo', mode: 'clearer' });
    expect(off.status).toBe(403);

    // A stand-in for the Anthropic API that answers like the real one.
    const realFetch = globalThis.fetch;
    const calls: { headers: Record<string, string>; body: any }[] = [];
    let answer: (body: any) => Response = () => new Response('{}', { status: 500 });
    env.ai.key = 'sk-ant-test';
    env.ai.baseUrl = 'https://ai.test';
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      if (!String(url).startsWith('https://ai.test/')) return realFetch(url, init);
      const body = JSON.parse(String(init?.body));
      calls.push({ headers: init?.headers as Record<string, string>, body });
      return answer(body);
    }) as typeof fetch;
    const text = (t: string) => () => new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] }), { status: 200 });
    try {
      // The key alone isn't enough: someone has to switch it on.
      expect((await req('POST', '/api/ai/rewrite', { text: 'Hallo', mode: 'clearer' })).status).toBe(403);
      expect((await req('PATCH', '/api/settings', { ai: { enabled: true } })).status).toBe(200);

      // Wrapping quotes go, ß becomes ss, one-line fields stay one line.
      answer = text('«Wir kochen mit Gemüse aus der Region,\nfrisch und mit Mass.»');
      const plain = await req('POST', '/api/ai/rewrite', { text: 'Bei uns gibts Gemüse von hier.', mode: 'clearer', kind: 'plain', max: 120 });
      expect(plain.status).toBe(200);
      expect(plain.data.suggestion).toBe('Wir kochen mit Gemüse aus der Region, frisch und mit Mass.');
      expect(calls[0].headers['x-api-key']).toBe('sk-ant-test');
      expect(calls[0].body.system).toContain('ss');
      expect(calls[0].body.messages[0].content[0].text).toContain('Bei uns gibts Gemüse von hier.');
      expect(calls[0].body.messages[0].content[0].text).toContain('Höchstens 120 Zeichen');

      // Rich text comes back sanitized.
      answer = text('<p onclick="steal()">Neu <script>alert(1)</script><a href="javascript:x">Link</a> <strong>fett</strong></p>');
      const rich = await req('POST', '/api/ai/rewrite', { text: '<p>Alt</p>', mode: 'shorter', kind: 'rich' });
      expect(rich.data.suggestion).toBe('<p>Neu Link <strong>fett</strong></p>');

      // Errors from the service become something a person can act on.
      answer = () => new Response('{"type":"error"}', { status: 401 });
      const badKey = await req('POST', '/api/ai/rewrite', { text: 'Hallo', mode: 'fix' });
      expect(badKey.status).toBe(502);
      expect(badKey.data.error).toContain('ANTHROPIC_API_KEY');
      answer = () => new Response('{}', { status: 529 });
      expect((await req('POST', '/api/ai/rewrite', { text: 'Hallo', mode: 'fix' })).status).toBe(503);

      // Alt text from the image itself.
      const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#c86432' } }).png().toBuffer();
      const form = new FormData();
      form.append('file', new File([new Uint8Array(png)], 'risotto-steinpilze.png', { type: 'image/png' }));
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      const up = await app.request('/api/media', { method: 'POST', body: form, headers: { 'X-Nova': '1', cookie } });
      const media = (await up.json()).media[0];
      answer = text('Teller mit Steinpilz-Risotto auf einem Holztisch.');
      const alt = await req('POST', '/api/ai/alt', { media: media.id });
      expect(alt.data.suggestion).toBe('Teller mit Steinpilz-Risotto auf einem Holztisch');
      const sent = calls[calls.length - 1].body.messages[0].content;
      expect(sent[0].type).toBe('image');
      expect(sent[0].source.media_type).toBe('image/jpeg');
      expect(sent[1].text).toContain('risotto-steinpilze.png');
      expect((await sql`select alt from media where id = ${media.id}`)[0].alt).toBe(''); // only a suggestion

      // Translation draft: every text of the original, blocks addressed by id.
      const [page] = await sql`select id, data from entries where collection = 'pages' and slug = 'kontakt'`;
      await req('PATCH', '/api/settings', { languages: ['fr'] });
      const before = await sql`select data from entry_translations where entry_id = ${page.id} and lang = 'fr'`;
      answer = (body) => {
        const items = JSON.parse(body.messages[0].content[0].text.split('\n').pop());
        return new Response(
          JSON.stringify({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'uebersetzung', input: { items: items.map((i: { id: number; text: string }) => ({ id: i.id, text: `FR ${i.text}` })) } }] }),
          { status: 200 },
        );
      };
      const draft = await req('POST', '/api/ai/translate', { entry: page.id, lang: 'fr' });
      expect(draft.status).toBe(200);
      expect(calls[calls.length - 1].body.tool_choice).toEqual({ type: 'tool', name: 'uebersetzung' });
      const blockSlot = draft.data.items.find((i: { path: string[] }) => i.path[0] === 'blocks');
      const block = page.data.blocks.find((b: { id: string }) => `#${b.id}` === blockSlot.path[1]);
      expect(blockSlot.path[2]).toBe('props');
      expect(blockSlot.source).toBe(blockSlot.path.slice(3).reduce((o: any, k: string) => o[k], block.props));
      expect(blockSlot.text).toBe(blockSlot.kind === 'rich' ? `<p>FR ${blockSlot.source}</p>` : `FR ${blockSlot.source}`);
      expect(draft.data.items.every((i: { text: string; source: string }) => i.text.startsWith('FR') || i.text.startsWith('<'))).toBe(true);
      expect(await sql`select data from entry_translations where entry_id = ${page.id} and lang = 'fr'`).toEqual(before);
      expect((await req('POST', '/api/ai/translate', { entry: page.id, lang: 'de' })).status).toBe(400); // the original itself

      // Authors only for their own entries.
      const ina = await req('POST', '/api/users', { email: 'ina@example.ch', name: 'Ina', role: 'author' });
      const inaUser = new Map<string, string>();
      await req('POST', '/api/login', { email: 'ina@example.ch', password: ina.data.temporaryPassword }, { cookies: inaUser });
      expect((await req('POST', '/api/ai/translate', { entry: page.id, lang: 'fr' }, { cookies: inaUser })).status).toBe(403);

      // Switched off again: gone.
      await req('PATCH', '/api/settings', { ai: { enabled: false }, languages: [] });
      expect((await req('POST', '/api/ai/alt', { media: media.id })).status).toBe(403);
    } finally {
      globalThis.fetch = realFetch;
      env.ai.key = '';
    }
  });

  it.skipIf(!ffmpegHere)('makes web versions of uploaded videos and serves them with byte ranges', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nova-vid-'));
    const src = join(dir, 'clip.mp4');
    const make = (file: string, codec: string[]) =>
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=480x270:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '2', ...codec, '-c:a', 'aac', '-shortest', file]);
    // An older codec that not every browser plays: gets a web version.
    make(src, ['-c:v', 'mpeg4', '-q:v', '2']);
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const upload = async (name: string) => {
      const form = new FormData();
      form.append('file', new File([new Uint8Array(readFileSync(src))], name, { type: 'video/mp4' }));
      const r = await app.request('/api/media', { method: 'POST', body: form, headers: { 'X-Nova': '1', cookie } });
      return (await r.json()).media[0];
    };
    const media = await upload('Rundgang.mp4');
    // The queue may already have picked it up by the time the answer is read.
    expect(['queued', 'working']).toContain(media.video.status);
    await videoQueueIdle();

    const [row] = await sql`select video from media where id = ${media.id}`;
    expect(row.video).toMatchObject({ status: 'ready', width: 480, height: 270, renditions: [{ p: 270, width: 480, height: 270 }] });
    expect(row.video.duration).toBeCloseTo(2, 0);

    // Byte ranges for seeking; the index sits in front of the data, so playback starts at once.
    const part = await app.request(`/media/${media.id}/video/270.mp4`, { headers: { range: 'bytes=0-99' } });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe(`bytes 0-99/${row.video.renditions[0].size}`);
    const whole = Buffer.from(await (await app.request(`/media/${media.id}/video/270.mp4`)).arrayBuffer());
    expect(whole.indexOf('moov')).toBeGreaterThan(0);
    expect(whole.indexOf('moov')).toBeLessThan(whole.indexOf('mdat'));
    const poster = await app.request(`/media/${media.id}/video/poster.webp`);
    expect(poster.headers.get('content-type')).toBe('image/webp');
    expect((await app.request(`/media/${media.id}/video/poster.jpg`)).status).toBe(404);
    expect((await app.request(`/media/${media.id}/video/1080.mp4`)).status).toBe(404);

    // The website plays the web version, the original stays as the last fallback; the admin shows the poster.
    const [page] = await sql`select id, data from entries where collection = 'pages' and slug = 'kontakt'`;
    const block = { id: 'vid1', type: 'video', props: { file: media.id, poster: null, url: '', caption: '' }, style: {}, lock: 'none' };
    const rendered = await req('POST', '/api/render', { entryId: page.id, data: { ...page.data, blocks: [block] }, blockId: 'vid1' });
    expect(rendered.data.html).toContain(`<source src="/media/${media.id}/video/270.mp4" type="video/mp4">`);
    expect(rendered.data.html).toContain(`poster="/media/${media.id}/video/poster.webp"`);
    expect(rendered.data.html).toContain('width="480" height="270" data-duration="2"');
    expect(rendered.data.html).toContain(`/media/${media.id}/file/Rundgang.mp4`);
    expect((await req('GET', `/api/media/${media.id}`)).data.media.thumb).toBe(`/media/${media.id}/video/poster.webp`);

    // Switched off: delivered as uploaded, and it says why.
    env.video.enabled = false;
    try {
      const plain = await upload('Roh.mp4');
      expect(plain.video).toEqual({ status: 'skipped', error: 'ausgeschaltet' });
    } finally {
      env.video.enabled = true;
    }

    // Already a small H.264 MP4: no bigger copy, the original plays directly.
    make(src, ['-c:v', 'libx264', '-crf', '40', '-pix_fmt', 'yuv420p']);
    const small = await upload('Klein.mp4');
    await videoQueueIdle();
    expect((await sql`select video from media where id = ${small.id}`)[0].video).toMatchObject({ status: 'ready', renditions: [] });

    // Again on request; deleting removes the web versions too.
    expect(['queued', 'working']).toContain((await req('POST', `/api/media/${media.id}/video`)).data.media.video.status);
    await videoQueueIdle();
    expect((await sql`select video ->> 'status' as s from media where id = ${media.id}`)[0].s).toBe('ready');
    expect((await req('DELETE', `/api/media/${media.id}`)).status).toBe(200);
    expect((await app.request(`/media/${media.id}/video/270.mp4`)).status).toBe(404);
    expect(await storageHas(`media/${media.id}/video/270.mp4`)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('checks uploads before storing them, with ClamAV when it is there', async () => {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const upload = async (name: string, body: string | Buffer, type: string) => {
      const form = new FormData();
      form.append('file', new File([typeof body === 'string' ? body : new Uint8Array(body)], name, { type }));
      const r = await app.request('/api/media', { method: 'POST', body: form, headers: { 'X-Nova': '1', cookie } });
      return { status: r.status, data: (await r.json()) as any };
    };
    const count = async () => Number((await sql`select count(*)::int as n from media`)[0].n);

    // Without ClamAV: the structure is checked.
    const plain = await upload('Menu.pdf', '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF', 'application/pdf');
    expect(plain.status).toBe(200);
    expect(plain.data.media[0].scan.engine).toBe('basic');
    const before = await count();
    const js = await upload('Flyer.pdf', '%PDF-1.4\n1 0 obj << /OpenAction << /S /JavaScript /JS (app.launchURL("x")) >> >> endobj\n%%EOF', 'application/pdf');
    expect(js.status).toBe(400);
    expect(js.data.error).toContain('JavaScript');
    expect(await count()).toBe(before);

    // A stand-in for clamd that speaks INSTREAM like the real one.
    const seen: number[] = [];
    const clam = createServer((sock) => {
      let buf = Buffer.alloc(0);
      sock.on('data', (d) => {
        buf = Buffer.concat([buf, d as Buffer]);
        const text = buf.toString('latin1');
        if (text.startsWith('zVERSION\0')) return sock.end('ClamAV 1.4.1/27431/Fri Oct  9 08:00:00 2026\0');
        if (!text.startsWith('zINSTREAM\0')) return;
        let at = 10;
        const parts: Buffer[] = [];
        while (at + 4 <= buf.length) {
          const len = buf.readUInt32BE(at);
          if (len === 0) {
            const file = Buffer.concat(parts);
            seen.push(file.length);
            return sock.end(file.includes('EICAR-NOVA-TEST') ? 'stream: Eicar-Test-Signature FOUND\0' : 'stream: OK\0');
          }
          if (at + 4 + len > buf.length) return;
          parts.push(buf.subarray(at + 4, at + 4 + len));
          at += 4 + len;
        }
      });
    });
    await new Promise<void>((r) => clam.listen(0, '127.0.0.1', r));
    env.clamav.host = '127.0.0.1';
    env.clamav.port = (clam.address() as AddressInfo).port;
    try {
      const big = Buffer.alloc(200 * 1024, 'a'); // several chunks
      const ok = await upload('Preise.txt', big, 'text/plain');
      expect(ok.status).toBe(200);
      expect(ok.data.media[0].scan).toMatchObject({ engine: 'clamav', version: 'ClamAV 1.4.1/27431' });
      expect(seen[seen.length - 1]).toBe(big.length);

      const n = await count();
      const bad = await upload('Rechnung.txt', 'Hallo EICAR-NOVA-TEST', 'text/plain');
      expect(bad.status).toBe(422);
      expect(bad.data.error).toBe('In der Datei wurde Schadsoftware gefunden (Eicar-Test-Signature). Sie wurde nicht gespeichert.');
      expect(await count()).toBe(n);
      await new Promise((r) => setTimeout(r, 50));
      const [notice] = await sql`select title, body from notifications where title like 'Upload abgelehnt%'`;
      expect(notice.title).toBe('Upload abgelehnt: Schadsoftware in «Rechnung.txt»');
      expect(notice.body).toContain('Eicar-Test-Signature');

      // Configured but down: nothing slips through unchecked.
      await new Promise((r) => clam.close(r));
      const down = await upload('Später.txt', 'Hallo', 'text/plain');
      expect(down.status).toBe(503);
      expect(await count()).toBe(n);
    } finally {
      env.clamav.host = '';
    }
  });

  it('adds Plausible, Matomo and Google Analytics – and asks first where cookies are involved', async () => {
    const anon = { cookies: new Map() };
    const patch = (analytics: unknown) => req('PATCH', '/api/settings', { analytics });
    expect((await patch({ ga4: { id: 'UA-12345-1' } })).status).toBe(400);
    expect((await patch({ matomo: { url: 'http://stats.example.ch', siteId: '1', cookies: false } })).status).toBe(400);
    expect((await patch({ plausible: { domain: 'kein domain', host: '' } })).status).toBe(400);

    // Plausible alone: no cookies, nothing to ask.
    const saved = await patch({ plausible: { domain: 'https://Gasthaus-Linde.ch/', host: '' } });
    expect(saved.data.settings.analytics.plausible.domain).toBe('gasthaus-linde.ch');
    let home = await req('GET', '/', undefined, anon);
    expect(home.data).toContain('<script type="application/json" id="nova-stats">');
    expect(home.data).toContain('"plausible":{"domain":"gasthaus-linde.ch","src":"https://plausible.io/js/script.js"}');
    expect(home.data).not.toContain('id="nova-consent"');
    expect(home.data).not.toContain('data-consent-open');
    expect(home.headers.get('content-security-policy')).toMatch(/script-src [^;]*https:\/\/plausible\.io/);

    // Google Analytics and Matomo with cookies: only after consent, with a way back in the footer.
    const both = await patch({ ga4: { id: 'g-abc123xyz' }, matomo: { url: 'https://stats.example.ch/matomo.php', siteId: '3', cookies: true } });
    expect(both.data.settings.analytics.ga4.id).toBe('G-ABC123XYZ');
    expect(both.data.settings.analytics.matomo.url).toBe('https://stats.example.ch');
    home = await req('GET', '/', undefined, anon);
    expect(home.data).toContain('"consent":["Google Analytics","Matomo"]');
    expect(home.data).toContain('Mit deiner Einwilligung nutzen wir Google Analytics und Matomo');
    expect(home.data).toMatch(/<section class="cbar" id="nova-consent"[^>]*hidden>/);
    expect(home.data).toContain('data-consent-no>Nein, danke</button><button type="button" class="btn" data-consent-yes>Einverstanden</button>');
    expect(home.data).toContain('data-consent-open>Statistik-Einstellungen</button>');
    // Nothing from Google in the HTML itself: the script is only added after «Einverstanden».
    expect(home.data).not.toContain('googletagmanager.com/gtag');
    const csp = home.headers.get('content-security-policy')!;
    expect(csp).toMatch(/script-src [^;]*https:\/\/www\.googletagmanager\.com/);
    expect(csp).toMatch(/connect-src [^;]*https:\/\/stats\.example\.ch/);
    expect(csp).toMatch(/connect-src [^;]*https:\/\/\*\.google-analytics\.com/);

    // The privacy policy says what runs.
    expect((await req('POST', '/api/legal/generate')).status).toBe(200);
    const [privacy] = await sql`select data from entries where collection = 'pages' and slug = 'datenschutz'`;
    const text = JSON.stringify(privacy.data);
    expect(text).toContain('Google Analytics 4 von Google Ireland Limited');
    expect(text).toContain('Matomo setzt dann Cookies');
    expect(text).toContain('Plausible setzt keine Cookies');
    expect(text).toContain('Cookies für Statistik (Google Analytics und Matomo) setzen wir nur mit deiner Einwilligung');

    await patch({ plausible: { domain: '', host: '' }, matomo: { url: '', siteId: '', cookies: false }, ga4: { id: '' } });
    home = await req('GET', '/', undefined, anon);
    expect(home.data).not.toContain('nova-stats');
  });

  it('searches with Meilisearch when it is there – typos included – and falls back to Postgres', async () => {
    const anon = { cookies: new Map() };
    const find = async (q: string) => (await req('GET', `/suche?q=${encodeURIComponent(q)}`, undefined, anon)).data as string;
    expect(await find('Kontackt')).toContain('Keine Treffer'); // Postgres needs the word as it is

    // A stand-in for Meilisearch: the endpoints Nova uses, with a search that forgives one wrong letter.
    const realFetch = globalThis.fetch;
    const docs = new Map<string, any>();
    const auth: string[] = [];
    let down = false;
    const lev = (a: string, b: string) => {
      const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
      for (let j = 1; j <= b.length; j++) m[0][j] = j;
      for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      return m[a.length][b.length];
    };
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const u = new URL(String(url));
      if (u.host !== 'meili.test') return realFetch(url, init);
      auth.push(String((init?.headers as Record<string, string>)?.Authorization));
      if (down) return new Response('{"message":"down"}', { status: 503 });
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      const ok = (x: unknown, status = 202) => new Response(JSON.stringify(x), { status });
      const path = u.pathname;
      if (path === '/indexes' || path.endsWith('/settings')) return ok({ taskUid: 1 });
      if (path === '/indexes/nova/documents' && init?.method === 'GET') return ok({ results: [...docs.keys()].map((id) => ({ id })) }, 200);
      if (path === '/indexes/nova/documents') {
        for (const d of body) docs.set(d.id, d);
        return ok({ taskUid: 2 });
      }
      if (path === '/indexes/nova/documents/delete-batch') {
        for (const id of body) docs.delete(id);
        return ok({ taskUid: 3 });
      }
      if (path === '/indexes/nova/search') {
        const lang = /lang = "(\w+)"/.exec(body.filter)![1];
        const words = (body.q as string).toLowerCase().split(/\s+/);
        const hits = [...docs.values()].filter(
          (d) => d.lang === lang && words.every((w) => `${d.title} ${d.text}`.toLowerCase().split(/[^\p{L}\d]+/u).some((x) => x.startsWith(w) || (w.length > 3 && lev(x, w) <= 1))),
        );
        return ok({ hits: hits.map((h) => ({ entry: h.entry })) }, 200);
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch;
    env.meili.host = 'http://meili.test';
    env.meili.key = 'master-key';
    try {
      startSearchSync();
      await searchIdle();
      expect(auth.every((a) => a === 'Bearer master-key')).toBe(true);
      const [kontakt] = await sql`select id from entries where collection = 'pages' and slug = 'kontakt'`;
      expect(docs.get(`${kontakt.id}-de`)).toMatchObject({ entry: kontakt.id, lang: 'de', collection: 'pages', title: 'Kontakt' });
      // Members-only: found by the title only, nothing of the text in the index.
      const [members] = await sql`select id from entries where data ->> 'title' = 'Nur für Mitglieder'`;
      expect(docs.get(`${members.id}-de`).text).toBe('');
      expect(await find('Kardamom')).toContain('Keine Treffer');
      expect((await req('GET', '/api/search/status')).data).toMatchObject({ engine: 'meilisearch', ok: true, documents: docs.size });

      // Typos are forgiven; what is shown still comes from the database.
      const hit = await find('Kontackt');
      expect(hit).toContain('1 Treffer');
      expect(hit).toContain('href="/kontakt">Kontakt</a>');

      // Changes reach the index on their own, shortly after publishing.
      const page = (await req('GET', `/api/entries/${kontakt.id}`)).data.entry;
      await req('PUT', `/api/entries/${kontakt.id}`, { data: { ...page.data, title: 'Kontakt und Anfahrt' }, baseVersion: page.version });
      await req('POST', `/api/entries/${kontakt.id}/publish`, {});
      await new Promise((r) => setTimeout(r, 1800));
      await searchIdle();
      expect(docs.get(`${kontakt.id}-de`).title).toBe('Kontakt und Anfahrt');
      await req('POST', `/api/entries/${kontakt.id}/unpublish`, {});
      await new Promise((r) => setTimeout(r, 1800));
      await searchIdle();
      expect(docs.has(`${kontakt.id}-de`)).toBe(false);
      await req('POST', `/api/entries/${kontakt.id}/publish`, {});

      // Meilisearch gone: the site keeps finding things through Postgres.
      down = true;
      expect(await find('Kontakt')).toContain('Treffer für');
      expect((await req('POST', '/api/search/rebuild')).status).toBe(502);
      expect((await req('GET', '/api/search/status')).data.ok).toBe(false);
      down = false;
      expect((await req('POST', '/api/search/rebuild')).data).toMatchObject({ ok: true });
    } finally {
      globalThis.fetch = realFetch;
      env.meili.host = '';
      const [k] = await sql`select data from entries where collection = 'pages' and slug = 'kontakt'`;
      if (k.data.title !== 'Kontakt') await sql`update entries set data = jsonb_set(data, '{title}', '"Kontakt"'), published_data = jsonb_set(published_data, '{title}', '"Kontakt"') where collection = 'pages' and slug = 'kontakt'`;
    }
  });

  it('connects the Google Search Console, submits the sitemap and shows the search numbers', async () => {
    expect((await req('GET', '/api/gsc')).data).toMatchObject({ configured: false, connected: false });
    expect((await req('POST', '/api/gsc/connect')).status).toBe(400);

    const settings = (await req('GET', '/api/settings')).data.settings;
    const base = (settings.baseUrl || env.publicUrl).replace(/\/$/, '');
    const own = `sc-domain:${new URL(base).hostname.replace(/^www\./, '')}`;
    const realFetch = globalThis.fetch;
    const calls: { url: string; method: string; auth?: string; body?: string }[] = [];
    let revoked = false;
    const jwt = (claims: object) => ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.');
    const reply = (body: unknown, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (!/googleapis\.com|accounts\.google\.com/.test(u)) return realFetch(url, init);
      calls.push({ url: u, method: init?.method ?? 'GET', auth: (init?.headers as Record<string, string>)?.Authorization, body: init?.body ? String(init.body) : undefined });
      if (u === 'https://oauth2.googleapis.com/token') {
        const p = new URLSearchParams(String(init?.body));
        expect(p.get('client_secret')).toBe('geheim');
        if (p.get('grant_type') === 'authorization_code' && p.get('code') === 'good-code')
          return reply({ access_token: 'at-1', expires_in: 3600, refresh_token: 'rt-1', id_token: jwt({ email: 'sandra@gmail.com' }) });
        if (p.get('grant_type') === 'refresh_token' && p.get('refresh_token') === 'rt-1' && !revoked) return reply({ access_token: 'at-2', expires_in: 3600 });
        return reply({ error: 'invalid_grant' }, 400);
      }
      if (u.startsWith('https://oauth2.googleapis.com/revoke')) return reply({});
      if (u === 'https://www.googleapis.com/webmasters/v3/sites')
        return reply({
          siteEntry: [
            { siteUrl: 'https://andere.ch/', permissionLevel: 'siteOwner' },
            { siteUrl: own, permissionLevel: 'siteFullUser' },
            { siteUrl: 'https://fremd.ch/', permissionLevel: 'siteUnverifiedUser' },
          ],
        });
      if (u.includes('/sitemaps/')) return reply(null, 204);
      if (u.endsWith('/searchAnalytics/query')) {
        const q = JSON.parse(String(init?.body));
        const dim = q.dimensions[0];
        if (!dim) return reply({ rows: [{ clicks: 42, impressions: 1300, ctr: 0.0323, position: 8.44 }] });
        if (dim === 'query') return reply({ rows: [{ keys: ['gasthaus linde'], clicks: 30, impressions: 200, ctr: 0.15, position: 1.2 }] });
        if (dim === 'page') return reply({ rows: [{ keys: [`${base}/kontakt`], clicks: 12, impressions: 300, ctr: 0.04, position: 5 }] });
        return reply({ rows: [{ keys: ['2026-10-01'], clicks: 3, impressions: 90, ctr: 0.03, position: 9 }] });
      }
      return reply({}, 404);
    }) as typeof fetch;
    env.google.clientId = 'nova.apps.googleusercontent.com';
    env.google.clientSecret = 'geheim';
    try {
      const start = await req('POST', '/api/gsc/connect');
      const auth = new URL(start.data.url);
      expect(auth.origin + auth.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
      expect(auth.searchParams.get('redirect_uri')).toBe(`${env.publicUrl.replace(/\/$/, '')}/api/gsc/callback`);
      expect(auth.searchParams.get('access_type')).toBe('offline');
      expect(auth.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/webmasters');
      const state = auth.searchParams.get('state')!;

      // Back from Google: tokens, the matching property, the sitemap.
      const back = await req('GET', `/api/gsc/callback?code=good-code&state=${state}`);
      expect(back.status).toBe(302);
      expect(back.headers.get('location')).toBe('/admin/einstellungen/seo?gsc=verbunden');
      const status = (await req('GET', '/api/gsc')).data;
      expect(status).toMatchObject({ connected: true, email: 'sandra@gmail.com', site: own, sites: ['https://andere.ch/', own] });
      expect(status.sitemapAt).toBeTruthy();
      const sitemapCall = calls.find((c) => c.url.includes('/sitemaps/'))!;
      expect(sitemapCall.method).toBe('PUT');
      expect(decodeURIComponent(sitemapCall.url)).toContain(`/sites/${own}/sitemaps/${base}/sitemap.xml`);

      // The token is stored encrypted and never leaves through the settings.
      const [row] = await sql`select value from settings where key = 'gsc'`;
      expect(JSON.stringify(row.value)).not.toContain('rt-1');
      expect(JSON.stringify((await req('GET', '/api/settings')).data)).not.toContain('rt-1');

      // Numbers for the statistics, own pages as paths.
      const report = (await req('GET', '/api/gsc/report?days=28')).data.report;
      expect(report.totals).toEqual({ clicks: 42, impressions: 1300, ctr: 3.2, position: 8.4 });
      expect(report.queries[0]).toMatchObject({ query: 'gasthaus linde', clicks: 30 });
      expect(report.pages[0]).toMatchObject({ page: '/kontakt', clicks: 12 });
      expect(calls.filter((c) => c.url.endsWith('/searchAnalytics/query')).every((c) => c.auth?.startsWith('Bearer at-'))).toBe(true);

      // Another property of the same account – but not someone else's.
      expect((await req('POST', '/api/gsc/site', { site: 'https://fremd.ch/' })).status).toBe(400);
      expect((await req('POST', '/api/gsc/site', { site: 'https://andere.ch/' })).data.site).toBe('https://andere.ch/');

      // A forged answer from «Google» does nothing.
      await req('POST', '/api/gsc/connect');
      const forged = await req('GET', '/api/gsc/callback?code=good-code&state=falsch');
      expect(forged.headers.get('location')).toBe('/admin/einstellungen/seo?gsc=abgelehnt');

      // Access withdrawn at Google: a clear message.
      revoked = true;
      const gone = await req('GET', '/api/gsc/report?days=7');
      expect(gone.status).toBe(409);
      expect(gone.data.error).toContain('Verbinde die Search Console bitte neu');
      revoked = false;

      // Only for those who may change the settings.
      const ina = new Map<string, string>();
      const pw = (await req('POST', '/api/users', { email: 'gsc-autor@example.ch', name: 'Gina', role: 'author' })).data.temporaryPassword;
      await req('POST', '/api/login', { email: 'gsc-autor@example.ch', password: pw }, { cookies: ina });
      expect((await req('GET', '/api/gsc', undefined, { cookies: ina })).status).toBe(403);

      expect((await req('DELETE', '/api/gsc')).data.connected).toBe(false);
      expect(calls.some((c) => c.url.startsWith('https://oauth2.googleapis.com/revoke?token=rt-1'))).toBe(true);
    } finally {
      globalThis.fetch = realFetch;
      env.google.clientId = '';
      env.google.clientSecret = '';
    }
  });

  it('keeps the heading outline without jumps: cards under the page title are h2, under a section heading h3', async () => {
    const anon = { cookies: new Map() };
    const list = (await req('GET', '/journal', undefined, anon)).data as string;
    expect(list).toMatch(/<h1>[^<]*<\/h1>/);
    expect(list).toContain('<h2 class="hi">');
    expect(list).not.toContain('<h3 class="hi">');

    const [page] = await sql`select id, data from entries where collection = 'pages' and slug = 'kontakt'`;
    const block = (heading: string) => ({ id: 'p1', type: 'posts', props: { heading, layout: 'list', count: 3 }, style: {}, lock: 'none' });
    const render = async (heading: string) =>
      (await req('POST', '/api/render', { entryId: page.id, data: { ...page.data, blocks: [{ id: 't1', type: 'text', props: { heading: 'Kontakt', body: '<p>Hallo</p>' } }, block(heading)] } })).data.html as string;
    const withHeading = await render('Neu im Journal');
    expect(withHeading).toContain('Neu im Journal</h2>');
    expect(withHeading).toContain('<h3 class="hi">');
    // On the website, a block without its own heading puts its items right under the page title.
    const created = await req('POST', '/api/entries', {
      collection: 'pages',
      data: { title: 'Neuigkeiten', blocks: [{ id: 'h1', type: 'hero', props: { variant: 'statement', title: 'Neuigkeiten', text: '' } }, block('')] },
    });
    await req('POST', `/api/entries/${created.data.entry.id}/publish`, {});
    const without = (await req('GET', `/${created.data.entry.slug}`, undefined, anon)).data as string;
    expect(without).toContain('<h2 class="hi">');
    expect(without).not.toContain('<h3 class="hi">');
  });

  it('shows notices only in their time window and turns tables into labelled cells', async () => {
    const anon = { cookies: new Map() };
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const notice = (text: string, from: string, until: string) => ({ id: Math.random().toString(36).slice(2, 10), type: 'notice', props: { text, tone: 'accent', from, until } });
    const created = await req('POST', '/api/entries', {
      collection: 'pages',
      data: {
        title: 'Hinweise',
        blocks: [
          { id: 'h1', type: 'hero', props: { variant: 'statement', title: 'Hinweise', text: '' } },
          notice('Vorbei', day(-10), day(-2)),
          notice('Jetzt', day(-1), day(1)),
          notice('Bald', day(3), ''),
          { id: 'tb', type: 'table', props: { heading: 'Preise', h1: 'Leistung', h2: 'Preis', h3: '', h4: '', right: true, note: '', rows: [{ a: 'Haarschnitt', b: '68.–' }] } },
        ],
      },
    });
    await req('POST', `/api/entries/${created.data.entry.id}/publish`, {});
    const html = (await req('GET', `/${created.data.entry.slug}`, undefined, anon)).data as string;
    expect(html).toContain('>Jetzt</p>');
    expect(html).not.toContain('>Vorbei</p>');
    expect(html).not.toContain('>Bald</p>');
    expect(html).toContain('<th scope="row">Haarschnitt</th><td class="num" data-label="Preis">68.–</td>');
    expect(html.slice(html.indexOf('<table'))).not.toContain('data-label=""');
    // The page carries the CSS of its blocks, not that of the shop or the booking calendar.
    const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
    expect(css).toContain('.tbl');
    expect(css).not.toContain('.bk-step');
    expect(css).not.toContain('.cart-table');
    expect(css.length).toBeLessThan(60_000);
  });

  it('checks the age with the Swiss e-ID through an own swiyu verifier – and shows nothing before', async () => {
    const anon = { cookies: new Map<string, string>() };
    expect((await req('PATCH', '/api/settings', { ageGate: { enabled: true, minAge: 18, method: 'eid' } })).status).toBe(200);
    // Without a verifier the e-ID cannot be chosen in practice: the gate stays a click.
    expect((await req('GET', '/api/settings')).data.system.eid).toBe(false);
    expect((await req('GET', '/', undefined, anon)).data).toContain('name="ok" value="1"');

    // A stand-in for the swiyu Generic Verifier's management API.
    const realFetch = globalThis.fetch;
    const created: { body: any; auth: string }[] = [];
    let state: Record<string, unknown> = { state: 'PENDING' };
    Object.assign(env.eid, { verifierUrl: 'https://verifier.test', token: 'tok', issuers: ['did:tdw:issuer'], vct: ['betaid-sdjwt'] });
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (!u.startsWith('https://verifier.test/')) return realFetch(url, init);
      const auth = (init?.headers as Record<string, string>).Authorization;
      if (init?.method === 'POST' && u === 'https://verifier.test/management/api/verifications') {
        created.push({ body: JSON.parse(String(init.body)), auth });
        const id = `ver-${created.length}-abcdef`;
        return Response.json({ id, request_nonce: 'n', state: 'PENDING', verification_url: 'https://verifier.test/x', verification_deeplink: `swiyu-verify://?client_id=did%3Atdw%3Av&request_uri=https%3A%2F%2Fverifier.test%2Foid4vp%2F${id}` });
      }
      if (u.startsWith('https://verifier.test/management/api/verifications/')) return Response.json({ id: u.split('/').pop(), ...state });
      return new Response('nope', { status: 404 });
    }) as typeof fetch;
    try {
      expect((await req('GET', '/api/settings')).data.system.eid).toBe(true);
      const gated = (await req('GET', '/', undefined, anon)).data as string;
      expect(gated).toContain('data-age-eid');
      expect(gated).toContain('<main id="inhalt"></main>');
      expect(gated).not.toContain('name="ok" value="1"');
      // A click proves nothing any more, and neither feed nor API hand out content.
      await req('POST', '/_nova/age', undefined, { ...anon, form: { ok: '1', back: '/' } });
      expect(anon.cookies.has('nova_age')).toBe(false);
      expect((await req('GET', '/api/v1/pages', undefined, anon)).status).toBe(403);
      // Pictures are content too – only the logo stays public.
      const [pic] = await sql`select id, version from media where mime like 'image/%' and not private limit 1`;
      const picUrl = `/media/${pic.id}/v${pic.version}/320.webp`;
      expect((await req('GET', picUrl, undefined, anon)).status).toBe(403);
      expect((await req('GET', picUrl)).status).not.toBe(403);

      // Step 1: a request for «age_over_18 = true» from the accepted issuer, as QR code.
      const start = await req('POST', '/_nova/age/eid', undefined, anon);
      expect(start.data.state).toBe('pending');
      expect(start.data.qr).toContain('<svg');
      expect(start.data.deeplink).toMatch(/^swiyu-verify:\/\//);
      expect(created[0].auth).toBe('Bearer tok');
      expect(created[0].body).toMatchObject({ accepted_issuer_dids: ['did:tdw:issuer'], response_mode: 'direct_post.jwt' });
      expect(created[0].body.dcql_query.credentials[0]).toMatchObject({ format: 'dc+sd-jwt', meta: { vct_values: ['betaid-sdjwt'] }, claims: [{ path: ['age_over_18'], values: [true] }] });
      expect((await req('GET', '/_nova/age/eid', undefined, anon)).data.state).toBe('pending');

      // Only a disclosed «true» counts.
      state = { state: 'SUCCESS', wallet_response: { credential_subject_data: { age: [{ age_over_18: false }] } } };
      expect((await req('GET', '/_nova/age/eid', undefined, anon)).data.state).toBe('young');
      expect(anon.cookies.get('nova_age') ?? '').toBe('');
      expect((await req('GET', '/_nova/age/eid', undefined, anon)).data.state).toBe('expired');

      // Turned down in the wallet.
      await req('POST', '/_nova/age/eid', undefined, anon);
      state = { state: 'FAILED', wallet_response: { error_code: 'client_rejected' } };
      expect((await req('GET', '/_nova/age/eid', undefined, anon)).data.state).toBe('failed');

      // A verifier that keeps the answer to itself is a setup error, not a pass.
      await req('POST', '/_nova/age/eid', undefined, anon);
      state = { state: 'SUCCESS', wallet_response: {} };
      expect((await req('GET', '/_nova/age/eid', undefined, anon)).status).toBe(502);

      // Confirmed: the cookie says «checked for 18», the page shows its content.
      state = { state: 'SUCCESS', wallet_response: { credential_subject_data: { age: [{ age_over_18: true }] } } };
      expect((await req('GET', '/_nova/age/eid', undefined, anon)).data.state).toBe('ok');
      const open = (await req('GET', '/', undefined, anon)).data as string;
      expect(open).not.toContain('data-age-eid');
      expect(open).not.toContain('<main id="inhalt"></main>');
      const pic2 = await req('GET', picUrl, undefined, anon);
      expect(pic2.status).not.toBe(403);
      expect(pic2.headers.get('cache-control')).toBe('private, max-age=3000');

      // Raising the limit to 20 asks again – now for the birth date.
      await req('PATCH', '/api/settings', { ageGate: { enabled: true, minAge: 20, method: 'eid' } });
      expect((await req('GET', '/', undefined, anon)).data).toContain('data-age-eid');
      await req('POST', '/_nova/age/eid', undefined, anon);
      expect(created.at(-1)!.body.dcql_query.credentials[0].claims).toEqual([{ path: ['birth_date'] }]);
      state = { state: 'SUCCESS', wallet_response: { credential_subject_data: { age: [{ birth_date: '1990-02-01' }] } } };
      expect((await req('GET', '/_nova/age/eid', undefined, anon)).data.state).toBe('ok');
      expect((await req('GET', '/', undefined, anon)).data).not.toContain('data-age-eid');

      // The privacy policy says what happens.
      const legal = await req('POST', '/api/legal/generate', {});
      const ds = legal.data.pages.find((x: { slug: string }) => x.slug === 'datenschutz');
      expect(JSON.stringify((await req('GET', `/api/entries/${ds.id}`)).data.entry.data)).toContain('Altersprüfung mit der E-ID');
    } finally {
      globalThis.fetch = realFetch;
      Object.assign(env.eid, { verifierUrl: '', token: '', issuers: [], vct: ['betaid-sdjwt'] });
      await req('PATCH', '/api/settings', { ageGate: { enabled: false, minAge: 18, method: 'self' } });
    }
  });

  it('installs extensions from the Marktplatz, takes back exactly what they added and trusts only signed catalogues', async () => {
    const list = await req('GET', '/api/extensions');
    expect(list.status).toBe(200);
    expect(list.data.catalogue.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining(['rezepte', 'stellen', 'link-spam', 'schweizer-schreibweise', 'gastro-sektionen']));

    // Rezepte: a content type with its own address; groups show as list and steps.
    expect((await req('POST', '/api/extensions/rezepte/install')).status).toBe(200);
    expect((await req('POST', '/api/extensions/rezepte/install')).status).toBe(400);
    const recipe = await req('POST', '/api/entries', {
      collection: 'rezepte',
      data: { title: 'Zürcher Geschnetzeltes', servings: 4, ingredients: [{ amount: '600 g', item: 'Kalbfleisch' }, { amount: '2 dl', item: 'Rahm' }], steps: [{ text: 'Fleisch scharf anbraten.' }, { text: 'Mit Rahm ablöschen.' }] },
    });
    expect(recipe.status).toBe(200);
    await req('POST', `/api/entries/${recipe.data.entry.id}/publish`, {});
    const page = (await req('GET', `/rezepte/${recipe.data.entry.slug}`)).data as string;
    expect(page).toContain('<li>600 g Kalbfleisch</li>');
    expect(page).toContain('<ol><li><p>Fleisch scharf anbraten.</p></li>');

    // Stellen: hook and form come along – and go again.
    await req('POST', '/api/extensions/stellen/install');
    const settings = (await req('GET', '/api/settings')).data.settings;
    expect(settings.hooks.find((h: { ext?: string }) => h.ext === 'stellen')).toMatchObject({ event: 'entry.beforePublish', collection: 'stellen', active: true });
    const job = await req('POST', '/api/entries', { collection: 'stellen', data: { title: 'Koch/Köchin' } });
    const refused = await req('POST', `/api/entries/${job.data.entry.id}/publish`, {});
    expect(refused.data.error).toMatch(/Pensum/);
    expect((await sql`select 1 from forms where name = 'Bewerbung'`).length).toBe(1);
    await req('DELETE', `/api/entries/${job.data.entry.id}`);
    const gone = await req('DELETE', '/api/extensions/stellen');
    expect(gone.data.removed).toEqual(expect.arrayContaining(['Inhaltstyp «Stellen»', 'Formular «Bewerbung»']));
    expect(gone.data.kept).toEqual([]);
    expect((await req('GET', '/api/settings')).data.settings.hooks.some((h: { ext?: string }) => h.ext === 'stellen')).toBe(false);
    expect((await sql`select 1 from forms where name = 'Bewerbung'`).length).toBe(0);

    // What people wrote stays: removing Rezepte keeps the content type with its entry.
    const kept = await req('DELETE', '/api/extensions/rezepte');
    expect(kept.data.kept).toEqual(['Inhaltstyp «Rezepte» mit 1 Eintrag']);
    expect((await req('GET', `/rezepte/${recipe.data.entry.slug}`)).status).toBe(200);

    // Swiss spelling while saving.
    await req('POST', '/api/extensions/schweizer-schreibweise/install');
    const greeting = await req('POST', '/api/entries', { collection: 'pages', data: { title: 'Grüße aus der Straße', blocks: [{ id: 'x1', type: 'text', props: { heading: 'Gruß', body: '<p>Maß halten.</p>' } }] } });
    expect(greeting.data.entry.data.title).toBe('Grüsse aus der Strasse');
    expect(greeting.data.entry.data.blocks[0].props).toMatchObject({ heading: 'Gruss', body: '<p>Mass halten.</p>' });
    await req('DELETE', '/api/extensions/schweizer-schreibweise');

    // Link spam goes quietly.
    await req('POST', '/api/extensions/link-spam/install');
    const [form] = await sql`select id from forms where name = 'Kontakt'`;
    const send = (nachricht: string) =>
      req('POST', `/_nova/forms/${form.id}`, undefined, {
        cookies: new Map(),
        headers: { Accept: 'application/json', 'X-Forwarded-For': '203.0.113.42' },
        form: { _t: (Date.now() - 5000).toString(36), name: 'Max', e_mail: 'x@example.ch', nachricht },
      });
    const before = (await sql`select count(*)::int as n from submissions`)[0].n;
    expect((await send('Super Angebot https://a.example https://b.example www.c.example')).data.ok).toBe(true);
    expect((await sql`select count(*)::int as n from submissions`)[0].n).toBe(before);
    expect((await send('Gibt es am Samstag noch einen Tisch? Siehe https://example.ch/menu')).data.ok).toBe(true);
    expect((await sql`select count(*)::int as n from submissions`)[0].n).toBe(before + 1);
    await req('DELETE', '/api/extensions/link-spam');

    // Sections in use stay when the extension goes.
    await req('POST', '/api/extensions/gastro-sektionen/install');
    const [ferien] = await sql`select id from entries where collection = 'sections' and data ->> 'title' = 'Betriebsferien'`;
    await req('POST', '/api/entries', { collection: 'pages', data: { title: 'Mit Ferienhinweis', blocks: [{ id: 's1', type: 'section', props: { section: ferien.id } }] } });
    const sections = await req('DELETE', '/api/extensions/gastro-sektionen');
    expect(sections.data.kept).toEqual(['Sektion «Betriebsferien», auf 1 Seite eingesetzt']);
    expect(sections.data.removed).toEqual(['Sektion «Mittagsmenü»', 'Sektion «Reservation empfohlen»']);

    // An own catalogue counts only with a valid signature.
    const { generateKeyPairSync, sign } = await import('node:crypto');
    const keys = generateKeyPairSync('ed25519');
    const manifest = { id: 'rahmen', name: 'Feiner Rahmen', version: '1.0.0', summary: 'Ein Rahmen um Bilder.', description: '', author: 'Agentur Muster', license: 'MIT', category: 'gestaltung', provides: { css: '.fig img{outline:1px solid var(--line)}' } };
    let catalogue = JSON.stringify([manifest]);
    let signature = sign(null, Buffer.from(catalogue), keys.privateKey).toString('base64');
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) =>
      String(url) === 'https://katalog.test/nova.json' ? Response.json({ extensions: catalogue, signature }) : realFetch(url, init)) as typeof fetch;
    Object.assign(env.extensions, { url: 'https://katalog.test/nova.json', key: keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64') });
    try {
      await req('POST', '/api/extensions/refresh');
      const withOwn = await req('GET', '/api/extensions');
      expect(withOwn.data.catalogue.find((x: { id: string }) => x.id === 'rahmen')).toMatchObject({ source: 'katalog', effects: [{ kind: 'css' }] });
      await req('POST', '/api/extensions/rahmen/install');
      expect((await req('GET', '/', undefined, { cookies: new Map() })).data).toContain('.fig img{outline:1px solid var(--line)}');
      // Newer version: CSS replaced, nothing doubled.
      catalogue = JSON.stringify([{ ...manifest, version: '1.1.0', provides: { css: '.fig img{outline:2px solid var(--accent)}' } }]);
      signature = sign(null, Buffer.from(catalogue), keys.privateKey).toString('base64');
      await req('POST', '/api/extensions/refresh');
      expect((await req('GET', '/api/extensions')).data.catalogue.find((x: { id: string }) => x.id === 'rahmen').update).toBe('1.1.0');
      expect((await req('POST', '/api/extensions/rahmen/update')).status).toBe(200);
      const home = (await req('GET', '/', undefined, { cookies: new Map() })).data as string;
      expect(home).toContain('.fig img{outline:2px solid var(--accent)}');
      expect(home).not.toContain('.fig img{outline:1px');
      // Tampered: the catalogue disappears, with a reason.
      catalogue = catalogue.replace('Feiner', 'Böser');
      await req('POST', '/api/extensions/refresh');
      const tampered = await req('GET', '/api/extensions');
      expect(tampered.data.error).toMatch(/Signatur/);
      expect(tampered.data.catalogue.some((x: { id: string }) => x.id === 'rahmen')).toBe(false);
      // Still installed, so it can still be removed.
      expect(tampered.data.orphans.map((x: { id: string }) => x.id)).toEqual(['rahmen']);
      const removed = await req('DELETE', '/api/extensions/rahmen');
      expect(removed.status, JSON.stringify(removed.data)).toBe(200);
      expect((await req('GET', '/api/settings')).data.settings.extensionCss).toEqual([]);
      expect((await req('GET', '/', undefined, { cookies: new Map() })).data).not.toContain('.fig img{outline');
    } finally {
      globalThis.fetch = realFetch;
      Object.assign(env.extensions, { url: '', key: '' });
      await req('POST', '/api/extensions/refresh');
    }
  });

  it('adds own fields to built-in content types – in the form, the API and on the page – and keeps them through updates', async () => {
    const posts = (await req('GET', '/api/collections')).data.collections.find((c: { id: string }) => c.id === 'posts');
    const builtinKeys = posts.fields.map((f: { key: string }) => f.key);
    // Nova's own fields stay fixed.
    expect((await req('PUT', '/api/collections/posts', { fields: [{ key: 'title', type: 'text', label: 'Titel' }] })).status).toBe(400);
    expect((await req('PUT', '/api/collections/posts', { custom_fields: [{ key: 'title', type: 'text', label: 'Doppelt' }] })).data.error).toMatch(/doppelt/);
    const saved = await req('PUT', '/api/collections/posts', {
      custom_fields: [
        { key: 'quelle', type: 'text', label: 'Quelle' },
        { key: 'gesponsert', type: 'boolean', label: 'Gesponsert' },
      ],
    });
    expect(saved.status, JSON.stringify(saved.data)).toBe(200);
    expect(saved.data.collection.fields.map((f: { key: string }) => f.key)).toEqual([...builtinKeys, 'quelle', 'gesponsert']);
    // A Nova update re-syncs the built-in fields – the own ones stay.
    await syncBuiltinCollections();
    invalidateCollections();
    const post = await req('POST', '/api/entries', { collection: 'posts', data: { title: 'Mit Quelle', quelle: 'Schweizer Bauer, 3. Mai', gesponsert: true } });
    expect(post.status).toBe(200);
    expect(post.data.entry.data.quelle).toBe('Schweizer Bauer, 3. Mai');
    await req('POST', `/api/entries/${post.data.entry.id}/publish`, {});
    const page = (await req('GET', `/journal/${post.data.entry.slug}`, undefined, { cookies: new Map() })).data as string;
    expect(page).toContain('<span class="label">Quelle</span><br>Schweizer Bauer, 3. Mai');
    expect(page).toContain('<span class="label">Gesponsert</span>');
    const api = await req('GET', `/api/v1/posts/${post.data.entry.slug}`, undefined, { cookies: new Map() });
    expect(api.data.data.data.quelle).toBe('Schweizer Bauer, 3. Mai');

    // Dishes: short own values join the line under the dish on the menu.
    await req('PUT', '/api/collections/dishes', { custom_fields: [{ key: 'herkunft', type: 'text', label: 'Herkunft Fleisch' }] });
    const first = (await req('GET', '/api/entries?collection=dishes&status=published&limit=1')).data.entries[0];
    const dish = (await req('GET', `/api/entries/${first.id}`)).data.entry;
    expect((await req('PUT', `/api/entries/${dish.id}`, { data: { ...dish.data, herkunft: 'Thurgau' } })).status).toBe(200);
    await req('POST', `/api/entries/${dish.id}/publish`, {});
    expect((await req('GET', '/karte', undefined, { cookies: new Map() })).data).toContain('Herkunft Fleisch: Thurgau');
    await req('PUT', '/api/collections/posts', { custom_fields: [] });
    await req('PUT', '/api/collections/dishes', { custom_fields: [] });
  });

  it('renders the visual design of a block scoped to it, per screen size and on hover', async () => {
    const design = {
      desktop: { pt: '$s-7', bg: '$surface', radius: '24px', color: 'red;}body{display:none' },
      mobile: { pt: '1rem', textAlign: 'center' },
      hover: { y: '-4px', shadow: 'l' },
    };
    const page = await req('POST', '/api/entries', {
      collection: 'pages',
      data: { title: 'Gestaltet', blocks: [{ id: 'dsg1', type: 'text', props: { heading: 'Hallo', body: '<p>Text</p>' }, style: { design } }] },
    });
    expect(page.status).toBe(200);
    await req('POST', `/api/entries/${page.data.entry.id}/publish`, {});
    const html = (await req('GET', `/${page.data.entry.slug}`, undefined, { cookies: new Map() })).data as string;
    const css = /<style data-nova-design="dsg1">([^<]*)<\/style>/.exec(html)?.[1] ?? '';
    expect(css).toContain('#b-dsg1{padding-top:var(--s-7)');
    expect(css).toContain('border-radius:24px');
    expect(css).toContain('@media (max-width:40rem){#b-dsg1{padding-top:1rem;text-align:center}}');
    expect(css).toContain('@media (hover:hover){#b-dsg1:hover{');
    expect(css).not.toContain('body');
    // The editor's preview renders the forced-hover rule too; the public page doesn't need it.
    expect(css).not.toContain('nova-hover');
    const preview = await req('POST', '/api/render', { entryId: page.data.entry.id, data: page.data.entry.data, blockId: 'dsg1' });
    expect(preview.data.html).toContain('#b-dsg1.nova-hover{');
    // No animation, no animation code on the page.
    expect(html).not.toContain('data-anim');
    expect(html).not.toContain('nova-show');
  });

  it('animates blocks on the page – with a way out when JavaScript is missing', async () => {
    const page = await req('POST', '/api/entries', {
      collection: 'pages',
      data: { title: 'Bewegt', blocks: [{ id: 'mot1', type: 'text', props: { heading: 'Hallo', body: '<p>Text</p>' }, style: { motion: { enter: 'up', stagger: 80, duration: 900, itemHover: 'lift' } } }] },
    });
    await req('POST', `/api/entries/${page.data.entry.id}/publish`, {});
    const html = (await req('GET', `/${page.data.entry.slug}`, undefined, { cookies: new Map() })).data as string;
    expect(html).toContain('data-anim="up" data-anim-items="80" data-hover="lift"');
    expect(html).toContain('#b-mot1{--anim-dur:900ms');
    expect(html).toContain('animation:nova-show 0s 4s forwards');
    expect(html).toContain('<noscript><style>[data-anim]>*,[data-self]{opacity:1!important');
    expect(html).toContain('/_nova/site.js');
  });

  it('builds free layouts from elements – cleaned on save, escaped on the page, editable in the editor', async () => {
    const els = [
      {
        id: 'row1',
        kind: 'box',
        props: { tag: 'section' },
        design: { desktop: { display: 'flex', direction: 'row', gap: '$s-6' }, mobile: { direction: 'column' } },
        motion: { enter: 'up', stagger: 60 },
        children: [
          { id: 'h1x', kind: 'heading', props: { text: 'Gross <b>& klar</b>', level: '1' } },
          { id: 'tx', kind: 'text', props: { html: '<p>Hallo <a href="javascript:alert(1)">Welt</a></p><script>alert(1)</script>' } },
          { id: 'bt', kind: 'button', props: { label: 'Los', href: '/kontakt', variant: 'secondary' } },
          { id: 'ic', kind: 'icon', props: { icon: 'star', size: 64 }, motion: { loop: 'float' } },
        ],
      },
    ];
    const page = await req('POST', '/api/entries', { collection: 'pages', data: { title: 'Frei', blocks: [{ id: 'lay1', type: 'layout', props: { width: 'content', els } }] } });
    expect(page.status).toBe(200);
    const saved = page.data.entry.data.blocks[0].props.els[0].children;
    expect(saved[1].props.html).not.toMatch(/javascript|script/);
    await req('POST', `/api/entries/${page.data.entry.id}/publish`, {});
    const html = (await req('GET', `/${page.data.entry.slug}`, undefined, { cookies: new Map() })).data as string;
    expect(html).toContain('<section class="el el-box e-row1" id="e-row1" data-anim="up" data-anim-items="60" data-self>');
    expect(html).toContain('<h1 class="el el-heading e-h1x" id="e-h1x">Gross &lt;b&gt;&amp; klar&lt;/b&gt;</h1>');
    expect(html).toContain('<a class="el el-button e-bt btn-2" href="/kontakt" id="e-bt"><span>Los</span></a>');
    expect(html).toContain('data-loop="float"');
    expect(html).toContain(':is(#e-row1,.e-row1){display:flex;flex-direction:row;gap:var(--s-6)}');
    expect(html).toContain('@media (max-width:40rem){:is(#e-row1,.e-row1){flex-direction:column}}');
    expect(html).toContain(':is(#e-ic,.e-ic){--isz:64px}');
    expect(html).not.toContain('data-nova-el');
    // Only one h1: the layout brings its own, the page doesn't add a second.
    expect(html.match(/<h1/g)?.length).toBe(1);
    // In the editor every element is selectable and its text editable in place.
    const canvas = await req('POST', '/api/render', { entryId: page.data.entry.id, data: page.data.entry.data, blockId: 'lay1' });
    expect(canvas.data.html).toContain('data-nova-el="h1x"');
    expect(canvas.data.html).toContain('data-nova-field="els.0.children.0.props.text"');
    const search = await req('GET', `/api/v1/pages/${page.data.entry.slug}`, undefined, { cookies: new Map() });
    expect(search.status).toBe(200);
  });

  it('fills a free layout with CMS entries – bound fields, paywall kept, one copy to design in the editor', async () => {
    await req('PUT', '/api/collections/posts', { custom_fields: [{ key: 'quelle', type: 'text', label: 'Quelle' }] });
    const post = (title: string, extra: Record<string, unknown> = {}) =>
      req('POST', '/api/entries', { collection: 'posts', data: { title, category: 'Werkstatt', ...extra } }).then((r) =>
        req('POST', `/api/entries/${r.data.entry.id}/publish`, {}).then(() => r.data.entry),
      );
    const open = await post('Hobel <& Säge>', { excerpt: 'Alles über Holz.', quelle: 'Holzfachbuch' });
    await post('Nur drinnen', { excerpt: 'Ein Blick in die Werkstatt.', access: 'members', quelle: 'Geheimes Notizbuch' });
    const card = {
      id: 'card',
      kind: 'box',
      props: {},
      bind: { href: 'url' },
      children: [
        { id: 'ti', kind: 'heading', props: { text: 'Platzhalter', level: '3' }, bind: { text: 'title' } },
        { id: 'ex', kind: 'text', props: { html: '<p>x</p>' }, bind: { html: 'field:excerpt' } },
        { id: 'qu', kind: 'text', props: { html: '<p>y</p>' }, bind: { html: 'field:quelle' } },
      ],
    };
    const els = [{ id: 'li', kind: 'list', props: { collection: 'posts', limit: 5, sort: 'title', category: 'werkstatt' }, children: [card] }];
    const page = await req('POST', '/api/entries', { collection: 'pages', data: { title: 'Werkstatt-Liste', blocks: [{ id: 'lay2', type: 'layout', props: { els } }] } });
    expect(page.status).toBe(200);
    await req('POST', `/api/entries/${page.data.entry.id}/publish`, {});
    const html = (await req('GET', `/${page.data.entry.slug}`, undefined, { cookies: new Map() })).data as string;
    // Sorted by title, only the category, links to each entry, text escaped.
    expect(html.match(/class="el el-box e-card"/g)?.length).toBe(2);
    expect(html.indexOf('Hobel &lt;&amp; Säge&gt;')).toBeLessThan(html.indexOf('Nur drinnen'));
    expect(html).toContain(`href="/journal/${open.slug}"`);
    expect(html).toContain('Alles über Holz.');
    expect(html).toContain('Holzfachbuch');
    expect(html).not.toContain('Platzhalter');
    // Members-only entries show what their paywall shows – not the rest.
    expect(html).toContain('Ein Blick in die Werkstatt.');
    expect(html).not.toContain('Geheimes Notizbuch');
    expect(html).not.toContain('id="e-ti"');
    // In the editor the first entry is the one you design, the others follow as copies.
    const canvas = await req('POST', '/api/render', { entryId: page.data.entry.id, data: page.data.entry.data, blockId: 'lay2' });
    expect(canvas.data.html).toContain('data-nova-el="ti"');
    expect(canvas.data.html.match(/data-nova-el="ti"/g)?.length).toBe(1);
    expect(canvas.data.html).toContain('data-nova-ghost');
    await req('PUT', '/api/collections/posts', { custom_fields: [] });
  });

  it('draws counters, accordions, tabs, sliders and marquees – working without JavaScript, editable in the editor', async () => {
    const box = (id: string, name: string, kids: unknown[]) => ({ id, kind: 'box', props: {}, name, children: kids });
    const els = [
      { id: 'cn', kind: 'counter', props: { value: 1200.5, prefix: '', suffix: '+', duration: 2 } },
      {
        id: 'ac',
        kind: 'accordion',
        props: { single: true, first: false, faq: true },
        children: [
          box('q1', 'Frage', [
            { id: 'q1h', kind: 'heading', props: { text: 'Gibt es Parkplätze?', level: '3' } },
            { id: 'q1a', kind: 'text', props: { html: '<p>Ja, zwölf <b>gratis</b>.</p>' } },
          ]),
        ],
      },
      {
        id: 'tb',
        kind: 'tabs',
        props: { style: 'pill' },
        children: [
          box('t1', 'Mittag <&>', [{ id: 't1h', kind: 'heading', props: { text: 'Mittag', level: '3' } }]),
          box('t2', '', [{ id: 't2h', kind: 'heading', props: { text: 'Abend', level: '3' } }]),
        ],
      },
      { id: 'sl', kind: 'slider', props: { perView: 3, autoplay: 5, arrows: true, dots: true }, children: [box('s1', 'Folie 1', []), box('s2', 'Folie 2', [])] },
      { id: 'mq', kind: 'marquee', props: { speed: 'fast', direction: 'right', pause: true }, children: [{ id: 'mw', kind: 'text', props: { html: '<p>Regional</p>' } }] },
    ];
    const page = await req('POST', '/api/entries', { collection: 'pages', data: { title: 'Widgets', blocks: [{ id: 'lay3', type: 'layout', props: { els } }] } });
    expect(page.status).toBe(200);
    await req('POST', `/api/entries/${page.data.entry.id}/publish`, {});
    const html = (await req('GET', `/${page.data.entry.slug}`, undefined, { cookies: new Map() })).data as string;
    // Counter: the final number is in the page (search engines, no JavaScript), formatted Swiss.
    expect(html).toContain('data-count="1200.5" data-dec="1" data-dur="2000"><span class="cnt-num">1’200.5</span><span class="cnt-fix">+</span>');
    // Accordion: native <details> grouped by name, FAQ for Google from its texts.
    expect(html).toContain('<details class="el el-box e-q1 acc-item" id="e-q1" name="acc-ac"><summary><h3 class="el el-heading e-q1h" id="e-q1h">Gibt es Parkplätze?</h3>');
    expect(html).toMatch(/"@type":"FAQPage".*"name":"Gibt es Parkplätze\?".*"text":"Ja, zwölf gratis\."/);
    // Tabs: buttons named after the tabs (escaped), the heading when there is no name.
    expect(html).toContain('<button type="button" class="tab" role="tab" aria-selected="true">Mittag &lt;&amp;&gt;</button>');
    expect(html).toContain('<button type="button" class="tab" role="tab" aria-selected="false">Abend</button>');
    expect(html).toContain('id="e-t1" role="tabpanel" data-tab-panel');
    // Slider: autoplay, labelled arrows and dots, slides per view as a CSS variable.
    expect(html).toContain('data-slider data-autoplay="5"><div class="sl-track">');
    expect(html).toContain('aria-label="Weiter"');
    expect(html).toContain('data-label="Folie {n}"');
    expect(html).toContain(':is(#e-sl,.e-sl){--per-d:3}');
    // Marquee: the second run is hidden from screen readers and carries no ids.
    expect(html).toContain('class="el el-marquee e-mq mq-fast mq-right mq-pause"');
    expect(html).toContain('<div class="mq-group" aria-hidden="true" inert><div class="el el-text e-mw prose"><p>Regional</p></div></div>');
    expect(html.match(/id="e-mw"/g)?.length).toBe(1);
    // The CSS of the widgets survives pruning, the runtime script is loaded.
    expect(html).toContain('.sl-track{');
    expect(html).toContain('.mq-track{');
    expect(html).toMatch(/<script src="\/_nova\/site\.js\?v=\w+" defer>/);
    // In the editor: drop targets for every container, no autoplay, editable tab names.
    const canvas = await req('POST', '/api/render', { entryId: page.data.entry.id, data: page.data.entry.data, blockId: 'lay3' });
    const ed = canvas.data.html as string;
    expect(ed).toContain('data-nova-box="q1" data-nova-offset="1"');
    expect(ed).toContain('<div class="sl-track" data-nova-box="sl">');
    expect(ed).not.toContain('data-autoplay');
    expect(ed).toContain('data-nova-field="els.2.children.0.name"');
    expect(ed).toMatch(/<details[^>]+data-nova-el="q1"[^>]* open/);
  });

  it('reuses components: one original, own texts per place, changes everywhere after publishing', async () => {
    const card = {
      id: 'kc',
      kind: 'box',
      props: {},
      design: { desktop: { bg: '$surface', pt: '$s-5' } },
      children: [
        { id: 'kh', kind: 'heading', props: { text: 'Beratung', level: '3' } },
        { id: 'kb', kind: 'button', props: { label: 'Termin', href: '/termin', variant: 'primary' } },
      ],
    };
    const comp = await req('POST', '/api/entries', {
      collection: 'sections',
      data: { title: 'Angebots-Karte', kind: 'component', blocks: [{ id: 'cl', type: 'layout', props: { els: [card] } }] },
    });
    expect(comp.status).toBe(200);
    expect(comp.data.entry.data.kind).toBe('component');
    await req('POST', `/api/entries/${comp.data.entry.id}/publish`, {});
    const ref = comp.data.entry.id;
    const els = [
      { id: 'i1', kind: 'component', props: { ref, overrides: { kh: { text: 'Beratung <vor Ort>' }, kb: { href: 'javascript:alert(1)' } } } },
      { id: 'i2', kind: 'component', props: { ref, overrides: {} } },
      { id: 'i3', kind: 'component', props: { ref: '00000000-0000-4000-8000-000000000000' } },
    ];
    const page = await req('POST', '/api/entries', { collection: 'pages', data: { title: 'Angebote', blocks: [{ id: 'lay4', type: 'layout', props: { els } }] } });
    expect(page.status).toBe(200);
    expect(page.data.entry.data.blocks[0].props.els[0].props.overrides).toEqual({ kh: { text: 'Beratung <vor Ort>' }, kb: { href: '' } });
    await req('POST', `/api/entries/${page.data.entry.id}/publish`, {});
    const get = async () => (await req('GET', `/${page.data.entry.slug}`, undefined, { cookies: new Map() })).data as string;
    let html = await get();
    // Each place: the original's elements, its own texts – the ids stay unique on the page.
    expect(html).toContain('<div class="el el-component e-i1" id="e-i1">');
    expect(html).toContain('<h3 class="el el-heading e-kh">Beratung &lt;vor Ort&gt;</h3>');
    expect(html).toContain('<h3 class="el el-heading e-kh">Beratung</h3>');
    expect(html).not.toContain('id="e-kh"');
    expect(html).not.toContain('e-i3');
    // The original's design comes once for all its places.
    expect(html.match(/<style data-nova-comp>/g)?.length).toBe(1);
    expect(html).toContain('<style data-nova-comp>:is(#e-kc,.e-kc){padding-top:var(--s-5);background-color:var(--surface);--bg:var(--surface)}');
    // A change to the original shows on every place once it is published – own texts stay.
    const master = comp.data.entry;
    const next = structuredClone(master.data);
    next.blocks[0].props.els[0].children[1].props.label = 'Jetzt buchen';
    next.blocks[0].props.els[0].children[0].props.text = 'Persönliche Beratung';
    await req('PUT', `/api/entries/${master.id}`, { data: next, version: master.version });
    expect(await get()).not.toContain('Jetzt buchen');
    await req('POST', `/api/entries/${master.id}/publish`, {});
    html = await get();
    expect(html.match(/<span>Jetzt buchen<\/span>/g)?.length).toBe(2);
    expect(html).toContain('Beratung &lt;vor Ort&gt;');
    expect(html).toContain('>Persönliche Beratung</h3>');
    // Their texts count for the page: its description and the site search find them.
    expect(html).toMatch(/<meta name="description" content="[^"]*Beratung &lt;vor Ort&gt;[^"]*Persönliche Beratung/);
    const found = (await req('GET', '/suche?q=Persönliche', undefined, { cookies: new Map() })).data as string;
    expect(found).toContain(`/${page.data.entry.slug}`);
    // In the editor a place is one piece: double-click opens the original, texts are its own.
    const canvas = await req('POST', '/api/render', { entryId: page.data.entry.id, data: page.data.entry.data, blockId: 'lay4' });
    const ed = canvas.data.html as string;
    expect(ed).toContain(`data-nova-el="i1" data-nova-kind-el="component" data-nova-section="${ref}" data-nova-component="Angebots-Karte"`);
    expect(ed).toContain('data-nova-field="els.0.props.overrides.kh.text"');
    expect(ed).not.toContain('data-nova-el="kh"');
    expect(ed).toContain('Diese Komponente gibt es nicht mehr');
    // Variants: the original keeps only designs of its own elements, each place picks one.
    const withVariants = structuredClone((await req('GET', `/api/entries/${ref}`)).data.entry);
    withVariants.data.blocks[0].props.variants = [{ id: 'hell', name: 'Hell', designs: { kc: { desktop: { bg: '$bg' } }, fremd: { desktop: { bg: 'red' } } } }];
    const savedV = await req('PUT', `/api/entries/${ref}`, { data: withVariants.data, version: withVariants.version });
    expect(savedV.data.entry.data.blocks[0].props.variants).toEqual([{ id: 'hell', name: 'Hell', designs: { kc: { desktop: { bg: '$bg' } } } }]);
    await req('POST', `/api/entries/${ref}/publish`, {});
    const pv = structuredClone((await req('GET', `/api/entries/${page.data.entry.id}`)).data.entry);
    pv.data.blocks[0].props.els[1].props.variant = 'hell';
    await req('PUT', `/api/entries/${page.data.entry.id}`, { data: pv.data, version: pv.version });
    await req('POST', `/api/entries/${page.data.entry.id}/publish`, {});
    html = await get();
    expect(html).toContain('<div class="el el-component e-i2 v-hell" id="e-i2">');
    expect(html).toContain('.v-hell :is(#e-kc,.e-kc){background-color:var(--bg)');
    // Sections still list as sections – a component is not offered as a block.
    const list = await req('GET', '/api/entries?collection=sections&limit=200');
    expect(list.data.entries.find((e: { id: string }) => e.id === ref).fields.kind).toBe('component');
  });

  it('places elements freely on a canvas and draws shapes as vectors', async () => {
    const els = [
      {
        id: 'cv',
        kind: 'canvas',
        props: {},
        design: { desktop: { aspect: '16/9' }, mobile: { aspect: '3/4' } },
        children: [
          {
            id: 'sh',
            kind: 'shape',
            props: { shape: 'star', fill: '$accent/50' },
            design: { desktop: { left: '40%', top: '10%', width: '30%', rotate: 12 }, mobile: { left: '5%' } },
          },
          { id: 'wv', kind: 'shape', props: { shape: 'wave', fill: '#123456', strokeWidth: 4 } },
          { id: 'ct', kind: 'heading', props: { text: 'Frei', level: '2' }, design: { desktop: { left: '5%', top: '60%' } } },
        ],
      },
    ];
    const page = await req('POST', '/api/entries', { collection: 'pages', data: { title: 'Fläche', blocks: [{ id: 'lay5', type: 'layout', props: { els } }] } });
    expect(page.status).toBe(200);
    await req('POST', `/api/entries/${page.data.entry.id}/publish`, {});
    const html = (await req('GET', `/${page.data.entry.slug}`, undefined, { cookies: new Map() })).data as string;
    expect(html).toContain('<div class="el el-canvas e-cv" id="e-cv">');
    expect(html).toMatch(
      /<div class="el el-shape e-sh sh-star" id="e-sh" aria-hidden="true"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M50 2 [^"]+" vector-effect="non-scaling-stroke"\/><\/svg><\/div>/,
    );
    expect(html).toContain('class="el el-shape e-wv sh-wave sh-line"');
    // Places in percent, per screen size; colours as variables.
    expect(html).toContain(':is(#e-sh,.e-sh){width:30%;top:10%;left:40%;transform:rotate(12deg)}');
    expect(html).toContain('@media (max-width:40rem){:is(#e-sh,.e-sh){left:5%}}');
    expect(html).toContain(':is(#e-sh,.e-sh){--fill:color-mix(in srgb,var(--accent) 50%,transparent)}');
    expect(html).toContain('.el-canvas>.el{position:absolute');
    // In the editor the canvas takes elements dropped into it.
    const canvas = await req('POST', '/api/render', { entryId: page.data.entry.id, data: page.data.entry.data, blockId: 'lay5' });
    expect(canvas.data.html).toContain('data-nova-kind-el="canvas" data-nova-box="cv"');
  });

  it('draws entry pages from a page template – bound to each entry, paywall kept, the entry editor untouched', async () => {
    const make = async (title: string, extra: Record<string, unknown>) => {
      const r = await req('POST', '/api/entries', { collection: 'posts', data: { title, ...extra } });
      await req('POST', `/api/entries/${r.data.entry.id}/publish`, {});
      return r.data.entry;
    };
    const text = (body: string) => ({ id: Math.random().toString(36).slice(2, 10), type: 'text', props: { heading: '', body } });
    const open = await make('Vorlage <offen>', { excerpt: 'Kurz und gut.', blocks: [text('<p>Der ganze Bericht.</p>')] });
    const closed = await make('Vorlage geschlossen', { excerpt: 'Nur ein Blick.', access: 'members', blocks: [text('<p>Geheimes Rezept.</p>')] });
    const els = [
      {
        id: 'th',
        kind: 'box',
        props: { tag: 'header' },
        children: [
          { id: 'tt', kind: 'heading', props: { text: 'Platzhalter', level: '1' }, bind: { text: 'title' } },
          { id: 'tx', kind: 'text', props: { html: '<p>x</p>' }, bind: { html: 'field:excerpt' } },
        ],
      },
      { id: 'tb', kind: 'entrybody', props: { show: 'blocks' } },
    ];
    const tpl = await req('POST', '/api/entries', {
      collection: 'sections',
      data: { title: 'Beitragsseite', kind: 'template', template_for: 'posts', blocks: [{ id: 'tl', type: 'layout', props: { els } }] },
    });
    expect(tpl.data.entry.data.template_for).toBe('posts');
    const page = async (slug: string) => (await req('GET', `/journal/${slug}`, undefined, { cookies: new Map() })).data as string;
    // Not published yet: the website keeps Nova's view.
    expect(await page(open.slug)).not.toContain('class="el el-heading e-tt"');
    await req('POST', `/api/entries/${tpl.data.entry.id}/publish`, {});
    try {
      const html = await page(open.slug);
      expect(html).toContain('<h1 class="el el-heading e-tt" id="e-tt">Vorlage &lt;offen&gt;</h1>');
      expect(html).toContain('<p>Kurz und gut.</p>');
      expect(html).toContain('Der ganze Bericht.');
      expect(html).not.toContain('Platzhalter');
      expect(html.match(/<h1/g)?.length).toBe(1);
      // Still an article for search engines.
      expect(html).toContain('"@type":"BlogPosting"');
      // Members-only: title and short text, then the invitation instead of the content.
      const gated = await page(closed.slug);
      expect(gated).toContain('>Vorlage geschlossen</h1>');
      expect(gated).toContain('Nur ein Blick.');
      expect(gated).toContain('Weiterlesen mit deinem Konto');
      expect(gated).not.toContain('Geheimes Rezept');
      // The entry's editor shows the template too: its parts as one piece (double-click opens it),
      // the entry's own blocks editable where «Inhalt des Eintrags» stands.
      const canvas = (await req('POST', '/api/render', { entryId: open.id, data: open.data })).data.html as string;
      expect(canvas).toContain(`<div class="nova-tpl" data-nova-section="${tpl.data.entry.id}" data-nova-template="Beitragsseite">`);
      expect(canvas).not.toContain('data-nova-el="tt"');
      expect(canvas).toMatch(/<div class="nova-blocks" data-nova-blocks><section class="b b-text[^"]*" id="[^"]+" data-tone="default" data-nova-block=/);
      // Designing the template shows the newest published entry of its type.
      const design = await req('POST', '/api/render', { entryId: tpl.data.entry.id, data: tpl.data.entry.data, blockId: 'tl' });
      expect(design.data.html).toContain('data-nova-el="tt"');
      expect(design.data.html).toContain('>Vorlage geschlossen</h1>');
      expect(design.data.html).toContain('Geheimes Rezept');
      // «Nova's whole view» keeps everything the type brings (here: the article with its own head).
      const full = structuredClone(tpl.data.entry.data);
      full.blocks[0].props.els[1].props.show = 'default';
      await req('PUT', `/api/entries/${tpl.data.entry.id}`, { data: full, version: tpl.data.entry.version + 1 });
      await req('POST', `/api/entries/${tpl.data.entry.id}/publish`, {});
      const whole = await page(open.slug);
      expect(whole).toContain('class="wrap art-head"');
      expect(whole.match(/"@type":"BlogPosting"/g)?.length).toBe(1);
      // Still one main heading: Nova's own title steps down below the template's.
      expect(whole.match(/<h1/g)?.length).toBe(1);
      expect(whole).toMatch(/<h2[^>]*>Vorlage &lt;offen&gt;<\/h2>/);
    } finally {
      await req('DELETE', `/api/entries/${tpl.data.entry.id}`);
    }
    expect(await page(open.slug)).not.toContain('e-tt');
  });

  it('keeps deleted entries 30 days in the trash and brings them back with everything', async () => {
    const created = await req('POST', '/api/entries', { collection: 'posts', data: { title: 'Bald weg', excerpt: 'Kurz.' } });
    const post = created.data.entry;
    await req('PUT', `/api/entries/${post.id}`, { data: { ...post.data, excerpt: 'Länger.' }, version: post.version });
    await req('POST', `/api/entries/${post.id}/publish`, {});
    await req('POST', `/api/entries/${post.id}/comments`, { body: 'Passt so.' });
    const revisions = (await req('GET', `/api/entries/${post.id}/revisions`)).data.revisions.length;
    expect(revisions).toBeGreaterThan(0);
    const del = await req('DELETE', `/api/entries/${post.id}`);
    expect(del.data).toEqual({ ok: true, trash: true });
    expect((await req('GET', `/journal/${post.slug}`, undefined, { cookies: new Map() })).status).toBe(404);
    const trash = await req('GET', '/api/trash');
    expect(trash.data.entries.find((x: { id: string }) => x.id === post.id)).toMatchObject({ title: 'Bald weg', collection: 'posts', status: 'published' });
    expect((await req('GET', '/api/dashboard')).data.counts.trash).toBeGreaterThan(0);
    // Back with its address, status, versions and comments.
    const back = await req('POST', `/api/trash/${post.id}/restore`, {});
    expect(back.data.entry).toMatchObject({ id: post.id, slug: post.slug, status: 'published' });
    expect((await req('GET', `/journal/${post.slug}`, undefined, { cookies: new Map() })).status).toBe(200);
    expect((await req('GET', `/api/entries/${post.id}/revisions`)).data.revisions.length).toBe(revisions);
    expect((await req('GET', `/api/entries/${post.id}/comments`)).data.comments.map((c: { body: string }) => c.body)).toContain('Passt so.');
    expect((await req('GET', '/api/trash')).data.entries.some((x: { id: string }) => x.id === post.id)).toBe(false);
    // Address taken meanwhile: a new one, and as a draft.
    await req('DELETE', `/api/entries/${post.id}`);
    const twin = await req('POST', '/api/entries', { collection: 'posts', data: { title: 'Bald weg' } });
    expect(twin.data.entry.slug).toBe(post.slug);
    const moved = await req('POST', `/api/trash/${post.id}/restore`, {});
    expect(moved.data.entry.slug).not.toBe(post.slug);
    expect(moved.data.entry.status).toBe('draft');
    // For good: gone from the trash, nothing to restore.
    await req('DELETE', `/api/entries/${twin.data.entry.id}`);
    expect((await req('DELETE', `/api/trash/${twin.data.entry.id}`)).status).toBe(200);
    expect((await req('POST', `/api/trash/${twin.data.entry.id}/restore`, {})).status).toBe(404);
    // The start page stays.
    const [home] = await sql`select id from entries where collection = 'pages' and slug = ''`;
    expect((await req('DELETE', `/api/entries/${home.id}`)).status).toBe(400);
    await req('DELETE', `/api/entries/${post.id}`);
  });

  it('does things with many entries at once – each checked like a single change', async () => {
    const make = async (title: string) => (await req('POST', '/api/entries', { collection: 'posts', data: { title } })).data.entry;
    const a = await make('Sammel A');
    const b = await make('Sammel B');
    const pub = await req('POST', '/api/entries/bulk', { ids: [a.id, b.id], action: 'publish' });
    expect(pub.data.done).toHaveLength(2);
    expect((await req('GET', `/journal/${a.slug}`, undefined, { cookies: new Map() })).status).toBe(200);
    const set = await req('POST', '/api/entries/bulk', { ids: [a.id, b.id], action: 'set', field: 'category', value: 'Sammlung' });
    expect(set.data.done).toHaveLength(2);
    expect((await req('GET', `/api/entries/${b.id}`)).data.entry.data.category).toBe('Sammlung');
    // Title and unknown fields are not for bulk changes; the reason comes back per entry.
    const bad = await req('POST', '/api/entries/bulk', { ids: [a.id], action: 'set', field: 'title', value: 'X' });
    expect(bad.data.failed[0]).toMatchObject({ title: 'Sammel A', error: expect.stringMatching(/Feld/) });
    const dup = await req('POST', '/api/entries/bulk', { ids: [a.id], action: 'duplicate' });
    expect(dup.data.done).toHaveLength(1);
    const off = await req('POST', '/api/entries/bulk', { ids: [a.id, b.id], action: 'unpublish' });
    expect(off.data.done).toHaveLength(2);
    expect((await req('GET', `/journal/${a.slug}`, undefined, { cookies: new Map() })).status).toBe(404);
    const gone = await req('POST', '/api/entries/bulk', { ids: [a.id, b.id, '00000000-0000-4000-8000-000000000000'], action: 'trash' });
    expect(gone.data.done).toHaveLength(2);
    expect(gone.data.failed).toHaveLength(1);
    expect((await req('GET', '/api/trash')).data.entries.filter((x: { id: string }) => [a.id, b.id].includes(x.id))).toHaveLength(2);
    expect((await req('POST', '/api/entries/bulk', { ids: [], action: 'publish' })).status).toBe(400);
  });

  it('takes entries offline at their expiry date and tells the people who publish', async () => {
    const e = (await req('POST', '/api/entries', { collection: 'posts', data: { title: 'Aktion bis Sonntag' } })).data.entry;
    await req('POST', `/api/entries/${e.id}/publish`, {});
    expect((await req('POST', `/api/entries/${e.id}/expiry`, { at: new Date(Date.now() - 1000).toISOString() })).status).toBe(400);
    const set = await req('POST', `/api/entries/${e.id}/expiry`, { at: new Date(Date.now() + 3_600_000).toISOString() });
    expect(set.data.entry.unpublish_at).toBeTruthy();
    const list = await req('GET', '/api/entries?collection=posts&limit=500');
    expect(list.data.entries.find((x: { id: string }) => x.id === e.id).unpublish_at).toBeTruthy();
    // Time has come (moved back here instead of waiting).
    await sql`update entries set unpublish_at = now() - interval '1 minute' where id = ${e.id}`;
    expect(await unpublishDue()).toBeGreaterThanOrEqual(1);
    const after = (await req('GET', `/api/entries/${e.id}`)).data.entry;
    expect(after).toMatchObject({ status: 'draft', unpublish_at: null });
    expect((await req('GET', `/journal/${e.slug}`, undefined, { cookies: new Map() })).status).toBe(404);
    const [n] = await sql`select title from notifications where title like '%Aktion bis Sonntag%' order by created_at desc limit 1`;
    expect(n.title).toBe('«Aktion bis Sonntag» ist abgelaufen und offline.');
    await req('DELETE', `/api/entries/${e.id}`);
  });

  it('shows the editorial calendar: online, planned and expiring by day', async () => {
    const plan = (await req('POST', '/api/entries', { collection: 'posts', data: { title: 'Kalender geplant' } })).data.entry;
    const at = new Date(Date.now() + 3 * 86_400_000);
    await req('POST', `/api/entries/${plan.id}/publish`, { at: at.toISOString() });
    const live = (await req('POST', '/api/entries', { collection: 'posts', data: { title: 'Kalender online' } })).data.entry;
    await req('POST', `/api/entries/${live.id}/publish`, {});
    await req('POST', `/api/entries/${live.id}/expiry`, { at: new Date(Date.now() + 5 * 86_400_000).toISOString() });
    const d = (x: Date) => x.toISOString().slice(0, 10);
    const cal = await req('GET', `/api/calendar?from=${d(new Date(Date.now() - 86_400_000))}&to=${d(new Date(Date.now() + 7 * 86_400_000))}`);
    const kinds = (id: string) =>
      cal.data.items
        .filter((i: { id: string }) => i.id === id)
        .map((i: { kind: string }) => i.kind)
        .sort();
    expect(kinds(plan.id)).toEqual(['scheduled']);
    expect(kinds(live.id)).toEqual(['expires', 'published']);
    expect((await req('GET', '/api/calendar?from=2026-01-01&to=2026-12-31')).status).toBe(400);
    for (const e of [plan, live]) await req('DELETE', `/api/entries/${e.id}`);
  });

  it('tells webhooks about content: created, changed once it rests, deleted, restored – filtered, signed and logged', async () => {
    const realFetch = globalThis.fetch;
    const got: { url: string; event: string; delivery: string; signature: string; raw: string; body: any }[] = [];
    let failing = true;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      if (!String(url).startsWith('https://hooks.test/')) return realFetch(url, init);
      const h = init?.headers as Record<string, string>;
      got.push({
        url: String(url),
        event: h['X-Nova-Event'],
        delivery: h['X-Nova-Delivery'],
        signature: h['X-Nova-Signature'],
        raw: String(init?.body),
        body: JSON.parse(String(init?.body)),
      });
      return new Response('', { status: String(url).endsWith('/down') && failing ? 503 : 200 });
    }) as typeof fetch;
    const flush = () => deliveriesIdle();
    const of = (u: string, ev?: string) => got.filter((g) => g.url === `https://hooks.test/${u}` && (!ev || g.event === ev));
    try {
      // Changes waiting from earlier tests go out first, to nobody.
      await settleNow();
      const all = ['entry.created', 'entry.updated', 'entry.published', 'entry.deleted', 'entry.restored'];
      const saved = await req('PATCH', '/api/settings', {
        webhooks: [
          { id: '', url: 'https://hooks.test/posts', events: all, collections: ['posts', 'gibts-nicht'], secret: '', active: true },
          { id: '', url: 'https://hooks.test/any', events: ['entry.created'], secret: '', active: true },
          { id: '', url: 'https://hooks.test/down', events: ['entry.deleted'], secret: '', active: true },
        ],
      });
      const [postsHook, , downHook] = saved.data.settings.webhooks;
      expect(postsHook.collections).toEqual(['posts']);

      const post = (await req('POST', '/api/entries', { collection: 'posts', data: { title: 'Webhook-Beitrag' } })).data.entry;
      const page = (await req('POST', '/api/entries', { collection: 'pages', data: { title: 'Webhook-Seite', blocks: [] } })).data.entry;
      await flush();
      expect(of('posts', 'entry.created').map((g) => g.body.data.id)).toEqual([post.id]);
      // Delivered side by side: the order may vary.
      expect(of('any', 'entry.created').map((g) => g.body.data.id).sort()).toEqual([post.id, page.id].sort());
      expect(of('posts', 'entry.created')[0].body.data).toMatchObject({ collection: 'posts', title: 'Webhook-Beitrag', status: 'draft', path: `/journal/${post.slug}` });
      // Signed with the hook's secret over the exact body.
      const g = of('posts', 'entry.created')[0];
      expect(g.signature).toBe(`sha256=${createHmac('sha256', postsHook.secret).update(g.raw).digest('hex')}`);

      // Three saves while writing: one «updated», with the last state, once it rests.
      for (const title of ['Webhook 1', 'Webhook 2', 'Webhook 3']) await req('PUT', `/api/entries/${post.id}`, { data: { ...post.data, title } });
      await flush();
      expect(of('posts', 'entry.updated')).toHaveLength(0);
      await settleNow();
      await flush();
      expect(of('posts', 'entry.updated').map((x) => x.body.data.title)).toEqual(['Webhook 3']);

      // A change right before deleting sends no late «updated».
      await req('PUT', `/api/entries/${post.id}`, { data: { ...post.data, title: 'Letzte Fassung' } });
      await req('DELETE', `/api/entries/${post.id}`);
      await settleNow();
      await flush();
      expect(of('posts', 'entry.updated')).toHaveLength(1);
      expect(of('posts', 'entry.deleted')[0].body.data).toMatchObject({ id: post.id, title: 'Letzte Fassung', permanent: false });
      await req('POST', `/api/trash/${post.id}/restore`);
      await flush();
      expect(of('posts', 'entry.restored').map((x) => x.body.data.id)).toEqual([post.id]);

      // Every delivery is logged; a failed one goes out again with the same id.
      const log = (await req('GET', `/api/webhooks/${postsHook.id}/deliveries`)).data.deliveries;
      expect(log.map((d: { event: string }) => d.event)).toEqual(['entry.restored', 'entry.deleted', 'entry.updated', 'entry.created']);
      expect(log.every((d: { ok: boolean; status: number }) => d.ok && d.status === 200)).toBe(true);
      const down = (await req('GET', `/api/webhooks/${downHook.id}/deliveries`)).data.deliveries[0];
      expect(down).toMatchObject({ event: 'entry.deleted', ok: false, status: 503, attempts: 1 });
      failing = false;
      const again = await req('POST', `/api/webhooks/deliveries/${down.id}/retry`);
      expect(again.data).toMatchObject({ ok: true, status: 200 });
      const deliveries = of('down');
      expect(deliveries[deliveries.length - 1].delivery).toBe(deliveries[0].delivery);
      expect((await req('GET', `/api/webhooks/${downHook.id}/deliveries`)).data.deliveries[0]).toMatchObject({ ok: true, attempts: 2 });
      const detail = await req('GET', `/api/webhooks/deliveries/${down.id}`);
      expect(detail.data.delivery.body).toMatchObject({ event: 'entry.deleted', data: { id: post.id } });

      await req('PATCH', '/api/settings', { webhooks: [] });
      for (const id of [post.id, page.id]) await req('DELETE', `/api/entries/${id}`);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('shows a draft through a shared link: latest state, never indexed, runs out and can be withdrawn', async () => {
    const e = (await req('POST', '/api/entries', { collection: 'posts', data: { title: 'Geheimer Entwurf' } })).data.entry;
    const made = await req('POST', `/api/entries/${e.id}/preview-links`, { days: 7, note: 'Frau Meier' });
    expect(made.data.link).toMatchObject({ note: 'Frau Meier', uses: 0 });
    const url = made.data.link.url as string;
    expect(url).toMatch(/^\/_nova\/vorschau\/[\w-]{24}$/);
    const anon = new Map<string, string>();
    // Not public yet – but the link shows it, with a note on top and kept out of search engines.
    expect((await req('GET', `/journal/${e.slug}`, undefined, { cookies: anon })).status).toBe(404);
    const seen = await req('GET', url, undefined, { cookies: anon });
    expect(seen.status).toBe(200);
    expect(seen.data).toContain('Geheimer Entwurf');
    expect(seen.data).toContain('Vorschau – noch nicht veröffentlicht.');
    expect(seen.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(seen.headers.get('cache-control')).toBe('no-store');
    // Always the latest saved draft.
    await req('PUT', `/api/entries/${e.id}`, { data: { ...e.data, title: 'Neuer Titel im Entwurf' } });
    expect((await req('GET', url, undefined, { cookies: anon })).data).toContain('Neuer Titel im Entwurf');
    const list = await req('GET', `/api/entries/${e.id}/preview-links`);
    expect(list.data.links[0]).toMatchObject({ uses: 2, note: 'Frau Meier' });
    // Expired and withdrawn links show a note, nothing of the draft.
    await sql`update preview_links set expires_at = now() - interval '1 minute' where id = ${made.data.link.id}`;
    const gone = await req('GET', url, undefined, { cookies: anon });
    expect(gone.status).toBe(410);
    expect(gone.data).not.toContain('Neuer Titel im Entwurf');
    expect((await req('GET', `/api/entries/${e.id}/preview-links`)).data.links).toHaveLength(0);
    const second = (await req('POST', `/api/entries/${e.id}/preview-links`, { days: 1 })).data.link;
    expect((await req('DELETE', `/api/preview-links/${second.id}`)).status).toBe(200);
    expect((await req('GET', second.url, undefined, { cookies: anon })).status).toBe(410);
    expect((await req('GET', '/_nova/vorschau/erfunden', undefined, { cookies: anon })).status).toBe(410);
    // Limits: at most 90 days; only for content with a page; others' entries stay out of reach for authors.
    expect((await req('POST', `/api/entries/${e.id}/preview-links`, { days: 365 })).status).toBe(400);
    const sec = (await req('POST', '/api/entries', { collection: 'sections', data: { title: 'Baustein' } })).data.entry;
    expect((await req('POST', `/api/entries/${sec.id}/preview-links`, { days: 1 })).status).toBe(400);
    const bo = await req('POST', '/api/users', { email: 'bo@example.ch', name: 'Bo', role: 'author' });
    const boC = new Map<string, string>();
    await req('POST', '/api/login', { email: 'bo@example.ch', password: bo.data.temporaryPassword }, { cookies: boC });
    expect((await req('POST', `/api/entries/${e.id}/preview-links`, { days: 1 }, { cookies: boC })).status).toBe(403);
    for (const id of [e.id, sec.id]) await req('DELETE', `/api/entries/${id}`);
  });

  it('searches and replaces across content: preview in context, only the ticked entries, drafts with the state before kept', async () => {
    const mk = async (collection: string, data: Record<string, unknown>) => (await req('POST', '/api/entries', { collection, data })).data.entry;
    const a = await mk('pages', { title: 'Kontakt', blocks: [{ id: 'b1', type: 'text', props: { heading: 'Anrufen', body: '<p>Telefon <strong>044 111 22 33</strong> &amp; Fax</p>' } }] });
    const b = await mk('posts', { title: 'Neu: 044 111 22 33', excerpt: 'Ruf an unter 044 111 22 33.' });
    const untouched = await mk('posts', { title: 'Ohne Nummer' });
    await req('POST', `/api/entries/${b.id}/publish`, {});
    const ask = { find: '044 111 22 33', replace: '052 000 99 88' };
    const pre = await req('POST', '/api/replace/preview', ask);
    const ids = pre.data.entries.map((e: { id: string }) => e.id);
    expect(ids).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(ids).not.toContain(untouched.id);
    const hitB = pre.data.entries.find((e: { id: string }) => e.id === b.id);
    expect(hitB).toMatchObject({ count: 2, status: 'published' });
    expect(hitB.hits[0]).toMatchObject({ where: 'Titel', match: '044 111 22 33' });
    // The type filter narrows it down.
    expect((await req('POST', '/api/replace/preview', { ...ask, collections: ['pages'] })).data.entries.map((e: { id: string }) => e.id)).not.toContain(b.id);
    // Only the ticked one changes; the published one keeps its live version until published again.
    const done = await req('POST', '/api/replace/apply', { ...ask, targets: [{ id: a.id, lang: null }, { id: b.id, lang: null }] });
    expect(done.data).toMatchObject({ replaced: 3, entries: 2, failed: [] });
    const nowA = (await req('GET', `/api/entries/${a.id}`)).data.entry;
    expect(nowA.data.blocks[0].props.body).toBe('<p>Telefon <strong>052 000 99 88</strong> &amp; Fax</p>');
    expect(nowA.data.blocks[0].id).toBe('b1');
    const live = (await req('GET', `/journal/${b.slug}`, undefined, { cookies: new Map() })).data as string;
    expect(live).toContain('044 111 22 33');
    const [rev] = await sql`select data from revisions where entry_id = ${b.id} and kind = 'replace'`;
    expect(rev.data.title).toBe('Neu: 044 111 22 33');
    // Asked to republish: online at once.
    const c = await mk('posts', { title: 'Alt: 044 111 22 33' });
    await req('POST', `/api/entries/${c.id}/publish`, {});
    await req('POST', '/api/replace/apply', { ...ask, targets: [{ id: c.id, lang: null }], publish: true });
    expect((await req('GET', `/journal/${c.slug}`, undefined, { cookies: new Map() })).data).toContain('Alt: 052 000 99 88');
    expect((await req('POST', '/api/replace/preview', ask)).data.entries.map((e: { id: string }) => e.id)).not.toContain(c.id);
    // Site settings: only readable text, at once.
    await req('PATCH', '/api/settings', { business: { ...(await req('GET', '/api/settings')).data.settings.business, phone: '044 111 22 33' } });
    expect((await req('POST', '/api/replace/preview', ask)).data.settings.count).toBe(1);
    await req('POST', '/api/replace/apply', { ...ask, targets: [], settings: true });
    expect((await req('GET', '/api/settings')).data.settings.business.phone).toBe('052 000 99 88');
    expect((await req('POST', '/api/replace/preview', { find: '', replace: 'x' })).status).toBe(400);
    for (const e of [a, b, c, untouched]) await req('DELETE', `/api/entries/${e.id}`);
  });

  it('logs addresses that lead nowhere, suggests a page and turns them into a redirect', async () => {
    const anon = new Map<string, string>();
    const post = (await req('POST', '/api/entries', { collection: 'posts', data: { title: 'Sommerfest im Garten' } })).data.entry;
    await req('POST', `/api/entries/${post.id}/publish`, {});
    // Three visitors on an old link, one with the page they came from; probes for other systems stay out.
    for (let i = 0; i < 3; i++)
      expect((await req('GET', '/blog/sommerfest-im-garten?utm=x', undefined, { cookies: anon, headers: i ? {} : { referer: 'https://partner.ch/events?id=7' } })).status).toBe(404);
    await req('GET', '/sommerfest-im-garten-2025', undefined, { cookies: anon });
    await req('GET', '/wp-login.php', undefined, { cookies: anon });
    await req('GET', '/.env', undefined, { cookies: anon });
    await new Promise((r) => setTimeout(r, 50));
    const list = await req('GET', '/api/not-found');
    const row = list.data.missing.find((m: { path: string }) => m.path === '/blog/sommerfest-im-garten');
    expect(row).toMatchObject({ hits: 3, referrer: 'https://partner.ch/events', suggestion: `/journal/${post.slug}` });
    expect(list.data.missing.map((m: { path: string }) => m.path)).not.toEqual(expect.arrayContaining(['/wp-login.php']));
    // An address that starts with an existing one points there too.
    expect(list.data.missing.find((m: { path: string }) => m.path === '/sommerfest-im-garten-2025').suggestion).toBe(`/journal/${post.slug}`);
    // One click: a redirect, and the address leaves the list.
    await req('POST', '/api/redirects', { from_path: row.path, to_path: row.suggestion, code: 301 });
    expect((await req('GET', '/api/not-found')).data.missing.map((m: { path: string }) => m.path)).not.toContain(row.path);
    const followed = await req('GET', '/blog/sommerfest-im-garten', undefined, { cookies: anon });
    expect(followed.status).toBe(301);
    // Set aside: gone from the list too.
    await req('GET', '/irgendwas-falsches', undefined, { cookies: anon });
    await new Promise((r) => setTimeout(r, 50));
    expect((await req('POST', '/api/not-found/ignore', { paths: ['/irgendwas-falsches'] })).status).toBe(200);
    expect((await req('GET', '/api/not-found')).data.missing.map((m: { path: string }) => m.path)).not.toContain('/irgendwas-falsches');
    expect((await req('GET', '/api/not-found', undefined, { cookies: anon })).status).toBe(401);
    await req('DELETE', `/api/entries/${post.id}`);
  });

  it('filters content lists by author, last change and fields, and keeps saved views per person or for the team', async () => {
    const mk = async (data: Record<string, unknown>) => (await req('POST', '/api/entries', { collection: 'posts', data })).data.entry;
    const a = await mk({ title: 'Filter A', category: 'Küche', tags: ['herbst', 'wild'], allowComments: true });
    const b = await mk({ title: 'Filter B', category: 'Garten', tags: ['herbst'] });
    const old = await mk({ title: 'Filter alt', category: 'Küche' });
    await sql`update entries set updated_at = now() - interval '40 days' where id = ${old.id}`;
    const ids = async (query: string) => (await req('GET', `/api/entries?collection=posts&limit=500&${query}`)).data.entries.map((e: { id: string }) => e.id);
    expect(await ids('f.category=K%C3%BCche')).toEqual(expect.arrayContaining([a.id, old.id]));
    expect(await ids('f.category=K%C3%BCche')).not.toContain(b.id);
    expect(await ids('f.tags=herbst')).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(await ids('f.tags=wild')).toContain(a.id);
    expect(await ids('f.tags=wild')).not.toContain(b.id);
    expect(await ids('f.allowComments=true')).toContain(a.id);
    expect(await ids('f.allowComments=false')).not.toContain(a.id);
    expect(await ids('f.category=K%C3%BCche&updated=30')).not.toContain(old.id);
    expect(await ids('author=me&f.category=Garten')).toContain(b.id);
    expect((await req('GET', '/api/entries?collection=posts&f.title=x')).status).toBe(400);
    expect((await req('GET', '/api/entries?collection=posts&author=nobody')).status).toBe(400);
    // What there is to filter by, with counts.
    const facets = (await req('GET', '/api/entries/facets?collection=posts')).data;
    const cat = facets.fields.find((f: { key: string }) => f.key === 'category');
    expect(cat.values.find((v: { value: string }) => v.value === 'Küche').n).toBeGreaterThanOrEqual(2);
    expect(facets.fields.find((f: { key: string }) => f.key === 'tags').values.find((v: { value: string }) => v.value === 'herbst').n).toBeGreaterThanOrEqual(2);
    expect(facets.authors.length).toBeGreaterThan(0);
    // Saved views: tidied, mine or shared; others see shared ones only.
    const mine = await req('POST', '/api/views', { collection: 'posts', name: 'Küche', query: { 'f.category': 'Küche', bogus: 'x', status: 'draft' } });
    expect(mine.data.view.query).toEqual({ status: 'draft', 'f.category': 'Küche' });
    const team = await req('POST', '/api/views', { collection: 'posts', name: 'Herbst', query: { 'f.tags': 'herbst' }, shared: true });
    expect(team.status).toBe(200);
    const cy = await req('POST', '/api/users', { email: 'cy@example.ch', name: 'Cy', role: 'author' });
    const cyC = new Map<string, string>();
    await req('POST', '/api/login', { email: 'cy@example.ch', password: cy.data.temporaryPassword }, { cookies: cyC });
    const seen = (await req('GET', '/api/views?collection=posts', undefined, { cookies: cyC })).data.views.map((v: { name: string }) => v.name);
    expect(seen).toContain('Herbst');
    expect(seen).not.toContain('Küche');
    expect((await req('POST', '/api/views', { collection: 'posts', name: 'Für alle', query: {}, shared: true }, { cookies: cyC })).status).toBe(403);
    expect((await req('DELETE', `/api/views/${team.data.view.id}`, undefined, { cookies: cyC })).status).toBe(403);
    for (const v of [mine, team]) expect((await req('DELETE', `/api/views/${v.data.view.id}`)).status).toBe(200);
    for (const e of [a, b, old]) await req('DELETE', `/api/entries/${e.id}`);
  });

  it('sends customer mails with the site’s own texts and look, and keeps what Nova fills in', async () => {
    const settings = (await req('GET', '/api/settings')).data.settings;
    await req('PATCH', '/api/settings', { modules: [...new Set([...settings.modules, 'newsletter'])] });
    const saved = await req('PATCH', '/api/settings', {
      mail: {
        logo: true,
        color: '#2b59c3',
        signature: 'Herzlich\nIhr Linde-Team',
        footer: 'Mo–Sa 11–23 Uhr',
        texts: {
          newsletter: { de: { subject: 'Fast geschafft, {name}!', intro: 'Schön, dass du dabei sein willst, {name}.', outro: 'PS: Einmal im Monat, versprochen.' } },
          erfunden: { de: { subject: 'x' } },
        },
      },
    });
    expect(saved.data.settings.mail.texts).toEqual({
      newsletter: { de: { subject: 'Fast geschafft, {name}!', intro: 'Schön, dass du dabei sein willst, {name}.', outro: 'PS: Einmal im Monat, versprochen.' } },
    });
    expect((await req('PATCH', '/api/settings', { mail: { ...saved.data.settings.mail, color: 'red' } })).data.settings.mail.color).toBe('');
    await req('PATCH', '/api/settings', { mail: saved.data.settings.mail });

    const form = { email: 'mira@example.ch', name: 'Mira Keller', _page: '/journal', _block: 'nl1', _t: (Date.now() - 5000).toString(36) };
    await req('POST', '/_nova/newsletter', undefined, { cookies: new Map(), form });
    const m = outbox.filter((x) => x.to === 'mira@example.ch').pop()!;
    expect(m.subject).toBe('Fast geschafft, Mira!');
    const lines = m.text.split('\n');
    expect(lines.slice(0, 3)).toEqual(['Hallo Mira,', '', 'Schön, dass du dabei sein willst, Mira.']);
    expect(m.text).toContain('/newsletter/bestaetigen/');
    expect(m.text.endsWith('PS: Einmal im Monat, versprochen.\n\nHerzlich\nIhr Linde-Team')).toBe(true);
    // The same in the site's look: colour, a button for the link, footer – and nothing typed becomes markup.
    expect(m.html).toContain('#2b59c3');
    expect(m.html).toMatch(/<a href="[^"]*\/newsletter\/bestaetigen\/[^"]+"[^>]*>Anmeldung bestätigen<\/a>/);
    expect(m.html).toContain('Mo–Sa 11–23 Uhr');
    // Preview of unsaved texts, with sample details.
    const pre = await req('POST', '/api/mail/preview', {
      kind: 'order',
      lang: 'de',
      mail: { ...saved.data.settings.mail, texts: { order: { de: { intro: '<b>Danke</b>, {name}!' } } } },
    });
    expect(pre.data.subject).toContain('Bestellung B-1042');
    expect(pre.data.html).toContain('&lt;b&gt;Danke&lt;/b&gt;, Anna!');
    expect(pre.data.html).toContain('Bergkäse');
    expect((await req('POST', '/api/mail/preview', { kind: 'gibts-nicht', lang: 'de' })).status).toBe(404);
    await req('PATCH', '/api/settings', { mail: { logo: true, color: '', signature: '', footer: '', texts: {} } });
  });

  it('shows published pop-ups on the pages they are meant for, closed until their trigger fires', async () => {
    const anon = { cookies: new Map<string, string>() };
    const shortBlock = () => Math.random().toString(36).slice(2, 10);
    const mk = async (title: string, extra: Record<string, unknown>) => {
      const e = (
        await req('POST', '/api/entries', {
          collection: 'sections',
          data: { title, kind: 'popup', blocks: [{ id: shortBlock(), type: 'text', props: { heading: title, body: '<p>Jetzt anmelden.</p>' } }], ...extra },
        })
      ).data.entry;
      return e;
    };
    const news = await mk('Newsletter', { popup_trigger: 'scroll', popup_scroll: 300, popup_frequency: 'session', popup_position: 'corner', popup_skip: '/kontakt\n' });
    const shop = await mk('Shop-Aktion', { popup_paths: 'https://example.ch/shop/*', popup_delay: -5 });
    const old = await mk('Vorbei', { popup_until: '2020-01-01T00:00' });
    const soon = await mk('Bald', { popup_from: '2999-01-01T00:00' });
    const draft = await mk('Entwurf', {});
    for (const e of [news, shop, old, soon]) await req('POST', `/api/entries/${e.id}/publish`, {});

    const home = (await req('GET', '/', undefined, anon)).data as string;
    const dialogs = [...home.matchAll(/<dialog class="pop ([^"]+)" ([^>]*)>([\s\S]*?)<\/dialog>/g)];
    const byId = (id: string) => dialogs.find((m) => m[2].includes(`data-pop="${id}"`));
    // The newsletter as set, its values checked: never more than the whole page.
    expect(byId(news.id)?.[1]).toBe('pop-corner pop-m');
    for (const a of ['data-pop-trigger="scroll"', 'data-pop-scroll="100"', 'data-pop-freq="session"']) expect(byId(news.id)?.[2]).toContain(a);
    // Its blocks render like on a page, but never as the page's main heading; closing has a name.
    expect(byId(news.id)?.[3]).toContain('Jetzt anmelden.');
    expect(byId(news.id)?.[3]).not.toContain('<h1');
    expect(byId(news.id)?.[3]).toContain('data-pop-close aria-label="Schliessen"');
    expect(home.match(/<h1[\s>]/g)?.length).toBe(1);
    // Only below /shop; over; drafts never.
    expect(byId(shop.id)).toBeUndefined();
    expect(byId(old.id)).toBeUndefined();
    expect(byId(draft.id)).toBeUndefined();
    // A cached page must not miss its start: it comes along with its time, the browser decides.
    expect(byId(soon.id)?.[2]).toMatch(/data-pop-from="\d{13,}"/);
    expect(home).toContain('/_nova/site.js');

    const contact = (await req('GET', '/kontakt', undefined, anon)).data as string;
    expect(contact).not.toContain(`data-pop="${news.id}"`);
    // Pages kept out of search (cart, account …) stay free of them.
    const hidden = (await req('POST', '/api/entries', { collection: 'pages', data: { title: 'Intern', seo: { noindex: true } }, slug: 'intern' })).data.entry;
    await req('POST', `/api/entries/${hidden.id}/publish`, {});
    expect((await req('GET', '/intern', undefined, anon)).data).not.toContain('<dialog class="pop');
    // In the editor the pop-up is designed in its frame; pages there carry none.
    const canvas = await req('POST', '/api/render', { entryId: news.id, data: { title: 'Newsletter', kind: 'popup', popup_position: 'corner', blocks: [] } });
    expect(canvas.data.html).toContain('class="pop-stage pop-stage-corner"');
    for (const e of [news, shop, old, soon, draft, hidden]) await req('DELETE', `/api/entries/${e.id}`);
    expect((await req('GET', '/', undefined, anon)).data).not.toContain('<dialog class="pop');
  });

  it('counts how pop-ups do without anything about the visitor', async () => {
    const anon = { cookies: new Map<string, string>() };
    const pop = (await req('POST', '/api/entries', { collection: 'sections', data: { title: 'Zählen', kind: 'popup', blocks: [] } })).data.entry;
    const page = (await req('POST', '/api/entries', { collection: 'pages', data: { title: 'Kein Pop-up' } })).data.entry;
    const hit = (id: string, e: string) => req('POST', '/_nova/pop', { id, e }, anon);
    // Drafts, other entries, unknown events and ids count nothing.
    await hit(pop.id, 'show');
    await req('POST', `/api/entries/${pop.id}/publish`, {});
    await req('POST', `/api/entries/${page.id}/publish`, {});
    for (const [id, e] of [
      [page.id, 'show'],
      [pop.id, 'drop table'],
      ['erfunden', 'show'],
    ])
      expect((await hit(id, e)).status).toBe(204);
    for (const e of ['show', 'show', 'show', 'click', 'close']) await hit(pop.id, e);
    const stats = await req('GET', `/api/popups/${pop.id}/stats`);
    expect(stats.data).toMatchObject({ shown: 3, clicked: 1, closed: 1 });
    expect(stats.data.days).toHaveLength(1);
    // Only for the team.
    expect((await req('GET', `/api/popups/${pop.id}/stats`, undefined, anon)).status).toBe(401);
    for (const id of [pop.id, page.id]) await req('DELETE', `/api/entries/${id}`);
  });

  it('lets customers rate products: only after approval, verified when they bought it, with stars for Google', async () => {
    const anon = { cookies: new Map<string, string>() };
    const p = (await req('POST', '/api/entries', { collection: 'products', data: { title: 'Bergtee', price: 1450 }, slug: 'bergtee' })).data.entry;
    await req('POST', `/api/entries/${p.id}/publish`, {});
    const form = (extra: Record<string, string>) => ({
      _t: (Date.now() - 5000).toString(36),
      website: '',
      name: 'Lea',
      email: 'Lea@Example.ch',
      rating: '5',
      body: 'Würzig & fein.',
      ...extra,
    });
    const send = (extra: Record<string, string> = {}) => req('POST', `/_nova/reviews/${p.id}`, undefined, { ...anon, form: form(extra) });
    // Off until switched on.
    expect((await send()).status).toBe(404);
    await req('PATCH', '/api/settings', { shop: { reviews: true } });
    expect((await req('GET', '/laden/bergtee', undefined, anon)).data).toContain('Noch keine Bewertungen.');

    // Lea bought it (the same address, written differently); Max didn't; a bot and a missing star count nothing.
    await sql`insert into orders (number, token, status, email, customer, items, subtotal, total, payment_method)
      values ('T-REV', 'tok-rev', 'paid', 'lea@example.ch', '{}', ${sql.json([{ productId: p.id, qty: 1 }])}, 1450, 1450, 'invoice')`;
    expect((await send()).headers.get('location')).toBe('/laden/bergtee?bewertung=danke#bewertungen');
    await send({ name: 'Max', email: 'max@example.ch', rating: '2', body: '' });
    await send({ name: 'Bot', website: 'http://spam.example' });
    await send({ name: 'Ohne', email: 'ohne@example.ch', rating: '9' });
    const pending = (await req('GET', '/api/comments?status=pending')).data.comments.filter((c: { entry_id: string }) => c.entry_id === p.id);
    expect(pending.map((c: { name: string; rating: number; verified: boolean }) => [c.name, c.rating, c.verified]).sort()).toEqual([
      ['Lea', 5, true],
      ['Max', 2, false],
    ]);
    // Nothing shows before approval.
    expect((await req('GET', '/laden/bergtee', undefined, anon)).data).not.toContain('Würzig');
    for (const c of pending) await req('PATCH', `/api/comments/${c.id}`, { status: 'approved' });
    const page = (await req('GET', '/laden/bergtee', undefined, anon)).data as string;
    expect(page).toContain('Würzig &amp; fein.');
    expect(page).toContain('aria-label="3.5 von 5 Sternen"');
    expect(page).toContain('2 Bewertungen');
    expect(page.match(/class="rv-ok"/g)?.length).toBe(1);
    const ld = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])).find((x) => x['@type'] === 'Product');
    expect(ld.aggregateRating).toMatchObject({ ratingValue: 3.5, reviewCount: 2, bestRating: 5 });
    expect(ld.review).toHaveLength(2);
    // Reviews are not blog comments.
    await req('PATCH', '/api/settings', { shop: { reviews: false } });
    expect((await req('GET', '/laden/bergtee', undefined, anon)).data).not.toContain('id="bewertungen"');
    await sql`delete from orders where number = 'T-REV'`;
    await req('DELETE', `/api/entries/${p.id}`);
  });

  it('reminds once about a cart left at the checkout, only when asked, and forgets on request', async () => {
    const [kaffee] = await sql`select id from entries where collection = 'products' and status = 'published' and published_data ->> 'title' like 'Kaffee%'`;
    const cart = new Map<string, string>();
    await req('POST', '/warenkorb/add', undefined, { cookies: cart, form: { product: kaffee.id, qty: '1' } });
    const ask = (body: Record<string, unknown>, cookies = cart) => req('POST', '/_nova/cart-remind', body, { cookies });
    const rows = (email: string) => sql`select * from cart_reminders where lower(email) = ${email}`;
    // Off: no box at the checkout and nothing kept.
    expect((await req('GET', '/kasse', undefined, { cookies: cart })).data).not.toContain('data-cart-remind');
    await ask({ email: 'mia@example.ch', on: true });
    expect(await rows('mia@example.ch')).toHaveLength(0);

    await req('PATCH', '/api/settings', { shop: { cartReminders: { enabled: true, hours: 2 } } });
    expect((await req('GET', '/kasse', undefined, { cookies: cart })).data).toContain('data-cart-remind');
    await ask({ email: 'Mia@Example.ch', name: 'Mia Meier', on: true });
    await ask({ email: 'mia@example.ch', name: 'Mia Meier', on: true });
    const [kept] = await rows('mia@example.ch');
    expect(kept).toMatchObject({ name: 'Mia Meier', items: [{ p: kaffee.id, v: null, q: 1 }] });
    expect(await rows('mia@example.ch')).toHaveLength(1);
    // An empty cart or an unticked box keeps nothing.
    await ask({ email: 'leer@example.ch', on: true }, new Map());
    expect(await rows('leer@example.ch')).toHaveLength(0);
    await ask({ email: 'weg@example.ch', on: true });
    await ask({ email: 'weg@example.ch', on: false });
    expect(await rows('weg@example.ch')).toHaveLength(0);

    // Not before its time; then exactly once.
    expect(await sendCartReminders()).toBe(0);
    await sql`update cart_reminders set remind_at = now() - interval '1 minute'`;
    const before = outbox.length;
    expect(await sendCartReminders()).toBe(1);
    expect(await sendCartReminders()).toBe(0);
    const mail = outbox.slice(before).find((m) => m.to === 'mia@example.ch')!;
    expect(mail.subject).toContain('Dein Warenkorb wartet');
    expect(mail.text).toMatch(/^Hallo Mia\n/);
    expect(mail.text).toContain(`/warenkorb/zurueck/${kept.token}`);
    expect(mail.html).toContain('Kaffee');
    // The same address can't be made to receive another one this week.
    await ask({ email: 'mia@example.ch', on: true });
    expect(await rows('mia@example.ch')).toHaveLength(1);

    // Back from the mail on another device: the cart is there.
    const elsewhere = new Map<string, string>();
    const back = await req('GET', `/warenkorb/zurueck/${kept.token}`, undefined, { cookies: elsewhere });
    expect(back.headers.get('location')).toBe('/kasse');
    expect((await req('GET', '/warenkorb', undefined, { cookies: elsewhere })).data).toContain('Kaffee');
    expect((await req('GET', '/warenkorb/zurueck/erfunden', undefined, { cookies: new Map() })).headers.get('location')).toBe('/warenkorb');

    // Ordering stops a waiting reminder and counts for a sent one.
    await ask({ email: 'ben@example.ch', name: 'Ben', on: true });
    await req('POST', '/kasse', undefined, {
      cookies: cart,
      form: { name: 'Ben', email: 'ben@example.ch', street: 'Weg 2', zip: '8000', city: 'Zürich', country: 'CH', shippingMethod: 'ship', payment: 'invoice', acceptTerms: '1' },
    });
    expect((await rows('ben@example.ch'))[0].ordered_at).not.toBeNull();
    await sql`update cart_reminders set remind_at = now() - interval '1 minute'`;
    expect(await sendCartReminders()).toBe(0);
    expect((await req('GET', '/api/shop/cart-reminders')).data).toMatchObject({ sent: 1, ordered: 0, waiting: 0 });

    // «Forget me» removes it at once; after 14 days the rest is wiped anyway.
    expect((await req('GET', `/warenkorb/vergessen/${kept.token}`, undefined, { cookies: new Map() })).status).toBe(200);
    expect(await rows('mia@example.ch')).toHaveLength(0);
    await sql`update cart_reminders set created_at = now() - interval '15 days'`;
    await cleanCartReminders();
    expect(await sql`select 1 from cart_reminders where email <> '' or items <> '[]'`).toHaveLength(0);
    // The privacy policy says what happens.
    const legal = await req('POST', '/api/legal/generate', {});
    const ds = legal.data.pages.find((x: { slug: string }) => x.slug === 'datenschutz');
    expect(JSON.stringify((await req('GET', `/api/entries/${ds.id}`)).data.entry.data)).toContain('einmal per E-Mail daran zu erinnern');
    await req('PATCH', '/api/settings', { shop: { cartReminders: { enabled: false, hours: 4 } } });
  });

  it('warns once when an order takes a product below its stock limit', async () => {
    const shopper = new Map<string, string>();
    const mk = async (title: string, data: Record<string, unknown>) => {
      const e = (await req('POST', '/api/entries', { collection: 'products', data: { title, price: 1000, ...data } })).data.entry;
      await req('POST', `/api/entries/${e.id}/publish`, {});
      return e;
    };
    const honig = await mk('Waldhonig', { stock: 6, stockAlert: 5 });
    const salz = await mk('Kräutersalz', { stock: 20 });
    await req('PATCH', '/api/settings', { shop: { lowStock: { threshold: 3, email: true } }, business: { email: 'laden@example.ch' } });
    const buy = async (id: string, qty: number) => {
      await req('POST', '/warenkorb/add', undefined, { cookies: shopper, form: { product: id, qty: String(qty) } });
      await req('POST', '/kasse', undefined, {
        cookies: shopper,
        form: { name: 'Ida', email: 'ida@example.ch', street: 'Weg 3', zip: '8000', city: 'Zürich', country: 'CH', shippingMethod: 'pickup', payment: 'invoice', acceptTerms: '1' },
      });
    };
    const settle = () => new Promise((r) => setTimeout(r, 150));
    const until = async (ok: () => boolean) => {
      for (let i = 0; i < 40 && !ok(); i++) await settle();
    };
    const warned = () => outbox.filter((m) => m.subject.startsWith('Wenig an Lager'));
    const before = warned().length;
    await buy(honig.id, 1);
    await buy(salz.id, 2);
    await until(() => warned().length > before);
    await settle();
    // Honey crossed its own limit (6 → 5), salt is far from the shop's.
    expect(warned().length - before).toBe(1);
    const mail = warned().at(-1)!;
    expect(mail.to).toBe('laden@example.ch');
    expect(mail.text).toContain('Waldhonig: noch 5');
    const [bell] = await sql`select title, href from notifications where kind = 'stock' order by created_at desc limit 1`;
    expect(bell).toMatchObject({ title: 'Nur noch 5 an Lager: Waldhonig', href: `/inhalte/products/${honig.id}` });
    // Already below: no second warning; on the dashboard it stays listed.
    await buy(honig.id, 1);
    await settle();
    expect(warned().length - before).toBe(1);
    const dash = await req('GET', '/api/dashboard');
    expect(dash.data.lowStock).toEqual(expect.arrayContaining([{ id: honig.id, title: 'Waldhonig', variant: null, stock: 4, limit: 5 }]));
    expect(dash.data.lowStock.some((x: { id: string }) => x.id === salz.id)).toBe(false);
    // Mail off: the bell still rings.
    await req('PATCH', '/api/settings', { shop: { lowStock: { threshold: 17, email: false } } });
    await buy(salz.id, 1);
    const latest = async () => (await sql`select title from notifications where kind = 'stock' order by created_at desc limit 1`)[0].title as string;
    for (let i = 0; i < 40 && (await latest()) !== 'Nur noch 17 an Lager: Kräutersalz'; i++) await settle();
    expect(await latest()).toBe('Nur noch 17 an Lager: Kräutersalz');
    expect(warned().length - before).toBe(1);
    await req('PATCH', '/api/settings', { shop: { lowStock: { threshold: 3, email: true } } });
    for (const e of [honig, salz]) await req('DELETE', `/api/entries/${e.id}`);
  });

  it('asks people of a role for a second factor before anything else', async () => {
    resetRateLimits();
    expect((await req('PUT', '/api/security/2fa', { roles: ['member'] })).status).toBe(400);
    expect((await req('PUT', '/api/security/2fa', { roles: ['gibts-nicht'] })).status).toBe(400);
    const tom = await req('POST', '/api/users', { email: 'tom@example.ch', name: 'Tom', role: 'author' });
    const tomC = new Map<string, string>();
    await req('POST', '/api/login', { email: 'tom@example.ch', password: tom.data.temporaryPassword }, { cookies: tomC });
    expect((await req('GET', '/api/entries?collection=posts', undefined, { cookies: tomC })).status).toBe(200);

    expect((await req('PUT', '/api/security/2fa', { roles: ['author'] })).data.require2fa).toEqual(['author']);
    expect((await req('GET', '/api/roles')).data.require2fa).toEqual(['author']);
    // From the next request on, only setting up a factor is open.
    const session = await req('GET', '/api/session', undefined, { cookies: tomC });
    expect(session.data.user.must_setup_2fa).toBe(true);
    const blocked = await req('GET', '/api/entries?collection=posts', undefined, { cookies: tomC });
    expect(blocked.status).toBe(403);
    expect(blocked.data.details).toEqual({ code: 'setup-2fa' });
    const { secret } = (await req('POST', '/api/me/totp/start', {}, { cookies: tomC })).data;
    expect((await req('POST', '/api/me/totp/enable', { code: totpCode(secret) }, { cookies: tomC })).status).toBe(200);
    expect((await req('GET', '/api/session', undefined, { cookies: tomC })).data.user.must_setup_2fa).toBe(false);
    expect((await req('GET', '/api/entries?collection=posts', undefined, { cookies: tomC })).status).toBe(200);
    // The only factor can't be switched off while the role asks for it.
    expect((await req('POST', '/api/me/totp/disable', { password: tom.data.temporaryPassword }, { cookies: tomC })).status).toBe(400);

    // A passkey-only account doesn't get in with the password alone, and keeps its last passkey.
    const pia = await req('POST', '/api/users', { email: 'pia@example.ch', name: 'Pia', role: 'author' });
    await sql`insert into passkeys (id, user_id, public_key) values ('pk-pia', ${pia.data.user.id}, '\\x00')`;
    const piaC = new Map<string, string>();
    expect((await req('POST', '/api/login', { email: 'pia@example.ch', password: pia.data.temporaryPassword }, { cookies: piaC })).status).toBe(403);
    await req('PUT', '/api/security/2fa', { roles: [] });
    expect((await req('POST', '/api/login', { email: 'pia@example.ch', password: pia.data.temporaryPassword }, { cookies: piaC })).status).toBe(200);
    await req('PUT', '/api/security/2fa', { roles: ['author'] });
    expect((await req('DELETE', '/api/me/passkeys/pk-pia', undefined, { cookies: piaC })).status).toBe(400);

    // The Werkbank's settings can't switch the rule off on the side.
    await req('PATCH', '/api/settings', { security: { allowCustomScripts: false, require2fa: [] } });
    expect((await req('GET', '/api/roles')).data.require2fa).toEqual(['author']);
    await req('PUT', '/api/security/2fa', { roles: [] });
    resetRateLimits();
  });

  it('defines own roles with exactly the ticked rights, and nobody hands out more than they hold', async () => {
    expect((await req('POST', '/api/roles', { name: 'Zu viel', caps: ['data.sql'] })).status).toBe(403);
    expect((await req('POST', '/api/roles', { name: 'Unsinn', caps: ['fly'] })).status).toBe(400);
    const shop = (await req('POST', '/api/roles', { name: 'Shop-Team', help: 'Bestellungen', caps: ['orders.view', 'orders.manage', 'media.upload'] })).data.role;
    expect(shop).toMatchObject({ id: 'shop-team', werkbank: false });
    const sara = await req('POST', '/api/users', { email: 'sara@example.ch', name: 'Sara', role: 'shop-team' });
    expect(sara.status).toBe(200);
    const saraC = new Map<string, string>();
    await req('POST', '/api/login', { email: 'sara@example.ch', password: sara.data.temporaryPassword }, { cookies: saraC });
    const me = await req('GET', '/api/session', undefined, { cookies: saraC });
    expect(me.data.caps.sort()).toEqual(['media.upload', 'orders.manage', 'orders.view']);
    expect(me.data.user).toMatchObject({ role: 'shop-team', role_name: 'Shop-Team', allowed_modes: ['studio'] });
    expect((await req('GET', '/api/orders', undefined, { cookies: saraC })).status).toBe(200);
    expect((await req('GET', '/api/entries?collection=pages', undefined, { cookies: saraC })).status).toBe(403);
    // A right ticked in the matrix counts from the next request on.
    await req('PUT', `/api/roles/${shop.id}`, { caps: [...shop.caps, 'content.edit.own'], werkbank: true });
    expect((await req('GET', '/api/entries?collection=posts', undefined, { cookies: saraC })).status).toBe(200);
    expect((await req('GET', '/api/session', undefined, { cookies: saraC })).data.user.allowed_modes).toEqual(['studio', 'werkbank']);

    // Someone who manages the team but not the shop can't give out shop rights, nor reach people with more rights.
    const hr = (await req('POST', '/api/roles', { name: 'Personal', caps: ['users.manage'] })).data.role;
    const ute = await req('POST', '/api/users', { email: 'ute@example.ch', name: 'Ute', role: hr.id });
    const uteC = new Map<string, string>();
    await req('POST', '/api/login', { email: 'ute@example.ch', password: ute.data.temporaryPassword }, { cookies: uteC });
    expect((await req('POST', '/api/roles', { name: 'Hintertür', caps: ['content.edit'] }, { cookies: uteC })).status).toBe(403);
    expect((await req('PUT', `/api/roles/${hr.id}`, { caps: ['users.manage', 'settings.manage'] }, { cookies: uteC })).status).toBe(403);
    expect((await req('POST', '/api/users', { email: 'neu@example.ch', name: 'Neu', role: 'editor' }, { cookies: uteC })).status).toBe(403);
    expect((await req('POST', '/api/users', { email: 'neu@example.ch', name: 'Neu', role: 'shop-team' }, { cookies: uteC })).status).toBe(403);
    expect((await req('PATCH', `/api/users/${sara.data.user.id}`, { role: 'author' }, { cookies: uteC })).status).toBe(403);
    expect((await req('POST', `/api/users/${sara.data.user.id}/reset`, {}, { cookies: uteC })).status).toBe(403);
    expect((await req('PATCH', `/api/users/${ute.data.user.id}`, { role: 'admin' }, { cookies: uteC })).status).toBe(400);
    expect((await req('POST', '/api/users', { email: 'nora@example.ch', name: 'Nora', role: 'member' }, { cookies: uteC })).status).toBe(200);
    expect((await req('POST', '/api/users', { email: 'x@example.ch', name: 'X', role: 'gibts-nicht' })).status).toBe(400);

    const list = await req('GET', '/api/roles');
    expect(list.data.roles.find((r: { id: string }) => r.id === 'shop-team')).toMatchObject({ builtin: false, users: 1, editable: true });
    expect(list.data.capabilities.length).toBeGreaterThan(20);
    // Deleting needs a new home for the people who have it.
    expect((await req('DELETE', `/api/roles/${shop.id}`)).status).toBe(400);
    expect((await req('DELETE', `/api/roles/${shop.id}?moveTo=author`)).data.moved).toBe(1);
    expect((await req('GET', '/api/session', undefined, { cookies: saraC })).data.user.role).toBe('author');
    expect((await req('DELETE', `/api/roles/${hr.id}?moveTo=member`)).status).toBe(200);
    expect((await req('GET', '/api/session', undefined, { cookies: uteC })).data.user).toBeNull();
  });

  it('edits one cell of the data view and round-trips a type through CSV', async () => {
    const p = (await req('POST', '/api/entries', { collection: 'products', data: { title: 'Bergkäse', price: 1200, sku: 'BK-1', stock: 5 } })).data.entry;
    // One cell: text in, checked like the editor, the fresh row back.
    const cell = await req('POST', `/api/entries/${p.id}/field`, { field: 'price', text: '14,50' });
    expect(cell.data.row.fields.price).toBe(1450);
    expect((await req('POST', `/api/entries/${p.id}/field`, { field: 'stock', text: '9' })).data.row.fields.stock).toBe(9);
    const bad = await req('POST', `/api/entries/${p.id}/field`, { field: 'price', text: 'gratis' });
    expect(bad.status).toBe(400);
    expect(bad.data.error).toBe('«Preis (inkl. MwSt.)»: «gratis» ist keine Zahl.');
    expect((await req('POST', `/api/entries/${p.id}/field`, { field: 'title', text: ' ' })).status).toBe(400);
    expect((await req('POST', `/api/entries/${p.id}/field`, { field: 'images', text: 'x' })).status).toBe(400);

    const csv = (await req('GET', '/api/data/products/export')).data as string;
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
    expect(lines[0].split(';').slice(0, 5)).toEqual(['id', 'slug', 'status', 'title', 'price']);
    const mine = lines.find((l) => l.startsWith(p.id))!;
    expect(mine).toContain(';Bergkäse;14.50;');

    // Back in, edited in a spreadsheet: one changed, one new, one broken, one untouched.
    const head = lines[0];
    const changed = mine.replace(';14.50;', ';16.00;');
    const file = [head, changed, ';;;Alpkäse;8.90', ';;;Ohne Preis;viel', ';;;;3.00'].join('\r\n');
    const dry = await req('POST', '/api/data/products/import', { csv: file, dryRun: true });
    expect(dry.data).toMatchObject({ created: 1, updated: 1, unchanged: 0, errorCount: 2 });
    expect(dry.data.errors.map((e: { line: number }) => e.line)).toEqual([4, 5]);
    expect((await req('GET', `/api/entries/${p.id}`)).data.entry.data.price).toBe(1450);
    const done = await req('POST', '/api/data/products/import', { csv: file, dryRun: false, publish: true });
    expect(done.data).toMatchObject({ created: 1, updated: 1 });
    const after = (await req('GET', `/api/entries/${p.id}`)).data.entry;
    expect(after).toMatchObject({ status: 'published', data: { price: 1600, stock: 9, sku: 'BK-1' } });
    const list = await req('GET', '/api/entries?collection=products&limit=500');
    const alp = list.data.entries.find((x: { title: string }) => x.title === 'Alpkäse');
    expect(alp.fields.price).toBe(890);
    // The same file again changes nothing.
    expect((await req('POST', '/api/data/products/import', { csv: [head, changed].join('\n'), dryRun: true })).data).toMatchObject({ updated: 0, unchanged: 1 });
    expect((await req('POST', '/api/data/products/import', { csv: 'foo;bar\n1;2', dryRun: true })).status).toBe(400);
    for (const id of [p.id, alp.id]) await req('DELETE', `/api/entries/${id}`);
  });

  it('renames, merges and removes categories and tags across all entries', async () => {
    const mk = async (title: string, data: Record<string, unknown>) => {
      const e = (await req('POST', '/api/entries', { collection: 'posts', data: { title, ...data } })).data.entry;
      await req('POST', `/api/entries/${e.id}/publish`, {});
      return e;
    };
    const a = await mk('Tax A', { category: 'Velotour', tags: ['see', 'sommer'] });
    const b = await mk('Tax B', { category: 'Wanderung', tags: ['sommer', 'berg'] });
    const groups = (await req('GET', '/api/taxonomy/posts')).data.fields;
    expect(groups.map((g: { key: string }) => g.key)).toEqual(['category', 'tags']);
    expect(groups[1].values.find((v: { value: string }) => v.value === 'sommer')).toMatchObject({ count: 2, published: 2 });
    // Rename: working copy and website alike.
    expect((await req('POST', '/api/taxonomy/posts', { field: 'category', from: 'Velotour', to: '  Velo Tour ' })).data.count).toBe(1);
    const ea = (await req('GET', `/api/entries/${a.id}`)).data.entry;
    expect(ea.data.category).toBe('Velo Tour');
    expect(ea.published_data.category).toBe('Velo Tour');
    // Merge: a tag renamed into an existing one stays once.
    await req('POST', '/api/taxonomy/posts', { field: 'tags', from: 'see', to: 'sommer' });
    expect((await req('GET', `/api/entries/${a.id}`)).data.entry.data.tags).toEqual(['sommer']);
    // Remove.
    await req('POST', '/api/taxonomy/posts', { field: 'tags', from: 'berg', to: '' });
    expect((await req('GET', `/api/entries/${b.id}`)).data.entry.data.tags).toEqual(['sommer']);
    expect((await req('POST', '/api/taxonomy/posts', { field: 'title', from: 'x', to: 'y' })).status).toBe(400);
    for (const e of [a, b]) await req('DELETE', `/api/entries/${e.id}`);
  });

  it('replaces a file under the same id and handles many files at once', async () => {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const png = (w: number, h: number, r: number) =>
      sharp({ create: { width: w, height: h, channels: 3, background: { r, g: 120, b: 80 } } })
        .png()
        .toBuffer();
    const send = async (url: string, name: string, buf: Buffer, type = 'image/png') => {
      const form = new FormData();
      form.append('file', new File([new Uint8Array(buf)], name, { type }));
      const r = await app.request(url, { method: 'POST', body: form, headers: { 'X-Nova': '1', cookie } });
      return { status: r.status, data: await r.json() };
    };
    const first = (await send('/api/media', 'alt.png', await png(400, 300, 200))).data.media[0];
    const page = await req('POST', '/api/entries', { collection: 'pages', data: { title: 'Mit Bild', blocks: [{ id: 'img1', type: 'image', props: { image: first.id } }] } });
    await req('POST', `/api/entries/${page.data.entry.id}/publish`, {});
    // Replace: same id, new size and version – the page shows the new file without being touched.
    const rep = await send(`/api/media/${first.id}/replace`, 'neu.png', await png(800, 400, 20));
    expect(rep.status).toBe(200);
    expect(rep.data.media).toMatchObject({ id: first.id, filename: 'neu.png', width: 800, height: 400, version: first.version + 1 });
    const html = (await req('GET', `/${page.data.entry.slug}`, undefined, { cookies: new Map() })).data as string;
    expect(html).toContain(`/media/${first.id}/v${first.version + 1}/`);
    // Only the same kind of file.
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
    expect((await send(`/api/media/${first.id}/replace`, 'x.pdf', pdf, 'application/pdf')).status).toBe(400);
    // Bulk: folder and tag for all; deleting leaves files in use unless asked again.
    const second = (await send('/api/media', 'frei.png', await png(50, 50, 90))).data.media[0];
    const moved = await req('POST', '/api/media/bulk', { ids: [first.id, second.id], action: 'move', folder: 'Sammlung' });
    expect(moved.data.done).toHaveLength(2);
    await req('POST', '/api/media/bulk', { ids: [first.id, second.id], action: 'tag', tag: 'sommer' });
    await req('POST', '/api/media/bulk', { ids: [first.id], action: 'tag', tag: 'sommer' });
    const [row] = await sql`select folder, tags from media where id = ${first.id}`;
    expect(row).toMatchObject({ folder: 'Sammlung', tags: ['sommer'] });
    const del = await req('POST', '/api/media/bulk', { ids: [first.id, second.id], action: 'delete' });
    expect(del.data).toEqual({ done: [second.id], inUse: [first.id] });
    const forced = await req('POST', '/api/media/bulk', { ids: [first.id], action: 'delete', force: true });
    expect(forced.data.done).toEqual([first.id]);
    await req('DELETE', `/api/entries/${page.data.entry.id}`);
  });

  it('keeps media folders of their own: empty ones, renaming, merging and removing without losing files', async () => {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const folders = async () => (await req('GET', '/api/media?limit=1')).data.folders as { folder: string; n: number }[];
    const count = async (name: string) => (await folders()).find((f) => f.folder === name)?.n;
    // An empty folder exists before its first file; names are tidied, doubles refused.
    const made = await req('POST', '/api/media/folders', { name: '  Team /  2026 ' });
    expect(made.data.folder).toBe('Team - 2026');
    expect(await count('Team - 2026')).toBe(0);
    expect((await req('POST', '/api/media/folders', { name: 'Team - 2026' })).status).toBe(400);
    expect((await req('POST', '/api/media/folders', { name: '   ' })).status).toBe(400);
    // Uploading into it, and filtering by it.
    const form = new FormData();
    const buf = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#c33' } }).png().toBuffer();
    form.append('file', new File([new Uint8Array(buf)], 'team.png', { type: 'image/png' }));
    form.append('folder', 'Team - 2026');
    const up = await app.request('/api/media', { method: 'POST', body: form, headers: { 'X-Nova': '1', cookie } });
    const file = (await up.json()).media[0];
    expect(file.folder).toBe('Team - 2026');
    const inside = await req('GET', `/api/media?folder=${encodeURIComponent('Team - 2026')}`);
    expect(inside.data.media.map((m: { id: string }) => m.id)).toEqual([file.id]);
    expect(await count('Team - 2026')).toBe(1);
    // Moving into a folder that doesn't exist yet makes it.
    await req('POST', '/api/media/bulk', { ids: [file.id], action: 'move', folder: 'Archiv' });
    expect(await count('Archiv')).toBe(1);
    expect(await count('Team - 2026')).toBe(0);
    // Renaming into an existing name merges both.
    expect((await req('PATCH', '/api/media/folders', { from: 'Archiv', to: 'Team - 2026' })).data.moved).toBe(1);
    expect(await count('Archiv')).toBeUndefined();
    expect(await count('Team - 2026')).toBe(1);
    // Removing the folder keeps the file, now without a folder.
    const gone = await req('DELETE', `/api/media/folders?name=${encodeURIComponent('Team - 2026')}`);
    expect(gone.data.moved).toBe(1);
    expect(await count('Team - 2026')).toBeUndefined();
    const [row] = await sql`select folder from media where id = ${file.id}`;
    expect(row.folder).toBe('');
    expect((await req('DELETE', '/api/media/folders?name=gibts-nicht')).status).toBe(404);
    // Authors may make folders but not rename or remove them.
    const ann = await req('POST', '/api/users', { email: 'ann@example.ch', name: 'Ann', role: 'author' });
    const annC = new Map<string, string>();
    await req('POST', '/api/login', { email: 'ann@example.ch', password: ann.data.temporaryPassword }, { cookies: annC });
    expect((await req('POST', '/api/media/folders', { name: 'Von Ann' }, { cookies: annC })).status).toBe(200);
    expect((await req('DELETE', '/api/media/folders?name=Von%20Ann', undefined, { cookies: annC })).status).toBe(403);
    await req('DELETE', '/api/media/folders?name=Von%20Ann');
    await req('DELETE', `/api/media/${file.id}`);
  });
});

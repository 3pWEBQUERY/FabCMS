import { describe, expect, it } from 'vitest';
import { sanitizeRichText, safeHref } from '../src/shared/richtext';
import { slugify, readability, formatPrice, excerpt } from '../src/shared/text';
import { openStatus, compactHours, parseTime } from '../src/shared/hours';
import { parseDay, formatDay, addMonths, monthGrid, longDay } from '../src/shared/dates';
import { computeSlots, zonedToUtc, localDay, type BookingResource, type BookingService } from '../src/shared/booking';
import { analyzeSeo } from '../src/shared/seo-analyze';
import { createBlock, sentences } from '../src/shared/blocks';
import { validateFields } from '../src/shared/fields';
import { matchRoute, entryPath } from '../src/shared/paths';
import { totpCode, verifyTotp, base32Encode, sign, unsign, hashPassword, verifyPassword } from '../src/server/lib/crypto';
import { csvEscape } from '../src/server/lib/http';
import { html, raw } from '../src/site/html';
import { scopeCss } from '../src/site/blocks';
import { woffToSfnt } from '../src/server/og';
import { entryAccess, mayRead, memberLevel } from '../src/shared/members';
import { orderSlots, foodTotals } from '../src/shared/ordering';
import { parseWxr, parseShopifyCsv, parseMarkdownFile, parseFeed, parseCsv } from '../src/server/importer/parse';
import { htmlToBlocks } from '../src/server/importer/run';
import { validQrIban, isQrIban, mod10, qrReference, scorReference, qrPayload, referenceFor } from '../src/shared/qrbill';
import { generateSdk } from '../src/server/sdk';
import { runHook, checkHookCode } from '../src/server/hooks';
import { DICT } from '../src/site/dict';
import * as Y from 'yjs';
import { applyData, toData, changedBlocks } from '../src/shared/collab-doc';
import { ADMIN_DICT } from '../src/admin/i18n/all';
import { tr } from '../src/site/i18n';
import { mergeTranslation, translatableData } from '../src/shared/i18n';
import { compactHours as compactHoursL } from '../src/shared/hours';
import { BUILTIN_COLLECTIONS } from '../src/shared/collections';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

describe('rich text sanitizer', () => {
  it('drops scripts, handlers and dangerous urls', () => {
    expect(sanitizeRichText('<p onclick="x()">Hi<script>alert(1)</script></p>')).toBe('<p>Hi</p>');
    expect(sanitizeRichText('<a href="javascript:alert(1)">x</a>')).toBe('x');
    expect(sanitizeRichText('<a href=" jav&#x61;script:alert(1)">x</a>')).toBe('x');
    expect(sanitizeRichText('<img src=x onerror=alert(1)>text')).toBe('text');
    expect(sanitizeRichText('<svg><script>1</script></svg>ok')).toBe('ok');
    expect(sanitizeRichText('<style>body{}</style><p>a</p>')).toBe('<p>a</p>');
  });
  it('keeps allowed formatting and normalises tags', () => {
    expect(sanitizeRichText('<p><b>fett</b> und <i>kursiv</i></p>')).toBe('<p><strong>fett</strong> und <em>kursiv</em></p>');
    expect(sanitizeRichText('<a href="/kontakt" target="_blank">K</a>')).toBe('<a href="/kontakt">K</a>');
    expect(sanitizeRichText('<a href="https://x.ch">x</a>')).toBe('<a href="https://x.ch" rel="noopener">x</a>');
    expect(sanitizeRichText('<ul><li>a<li>b</ul>')).toContain('<ul><li>a');
  });
  it('closes unclosed tags and escapes stray brackets', () => {
    expect(sanitizeRichText('<p><strong>offen')).toBe('<p><strong>offen</strong></p>');
    expect(sanitizeRichText('1 < 2 & 3 > 2')).toBe('1 &lt; 2 &amp; 3 &gt; 2');
  });
  it('vets hrefs', () => {
    expect(safeHref('//evil.com')).toBeNull();
    expect(safeHref('mailto:a@b.ch')).toBe('mailto:a@b.ch');
    expect(safeHref('data:text/html,x')).toBeNull();
  });
});

describe('text helpers', () => {
  it('slugifies German text', () => {
    expect(slugify('Über uns & Team')).toBe('ueber-uns-und-team');
    expect(slugify('Grüsse aus Zürich!')).toBe('gruesse-aus-zuerich');
    expect(slugify('  Café à la carte ')).toBe('cafe-a-la-carte');
  });
  it('formats Swiss prices', () => {
    expect(formatPrice(1800)).toBe('18.–');
    expect(formatPrice(2450)).toBe('24.50');
  });
  it('builds excerpts at word boundaries', () => {
    expect(excerpt('Ein kurzer Satz.', 100)).toBe('Ein kurzer Satz.');
    expect(excerpt('Eins zwei drei vier fünf sechs', 15)).toBe('Eins zwei drei …');
  });
  it('joins sentences without double punctuation', () => {
    expect(sentences('Seit 1987', 'Gut gekocht.', '')).toBe('Seit 1987. Gut gekocht.');
  });
  it('rates easy German as easier than bureaucratic German', () => {
    const easy = readability('Wir kochen frisch. Das Gemüse kommt vom Hof. Komm vorbei.');
    const hard = readability('Die Inanspruchnahme der Dienstleistungsangebote erfordert grundsätzlich eine vorgängige schriftliche Terminvereinbarungsbestätigung.');
    expect(easy.score).toBeGreaterThan(hard.score);
  });
});

describe('opening hours', () => {
  const hours = [1, 2, 3, 4, 5]
    .map((day) => ({ day, closed: false, slots: [{ from: '09:00', to: '18:00' }] }))
    .concat([
      { day: 6, closed: false, slots: [{ from: '09:00', to: '16:00' }] },
      { day: 7, closed: true, slots: [] },
    ]);
  it('knows when it is open (Zurich time)', () => {
    // Wednesday 2026-10-07 10:00 in Zurich = 08:00 UTC (CEST)
    expect(openStatus(hours, 'Europe/Zurich', new Date('2026-10-07T08:00:00Z'))).toEqual({ open: true, label: 'Jetzt geöffnet – bis 18:00' });
    expect(openStatus(hours, 'Europe/Zurich', new Date('2026-10-07T05:00:00Z'))?.label).toBe('Geschlossen – öffnet heute um 09:00');
    // Saturday evening → next opening Monday
    expect(openStatus(hours, 'Europe/Zurich', new Date('2026-10-10T18:00:00Z'))?.label).toBe('Geschlossen – öffnet am Montag um 09:00');
  });
  it('groups identical days', () => {
    expect(compactHours(hours)).toEqual([
      { days: 'Mo–Fr', time: '09:00–18:00' },
      { days: 'Sa', time: '09:00–16:00' },
      { days: 'So', time: 'geschlossen' },
    ]);
  });
  it('reads typed times', () => {
    for (const [typed, want] of [
      ['9', '09:00'],
      ['930', '09:30'],
      ['0930', '09:30'],
      ['9.30', '09:30'],
      ['9h30', '09:30'],
      ['18:15', '18:15'],
      ['1815', '18:15'],
      ['18 Uhr', '18:00'],
      ['24', '00:00'],
    ] as const)
      expect(parseTime(typed), typed).toBe(want);
    for (const bad of ['', 'abc', '25', '9:75', '24:30', '9:5', '12345']) expect(parseTime(bad), bad).toBeNull();
  });
});

describe('dates', () => {
  const today = new Date(2026, 9, 9); // Fr, 9. Oktober 2026
  it('reads typed dates the Swiss way', () => {
    for (const [typed, want] of [
      ['9.10.2026', '2026-10-09'],
      ['09.10.26', '2026-10-09'],
      ['9.10.', '2026-10-09'],
      ['9.10', '2026-10-09'],
      ['9/10/2026', '2026-10-09'],
      ['2026-10-09', '2026-10-09'],
      ['heute', '2026-10-09'],
      ['morgen', '2026-10-10'],
      ['29.2.2028', '2028-02-29'],
    ] as const)
      expect(parseDay(typed, today), typed).toBe(want);
    for (const bad of ['', 'bald', '31.2.2026', '29.2.2026', '13.13.2026', '0.1.2026']) expect(parseDay(bad, today), bad).toBeNull();
  });
  it('formats and walks the calendar', () => {
    expect(formatDay('2026-10-09')).toBe('09.10.2026');
    expect(longDay('2026-10-09')).toBe('Freitag, 9. Oktober 2026');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    const grid = monthGrid(2026, 9);
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe('2026-09-28'); // Monday before 1 October (a Thursday)
    expect(grid[3]).toBe('2026-10-01');
  });
});

describe('booking availability', () => {
  const tz = 'Europe/Zurich';
  const hours = [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, closed: day === 1, slots: [{ from: '18:00', to: '22:00' }] }));
  const table = (id: string, capacity: number): BookingResource => ({ id, name: id, kind: 'table', capacity, hours: null, ical_url: '', active: true, sort_index: 0 });
  const service: BookingService = {
    id: 's',
    name: 'Tisch',
    description: '',
    duration_min: 120,
    buffer_min: 0,
    price: null,
    deposit: 0,
    resource_ids: [],
    active: true,
    sort_index: 0,
  };
  const rules = { slotStep: 30, leadMinutes: 60, horizonDays: 60, maxParty: 8 };
  const now = new Date('2026-10-20T08:00:00Z');
  const base = { day: '2026-10-24', timeZone: tz, businessHours: hours, service, party: 2, busy: [], rules, now };

  it('converts local times across summer and winter time', () => {
    expect(zonedToUtc('2026-10-24', 19 * 60, tz).toISOString()).toBe('2026-10-24T17:00:00.000Z'); // CEST
    expect(zonedToUtc('2026-10-26', 19 * 60, tz).toISOString()).toBe('2026-10-26T18:00:00.000Z'); // CET
    expect(localDay(new Date('2026-10-24T22:30:00Z'), tz)).toMatchObject({ day: '2026-10-25', weekday: 7, minutes: 30 });
  });
  it('offers start times inside opening hours that leave room for the whole stay', () => {
    const slots = computeSlots({ ...base, resources: [table('t1', 4)] });
    expect(slots.map((s) => s.time)).toEqual(['18:00', '18:30', '19:00', '19:30', '20:00']);
    expect(computeSlots({ ...base, day: '2026-10-26', resources: [table('t1', 4)] })).toEqual([]); // closed Mondays
  });
  it('fills the smallest fitting table and skips taken ones', () => {
    const resources = [table('big', 6), table('small', 2)];
    expect(computeSlots({ ...base, resources })[0].resourceId).toBe('small');
    const busy = [{ resourceId: 'small', start: zonedToUtc('2026-10-24', 18 * 60, tz), end: zonedToUtc('2026-10-24', 20 * 60, tz) }];
    const slots = computeSlots({ ...base, resources, busy });
    expect(slots.find((s) => s.time === '18:00')?.resourceId).toBe('big');
    expect(slots.find((s) => s.time === '20:00')?.resourceId).toBe('small');
    expect(computeSlots({ ...base, party: 5, resources })).toHaveLength(5); // only the big table fits
    expect(computeSlots({ ...base, party: 9, resources })).toEqual([]); // over the limit
  });
  it('respects closures, lead time and the booking horizon', () => {
    const closure = [{ resourceId: null, start: zonedToUtc('2026-10-24', 0, tz), end: zonedToUtc('2026-10-25', 0, tz) }];
    expect(computeSlots({ ...base, resources: [table('t', 4)], busy: closure })).toEqual([]);
    const soon = new Date('2026-10-24T16:30:00Z'); // 18:30 local → 19:30 is the earliest
    expect(computeSlots({ ...base, now: soon, resources: [table('t', 4)] })[0].time).toBe('19:30');
    expect(computeSlots({ ...base, day: '2027-02-01', resources: [table('t', 4)] })).toEqual([]);
  });
});

describe('crypto', () => {
  it('produces RFC 6238 TOTP codes', () => {
    // RFC 6238 test secret "12345678901234567890", T = 59 s → 94287082 (8 digits) → 287082 (6 digits)
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(totpCode(secret, 59_000)).toBe('287082');
    expect(totpCode(secret, 1111111109_000)).toBe('081804');
    expect(verifyTotp(secret, '287082', 59_000 + 30_000)).toBe(true);
    expect(verifyTotp(secret, '287082', 59_000 + 120_000)).toBe(false);
  });
  it('signs and rejects tampered values', () => {
    const s = sign('cart', 'k');
    expect(unsign(s, 'k')).toBe('cart');
    expect(unsign(s.replace('cart', 'carx'), 'k')).toBeNull();
    expect(unsign(s, 'other')).toBeNull();
  });
  it('hashes passwords', async () => {
    const h = await hashPassword('ein langes passwort');
    expect(await verifyPassword('ein langes passwort', h)).toBe(true);
    expect(await verifyPassword('falsch', h)).toBe(false);
  });
});

describe('html & css safety', () => {
  it('escapes interpolations', () => {
    expect(html`<p title="${'"><script>'}">${'<b>'}</p>`.value).toBe('<p title="&quot;&gt;&lt;script&gt;">&lt;b&gt;</p>');
    expect(html`${raw('<b>ok</b>')}`.value).toBe('<b>ok</b>');
  });
  it('scopes block CSS and blocks breaking out of <style>', () => {
    expect(scopeCss('h2{color:red}', 'b-x')).toBe('#b-x h2{color:red}');
    expect(scopeCss('&:hover{opacity:.5}', 'b-x')).toBe('#b-x:hover{opacity:.5}');
    expect(scopeCss('</style><script>', 'b')).not.toContain('<');
  });
  it('neutralises spreadsheet formulas in CSV', () => {
    expect(csvEscape('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
  });
});

describe('fields & routes', () => {
  it('validates with human messages', () => {
    const errs = validateFields(
      [
        { key: 'title', type: 'text', label: 'Titel', required: true },
        { key: 'price', type: 'money', label: 'Preis', min: 0 },
      ],
      { title: '', price: -5 },
    );
    expect(errs.map((e) => e.message)).toEqual(['«Titel» fehlt noch.', '«Preis» muss mindestens 0 sein.']);
    expect(validateFields([{ key: 'price', type: 'money', label: 'Preis', min: 0 }], { price: 5 })).toEqual([]);
  });
  it('matches routes', () => {
    expect(matchRoute('/journal/:slug', '/journal/hallo-welt')).toBe('hallo-welt');
    expect(matchRoute('/journal/:slug', '/journal/a/b')).toBeNull();
    expect(entryPath({ id: 'pages', route: '/:slug' }, '')).toBe('/');
  });
});

describe('SEO coach', () => {
  it('gives concrete actions with a target', () => {
    const hero = createBlock('hero', { title: 'Willkommen', text: 'Schön, dass du da bist.' });
    const r = analyzeSeo({
      title: 'Start',
      slug: 'start',
      isHome: false,
      ownH1: false,
      seo: { keyword: 'Restaurant Uster' },
      blocks: [hero],
      siteName: 'Linde',
      titleTemplate: '%s · %site',
      alts: {},
    });
    const h1 = r.checks.find((c) => c.id === 'kw-h1')!;
    expect(h1.status).toBe('bad');
    expect(h1.message).toBe('Füge «Restaurant Uster» in die erste Überschrift ein.');
    expect(h1.target).toEqual({ blockId: hero.id, field: 'title' });
  });
  it('flags missing alt texts', () => {
    const img = createBlock('image', { image: 'm1' });
    const r = analyzeSeo({ title: 'X', slug: 'x', isHome: false, ownH1: false, seo: {}, blocks: [img], siteName: 'S', titleTemplate: '%s', alts: { m1: '' } });
    expect(r.checks.find((c) => c.id === 'alt')?.status).toBe('bad');
  });
});

describe('og fonts', () => {
  it('unpacks WOFF to a valid sfnt', () => {
    const require = createRequire(import.meta.url);
    const woff = readFileSync(require.resolve('@fontsource/fraunces/files/fraunces-latin-500-normal.woff'));
    const ttf = woffToSfnt(woff);
    expect(ttf.readUInt32BE(0)).toBe(woff.readUInt32BE(4));
    expect(ttf.readUInt16BE(4)).toBe(woff.readUInt16BE(12));
  });
});

describe('member access', () => {
  it('decides who may read what', () => {
    expect(entryAccess({ title: 'x' })).toBe('public');
    expect(entryAccess({ title: 'x', access: 'paid' })).toBe('paid');
    expect(entryAccess({ title: 'x', access: 'irgendwas' })).toBe('public');
    expect(mayRead('public', null)).toBe(true);
    expect(mayRead('members', null)).toBe(false);
    expect(mayRead('members', 'member')).toBe(true);
    expect(mayRead('paid', 'member')).toBe(false);
    expect(mayRead('paid', 'paid')).toBe(true);
  });

  it('counts running subscriptions and granted access as paid', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    expect(memberLevel({ paid_until: null, subscription_status: '' }, now)).toBe('member');
    expect(memberLevel({ paid_until: null, subscription_status: 'active' }, now)).toBe('paid');
    expect(memberLevel({ paid_until: '2026-10-31T00:00:00Z', subscription_status: 'canceling' }, now)).toBe('paid');
    expect(memberLevel({ paid_until: '2026-10-01T00:00:00Z', subscription_status: 'canceled' }, now)).toBe('member');
  });
});

describe('take-away and delivery', () => {
  const hours = [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, closed: day === 1, slots: [{ from: '11:30', to: '14:00' }] }));

  it('offers times inside the opening hours, after the preparation time', () => {
    // Tuesday 2026-10-13, 11:50 in Zurich (summer time, UTC+2).
    const now = new Date('2026-10-13T09:50:00Z');
    const days = orderSlots({ hours, timeZone: 'Europe/Zurich', now, prepMinutes: 30, slotMinutes: 15 });
    expect(days[0].label).toBe('Heute');
    expect(days[0].slots[0].time).toBe('12:30'); // 11:50 + 30 min → next quarter
    expect(days[0].slots.at(-1)!.time).toBe('14:00');
    expect(days[1].label).toBe('Morgen');
    expect(days[1].slots[0].time).toBe('11:45');
  });

  it('skips closed days and days that are over', () => {
    // Sunday 2026-10-11, 15:00: today is over, Monday is closed → Tuesday.
    const days = orderSlots({ hours, timeZone: 'Europe/Zurich', now: new Date('2026-10-11T13:00:00Z'), prepMinutes: 30, slotMinutes: 15 });
    expect(days[0].day).toBe('2026-10-13');
  });

  it('splits Swiss VAT between food (reduced) and alcohol (standard)', () => {
    const t = foodTotals(
      [
        { id: 'a', title: 'Pizza', size: '', price: 2000, q: 2, vat: 'reduced' },
        { id: 'b', title: 'Bier', size: '', price: 600, q: 1, vat: 'standard' },
      ],
      500,
      { standard: 8.1, reduced: 2.6, none: 0 } as never,
    );
    expect(t.subtotal).toBe(4600);
    expect(t.total).toBe(5100);
    expect(t.vat).toEqual([
      { rate: 8.1, amount: 45 },
      { rate: 2.6, amount: 114 },
    ]);
  });
});

describe('Swiss QR bill', () => {
  it('validates IBANs and tells QR-IBANs apart', () => {
    expect(validQrIban('CH93 0076 2011 6238 5295 7')).toBe(true);
    expect(validQrIban('CH93 0076 2011 6238 5295 8')).toBe(false);
    expect(validQrIban('DE89 3704 0044 0532 0130 00')).toBe(false); // valid, but not CH/LI
    expect(validQrIban('CH44 3199 9123 0008 8901 2')).toBe(true);
    expect(isQrIban('CH44 3199 9123 0008 8901 2')).toBe(true);
    expect(isQrIban('CH93 0076 2011 6238 5295 7')).toBe(false);
  });

  it('computes references like the standard examples', () => {
    expect(mod10('21000000000313947143000901')).toBe(7);
    expect(qrReference('21000000000313947143000901')).toBe('210000000003139471430009017');
    expect(scorReference('539007547034')).toBe('RF18539007547034');
    expect(referenceFor('CH93 0076 2011 6238 5295 7', 'B-1042')).toEqual({ type: 'SCOR', value: scorReference('B1042') });
  });

  it('builds the payload in the order the banks expect', () => {
    const lines = qrPayload({
      iban: 'CH4431999123000889012',
      creditor: { name: 'Robert Schneider AG', street: 'Rue du Lac 1268', zip: '2501', city: 'Biel', country: 'CH' },
      amount: 199595,
      currency: 'CHF',
      debtor: { name: 'Pia-Maria Rutschmann-Schnyder', street: 'Grosse Marktgasse 28', zip: '9400', city: 'Rorschach', country: 'CH' },
      reference: '210000000003139471430009017',
      message: 'Auftrag vom 15.06.2020',
    }).split('\r\n');
    expect(lines).toHaveLength(31);
    expect(lines.slice(0, 4)).toEqual(['SPC', '0200', '1', 'CH4431999123000889012']);
    expect(lines.slice(4, 11)).toEqual(['S', 'Robert Schneider AG', 'Rue du Lac 1268', '', '2501', 'Biel', 'CH']);
    expect(lines.slice(18, 20)).toEqual(['1995.95', 'CHF']);
    expect(lines.slice(27)).toEqual(['QRR', '210000000003139471430009017', 'Auftrag vom 15.06.2020', 'EPD']);
  });
});

describe('import', () => {
  const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

  it('reads a WordPress export with featured image, tags, SEO and drafts', () => {
    const b = parseWxr(fixture('wordpress.xml'));
    expect(b.source).toBe('wordpress');
    expect(b.items.map((i) => [i.kind, i.slug, i.published])).toEqual([
      ['post', 'fruehlingstour', true],
      ['page', 'ueber-uns', true],
      ['post', 'entwurf', false],
    ]);
    const post = b.items[0];
    expect(post).toMatchObject({
      date: '2024-03-01',
      category: 'Touren',
      tags: ['See', 'Frühling'],
      oldPath: '/2024/03/fruehlingstour',
      seoDescription: 'Velotour an den Bodensee im März.',
    });
    expect(post.cover).toBe('https://alt.example.ch/wp-content/uploads/2024/03/velo.jpg');
    expect(post.html).toContain('<figure>');
    expect(post.html).not.toContain('[gallery');
    expect(post.html).not.toContain('wp:paragraph');
    // Pages without HTML get their paragraphs back.
    expect(b.items[1].html).toBe('<p>Wir sind ein kleiner Verein.</p>\n<p>Seit 1999 unterwegs.</p>');
  });

  it('keeps text and images in order when turning HTML into blocks', async () => {
    const seen: string[] = [];
    const blocks = await htmlToBlocks(parseWxr(fixture('wordpress.xml')).items[0].html, async (src, alt) => {
      seen.push(`${src}|${alt}`);
      return 'media-1';
    });
    expect(blocks.map((b) => b.type)).toEqual(['text', 'image', 'text']);
    expect(blocks[1].props).toMatchObject({ image: 'media-1', caption: '' });
    expect(seen).toEqual(['https://alt.example.ch/wp-content/uploads/2024/03/velo-800x600.jpg|Velos am See']);
    expect(blocks[2].props.body).toContain('Romanshorn');
  });

  it('groups Shopify rows into products with variants', () => {
    const b = parseShopifyCsv(fixture('shopify.csv'));
    expect(b.items).toHaveLength(2);
    const [cheese, honey] = b.items;
    expect(cheese).toMatchObject({ title: 'Alpkäse rezent', price: 950, category: 'Käse', tags: ['Käse', 'Bio'], published: true, oldPath: '/products/alpkaese' });
    expect(cheese.variants).toEqual([
      { name: '250 g', price: 950, stock: 12, sku: 'AK-250' },
      { name: '500 g', price: 1700, stock: 4, sku: 'AK-500' },
    ]);
    expect(cheese.images).toHaveLength(2);
    expect(honey).toMatchObject({ price: 1200, comparePrice: 1400, sku: 'WH-1', stock: 30, variants: [], published: false });
  });

  it('parses CSV with quotes and line breaks', () => {
    expect(parseCsv('a,b\n"x, y","zeile 1\nzeile 2"\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'zeile 1\nzeile 2'],
    ]);
  });

  it('reads Markdown with frontmatter and Jekyll file names', () => {
    const md = parseMarkdownFile('_posts/2023-05-10-velo-putzen.md', '---\ntitle: Velo putzen\ntags: [Pflege, Tipps]\ndraft: false\n---\n\nErst **Wasser**, dann Öl.\n');
    expect(md).toMatchObject({ kind: 'post', title: 'Velo putzen', slug: 'velo-putzen', date: '2023-05-10', tags: ['Pflege', 'Tipps'], published: true });
    expect(md.html).toContain('<strong>Wasser</strong>');
    expect(parseMarkdownFile('pages/kontakt.md', '# Kontakt\n\nRuf an.').kind).toBe('page');
  });

  it('reads RSS feeds as from Wix', () => {
    const b = parseFeed(
      '<rss version="2.0"><channel><title>Mein Blog</title><item><title>Hallo Welt</title><link>https://x.wixsite.com/blog/post/hallo-welt</link><pubDate>Mon, 06 May 2024 10:00:00 GMT</pubDate><description><![CDATA[<p>Erster Beitrag</p>]]></description></item></channel></rss>',
    );
    expect(b.items[0]).toMatchObject({ title: 'Hallo Welt', slug: 'hallo-welt', date: '2024-05-06', oldPath: '/blog/post/hallo-welt' });
  });
});

describe('typescript sdk', () => {
  // TypeScript 7 has no compiler API: write the files and run tsc on them.
  const check = (usage: string): string[] => {
    const dir = mkdtempSync(join(tmpdir(), 'nova-sdk-'));
    writeFileSync(join(dir, 'nova.ts'), generateSdk(BUILTIN_COLLECTIONS, { name: 'Test */ Site', url: 'https://example.ch' }));
    writeFileSync(join(dir, 'use.ts'), `import { createClient } from './nova';\nconst nova = createClient({ token: 't' });\nexport async function run() {\n${usage}\n}\n`);
    const tsc = join(process.cwd(), 'node_modules/.bin/tsc');
    const args = [
      '--ignoreConfig',
      '--noEmit',
      '--strict',
      '--target',
      'es2022',
      '--module',
      'esnext',
      '--moduleResolution',
      'bundler',
      '--lib',
      'es2022,dom,dom.iterable',
      '--types',
      '',
      join(dir, 'nova.ts'),
      join(dir, 'use.ts'),
    ];
    try {
      execFileSync(tsc, args, { encoding: 'utf8', cwd: dir });
      return [];
    } catch (e) {
      return String((e as { stdout?: string }).stdout ?? e)
        .split('\n')
        .filter((l) => l.includes('error'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('compiles under strict mode and types every content type', () => {
    expect(
      check(`
  const posts = await nova.posts.list({ limit: 5, sort: '-published_at', filter: { category: 'news' } });
  const title: string = posts.data[0].data.title;
  const dish = await nova.dishes.get('rösti');
  const price: number | undefined = dish?.data.prices?.[0]?.price;
  const vat = dish?.data.vat;
  for await (const p of nova.properties.all()) p.data.offer satisfies 'rent' | 'buy' | undefined;
  await nova.pages.create({ title: 'Neu', blocks: [] }, { publish: true });
  const g = await nova.graphql<{ site: { name: string } }>('{ site { name } }');
  return [title, price, vat, g.site.name];`),
    ).toEqual([]);
  });

  it('rejects wrong field names and values', () => {
    expect(check(`await nova.posts.list({ sort: 'nope' });`).join()).toMatch(/error TS2322/);
    expect(check(`const d = await nova.dishes.get('x'); d?.data.titel;`).join()).toMatch(/Property 'titel' does not exist/);
    expect(check(`await nova.collection('unknown');`).join()).toMatch(/error TS2345/);
    expect(check(`await nova.properties.create({ title: 'Wohnung', offer: 'lease' } as never); await nova.dishes.update('id', { title: 1 });`).join()).toMatch(/error TS2322/);
  });
});

describe('sandboxed hooks', () => {
  it("changes the event or rejects with the hook's own message", async () => {
    const r = await runHook('function hook(e) { e.data.title = e.data.title.trim().toUpperCase(); console.log("ok", e.data.title); }', { data: { title: '  rösti ' } });
    expect(r).toMatchObject({ ok: true, result: { data: { title: 'RÖSTI' } }, logs: ['ok RÖSTI'] });
    const no = await runHook('function hook(e) { if (!e.data.excerpt) throw new Error("Bitte eine Kurzfassung."); }', { data: {} });
    expect(no).toMatchObject({ ok: false, error: 'Bitte eine Kurzfassung.' });
    expect((await runHook('function hook() { return { replaced: true } }', { a: 1 })).result).toEqual({ replaced: true });
  });

  it('has no way out of the sandbox', async () => {
    for (const probe of ['require("fs")', 'process.env', 'fetch("https://example.ch")', 'globalThis.Deno', 'import("fs")', 'setTimeout(() => 1)']) {
      const r = await runHook(`function hook(e) { e.leak = String(${probe}); }`, {});
      if (r.ok) expect(r.result!.leak).toMatch(/^(undefined|\[object Promise\])$/);
      else expect(r.error).toMatch(/not defined|undefined|not a function|cannot|import/i);
    }
    // Nothing survives between runs.
    await runHook('globalThis.x = 1; function hook(e) {}', {});
    expect((await runHook('function hook(e) { e.x = typeof globalThis.x }', {})).result).toEqual({ x: 'undefined' });
  });

  it('stops endless loops, memory bombs and async hooks', async () => {
    const loop = await runHook('function hook() { while (true) {} }', {});
    expect(loop.error).toMatch(/Abgebrochen nach 50 ms/);
    expect(loop.ms).toBeLessThan(1000);
    const mem = await runHook('function hook() { const a = []; while (true) a.push("x".repeat(1e5)); }', {});
    expect(mem.ok).toBe(false);
    expect((await runHook('async function hook() {}', {})).error).toMatch(/nicht async/);
    expect(await checkHookCode('function hook(e) {}')).toBeNull();
    expect(await checkHookCode('const x = 1;')).toMatch(/hook\(event\)/);
    expect(await checkHookCode('function hook( {')).toMatch(/SyntaxError/);
  });
});

describe('website translations', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : d.name.endsWith('.ts') ? [join(dir, d.name)] : []));
  const sources = [...files('src/site'), ...files('src/server')].filter((f) => !f.includes('/dict'));
  const keys = new Map<string, string>();
  for (const f of sources) {
    const text = readFileSync(f, 'utf8');
    // t(ctx, '…') / T('…') / tr(lang, '…') with a literal key
    for (const m of text.matchAll(/\b(?:t\(\s*[\w.]+\s*,|T\(|tr\(\s*[\w.()]+\s*,)\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
      if (m[1] === '`' && m[2].includes('${')) continue;
      keys.set(m[2].replace(/\\(['"`\\])/g, '$1'), f);
    }
  }

  it('has French, Italian and English for every text used on the website', () => {
    const missing = [...keys].filter(([k]) => !DICT[k] || !DICT[k].fr || !DICT[k].it || !DICT[k].en).map(([k, f]) => `${f}: ${k}`);
    expect(missing).toEqual([]);
    expect(keys.size).toBeGreaterThan(50);
  });

  it('keeps the placeholders of every text', () => {
    const ph = (s: string) =>
      [...s.matchAll(/\{(\w+)\}/g)]
        .map((m) => m[1])
        .sort()
        .join(',');
    const broken = Object.entries(DICT).flatMap(([de, v]) => (['fr', 'it', 'en'] as const).filter((l) => ph(v[l]) !== ph(de)).map((l) => `${l}: ${de}`));
    expect(broken).toEqual([]);
    expect(tr('fr', 'Sprache')).toBe('Langue');
    expect(tr('de', 'Gibt es nicht {x}', { x: 1 })).toBe('Gibt es nicht 1');
  });

  it('translates opening hours and keeps shared fields shared', () => {
    const hours = [1, 2, 3, 4, 5]
      .map((day) => ({ day, closed: false, slots: [{ from: '09:00', to: '18:00' }] }))
      .concat([
        { day: 6, closed: true, slots: [] },
        { day: 7, closed: true, slots: [] },
      ]);
    expect(compactHoursL(hours, 'fr')).toEqual([
      { days: 'Lu–Ve', time: '09:00–18:00' },
      { days: 'Sa–Di', time: 'fermé' },
    ]);
    // Friday 2026-10-09 20:00 in Zurich: closed, opens Monday.
    expect(openStatus(hours, 'Europe/Zurich', new Date('2026-10-09T18:00:00Z'), 'it')?.label).toBe('Chiuso – apre lunedì alle 09:00');
    const fields = [
      { key: 'title', type: 'text', label: 'Titel' },
      { key: 'price', type: 'money', label: 'Preis' },
      {
        key: 'prices',
        type: 'group',
        label: 'Preise',
        fields: [
          { key: 'label', type: 'text', label: 'Grösse' },
          { key: 'price', type: 'money', label: 'Preis' },
        ],
      },
    ] as never[];
    const text = translatableData(fields, { title: 'Plat', price: 1, prices: [{ label: 'grand', price: 1 }] }, false);
    expect(text).toEqual({ title: 'Plat', prices: [{ label: 'grand' }] });
    expect(mergeTranslation(fields, { title: 'Teller', price: 1800, prices: [{ label: 'gross', price: 2400 }] }, { ...text, title: '' }, false)).toEqual({
      title: 'Teller',
      price: 1800,
      prices: [{ label: 'grand', price: 2400 }],
    });
  });
});

describe('admin translations', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []));
  const keys = new Map<string, string>();
  for (const f of files('src/admin').filter((f) => !f.includes('/i18n/'))) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/\b(?:t|tl)\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
      if (m[1] === '`' && m[2].includes('${')) continue;
      keys.set(m[2].replace(/\\(['"`\\])/g, '$1'), f);
    }
  }

  it('has French, Italian and English for every interface text', () => {
    const missing = [...keys].filter(([k]) => !ADMIN_DICT[k]?.fr || !ADMIN_DICT[k]?.it || !ADMIN_DICT[k]?.en).map(([k, f]) => `${f}: ${k}`);
    expect(missing).toEqual([]);
  });

  it('keeps placeholders identical', () => {
    const ph = (s: string) =>
      [...s.matchAll(/\{(\w+)\}/g)]
        .map((m) => m[1])
        .sort()
        .join(',');
    const broken = Object.entries(ADMIN_DICT).flatMap(([de, v]) => (['fr', 'it', 'en'] as const).filter((l) => ph(v[l]) !== ph(de)).map((l) => `${l}: ${de}`));
    expect(broken).toEqual([]);
  });
});

describe('collaborative document', () => {
  const base = {
    title: 'A',
    seo: { title: '' },
    blocks: [
      { id: 'b1', type: 'text', props: { heading: 'H', body: 'x' } },
      { id: 'b2', type: 'hero', props: { title: 'T' } },
    ],
  } as never;
  const fork = (from: Y.Doc) => {
    const d = new Y.Doc();
    Y.applyUpdate(d, Y.encodeStateAsUpdate(from));
    return d;
  };
  const sync = (a: Y.Doc, b: Y.Doc) => {
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  };

  it('round-trips entry data', () => {
    const d = new Y.Doc();
    applyData(d, base);
    expect(toData(d)).toEqual(base);
    applyData(d, { ...(base as object), title: 'B' } as never);
    expect(toData(d).title).toBe('B');
  });

  it('merges edits of different props, blocks and fields without losing any', () => {
    const server = new Y.Doc();
    applyData(server, base);
    const a = fork(server);
    const b = fork(server);
    const da = toData(a);
    // A: heading of b1, adds b3. B: body of b1, moves b2 first, changes the title.
    applyData(a, { ...da, blocks: [{ ...da.blocks![0], props: { heading: 'H2', body: 'x' } }, da.blocks![1], { id: 'b3', type: 'cta', props: {} }] } as never);
    const db = toData(b);
    applyData(b, { ...db, title: 'Neu', blocks: [db.blocks![1], { ...db.blocks![0], props: { heading: 'H', body: 'y' } }] } as never);
    sync(a, b);
    const merged = toData(a);
    expect(merged).toEqual(toData(b));
    expect(merged.title).toBe('Neu');
    const b1 = merged.blocks!.find((x) => x.id === 'b1')!;
    // The moved block keeps the move; edits on it from the other side are kept where they don't collide.
    expect(merged.blocks!.map((x) => x.id).sort()).toEqual(['b1', 'b2', 'b3']);
    expect(b1.props).toMatchObject({ body: 'y' });
    expect(merged.blocks!.filter((x) => x.id === 'b1')).toHaveLength(1);
  });

  it('reports which blocks changed', () => {
    const next = {
      ...(base as object),
      blocks: [
        { id: 'b1', type: 'text', props: { heading: 'H', body: 'z' } },
        { id: 'b2', type: 'hero', props: { title: 'T' } },
      ],
    } as never;
    expect(changedBlocks(base, next)).toEqual({ changed: ['b1'], structure: false });
  });
});

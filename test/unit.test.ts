import { describe, expect, it } from 'vitest';
import { sanitizeRichText, safeHref } from '../src/shared/richtext';
import { slugify, readability, formatPrice, excerpt } from '../src/shared/text';
import { openStatus, compactHours, parseTime } from '../src/shared/hours';
import { parseDay, formatDay, addMonths, monthGrid, longDay } from '../src/shared/dates';
import { computeSlots, zonedToUtc, localDay, type BookingResource, type BookingService } from '../src/shared/booking';
import { analyzeSeo } from '../src/shared/seo-analyze';
import { BLOCKS, createBlock, sentences } from '../src/shared/blocks';
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
import { blockCss, blockDomId, cssColor, cssLength, designCss, effective, isEmptyDesign, setDesign, type Design } from '../src/shared/design';
import { MOTION_CSS, motionAttrs, motionVars } from '../src/shared/motion';
import { shortcutAction } from '../src/shared/shortcuts';
import {
  applyOverrides,
  cloneEl,
  componentEls,
  createEl,
  EL_DEFS,
  elementsCss,
  elementsHeadings,
  elementsText,
  findEl,
  insertEl,
  itemLabel,
  LAYOUT_PRESETS,
  moveEl,
  newItem,
  removeEl,
  sanitizeEls,
  type El,
} from '../src/shared/elements';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { entrySlots, getAt, setAt, slotKey } from '../src/shared/text-slots';
import type { FieldDef } from '../src/shared/fields';
import { ICON_GROUPS, SITE_ICONS, siteIconSvg } from '../src/shared/icon-set';
import { plannedSizes } from '../src/server/video';
import { checkStructure, zipEntries } from '../src/server/scan';
import { zipSync, strToU8 } from 'fflate';
import { deflateSync } from 'node:zlib';
import { TEMPLATES, templatesFor } from '../src/shared/templates';
import { BUILTIN_EXTENSIONS } from '../src/server/extensions-catalogue';
import { validateManifest, verifyCatalogue } from '../src/server/extensions';
import { compareVersions, EXTENSION_CATEGORIES, extensionEffects } from '../src/shared/extensions';
import { generateKeyPairSync, sign as edSign } from 'node:crypto';
import { htmlClasses, pruneCss, requiredClasses, scriptWords } from '../src/site/css-prune';
import { ageAccepted, ageClaim, judgeAge, yearsSince } from '../src/server/age-verify';
import { pickTemplate, templateSeed } from '../src/server/seed';
import { SECTORS } from '../src/shared/collections';
import { THEMES } from '../src/site/themes';

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

describe('extensions', () => {
  const base = BUILTIN_EXTENSIONS.find((x) => x.id === 'link-spam')!;
  it('accepts Nova’s own extensions and rejects broken ones before anything is written', async () => {
    for (const m of BUILTIN_EXTENSIONS) await expect(validateManifest(m)).resolves.toMatchObject({ id: m.id });
    const broken = (patch: object) => validateManifest({ ...base, ...patch });
    await expect(broken({ id: 'Böse ID' })).rejects.toThrow(/Kennung/);
    await expect(broken({ version: '1.0' })).rejects.toThrow(/Version/);
    await expect(broken({ provides: { hooks: [{ key: 'x1', name: 'X', event: 'form.beforeSubmit', code: 'function nope() {}' }] } })).rejects.toThrow(/hook\(event\)/);
    await expect(broken({ provides: { hooks: [{ key: 'x1', name: 'X', event: 'server.start', code: 'function hook() {}' }] } })).rejects.toThrow(/ungültig/);
    await expect(broken({ provides: { sections: [{ key: 's1', title: 'S', blocks: [{ id: 'a', type: 'iframe-anything', props: {} }] }] } })).rejects.toThrow(/iframe-anything/);
    await expect(broken({ provides: { css: '@import url(https://evil.example/x.css);' } })).rejects.toThrow(/von aussen/);
    await expect(broken({ provides: { css: 'body{background:url(https://tracker.example/p.gif)}' } })).rejects.toThrow(/von aussen/);
    await expect(
      broken({
        provides: {
          collections: [
            {
              id: 'x_y',
              name: 'X',
              singular: 'X',
              icon: 'page',
              fields: [{ key: 'slug', type: 'text', label: 'S' }],
              route: null,
              list_route: null,
              has_blocks: false,
              title_field: 'slug',
            },
          ],
        },
      }),
    ).rejects.toThrow(/reserviert/);
  });

  it('trusts an own catalogue only with a matching Ed25519 signature', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const pub = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const list = JSON.stringify([base]);
    const sig = edSign(null, Buffer.from(list), privateKey).toString('base64');
    expect(verifyCatalogue(list, sig, pub)).toBe(true);
    expect(verifyCatalogue(list.replace('Link-Spam', 'Link-Spom'), sig, pub)).toBe(false);
    expect(verifyCatalogue(list, sig, generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'der' }).toString('base64'))).toBe(false);
    expect(verifyCatalogue(list, 'kaputt', 'auch kaputt')).toBe(false);
  });

  it('compares versions and says what an extension adds', () => {
    expect(compareVersions('1.10.0', '1.9.3')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
    expect(extensionEffects(BUILTIN_EXTENSIONS.find((x) => x.id === 'stellen')!).map((e) => e.kind)).toEqual(['collection', 'hook', 'form']);
  });

  it('has French, Italian and English for the texts of Nova’s own extensions', () => {
    const texts = [
      ...BUILTIN_EXTENSIONS.flatMap((m) => [m.name, m.summary, m.description, ...extensionEffects(m).map((e) => e.label)]),
      ...EXTENSION_CATEGORIES.map((c) => c.label),
    ];
    const missing = texts.filter((k) => !ADMIN_DICT[k]?.fr || !ADMIN_DICT[k]?.it || !ADMIN_DICT[k]?.en);
    expect(missing).toEqual([]);
  });
});

describe('unused CSS', () => {
  it('drops a rule only when every selector needs a class the page lacks', () => {
    const used = new Set(['hero', 'on']);
    expect(pruneCss('.hero h1{a:1}.faq summary{b:2}.faq,.hero{c:3}', used)).toBe('.hero h1{a:1}.hero{c:3}');
    expect(pruneCss('@media (min-width:40rem){.faq{a:1}.hero{b:2}}@media print{.faq{c:3}}', used)).toBe('@media (min-width:40rem){.hero{b:2}}');
    // Untouched: element and attribute selectors, at-rules, classes inside :is()/:not(), braces in strings.
    expect(pruneCss('body{a:1}[data-x=".faq"]{b:2}@keyframes faq{to{c:3}}:is(.faq) p{d:4}.x:not(.faq){e:5}.hero::after{content:"}"}', new Set(['x', 'hero']))).toBe(
      'body{a:1}[data-x=".faq"]{b:2}@keyframes faq{to{c:3}}:is(.faq) p{d:4}.x:not(.faq){e:5}.hero::after{content:"}"}',
    );
    expect(requiredClasses('.a .b:hover>.c[data-k=".d"]:not(.e)')).toEqual(['a', 'b', 'c']);
  });

  it('knows the classes of the page and of the scripts', () => {
    expect([...htmlClasses('<div class="a  b"><p class="c">x</p><i data-class="no">')]).toEqual(['a', 'b', 'c']);
    expect(scriptWords('e.classList.add("on");n.className="nvid paused"').has('paused')).toBe(true);
  });
});

describe('age check with the e-ID', () => {
  it('asks for as little as possible and counts only an explicit yes', () => {
    expect([16, 18, 20, 21].map(ageClaim)).toEqual(['age_over_16', 'age_over_18', 'birth_date', 'birth_date']);
    expect(judgeAge({ age: [{ age_over_18: true }] }, 18)).toBe('ok');
    expect(judgeAge({ age: { age_over_16: true } }, 16)).toBe('ok');
    expect(judgeAge({ age: [{ age_over_18: 'true' }] }, 18)).toBe('young');
    expect(judgeAge({ age: [{}] }, 18)).toBe('young');
    expect(() => judgeAge(undefined, 18)).toThrow(/CREDENTIAL_SUBJECT_DATA/);
  });

  it('counts birthdays in Swiss time', () => {
    // 20th birthday on 1 March 2026: 22:30 UTC on 28 February is 23:30 in Zurich (still 19), an hour later it is 1 March there.
    expect(yearsSince('2006-03-01', new Date('2026-02-28T22:30:00Z'))).toBe(19);
    expect(yearsSince('2006-03-01', new Date('2026-02-28T23:30:00Z'))).toBe(20);
    expect(judgeAge({ age: [{ birth_date: '2006-03-01' }] }, 20, new Date('2026-02-28T12:00:00Z'))).toBe('young');
    expect(judgeAge({ age: [{ birth_date: '2006-03-01' }] }, 20, new Date('2026-03-01T12:00:00Z'))).toBe('ok');
    expect(yearsSince('1.3.2006', new Date())).toBeNull();
  });

  it('lets only a check for the current limit through the e-ID gate', () => {
    const s = (method: 'self' | 'eid', minAge = 18) => ({ ageGate: { enabled: true, minAge, text: '', method } }) as never;
    expect(ageAccepted('1', s('self'))).toBe(true);
    expect(ageAccepted('v18', s('self'))).toBe(true);
    expect(ageAccepted(null, s('self'))).toBe(false);
    // Without a configured verifier the e-ID gate is not active, so a click still counts there.
    expect(ageAccepted('1', s('eid'))).toBe(true);
    expect(ageAccepted('v16', s('self', 18))).toBe(false);
    expect(ageAccepted('v21', s('self', 18))).toBe(true);
  });
});

describe('starter templates', () => {
  it('offers three templates in two existing styles for every Sparte', () => {
    for (const sector of SECTORS.map((x) => x.id)) {
      const list = templatesFor(sector);
      expect(list).toHaveLength(3);
      for (const x of list) {
        expect(new Set(x.themes).size).toBe(2);
        for (const th of x.themes) expect(THEMES.some((y) => y.id === th)).toBe(true);
      }
    }
    expect(new Set(TEMPLATES.map((x) => x.id)).size).toBe(TEMPLATES.length);
  });

  it('builds every template from known blocks, its own forms and existing icons', () => {
    const blockTypes = new Set(BLOCKS.map((x) => x.type));
    for (const def of TEMPLATES) {
      const seed = templateSeed(def.id, 'Test')!;
      expect(seed, def.id).toBeTruthy();
      const forms = new Set(seed.forms.map((x) => x.key));
      const blocks = [...seed.home, ...seed.pages.flatMap((p) => p.blocks), ...seed.entries.flatMap((e) => (e.data.blocks as typeof seed.home | undefined) ?? [])];
      for (const bl of blocks) {
        expect(blockTypes.has(bl.type), `${def.id}: ${bl.type}`).toBe(true);
        const form = bl.props.form;
        if (typeof form === 'string') expect(forms.has(form.replace('@form:', '')), `${def.id}: ${form}`).toBe(true);
        for (const item of (bl.props.items as { icon?: string }[] | undefined) ?? []) if (item.icon) expect(SITE_ICONS[item.icon], `${def.id}: ${item.icon}`).toBeTruthy();
      }
      // Every page in the menu exists – as a page of the template or as a list of one of the Sparte's modules.
      const slugs = new Set(['', ...seed.pages.map((p) => p.slug)]);
      for (const n of seed.nav) {
        const path = n.href.replace(/^\//, '').replace(/#.*$/, '');
        if (!slugs.has(path)) expect(['journal', 'events', 'arbeiten', 'immobilien', 'profile', 'karte', 'bestellen', 'laden', 'kurse'], `${def.id}: ${n.href}`).toContain(path);
      }
    }
  });

  it('only uses a template of the first Sparte', () => {
    expect(pickTemplate(['shop', 'restaurant'], 'cafe')?.id).toBe('manufaktur');
    expect(pickTemplate(['shop'], 'boutique')?.id).toBe('boutique');
    expect(pickTemplate(['club'], 'boutique')?.id).toBe('sportverein');
    expect(pickTemplate(['gibt-es-nicht'])).toBeUndefined();
  });

  it('has French, Italian and English for every template name and description', () => {
    const missing = TEMPLATES.flatMap((x) => [x.name, x.description]).filter((k) => !ADMIN_DICT[k]?.fr || !ADMIN_DICT[k]?.it || !ADMIN_DICT[k]?.en);
    expect(missing).toEqual([]);
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

  it('has French, Italian and English for every block: name, description, fields, help, choices', () => {
    const texts = new Set<string>();
    const walk = (fields: FieldDef[]) => {
      for (const f of fields) {
        for (const x of [f.label, f.help, f.placeholder, f.itemLabel]) if (x) texts.add(x);
        for (const o of f.options ?? []) texts.add(o.label);
        if (f.fields) walk(f.fields);
      }
    };
    for (const b of BLOCKS) {
      texts.add(b.label);
      texts.add(b.description);
      walk(b.fields);
    }
    // Elements of the free layout and its ready-made layouts too.
    for (const e of Object.values(EL_DEFS)) {
      texts.add(e.label);
      texts.add(e.description);
      walk(e.fields);
    }
    for (const l of LAYOUT_PRESETS) {
      texts.add(l.label);
      texts.add(l.description);
    }
    const missing = [...texts].filter((k) => !ADMIN_DICT[k]?.fr || !ADMIN_DICT[k]?.it || !ADMIN_DICT[k]?.en);
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

describe('texts for the translation draft', () => {
  const col = {
    fields: [
      { key: 'title', type: 'text', label: 'Titel' },
      { key: 'price', type: 'money', label: 'Preis' },
      { key: 'cta', type: 'link', label: 'Knopf' },
      { key: 'access', type: 'text', label: 'Zugang' },
      { key: 'blocks', type: 'blocks', label: 'Inhalt' },
    ],
    has_blocks: true,
    title_field: 'title',
  } as never;
  const data = {
    title: 'Über uns',
    price: 1200,
    cta: { label: 'Schreib uns', href: '/kontakt' },
    access: 'members',
    blocks: [
      { id: 'h1', type: 'hero', props: { title: 'Willkommen', text: '', primary: { label: 'Mehr', href: '/x' } } },
      { id: 'f1', type: 'faq', props: { heading: 'Fragen', items: [{ q: 'Parkplätze?', a: '<p>Ja, zwei.</p>' }] } },
    ],
    seo: { description: 'Kleines Bistro' },
  };

  it('finds every text, and only texts', () => {
    const slots = entrySlots(col, data);
    expect(slots.map((s) => [slotKey(s.path), s.kind])).toEqual([
      ['title', 'plain'],
      ['cta/label', 'plain'],
      ['blocks/#h1/props/title', 'plain'],
      ['blocks/#h1/props/primary/label', 'plain'],
      ['blocks/#f1/props/heading', 'plain'],
      ['blocks/#f1/props/items/0/q', 'plain'],
      ['blocks/#f1/props/items/0/a', 'rich'],
      ['seo/description', 'multi'],
    ]);
  });

  it('writes suggestions back by block id, even after blocks were moved', () => {
    const moved = { ...data, blocks: [data.blocks[1], data.blocks[0]] };
    let next = setAt(moved, ['blocks', '#h1', 'props', 'title'], 'Bienvenue');
    next = setAt(next, ['blocks', '#f1', 'props', 'items', 0, 'a'], '<p>Oui, deux.</p>');
    next = setAt(next, ['seo', 'title'], 'À propos');
    expect(getAt(next, ['blocks', '#h1', 'props', 'title'])).toBe('Bienvenue');
    expect(next.blocks[0].id).toBe('f1');
    expect((next.blocks[0].props as any).items[0]).toEqual({ q: 'Parkplätze?', a: '<p>Oui, deux.</p>' });
    expect(next.seo).toEqual({ description: 'Kleines Bistro', title: 'À propos' });
    expect(data.blocks[0].props.title).toBe('Willkommen'); // copies, not changes
    // A block that is gone in the translation: nothing happens.
    expect(setAt(next, ['blocks', '#weg', 'props', 'title'], 'x')).toBe(next);
  });
});

describe('video web versions', () => {
  it('plans 1080p and 720p by the short side, never larger than the source, always even', () => {
    expect(plannedSizes(3840, 2160)).toEqual([
      { p: 1080, width: 1920, height: 1080 },
      { p: 720, width: 1280, height: 720 },
    ]);
    expect(plannedSizes(1080, 1920)).toEqual([
      { p: 1080, width: 1080, height: 1920 },
      { p: 720, width: 720, height: 1280 },
    ]);
    expect(plannedSizes(1280, 720)).toEqual([{ p: 720, width: 1280, height: 720 }]);
    expect(plannedSizes(641, 361)).toEqual([{ p: 361, width: 642, height: 362 }]);
  });
});

describe('upload checks', () => {
  const pdf = (body: string) => Buffer.from(`%PDF-1.7\n1 0 obj\n<< /Type /Catalog ${body} >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF`, 'latin1');
  const pdfWithStream = (content: string) => {
    const data = deflateSync(Buffer.from(content, 'latin1'));
    return Buffer.concat([
      Buffer.from('%PDF-1.7\n2 0 obj\n<< /Type /ObjStm /Filter /FlateDecode /Length ' + data.length + ' >>\nstream\n', 'latin1'),
      data,
      Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1'),
    ]);
  };
  const zip = (files: Record<string, string>) => Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))));

  it('takes ordinary files', () => {
    expect(() => checkStructure(pdf('/Pages 2 0 R'), '.pdf')).not.toThrow();
    expect(() => checkStructure(pdfWithStream('<< /Type /Page /Contents 5 0 R >>'), '.pdf')).not.toThrow();
    expect(() => checkStructure(zip({ 'word/document.xml': '<w:document/>', '[Content_Types].xml': '<Types/>' }), '.docx')).not.toThrow();
    expect(() => checkStructure(zip({ 'OEBPS/reader.js': 'x', 'OEBPS/ch1.xhtml': '<p/>' }), '.epub')).not.toThrow();
    expect(() => checkStructure(zip({ 'fotos/a.jpg': 'x', 'liesmich.txt': 'Hallo' }), '.zip')).not.toThrow();
  });

  it('refuses PDFs that run code, also hidden in compressed streams or escaped names', () => {
    expect(() => checkStructure(pdf('/OpenAction << /S /JavaScript /JS (app.alert(1)) >>'), '.pdf')).toThrow(/JavaScript/);
    expect(() => checkStructure(pdf('/OpenAction << /S /J#61vaScript >>'), '.pdf')).toThrow(/JavaScript/);
    expect(() => checkStructure(pdfWithStream('<< /S /JavaScript /JS 7 0 R >>'), '.pdf')).toThrow(/JavaScript/);
    expect(() => checkStructure(pdf('/OpenAction << /S /Launch /F (cmd.exe) >>'), '.pdf')).toThrow(/startet Programme/);
    expect(() => checkStructure(pdf('/Names << /EmbeddedFiles 3 0 R >>'), '.pdf')).toThrow(/angehängte Dateien/);
  });

  it('refuses macros, programs and programs in archives', () => {
    expect(() => checkStructure(zip({ 'word/document.xml': 'x', 'word/vbaProject.bin': 'x' }), '.docx')).toThrow(/Makros/);
    expect(() => checkStructure(zip({ 'Rechnung.pdf.exe': 'x' }), '.zip')).toThrow(/Rechnung\.pdf\.exe/);
    expect(() => checkStructure(zip({ 'ordner/start.vbs': 'x' }), '.zip')).toThrow(/start\.vbs/);
    expect(() => checkStructure(Buffer.from('MZ\x90\x00rest', 'latin1'), '.txt')).toThrow(/Programmdateien/);
    expect(zipEntries(zip({ 'a/b.txt': 'x', 'c.txt': 'y' })).sort()).toEqual(['a/b.txt', 'c.txt']);
  });
});

describe('website icons', () => {
  it('are drawn only with plain shapes, have search words and a group', () => {
    const groups = new Set(ICON_GROUPS.map((g) => g.id));
    for (const [name, d] of Object.entries(SITE_ICONS)) {
      expect(d.svg, name).toMatch(/^(<(path|circle|rect|ellipse) [^<>]*\/>)+$/);
      expect(d.label.split(',').length, name).toBeGreaterThan(1);
      expect(groups.has(d.group), name).toBe(true);
    }
    expect(Object.keys(SITE_ICONS).length).toBeGreaterThanOrEqual(300);
    for (const g of groups) expect(Object.values(SITE_ICONS).filter((d) => d.group === g).length, g).toBeGreaterThanOrEqual(10);
  });

  it('only accepts icons that exist and renders them decoratively', () => {
    const f = [{ key: 'icon', type: 'icon', label: 'Symbol' }] as FieldDef[];
    expect(validateFields(f, { icon: 'cup' })).toEqual([]);
    expect(validateFields(f, { icon: '<script>' })[0].message).toContain('gibt es nicht');
    expect(siteIconSvg('cup')).toContain('aria-hidden="true"');
    expect(siteIconSvg('nope')).toBe('');
  });
});

describe('visual design', () => {
  it('compiles per breakpoint and hover, with the theme tokens', () => {
    const css = designCss('#b-x', {
      desktop: { pt: '4rem', bg: '$accent', color: '#ffffff', radius: 24 as unknown as string, shadow: 'm' },
      tablet: { pt: '2rem' },
      mobile: { textAlign: 'center' },
      hover: { y: '-4px', shadow: 'l' },
      transition: 300,
    });
    expect(css).toContain('#b-x{padding-top:4rem;color:#ffffff;--ink:#ffffff');
    expect(css).toContain('background-color:var(--accent)');
    expect(css).toContain('border-radius:24px');
    expect(css).toContain('transition:color 300ms');
    expect(css).toContain('@media (max-width:64rem){#b-x{padding-top:2rem}}');
    expect(css).toContain('@media (max-width:40rem){#b-x{text-align:center}}');
    expect(css).toMatch(/@media \(hover:hover\)\{#b-x:hover\{box-shadow:[^}]*;transform:translate\(0,-4px\)\}\}/);
    expect(designCss('#b-x', { hover: { scale: 1.05 } }, { forceHover: 'nova-hover' })).toContain('#b-x.nova-hover{transform:scale(1.05)}');
  });

  it('keeps everything typed into the panel inside the rule', () => {
    const evil = 'red;}body{display:none}';
    const css = designCss(
      '#b',
      {
        desktop: {
          color: evil,
          bg: 'url(javascript:alert(1))',
          pt: '1px;}*{x:y',
          fontSize: 'calc(1px)',
          width: '10px</style><script>',
          bgImage: '../../etc',
          display: 'contents' as never,
          gradient: {
            type: 'linear',
            angle: 45,
            stops: [
              { color: evil, at: 0 },
              { color: '#000', at: 100 },
            ],
          },
          shadow: { x: 0, y: 4, blur: 8, spread: 0, color: 'expression(alert(1))' },
        },
      },
      { image: () => 'x");}body{a:b' },
    );
    expect(css).not.toMatch(/body|script|javascript|expression|calc|contents|;}\*/);
    expect(cssLength('2.5rem')).toBe('2.5rem');
    expect(cssLength('12')).toBe('12px');
    expect(cssLength('$s-4')).toBe('var(--s-4)');
    expect(cssLength('$nope')).toBeNull();
    expect(cssColor('$accent/40')).toBe('color-mix(in srgb,var(--accent) 40%,transparent)');
    expect(cssColor('rgb(1 2 3 / 50%)')).toBe('rgb(1 2 3 / 50%)');
  });

  it('never sets a theme token from itself', () => {
    const css = designCss('#b', { desktop: { accent: '$accent', bg: '$bg/80', color: '$ink' } });
    expect(css).not.toContain('--accent:');
    expect(css).not.toContain('--bg:');
    expect(css).not.toContain('--ink:');
    expect(css).toContain('background-color:color-mix(in srgb,var(--bg) 80%,transparent)');
  });

  it('knows which value applies where, and removes empty layers', () => {
    const d: Design = { desktop: { pt: '4rem', color: '$ink' }, tablet: { pt: '2rem' } };
    expect(effective(d, 'mobile', 'pt')).toEqual({ value: '2rem', from: 'tablet' });
    expect(effective(d, 'mobile', 'color')).toEqual({ value: '$ink', from: 'desktop' });
    expect(setDesign(d, 'tablet', 'pt', undefined).tablet).toBeUndefined();
    expect(isEmptyDesign(setDesign(setDesign(d, 'tablet', 'pt', undefined), 'desktop', 'pt', undefined))).toBe(false);
    expect(blockDomId({ id: 'abc', style: { anchor: 'preise' } })).toBe('preise');
    expect(blockDomId({ id: 'abc', style: { anchor: 'x"><script>' } })).toBe('b-abc');
  });
});

describe('animations', () => {
  it('turns only known effects and plain numbers into attributes and variables', () => {
    expect(motionAttrs({ enter: 'up', stagger: 90, repeat: true, scroll: 'parallax', scrollStrength: 400, itemHover: 'lift' })).toBe(
      'data-anim="up" data-anim-items="90" data-anim-repeat data-scroll="parallax" data-scroll-k="100" data-hover="lift"',
    );
    expect(motionAttrs({ enter: 'up" onload="alert(1)' as never, scroll: 'x' as never, itemHover: '<b>' as never })).toBe('');
    expect(motionVars({ enter: 'fade', duration: 99999, delay: -5, easing: 'spring' })).toBe(
      '--anim-dur:4000ms;--anim-delay:0ms;--anim-dist:32px;--anim-ease:cubic-bezier(.34,1.56,.64,1)',
    );
    expect(motionVars({ scroll: 'fade' })).toBe('');
    expect(blockCss('#b-x', { motion: { enter: 'zoom' } })).toBe('#b-x{--anim-dur:700ms;--anim-delay:0ms;--anim-dist:32px;--anim-ease:cubic-bezier(.2,.7,.2,1)}');
  });

  it('only hides content while JavaScript runs and motion is welcome, with a fallback', () => {
    const hide = MOTION_CSS.split('\n').find((l) => l.includes('opacity:0'))!;
    expect(MOTION_CSS).toContain('@media (prefers-reduced-motion:no-preference){\nbody:not([data-nova-edit]) [data-anim]:not([data-self]):not(.anim-ready)');
    expect(hide).toContain('body:not([data-nova-edit])');
    expect(MOTION_CSS).toContain('animation:nova-show 0s 4s forwards');
  });
});

describe('free layout', () => {
  const tree = (): El[] => [
    { id: 'a', kind: 'heading', props: { text: 'Titel', level: '2' } },
    {
      id: 'row',
      kind: 'box',
      props: {},
      children: [
        { id: 'b', kind: 'text', props: { html: '<p>Eins</p>' } },
        { id: 'c', kind: 'box', props: {}, children: [{ id: 'd', kind: 'button', props: { label: 'Los', href: '/x' } }] },
      ],
    },
  ];

  it('finds, inserts, moves and removes elements in the tree', () => {
    const t0 = tree();
    expect(findEl(t0, 'd')).toMatchObject({ path: 'els.1.children.1.children.0', index: 0 });
    expect(findEl(t0, 'd')!.ancestors.map((x) => x.id)).toEqual(['row', 'c']);
    // Into another container, and down within the same parent.
    const moved = moveEl(t0, 'a', 'c', 0);
    expect(findEl(moved, 'a')!.parent!.id).toBe('c');
    expect(moved.map((x) => x.id)).toEqual(['row']);
    const down = moveEl(tree(), 'b', 'row', 2);
    expect(down[1].children!.map((x) => x.id)).toEqual(['c', 'b']);
    // A container can't go into itself or its children.
    expect(moveEl(tree(), 'row', 'c', 0)).toEqual(tree());
    expect(removeEl(tree(), 'c')[1].children!.map((x) => x.id)).toEqual(['b']);
    expect(insertEl(tree(), null, 1, createEl('divider')).map((x) => x.kind)).toEqual(['heading', 'divider', 'box']);
    const copy = cloneEl(tree()[1]);
    expect(copy.id).not.toBe('row');
    expect(copy.children![1].children![0].id).not.toBe('d');
  });

  it('cleans what comes in: known kinds, safe links, clean text, bounded size', () => {
    const els = sanitizeEls([
      { id: 'x', kind: 'button', props: { label: '<b>Klick</b>', href: 'javascript:alert(1)', variant: 'evil' } },
      { id: 'x', kind: 'text', props: { html: '<p onclick="x()">Hi<script>alert(1)</script></p>' } },
      { id: 'y', kind: 'script', props: {} },
      { id: 'z"><img src=x>', kind: 'heading', props: { text: 'A', level: '9' } },
      { id: 'b', kind: 'box', props: { tag: 'script', href: '/ok' }, children: [{ kind: 'image', props: { image: '../../etc/passwd' } }] },
    ]);
    expect(els.map((e) => e.kind)).toEqual(['button', 'text', 'heading', 'box']);
    expect(els[0].props).toEqual({ label: '<b>Klick</b>', href: undefined, variant: 'primary' });
    expect(els[1].id).not.toBe('x');
    expect(els[1].props.html).not.toMatch(/onclick|script/);
    expect(els[2].id).toMatch(/^[\w-]+$/);
    expect(els[2].props.level).toBe('2');
    expect(els[3].props).toEqual({ tag: 'div', href: '/ok' });
    expect(els[3].children![0].props.image).toBeNull();
    let deep: unknown = [];
    for (let i = 0; i < 20; i++) deep = [{ kind: 'box', props: {}, children: deep }];
    let depth = 0;
    let cur = sanitizeEls(deep);
    while (cur.length) {
      depth++;
      cur = cur[0].children ?? [];
    }
    expect(depth).toBeLessThanOrEqual(9);
    expect(sanitizeEls(Array.from({ length: 500 }, () => ({ kind: 'divider', props: {} }))).length).toBe(300);
  });

  it('gives SEO, search and the page its texts, headings and CSS', () => {
    expect(elementsText(tree())).toBe('Titel Eins Los');
    expect(elementsHeadings(tree())).toEqual([{ level: 2, text: 'Titel', field: 'els.0.props.text' }]);
    const css = elementsCss([{ id: 'q', kind: 'box', props: {}, design: { desktop: { gap: '$s-5' }, mobile: { direction: 'column' } }, motion: { enter: 'up' } }]);
    expect(css).toContain(':is(#e-q,.e-q){gap:var(--s-5)}');
    expect(css).toContain('@media (max-width:40rem){:is(#e-q,.e-q){flex-direction:column}}');
    expect(css).toContain(':is(#e-q,.e-q){--anim-dur:700ms');
    // A grid set on desktop changes its column count on smaller screens.
    expect(elementsCss([{ id: 'g', kind: 'box', props: {}, design: { desktop: { display: 'grid', columns: 3 }, mobile: { columns: 1 } } }])).toContain(
      '@media (max-width:40rem){:is(#e-g,.e-g){grid-template-columns:repeat(1,minmax(0,1fr))}}',
    );
    for (const p of LAYOUT_PRESETS) expect(sanitizeEls(p.els()).length).toBe(p.els().length);
  });

  it('keeps CMS lists and field bindings only in their safe form', () => {
    const [list] = sanitizeEls([
      {
        kind: 'list',
        props: { collection: 'Posts; drop', limit: 900, sort: 'random', category: '  Touren  ' },
        children: [
          { kind: 'heading', props: { text: 'Titel' }, bind: { text: 'title', level: 'title' } },
          { kind: 'image', props: {}, bind: { image: 'field:cover', href: 'javascript:x' } },
          { kind: 'text', props: { html: '<p>x</p>' }, bind: { html: 'field:../secret' } },
        ],
      },
    ]);
    expect(list.props).toEqual({ collection: 'posts', limit: 48, sort: 'newest', category: 'Touren' });
    expect(list.children!.map((c) => c.bind)).toEqual([{ text: 'title' }, { image: 'field:cover' }, undefined]);
    // The ready-made list carries its card template with bindings.
    const made = createEl('list');
    expect(made.children![0].bind).toEqual({ href: 'url' });
    expect(made.children![0].children!.map((c) => c.bind)).toEqual([{ image: 'field:cover' }, { text: 'title' }, { html: 'field:excerpt' }]);
    // Bound texts belong to the entries, not to the page's search text.
    expect(elementsText([made])).toBe('');
  });

  it('keeps the settings of counters, accordions, tabs, sliders and marquees in bounds', () => {
    const [counter, acc, tabs, slider, mq] = sanitizeEls([
      { kind: 'counter', props: { value: 1e12, prefix: '  CHF ', suffix: '+', duration: 60 } },
      { kind: 'accordion', props: { single: 'nein', first: 1, faq: false }, children: [{ kind: 'box', props: {}, children: [{ kind: 'heading', props: { text: 'F?' } }] }] },
      { kind: 'tabs', props: { style: 'neon' }, children: [{ kind: 'box', props: {}, name: 'Preise' }] },
      { kind: 'slider', props: { perView: 9, autoplay: -4, arrows: false } },
      { kind: 'marquee', props: { speed: 'warp', direction: 'up', pause: false }, children: [{ kind: 'text', props: { html: '<p>Hi</p>' } }] },
    ]);
    expect(counter.props).toEqual({ value: 1e9, prefix: 'CHF', suffix: '+', duration: 6 });
    // Anything but a clear «false» keeps the safe default.
    expect(acc.props).toEqual({ single: true, first: false, faq: false });
    expect(acc.children![0].children![0].kind).toBe('heading');
    expect(tabs.props.style).toBe('line');
    expect(slider.props).toEqual({ perView: 4, autoplay: 0, arrows: false, dots: true });
    expect(mq.props).toEqual({ speed: 'medium', direction: 'left', pause: false });
    expect(mq.children).toHaveLength(1);
    // The number of slides side by side is a CSS variable, no inline style.
    expect(elementsCss([slider])).toContain(`:is(#e-${slider.id},.e-${slider.id}){--per-d:4}`);
  });

  it('lets component instances change only texts, pictures and links of the original', () => {
    const [inst] = sanitizeEls([
      {
        kind: 'component',
        props: {
          ref: 'not-a-uuid',
          overrides: {
            h: { text: '  Neu ', level: '1', html: '<p onclick="x()">Hi</p>' },
            b: { label: 'Los', href: 'javascript:alert(1)' },
            i: { image: '../../etc', alt: 'Bild' },
            'x"><': { text: 'weg' },
            e: {},
          },
        },
      },
    ]);
    expect(inst.props.ref).toBeNull();
    expect(inst.props.overrides).toEqual({ h: { text: 'Neu', html: '<p>Hi</p>' }, b: { label: 'Los', href: '' }, i: { alt: 'Bild' } });
    expect(sanitizeEls([{ kind: 'component', props: { ref: '0E0CED42-1F90-48B0-A4A2-4D0CA6099BF5' } }])[0].props.ref).toBe('0E0CED42-1F90-48B0-A4A2-4D0CA6099BF5');
    const master: El[] = [
      {
        id: 'card',
        kind: 'box',
        props: {},
        children: [
          { id: 'h', kind: 'heading', props: { text: 'Original', level: '3' } },
          { id: 'b', kind: 'button', props: { label: 'Mehr', href: '/a', variant: 'primary' } },
        ],
      },
    ];
    // A heading takes its text from the override, never its level; a container nothing at all.
    const out = applyOverrides(master, { h: { text: 'Hier', level: '1' }, b: { href: '/b' }, card: { text: 'nein' } });
    expect(out[0].children![0].props).toEqual({ text: 'Hier', level: '3' });
    expect(out[0].children![1].props).toEqual({ label: 'Mehr', href: '/b', variant: 'primary' });
    expect(out[0].props).toEqual({});
    expect(master[0].children![0].props.text).toBe('Original');
    expect(
      componentEls([
        { type: 'text', props: {} },
        { type: 'layout', props: { els: master } },
      ]),
    ).toBe(master);
    expect(componentEls(undefined)).toEqual([]);
  });

  it('starts entry containers filled and adds entries like the last one', () => {
    const acc = createEl('accordion');
    expect(acc.children).toHaveLength(3);
    expect(acc.children!.every((c) => c.kind === 'box' && c.children![0].kind === 'heading')).toBe(true);
    const tabs = createEl('tabs');
    expect(tabs.children!.map((c, i) => itemLabel(c, i))).toEqual(['Übersicht', 'Details', 'Preise']);
    // Without a name the first heading labels the tab, without that its number.
    expect(itemLabel({ id: 'a', kind: 'box', props: {}, children: [createEl('heading', { text: 'Menü' })] }, 0)).toBe('Menü');
    expect(itemLabel({ id: 'b', kind: 'box', props: {}, children: [] }, 3)).toBe('Reiter 4');
    const styled = { ...tabs, children: [...tabs.children!.slice(0, 2), { ...tabs.children![2], design: { desktop: { bg: '$surface' } } }] };
    const next = newItem(styled);
    expect(next.id).not.toBe(styled.children[2].id);
    expect(next.design).toEqual({ desktop: { bg: '$surface' } });
    expect(next.name).toBe('Reiter 4');
    expect(newItem({ ...createEl('marquee'), children: [] }).kind).toBe('text');
    expect(elementsText([createEl('accordion')])).toContain('Wie lange dauert es?');
  });
});

describe('editor shortcuts', () => {
  const k = (key: string, code: string, m: Partial<{ meta: boolean; ctrl: boolean; alt: boolean; shift: boolean }> = {}) => ({
    key,
    code,
    metaKey: Boolean(m.meta),
    ctrlKey: Boolean(m.ctrl),
    altKey: Boolean(m.alt),
    shiftKey: Boolean(m.shift),
  });
  it('reads the same keys on Mac and Windows, Alt combinations by physical key', () => {
    expect(shortcutAction(k('d', 'KeyD', { meta: true }), true)).toBe('duplicate');
    expect(shortcutAction(k('d', 'KeyD', { ctrl: true }), false)).toBe('duplicate');
    expect(shortcutAction(k('d', 'KeyD', { ctrl: true }), true)).toBeNull();
    // ⌥⌘C types «ç» on a Mac – still «copy design».
    expect(shortcutAction(k('ç', 'KeyC', { meta: true, alt: true }), true)).toBe('copy-style');
    expect(shortcutAction(k('v', 'KeyV', { ctrl: true }), false)).toBe('paste');
    expect(shortcutAction(k('ArrowUp', 'ArrowUp', { alt: true }), false)).toBe('move-up');
    expect(shortcutAction(k('?', 'Minus', { shift: true }), false)).toBe('help');
    expect(shortcutAction(k('c', 'KeyC'), false)).toBeNull();
    expect(shortcutAction(k('z', 'KeyZ', { ctrl: true, shift: true }), false)).toBeNull();
  });
});

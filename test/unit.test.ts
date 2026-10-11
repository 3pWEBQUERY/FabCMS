import { describe, expect, it } from 'vitest';
import { sanitizeRichText, safeHref } from '../src/shared/richtext';
import { slugify, readability, formatPrice, excerpt } from '../src/shared/text';
import { openStatus, compactHours, parseTime } from '../src/shared/hours';
import { parseDay, formatDay, addMonths, monthGrid, longDay } from '../src/shared/dates';
import { computeSlots, zonedToUtc, localDay, type BookingResource, type BookingService } from '../src/shared/booking';
import { analyzeSeo } from '../src/shared/seo-analyze';
import { BLOCKS, createBlock, sentences } from '../src/shared/blocks';
import { blockLookCss, cleanStyles, stylesUsed } from '../src/shared/styles';
import { FILTER_SORTS, filterParams, localNow, loopQuery, pageParam, relatedTo, timeField } from '../src/shared/query';
import type { Block, CollectionDef } from '../src/shared/types';
import { validateFields } from '../src/shared/fields';
import { matchRoute, entryPath, pageForLink } from '../src/shared/paths';
import { bgMediaIds, cleanBgMedia, slidesCss } from '../src/shared/bg-media';
import { cleanDividers, dividerHtml, DIVIDER_SHAPES } from '../src/shared/dividers';
import { totpCode, verifyTotp, base32Encode, sign, unsign, hashPassword, verifyPassword } from '../src/server/lib/crypto';
import { csvEscape } from '../src/server/lib/http';
import { html, raw } from '../src/site/html';
import { scopeCss } from '../src/site/blocks';
import { woffToSfnt } from '../src/server/og';
import { entryAccess, mayRead, memberLevel } from '../src/shared/members';
import { orderSlots, foodTotals } from '../src/shared/ordering';
import { parseWxr, parseShopifyCsv, parseMarkdownFile, parseFeed, parseCsv, sniffDelimiter } from '../src/server/importer/parse';
import { cellText, matchColumns, parseCell, tableFields } from '../src/shared/datatable';
import { alignRects, snapLines, snapTo } from '../src/shared/canvas';
import { replaceDeep, replaceInSettings } from '../src/shared/replace';
import { applyMailText } from '../src/shared/mails';
import { CAP_INFO, DEFAULT_ROLE_MODES, can, capsOf, modesOf, setCustomRoles } from '../src/shared/roles';
import { htmlToBlocks } from '../src/server/importer/run';
import { validQrIban, isQrIban, mod10, qrReference, scorReference, qrPayload, referenceFor } from '../src/shared/qrbill';
import { generateSdk } from '../src/server/sdk';
import { runHook, checkHookCode } from '../src/server/hooks';
import { DICT } from '../src/site/dict';
import * as Y from 'yjs';
import { applyData, toData, changedBlocks } from '../src/shared/collab-doc';
import { ADMIN_DICT } from '../src/admin/i18n/all';
import { dragSource, NEW_BLOCK, NEW_EL } from '../src/admin/editor/dragNew';
import { RECENT_MAX, withRecent } from '../src/admin/editor/elements/recentEls';
import { pageAnchors } from '../src/shared/anchors';
import { searchLayers } from '../src/admin/editor/layerSearch';
import { tr } from '../src/site/i18n';
import { mergeTranslation, translatableData } from '../src/shared/i18n';
import { compactHours as compactHoursL } from '../src/shared/hours';
import { BUILTIN_COLLECTIONS } from '../src/shared/collections';
import { blockCss, blockDomId, colRatios, cssColor, cssLength, designCss, effective, isEmptyDesign, setDesign, type Design } from '../src/shared/design';
import { hasMotion, MOTION_CSS, motionAttrs, motionVars } from '../src/shared/motion';
import { shortcutAction } from '../src/shared/shortcuts';
import { colorKey, pageColors, replaceColor } from '../src/shared/page-colors';
import { cleanConds, condsHold, type CondEnv } from '../src/shared/conditions';
import { fieldKey, freeAddress, keyFields, newType, STUDIO_FIELD_TYPES, TYPE_PRESETS, typeAddress } from '../src/shared/type-presets';
import {
  applyOverrides,
  bindKind,
  canvasPlacement,
  cloneEl,
  componentEls,
  createEl,
  EL_DEFS,
  elementsCss,
  elementsHeadings,
  elementsMedia,
  elementsText,
  findEl,
  insertEl,
  itemLabel,
  LAYOUT_PRESETS,
  moveEl,
  newItem,
  removeEl,
  sanitizeEls,
  sanitizeVariants,
  templateStarter,
  archiveStarter,
  footerStarter,
  headerStarter,
  siteDataOf,
  variantsCss,
  walkEls,
  headlineText,
  scopeElCss,
  cleanAnchor,
  elDomId,
  type El,
  type ElKind,
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
import { composite, contrastRatio, fixColor, formatRatio, needFor, parseHex } from '../src/shared/contrast';
import { abGroups, abVerdict, AB_MIN_SHOWN, pathList, pathMatches, popupConf, popupShowsOn } from '../src/shared/popups';
import { starText, summarize } from '../src/shared/reviews';
import { crossedLimit, lowStock, stockLimit } from '../src/shared/stock';
import { giftCardApplies, giftCardCode, normalizeCode } from '../src/shared/giftcards';

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

  it('knows the scroll, text and hover effects of an element, and the visual effects of the design', () => {
    expect(motionAttrs({ scroll: 'unveil', hover: 'magnet', text: 'scrub' })).toBe('data-scroll="unveil" data-scroll-k="30" data-hover-self="magnet" data-text="scrub"');
    expect(motionAttrs({ hover: 'wobble' as never, text: '<i>' as never })).toBe('');
    expect(hasMotion({ text: 'words' })).toBe(true);
    // An element moves itself, a block its content; without a word split nothing waits hidden.
    expect(MOTION_CSS).toContain('.el[data-scroll]{translate:var(--sx,0) var(--sy,0);scale:var(--ss,1);rotate:var(--sr,0deg)}');
    expect(MOTION_CSS).toContain('.text-ready[data-text=words]:not(.text-in) .tw{opacity:0');
    expect(MOTION_CSS.indexOf('.text-ready')).toBeGreaterThan(MOTION_CSS.indexOf('@media (prefers-reduced-motion:no-preference)'));
    const css = designCss('#e', {
      desktop: {
        textGradient: {
          type: 'linear',
          angle: 90,
          stops: [
            { color: '$accent', at: 0 },
            { color: '#ff0080', at: 100 },
          ],
        },
        bg: '$bg',
        gradient: {
          type: 'linear',
          stops: [
            { color: '#000', at: 0 },
            { color: '#fff', at: 100 },
          ],
        },
        blur: '2px',
        grayscale: 100,
        saturate: 900,
        blend: 'multiply',
        shape: 'diamond',
      },
      hover: { grayscale: 0 },
    });
    // The gradient shows through the letters; the background gradient gives way to it.
    expect(css).toContain(
      'background-image:linear-gradient(90deg,var(--accent) 0%,#ff0080 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent',
    );
    expect(css).not.toContain('linear-gradient(180deg');
    expect(css).toContain('filter:blur(2px) grayscale(100%) saturate(300%)');
    expect(css).toContain('mix-blend-mode:multiply');
    expect(css).toContain('clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)');
    expect(css).toContain('#e:hover{filter:grayscale(0%)}');
    expect(designCss('#e', { desktop: { blend: 'plus-darker' as never, shape: 'url(x)' as never, brightness: 'x' as never } })).toBe('');
    expect(designCss('#e', { desktop: { shape: 'blob' } })).toBe('#e{border-radius:58% 42% 38% 62% / 52% 38% 62% 48%}');
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
        props: {
          collection: 'Posts; drop',
          limit: 900,
          sort: 'shuffle',
          category: '  Touren  ',
          offset: -3,
          rules: [{ field: '../x', is: 'a' }, { field: 'kind', is: ' <b>Wein</b> ' }, 'x'],
          related: 'all',
          paginate: 'yes',
        },
        children: [
          { kind: 'heading', props: { text: 'Titel' }, bind: { text: 'title', level: 'title' } },
          { kind: 'image', props: {}, bind: { image: 'field:cover', href: 'javascript:x' } },
          { kind: 'text', props: { html: '<p>x</p>' }, bind: { html: 'field:../secret' } },
        ],
      },
    ]);
    expect(list.props).toEqual({
      archive: false,
      collection: 'posts',
      limit: 48,
      offset: 0,
      sort: 'newest',
      sortField: '',
      category: 'Touren',
      tag: '',
      rules: [{ field: 'kind', is: 'bWein/b' }],
      related: 'none',
      excludeCurrent: false,
      time: 'all',
      paginate: false,
      shop: 'all',
      empty: '',
    });
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

  it("keeps component variants to designs of the component's own elements", () => {
    const els: El[] = [{ id: 'card', kind: 'box', props: {}, children: [{ id: 'h', kind: 'heading', props: { text: 'A', level: '3' } }] }];
    const vs = sanitizeVariants(
      [
        { id: 'dark', name: '  Dunkel ', designs: { card: { desktop: { bg: '$inv-bg' } }, ghost: { desktop: { bg: 'red' } }, h: 'nope' } },
        { id: 'dark', name: 'Doppelt', designs: {} },
        { id: 'x"><', name: 'Böse', designs: {} },
        { id: 'small', designs: { h: { mobile: { fontSize: '$step-2' } } } },
        ...Array.from({ length: 20 }, (_, i) => ({ id: `v${i}`, name: `V${i}`, designs: {} })),
      ],
      els,
    );
    expect(vs.slice(0, 2)).toEqual([
      { id: 'dark', name: 'Dunkel', designs: { card: { desktop: { bg: '$inv-bg' } } } },
      { id: 'small', name: 'Variante', designs: { h: { mobile: { fontSize: '$step-2' } } } },
    ]);
    expect(vs.length).toBeLessThanOrEqual(12);
    // A variant's look applies inside the places that chose it.
    const css = variantsCss(vs.slice(0, 2));
    expect(css).toContain('.v-dark :is(#e-card,.e-card){background-color:var(--inv-bg)');
    expect(css).toContain('@media (max-width:40rem){.v-small :is(#e-h,.e-h){font-size:var(--step-2)}}');
    expect(sanitizeEls([{ kind: 'component', props: { variant: 'dark' } }])[0].props.variant).toBe('dark');
    expect(sanitizeEls([{ kind: 'component', props: { variant: '"><x' } }])[0].props.variant).toBeNull();
  });

  it('draws shapes in safe colours and places new elements on a free canvas', () => {
    const [shape, line] = sanitizeEls([
      { id: 's1', kind: 'shape', props: { shape: 'heart', fill: 'url(javascript:x)', stroke: '$ink/40', strokeWidth: 99 } },
      { id: 's2', kind: 'shape', props: { shape: 'wave', fill: '#e8408a', strokeWidth: 2.3 } },
    ]);
    expect(shape.props).toEqual({ shape: 'blob', fill: '', stroke: '$ink/40', strokeWidth: 40 });
    expect(line.props).toEqual({ shape: 'wave', fill: '#e8408a', stroke: '', strokeWidth: 2.5 });
    const css = elementsCss([shape, line]);
    expect(css).toContain(':is(#e-s1,.e-s1){--stroke:color-mix(in srgb,var(--ink) 40%,transparent);--sw:40px}');
    expect(css).toContain(':is(#e-s2,.e-s2){--fill:#e8408a;--sw:2.5px}');
    // Each new element lands a little further in, in percent of the canvas.
    expect(canvasPlacement(createEl('heading'), 0).design!.desktop).toMatchObject({ left: '8%', top: '8%', width: '40%' });
    expect(canvasPlacement(createEl('shape'), 2).design!.desktop).toMatchObject({ left: '20%', top: '20%', width: '18%', aspect: '1/1' });
    const canvas = createEl('canvas');
    expect(canvas.children).toEqual([]);
    expect(canvas.design).toEqual({ desktop: { aspect: '16/9' }, mobile: { aspect: '4/5' } });
  });

  it('starts page templates bound to the fields of their type', () => {
    const posts = BUILTIN_COLLECTIONS.find((c) => c.id === 'posts')!;
    const els = templateStarter(posts);
    const binds: Record<string, string>[] = [];
    walkEls(els, (el) => el.bind && binds.push(el.bind));
    expect(binds).toContainEqual({ text: 'title' });
    expect(binds).toContainEqual({ html: 'field:excerpt' });
    expect(binds).toContainEqual({ image: 'field:cover' });
    expect(els[els.length - 1]).toMatchObject({ kind: 'entrybody', props: { show: 'blocks' } });
    expect(sanitizeEls(els)).toHaveLength(els.length);
    // Buying, booking, tickets: Nova's own view stays, the template goes around it.
    expect(templateStarter(BUILTIN_COLLECTIONS.find((c) => c.id === 'products')!)).toMatchObject([{ kind: 'entrybody', props: { show: 'default' } }]);
    expect(sanitizeEls([{ kind: 'entrybody', props: { show: 'all' } }])[0].props).toEqual({ show: 'blocks' });
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
    // «/» inserts, as in Notion; with a modifier it is something else.
    expect(shortcutAction(k('/', 'Slash'), false)).toBe('insert');
    expect(shortcutAction(k('/', 'Digit7', { ctrl: true }), false)).toBeNull();
    // ⌥⌘C types «ç» on a Mac – still «copy design».
    expect(shortcutAction(k('ç', 'KeyC', { meta: true, alt: true }), true)).toBe('copy-style');
    expect(shortcutAction(k('v', 'KeyV', { ctrl: true }), false)).toBe('paste');
    expect(shortcutAction(k('ArrowUp', 'ArrowUp', { alt: true }), false)).toBe('move-up');
    expect(shortcutAction(k('?', 'Minus', { shift: true }), false)).toBe('help');
    expect(shortcutAction(k('c', 'KeyC'), false)).toBeNull();
    expect(shortcutAction(k('z', 'KeyZ', { ctrl: true, shift: true }), false)).toBeNull();
  });
});

describe('data view cells', () => {
  const products = BUILTIN_COLLECTIONS.find((c) => c.id === 'products')!;
  const f = (key: string) => products.fields.find((x) => x.key === key)!;
  it('offers only flat fields as columns', () => {
    const keys = tableFields(products.fields).map((x) => x.key);
    expect(keys).toContain('price');
    expect(keys).not.toContain('title');
    expect(keys).not.toContain('images');
    expect(keys).not.toContain('variants');
  });
  it('turns values into text and back the Swiss way', () => {
    expect(cellText(f('price'), 1250)).toBe('12.50');
    expect(parseCell(f('price'), "1'250.50")).toEqual({ ok: true, value: 125050 });
    expect(parseCell(f('price'), '12,5')).toEqual({ ok: true, value: 1250 });
    expect(parseCell(f('price'), 'CHF 9.90')).toEqual({ ok: true, value: 990 });
    expect(parseCell(f('price'), 'gratis')).toEqual({ ok: false, error: '«Preis (inkl. MwSt.)»: «gratis» ist keine Zahl.' });
    expect(parseCell(f('digital'), 'Ja')).toEqual({ ok: true, value: true });
    expect(parseCell(f('digital'), '')).toEqual({ ok: true, value: false });
    expect(parseCell(f('digital'), 'vielleicht').ok).toBe(false);
    const date: FieldDef = { key: 'd', type: 'date', label: 'Datum' };
    expect(parseCell(date, '3.4.2026')).toEqual({ ok: true, value: '2026-04-03' });
    expect(parseCell(date, '2026-13-45').ok).toBe(false);
    const tags: FieldDef = { key: 't', type: 'tags', label: 'Schlagwörter' };
    expect(parseCell(tags, 'a, b; a ,')).toEqual({ ok: true, value: ['a', 'b'] });
    expect(cellText(tags, ['a', 'b'])).toBe('a, b');
  });
  it('accepts a choice by value or label, and names the valid ones otherwise', () => {
    const sel: FieldDef = {
      key: 's',
      type: 'select',
      label: 'Art',
      options: [
        { value: 'rent', label: 'Miete' },
        { value: 'buy', label: 'Kauf' },
      ],
    };
    expect(parseCell(sel, 'miete')).toEqual({ ok: true, value: 'rent' });
    expect(parseCell(sel, 'buy')).toEqual({ ok: true, value: 'buy' });
    expect(parseCell(sel, 'Tausch')).toEqual({ ok: false, error: '«Art»: «Tausch» gibt es nicht zur Auswahl (rent, buy).' });
  });
  it('matches file columns by key or label and lists the rest', () => {
    const { map, ignored } = matchColumns(['ID', 'Titel', 'preis (inkl. mwst.)', 'sku', 'status', 'Farbe'], tableFields(products.fields));
    expect(map.map((m) => (typeof m === 'string' || m === null ? m : m.key))).toEqual(['id', 'title', 'price', 'sku', null, null]);
    expect(ignored).toEqual(['Farbe']);
  });
  it('reads CSV with semicolons (Excel) as well as commas and tabs', () => {
    expect(sniffDelimiter('\uFEFFid;title;price\r\n1;"a;b";3')).toBe(';');
    expect(sniffDelimiter('id,title\n1,x')).toBe(',');
    expect(sniffDelimiter('id\ttitle\n1\tx')).toBe('\t');
    expect(parseCsv('id;title\r\n1;"Brot; frisch"\r\n', ';')).toEqual([
      ['id', 'title'],
      ['1', 'Brot; frisch'],
    ]);
  });
});

describe('own roles', () => {
  it('checks built-in and own roles the same way, and lists every right once', () => {
    setCustomRoles([{ id: 'shop-team', name: 'Shop-Team', help: '', caps: ['orders.view'], werkbank: true }]);
    expect(can('shop-team', 'orders.view')).toBe(true);
    expect(can('shop-team', 'content.edit')).toBe(false);
    expect(can('editor', 'content.edit')).toBe(true);
    expect(capsOf('gibts-nicht')).toEqual([]);
    expect(modesOf('shop-team', DEFAULT_ROLE_MODES)).toEqual(['studio', 'werkbank']);
    expect(modesOf('author', DEFAULT_ROLE_MODES)).toEqual(['studio']);
    setCustomRoles([]);
    expect(can('shop-team', 'orders.view')).toBe(false);
    const caps = CAP_INFO.map((c) => c.cap);
    expect(new Set(caps).size).toBe(caps.length);
    expect(caps.sort()).toEqual([...capsOf('owner')].sort());
  });
});

describe('free canvas geometry', () => {
  const r = (l: number, t: number, w: number, h: number) => ({ l, t, w, h });
  it('lines one element up with the canvas, several with each other', () => {
    expect(alignRects([r(10, 10, 20, 10)], 'center')).toEqual([r(40, 10, 20, 10)]);
    expect(alignRects([r(10, 10, 20, 10)], 'bottom')).toEqual([r(10, 90, 20, 10)]);
    const two = alignRects([r(10, 10, 20, 10), r(50, 30, 10, 10)], 'right');
    expect(two.map((b) => b.l)).toEqual([40, 50]);
    expect(alignRects([r(10, 10, 20, 10), r(50, 30, 10, 30)], 'middle').map((b) => b.t)).toEqual([30, 20]);
  });
  it('spaces three or more by their middles, the outer ones stay', () => {
    const spaced = alignRects([r(0, 0, 10, 10), r(70, 0, 10, 10), r(20, 0, 30, 10)], 'hspace');
    expect(spaced.map((b) => b.l + b.w / 2)).toEqual([5, 75, 40]);
    // Two are left as they are.
    expect(alignRects([r(0, 0, 10, 10), r(70, 0, 10, 10)], 'vspace').map((b) => b.t)).toEqual([0, 0]);
  });
  it('snaps to the nearest edge or middle within range', () => {
    const lines = snapLines([r(30, 20, 10, 10)], 'x');
    expect(lines).toEqual([0, 50, 100, 30, 35, 40]);
    expect(snapTo([29.4, 34.4, 39.4], lines, 1)).toEqual({ by: expect.closeTo(0.6), at: 30 });
    expect(snapTo([60, 61, 62], lines, 1)).toBeNull();
  });
});

describe('search and replace', () => {
  it('changes text people read, not ids or structure', () => {
    const data = {
      title: 'Telefon 044 123 45 67',
      blocks: [{ id: '044', type: 'text', props: { body: '<p>Ruf an: <a href="tel:0441234567">044 123 45 67</a></p>' } }],
    };
    const r = replaceDeep(data, { find: '044 123 45 67', replace: '052 999 00 11' });
    expect(r.value.title).toBe('Telefon 052 999 00 11');
    expect(r.value.blocks[0].id).toBe('044');
    // In rich text only the text between tags – the link target is not text.
    expect(r.value.blocks[0].props.body).toBe('<p>Ruf an: <a href="tel:0441234567">052 999 00 11</a></p>');
    expect(r.hits.map((h) => h.path)).toEqual(['title', 'blocks.0.props.body']);
  });
  it('matches rich text as it reads and keeps it valid HTML', () => {
    const r = replaceDeep({ body: '<p>Müller &amp; Söhne <strong>AG</strong></p>' }, { find: 'Müller & Söhne', replace: 'Müller <Partner>' });
    expect(r.value.body).toBe('<p>Müller &lt;Partner&gt; <strong>AG</strong></p>');
    expect(r.hits[0]).toMatchObject({ match: 'Müller & Söhne', after: ' AG' });
    // A tag name is never a hit.
    expect(replaceDeep({ body: '<strong>stark</strong>' }, { find: 'strong', replace: 'x' }).hits).toHaveLength(0);
  });
  it('knows case and whole words, also with umlauts', () => {
    expect(replaceDeep({ t: 'Bern und Berner Oberland' }, { find: 'bern', replace: 'Basel', wholeWord: true }).value.t).toBe('Basel und Berner Oberland');
    expect(replaceDeep({ t: 'Bern und bern' }, { find: 'bern', replace: 'Basel', caseSensitive: true }).value.t).toBe('Bern und Basel');
    expect(replaceDeep({ t: 'Zürich und Zürichsee' }, { find: 'Zürich', replace: 'Winterthur', wholeWord: true }).value.t).toBe('Winterthur und Zürichsee');
    expect(replaceDeep({ t: 'a.b' }, { find: '.', replace: '-' }).value.t).toBe('a-b');
    expect(replaceDeep({ t: 'x' }, { find: '', replace: 'y' }).hits).toEqual([]);
  });
  it('replaces in the readable site settings only', () => {
    const s = { name: 'Gasthaus Linde', business: { phone: '044 1', email: 'a@b.ch' }, seo: { indexNowKey: 'Linde' }, nav: [{ id: 'n1', label: 'Linde', href: '/' }] };
    const r = replaceInSettings(s, { find: 'Linde', replace: 'Eiche' });
    expect(r.value).toMatchObject({ name: 'Gasthaus Eiche', seo: { indexNowKey: 'Linde' }, nav: [{ id: 'n1', label: 'Eiche' }] });
    expect(r.hits.map((h) => h.path)).toEqual(['name', 'nav.0.label']);
  });
});

describe('own mail texts', () => {
  const mail = { subject: 'Linde: Bestellung B-1', text: 'Hallo Anna,\n\nDanke für deine Bestellung.\n1 × Käse  12.–\n\nLinde' };
  const sign = { site: 'Linde', signature: '' };
  it('leaves Nova’s mail as it is without own texts', () => {
    expect(applyMailText(mail, undefined, {}, sign)).toEqual(mail);
  });
  it('puts own texts after the greeting and before the signature, with placeholders', () => {
    const r = applyMailText(
      mail,
      { subject: '{site}: deine Bestellung {number}', intro: 'Schön, {name}!', outro: 'Bis bald.' },
      { name: 'Anna', number: 'B-1' },
      { site: 'Linde', signature: 'Euer Linde-Team' },
    );
    expect(r.subject).toBe('Linde: deine Bestellung B-1');
    expect(r.text).toBe('Hallo Anna,\n\nSchön, Anna!\n\nDanke für deine Bestellung.\n1 × Käse  12.–\n\nBis bald.\n\nEuer Linde-Team');
    // Unknown placeholders stay readable instead of vanishing.
    expect(applyMailText(mail, { intro: 'Hallo {wer}' }, {}, sign).text).toContain('Hallo {wer}');
  });
});

describe('text contrast', () => {
  const hex = (h: string) => parseHex(h)!;
  it('measures like WCAG', () => {
    expect(contrastRatio(hex('#000000'), hex('#ffffff'))).toBeCloseTo(21, 5);
    expect(contrastRatio(hex('#777777'), hex('#ffffff'))).toBeCloseTo(4.48, 2);
    expect(contrastRatio(hex('#ffffff'), hex('#777777'))).toBeCloseTo(4.48, 2);
    // Shown rounded down: 4.48 is not «4.5».
    expect(formatRatio(4.48)).toBe('4.4');
    expect(needFor(16, 400)).toBe(4.5);
    expect(needFor(19, 700)).toBe(3);
    expect(needFor(19, 400)).toBe(4.5);
    expect(needFor(24, 400)).toBe(3);
  });

  it('lays transparent text over its background', () => {
    const half = { ...hex('#000000'), a: 0.5 };
    expect(composite(half, hex('#ffffff'))).toMatchObject({ r: 127.5, g: 127.5, b: 127.5, a: 1 });
  });

  it('suggests the nearest colour of the same hue that is readable', () => {
    const bg = hex('#ffffff');
    const fix = fixColor(hex('#9aa0a6'), bg, 4.5)!;
    expect(contrastRatio(hex(fix), bg)).toBeGreaterThanOrEqual(4.5);
    // Darker grey, not black.
    expect(fix).not.toBe('#000000');
    expect(contrastRatio(hex(fix), bg)).toBeLessThan(5.5);
    // On dark ground it goes lighter.
    const dark = hex('#1c1b19');
    const light = fixColor(hex('#555555'), dark, 4.5)!;
    expect(contrastRatio(hex(light), dark)).toBeGreaterThanOrEqual(4.5);
    expect(hex(light).r).toBeGreaterThan(0x55);
    // Muted text keeps its transparency: the fix works once laid over the ground.
    const muted = fixColor({ ...hex('#888888'), a: 0.72 }, bg, 4.5)!;
    expect(contrastRatio(composite({ ...hex(muted), a: 0.72 }, bg), bg)).toBeGreaterThanOrEqual(4.5);
    // Half-transparent text on mid grey can't reach it either way.
    expect(fixColor({ ...hex('#000000'), a: 0.1 }, hex('#777777'), 4.5)).toBeNull();
  });
});

describe('pop-ups', () => {
  it('checks every setting and fills in the rest', () => {
    expect(popupConf({})).toMatchObject({
      trigger: 'delay',
      delay: 8,
      scroll: 50,
      frequency: 'days',
      days: 14,
      position: 'center',
      size: 'm',
      paths: [],
      skip: [],
      from: null,
      until: null,
    });
    const c = popupConf({
      popup_trigger: 'hover',
      popup_delay: '-3',
      popup_scroll: 250,
      popup_days: 0,
      popup_position: 'bar',
      popup_size: 'xl',
      popup_from: 'morgen',
      popup_until: '2026-12-24T18:00:00',
    });
    expect(c).toMatchObject({ trigger: 'delay', delay: 0, scroll: 100, days: 1, position: 'bar', size: 'm', from: null, until: '2026-12-24T18:00' });
  });

  it('reads one address per line and matches below a star', () => {
    expect(pathList('shop/*\n https://www.beispiel.ch/kontakt/ \n\n/\n/shop/*')).toEqual(['/shop/*', '/kontakt', '/']);
    expect(pathMatches('/shop/*', '/shop')).toBe(true);
    expect(pathMatches('/shop/*', '/shop/kaese')).toBe(true);
    expect(pathMatches('/shop/*', '/shopping')).toBe(false);
    expect(pathMatches('/kontakt', '/kontakt/')).toBe(true);
    expect(pathMatches('/', '/kontakt')).toBe(false);
    expect(pathMatches('/*', '/kontakt')).toBe(true);
  });

  it("shows only on its pages and in its time, in the site's time zone", () => {
    const conf = popupConf({ popup_paths: '/blog/*', popup_skip: '/blog/intern', popup_from: '2026-12-01T08:00', popup_until: '2026-12-24T00:00' });
    const at = (iso: string) => new Date(iso);
    expect(popupShowsOn(conf, '/blog/neu', at('2026-12-10T12:00Z'), 'Europe/Zurich')).toBe(true);
    expect(popupShowsOn(conf, '/blog/intern', at('2026-12-10T12:00Z'), 'Europe/Zurich')).toBe(false);
    expect(popupShowsOn(conf, '/', at('2026-12-10T12:00Z'), 'Europe/Zurich')).toBe(false);
    // 08:00 in Zurich is 07:00 UTC in winter.
    expect(popupShowsOn(conf, '/blog/neu', at('2026-12-01T06:59Z'), 'Europe/Zurich')).toBe(false);
    expect(popupShowsOn(conf, '/blog/neu', at('2026-12-01T07:00Z'), 'Europe/Zurich')).toBe(true);
    expect(popupShowsOn(conf, '/blog/neu', at('2026-12-23T23:00Z'), 'Europe/Zurich')).toBe(false);
  });
});

describe('product reviews', () => {
  it('averages to one decimal and counts per star, ignoring what is not a rating', () => {
    expect(summarize([{ rating: 5 }, { rating: 4 }, { rating: 4 }, { rating: 0 }, { rating: 2.5 }])).toEqual({ count: 3, average: 4.3, spread: [1, 2, 0, 0, 0] });
    expect(summarize([])).toEqual({ count: 0, average: 0, spread: [0, 0, 0, 0, 0] });
    expect(starText(4.3)).toBe('★★★★☆');
    expect(starText(4.5)).toBe('★★★★★');
  });
});

describe('low stock', () => {
  it("warns at the product's own limit or the shop's, per variant, never for unlimited stock", () => {
    const list = lowStock(
      [
        { id: 'a', title: 'Käse', stock: 3 },
        { id: 'b', title: 'Brot', stock: 4 },
        { id: 'c', title: 'Wein', stock: 9, stockAlert: 10 },
        { id: 'd', title: 'Honig', stock: null },
        { id: 'e', title: 'Shirt', variants: [{ name: 'S', stock: 0 }, { name: 'M', stock: 8 }, { name: 'L' }] },
      ],
      3,
    );
    expect(list.map((x) => [x.title, x.variant, x.stock, x.limit])).toEqual([
      ['Shirt', 'S', 0, 3],
      ['Käse', null, 3, 3],
      ['Wein', null, 9, 10],
    ]);
    expect(stockLimit({ stockAlert: -2 }, 3)).toBe(0);
    expect(stockLimit({ stockAlert: null }, 3)).toBe(3);
  });

  it('tells only when an order crosses the limit', () => {
    expect(crossedLimit(5, 3, 3)).toBe(true);
    expect(crossedLimit(3, 2, 3)).toBe(false);
    expect(crossedLimit(9, 4, 3)).toBe(false);
    expect(crossedLimit(1, 0, 0)).toBe(true);
  });
});

describe('gift cards', () => {
  it('makes codes without look-alike letters and reads them back however they are typed', () => {
    const code = giftCardCode((n) => Uint8Array.from({ length: n }, (_, i) => i * 37));
    expect(code).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    expect(code).not.toMatch(/[01ILO]/);
    expect(normalizeCode(code.toLowerCase().replace(/-/g, ' '))).toBe(code);
    expect(normalizeCode(' sommer10 ')).toBe('SOMMER10');
  });

  it('pays at most its balance and never more than is due', () => {
    expect(giftCardApplies(5000, 3880)).toBe(3880);
    expect(giftCardApplies(1120, 5370)).toBe(1120);
    expect(giftCardApplies(0, 100)).toBe(0);
    expect(giftCardApplies(500, -1)).toBe(0);
  });
});

describe('pop-up A/B tests', () => {
  it('groups linked pop-ups both ways and in chains, named by their first id', () => {
    const groups = abGroups([
      { id: 'c', ab: 'b' },
      { id: 'b', ab: null },
      { id: 'a', ab: 'b' },
      { id: 'd', ab: 'd' },
      { id: 'e', ab: 'gone' },
      { id: 'f', ab: 'g' },
      { id: 'g', ab: 'f' },
    ]);
    expect(groups.get('a')).toEqual(['a', 'b', 'c']);
    expect(groups.get('c')).toEqual(['a', 'b', 'c']);
    expect(groups.get('f')).toEqual(['f', 'g']);
    // Linked to itself, to nothing that is live, or not at all: no test.
    for (const id of ['d', 'e', 'x']) expect(groups.has(id)).toBe(false);
  });

  it('names a winner only with enough views and a difference beyond chance', () => {
    const v = (id: string, shown: number, clicked: number) => ({ id, shown, clicked });
    // A clear lead, but too few views to say.
    expect(abVerdict([v('a', 40, 20), v('b', 40, 2)])).toEqual({ leader: 'a', sure: false, needMore: true });
    // 12 % against 8 % on 1000 views each: z ≈ 2.98.
    expect(abVerdict([v('a', 1000, 80), v('b', 1000, 120)])).toEqual({ leader: 'b', sure: true, needMore: false });
    // 10 % against 9 %: could be chance.
    expect(abVerdict([v('a', 1000, 100), v('b', 1000, 90)])).toEqual({ leader: 'a', sure: false, needMore: false });
    // Three pop-ups: the leader has to beat each by more (z ≈ 2.12 is enough for two, not for three).
    expect(abVerdict([v('a', 1500, 150), v('b', 1500, 117)]).sure).toBe(true);
    expect(abVerdict([v('a', 1500, 150), v('b', 1500, 117), v('c', 1500, 60)]).sure).toBe(false);
    // The same rate, nothing clicked at all, or a test of one: no leader.
    expect(abVerdict([v('a', 500, 50), v('b', 500, 50)]).leader).toBeNull();
    expect(abVerdict([v('a', 500, 0), v('b', 500, 0)])).toEqual({ leader: null, sure: false, needMore: false });
    expect(abVerdict([v('a', 500, 20)])).toEqual({ leader: null, sure: false, needMore: true });
    expect(AB_MIN_SHOWN).toBe(100);
  });
});

describe('saved styles', () => {
  it('builds a block look from its styles first, then its own design and elements', () => {
    const styles = [
      { id: 'abc123', name: 'A', design: { desktop: { pt: '8px' } } },
      { id: 'def456', name: 'B', design: { desktop: { weight: 700 } } },
      { id: 'zzz999', name: 'Unbenutzt', design: { desktop: { pt: '1px' } } },
    ];
    const b = {
      id: 'b1',
      type: 'layout',
      props: {
        els: [
          { id: 'e1', kind: 'text', use: 'def456', props: {} },
          { id: 'e2', kind: 'text', use: 'nope!', props: {} },
        ],
      },
      style: { use: 'abc123', design: { desktop: { pt: '16px' } } },
    } as unknown as Block;
    expect(stylesUsed(b)).toEqual(['abc123', 'def456']);
    const css = blockLookCss('#b-b1', b, styles);
    expect(css.startsWith('.st-abc123.st-abc123{padding-top:8px}.st-def456.st-def456{font-weight:700}#b-b1{padding-top:16px}')).toBe(true);
    expect(css).not.toContain('zzz999');
    expect(cleanStyles([{ id: 'abc123', name: 'x'.repeat(80), design: {} }])[0].name).toHaveLength(60);
    expect(cleanStyles('nein')).toEqual([]);
  });
});

describe('element interactions', () => {
  it('keeps a copied button aimed at the copy of its element', () => {
    const box = {
      id: 'outer',
      kind: 'box',
      props: {},
      children: [
        { id: 'btn', kind: 'button', props: {}, act: { do: 'toggle', target: 'panel' } },
        { id: 'panel', kind: 'box', props: {}, hidden: true, children: [] },
        { id: 'away', kind: 'button', props: {}, act: { do: 'show', target: 'elsewhere' } },
      ],
    } as unknown as El;
    const copy = cloneEl(box);
    const [btn, panel, away] = copy.children!;
    expect(panel.id).not.toBe('panel');
    expect(btn.act).toEqual({ do: 'toggle', target: panel.id });
    expect(panel.hidden).toBe(true);
    // Aimed outside the copy: stays as it was.
    expect(away.act?.target).toBe('elsewhere');
  });
});

describe('image focus per place', () => {
  it('keeps a valid focus and puts it over the picture of the media library', () => {
    const [ok, bad, none] = sanitizeEls([
      { id: 'f1', kind: 'image', props: { image: null, focus: { x: 20.4, y: 80 } } },
      { id: 'f2', kind: 'image', props: { image: null, focus: { x: 120, y: '1;}' } } },
      { id: 'f3', kind: 'image', props: { image: null } },
    ]);
    expect(ok.props.focus).toEqual({ x: 20, y: 80 });
    expect(bad.props.focus).toBeUndefined();
    expect(none.props.focus).toBeUndefined();
    const css = elementsCss([ok, none]);
    expect(css).toContain(':is(#e-f1,.e-f1) img{object-position:20% 80%!important}');
    expect(css).not.toContain('e-f3) img');
  });
});

describe('Inhaltsschleife', () => {
  it('finds the date to split by, the wall time and what «like this entry» means', () => {
    const c = (fields: { key: string; type: string }[]) => ({ fields }) as unknown as CollectionDef;
    expect(
      timeField(
        c([
          { key: 'title', type: 'text' },
          { key: 'end', type: 'datetime' },
          { key: 'start', type: 'datetime' },
        ]),
      ),
    ).toBe('start');
    expect(timeField(c([{ key: 'date', type: 'date' }]))).toBe('date');
    expect(timeField(c([{ key: 'title', type: 'text' }]))).toBeNull();
    // 22:30 UTC is already the next day in Zurich in summer.
    expect(localNow(new Date('2026-07-01T22:30:00Z'), 'Europe/Zurich')).toBe('2026-07-02T00:30');
    const q = (related: string) => loopQuery({ related });
    expect(relatedTo(q('none'), { title: 'x', category: 'Touren' })).toBeNull();
    expect(relatedTo(q('category'), { title: 'x', category: 'Touren' })).toEqual({ category: 'Touren' });
    // Without a category nothing is «the same».
    expect(relatedTo(q('category'), { title: 'x' })).toEqual({ tags: [] });
    expect(relatedTo(q('tags'), { title: 'x', tags: ['Berg', 2, 'See'] })).toEqual({ tags: ['berg', 'see'] });
    expect(relatedTo(q('tags'), null)).toBeNull();
    expect(pageParam('abc')).toBe('seite-abc');
  });
});

describe('Kopfzeile, Fusszeile und Archiv', () => {
  it('keeps the website elements in their safe form', () => {
    const [logo, menu, hours, terms, loop] = sanitizeEls([
      { id: 'a1', kind: 'logo', props: { show: '<b>' } },
      { id: 'a2', kind: 'menu', props: { source: 'admin', burger: 'no', extras: false } },
      { id: 'a3', kind: 'hours', props: { status: false } },
      { id: 'a4', kind: 'terms', props: { collection: '../users' } },
      { id: 'a5', kind: 'list', props: { archive: 'yes', collection: 'posts' }, children: [{ id: 'a6', kind: 'box', props: {} }] },
    ]);
    expect(logo.props).toEqual({ show: 'auto' });
    expect(menu.props).toEqual({ source: 'main', burger: true, extras: false });
    expect(hours.props).toEqual({ status: false });
    expect(terms.props).toEqual({ collection: '' });
    // Only a real «true» turns the overview's address on.
    expect(loop.props.archive).toBe(false);
    expect(loopQuery({ archive: true }).archive).toBe(true);
  });

  it('starts header, footer and overview with elements wired to the website', () => {
    const kinds = (els: El[]) => {
      const out: string[] = [];
      walkEls(els, (e) => void out.push(e.kind));
      return out;
    };
    const binds = (els: El[]) => {
      const out: string[] = [];
      walkEls(els, (e) => void Object.values(e.bind ?? {}).forEach((b) => out.push(b)));
      return out;
    };
    // What a starter brings survives the check the server makes.
    for (const els of [headerStarter(), footerStarter()]) expect(sanitizeEls(els)).toEqual(els);
    expect(kinds(headerStarter())).toEqual(['box', 'logo', 'menu']);
    expect(kinds(footerStarter())).toEqual(expect.arrayContaining(['hours', 'menu', 'divider']));
    expect(binds(footerStarter())).toEqual(['site:name', 'site:address', 'site:copyright']);
    const posts = BUILTIN_COLLECTIONS.find((c) => c.id === 'posts')!;
    const archive = archiveStarter(posts);
    expect(sanitizeEls(archive)).toEqual(archive);
    expect(kinds(archive).slice(0, 3)).toEqual(['heading', 'terms', 'list']);
    expect(archive[2].props).toMatchObject({ archive: true, collection: 'posts', paginate: true });
    expect(binds(archive)).toEqual(['site:page', 'url', 'field:cover', 'title', 'field:excerpt']);
    // A type without categories gets no filter.
    const team = { ...posts, id: 'team', fields: posts.fields.filter((f) => f.key !== 'category') };
    expect(kinds(archiveStarter(team))).not.toContain('terms');
  });
});

describe('Website-Daten am Element', () => {
  it('knows which of the website data an element shows', () => {
    const el = (kind: El['kind'], props: Record<string, unknown> = {}, bind?: Record<string, string>) => ({ id: 'x', kind, props, ...(bind ? { bind } : {}) }) as El;
    expect(siteDataOf(el('heading', {}, { text: 'site:name' }))).toEqual(['name']);
    // Phone as text and as call link, the address, the copyright with the legal name.
    expect(siteDataOf(el('button', {}, { label: 'site:phone', href: 'site:phone-link' }))).toEqual(['phone']);
    expect(siteDataOf(el('text', {}, { html: 'site:address' }))).toEqual(['address']);
    expect(siteDataOf(el('text', {}, { html: 'site:copyright' }))).toEqual(['legal']);
    expect(siteDataOf(el('image', {}, { image: 'site:logo' }))).toEqual(['logo']);
    // Nothing to edit: the year, the page title, the home link, an entry's fields, unknown words.
    expect(siteDataOf(el('text', {}, { html: 'site:year', href: 'site:home' }))).toEqual([]);
    expect(siteDataOf(el('heading', {}, { text: 'title' }))).toEqual([]);
    expect(siteDataOf(el('heading', {}, { text: 'constructor' }))).toEqual([]);
    // The website's own elements: logo with name, opening hours, the chosen menu.
    expect(siteDataOf(el('logo'))).toEqual(['logo', 'name']);
    expect(siteDataOf(el('hours'))).toEqual(['hours']);
    expect(siteDataOf(el('menu', { source: 'main' }))).toEqual(['nav']);
    expect(siteDataOf(el('menu', { source: 'footer' }))).toEqual(['footer']);
    expect(siteDataOf(el('menu', { source: 'social' }))).toEqual(['social']);
    expect(siteDataOf(el('menu', { source: 'legal' }))).toEqual([]);
  });
});

describe('Bewegter Hintergrund', () => {
  it('keeps only usable videos and slideshows', () => {
    expect(cleanBgMedia({ kind: 'video', video: 'abc123', poster: '../x', phones: 'ja' })).toEqual({ kind: 'video', video: 'abc123' });
    expect(cleanBgMedia({ kind: 'video', video: 'abc', poster: 'p1', phones: true })).toEqual({ kind: 'video', video: 'abc', poster: 'p1', phones: true });
    expect(cleanBgMedia({ kind: 'video', video: '' })).toBeUndefined();
    expect(cleanBgMedia({ kind: 'slides', images: ['a', 'a', 'b/../c', 'b'], effect: 'wild', seconds: 99 })).toEqual({
      kind: 'slides',
      images: ['a', 'b'],
      effect: 'fade',
      seconds: 20,
    });
    expect(cleanBgMedia({ kind: 'slides', images: Array.from({ length: 12 }, (_, i) => `m${i}`), effect: 'kenburns', seconds: 1 })).toMatchObject({
      effect: 'kenburns',
      seconds: 3,
    });
    expect((cleanBgMedia({ kind: 'slides', images: Array.from({ length: 12 }, (_, i) => `m${i}`) }) as { images: string[] }).images).toHaveLength(8);
    expect(cleanBgMedia({ kind: 'slides', images: [] })).toBeUndefined();
    expect(cleanBgMedia({ kind: 'iframe', src: 'https://evil' })).toBeUndefined();
    expect(bgMediaIds({ kind: 'video', video: 'v', poster: 'p' })).toEqual(['v', 'p']);
  });

  it('turns a slideshow into one loop where the first picture shows at once', () => {
    const css = slidesCss('#b-x', 'bx', 3, 6, 'fade');
    // 3 × 6 s, each picture starting its turn before it is due: the first is already there.
    expect(css).toContain('animation:bgf-bx 18s linear infinite');
    expect(css).toContain('.bgm-slide:nth-child(1) img{animation-delay:-1.2s}');
    expect(css).toContain('.bgm-slide:nth-child(3) img{animation-delay:10.8s}');
    expect(css).not.toContain('bgz-');
    expect(slidesCss('#b-x', 'bx', 3, 6, 'kenburns')).toContain('@keyframes bgz-bx');
    // One picture: standing still, or a single slow zoom.
    expect(slidesCss('#b-x', 'bx', 1, 6, 'fade')).toBe('');
    expect(slidesCss('#b-x', 'bx', 1, 6, 'kenburns')).toContain('12s ease-out both');
  });
});

describe('Karte und Icon-Liste', () => {
  it('keeps a map only with a real place of its own, and an icon list with safe entries', () => {
    const [own, half, list] = sanitizeEls([
      { id: 'm1', kind: 'map', props: { place: 'Bahnhof <b>Winterthur</b>', lat: 47.5001234567, lng: 8.7234, zoom: '19', height: 5000, route: false } },
      { id: 'm2', kind: 'map', props: { place: 'Nur Text', lat: 47.5 } },
      {
        id: 'l1',
        kind: 'iconlist',
        props: {
          items: [{ icon: 'phone', text: 'Anrufen', href: 'tel:+41520000000' }, { icon: '../x', text: 'Böse', href: 'javascript:alert(1)' }, 'kaputt'],
          layout: 'quer',
          size: 500,
        },
      },
    ]);
    // Text stays text (escaped when drawn).
    expect(own.props).toEqual({ place: 'Bahnhof <b>Winterthur</b>', lat: 47.500123, lng: 8.7234, zoom: '16', height: 800, route: false });
    // One coordinate is no place: the website's location instead.
    expect(half.props).toMatchObject({ place: '', lat: null, lng: null });
    expect(list.props).toEqual({
      items: [
        { icon: 'phone', text: 'Anrufen', href: 'tel:+41520000000' },
        { icon: 'check', text: 'Böse', href: undefined },
      ],
      layout: 'column',
      size: 64,
    });
  });
});

describe('Vorher/Nachher als Element', () => {
  it('keeps two real pictures, a sensible start and a known format', () => {
    const [ok, bad] = sanitizeEls([
      { id: 'c1', kind: 'compare', props: { before: 'img-a', after: 'img-b', alt: 'Bad vorher und nachher', beforeLabel: 'Alt', afterLabel: 'Neu', start: 140, ratio: '1/1' } },
      { id: 'c2', kind: 'compare', props: { before: '../etc/passwd', after: 42, start: -5, ratio: '21/9' } },
    ]);
    expect(ok.props).toEqual({ before: 'img-a', after: 'img-b', alt: 'Bad vorher und nachher', beforeLabel: 'Alt', afterLabel: 'Neu', start: 100, ratio: '1/1' });
    expect(bad.props).toMatchObject({ before: null, after: null, start: 0, ratio: '3/2' });
    // Both pictures count as used (media library, «where is this file used»).
    expect(elementsMedia([ok])).toEqual(['img-a', 'img-b']);
  });
});

describe('Animierte Überschrift', () => {
  it('keeps up to eight words, one per line, and reads as one sentence', () => {
    const [el] = sanitizeEls([
      {
        id: 'a',
        kind: 'headline',
        props: {
          before: ' Wir   backen ',
          words: 'Brot\r\n\n Zöpfe \n1\n2\n3\n4\n5\n6\n7',
          after: 'frisch.',
          mode: 'blink',
          effect: 'spin',
          seconds: 99,
          shape: 'zigzag',
          level: '7',
        },
      },
    ]);
    expect(el.props).toEqual({
      before: 'Wir backen',
      words: 'Brot\nZöpfe\n1\n2\n3\n4\n5\n6',
      after: 'frisch.',
      mode: 'rotate',
      effect: 'slide',
      seconds: 8,
      shape: 'underline',
      accent: true,
      level: '2',
    });
    // Changing words read as a list; a highlighted phrase as it stands.
    expect(headlineText(el.props)).toBe('Wir backen Brot, Zöpfe, 1, 2, 3, 4, 5, 6 frisch.');
    expect(headlineText({ before: 'Gebaut für', words: 'echte\nMenschen', mode: 'highlight' })).toBe('Gebaut für echte Menschen');
    // Description, search and the outline see the whole sentence.
    const one = sanitizeEls([{ id: 'b', kind: 'headline', props: { before: 'Wir backen', words: 'Brot\nZöpfe', after: '', level: '1' } }]);
    expect(elementsText(one)).toContain('Wir backen Brot, Zöpfe');
    expect(elementsHeadings(one)).toEqual([{ level: 1, text: 'Wir backen Brot, Zöpfe', field: 'els.0.props.before' }]);
  });
});

describe('Sprungmarken für Elemente', () => {
  it("tidies what is typed, keeps each once and never takes the page's own ids", () => {
    expect(cleanAnchor('Kontakt & Anfahrt')).toBe('kontakt-und-anfahrt');
    expect(cleanAnchor('Über uns!')).toBe('ueber-uns');
    expect(cleanAnchor('2024 Rückblick')).toBe('rueckblick');
    expect(cleanAnchor('e-abc')).toBeUndefined();
    expect(cleanAnchor('b-hero')).toBeUndefined();
    expect(cleanAnchor('<script>')).toBe('script');
    const els = sanitizeEls([
      { id: 'a', kind: 'heading', props: { text: 'Team' }, anchor: 'Team' },
      { id: 'b', kind: 'box', props: {}, children: [{ id: 'c', kind: 'text', props: {}, anchor: 'team' }] },
    ]);
    expect(els[0].anchor).toBe('team');
    // The second one in the same layout – even deeper down – goes without.
    expect(els[1].children![0].anchor).toBeUndefined();
    expect(elDomId(els[0])).toBe('team');
    expect(elDomId(els[1])).toBe('e-b');
    // A copy can't share it.
    expect(cloneEl(els[0]).anchor).toBeUndefined();
  });
});

describe('Sprungmarken einer Seite', () => {
  it('lists blocks and elements in page order, with what they are', () => {
    const list = pageAnchors([
      { id: 'b1', type: 'text', props: { heading: 'Preise' }, style: { anchor: 'preise' } },
      { id: 'b2', type: 'text', props: {} },
      {
        id: 'b3',
        type: 'layout',
        props: {
          els: [
            { id: 'h', kind: 'heading', props: { text: 'Unser Team' }, anchor: 'team' },
            { id: 'x', kind: 'box', props: {}, name: 'Kontaktbox', anchor: 'Kontakt', children: [{ id: 'i', kind: 'image', props: {}, anchor: 'bild' }] },
          ],
        },
      },
    ]);
    expect(list).toEqual([
      { anchor: 'preise', label: 'Preise', owner: 'b1' },
      { anchor: 'team', label: 'Unser Team', owner: 'h' },
      { anchor: 'kontakt', label: 'Kontaktbox', owner: 'x' },
      { anchor: 'bild', label: 'Bild', owner: 'i' },
    ]);
  });
});

describe('Hinweispunkte', () => {
  it('keeps points on the picture, with plain texts and safe links, at most twelve', () => {
    const [el] = sanitizeEls([
      {
        id: 'h',
        kind: 'hotspots',
        props: {
          image: 'img-1',
          marker: 'stern',
          points: [
            { x: 12.345, y: 30, title: '  Röstung ', text: 'Zeile 1\nZeile 2', href: '/kontakt' },
            { x: 'links', y: 500, title: 'x', href: 'javascript:alert(1)' },
            ...Array.from({ length: 20 }, () => ({ x: 1, y: 1 })),
          ],
        },
      },
    ]);
    const points = el.props.points as { x: number; y: number; title: string; text: string; href?: string }[];
    expect(points).toHaveLength(12);
    expect(points[0]).toEqual({ x: 12.3, y: 30, title: 'Röstung', text: 'Zeile 1\nZeile 2', href: '/kontakt' });
    expect(points[1]).toMatchObject({ x: 50, y: 100, href: undefined });
    expect(el.props).toMatchObject({ image: 'img-1', marker: 'plus', pulse: true });
    // The picture counts as used; the points' texts and links are seen by search and checks.
    expect(elementsMedia([el])).toEqual(['img-1']);
    expect(elementsText([el])).toContain('Röstung');
  });
});

describe('Ebenen durchsuchen', () => {
  it('finds blocks and elements by name, text, anchor and the way there', () => {
    const blocks = [
      { id: 'b1', type: 'text', props: { heading: 'Öffnungszeiten', body: '<p>Montag zu</p>' } },
      {
        id: 'b2',
        type: 'layout',
        props: {
          els: [
            {
              id: 'box',
              kind: 'box',
              props: {},
              name: 'Kontaktbox',
              children: [{ id: 'btn', kind: 'button', props: { label: 'Offerte anfragen' }, anchor: 'offerte' }],
            },
          ],
        },
      },
    ] as Block[];
    const names = { block: (b: Block) => (b.type === 'layout' ? 'Freies Layout' : 'Text'), el: (el: El) => el.name ?? (el.kind === 'button' ? 'Knopf' : el.kind) };
    const find = (q: string) => searchLayers(blocks, q, names).map((h) => h.el ?? h.block);
    // Accents don't matter.
    expect(find('offnungszeiten')).toEqual(['b1']);
    // A free layout is found by its elements, not by their words.
    expect(find('offerte')).toEqual(['btn']);
    expect(find('kontaktbox knopf')).toEqual(['btn']);
    expect(find('kontaktbox')).toEqual(['box', 'btn']);
    expect(find('   ')).toEqual([]);
    expect(searchLayers(blocks, 'offerte', names)[0].path).toEqual(['2. Freies Layout', 'Kontaktbox']);
  });
});

describe('CSS pro Element', () => {
  it('puts every rule inside the element, also within @media', () => {
    const sel = ':is(#e-a,.e-a)';
    expect(scopeElCss('&{color:red} h2, &:hover p{margin:0}', sel)).toBe(`${sel}{color:red}${sel} h2,${sel}:hover p{margin:0}`);
    expect(scopeElCss('@media (max-width:600px){&{display:none} img{width:100%}}', sel)).toBe(`@media (max-width:600px){${sel}{display:none}${sel} img{width:100%}}`);
    expect(scopeElCss('</style><script>alert(1)</script>', sel)).not.toContain('<');
  });
});

describe('Flip-Box', () => {
  it('keeps plain texts, a safe link, a known turn and a sensible height', () => {
    const [el] = sanitizeEls([
      {
        id: 'f',
        kind: 'flipbox',
        props: { image: 'img-2', icon: '../x', title: ' Kaffee ', backText: 'Zeile 1\nZeile 2', label: 'Los', href: 'javascript:alert(1)', effect: 'spin', height: 5 },
      },
    ]);
    expect(el.props).toMatchObject({ image: 'img-2', icon: '', title: 'Kaffee', backText: 'Zeile 1\nZeile 2', label: 'Los', href: undefined, effect: 'flip', height: 160 });
    // Both sides are read by search and the page description.
    expect(elementsText([{ ...el, props: { ...el.props, backTitle: 'Aus Äthiopien' } }])).toContain('Aus Äthiopien');
    expect(elementsMedia([el])).toEqual(['img-2']);
  });
});

describe('Kundenstimme', () => {
  it('keeps plain texts, whole stars from 0 to 5 and a known look', () => {
    const [el] = sanitizeEls([{ id: 't', kind: 'testimonial', props: { quote: 'Super!\nWieder gern.', name: '<b>Anna</b>', stars: 7.6, look: 'neon', photo: 'p-1' } }]);
    expect(el.props).toEqual({ quote: 'Super!\nWieder gern.', name: '<b>Anna</b>', role: '', photo: 'p-1', stars: 5, look: 'card' });
    expect(sanitizeEls([{ id: 'u', kind: 'testimonial', props: { stars: -2 } }])[0].props.stars).toBe(0);
    expect(elementsText([el])).toContain('Wieder gern.');
    expect(elementsMedia([el])).toEqual(['p-1']);
  });
});

describe('Überlagerung als Verlauf', () => {
  it('lays the gradient over picture and colour overlay, and hands it to a moving background', () => {
    const css = designCss(
      '#b',
      {
        desktop: {
          bgImage: 'img1',
          overlay: 'rgb(0 0 0 / 0.2)',
          overlayGradient: {
            type: 'linear',
            angle: 180,
            stops: [
              { color: 'rgb(0 0 0 / 0)', at: 40 },
              { color: 'rgb(0 0 0 / 0.8)', at: 100 },
            ],
          },
        },
      },
      { image: () => '/media/img1/w1920.webp' },
    );
    const grad = 'linear-gradient(180deg,rgb(0 0 0 / 0) 40%,rgb(0 0 0 / 0.8) 100%)';
    // Top layer first: the gradient, then the colour, then the picture.
    expect(css).toContain(`background-image:${grad},linear-gradient(rgb(0 0 0 / 0.2),rgb(0 0 0 / 0.2)),url("/media/img1/w1920.webp")`);
    expect(css).toContain(`--ovg:${grad}`);
    // Fewer than two usable stops: nothing.
    expect(
      designCss('#b', {
        desktop: {
          overlayGradient: {
            type: 'linear',
            stops: [
              { color: 'red;x', at: 0 },
              { color: '#000', at: 100 },
            ],
          },
        },
      }),
    ).not.toContain('--ovg');
  });
});

describe('Spaltenaufteilung', () => {
  it('takes two to six sensible ratios, nothing else', () => {
    expect(colRatios('1 2')).toEqual([1, 2]);
    expect(colRatios(' 0.65 1.35 ')).toEqual([0.65, 1.35]);
    expect(colRatios('1')).toBeNull();
    expect(colRatios('1 1 1 1 1 1 1')).toBeNull();
    expect(colRatios('1 0')).toBeNull();
    expect(colRatios('1 2;color:red')).toBeNull();
    expect(colRatios('1fr 2fr')).toBeNull();
  });

  it('draws unequal columns, and a count on a smaller screen still wins there', () => {
    const css = designCss('#e', { desktop: { display: 'grid', columns: 2, colWidths: '1 2' }, mobile: { columns: 1 } });
    expect(css).toContain('#e{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr)');
    expect(css).not.toContain('repeat(2,');
    expect(css).toMatch(/@media[^{]*\{#e\{grid-template-columns:repeat\(1,minmax\(0,1fr\)\)/);
    // Broken ratios fall back to the column count.
    expect(designCss('#e', { desktop: { display: 'grid', columns: 3, colWidths: 'viel' } })).toContain('repeat(3,minmax(0,1fr))');
  });
});

describe('Formtrenner', () => {
  it('keeps known shapes with a sensible height and a real colour', () => {
    expect(cleanDividers({ bottom: { shape: 'wave', height: 2000, color: 'url(x)', flip: 'ja', front: true } })).toEqual({ bottom: { shape: 'wave', height: 320, front: true } });
    expect(cleanDividers({ top: { shape: 'tilt', height: 'hoch', color: '$surface', invert: true } })).toEqual({
      top: { shape: 'tilt', height: 80, color: '$surface', invert: true },
    });
    expect(cleanDividers({ top: { shape: 'stern' }, bottom: null })).toBeUndefined();
    expect(cleanDividers('wave')).toBeUndefined();
  });

  it('draws each shape as an SVG in the neighbour’s colour, mirrored or turned on request', () => {
    for (const shape of DIVIDER_SHAPES)
      expect(dividerHtml('bottom', { shape, height: 60 })).toMatch(
        /^<div class="bdiv bdiv-bottom" aria-hidden="true" style="--dh:60px"><svg viewBox="0 0 1200 120" preserveAspectRatio="none" focusable="false"><path d="M[\d.,LCVHMZ ]+"/,
      );
    const html = dividerHtml('top', { shape: 'waves', height: 120, color: '$accent/50', flip: true, invert: true, front: true });
    expect(html).toContain('class="bdiv bdiv-top front"');
    expect(html).toContain('--dc:color-mix(in srgb,var(--accent) 50%,transparent)');
    expect(html).toContain('--dt:scale(-1,-1)');
    expect(html.match(/<path /g)?.length).toBe(3);
    // «Hintergrund» means the page's, not the section's own colour (which also sets --bg).
    expect(dividerHtml('bottom', { shape: 'wave', height: 60, color: '$bg' })).toContain('--dc:var(--page-bg)');
  });
});

describe('Neue Seite beim Verlinken', () => {
  it('turns a typed link into the page it would become – only where that makes sense', () => {
    expect(pageForLink('/team')).toEqual({ title: 'Team', slug: 'team' });
    expect(pageForLink('/angebot/catering-service')).toEqual({ title: 'Catering service', slug: 'angebot/catering-service' });
    expect(pageForLink('Über uns & Team')).toEqual({ title: 'Über uns & Team', slug: 'ueber-uns-und-team' });
    expect(pageForLink('  preise ')).toEqual({ title: 'Preise', slug: 'preise' });
    expect(pageForLink('/events?jahr=2026')).toEqual({ title: 'Events', slug: 'events' });
    // Elsewhere, mail, phone, anchors, files and the home page are no new page.
    for (const s of [
      '',
      '/',
      'https://example.ch',
      'mailto:a@b.ch',
      'tel:+41520000000',
      '#kontakt',
      '?a=1',
      'www.example.ch',
      '//cdn.example.ch/x',
      'info@example.ch',
      '/media/menu.pdf',
      '!!!',
    ])
      expect(pageForLink(s)).toBeNull();
  });
});

describe('Eigene Inhaltstypen im Studio', () => {
  it('turns labels and names into keys, ids and addresses', () => {
    expect(fieldKey('Preis pro Person', [])).toBe('preis_pro_person');
    expect(fieldKey('Grösse & Gewicht', [])).toBe('groesse_und_gewicht');
    expect(fieldKey('2. Bild', [])).toBe('bild');
    expect(fieldKey('Status', [])).toBe('status_feld');
    expect(fieldKey('???', [])).toBe('feld');
    expect(fieldKey('Preis', ['preis', 'preis_2'])).toBe('preis_3');
    // Kept keys stay, new ones avoid them and the type's fixed fields.
    expect(
      keyFields(
        [
          { key: 'price', type: 'money', label: 'Preis' },
          { key: '', type: 'text', label: 'Preis' },
          { key: '', type: 'text', label: 'Titel' },
        ],
        ['title'],
      ).map((f) => f.key),
    ).toEqual(['price', 'preis', 'titel']);
    expect(typeAddress('Unsere Weine')).toEqual({ id: 'unsere_weine', list: '/unsere-weine', route: '/unsere-weine/:slug' });
    expect(typeAddress('Häufige Fragen / FAQ').id).toBe('haeufige_fragen_faq');
    expect(typeAddress('2024').id).toBe('typ');
    // Taken by another type: the next free one, id and addresses together.
    expect(
      freeAddress('Rezepte', [
        { id: 'rezepte', route: null, list_route: null },
        { id: 'x', route: null, list_route: '/rezepte-2' },
      ]),
    ).toEqual({
      id: 'rezepte_3',
      list: '/rezepte-3',
      route: '/rezepte-3/:slug',
    });
  });

  it('starts every preset with fields the server accepts and the templates understand', () => {
    for (const p of TYPE_PRESETS) {
      const body = newType({ name: p.name || 'Eigenes', singular: p.singular, icon: p.icon, fields: p.fields, pages: p.pages, blocks: p.blocks });
      expect(body.fields!.every((f) => /^[a-z][a-zA-Z0-9_]{0,40}$/.test(f.key) && f.label)).toBe(true);
      expect(new Set(body.fields!.map((f) => f.key)).size).toBe(body.fields!.length);
      expect(body.title_field).toBe('title');
      expect(body.route === null).toBe(!p.pages);
      for (const f of body.fields!) expect(STUDIO_FIELD_TYPES).toContain(f.type);
    }
    // Picture and short text under Nova's keys: the archive starter binds them.
    const rezepte = newType({ ...TYPE_PRESETS.find((p) => p.id === 'rezepte')!, pages: true }) as CollectionDef;
    const binds: string[] = [];
    walkEls(archiveStarter(rezepte), (e) => void Object.values(e.bind ?? {}).forEach((b) => binds.push(b)));
    expect(binds).toEqual(expect.arrayContaining(['field:cover', 'field:excerpt']));
    expect(walkKinds(archiveStarter(rezepte))).toContain('terms');
  });

  it('has French, Italian and English for every preset text', () => {
    const texts = new Set<string>();
    for (const p of TYPE_PRESETS) {
      for (const x of [p.name, p.singular, p.description]) if (x) texts.add(x);
      for (const f of p.fields) {
        texts.add(f.label);
        if (f.help) texts.add(f.help);
        for (const o of f.options ?? []) if (/[a-z]/i.test(o.label)) texts.add(o.label);
      }
    }
    const missing = [...texts].filter((k) => !ADMIN_DICT[k]?.fr || !ADMIN_DICT[k]?.it || !ADMIN_DICT[k]?.en);
    expect(missing).toEqual([]);
  });
});

function walkKinds(els: El[]): string[] {
  const out: string[] = [];
  walkEls(els, (e) => void out.push(e.kind));
  return out;
}

describe('Shop-Elemente', () => {
  it('keeps shop elements and product queries in their safe form', () => {
    const id = '0F8FAD5B-D9CB-469F-A165-70867728950E';
    const [price, cart, stock, rating] = sanitizeEls([
      { id: 's1', kind: 'price', props: { product: id, compare: false } },
      { id: 's2', kind: 'addtocart', props: { product: '../../etc', label: '<b>Kaufen</b>', qty: 'yes' } },
      { id: 's3', kind: 'stock', props: { plenty: false } },
      { id: 's4', kind: 'rating', props: {} },
    ]);
    expect(price.props).toEqual({ product: id.toLowerCase(), compare: false, sale: true });
    // Text stays text: escaped when it is drawn, like every other label.
    expect(cart.props).toEqual({ product: '', label: '<b>Kaufen</b>', qty: false });
    expect(stock.props).toEqual({ product: '', plenty: false });
    expect(rating.props).toEqual({ product: '', count: true });
    expect(loopQuery({ shop: 'bestseller' }).shop).toBe('bestseller');
    expect(loopQuery({ shop: 'cheapest' }).shop).toBe('all');
    // The ready-made product grid: a loop of products on sale, its card with the shop elements.
    const preset = LAYOUT_PRESETS.find((p) => p.id === 'shop')!;
    expect(preset.module).toBe('shop');
    const els = preset.els();
    expect(sanitizeEls(els)).toEqual(els);
    expect(els[1].props).toMatchObject({ collection: 'products', shop: 'sale' });
    expect(walkKinds(els)).toEqual(expect.arrayContaining(['image', 'rating', 'price', 'addtocart']));
  });
});

describe('Nur zeigen, wenn …', () => {
  const env = (o: Partial<CondEnv> = {}): CondEnv => ({ member: null, now: '2026-10-11T12:00', day: 7, open: true, lang: 'de', cart: 0, query: new URLSearchParams(), ...o });
  it('keeps only known conditions with valid values, at most four', () => {
    expect(
      cleanConds([
        { if: 'member', is: 'admin' },
        { if: 'time', from: '2026-12-24T18:00', until: 'morgen' },
        { if: 'days', days: [7, 6, 6, 9, 1.5] },
        { if: 'param', key: 'aktion', is: '<b>herbst</b>' },
        { if: 'field', key: '../x', is: '' },
        { if: 'script', is: 'x' },
        { if: 'cart', is: 'full' },
        { if: 'lang', is: 'fr' },
      ]),
    ).toEqual([
      { if: 'time', from: '2026-12-24T18:00' },
      { if: 'days', days: [6, 7] },
      { if: 'param', key: 'aktion', is: 'bherbst/b' },
      { if: 'cart', is: 'full' },
    ]);
    expect(cleanConds('x')).toEqual([]);
    expect(cleanConds([{ if: 'time' }])).toEqual([]);
  });

  it('checks every condition against the visitor, the clock, the address and the entry', () => {
    expect(condsHold([], env())).toBe(true);
    expect(condsHold([{ if: 'member', is: 'in' }], env())).toBe(false);
    expect(condsHold([{ if: 'member', is: 'in' }], env({ member: 'member' }))).toBe(true);
    expect(condsHold([{ if: 'member', is: 'paid' }], env({ member: 'member' }))).toBe(false);
    expect(condsHold([{ if: 'member', is: 'out' }], env({ member: 'paid' }))).toBe(false);
    // From inclusive, until exclusive, as wall time.
    expect(condsHold([{ if: 'time', from: '2026-10-11T12:00' }], env())).toBe(true);
    expect(condsHold([{ if: 'time', until: '2026-10-11T12:00' }], env())).toBe(false);
    expect(condsHold([{ if: 'days', days: [6, 7] }], env())).toBe(true);
    expect(condsHold([{ if: 'days', days: [1] }], env())).toBe(false);
    // Without opening hours nothing is open, and nothing closed.
    expect(condsHold([{ if: 'open', is: 'closed' }], env({ open: null }))).toBe(false);
    expect(condsHold([{ if: 'cart', is: 'empty' }], env())).toBe(true);
    expect(condsHold([{ if: 'cart', is: 'full' }], env({ cart: 2 }))).toBe(true);
    expect(condsHold([{ if: 'param', key: 'aktion', is: '' }], env({ query: new URLSearchParams('aktion=Herbst') }))).toBe(true);
    expect(condsHold([{ if: 'param', key: 'aktion', is: 'herbst' }], env({ query: new URLSearchParams('aktion=Herbst') }))).toBe(true);
    expect(condsHold([{ if: 'param', key: 'aktion', is: 'winter' }], env({ query: new URLSearchParams('aktion=Herbst') }))).toBe(false);
    const data: Record<string, unknown> = { cover: '', tags: ['Vegan', 'Bio'], featured: true };
    const field = (k: string) => data[k];
    expect(condsHold([{ if: 'field', key: 'cover', is: '' }], env({ field }))).toBe(false);
    expect(condsHold([{ if: 'field', key: 'tags', is: 'vegan' }], env({ field }))).toBe(true);
    expect(condsHold([{ if: 'field', key: 'featured', is: '' }], env({ field }))).toBe(true);
    // Outside of an entry a field condition never holds.
    expect(condsHold([{ if: 'field', key: 'featured', is: '' }], env())).toBe(false);
    // All must hold.
    expect(
      condsHold(
        [
          { if: 'cart', is: 'empty' },
          { if: 'lang', is: 'fr' },
        ],
        env(),
      ),
    ).toBe(false);
    // Stored on the element only in this form.
    const [el] = sanitizeEls([{ id: 'c1', kind: 'heading', props: { text: 'x' }, show: [{ if: 'lang', is: 'fr' }, { if: 'nope' }] }]);
    expect(el.show).toEqual([{ if: 'lang', is: 'fr' }]);
    expect(sanitizeEls([{ id: 'c2', kind: 'heading', props: {}, show: [] }])[0].show).toBeUndefined();
    // Conditional texts – with everything inside them – stay out of the description and the search.
    expect(
      elementsText([
        { id: 'a', kind: 'heading', props: { text: 'Für alle' } },
        { id: 'b', kind: 'box', props: {}, show: [{ if: 'member', is: 'in' }], children: [{ id: 'c', kind: 'text', props: { html: '<p>Nur Mitglieder</p>' } }] },
      ]),
    ).toBe('Für alle');
  });
});

describe('Countdown, Inhaltsverzeichnis, Teilen, Lesefortschritt', () => {
  it('keeps their settings in a safe form', () => {
    const [cd, toc, share, bar] = sanitizeEls([
      { id: 'n1', kind: 'countdown', props: { to: '2026-12-24T18:00:00Z', units: 'weeks', done: '<b>Los!</b>' }, bind: { to: 'field:start' } },
      { id: 'n2', kind: 'toc', props: { levels: '4', numbered: 'ja' } },
      { id: 'n3', kind: 'share', props: { networks: ['mail', 'tiktok', 'copy'] } },
      { id: 'n4', kind: 'progress', props: { place: 'left', size: 99 } },
    ]);
    expect(cd.props).toEqual({ to: '2026-12-24T18:00', units: 'dhms', done: '<b>Los!</b>' });
    expect(cd.bind).toEqual({ to: 'field:start' });
    expect(toc.props).toEqual({ title: '', levels: '2', numbered: false });
    // Only known ways, in their own order.
    expect(share.props.networks).toEqual(['copy', 'mail']);
    expect(sanitizeEls([{ id: 'n5', kind: 'share', props: { networks: ['tiktok'] } }])[0].props.networks).toEqual(['copy', 'mail']);
    expect(bar.props).toEqual({ place: 'top', size: 12 });
    const [gal] = sanitizeEls([{ id: 'g1', kind: 'gallery', props: { images: ['abc', '../x', 3], layout: 'wall', size: 'xl' }, bind: { images: 'field:images' } }]);
    expect(gal.props).toEqual({ images: ['abc'], layout: 'grid', size: 'm', lightbox: true });
    expect(gal.bind).toEqual({ images: 'field:images' });
    expect(elementsMedia([gal])).toEqual(['abc']);
    expect(bindKind('to')).toBe('date');
  });
});

describe('Filter für Schleife', () => {
  it('writes parameters of its own loop – the plain ones of an overview in an archive', () => {
    expect(filterParams('ab12', false)).toEqual({ q: 'suche-ab12', cat: 'kategorie-ab12', tag: 'schlagwort-ab12', sort: 'sortierung-ab12', page: 'seite-ab12' });
    expect(filterParams('ab12', true)).toEqual({ q: 'suche', cat: 'kategorie', tag: 'schlagwort', sort: 'sortierung', page: 'seite' });
    expect(FILTER_SORTS['preis-auf']).toMatchObject({ sort: 'field-asc', field: 'price' });
    const [f] = sanitizeEls([{ id: 'f1', kind: 'filter', props: { target: '"><x', search: false, category: 'tiles', tag: 1, placeholder: 'Suche' } }]);
    expect(f.props).toEqual({ target: '', search: false, placeholder: 'Suche', category: 'chips', tag: false, sort: false });
  });
});

describe('Farben dieser Seite', () => {
  it('lists every colour of blocks, elements and variants, and replaces one everywhere', () => {
    const blocks = [
      { id: 'b1', type: 'text', props: {}, style: { design: { desktop: { bg: '#C33', color: '$ink' }, hover: { bg: '#cc3333' } } } },
      {
        id: 'b2',
        type: 'layout',
        props: {
          els: [
            {
              id: 'e1',
              kind: 'box',
              props: {},
              design: { mobile: { borderColor: '#cc3333', shadow: { x: 0, y: 2, blur: 4, spread: 0, color: '#cc3333' } } },
              children: [
                {
                  id: 'e2',
                  kind: 'heading',
                  props: {},
                  design: {
                    desktop: {
                      textGradient: {
                        type: 'linear',
                        stops: [
                          { color: '#cc3333', at: 0 },
                          { color: '$accent', at: 100 },
                        ],
                      },
                    },
                  },
                },
              ],
            },
          ],
          variants: [{ id: 'v1', name: 'Dunkel', designs: { e1: { desktop: { bg: '#cc3333' } } } }],
        },
      },
      { id: 'b3', type: 'text', props: {}, lock: 'layout', style: { design: { desktop: { color: '#cc3333' } } } },
    ] as unknown as Block[];
    // Written two ways, counted as one.
    expect(pageColors(blocks)).toEqual([
      { value: '#C33', count: 7 },
      { value: '$accent', count: 1 },
      { value: '$ink', count: 1 },
    ]);
    const next = replaceColor(blocks, '#cc3333', '$accent', (b) => (b.lock ?? 'none') !== 'none');
    expect(pageColors(next)).toEqual([
      { value: '$accent', count: 7 },
      { value: '#cc3333', count: 1 },
      { value: '$ink', count: 1 },
    ]);
    // Untouched blocks stay the same objects; the locked one keeps its colour.
    expect(next[2]).toBe(blocks[2]);
    expect(colorKey(' #ABC ')).toBe('#aabbcc');
  });
});

describe('Baukasten', () => {
  it('lets only the side bar drag, carrying what to insert as its own type', () => {
    expect(dragSource(false, NEW_EL, { kind: 'button' })).toEqual({});
    expect(dragSource(undefined, NEW_BLOCK, { type: 'quote' })).toEqual({});
    const src = dragSource(true, NEW_EL, { kind: 'button' }) as { draggable: boolean; onDragStart: (e: unknown) => void };
    expect(src.draggable).toBe(true);
    const data: Record<string, string> = {};
    const transfer = { setData: (type: string, value: string) => (data[type] = value), effectAllowed: 'all' };
    src.onDragStart({ dataTransfer: transfer });
    expect(JSON.parse(data[NEW_EL])).toEqual({ kind: 'button' });
    expect(data[NEW_BLOCK]).toBeUndefined();
    // Copied onto the page: the side bar keeps it.
    expect(transfer.effectAllowed).toBe('copy');
    // The canvas looks for the same types (bridge.ts can't import from the admin).
    const bridge = readFileSync('src/site/runtime/bridge.ts', 'utf8');
    expect(bridge).toContain(`'${NEW_EL}'`);
    expect(bridge).toContain(`'${NEW_BLOCK}'`);
  });
});

describe('Zuletzt verwendet', () => {
  it('keeps the newest first, each once, and only a few', () => {
    expect(withRecent([], 'button')).toEqual(['button']);
    expect(withRecent(['text', 'button', 'image'], 'button')).toEqual(['button', 'text', 'image']);
    let list: ElKind[] = [];
    for (const k of ['box', 'heading', 'text', 'image', 'gallery', 'button', 'icon', 'video'] as ElKind[]) list = withRecent(list, k);
    expect(list).toHaveLength(RECENT_MAX);
    expect(list[0]).toBe('video');
    expect(list).not.toContain('box');
  });
});

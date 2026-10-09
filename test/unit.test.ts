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
  const hours = [1, 2, 3, 4, 5].map((day) => ({ day, closed: false, slots: [{ from: '09:00', to: '18:00' }] })).concat([
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
    for (const [typed, want] of [['9', '09:00'], ['930', '09:30'], ['0930', '09:30'], ['9.30', '09:30'], ['9h30', '09:30'], ['18:15', '18:15'], ['1815', '18:15'], ['18 Uhr', '18:00'], ['24', '00:00']] as const)
      expect(parseTime(typed), typed).toBe(want);
    for (const bad of ['', 'abc', '25', '9:75', '24:30', '9:5', '12345']) expect(parseTime(bad), bad).toBeNull();
  });
});

describe('dates', () => {
  const today = new Date(2026, 9, 9); // Fr, 9. Oktober 2026
  it('reads typed dates the Swiss way', () => {
    for (const [typed, want] of [['9.10.2026', '2026-10-09'], ['09.10.26', '2026-10-09'], ['9.10.', '2026-10-09'], ['9.10', '2026-10-09'], ['9/10/2026', '2026-10-09'], ['2026-10-09', '2026-10-09'], ['heute', '2026-10-09'], ['morgen', '2026-10-10'], ['29.2.2028', '2028-02-29']] as const)
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
  const service: BookingService = { id: 's', name: 'Tisch', description: '', duration_min: 120, buffer_min: 0, price: null, deposit: 0, resource_ids: [], active: true, sort_index: 0 };
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
    const errs = validateFields([{ key: 'title', type: 'text', label: 'Titel', required: true }, { key: 'price', type: 'money', label: 'Preis', min: 0 }], { title: '', price: -5 });
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
    const r = analyzeSeo({ title: 'Start', slug: 'start', isHome: false, ownH1: false, seo: { keyword: 'Restaurant Uster' }, blocks: [hero], siteName: 'Linde', titleTemplate: '%s · %site', alts: {} });
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

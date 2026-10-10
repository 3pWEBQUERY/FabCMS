import { randomBytes } from 'node:crypto';
import { sql, json } from './db';
import { DEFAULT_ROLE_MODES } from '../shared/roles';
import type { SiteSettings } from '../shared/types';
import { defaultLang, type Lang } from '../shared/i18n';

export function defaultSettings(): SiteSettings {
  const weekday = (day: number) => ({ day, closed: false, slots: [{ from: '09:00', to: '18:00' }] });
  return {
    name: 'Neue Website',
    tagline: '',
    sectors: [],
    modules: [],
    locale: 'de-CH',
    languages: [],
    translations: {},
    timezone: 'Europe/Zurich',
    baseUrl: '',
    logo: null,
    favicon: null,
    business: {
      type: 'LocalBusiness',
      legalName: '',
      street: '',
      zip: '',
      city: '',
      country: 'CH',
      phone: '',
      email: '',
      uid: '',
      priceRange: '',
      servesCuisine: '',
    },
    hours: [1, 2, 3, 4, 5].map(weekday).concat([
      { day: 6, closed: false, slots: [{ from: '09:00', to: '16:00' }] },
      { day: 7, closed: true, slots: [] },
    ]),
    hoursNote: '',
    social: [],
    theme: { id: 'kante', palette: 'default', fontPair: 'default', spacing: 1, radius: 2, tokens: {}, css: '' },
    header: { cta: null, sticky: true },
    footer: { text: '', columns: [] },
    nav: [],
    seo: {
      titleTemplate: '%s · %site',
      defaultDescription: '',
      defaultImage: null,
      noindex: false,
      indexNow: true,
      indexNowKey: randomBytes(16).toString('hex'),
      adult: false,
    },
    analytics: {
      enabled: true,
      goals: [
        { id: 'form', label: 'Formular gesendet', event: 'form' },
        { id: 'order', label: 'Bestellung bezahlt', event: 'order' },
      ],
      plausible: { domain: '', host: '' },
      matomo: { url: '', siteId: '', cookies: false },
      ga4: { id: '' },
    },
    consent: { youtube: true, vimeo: true, maps: true },
    ageGate: { enabled: false, minAge: 18, text: 'Diese Website enthält Inhalte für Erwachsene.', method: 'self' },
    ai: { enabled: false },
    shop: {
      currency: 'CHF',
      vatIncluded: true,
      vatRates: { standard: 8.1, reduced: 2.6, none: 0 },
      shipping: { flat: 900, freeFrom: 10000, pickup: true, countries: ['CH', 'LI'] },
      invoiceEnabled: true,
      invoiceNote: '',
      iban: '',
      terms: '',
      orderPrefix: 'B-',
      notifyEmail: '',
    },
    booking: {
      mode: 'table',
      slotStep: 30,
      leadMinutes: 120,
      horizonDays: 60,
      maxParty: 8,
      autoConfirm: true,
      reminderHours: 24,
      cancelHours: 4,
      notifyEmail: '',
      feedToken: '',
    },
    ordering: { pickup: true, delivery: false, deliveryZips: [], deliveryFee: 500, deliveryMin: 3000, prepMinutes: 30, slotMinutes: 15, payOnSite: true, paused: false, note: '' },
    donations: { recipient: '', iban: '', taxDeductible: false, receiptNote: '' },
    members: { registration: 'open', planName: 'Mitgliedschaft', price: 0, interval: 'month', perks: '' },
    mail: { logo: true, color: '', signature: '', footer: '', texts: {} },
    newsletter: { auto: 'off', weekday: 1 },
    blog: { comments: true, perPage: 10 },
    menu: { showAllergens: true, dailyTitle: 'Heute' },
    roleModes: DEFAULT_ROLE_MODES,
    webhooks: [],
    hooks: [],
    extensionCss: [],
    security: { allowCustomScripts: false, require2fa: [] },
    firstPublishedAt: null,
    setupDone: false,
    legal: { generatedAt: null },
  };
}

let cache: SiteSettings | null = null;
let generation = 0;

/** Bumped whenever anything public changes; the page cache keys on it. */
export const contentGeneration = () => generation;
const bumpListeners = new Set<() => void>();
export const bumpGeneration = () => {
  generation++;
  for (const fn of bumpListeners) fn();
};
/** Called after every public change (search index sync). */
export const onContentChange = (fn: () => void) => {
  bumpListeners.add(fn);
  return () => bumpListeners.delete(fn);
};

function deepMerge<T>(base: T, patch: unknown): T {
  if (patch === undefined) return base;
  if (Array.isArray(base) || Array.isArray(patch) || typeof base !== 'object' || base === null || typeof patch !== 'object' || patch === null)
    return patch as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) out[k] = deepMerge(out[k], v);
  return out as T;
}

let main: Lang = 'de';
/** Main language of the site, synchronously (known after the first getSettings). */
export const mainLang = () => main;

export async function getSettings(): Promise<SiteSettings> {
  if (cache) return cache;
  const [row] = await sql`select value from settings where key = 'site'`;
  // Merge onto defaults so new settings keys appear after an update.
  cache = deepMerge(defaultSettings(), row?.value ?? {});
  main = defaultLang(cache);
  if (!row) await sql`insert into settings (key, value) values ('site', ${json(cache)}) on conflict do nothing`;
  return cache;
}

export async function updateSettings(patch: Partial<SiteSettings> | Record<string, unknown>): Promise<SiteSettings> {
  const next = deepMerge(await getSettings(), patch);
  await sql`
    insert into settings (key, value) values ('site', ${json(next)})
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
  cache = next;
  main = defaultLang(next);
  bumpGeneration();
  return next;
}

export function invalidateSettings() {
  cache = null;
}

/** Secret used for signing cookies. Persisted so restarts keep carts valid. */
let secret: string | null = null;
export async function appSecret(): Promise<string> {
  if (secret) return secret;
  if (process.env.APP_SECRET) return (secret = process.env.APP_SECRET);
  const [row] = await sql`select value from settings where key = 'secret'`;
  if (row) return (secret = row.value as string);
  const fresh = randomBytes(32).toString('hex');
  await sql`insert into settings (key, value) values ('secret', ${json(fresh)}) on conflict do nothing`;
  const [again] = await sql`select value from settings where key = 'secret'`;
  return (secret = again.value as string);
}

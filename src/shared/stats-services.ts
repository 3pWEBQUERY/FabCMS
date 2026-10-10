import type { SiteSettings } from './types';

/**
 * Statistics services besides Nova's own cookieless count. Plausible and
 * Matomo without cookies need no consent; Google Analytics and Matomo with
 * cookies only run after a visitor agreed.
 */

export interface StatsConfig {
  plausible?: { domain: string; src: string };
  matomo?: { url: string; siteId: string; cookies: boolean };
  ga4?: { id: string };
  /** Services that wait for consent, by name. */
  consent: string[];
  /** Changes when those services change – stored consent then no longer counts. */
  key: string;
}

export const GA4_ID = /^G-[A-Z0-9]{4,14}$/;
const origin = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
};

export function statsConfig(s: Pick<SiteSettings, 'analytics'>): StatsConfig | null {
  const a = s.analytics;
  const cfg: StatsConfig = { consent: [], key: '' };
  if (a.plausible?.domain) cfg.plausible = { domain: a.plausible.domain, src: `${(a.plausible.host || 'https://plausible.io').replace(/\/$/, '')}/js/script.js` };
  if (a.matomo?.url && a.matomo.siteId) cfg.matomo = { url: `${a.matomo.url.replace(/\/$/, '')}/`, siteId: a.matomo.siteId, cookies: Boolean(a.matomo.cookies) };
  if (a.ga4?.id && GA4_ID.test(a.ga4.id)) cfg.ga4 = { id: a.ga4.id };
  if (!cfg.plausible && !cfg.matomo && !cfg.ga4) return null;
  if (cfg.ga4) cfg.consent.push('Google Analytics');
  if (cfg.matomo?.cookies) cfg.consent.push('Matomo');
  cfg.key = [cfg.ga4 && `ga4:${cfg.ga4.id}`, cfg.matomo?.cookies && `matomo:${cfg.matomo.url}${cfg.matomo.siteId}`].filter(Boolean).join('|');
  return cfg;
}

/** Hosts the Content-Security-Policy has to allow for these services. */
export function statsCsp(cfg: StatsConfig | null): { script: string[]; connect: string[] } {
  const script: string[] = [];
  const connect: string[] = [];
  if (cfg?.plausible) {
    script.push(origin(cfg.plausible.src));
    connect.push(origin(cfg.plausible.src));
  }
  if (cfg?.matomo) {
    script.push(origin(cfg.matomo.url));
    connect.push(origin(cfg.matomo.url));
  }
  if (cfg?.ga4) {
    script.push('https://www.googletagmanager.com');
    connect.push('https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com');
  }
  return { script: [...new Set(script.filter(Boolean))], connect: [...new Set(connect.filter(Boolean))] };
}

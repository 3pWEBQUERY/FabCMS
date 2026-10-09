import { langInfo, type Lang } from '../shared/i18n';
import { pageLang } from '../server/translations';
import { DICT } from './dict';

/**
 * Visitor-facing texts of the website. The German text is the key, so the
 * templates stay readable; FR/IT/EN come from dict/. Missing entries fall
 * back to German, and a unit test lists them. A German word with two
 * meanings gets a context after a bar: t(ctx, 'Anmelden|Kurs').
 */
export function tr(lang: Lang, de: string, params?: Record<string, string | number>): string {
  // 'Anmelden|Kurs': same German word, other meaning – the part after | only tells the translations apart.
  const bar = de.indexOf('|');
  const source = bar < 0 ? de : de.slice(0, bar);
  const text = lang === 'de' ? source : (DICT[de]?.[lang] ?? source);
  return params ? text.replace(/\{(\w+)\}/g, (m, k: string) => (params[k] !== undefined ? String(params[k]) : m)) : text;
}

/** In templates with a render context. */
export function t(ctx: { lang: Lang }, de: string, params?: Record<string, string | number>): string {
  return tr(ctx.lang, de, params);
}

/** In route handlers without a render context: the language of the current request. */
export function T(de: string, params?: Record<string, string | number>): string {
  return tr(pageLang(), de, params);
}

/** Locale for Intl (dates, numbers) of the current request or context. */
export const L = (ctx?: { lang: Lang }) => langInfo(ctx?.lang ?? pageLang()).locale;

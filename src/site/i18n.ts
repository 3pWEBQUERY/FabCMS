import type { Lang } from '../shared/i18n';
import { DICT } from './dict';

/**
 * Visitor-facing texts of the website. The German text is the key, so the
 * templates stay readable; FR/IT/EN come from dict.ts. Missing entries fall
 * back to German (and a test lists them).
 */
export function tr(lang: Lang, de: string, params?: Record<string, string | number>): string {
  const text = lang === 'de' ? de : (DICT[de]?.[lang] ?? de);
  return params ? text.replace(/\{(\w+)\}/g, (m, k: string) => (params[k] !== undefined ? String(params[k]) : m)) : text;
}

export function t(ctx: { lang: Lang }, de: string, params?: Record<string, string | number>): string {
  return tr(ctx.lang, de, params);
}

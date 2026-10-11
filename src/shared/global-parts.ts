import { pathList, pathMatches } from './popups';

/**
 * Own headers and footers, like JetEngine's theme parts: several of each,
 * every one with the pages it is for. On a page the most specific one wins –
 * «only on …» before «everywhere except …» before «on the whole website»,
 * and among equals the one changed last.
 */

export const SHOW_ON = ['all', 'only', 'except'] as const;
export type ShowOn = (typeof SHOW_ON)[number];

export const HEADER_MODES = ['inherit', 'static', 'sticky', 'over', 'over-sticky'] as const;
export type HeaderMode = (typeof HEADER_MODES)[number];

export interface PartRule {
  show_on?: unknown;
  show_paths?: unknown;
}

const showOn = (v: unknown): ShowOn => ((SHOW_ON as readonly string[]).includes(String(v)) ? (v as ShowOn) : 'all');

/** Whether a header or footer belongs on this page. */
export function partApplies(rule: PartRule, path: string): boolean {
  const on = showOn(rule.show_on);
  const paths = pathList(rule.show_paths);
  // Without addresses the rule says nothing: the whole website.
  if (on === 'all' || !paths.length) return true;
  const hit = paths.some((p) => pathMatches(p, path));
  return on === 'only' ? hit : !hit;
}

const rank: Record<ShowOn, number> = { only: 0, except: 1, all: 2 };

/** The one for this page from those of a kind, newest first. */
export function pickPart<T extends PartRule>(parts: T[], path: string): T | null {
  const fitting = parts.filter((p) => partApplies(p, path));
  return fitting.sort((a, b) => rank[partRuleText(a).kind] - rank[partRuleText(b).kind])[0] ?? null;
}

/** The header's classes: how it sits on the page. «inherit» follows the website setting. */
export function headerModeClasses(mode: unknown, siteSticky: boolean): string[] {
  const m = (HEADER_MODES as readonly string[]).includes(String(mode)) ? (mode as HeaderMode) : 'inherit';
  if (m === 'inherit') return siteSticky ? ['sticky'] : [];
  if (m === 'static') return [];
  if (m === 'sticky') return ['sticky'];
  return m === 'over' ? ['over'] : ['over', 'over-sticky'];
}

/** The rule in words, for the overview. */
export function partRuleText(rule: PartRule): { kind: ShowOn; paths: string[] } {
  const on = showOn(rule.show_on);
  const paths = pathList(rule.show_paths);
  return { kind: on !== 'all' && !paths.length ? 'all' : on, paths };
}

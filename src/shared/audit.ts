/**
 * «Prüfung», as Webflow's audit panel: what keeps people from using a page –
 * pictures without a description, links that lead nowhere, a muddled outline,
 * fields without a label. Found on the page as drawn (site/runtime/bridge.ts),
 * explained and fixed in the editor.
 */

export const AUDIT_KINDS = [
  'img-alt',
  'link-empty',
  'link-dead',
  'button-empty',
  'h1-none',
  'h1-many',
  'heading-skip',
  'heading-empty',
  'field-label',
  'iframe-title',
  'id-double',
  'text-small',
  'target-small',
] as const;
export type AuditKind = (typeof AUDIT_KINDS)[number];

/** Errors keep people out; warnings make it harder. */
export const AUDIT_ERRORS: ReadonlySet<AuditKind> = new Set(['img-alt', 'link-empty', 'button-empty', 'h1-many', 'field-label', 'id-double']);

export interface AuditIssue {
  kind: AuditKind;
  /** The block it is in (none: the page as a whole). */
  block?: string;
  /** The element of a free layout, nearest first. */
  el?: string;
  /** What it says or which one it is – shown in the list. */
  text: string;
}

/** Errors first, then in page order. */
export const auditOrder = (a: AuditIssue[]) => [...a].sort((x, y) => Number(AUDIT_ERRORS.has(y.kind)) - Number(AUDIT_ERRORS.has(x.kind)));

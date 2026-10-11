import { cssColor, cssLength } from './design';
import { slugify } from './text';

/**
 * Design variables, as in Webflow: colours and sizes of one's own («Marke
 * Grün», «Karten-Abstand»), chosen anywhere in the design panel as `$v-…`
 * and changed in one place for the whole website. On the page they are CSS
 * variables (--v-…) on :root.
 */
export interface DesignVariable {
  id: string;
  name: string;
  kind: 'color' | 'size';
  value: string;
}

export const MAX_VARIABLES = 60;
export const VAR_ID = /^[a-z][a-z0-9-]{0,30}$/;

/** An id from a name: «Marke Grün» → marke-gruen. */
export const variableId = (name: string) =>
  slugify(name)
    .replace(/\//g, '-')
    .replace(/^[^a-z]+/, '')
    .slice(0, 31)
    .replace(/-+$/, '') || 'farbe';

/** What a variable compiles to – only real colours and lengths (theme colours too, not other variables). */
export function variableValue(v: Pick<DesignVariable, 'kind' | 'value'>): string | null {
  if (typeof v.value !== 'string' || v.value.trim().startsWith('$v-')) return null;
  return v.kind === 'color' ? cssColor(v.value) : cssLength(v.value);
}

/** Variables as sent by the settings: unique ids and names, a known kind, a value that compiles. */
export function cleanVariables(input: unknown): DesignVariable[] {
  if (!Array.isArray(input)) return [];
  const out: DesignVariable[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
    const kind = r.kind === 'size' ? 'size' : r.kind === 'color' ? 'color' : null;
    const id = typeof r.id === 'string' && VAR_ID.test(r.id) ? r.id : null;
    const value = typeof r.value === 'string' ? r.value.trim().slice(0, 80) : '';
    if (!name || !kind || !id || out.some((x) => x.id === id || x.name.toLowerCase() === name.toLowerCase())) continue;
    if (!variableValue({ kind, value })) continue;
    out.push({ id, name, kind, value });
    if (out.length >= MAX_VARIABLES) break;
  }
  return out;
}

/** The declarations for :root. */
export const variablesCss = (vars: DesignVariable[] | undefined): string =>
  (vars ?? [])
    .map((v) => {
      const value = VAR_ID.test(v.id) ? variableValue(v) : null;
      return value ? `--v-${v.id}:${value}` : '';
    })
    .filter(Boolean)
    .join(';');

/**
 * The «Diagramm» element's data: categories, up to four series of numbers,
 * and the scale they are drawn on.
 */

export const CHART_TYPES = ['bar', 'hbar', 'line', 'donut'] as const;
export type ChartType = (typeof CHART_TYPES)[number];
export const MAX_CHART_POINTS = 24;
/** Four series stay apart for everyone, also with colour blindness; more would need another kind of chart. */
export const MAX_CHART_SERIES = 4;
/** A ring has at most eight slices – the palette's eight hues; the rest goes to «Andere». */
export const MAX_DONUT_SLICES = 8;

export interface ChartSeries {
  name: string;
  values: number[];
}

/**
 * A number as people type or paste it: «1’250.50», «1 250,5», «12 %», «CHF 45.–».
 * The last of «.» and «,» is the decimal mark, unless it groups thousands.
 */
export function parseNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  // A currency or word before (with a space: «CHF 45», not «Q1»), a unit after («12 %», «5kg»), «.–» for round francs.
  const m = /^(?:[A-Za-z]{1,4}\.?\s+|[$€£¥]\s*)?([-−–]?\(?\d[\d\s'’`\u00a0\u202f.,]*\)?)\s*(?:%|‰|[A-Za-zÄÖÜäöü]{1,6}\.?)?$/.exec(v.trim().replace(/\.[–-]$/, ''));
  if (!m) return null;
  let s = m[1].replace(/[\s'’`\u00a0\u202f]/g, '');
  const neg = /^[-−–]/.test(s) || /^\(.*\)$/.test(s);
  s = s.replace(/[^\d.,]/g, '');
  const dot = s.lastIndexOf('.');
  const comma = s.lastIndexOf(',');
  if (dot >= 0 && comma >= 0) s = dot > comma ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  else if (comma >= 0) s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(/,/g, '.');
  else if (/^\d{1,3}(\.\d{3}){2,}$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** Rounded to what a chart can show, and within bounds. */
export const chartValue = (v: unknown): number => {
  const n = parseNum(v) ?? 0;
  return Math.round(Math.min(1e12, Math.max(-1e12, n)) * 10000) / 10000;
};

/** A scale with round steps (1, 2, 2.5 or 5 × 10ⁿ) that holds zero and every value. */
export function niceScale(values: number[], count = 5): { min: number; max: number; ticks: number[] } {
  let lo = Math.min(0, ...values);
  let hi = Math.max(0, ...values);
  if (lo === hi) hi = lo + 1;
  const raw = (hi - lo) / Math.max(1, count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) ?? 10 * mag;
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let i = 0; lo + i * step <= hi + step / 2; i++) ticks.push(Number((lo + i * step).toPrecision(12)) || 0);
  return { min: lo, max: hi, ticks };
}

/** A ring's slices in the order given: up to eight, else the first seven and the rest together as «Andere». Negative values count as nothing. */
export function donutSlices(labels: string[], values: number[], other: string): { label: string; value: number; slot: number }[] {
  const all = labels.map((label, i) => ({ label, value: Math.max(0, values[i] ?? 0) })).filter((x) => x.value > 0);
  if (all.length <= MAX_DONUT_SLICES) return all.map((x, i) => ({ ...x, slot: i + 1 }));
  const keep = all.slice(0, MAX_DONUT_SLICES - 1);
  const rest = all.slice(MAX_DONUT_SLICES - 1).reduce((s, x) => s + x.value, 0);
  return [...keep, { label: other, value: rest }].map((x, i) => ({ ...x, slot: i + 1 }));
}

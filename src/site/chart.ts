import { html, raw, type Html } from './html';
import type { RenderContext } from './context';
import { donutSlices, niceScale, type ChartSeries, type ChartType } from '../shared/chart';
import { t, L } from './i18n';

type P = Record<string, unknown>;

/**
 * The «Diagramm» element. Bars, axes and labels are HTML placed in percent,
 * so text stays sharp at every width; only the line and the ring are SVG.
 * The picture is hidden from screen readers – they get the same numbers as
 * a table, which can also be opened for everyone.
 */
export function renderChart(p: P, ctx: RenderContext, o: { cls: string; attrs: Html; caption: Html | string; edit: boolean }): Html {
  const type = (['bar', 'hbar', 'line', 'donut'].includes(String(p.type)) ? p.type : 'bar') as ChartType;
  const labels = (Array.isArray(p.labels) ? p.labels : []).map(String);
  const series = ((Array.isArray(p.series) ? p.series : []) as ChartSeries[]).filter((s) => s && Array.isArray(s.values));
  if (!labels.length || !series.length) return html`<figure class="${o.cls}" ${o.attrs}></figure>`;
  const nf = new Intl.NumberFormat(L(ctx), { maximumFractionDigits: 2 });
  const prefix = typeof p.prefix === 'string' && p.prefix ? `${p.prefix}\u00a0` : '';
  // Kept on one line with the number: a narrow space before «%», a fixed one before words.
  const unit = typeof p.unit === 'string' && p.unit ? `${/^[%‰]$/.test(p.unit) ? '\u202f' : '\u00a0'}${p.unit}` : '';
  const fmt = (v: number) => `${prefix}${nf.format(v)}${unit}`;
  const one = series.length === 1;
  // One series wears the website's accent; several the chart palette in fixed order.
  const color = (i: number) => (one && type !== 'donut' ? 'var(--accent)' : `var(--chart-${i + 1})`);
  const name = (s: ChartSeries, i: number) => s.name || t(ctx, 'Reihe {n}', { n: i + 1 });
  const height = Math.min(640, Math.max(160, Number(p.height) || 300));
  const showValues = p.values !== false && one && labels.length <= 16;

  const caption = p.caption || o.edit ? html`<figcaption class="chart-cap" ${o.caption}>${String(p.caption ?? '')}</figcaption>` : '';
  const legend =
    !one && type !== 'donut'
      ? html`<ul class="chart-legend" aria-hidden="true">
          ${series.map((s, i) => html`<li><i style="--c:${color(i)}"></i>${name(s, i)}</li>`)}
        </ul>`
      : '';
  const table = html`<table class="tbl">
    <thead>
      <tr>
        <td></td>
        ${(type === 'donut' ? series.slice(0, 1) : series).map((s, i) => html`<th scope="col" class="num">${name(s, i)}</th>`)}
      </tr>
    </thead>
    <tbody>
      ${labels.map(
        (l, r) =>
          html`<tr>
            <th scope="row">${l}</th>
            ${(type === 'donut' ? series.slice(0, 1) : series).map((s) => html`<td class="num">${fmt(s.values[r] ?? 0)}</td>`)}
          </tr>`,
      )}
    </tbody>
  </table>`;
  const data =
    p.table === true
      ? html`<details class="chart-data">
          <summary>${t(ctx, 'Daten als Tabelle')}</summary>
          ${table}
        </details>`
      : html`<div class="sr">${table}</div>`;

  let plot: Html;
  if (type === 'donut') plot = donut(labels, series[0].values, fmt, { other: t(ctx, 'Andere'), total: t(ctx, 'Total') }, nf, unit.trim() === '%');
  else if (type === 'hbar') plot = hbars(labels, series, fmt, color, name, showValues);
  else plot = columns(type, labels, series, fmt, color, name, showValues);

  return html`<figure class="${o.cls} chart-t-${type}" ${o.attrs}>
    ${caption}${legend}
    <div class="chart-plot" style="--chart-h:${height}px" aria-hidden="true">${plot}</div>
    ${data}
  </figure>`;
}

/** Position of a value on the scale, in percent from the bottom (or left). */
const at = (v: number, s: { min: number; max: number }) => ((v - s.min) / (s.max - s.min)) * 100;
const pct = (n: number) => `${Math.round(n * 100) / 100}%`;

function tip(label: string, rows: { c: string; name: string; value: string }[], solo: boolean): Html {
  return html`<span class="chart-tip"
    ><strong>${label}</strong>${rows.map((r) => (solo ? html`<span>${r.value}</span>` : html`<span><i style="--c:${r.c}"></i>${r.name}: ${r.value}</span>`))}</span
  >`;
}

/** Upright bars side by side per category, or lines through the middle of each category. */
function columns(
  type: 'bar' | 'line',
  labels: string[],
  series: ChartSeries[],
  fmt: (v: number) => string,
  color: (i: number) => string,
  name: (s: ChartSeries, i: number) => string,
  showValues: boolean,
): Html {
  const scale = niceScale(series.flatMap((s) => s.values));
  const zero = at(0, scale);
  const n = labels.length;
  const grid = scale.ticks.map((v) => html`<i class="chart-grid${v === 0 ? ' chart-zero' : ''}" style="bottom:${pct(at(v, scale))}"></i>`);
  // As wide as its longest label: the labels themselves sit absolutely at their height.
  const yWidth = Math.max(...scale.ticks.map((v) => fmt(v).length));
  const yAxis = html`<div class="chart-y" style="width:calc(${yWidth}ch + .25rem)">
    ${scale.ticks.map((v) => html`<span style="bottom:${pct(at(v, scale))}">${fmt(v)}</span>`)}
  </div>`;
  const solo = series.length === 1;
  const cols = labels.map((label, i) => {
    const rows = series.map((s, k) => ({ c: color(k), name: name(s, k), value: fmt(s.values[i] ?? 0) }));
    const bars =
      type === 'bar'
        ? html`<span class="chart-bars"
            >${series.map((s, k) => {
              const v = s.values[i] ?? 0;
              const top = at(Math.max(0, v), scale);
              const bottom = at(Math.min(0, v), scale);
              return html`<span class="chart-lane"
                ><b class="chart-bar${v < 0 ? ' neg' : ''}" style="--c:${color(k)};bottom:${pct(bottom)};height:${pct(top - bottom)}"
                  >${showValues ? html`<span class="chart-val">${fmt(v)}</span>` : ''}</b
                ></span
              >`;
            })}</span
          >`
        : '';
    return html`<span class="chart-col">${bars}${tip(label, rows, solo)}</span>`;
  });
  let lines: Html | string = '';
  if (type === 'line') {
    const x = (i: number) => ((i + 0.5) / n) * 1000;
    const y = (v: number) => 1000 - at(v, scale) * 10;
    const paths = series.map(
      (s, k) =>
        html`<polyline points="${s.values.map((v, i) => `${Math.round(x(i))},${Math.round(y(v))}`).join(' ')}" style="stroke:${color(k)}" vector-effect="non-scaling-stroke" />`,
    );
    const dots = series.flatMap((s, k) =>
      s.values.map((v, i) => html`<i class="chart-dot" style="--c:${color(k)};left:${pct(((i + 0.5) / n) * 100)};bottom:${pct(at(v, scale))}"></i>`),
    );
    // A single line names its last value at its end.
    const last =
      solo && showValues
        ? html`<span class="chart-end" style="left:${pct(((n - 0.5) / n) * 100)};bottom:${pct(at(series[0].values[n - 1] ?? 0, scale))}"
            >${fmt(series[0].values[n - 1] ?? 0)}</span
          >`
        : '';
    lines = html`<svg class="chart-lines" viewBox="0 0 1000 1000" preserveAspectRatio="none" focusable="false">${paths}</svg>${dots}${last}`;
  }
  const xAxis = html`<div class="chart-x" style="--n:${n}">${labels.map((l) => html`<span>${l}</span>`)}</div>`;
  return html`${yAxis}
    <div class="chart-area" style="--zero:${pct(zero)}">
      ${grid}${lines}
      <div class="chart-cols" style="--n:${n}">${cols}</div>
    </div>
    <span></span>${xAxis}`;
}

/** Lying bars: long category names fit, the value at the end of each bar. */
function hbars(
  labels: string[],
  series: ChartSeries[],
  fmt: (v: number) => string,
  color: (i: number) => string,
  name: (s: ChartSeries, i: number) => string,
  showValues: boolean,
): Html {
  const scale = niceScale(series.flatMap((s) => s.values));
  const solo = series.length === 1;
  const grid = scale.ticks.map((v) => html`<i class="chart-vgrid${v === 0 ? ' chart-zero' : ''}" style="left:${pct(at(v, scale))}"></i>`);
  const rows = labels.map((label, i) => {
    const bars = series.map((s, k) => {
      const v = s.values[i] ?? 0;
      const right = at(Math.max(0, v), scale);
      const left = at(Math.min(0, v), scale);
      return html`<span class="chart-hlane"
        ><b class="chart-hbar${v < 0 ? ' neg' : ''}" style="--c:${color(k)};left:${pct(left)};width:${pct(right - left)}"
          >${showValues ? html`<span class="chart-val">${fmt(v)}</span>` : ''}</b
        ></span
      >`;
    });
    const tipRows = series.map((s, k) => ({ c: color(k), name: name(s, k), value: fmt(s.values[i] ?? 0) }));
    return html`<span class="chart-hrow"><span class="chart-hlabel">${label}</span><span class="chart-htrack">${grid}${bars}${tip(label, tipRows, solo)}</span></span>`;
  });
  return html`<div class="chart-hrows${scale.min < 0 ? ' has-neg' : ''}">${rows}</div>`;
}

/** A ring of up to eight slices with the total in the middle, and a legend with values and shares. */
function donut(labels: string[], values: number[], fmt: (v: number) => string, words: { other: string; total: string }, nf: Intl.NumberFormat, percent: boolean): Html {
  const slices = donutSlices(labels, values, words.other);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = 40;
  const c = 2 * Math.PI * r;
  // A 2-unit gap of background between slices – none when one slice is the whole ring.
  const gap = slices.length > 1 ? 1.2 : 0;
  let start = 0;
  const arcs = slices.map((x) => {
    const len = (x.value / total) * c;
    const arc = html`<circle
      cx="50"
      cy="50"
      r="${r}"
      style="stroke:var(--chart-${x.slot})"
      stroke-dasharray="${Math.max(0.01, len - gap).toFixed(3)} ${c.toFixed(3)}"
      stroke-dashoffset="${(-start).toFixed(3)}"
    />`;
    start += len;
    return arc;
  });
  const share = new Intl.NumberFormat(nf.resolvedOptions().locale, { style: 'percent', maximumFractionDigits: 1 });
  const legend = html`<ul class="chart-dlegend">
    ${slices.map(
      (x) =>
        html`<li>
          <i style="--c:var(--chart-${x.slot})"></i><span>${x.label}</span><strong>${fmt(x.value)}</strong>${percent
            ? ''
            : html`<span class="chart-share">${share.format(x.value / total)}</span>`}
        </li>`,
    )}
  </ul>`;
  return html`<div class="chart-donut">
    <span class="chart-ring"
      ><svg viewBox="0 0 100 100" focusable="false">${total > 0 ? arcs : raw('<circle class="chart-track" cx="50" cy="50" r="40"/>')}</svg>${
        // Shares in percent add up to a hundred: the middle names the biggest slice instead of the total.
        percent && slices.length
          ? html`<span class="chart-total"
              >${fmt(slices.reduce((m, x) => (x.value > m.value ? x : m)).value)}<small>${slices.reduce((m, x) => (x.value > m.value ? x : m)).label}</small></span
            >`
          : html`<span class="chart-total">${fmt(total)}<small>${words.total}</small></span>`
      }</span
    >${legend}
  </div>`;
}

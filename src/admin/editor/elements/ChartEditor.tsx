import { useEffect, useState } from 'react';
import { t } from '../../lib/i18n';
import { Icon } from '../../ui/icons';
import { Field, Toggle } from '../../ui/kit';
import type { El } from '../../../shared/elements';
import { MAX_CHART_POINTS, MAX_CHART_SERIES, parseNum, type ChartSeries } from '../../../shared/chart';
import { parsePastedTable } from './pasteTable';

/** A number typed freely – «1’250», «12,5» – and kept as a number once it reads as one. */
function NumCell({ value, onChange, label, disabled }: { value: number; onChange: (n: number) => void; label: string; disabled: boolean }) {
  const [text, setText] = useState(String(value));
  // Only when the value changes from outside (undo, paste).
  useEffect(() => {
    if (parseNum(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      className="input num"
      inputMode="decimal"
      value={text}
      aria-label={label}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseNum(e.target.value);
        if (n !== null || !e.target.value.trim()) onChange(n ?? 0);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

/**
 * The numbers of a «Diagramm»: one row per category, one column per series –
 * to type in, or pasted from a spreadsheet (first column the categories, first
 * row the names of the series).
 */
export function ChartEditor({ el, onChange, locked }: { el: El; onChange: (el: El) => void; locked: boolean }) {
  const labels = (el.props.labels as string[] | undefined) ?? [];
  const series = (el.props.series as ChartSeries[] | undefined) ?? [];
  const donut = el.props.type === 'donut';
  const [paste, setPaste] = useState<string | null>(null);
  const [heads, setHeads] = useState(true);
  const set = (nextLabels: string[], nextSeries: ChartSeries[]) => onChange({ ...el, props: { ...el.props, labels: nextLabels, series: nextSeries } });
  const setValue = (k: number, r: number, v: number) =>
    set(
      labels,
      series.map((s, i) => (i === k ? { ...s, values: labels.map((_, j) => (j === r ? v : (s.values[j] ?? 0))) } : s)),
    );
  const usePaste = () => {
    const grid = parsePastedTable(paste ?? '');
    if (!grid.length) return setPaste(null);
    const [first, ...rest] = grid;
    const rows = (heads ? rest : grid).slice(0, MAX_CHART_POINTS);
    // Without a column of names, every column is a series of numbers.
    const named = rows.some((r) => r[0] && parseNum(r[0]) === null);
    const from = named ? 1 : 0;
    const width = Math.min(MAX_CHART_SERIES, Math.max(1, ...grid.map((r) => r.length - from)));
    set(
      rows.map((r, i) => (named ? r[0] : String(i + 1))),
      Array.from({ length: width }, (_, k) => ({ name: heads ? (first[k + from] ?? '') : '', values: rows.map((r) => parseNum(r[k + from]) ?? 0) })),
    );
    setPaste(null);
  };
  const shown = donut ? series.slice(0, 1) : series;
  return (
    <Field label={t('Daten')} help={donut ? t('Ein Ring zeigt die erste Reihe – bis acht Stücke, der Rest kommt zu «Andere».') : undefined}>
      <div className="stack tight">
        <div className="tbl-ed" style={{ gridTemplateColumns: `minmax(5rem, 1.4fr) repeat(${shown.length}, minmax(3.75rem, 1fr)) auto` }} role="group" aria-label={t('Daten')}>
          <span className="xsmall faint tbl-ed-cap">{t('Beschriftung')}</span>
          {shown.map((s, k) => (
            <div key={`h${k}`} className="tbl-ed-head">
              <input
                className="input"
                value={s.name}
                placeholder={t('Reihe {n}', { n: k + 1 })}
                aria-label={t('Name der Reihe {n}', { n: k + 1 })}
                disabled={locked}
                onChange={(e) =>
                  set(
                    labels,
                    series.map((x, i) => (i === k ? { ...x, name: e.target.value } : x)),
                  )
                }
              />
              {series.length > 1 && (
                <button
                  type="button"
                  className="btn s ghost icon-only"
                  disabled={locked}
                  onClick={() =>
                    set(
                      labels,
                      series.filter((_, i) => i !== k),
                    )
                  }
                  aria-label={t('Reihe {n} entfernen', { n: k + 1 })}
                >
                  <Icon name="x" size="s" />
                </button>
              )}
            </div>
          ))}
          <span />
          {labels.map((l, r) => (
            <div key={`r${r}`} style={{ display: 'contents' }}>
              <input
                className="input"
                value={l}
                aria-label={t('Beschriftung {n}', { n: r + 1 })}
                disabled={locked}
                onChange={(e) =>
                  set(
                    labels.map((x, i) => (i === r ? e.target.value : x)),
                    series,
                  )
                }
              />
              {shown.map((s, k) => (
                <NumCell
                  key={k}
                  value={s.values[r] ?? 0}
                  label={t('{label}, {series}', { label: l || t('Beschriftung {n}', { n: r + 1 }), series: s.name || t('Reihe {n}', { n: k + 1 }) })}
                  disabled={locked}
                  onChange={(v) => setValue(k, r, v)}
                />
              ))}
              <button
                type="button"
                className="btn s ghost icon-only"
                disabled={locked || labels.length < 2}
                onClick={() =>
                  set(
                    labels.filter((_, i) => i !== r),
                    series.map((s) => ({ ...s, values: s.values.filter((_, i) => i !== r) })),
                  )
                }
                aria-label={t('Zeile {n} entfernen', { n: r + 1 })}
              >
                <Icon name="trash" size="s" />
              </button>
            </div>
          ))}
        </div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn s"
            disabled={locked || labels.length >= MAX_CHART_POINTS}
            onClick={() =>
              set(
                [...labels, ''],
                series.map((s) => ({ ...s, values: [...s.values, 0] })),
              )
            }
          >
            <Icon name="plus" size="s" /> {t('Zeile')}
          </button>
          {!donut && (
            <button
              type="button"
              className="btn s"
              disabled={locked || series.length >= MAX_CHART_SERIES}
              onClick={() => set(labels, [...series, { name: '', values: labels.map(() => 0) }])}
              title={series.length >= MAX_CHART_SERIES ? t('Höchstens {n} Reihen – mehr Farben kann niemand mehr auseinanderhalten.', { n: MAX_CHART_SERIES }) : undefined}
            >
              <Icon name="plus" size="s" /> {t('Reihe')}
            </button>
          )}
          <button type="button" className="btn s ghost" disabled={locked} onClick={() => setPaste(paste === null ? '' : null)} aria-expanded={paste !== null}>
            <Icon name="table" size="s" /> {t('Aus Excel einfügen')}
          </button>
        </div>
        {paste !== null && (
          <div className="stack tight">
            <textarea
              className="textarea mono"
              rows={5}
              value={paste}
              autoFocus
              placeholder={t('Erste Spalte: Beschriftungen. Daneben eine Spalte Zahlen pro Reihe.')}
              aria-label={t('Daten einfügen')}
              onChange={(e) => setPaste(e.target.value)}
            />
            <Toggle checked={heads} onChange={setHeads} label={t('Erste Zeile sind die Namen der Reihen')} />
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn s primary" disabled={!paste.trim()} onClick={usePaste}>
                {t('Übernehmen')}
              </button>
              <button type="button" className="btn s ghost" onClick={() => setPaste(null)}>
                {t('Abbrechen')}
              </button>
            </div>
            <p className="xsmall faint">{t('Ersetzt alle Daten – höchstens {r} Zeilen und {c} Reihen.', { r: MAX_CHART_POINTS, c: MAX_CHART_SERIES })}</p>
          </div>
        )}
      </div>
    </Field>
  );
}

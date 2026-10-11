import { useState } from 'react';
import { t } from '../../lib/i18n';
import { Icon } from '../../ui/icons';
import { Field, Toggle } from '../../ui/kit';
import { MAX_TABLE_COLS, MAX_TABLE_ROWS, type El } from '../../../shared/elements';
import { parsePastedTable } from './pasteTable';

/**
 * The cells of a «Tabelle» in the inspector: headings and rows to type in,
 * rows and columns to add or remove – and a table pasted from a spreadsheet.
 * The same cells can be written directly on the page.
 */
export function TableEditor({ el, onChange, locked }: { el: El; onChange: (el: El) => void; locked: boolean }) {
  const cols = (el.props.cols as string[] | undefined) ?? [];
  const rows = (el.props.rows as string[][] | undefined) ?? [];
  const [paste, setPaste] = useState<string | null>(null);
  const [heads, setHeads] = useState(true);
  const set = (nextCols: string[], nextRows: string[][]) => onChange({ ...el, props: { ...el.props, cols: nextCols, rows: nextRows } });
  const cell = (r: number, c: number, v: string) =>
    set(
      cols,
      rows.map((row, i) => (i === r ? cols.map((_, j) => (j === c ? v : (row[j] ?? ''))) : row)),
    );
  const usePaste = () => {
    const grid = parsePastedTable(paste ?? '');
    if (!grid.length) return setPaste(null);
    const width = Math.min(MAX_TABLE_COLS, Math.max(...grid.map((r) => r.length)));
    const fit = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? '');
    const [first, ...rest] = grid;
    set(heads ? fit(first) : Array.from({ length: width }, () => ''), (heads ? rest : grid).slice(0, MAX_TABLE_ROWS).map(fit));
    setPaste(null);
  };
  return (
    <Field label={t('Zellen')} help={t('Du kannst jede Zelle auch direkt auf der Seite anklicken und schreiben.')}>
      <div className="stack tight">
        <div
          className="tbl-ed"
          style={{
            gridTemplateColumns: `repeat(${cols.length}, minmax(3.75rem, 1fr)) auto`,
          }}
          role="group"
          aria-label={t('Tabelle bearbeiten')}
        >
          {cols.map((h, c) => (
            <div key={`h${c}`} className="tbl-ed-head">
              <input
                className="input"
                value={h}
                placeholder={t('Spalte {n}', { n: c + 1 })}
                aria-label={t('Überschrift Spalte {n}', { n: c + 1 })}
                disabled={locked}
                onChange={(e) =>
                  set(
                    cols.map((x, i) => (i === c ? e.target.value : x)),
                    rows,
                  )
                }
              />
              {cols.length > 1 && (
                <button
                  type="button"
                  className="btn s ghost icon-only"
                  disabled={locked}
                  onClick={() =>
                    set(
                      cols.filter((_, i) => i !== c),
                      rows.map((r) => r.filter((_, i) => i !== c)),
                    )
                  }
                  aria-label={t('Spalte {n} entfernen', { n: c + 1 })}
                >
                  <Icon name="x" size="s" />
                </button>
              )}
            </div>
          ))}
          <span />
          {rows.map((r, ri) => (
            <div key={`r${ri}`} className="tbl-ed-row" style={{ display: 'contents' }}>
              {cols.map((_, c) => (
                <input
                  key={c}
                  className="input"
                  value={r[c] ?? ''}
                  aria-label={t('Zeile {r}, Spalte {c}', {
                    r: ri + 1,
                    c: c + 1,
                  })}
                  disabled={locked}
                  onChange={(e) => cell(ri, c, e.target.value)}
                />
              ))}
              <button
                type="button"
                className="btn s ghost icon-only"
                disabled={locked}
                onClick={() =>
                  set(
                    cols,
                    rows.filter((_, i) => i !== ri),
                  )
                }
                aria-label={t('Zeile {n} entfernen', { n: ri + 1 })}
              >
                <Icon name="trash" size="s" />
              </button>
            </div>
          ))}
        </div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="btn s" disabled={locked || rows.length >= MAX_TABLE_ROWS} onClick={() => set(cols, [...rows, cols.map(() => '')])}>
            <Icon name="plus" size="s" /> {t('Zeile')}
          </button>
          <button
            type="button"
            className="btn s"
            disabled={locked || cols.length >= MAX_TABLE_COLS}
            onClick={() =>
              set(
                [...cols, ''],
                rows.map((r) => [...r, '']),
              )
            }
          >
            <Icon name="plus" size="s" /> {t('Spalte')}
          </button>
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
              placeholder={t('Zellen in Excel, Numbers oder Google Sheets markieren, kopieren und hier einfügen.')}
              aria-label={t('Tabelle einfügen')}
              onChange={(e) => setPaste(e.target.value)}
            />
            <Toggle checked={heads} onChange={setHeads} label={t('Erste Zeile sind die Überschriften')} />
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn s primary" disabled={!paste.trim()} onClick={usePaste}>
                {t('Übernehmen')}
              </button>
              <button type="button" className="btn s ghost" onClick={() => setPaste(null)}>
                {t('Abbrechen')}
              </button>
            </div>
            <p className="xsmall faint">{t('Ersetzt die ganze Tabelle – höchstens {c} Spalten und {r} Zeilen.', { c: MAX_TABLE_COLS, r: MAX_TABLE_ROWS })}</p>
          </div>
        )}
      </div>
    </Field>
  );
}

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { api } from '../lib/api';
import { modKey } from '../lib/hooks';
import { entryUrl } from '../lib/actions';
import { t, tl, tm } from '../lib/i18n';
import { Link } from '../lib/router';
import { useSession } from '../lib/session';
import { Icon } from '../ui/icons';
import { Dialog, Popover, StatusBadge, Toggle } from '../ui/kit';
import { useToast } from '../ui/toast';
import { SelectBox, type useSelection } from './Bulk';
import { cellText, inlineEditable, tableFields } from '../../shared/datatable';
import { formatPrice } from '../../shared/text';
import type { FieldDef } from '../../shared/fields';
import type { CollectionDef } from '../../shared/types';
import type { Row } from './Content';

interface Pos {
  r: number;
  c: number;
}

const store = (collection: string) => `nova.datacols.${collection}`;
function loadCols(collection: string): string[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(store(collection)) ?? 'null');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

/** How a cell reads when not edited: money as price, yes/no as a mark, choices by their label. */
function show(f: FieldDef, v: unknown) {
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return <span className="faint">–</span>;
  if (f.type === 'money' && typeof v === 'number') return <span className="num">{formatPrice(v)}</span>;
  if (f.type === 'number') return <span className="num">{String(v)}</span>;
  if (f.type === 'boolean') return v ? <Icon name="check" size="s" /> : <span className="faint">–</span>;
  if (f.type === 'select') return tl(f.options?.find((o) => o.value === v)?.label) || String(v);
  if (f.type === 'color' && typeof v === 'string')
    return (
      <span className="dg-color" style={{ ['--c' as string]: v }}>
        {v}
      </span>
    );
  if (f.type === 'datetime' && typeof v === 'string') return new Date(v).toLocaleString();
  return <span className="ellipsis">{cellText(f, v)}</span>;
}

/**
 * The Werkbank's spreadsheet view of a content type: pick the columns, move
 * with the arrow keys, type to change a cell, paste a block from Excel.
 * Every cell saves on its own, checked by the server like the editor does.
 */
export function DataGrid({
  col,
  rows,
  selection,
  onRow,
  onImported,
}: {
  col: CollectionDef;
  rows: Row[];
  selection: ReturnType<typeof useSelection>;
  onRow: (row: Row) => void;
  onImported: () => void;
}) {
  const { can, user } = useSession();
  const toast = useToast();
  const all = useMemo(() => tableFields(col.fields, col.title_field), [col]);
  const [chosen, setChosen] = useState<string[]>(() => loadCols(col.id) ?? all.slice(0, 5).map((f) => f.key));
  useEffect(() => setChosen(loadCols(col.id) ?? all.slice(0, 5).map((f) => f.key)), [col.id, all]);
  const choose = (keys: string[]) => {
    setChosen(keys);
    try {
      localStorage.setItem(store(col.id), JSON.stringify(keys));
    } catch {
      /* private mode: the choice lasts until reload */
    }
  };
  const titleDef: FieldDef = { key: 'title', type: 'text', label: tl(col.fields.find((f) => f.key === col.title_field)?.label) || t('Titel'), required: true };
  const columns = [titleDef, ...chosen.map((k) => all.find((f) => f.key === k)).filter((f): f is FieldDef => Boolean(f))];

  const [active, setActive] = useState<Pos | null>(null);
  const [edit, setEdit] = useState<(Pos & { text: string }) | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const grid = useRef<HTMLDivElement>(null);
  // A boolean cell flips on a click only when it was already the active one.
  const wasOn = useRef(false);
  const mayEdit = (r: Row) => can('content.edit') || (can('content.edit.own') && r.author_id === user.id);
  const value = (r: Row, f: FieldDef) => (f.key === 'title' ? r.title : r.fields[f.key]);
  const editable = (f: FieldDef) => f.key === 'title' || inlineEditable(f);

  // Keep the active cell inside the table when rows or columns change.
  useEffect(() => {
    if (active && (active.r >= rows.length || active.c >= columns.length)) setActive(null);
  }, [rows.length, columns.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusGrid = () => requestAnimationFrame(() => grid.current?.focus({ preventScroll: true }));
  const move = (p: Pos, dr: number, dc: number) => {
    const next = { r: Math.max(0, Math.min(rows.length - 1, p.r + dr)), c: Math.max(0, Math.min(columns.length - 1, p.c + dc)) };
    setActive(next);
    requestAnimationFrame(() => grid.current?.querySelector(`[data-cell="${next.r}-${next.c}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  };

  const save = async (r: Row, f: FieldDef, text: string) => {
    if (text === cellText(f, value(r, f)) || (f.key === 'title' && text === r.title)) return;
    const key = `${r.id}:${f.key}`;
    setBusy((s) => new Set(s).add(key));
    try {
      const res = await api.post<{ row: Row }>(`/api/entries/${r.id}/field`, { field: f.key, text });
      onRow({ ...r, ...res.row, translations: r.translations });
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setBusy((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }
  };

  const begin = (p: Pos, text?: string) => {
    const r = rows[p.r];
    const f = columns[p.c];
    if (!r || !f || !editable(f) || !mayEdit(r)) return;
    if (f.type === 'boolean') return void save(r, f, value(r, f) ? 'nein' : 'ja');
    setEdit({ ...p, text: text ?? (f.key === 'title' ? r.title : cellText(f, value(r, f))) });
  };
  const commit = (then?: [number, number]) => {
    if (!edit) return;
    const r = rows[edit.r];
    const f = columns[edit.c];
    setEdit(null);
    if (r && f) void save(r, f, edit.text);
    if (then) move(edit, then[0], then[1]);
    focusGrid();
  };

  /** A block of cells from a spreadsheet (tabs and lines) lands from the active cell on. */
  const paste = (text: string) => {
    if (!active) return;
    const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
    let n = 0;
    lines.forEach((line, dr) =>
      line.split('\t').forEach((cell, dc) => {
        const r = rows[active.r + dr];
        const f = columns[active.c + dc];
        if (!r || !f || !editable(f) || !mayEdit(r)) return;
        n++;
        void save(r, f, cell);
      }),
    );
    if (n > 1) toast(t('{n} Zellen eingefügt.', { n }));
  };

  const onKey = (e: ReactKeyboardEvent) => {
    if (edit || !rows.length) return;
    const p = active ?? { r: 0, c: 0 };
    const mod = e.metaKey || e.ctrlKey;
    const keys: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (keys[e.key]) {
      e.preventDefault();
      return active ? move(p, ...keys[e.key]) : setActive(p);
    }
    if (!active) return;
    if (e.key === 'Tab') {
      if ((e.shiftKey && p.c === 0) || (!e.shiftKey && p.c === columns.length - 1)) return;
      e.preventDefault();
      return move(p, 0, e.shiftKey ? -1 : 1);
    }
    if (e.key === 'Enter' || e.key === 'F2' || (e.key === ' ' && columns[p.c].type === 'boolean')) {
      e.preventDefault();
      return begin(p);
    }
    if (e.key === 'Escape') return setActive(null);
    if ((e.key === 'Delete' || e.key === 'Backspace') && columns[p.c].key !== 'title') {
      e.preventDefault();
      const r = rows[p.r];
      const f = columns[p.c];
      if (editable(f) && mayEdit(r) && f.type !== 'boolean') void save(r, f, '');
      return;
    }
    if (mod && e.key.toLowerCase() === 'c') {
      const r = rows[p.r];
      const f = columns[p.c];
      void navigator.clipboard?.writeText(f.key === 'title' ? r.title : cellText(f, value(r, f)));
      return;
    }
    // Typing starts editing with that letter, like in a spreadsheet.
    if (e.key.length === 1 && !mod && !e.altKey && !['boolean', 'select', 'date'].includes(columns[p.c].type)) {
      e.preventDefault();
      begin(p, e.key);
    }
  };

  const editor = (f: FieldDef) => {
    if (!edit) return null;
    const common = {
      autoFocus: true,
      className: 'dg-input',
      'aria-label': tl(f.label),
      onBlur: () => commit(),
      onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          setEdit(null);
          focusGrid();
        } else if (e.key === 'Enter' && !(f.type === 'textarea' && e.shiftKey)) {
          e.preventDefault();
          commit([e.shiftKey ? -1 : 1, 0]);
        } else if (e.key === 'Tab') {
          e.preventDefault();
          commit([0, e.shiftKey ? -1 : 1]);
        }
      },
    };
    if (f.type === 'select')
      return (
        <select {...common} value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })}>
          {!f.required && <option value="">–</option>}
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {tl(o.label)}
            </option>
          ))}
        </select>
      );
    if (f.type === 'textarea')
      return <textarea {...common} rows={Math.min(6, edit.text.split('\n').length + 1)} value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} />;
    return (
      <input
        {...common}
        type={f.type === 'date' ? 'date' : 'text'}
        inputMode={f.type === 'number' || f.type === 'money' ? 'decimal' : undefined}
        value={edit.text}
        onFocus={(e) => {
          // A cell started by typing keeps the caret at the end, one started with Enter selects all.
          if (edit.text.length > 1) e.currentTarget.select();
        }}
        onChange={(e) => setEdit({ ...edit, text: e.target.value })}
      />
    );
  };

  return (
    <div className="dg">
      <div className="dg-bar">
        <span className="xsmall muted">{t('Pfeiltasten wählen, Enter oder Tippen bearbeitet, aus Excel einfügen mit {key}+V.', { key: modKey })}</span>
        <span className="grow" />
        <a className="btn s ghost" href={`/api/data/${col.id}/export`} download>
          <Icon name="download" size="s" /> CSV
        </a>
        {can('content.edit') && (
          <button className="btn s ghost" onClick={() => setImporting(true)}>
            <Icon name="upload" size="s" /> {t('Importieren')}
          </button>
        )}
        <Popover
          align="end"
          trigger={
            <button className="btn s">
              <Icon name="columns" size="s" /> {t('Spalten')} <span className="muted">{chosen.length}</span>
            </button>
          }
        >
          <div className="dg-cols">
            <div className="row">
              <button className="btn ghost s" onClick={() => choose(all.map((f) => f.key))}>
                {t('Alle')}
              </button>
              <button className="btn ghost s" onClick={() => choose([])}>
                {t('Keine')}
              </button>
            </div>
            {all.length === 0 && <p className="small muted">{t('Dieser Inhaltstyp hat keine Felder für Spalten.')}</p>}
            {all.map((f) => (
              <label key={f.key} className="dg-col">
                <input type="checkbox" checked={chosen.includes(f.key)} onChange={(e) => choose(e.target.checked ? [...chosen, f.key] : chosen.filter((k) => k !== f.key))} />
                <span className="grow">{tl(f.label)}</span>
                <code className="xsmall muted">{f.key}</code>
              </label>
            ))}
          </div>
        </Popover>
      </div>
      <div
        className="dg-scroll"
        ref={grid}
        tabIndex={0}
        role="grid"
        aria-label={t('Daten von {name}', { name: tl(col.name) })}
        aria-rowcount={rows.length + 1}
        onKeyDown={onKey}
        onPaste={(e) => {
          if (edit) return;
          e.preventDefault();
          paste(e.clipboardData.getData('text/plain'));
        }}
      >
        <table className="dg-table">
          <thead>
            <tr>
              <th className="check-cell">
                <SelectBox checked={selection.all} mixed={selection.some} onChange={selection.setAll} label={t('Alle auswählen')} />
              </th>
              {columns.map((f) => (
                <th key={f.key} className={f.type === 'money' || f.type === 'number' ? 'right' : ''}>
                  {f.key === 'title' ? f.label : tl(f.label)}
                  <code>{f.key}</code>
                </th>
              ))}
              <th>{t('Status')}</th>
              <th aria-label={t('Öffnen')} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={r.id} className={selection.has(r.id) ? 'selected' : ''}>
                <td className="check-cell">
                  <SelectBox checked={selection.has(r.id)} onChange={() => selection.toggle(r.id)} label={t('«{name}» auswählen', { name: r.title })} />
                </td>
                {columns.map((f, ci) => {
                  const on = active?.r === ri && active.c === ci;
                  const editing = edit?.r === ri && edit.c === ci;
                  const locked = !editable(f) || !mayEdit(r);
                  return (
                    <td
                      key={f.key}
                      data-cell={`${ri}-${ci}`}
                      role="gridcell"
                      aria-selected={on}
                      aria-readonly={locked || undefined}
                      className={`dg-cell t-${f.type}${on ? ' on' : ''}${editing ? ' editing' : ''}${locked ? ' locked' : ''}${busy.has(`${r.id}:${f.key}`) ? ' busy' : ''}`}
                      onMouseDown={(e) => {
                        wasOn.current = on;
                        if (editing) return;
                        e.preventDefault();
                        if (edit) commit();
                        setActive({ r: ri, c: ci });
                        grid.current?.focus({ preventScroll: true });
                      }}
                      onDoubleClick={() => begin({ r: ri, c: ci })}
                      onClick={() => wasOn.current && f.type === 'boolean' && begin({ r: ri, c: ci })}
                    >
                      {editing ? editor(f) : f.key === 'title' ? <span className="ellipsis">{r.title || t('Ohne Titel')}</span> : show(f, value(r, f))}
                    </td>
                  );
                })}
                <td>
                  <StatusBadge status={r.status} changed={r.changed} until={r.unpublish_at} />
                </td>
                <td className="right">
                  <Link to={entryUrl(col.id, r.id)} className="btn ghost s icon-only" aria-label={t('«{name}» öffnen', { name: r.title })}>
                    <Icon name="arrowRight" size="s" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ImportDialog col={col} open={importing} onClose={() => setImporting(false)} onDone={onImported} />
    </div>
  );
}

interface ImportResult {
  created: number;
  updated: number;
  unchanged: number;
  errors: { line: number; message: string }[];
  errorCount: number;
  columns: string[];
  ignored: string[];
}

/**
 * CSV back in: first a dry run that says what would happen, line by line,
 * then the real thing. Rows with an id or address update, the rest are new drafts.
 */
function ImportDialog({ col, open, onClose, onDone }: { col: CollectionDef; open: boolean; onClose: () => void; onDone: () => void }) {
  const { can } = useSession();
  const toast = useToast();
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [check, setCheck] = useState<ImportResult | null>(null);
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const reset = () => {
    setFile(null);
    setCheck(null);
    setPublish(false);
  };
  const run = async (text: string, dryRun: boolean) => {
    setBusy(true);
    try {
      const r = await api.post<ImportResult>(`/api/data/${col.id}/import`, { csv: text, dryRun, publish: dryRun ? false : publish });
      if (dryRun) return setCheck(r);
      toast(t('{a} neu, {b} geändert, {c} unverändert.', { a: r.created, b: r.updated, c: r.unchanged }), r.errorCount ? { kind: 'bad' } : {});
      onDone();
      if (r.errorCount) setCheck({ ...r, created: 0, updated: 0 });
      else {
        reset();
        onClose();
      }
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setBusy(false);
    }
  };
  const pick = async (f: File | undefined) => {
    if (!f) return;
    const buf = await f.arrayBuffer();
    // Excel on Windows still writes Windows-1252 now and then; UTF-8 first, else that.
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      text = new TextDecoder('windows-1252').decode(buf);
    }
    setFile({ name: f.name, text });
    void run(text, true);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
      title={t('{name} aus CSV importieren', { name: tl(col.name) })}
      description={t('Die Kopfzeile nennt die Felder (wie im Export). Zeilen mit id oder slug ändern bestehende Einträge, die anderen kommen als neue Entwürfe dazu.')}
      wide
    >
      <div className="stack">
        <label className="dropzone dg-drop">
          <Icon name="upload" />
          <span>{file ? file.name : t('CSV-Datei wählen')}</span>
          <input type="file" accept=".csv,text/csv,text/plain" className="sr" onChange={(e) => void pick(e.target.files?.[0])} />
        </label>
        {busy && !check && <p className="small muted">{t('Prüfe …')}</p>}
        {check && (
          <>
            <div className="dg-sum">
              <span>
                <b>{check.created}</b> {t('neu')}
              </span>
              <span>
                <b>{check.updated}</b> {t('geändert')}
              </span>
              <span>
                <b>{check.unchanged}</b> {t('unverändert')}
              </span>
              <span className={check.errorCount ? 'bad' : ''}>
                <b>{check.errorCount}</b> {t('mit Fehlern')}
              </span>
            </div>
            <p className="xsmall muted">
              {t('Erkannte Spalten: {list}', { list: check.columns.join(', ') || '–' })}
              {check.ignored.length > 0 && ` · ${t('Nicht übernommen: {list}', { list: check.ignored.join(', ') })}`}
            </p>
            {check.errors.length > 0 && (
              <ul className="dg-errors">
                {check.errors.map((e) => (
                  <li key={e.line}>
                    <span className="num">{t('Zeile {n}', { n: e.line })}</span> {tm(e.message)}
                  </li>
                ))}
                {check.errorCount > check.errors.length && <li className="muted">{t('… und {n} weitere', { n: check.errorCount - check.errors.length })}</li>}
              </ul>
            )}
            {can('content.publish') && check.created + check.updated > 0 && (
              <Toggle checked={publish} onChange={setPublish} label={t('Neue und geänderte Einträge gleich veröffentlichen')} />
            )}
          </>
        )}
        <div className="dialog-actions">
          <button className="btn ghost" onClick={onClose}>
            {t('Abbrechen')}
          </button>
          <button className="btn primary" disabled={busy || !file || !check || check.created + check.updated === 0} onClick={() => file && void run(file.text, false)}>
            {check && check.created + check.updated > 0 ? t('{n} Einträge übernehmen', { n: check.created + check.updated }) : t('Übernehmen')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

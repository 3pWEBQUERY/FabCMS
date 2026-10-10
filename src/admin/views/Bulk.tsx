import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { t } from '../lib/i18n';
import { useSession } from '../lib/session';
import { Icon } from '../ui/icons';
import { Dialog, Field, confirm } from '../ui/kit';
import { useToast } from '../ui/toast';

/** Rows chosen in a list; forgets ids that are no longer shown. */
export function useSelection(ids: string[]) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const key = ids.join(',');
  useEffect(() => setSel((s) => new Set([...s].filter((id) => ids.includes(id)))), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  // Escape lets go of the selection.
  useEffect(() => {
    if (!sel.size) return;
    const on = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target as HTMLElement).closest('[role="dialog"]') && setSel(new Set());
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [sel.size]);
  return {
    sel,
    has: (id: string) => sel.has(id),
    toggle: (id: string) =>
      setSel((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      }),
    setAll: (on: boolean) => setSel(on ? new Set(ids) : new Set()),
    all: ids.length > 0 && ids.every((id) => sel.has(id)),
    some: sel.size > 0,
    clear: () => setSel(new Set()),
  };
}

export function SelectBox({ checked, mixed, onChange, label }: { checked: boolean; mixed?: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <input
      type="checkbox"
      className="row-check"
      checked={checked}
      aria-label={label}
      ref={(el) => {
        if (el) el.indeterminate = Boolean(mixed) && !checked;
      }}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}

type Action = 'publish' | 'unpublish' | 'trash' | 'duplicate' | 'set';

/**
 * What can be done with the chosen entries – floating at the bottom while
 * something is chosen. Every entry is checked like a single change would be.
 */
export function BulkBar({
  hasCategory,
  selection,
  categories,
  onDone,
}: {
  hasCategory: boolean;
  selection: ReturnType<typeof useSelection>;
  categories: string[];
  onDone: () => void;
}) {
  const { can } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [cat, setCat] = useState<string | null>(null);
  const ids = useMemo(() => [...selection.sel], [selection.sel]);

  const run = async (action: Action, extra: { field?: string; value?: unknown } = {}) => {
    setBusy(true);
    try {
      const r = await api.post<{ done: string[]; failed: { title: string; error: string }[] }>('/api/entries/bulk', { ids, action, ...extra });
      const n = r.done.length;
      const msg =
        action === 'publish'
          ? t('{n} veröffentlicht.', { n })
          : action === 'unpublish'
            ? t('{n} offline genommen.', { n })
            : action === 'duplicate'
              ? t('{n} dupliziert.', { n })
              : action === 'set'
                ? t('Bei {n} geändert.', { n })
                : t('{n} in den Papierkorb gelegt.', { n });
      const done = r.done;
      toast(r.failed.length ? `${msg} ${t('{n} nicht: {why}', { n: r.failed.length, why: r.failed[0].error })}` : msg, {
        kind: r.failed.length ? 'bad' : undefined,
        ms: action === 'trash' ? 8000 : undefined,
        action:
          action === 'trash' && done.length
            ? {
                label: t('Rückgängig'),
                run: () => void Promise.all(done.map((id) => api.post(`/api/trash/${id}/restore`, {}).catch(() => null))).then(() => onDone()),
              }
            : undefined,
      });
      selection.clear();
      onDone();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {selection.some && (
          <motion.div
            className="bulk-bar"
            role="toolbar"
            aria-label={t('Auswahl')}
            initial={{ opacity: 0, y: 16, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 16, x: '-50%' }}
            transition={{ type: 'spring', stiffness: 500, damping: 38 }}
          >
            <span className="bulk-n">{t('{n} ausgewählt', { n: ids.length })}</span>
            {can('content.publish') && (
              <>
                <button className="btn s" disabled={busy} onClick={() => void run('publish')}>
                  <Icon name="publish" size="s" /> {t('Veröffentlichen')}
                </button>
                <button
                  className="btn s ghost"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: t('{n} offline nehmen?', { n: ids.length }),
                        message: t('Sie verschwinden von der Website, bleiben aber als Entwurf erhalten.'),
                        confirm: t('Offline nehmen'),
                      })
                    )
                      void run('unpublish');
                  }}
                >
                  <Icon name="eyeOff" size="s" /> {t('Offline')}
                </button>
              </>
            )}
            {hasCategory && (
              <button className="btn s ghost" disabled={busy} onClick={() => setCat('')}>
                <Icon name="tag" size="s" /> {t('Kategorie')}
              </button>
            )}
            <button className="btn s ghost" disabled={busy} onClick={() => void run('duplicate')}>
              <Icon name="copy" size="s" /> {t('Duplizieren')}
            </button>
            {(can('content.delete') || can('content.edit.own')) && (
              <button className="btn s ghost danger" disabled={busy} onClick={() => void run('trash')}>
                <Icon name="trash" size="s" /> {t('Löschen')}
              </button>
            )}
            <button className="btn s ghost icon-only" onClick={selection.clear} aria-label={t('Auswahl aufheben')}>
              <Icon name="x" size="s" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <Dialog open={cat !== null} onOpenChange={(o) => !o && setCat(null)} title={t('Kategorie für {n} Einträge', { n: ids.length })}>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void run('set', { field: 'category', value: (cat ?? '').trim() });
            setCat(null);
          }}
        >
          <Field label={t('Kategorie')} htmlFor="bulk-cat" help={t('Leer lassen entfernt die Kategorie.')}>
            <input id="bulk-cat" className="input" list="bulk-cats" value={cat ?? ''} maxLength={80} onChange={(e) => setCat(e.target.value)} autoFocus />
            <datalist id="bulk-cats">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <div className="dialog-actions">
            <button type="button" className="btn ghost" onClick={() => setCat(null)}>
              {t('Abbrechen')}
            </button>
            <button className="btn primary">{t('Übernehmen')}</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

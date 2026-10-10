import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { api } from '../lib/api';
import { t } from '../lib/i18n';
import { useSession } from '../lib/session';
import { Icon } from '../ui/icons';
import { Dialog, Field, confirm } from '../ui/kit';
import { useToast } from '../ui/toast';
import type { useSelection } from './Bulk';

/** Chosen files in the media library: into a folder, a tag more, or away. */
export function MediaBulkBar({ selection, folders, onDone }: { selection: ReturnType<typeof useSelection>; folders: string[]; onDone: (removed: string[]) => void }) {
  const { can } = useSession();
  const toast = useToast();
  const [ask, setAsk] = useState<'move' | 'tag' | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const ids = [...selection.sel];

  const run = async (action: 'move' | 'tag' | 'delete', extra: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      const r = await api.post<{ done: string[]; inUse: string[] }>('/api/media/bulk', { ids, action, ...extra });
      if (action === 'delete') {
        toast(
          r.inUse.length ? t('{n} gelöscht. {k} werden noch verwendet und sind geblieben.', { n: r.done.length, k: r.inUse.length }) : t('{n} gelöscht.', { n: r.done.length }),
          r.inUse.length && can('media.manage')
            ? {
                ms: 9000,
                action: {
                  label: t('Trotzdem löschen'),
                  run: () =>
                    void api.post<{ done: string[] }>('/api/media/bulk', { ids: r.inUse, action: 'delete', force: true }).then((x) => {
                      toast(t('{n} gelöscht.', { n: x.done.length }));
                      onDone(x.done);
                    }),
                },
              }
            : {},
        );
        onDone(r.done);
      } else {
        toast(action === 'move' ? t('{n} verschoben.', { n: r.done.length }) : t('Schlagwort bei {n} ergänzt.', { n: r.done.length }));
        onDone([]);
      }
      selection.clear();
      setAsk(null);
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
            <button className="btn s ghost" disabled={busy} onClick={() => selection.setAll(true)}>
              {t('Alle')}
            </button>
            <button
              className="btn s"
              disabled={busy}
              onClick={() => {
                setValue('');
                setAsk('move');
              }}
            >
              <Icon name="folder" size="s" /> {t('In Ordner')}
            </button>
            <button
              className="btn s ghost"
              disabled={busy}
              onClick={() => {
                setValue('');
                setAsk('tag');
              }}
            >
              <Icon name="tag" size="s" /> {t('Schlagwort')}
            </button>
            {can('media.manage') && (
              <button
                className="btn s ghost danger"
                disabled={busy}
                onClick={async () => {
                  if (
                    await confirm({
                      title: t('{n} Dateien löschen?', { n: ids.length }),
                      message: t('Dateien, die noch verwendet werden, bleiben – du kannst sie danach bewusst löschen.'),
                      confirm: t('Löschen'),
                      danger: true,
                    })
                  )
                    void run('delete');
                }}
              >
                <Icon name="trash" size="s" /> {t('Löschen')}
              </button>
            )}
            <button className="btn s ghost icon-only" onClick={selection.clear} aria-label={t('Auswahl aufheben')}>
              <Icon name="x" size="s" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <Dialog
        open={ask !== null}
        onOpenChange={(o) => !o && setAsk(null)}
        title={ask === 'move' ? t('{n} Dateien in einen Ordner', { n: ids.length }) : t('Schlagwort für {n} Dateien', { n: ids.length })}
      >
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (ask === 'move') void run('move', { folder: value.trim() });
            else if (value.trim()) void run('tag', { tag: value.trim() });
          }}
        >
          <Field
            label={ask === 'move' ? t('Ordner') : t('Schlagwort')}
            htmlFor="mb-val"
            help={ask === 'move' ? t('Neuer Name legt den Ordner an, leer = ohne Ordner.') : undefined}
          >
            <input
              id="mb-val"
              className="input"
              list={ask === 'move' ? 'mb-folders' : undefined}
              value={value}
              maxLength={ask === 'move' ? 80 : 40}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
            <datalist id="mb-folders">
              {folders.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </Field>
          <div className="dialog-actions">
            <button type="button" className="btn ghost" onClick={() => setAsk(null)}>
              {t('Abbrechen')}
            </button>
            <button className="btn primary" disabled={busy || (ask === 'tag' && !value.trim())}>
              {t('Übernehmen')}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

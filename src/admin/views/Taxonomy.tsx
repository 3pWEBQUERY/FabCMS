import { useState } from 'react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { t, tl } from '../lib/i18n';
import { useSession } from '../lib/session';
import { Icon } from '../ui/icons';
import { Dialog, Segmented, Skeleton, confirm } from '../ui/kit';
import { useToast } from '../ui/toast';

interface Value {
  value: string;
  count: number;
  published: number;
}
interface Group {
  key: string;
  label: string;
  type: string;
  values: Value[];
}

/**
 * Categories and tags of a content type: how often each is used, rename it
 * everywhere, merge two (rename into an existing one), remove it.
 */
export function TaxonomyDialog({ collection, name, open, onClose, onChanged }: { collection: string; name: string; open: boolean; onClose: () => void; onChanged: () => void }) {
  const { can } = useSession();
  const toast = useToast();
  const { data, reload } = useApi<{ fields: Group[] }>(open ? `/api/taxonomy/${collection}` : null);
  const [field, setField] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ from: string; to: string } | null>(null);
  const groups = data?.fields ?? [];
  const g = groups.find((x) => x.key === field) ?? groups[0];
  const may = can('content.publish');

  const apply = async (from: string, to: string) => {
    try {
      const r = await api.post<{ count: number }>(`/api/taxonomy/${collection}`, { field: g.key, from, to });
      toast(to ? t('«{from}» heisst jetzt «{to}» – in {n} Einträgen.', { from, to, n: r.count }) : t('«{from}» aus {n} Einträgen entfernt.', { from, n: r.count }));
      setEdit(null);
      void reload();
      onChanged();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  const save = async () => {
    if (!edit) return;
    const to = edit.to.trim();
    if (!to || to === edit.from) return setEdit(null);
    const target = g.values.find((v) => v.value.toLowerCase() === to.toLowerCase() && v.value !== edit.from);
    if (
      target &&
      !(await confirm({
        title: t('Zusammenführen?'),
        message: t('«{to}» gibt es schon. Alle Einträge mit «{from}» kommen dazu.', { from: edit.from, to: target.value }),
        confirm: t('Zusammenführen'),
      }))
    )
      return;
    await apply(edit.from, target?.value ?? to);
  };
  const remove = async (v: Value) => {
    if (
      !(await confirm({
        title: t('«{name}» entfernen?', { name: v.value }),
        message: t('Bei {n} Einträgen fällt sie weg – die Einträge selbst bleiben.', { n: v.count }),
        confirm: t('Entfernen'),
        danger: true,
      }))
    )
      return;
    await apply(v.value, '');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('Kategorien & Schlagwörter: {name}', { name })}
      description={t('Umbenennen gilt überall, auch auf der Website. Benennst du in einen bestehenden Namen um, werden beide zusammengeführt.')}
      wide
    >
      {!data ? (
        <Skeleton lines={4} />
      ) : !g ? (
        <p className="small muted">{t('Dieser Inhaltstyp hat keine Kategorien oder Schlagwörter.')}</p>
      ) : (
        <div className="stack">
          {groups.length > 1 && (
            <Segmented
              label={t('Feld')}
              value={g.key}
              onChange={(k) => {
                setField(k);
                setEdit(null);
              }}
              options={groups.map((x) => ({ value: x.key, label: tl(x.label) }))}
            />
          )}
          {g.values.length === 0 ? (
            <p className="small muted">{t('Noch nichts vergeben. Kategorien und Schlagwörter entstehen beim Bearbeiten der Einträge.')}</p>
          ) : (
            <ul className="tax-list">
              {g.values.map((v) => (
                <li key={v.value}>
                  {edit?.from === v.value ? (
                    <form
                      className="tax-edit"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void save();
                      }}
                    >
                      <input
                        className="input"
                        autoFocus
                        value={edit.to}
                        maxLength={120}
                        onChange={(e) => setEdit({ ...edit, to: e.target.value })}
                        aria-label={t('Neuer Name')}
                        onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setEdit(null))}
                      />
                      <button className="btn primary s">{t('Sichern')}</button>
                      <button type="button" className="btn ghost s" onClick={() => setEdit(null)}>
                        {t('Abbrechen')}
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className="tax-name">{v.value}</span>
                      <span className="xsmall muted">
                        {v.count === 1 ? t('1 Eintrag') : t('{n} Einträge', { n: v.count })}
                        {v.published < v.count && ` · ${t('{n} online', { n: v.published })}`}
                      </span>
                      <span className="grow" />
                      {may && (
                        <>
                          <button className="btn ghost s" onClick={() => setEdit({ from: v.value, to: v.value })}>
                            <Icon name="pen" size="s" /> {t('Umbenennen')}
                          </button>
                          <button className="btn ghost s icon-only" onClick={() => void remove(v)} aria-label={t('«{name}» entfernen', { name: v.value })}>
                            <Icon name="trash" size="s" />
                          </button>
                        </>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Dialog>
  );
}

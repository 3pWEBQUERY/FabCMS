import { useState } from 'react';
import { api } from '../lib/api';
import { entryUrl } from '../lib/actions';
import { formatDate, useApi } from '../lib/hooks';
import { t, tl } from '../lib/i18n';
import { Link, navigate } from '../lib/router';
import { useSession } from '../lib/session';
import { Icon } from '../ui/icons';
import { Empty, PageHead, Select, Skeleton, confirm } from '../ui/kit';
import { useToast } from '../ui/toast';
import type { CollectionDef } from '../../shared/types';

interface Row {
  id: string;
  collection: string;
  title: string;
  slug: string;
  status: string;
  deleted_at: string;
  deleted_by_name: string | null;
}

/** Deleted entries for 30 days: bring back with everything, or remove for good. */
export function Trash() {
  const { can } = useSession();
  const toast = useToast();
  const [col, setCol] = useState('');
  const { data, reload } = useApi<{ entries: Row[] }>(`/api/trash${col ? `?collection=${col}` : ''}`);
  const { data: cols } = useApi<{ collections: CollectionDef[] }>('/api/collections');
  const name = (id: string) => tl(cols?.collections.find((c) => c.id === id)?.singular) || id;
  const rows = data?.entries ?? [];
  const daysLeft = (iso: string) => Math.max(0, 30 - Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

  const restore = async (r: Row) => {
    try {
      const { entry } = await api.post<{ entry: { id: string; slug: string } }>(`/api/trash/${r.id}/restore`, {});
      toast(
        entry.slug !== r.slug
          ? t('«{name}» ist zurück – unter neuer Adresse und als Entwurf, weil die alte inzwischen vergeben ist.', { name: r.title })
          : t('«{name}» ist zurück.', { name: r.title }),
        {
          action: { label: t('Öffnen'), run: () => navigate(entryUrl(r.collection, r.id)) },
        },
      );
      void reload();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  const purge = async (r: Row) => {
    if (
      !(await confirm({
        title: t('«{name}» endgültig löschen?', { name: r.title }),
        message: t('Mit Verlauf, Übersetzungen und Kommentaren. Das lässt sich nicht rückgängig machen.'),
        confirm: t('Endgültig löschen'),
        danger: true,
      }))
    )
      return;
    await api.del(`/api/trash/${r.id}`);
    void reload();
  };
  const empty = async () => {
    if (!(await confirm({ title: t('Papierkorb leeren?'), message: t('Alle {n} Einträge werden endgültig gelöscht.', { n: rows.length }), confirm: t('Leeren'), danger: true })))
      return;
    await api.del('/api/trash');
    toast(t('Papierkorb geleert.'));
    void reload();
  };

  return (
    <div className="page">
      <PageHead
        back={
          <Link to="/inhalte" className="crumb">
            <Icon name="chevronLeft" size="s" /> {t('Inhalte')}
          </Link>
        }
        title={t('Papierkorb')}
        sub={t('Gelöschte Seiten und Einträge bleiben 30 Tage hier – zurückgeholt mit Verlauf, Übersetzungen und Kommentaren.')}
        actions={
          can('content.delete') && rows.length > 0 && !col ? (
            <button className="btn danger" onClick={() => void empty()}>
              <Icon name="trash" size="s" /> {t('Papierkorb leeren')}
            </button>
          ) : null
        }
      />
      <div className="toolbar">
        <Select
          value={col}
          onChange={setCol}
          label={t('Inhaltstyp')}
          inline
          options={[{ value: '', label: t('Alle Inhaltstypen') }, ...(cols?.collections ?? []).map((c) => ({ value: c.id, label: tl(c.name) }))]}
        />
      </div>
      <section className="card">
        {!data ? (
          <Skeleton lines={4} />
        ) : rows.length === 0 ? (
          <Empty title={t('Der Papierkorb ist leer')}>{t('Was du löschst, landet zuerst hier – du kannst es 30 Tage lang zurückholen.')}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Titel')}</th>
                  <th>{t('Inhaltstyp')}</th>
                  <th>{t('Gelöscht')}</th>
                  <th>{t('Noch')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.title || t('Ohne Titel')}</strong>
                      <div className="xsmall muted">/{r.slug}</div>
                    </td>
                    <td>{name(r.collection)}</td>
                    <td>
                      {formatDate(r.deleted_at, true)}
                      {r.deleted_by_name && <div className="xsmall muted">{r.deleted_by_name}</div>}
                    </td>
                    <td className="num">{t('{n} Tage', { n: daysLeft(r.deleted_at) })}</td>
                    <td className="actions-cell">
                      <button className="btn s" onClick={() => void restore(r)}>
                        <Icon name="undo" size="s" /> {t('Zurückholen')}
                      </button>
                      {can('content.delete') && (
                        <button className="btn ghost s icon-only" onClick={() => void purge(r)} aria-label={t('Endgültig löschen')}>
                          <Icon name="trash" size="s" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

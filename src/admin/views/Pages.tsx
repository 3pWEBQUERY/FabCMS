import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useApi, formatDate } from '../lib/hooks';
import { navigate, Link } from '../lib/router';
import { useSession } from '../lib/session';
import { t } from '../lib/i18n';
import { PAGE_PRESETS } from '../lib/presets';
import { Dialog, Empty, Field, Menu, PageHead, Skeleton, StatusBadge, Select } from '../ui/kit';
import { LangBadges } from '../ui/LangSwitch';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/toast';
import { moveToTrash } from '../lib/actions';
import { BulkBar, SelectBox, useSelection } from './Bulk';
import { slugify } from '../../shared/text';
import type { Entry, EntryStatus } from '../../shared/types';

interface Row {
  id: string;
  slug: string;
  status: EntryStatus;
  title: string;
  updated_at: string;
  changed: boolean;
  publish_at: string | null;
  translations?: { lang: string; status: string; changed: boolean }[];
  unpublish_at?: string | null;
}

export function NewPageDialog({ open, onClose, pages }: { open: boolean; onClose: () => void; pages: Row[] }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [parent, setParent] = useState('');
  const [preset, setPreset] = useState('blank');
  const [busy, setBusy] = useState(false);
  const slug = [parent, slugify(title)].filter(Boolean).join('/');
  const create = async () => {
    setBusy(true);
    try {
      const p = PAGE_PRESETS.find((x) => x.id === preset)!;
      const blocks = p.blocks();
      if (blocks[0]?.type === 'hero') blocks[0].props.title = title;
      const { entry } = await api.post<{ entry: Entry }>('/api/entries', { collection: 'pages', data: { title, blocks }, slug });
      navigate(`/seiten/${entry.id}`);
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={t('Neue Seite')}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) void create();
        }}
      >
        <Field label={t('Titel')} htmlFor="np-title" help={title ? t('Adresse: {path}', { path: `/${slug}` }) : t('Die Adresse ergibt sich aus dem Titel.')}>
          <input id="np-title" className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('z. B. Über uns')} />
        </Field>
        <Field label={t('Liegt unter')} htmlFor="np-parent">
          <Select
            id="np-parent"
            value={parent}
            onChange={setParent}
            options={[{ value: '', label: t('– oberste Ebene –') }, ...pages.filter((p) => p.slug).map((p) => ({ value: p.slug, label: `${p.title} (/${p.slug})` }))]}
          />
        </Field>
        <div className="field">
          <span className="field-label">{t('Vorlage')}</span>
          <div className="tiles" style={{ marginTop: 0, gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))' }}>
            {PAGE_PRESETS.map((p) => (
              <button key={p.id} type="button" className="tile" aria-pressed={preset === p.id} onClick={() => setPreset(p.id)} style={{ padding: '0.7rem 0.8rem' }}>
                <strong className="small">{t(p.label)}</strong>
                <span className="xsmall">{t(p.description)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('Abbrechen')}
          </button>
          <button className="btn primary" disabled={!title.trim() || busy}>
            {t('Seite anlegen')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function PagesList() {
  const { can } = useSession();
  const toast = useToast();
  const { data, reload } = useApi<{ entries: Row[] }>('/api/entries?collection=pages&limit=500');
  const [creating, setCreating] = useState(false);
  const rows = useMemo(() => data?.entries ?? [], [data]);
  // The start page can't be deleted or taken offline in bulk; it isn't offered for choosing.
  const selection = useSelection(rows.filter((r) => r.slug !== '').map((r) => r.id));

  const remove = (r: Row) => moveToTrash(r.id, r.title, toast, () => void reload()).catch((e: Error) => toast(e.message, { kind: 'bad' }));
  const duplicate = async (r: Row) => {
    const { entry } = await api.post<{ entry: Entry }>(`/api/entries/${r.id}/duplicate`);
    navigate(`/seiten/${entry.id}`);
  };

  return (
    <div className="page">
      <PageHead
        title={t('Seiten')}
        sub={t('Klick auf eine Seite, um direkt darauf zu schreiben.')}
        actions={
          can('content.edit') && (
            <button className="btn primary" onClick={() => setCreating(true)}>
              <Icon name="plus" size="s" />
              {t('Neue Seite')}
            </button>
          )
        }
      />
      <section className="card">
        {!data ? (
          <Skeleton lines={5} />
        ) : rows.length === 0 ? (
          <Empty
            title={t('Noch keine Seiten')}
            action={
              <button className="btn primary" onClick={() => setCreating(true)}>
                {t('Erste Seite anlegen')}
              </button>
            }
          />
        ) : (
          <ul className="list">
            {rows.map((r) => {
              const depth = r.slug ? r.slug.split('/').length - 1 : 0;
              return (
                <li key={r.id} className={`list-item${selection.has(r.id) ? ' selected' : ''}`} style={{ paddingLeft: `${1.25 + depth * 1.5}rem` }}>
                  {r.slug === '' ? (
                    <span className="row-check-space" />
                  ) : (
                    <SelectBox checked={selection.has(r.id)} onChange={() => selection.toggle(r.id)} label={t('«{name}» auswählen', { name: r.title })} />
                  )}
                  <Icon name={r.slug === '' ? 'home' : 'page'} className="faint" />
                  <Link to={`/seiten/${r.id}`} className="grow" style={{ textDecoration: 'none', minWidth: 0 }}>
                    <div className="title ellipsis">{r.title || t('(ohne Titel)')}</div>
                    <div className="xsmall muted mono ellipsis">/{r.slug}</div>
                  </Link>
                  <span className="xsmall faint hide-m">{formatDate(r.updated_at)}</span>
                  <LangBadges translations={r.translations} />
                  <StatusBadge status={r.status} changed={r.changed} until={r.unpublish_at} />
                  <Menu
                    trigger={
                      <button className="btn ghost icon-only s" aria-label={t('Aktionen für {name}', { name: r.title })}>
                        <Icon name="more" />
                      </button>
                    }
                    items={[
                      { label: t('Bearbeiten'), icon: 'text', onSelect: () => navigate(`/seiten/${r.id}`) },
                      { label: t('Vorschau'), icon: 'eye', onSelect: () => window.open(`/_nova/preview/${r.id}`, '_blank') },
                      { label: t('Duplizieren'), icon: 'copy', onSelect: () => void duplicate(r), hidden: !can('content.edit') },
                      'sep',
                      { label: t('Löschen'), icon: 'trash', danger: true, onSelect: () => void remove(r), hidden: !can('content.delete') || r.slug === '' },
                    ]}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <BulkBar hasCategory={false} selection={selection} categories={[]} onDone={() => void reload()} />
      <NewPageDialog open={creating} onClose={() => setCreating(false)} pages={rows} />
    </div>
  );
}

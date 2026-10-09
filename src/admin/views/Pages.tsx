import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useApi, formatDate } from '../lib/hooks';
import { navigate, Link } from '../lib/router';
import { useSession } from '../lib/session';
import { PAGE_PRESETS } from '../lib/presets';
import { Dialog, Empty, Field, Menu, PageHead, Skeleton, StatusBadge, confirm } from '../ui/kit';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/toast';
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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Neue Seite">
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) void create();
        }}
      >
        <Field label="Titel" htmlFor="np-title" help={title ? `Adresse: /${slug}` : 'Die Adresse ergibt sich aus dem Titel.'}>
          <input id="np-title" className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Über uns" />
        </Field>
        <Field label="Liegt unter" htmlFor="np-parent">
          <select id="np-parent" className="select" value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">– oberste Ebene –</option>
            {pages
              .filter((p) => p.slug)
              .map((p) => (
                <option key={p.id} value={p.slug}>
                  {p.title} (/{p.slug})
                </option>
              ))}
          </select>
        </Field>
        <div className="field">
          <span className="field-label">Vorlage</span>
          <div className="tiles" style={{ marginTop: 0, gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))' }}>
            {PAGE_PRESETS.map((p) => (
              <button key={p.id} type="button" className="tile" aria-pressed={preset === p.id} onClick={() => setPreset(p.id)} style={{ padding: '0.7rem 0.8rem' }}>
                <strong className="small">{p.label}</strong>
                <span className="xsmall">{p.description}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" disabled={!title.trim() || busy}>
            Seite anlegen
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

  const remove = async (r: Row) => {
    if (!(await confirm({ title: `«${r.title}» löschen?`, message: 'Die Seite und ihr Verlauf werden entfernt. Das lässt sich nicht rückgängig machen – ausser über eine Sicherung.', confirm: 'Löschen', danger: true }))) return;
    try {
      await api.del(`/api/entries/${r.id}`);
      toast('Seite gelöscht.');
      void reload();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  const duplicate = async (r: Row) => {
    const { entry } = await api.post<{ entry: Entry }>(`/api/entries/${r.id}/duplicate`);
    navigate(`/seiten/${entry.id}`);
  };

  return (
    <div className="page">
      <PageHead
        title="Seiten"
        sub="Klick auf eine Seite, um direkt darauf zu schreiben."
        actions={
          can('content.edit') && (
            <button className="btn primary" onClick={() => setCreating(true)}>
              <Icon name="plus" size="s" />
              Neue Seite
            </button>
          )
        }
      />
      <section className="card">
        {!data ? (
          <Skeleton lines={5} />
        ) : rows.length === 0 ? (
          <Empty title="Noch keine Seiten" action={<button className="btn primary" onClick={() => setCreating(true)}>Erste Seite anlegen</button>} />
        ) : (
          <ul className="list">
            {rows.map((r) => {
              const depth = r.slug ? r.slug.split('/').length - 1 : 0;
              return (
                <li key={r.id} className="list-item" style={{ paddingLeft: `${1.25 + depth * 1.5}rem` }}>
                  <Icon name={r.slug === '' ? 'home' : 'page'} className="faint" />
                  <Link to={`/seiten/${r.id}`} className="grow" style={{ textDecoration: 'none', minWidth: 0 }}>
                    <div className="title ellipsis">{r.title || '(ohne Titel)'}</div>
                    <div className="xsmall muted mono ellipsis">/{r.slug}</div>
                  </Link>
                  <span className="xsmall faint hide-m">{formatDate(r.updated_at)}</span>
                  <StatusBadge status={r.status} changed={r.changed} />
                  <Menu
                    trigger={
                      <button className="btn ghost icon-only s" aria-label={`Aktionen für ${r.title}`}>
                        <Icon name="more" />
                      </button>
                    }
                    items={[
                      { label: 'Bearbeiten', icon: 'text', onSelect: () => navigate(`/seiten/${r.id}`) },
                      { label: 'Vorschau', icon: 'eye', onSelect: () => window.open(`/_nova/preview/${r.id}`, '_blank') },
                      { label: 'Duplizieren', icon: 'copy', onSelect: () => void duplicate(r), hidden: !can('content.edit') },
                      'sep',
                      { label: 'Löschen', icon: 'trash', danger: true, onSelect: () => void remove(r), hidden: !can('content.delete') || r.slug === '' },
                    ]}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <NewPageDialog open={creating} onClose={() => setCreating(false)} pages={rows} />
    </div>
  );
}

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { LoadingFrame, RouteLoading } from '../ui/loading';
import { api } from '../lib/api';
import { useApi, useHotkey, modKey } from '../lib/hooks';
import { Link, navigate } from '../lib/router';
import { useSession } from '../lib/session';
import { useEntryDoc } from '../lib/useEntryDoc';
import { Field, PageHead, Skeleton, StatusBadge, confirm, Tip } from '../ui/kit';
import { FieldList } from '../ui/FieldInput';
import { Icon } from '../ui/icons';
import { PublishControls, SaveStatus } from '../ui/Publish';
import { useToast } from '../ui/toast';
import { validateFields } from '../../shared/fields';
import type { CollectionDef } from '../../shared/types';

const Editor = lazy(() => import('../editor/Editor').then((m) => ({ default: m.Editor })));

/** Collections with a block canvas open in the editor, the others as a form with live preview. */
export function EntryRoute({ collection, id, onOpenPalette }: { collection: string; id: string; onOpenPalette: () => void }) {
  const { data } = useApi<{ collections: CollectionDef[] }>('/api/collections');
  const col = data?.collections.find((c) => c.id === collection);
  if (!col) return <div className="page">{data ? 'Diesen Inhaltstyp gibt es nicht.' : <Skeleton />}</div>;
  if (col.has_blocks)
    return (
      <Suspense fallback={<RouteLoading />}>
        <Editor id={id} onOpenPalette={onOpenPalette} />
      </Suspense>
    );
  return <EntryForm id={id} />;
}

function EntryForm({ id }: { id: string }) {
  const doc = useEntryDoc(id);
  const { can, pro } = useSession();
  const toast = useToast();
  const [previewKey, setPreviewKey] = useState(0);
  const [touched, setTouched] = useState(false);
  const iframe = useRef<HTMLIFrameElement>(null);
  useHotkey('mod+z', (e) => {
    if ((e.target as HTMLElement).closest('input, textarea, [contenteditable]')) return;
    e.preventDefault();
    doc.undo();
  });
  useHotkey('mod+shift+z', (e) => {
    e.preventDefault();
    doc.redo();
  });

  // Refresh the preview a moment after each successful save.
  useEffect(() => {
    if (doc.saveState === 'saved') setPreviewKey((k) => k + 1);
  }, [doc.saveState, doc.entry?.version]);

  if (doc.error && !doc.entry) return <div className="page">{doc.error}</div>;
  if (!doc.data || !doc.collection || !doc.entry) return <div className="page"><Skeleton lines={6} /></div>;
  const col = doc.collection;
  const errors = touched ? Object.fromEntries(validateFields(col.fields, doc.data).map((e) => [e.path, e.message])) : {};
  const hasPreview = Boolean(col.route) || col.id === 'dishes';
  const previewUrl = col.route ? `/_nova/preview/${id}?v=${previewKey}` : `/karte?v=${previewKey}`;

  const remove = async () => {
    if (!(await confirm({ title: `«${doc.data!.title}» löschen?`, confirm: 'Löschen', danger: true }))) return;
    await api.del(`/api/entries/${id}`);
    navigate(`/inhalte/${col.id}`);
  };
  const withdraw = async () => {
    if (
      !(await confirm({
        title: 'Einwilligung widerrufen',
        message: 'Das Profil und alle zugehörigen Bilder werden sofort und endgültig gelöscht – auch aus dem Verlauf. Das lässt sich nicht rückgängig machen.',
        confirm: 'Profil und Bilder löschen',
        danger: true,
      }))
    )
      return;
    const r = await api.post<{ removedMedia: number }>(`/api/entries/${id}/withdraw`);
    toast(`Profil gelöscht, ${r.removedMedia} Dateien entfernt.`);
    navigate('/inhalte/profiles');
  };

  return (
    <div className="page wide">
      <PageHead
        back={
          <Link to={`/inhalte/${col.id}`} className="crumb">
            <Icon name="chevronLeft" size="s" /> {col.name}
          </Link>
        }
        title={doc.data.title || '(ohne Titel)'}
        actions={
          <>
            <SaveStatus state={doc.saveState} error={doc.error} onRetry={() => (doc.saveState === 'conflict' ? void doc.reload() : void doc.saveNow())} />
            <Tip label="Rückgängig" keys={`${modKey} Z`}>
              <button className="btn ghost icon-only" onClick={doc.undo} disabled={!doc.canUndo} aria-label="Rückgängig">
                <Icon name="undo" />
              </button>
            </Tip>
            <StatusBadge status={doc.entry.status} />
            <PublishControls doc={doc} />
          </>
        }
      />
      {doc.blockers.length > 0 && (
        <div className="hint" style={{ marginBottom: '1rem', background: 'var(--edited-soft)' }} role="note">
          <Icon name="info" />
          <span>Bevor es online gehen kann: {doc.blockers.join(' ')}</span>
        </div>
      )}
      <div className={hasPreview ? 'preview-split' : ''}>
        <div className="card">
          <div className="form-section" onBlur={() => setTouched(true)}>
            <FieldList
              fields={col.fields}
              values={doc.data}
              errors={errors}
              onChange={(k, v) => {
                if (k === 'stock' || k === 'variants') doc.markStockTouched();
                doc.setData((d) => ({ ...d, [k]: v, ...(k === col.title_field ? { title: String(v ?? '') } : {}) }));
              }}
            />
          </div>
          {col.route && (
            <div className="form-section">
              <Field label="Adresse" htmlFor="slug" help={doc.path ? `${location.origin}${doc.path} – eine Änderung leitet die alte Adresse automatisch weiter.` : undefined} keyName={pro ? 'slug' : undefined}>
                <div className="input-affix">
                  <span>{col.route.replace(':slug', '')}</span>
                  <input id="slug" className="input mono" value={doc.slug} onChange={(e) => doc.setSlug(e.target.value)} />
                </div>
              </Field>
              <Field label="Beschreibung für Google" htmlFor="seo-d" help="Leer lassen, dann erzeugt Nova sie aus dem Inhalt.">
                <textarea id="seo-d" className="textarea" style={{ minHeight: '4rem' }} value={doc.data.seo?.description ?? ''} onChange={(e) => doc.setData((d) => ({ ...d, seo: { ...d.seo, description: e.target.value } }))} />
              </Field>
            </div>
          )}
          <div className="form-section row wrap">
            {col.id === 'profiles' && can('content.delete') && (
              <button className="btn danger" onClick={withdraw}>
                <Icon name="shield" size="s" /> Einwilligung widerrufen
              </button>
            )}
            {can('content.delete') && (
              <button className="btn ghost danger" onClick={remove}>
                <Icon name="trash" size="s" /> Löschen
              </button>
            )}
          </div>
        </div>
        {hasPreview && (
          <div className="live-preview">
            <header>
              <Icon name="eye" size="s" />
              <span className="grow">{col.route ? 'Vorschau (Entwurf)' : 'Karte – zeigt veröffentlichte Gerichte'}</span>
              <a className="btn ghost s icon-only" href={col.route ? `/_nova/preview/${id}` : '/karte'} target="_blank" rel="noreferrer" aria-label="In neuem Tab öffnen">
                <Icon name="external" size="s" />
              </a>
            </header>
            <LoadingFrame frameRef={iframe} title="Vorschau" src={previewUrl} />
          </div>
        )}
      </div>
    </div>
  );
}

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { LoadingFrame, RouteLoading } from '../ui/loading';
import { api } from '../lib/api';
import { useApi, useHotkey, modKey } from '../lib/hooks';
import { Link, navigate, usePath } from '../lib/router';
import { useSession } from '../lib/session';
import { t, tl, tm } from '../lib/i18n';
import { useEntryDoc } from '../lib/useEntryDoc';
import { Field, PageHead, Skeleton, StatusBadge, confirm, Tip } from '../ui/kit';
import { FieldList } from '../ui/FieldInput';
import { AiTranslate } from '../ui/Ai';
import { Icon } from '../ui/icons';
import { PublishControls, SaveStatus } from '../ui/Publish';
import { useToast } from '../ui/toast';
import { moveToTrash } from '../lib/actions';
import { validateFields } from '../../shared/fields';
import { isTranslatable } from '../../shared/i18n';
import { LangSwitch, TranslationNote, useEditLang } from '../ui/LangSwitch';
import { CommentsPanel, useComments } from '../editor/Comments';
import { Presence } from '../ui/Presence';
import type { CollectionDef } from '../../shared/types';

const Editor = lazy(() => import('../editor/Editor').then((m) => ({ default: m.Editor })));

/** Collections with a block canvas open in the editor, the others as a form with live preview. */
export function EntryRoute({ collection, id, onOpenPalette }: { collection: string; id: string; onOpenPalette: () => void }) {
  const { data } = useApi<{ collections: CollectionDef[] }>('/api/collections');
  const col = data?.collections.find((c) => c.id === collection);
  if (!col) return <div className="page">{data ? t('Diesen Inhaltstyp gibt es nicht.') : <Skeleton />}</div>;
  if (col.has_blocks)
    return (
      <Suspense fallback={<RouteLoading />}>
        <Editor id={id} onOpenPalette={onOpenPalette} />
      </Suspense>
    );
  return <EntryFormLang id={id} />;
}

function EntryFormLang({ id }: { id: string }) {
  const lang = useEditLang();
  return <EntryForm key={lang ?? ''} id={id} lang={lang} />;
}

function EntryForm({ id, lang }: { id: string; lang: string | null }) {
  const doc = useEntryDoc(id, lang);
  const comments = useComments(lang ? null : id);
  const focusComment = usePath().query.get('kommentar');
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
  if (!doc.data || !doc.collection || !doc.entry)
    return (
      <div className="page">
        <Skeleton lines={6} />
      </div>
    );
  const col = doc.collection;
  const errors = touched ? Object.fromEntries(validateFields(col.fields, doc.data).map((e) => [e.path, tm(e.message)])) : {};
  const hasPreview = Boolean(col.route) || col.id === 'dishes';
  const lq = lang ? `lang=${lang}&` : '';
  const previewUrl = col.route ? `/_nova/preview/${id}?${lq}v=${previewKey}` : `${lang ? `/${lang}` : ''}/karte?v=${previewKey}`;

  const remove = () => moveToTrash(id, doc.data!.title, toast, () => navigate(`/inhalte/${col.id}`)).catch((e: Error) => toast(e.message, { kind: 'bad' }));
  const withdraw = async () => {
    if (
      !(await confirm({
        title: t('Einwilligung widerrufen'),
        message: t('Das Profil und alle zugehörigen Bilder werden sofort und endgültig gelöscht – auch aus dem Verlauf. Das lässt sich nicht rückgängig machen.'),
        confirm: t('Profil und Bilder löschen'),
        danger: true,
      }))
    )
      return;
    const r = await api.post<{ removedMedia: number }>(`/api/entries/${id}/withdraw`);
    toast(r.removedMedia === 1 ? t('Profil gelöscht, 1 Datei entfernt.') : t('Profil gelöscht, {n} Dateien entfernt.', { n: r.removedMedia }));
    navigate('/inhalte/profiles');
  };

  return (
    <div className="page wide">
      <PageHead
        back={
          <Link to={`/inhalte/${col.id}`} className="crumb">
            <Icon name="chevronLeft" size="s" /> {tl(col.name)}
          </Link>
        }
        title={doc.data.title || t('(ohne Titel)')}
        actions={
          <>
            <SaveStatus state={doc.saveState} error={doc.error} onRetry={() => (doc.saveState === 'conflict' ? void doc.reload() : void doc.saveNow())} />
            <Tip label={t('Rückgängig')} keys={`${modKey} Z`}>
              <button className="btn ghost icon-only" onClick={doc.undo} disabled={!doc.canUndo} aria-label={t('Rückgängig')}>
                <Icon name="undo" />
              </button>
            </Tip>
            <Presence peers={doc.peers} link={doc.link} local={doc.local} />
            <StatusBadge status={doc.entry.status} />
            <LangSwitch doc={doc} />
            <PublishControls doc={doc} />
          </>
        }
      />
      <TranslationNote doc={doc} action={<AiTranslate doc={doc} />} />
      {doc.blockers.length > 0 && (
        <div className="hint" style={{ marginBottom: '1rem', background: 'var(--edited-soft)' }} role="note">
          <Icon name="info" />
          <span>{t('Bevor es online gehen kann: {list}', { list: doc.blockers.map(tm).join(' ') })}</span>
        </div>
      )}
      <div className={hasPreview ? 'preview-split' : ''}>
        <div className="card">
          <div className="form-section" onBlur={() => setTouched(true)}>
            <FieldList
              fields={col.fields}
              values={doc.data}
              errors={errors}
              locked={lang ? (f) => (isTranslatable(f) ? null : t('Gilt für alle Sprachen – im Original ändern.')) : undefined}
              onChange={(k, v) => {
                if (k === 'stock' || k === 'variants') doc.markStockTouched();
                doc.setData((d) => ({ ...d, [k]: v, ...(k === col.title_field ? { title: String(v ?? '') } : {}) }));
              }}
            />
          </div>
          {col.route && (
            <div className="form-section">
              <Field
                label={t('Adresse')}
                htmlFor="slug"
                help={doc.path ? t('{url} – eine Änderung leitet die alte Adresse automatisch weiter.', { url: `${location.origin}${doc.path}` }) : undefined}
                keyName={pro ? 'slug' : undefined}
              >
                <div className="input-affix">
                  <span>
                    {lang ? `/${lang}` : ''}
                    {col.route.replace(':slug', '')}
                  </span>
                  <input id="slug" className="input mono" value={doc.slug} onChange={(e) => doc.setSlug(e.target.value)} />
                </div>
              </Field>
              <Field label={t('Beschreibung für Google')} htmlFor="seo-d" help={t('Leer lassen, dann erzeugt Nova sie aus dem Inhalt.')}>
                <textarea
                  id="seo-d"
                  className="textarea"
                  style={{ minHeight: '4rem' }}
                  value={doc.data.seo?.description ?? ''}
                  onChange={(e) => doc.setData((d) => ({ ...d, seo: { ...d.seo, description: e.target.value } }))}
                />
              </Field>
            </div>
          )}
          <div className="form-section row wrap">
            {!lang && col.id === 'profiles' && can('content.delete') && (
              <button className="btn danger" onClick={withdraw}>
                <Icon name="shield" size="s" /> {t('Einwilligung widerrufen')}
              </button>
            )}
            {!lang && can('content.delete') && (
              <button className="btn ghost danger" onClick={remove}>
                <Icon name="trash" size="s" /> {t('Löschen')}
              </button>
            )}
          </div>
        </div>
        {hasPreview && (
          <div className="live-preview">
            <header>
              <Icon name="eye" size="s" />
              <span className="grow">{col.route ? t('Vorschau (Entwurf)') : t('Karte – zeigt veröffentlichte Gerichte')}</span>
              <a
                className="btn ghost s icon-only"
                href={col.route ? `/_nova/preview/${id}${lang ? `?lang=${lang}` : ''}` : `${lang ? `/${lang}` : ''}/karte`}
                target="_blank"
                rel="noreferrer"
                aria-label={t('In neuem Tab öffnen')}
              >
                <Icon name="external" size="s" />
              </a>
            </header>
            <LoadingFrame frameRef={iframe} title={t('Vorschau')} src={previewUrl} />
          </div>
        )}
      </div>
      {!lang && (
        <section className="card form-section entry-comments" style={{ marginTop: '1.5rem', maxWidth: '48rem' }} id="kommentare">
          <header>
            <h2>{t('Kommentare')}</h2>
          </header>
          <CommentsPanel entryId={id} data={comments} blocks={[]} selectedBlock={null} focus={focusComment} />
        </section>
      )}
    </div>
  );
}

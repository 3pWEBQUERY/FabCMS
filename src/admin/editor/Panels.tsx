import { Reorder } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useApi, formatDate } from '../lib/hooks';
import { useSession } from '../lib/session';
import { adminLang, t, tl, tm } from '../lib/i18n';
import { navigate } from '../lib/router';
import { getMedia } from '../ui/MediaPicker';
import { Field, Segmented, Toggle, confirm } from '../ui/kit';
import { FieldList, MediaField } from '../ui/FieldInput';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/toast';
import { analyzeSeo, fullTitle, type SeoCheck } from '../../shared/seo-analyze';
import { blocksImages, blocksText, BLOCK_MAP } from '../../shared/blocks';
import { excerpt, relativeTime } from '../../shared/text';
import type { Block, CollectionDef, EntryData } from '../../shared/types';
import type { EntryDoc } from '../lib/useEntryDoc';
import { countEls, type El } from '../../shared/elements';
import { LayersTree } from './elements/LayersTree';
import { useComponentTexts } from './elements/Components';
import { GlobalContrast } from './design/contrast';
import type { ContrastIssue } from '../../shared/contrast';

/* ---------- SEO coach ---------- */

export function SeoPanel({ doc, onTarget }: { doc: EntryDoc; onTarget: (c: SeoCheck) => void }) {
  const { settings } = useSession();
  const data = doc.data!;
  const col = doc.collection!;
  const [alts, setAlts] = useState<Record<string, string>>({});
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const imageIds = useMemo(() => {
    const ids = blocksImages(data.blocks).map((i) => i.media);
    if (typeof data.cover === 'string') ids.push(data.cover);
    return [...new Set(ids)];
  }, [data.blocks, data.cover]);
  useEffect(() => {
    let alive = true;
    void Promise.all(imageIds.map((id) => getMedia(id))).then((list) => {
      if (!alive) return;
      setAlts(Object.fromEntries(list.filter(Boolean).map((m) => [m!.id, m!.alt])));
    });
    return () => {
      alive = false;
    };
  }, [imageIds]);

  const componentText = useComponentTexts(data.blocks);
  const isHome = col.id === 'pages' && doc.slug === '';
  const result = analyzeSeo({
    title: data.title,
    slug: doc.slug,
    isHome,
    ownH1: col.id !== 'pages' && col.id !== 'sections',
    seo: data.seo ?? {},
    blocks: data.blocks ?? [],
    extraText: [data.excerpt, data.summary, componentText].filter((x) => typeof x === 'string').join(' '),
    siteName: settings?.name ?? '',
    titleTemplate: settings?.seo.titleTemplate ?? '%s · %site',
    alts,
  });
  const title = fullTitle({ title: data.title, seo: data.seo ?? {}, isHome, siteName: settings?.name ?? '', titleTemplate: settings?.seo.titleTemplate ?? '' });
  const description = data.seo?.description || (typeof data.excerpt === 'string' && data.excerpt) || excerpt([blocksText(data.blocks), componentText].join(' ').trim()) || settings?.seo.defaultDescription || '';
  const base = (settings?.baseUrl || location.origin).replace(/^https?:\/\//, '');
  const setSeo = (patch: Record<string, unknown>) => doc.setData((d) => ({ ...d, seo: { ...d.seo, ...patch } }));

  return (
    <div className="stack">
      <div className="row between">
        <span className={`traffic ${result.status}`} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="small muted">
          {result.status === 'good' ? t('Gut gemacht.') : result.status === 'warn' ? t('Fast – ein paar Punkte.') : t('Hier fehlt noch etwas Wichtiges.')}
        </span>
      </div>
      <div className="stack tight">
        <div className="row between">
          <span className="section-title">{t('So erscheint die Seite bei Google')}</span>
          <Segmented
            label={t('Gerät')}
            value={device}
            onChange={setDevice}
            options={[
              { value: 'desktop', label: '', icon: 'desktop', title: t('Computer') },
              { value: 'mobile', label: '', icon: 'phone', title: t('Handy') },
            ]}
          />
        </div>
        <div className={`serp ${device === 'mobile' ? 'mobile' : ''}`}>
          <div className="u">
            {base}
            {doc.path && doc.path !== '/' ? ` › ${doc.path.slice(1).split('/').join(' › ')}` : ''}
          </div>
          <div className="t">{title.length > (device === 'mobile' ? 70 : 62) ? `${title.slice(0, device === 'mobile' ? 68 : 60)} …` : title}</div>
          <div className="d">{description.length > 158 ? `${description.slice(0, 155)} …` : description || t('Noch keine Beschreibung.')}</div>
        </div>
      </div>
      <Field label={t('Fokus-Keyword')} help={t('Der Begriff, unter dem man diese Seite finden soll.')} htmlFor="seo-kw">
        <input id="seo-kw" className="input" value={data.seo?.keyword ?? ''} onChange={(e) => setSeo({ keyword: e.target.value })} placeholder={t('z. B. Restaurant Uster')} />
      </Field>
      <div className="stack tight">
        {result.checks.map((c) => (
          <button key={c.id} type="button" className="seo-check" onClick={() => onTarget(c)} disabled={!c.target}>
            <span className={`dot ${c.status === 'good' ? 'ok' : c.status === 'warn' ? 'edited' : 'bad'}`} />
            <strong>{tm(c.label)}</strong>
            <p>
              {tm(c.message)}
              {c.target && c.status !== 'good' && <span style={{ color: 'var(--sel)', fontWeight: 600 }}> {t('Zur Stelle →')}</span>}
            </p>
          </button>
        ))}
      </div>
      <hr className="divider" />
      <Field
        label={t('Seitentitel für Google')}
        htmlFor="seo-title"
        help={t('Leer = «{title}»', { title: fullTitle({ title: data.title, seo: {}, isHome, siteName: settings?.name ?? '', titleTemplate: settings?.seo.titleTemplate ?? '' }) })}
      >
        <input id="seo-title" className="input" value={data.seo?.title ?? ''} onChange={(e) => setSeo({ title: e.target.value })} />
      </Field>
      <Field label={t('Beschreibung')} htmlFor="seo-desc" help={t('{n} / 155 Zeichen. Leer = automatisch aus dem Text.', { n: (data.seo?.description ?? '').length })}>
        <textarea id="seo-desc" className="textarea" value={data.seo?.description ?? ''} onChange={(e) => setSeo({ description: e.target.value })} />
      </Field>
      <Field label={t('Bild für Social Media')} help={t('Leer = Nova erzeugt eines mit dem Titel in deinen Farben.')}>
        <MediaField value={data.seo?.image ?? null} type="image" onChange={(v) => setSeo({ image: v ?? undefined })} />
      </Field>
      <Toggle
        checked={Boolean(data.seo?.noindex)}
        onChange={(v) => setSeo({ noindex: v })}
        label={t('Nicht bei Google anzeigen')}
        help={t('Für interne oder vorläufige Seiten.')}
      />
    </div>
  );
}

/* ---------- page settings (title, address, collection fields) ---------- */

export function PagePanel({ doc }: { doc: EntryDoc }) {
  const { pro, settings } = useSession();
  const data = doc.data!;
  // Members-only choices need the module; a password works always.
  const members = settings?.modules.includes('members') ?? false;
  const col = {
    ...doc.collection!,
    fields: doc.collection!.fields.map((f) => (f.key === 'access' && !members ? { ...f, options: f.options?.filter((o) => o.value === 'public' || o.value === 'password') } : f)),
  };
  const isHome = col.id === 'pages' && doc.slug === '';
  const prefix = col.id === 'pages' ? '/' : (col.route ?? '').replace(':slug', '');
  return (
    <div className="stack">
      {col.id === 'pages' ? (
        <>
          <Field label={t('Titel der Seite')} htmlFor="pg-title" help={t('Erscheint in Menüs, Brotkrümeln und als Standard-Titel bei Google.')}>
            <input id="pg-title" className="input" value={data.title} onChange={(e) => doc.setData((d) => ({ ...d, title: e.target.value }))} />
          </Field>
          <FieldList fields={col.fields.filter((f) => f.key === 'access' || f.key === 'page_password')} values={data} onChange={(k, v) => doc.setData((d) => ({ ...d, [k]: v }))} />
          {Boolean(col.custom_fields?.length) && <FieldList fields={col.custom_fields!} values={data} onChange={(k, v) => doc.setData((d) => ({ ...d, [k]: v }))} />}
        </>
      ) : (
        <FieldList fields={col.fields} values={data} onChange={(k, v) => doc.setData((d) => ({ ...d, [k]: v, ...(k === col.title_field ? { title: String(v ?? '') } : {}) }))} />
      )}
      {!isHome && col.route !== null && (
        <Field label={t('Adresse')} htmlFor="pg-slug" keyName={pro ? 'slug' : undefined} help={t('Ändern ist sicher: Die alte Adresse leitet Nova automatisch weiter.')}>
          <div className="input-affix">
            <span>{prefix}</span>
            <input id="pg-slug" className="input mono" value={doc.slug} onChange={(e) => doc.setSlug(e.target.value)} />
          </div>
        </Field>
      )}
      {doc.path && (
        <a className="btn" href={doc.path} target="_blank" rel="noreferrer" style={{ justifySelf: 'start' }}>
          <Icon name="external" size="s" /> {t('Live-Seite öffnen')}
        </a>
      )}
      {col.id === 'sections' && data.kind === 'popup' && doc.entry && <PopupStats id={doc.entry.id} />}
    </div>
  );
}

/** How a pop-up did over the last 30 days. */
function PopupStats({ id }: { id: string }) {
  const { data } = useApi<{ shown: number; clicked: number; closed: number }>(`/api/popups/${id}/stats`);
  if (!data) return null;
  const rate = data.shown ? Math.round((data.clicked / data.shown) * 100) : 0;
  return (
    <section className="stack tight" aria-labelledby="pop-stats-h">
      <h3 id="pop-stats-h" className="section-title">
        {t('Wirkung in den letzten 30 Tagen')}
      </h3>
      {data.shown ? (
        <div className="kpis compact">
          <div className="kpi">
            <span className="label">{t('Gezeigt')}</span>
            <span className="value">{data.shown.toLocaleString(adminLang())}</span>
          </div>
          <div className="kpi">
            <span className="label">{t('Geklickt')}</span>
            <span className="value">{data.clicked.toLocaleString(adminLang())}</span>
            <span className="delta">{t('{n} %', { n: rate })}</span>
          </div>
          <div className="kpi">
            <span className="label">{t('Geschlossen')}</span>
            <span className="value">{data.closed.toLocaleString(adminLang())}</span>
            <span className="delta">{t('ohne Klick')}</span>
          </div>
        </div>
      ) : (
        <p className="small muted">{t('Noch nicht gezeigt. Gezählt wird, sobald das Pop-up veröffentlicht ist – ohne Cookie und ohne Angaben zu den Besuchern.')}</p>
      )}
    </section>
  );
}

/* ---------- structure (layers) ---------- */

export interface LayerActions {
  selectedEl: string | null;
  onSelectEl: (blockId: string, elId: string) => void;
  onHoverEl: (elId: string | null) => void;
  onMoveEl: (blockId: string, elId: string, parent: string | null, index: number) => void;
}

export function StructurePanel({
  blocks,
  selected,
  onSelect,
  onReorder,
  layers,
}: {
  blocks: Block[];
  selected: string | null;
  onSelect: (id: string) => void;
  onReorder: (b: Block[]) => void;
  layers: LayerActions;
}) {
  const { pro } = useSession();
  // Free layouts show their elements; the selected one is open from the start.
  const [open, setOpen] = useState<Set<string>>(() => new Set(selected ? [selected] : []));
  useEffect(() => {
    if (selected) setOpen((s) => (s.has(selected) ? s : new Set(s).add(selected)));
  }, [selected]);
  return (
    <Reorder.Group axis="y" values={blocks} onReorder={onReorder} style={{ padding: 0, margin: 0, display: 'grid', gap: 4 }}>
      {blocks.map((b, i) => {
        const def = BLOCK_MAP[b.type];
        const text = def?.text?.(b.props) ?? '';
        const locked = !pro && b.lock && b.lock !== 'none';
        const els = b.type === 'layout' ? ((b.props.els as El[] | undefined) ?? []) : null;
        const isOpen = Boolean(els?.length) && open.has(b.id);
        return (
          <Reorder.Item key={b.id} value={b} drag={locked ? false : 'y'} style={{ listStyle: 'none' }} whileDrag={{ scale: 1.02, boxShadow: 'var(--shadow-3)', zIndex: 4 }}>
            <div className="layer-block">
              <button
                type="button"
                className="rev"
                aria-pressed={selected === b.id && !layers.selectedEl}
                onClick={() => onSelect(b.id)}
                style={{ gridTemplateColumns: 'auto 1fr auto' }}
              >
                <Icon name={def?.icon ?? 'page'} className="faint" />
                <span style={{ minWidth: 0 }}>
                  <span className="small" style={{ fontWeight: 600, display: 'block' }}>
                    {i + 1}. {def ? tl(def.label) : b.type}
                  </span>
                  <span className="xsmall muted ellipsis" style={{ display: 'block' }}>
                    {excerpt(text, 60) || '–'}
                  </span>
                </span>
                {locked ? <Icon name="lock" size="s" className="faint" /> : <Icon name="grip" size="s" className="faint" />}
              </button>
              {Boolean(els?.length) && (
                <button
                  type="button"
                  className="layer-toggle"
                  aria-expanded={isOpen}
                  aria-label={isOpen ? t('Elemente ausblenden') : t('Elemente zeigen')}
                  onClick={() =>
                    setOpen((s) => {
                      const n = new Set(s);
                      if (n.has(b.id)) n.delete(b.id);
                      else n.add(b.id);
                      return n;
                    })
                  }
                >
                  <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size="s" />
                  {t('{n} Elemente', { n: countEls(els!) })}
                </button>
              )}
              {isOpen && (
                <LayersTree
                  els={els!}
                  selected={selected === b.id ? layers.selectedEl : null}
                  onSelect={(id) => layers.onSelectEl(b.id, id)}
                  onHover={layers.onHoverEl}
                  onMove={(id, parent, index) => layers.onMoveEl(b.id, id, parent, index)}
                  locked={Boolean(locked)}
                />
              )}
            </div>
          </Reorder.Item>
        );
      })}
    </Reorder.Group>
  );
}

/* ---------- history with comparison ---------- */

interface Rev {
  id: number;
  kind: 'autosave' | 'publish' | 'restore' | 'import' | 'replace';
  created_at: string;
  user_name: string | null;
}

const kindLabel = (k: Rev['kind']): string =>
  ({ autosave: t('Zwischenstand'), publish: t('Veröffentlicht'), restore: t('Wiederhergestellt'), import: t('Erzeugt'), replace: t('Vor «Suchen und Ersetzen»') })[k];

function diffBlocks(before: Block[] = [], after: Block[] = []) {
  const out: { kind: 'add' | 'del' | 'chg'; label: string; text: string }[] = [];
  const a = new Map(before.map((b) => [b.id, b]));
  const bmap = new Map(after.map((b) => [b.id, b]));
  for (const b of after) {
    const prev = a.get(b.id);
    const label = BLOCK_MAP[b.type] ? tl(BLOCK_MAP[b.type].label) : b.type;
    const text = excerpt(BLOCK_MAP[b.type]?.text?.(b.props) ?? '', 90);
    if (!prev) out.push({ kind: 'add', label, text });
    else if (JSON.stringify(prev) !== JSON.stringify(b)) out.push({ kind: 'chg', label, text });
  }
  for (const b of before)
    if (!bmap.has(b.id)) out.push({ kind: 'del', label: BLOCK_MAP[b.type] ? tl(BLOCK_MAP[b.type].label) : b.type, text: excerpt(BLOCK_MAP[b.type]?.text?.(b.props) ?? '', 90) });
  return out;
}

function diffFields(before: EntryData, after: EntryData, col: CollectionDef) {
  return col.fields.filter((f) => JSON.stringify(before[f.key] ?? null) !== JSON.stringify(after[f.key] ?? null)).map((f) => tl(f.label));
}

export function HistoryPanel({ doc, onRestored }: { doc: EntryDoc; onRestored: () => void }) {
  const toast = useToast();
  const { data, reload } = useApi<{ revisions: Rev[] }>(`/api/entries/${doc.entry!.id}/revisions`);
  const [sel, setSel] = useState<number | null>(null);
  const [rev, setRev] = useState<EntryData | null>(null);
  useEffect(() => {
    if (sel === null) return setRev(null);
    void api.get<{ revision: { data: EntryData } }>(`/api/revisions/${sel}`).then((r) => setRev(r.revision.data));
  }, [sel]);
  useEffect(() => {
    if (doc.saveState === 'saved') void reload();
  }, [doc.entry?.version, doc.saveState, reload]);

  const restore = async () => {
    if (!sel) return;
    if (!(await confirm({ title: t('Diese Fassung wiederherstellen?'), message: t('Der aktuelle Stand bleibt im Verlauf erhalten.'), confirm: t('Wiederherstellen') }))) return;
    try {
      await api.post(`/api/entries/${doc.entry!.id}/restore`, { revisionId: sel });
      await doc.reload();
      onRestored();
      setSel(null);
      toast(t('Fassung wiederhergestellt.'));
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };

  const changes = rev && doc.data ? diffBlocks(rev.blocks, doc.data.blocks) : [];
  const fieldChanges = rev && doc.data ? diffFields(rev, doc.data, doc.collection!) : [];
  return (
    <div className="stack">
      <p className="small muted">{t('Nova sichert alle paar Minuten einen Zwischenstand und jede Veröffentlichung. Wähl eine Fassung, um die Unterschiede zu sehen.')}</p>
      <div className="stack tight" style={{ gap: 2 }}>
        {data?.revisions.map((r) => (
          <button key={r.id} type="button" className="rev" aria-pressed={sel === r.id} onClick={() => setSel(sel === r.id ? null : r.id)}>
            <span className={`dot ${r.kind === 'publish' ? 'ok' : r.kind === 'restore' ? 'sel' : ''}`} />
            <span>
              <span className="small" style={{ fontWeight: 600 }}>
                {kindLabel(r.kind)}
              </span>
              <span className="xsmall muted" style={{ display: 'block' }}>
                {formatDate(r.created_at, true)} · {r.user_name ?? t('System')}
              </span>
            </span>
            <span className="xsmall faint">{relativeTime(r.created_at, new Date(), adminLang())}</span>
          </button>
        ))}
      </div>
      {rev && (
        <div className="card card-pad stack tight" style={{ boxShadow: 'var(--shadow-2)' }}>
          <strong className="small">{t('Seit dieser Fassung geändert')}</strong>
          {changes.length === 0 && fieldChanges.length === 0 && <p className="small muted">{t('Keine Unterschiede.')}</p>}
          {fieldChanges.length > 0 && <div className="diff-row diff-chg">{t('Felder: {list}', { list: fieldChanges.join(', ') })}</div>}
          {changes.map((c, i) => (
            <div key={i} className={`diff-row diff-${c.kind}`}>
              <strong>
                {c.kind === 'add'
                  ? t('Neu: {label}', { label: c.label })
                  : c.kind === 'del'
                    ? t('Entfernt: {label}', { label: c.label })
                    : t('Geändert: {label}', { label: c.label })}
              </strong>
              {c.text && <div className="xsmall muted">{c.text}</div>}
            </div>
          ))}
          <button className="btn primary" onClick={restore} style={{ justifySelf: 'start', marginTop: '0.5rem' }}>
            <Icon name="history" size="s" /> {t('Diese Fassung wiederherstellen')}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- header & footer ---------- */

export function GlobalPanel({ which, contrast }: { which: 'header' | 'footer'; contrast: ContrastIssue[] }) {
  const { settings } = useSession();
  return (
    <div className="stack">
      <GlobalContrast issues={contrast} />
      <p className="small muted">
        {which === 'header' ? t('Kopfzeile und Menü sind auf allen Seiten gleich.') : t('Die Fusszeile ist auf allen Seiten gleich.')} {t('Änderungen wirken überall.')}
      </p>
      {which === 'header' ? (
        <ul className="small" style={{ margin: 0, paddingLeft: '1.1rem' }}>
          {settings?.nav.map((n) => (
            <li key={n.id}>
              {n.label} <span className="faint mono">{n.href}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small">{settings?.footer.text || t('Noch kein Text in der Fusszeile.')}</p>
      )}
      <button className="btn primary" style={{ justifySelf: 'start' }} onClick={() => navigate('/einstellungen/navigation')}>
        {which === 'header' ? t('Menü bearbeiten') : t('Fusszeile bearbeiten')}
      </button>
      {which === 'header' && (
        <button className="btn" style={{ justifySelf: 'start' }} onClick={() => navigate('/einstellungen/website')}>
          {t('Name & Logo ändern')}
        </button>
      )}
    </div>
  );
}

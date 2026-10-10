import { Reorder, useDragControls } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { api, qs } from '../lib/api';
import { useApi, useDebounced, formatDate } from '../lib/hooks';
import { Link, navigate, usePath } from '../lib/router';
import { useSession } from '../lib/session';
import { t, tl } from '../lib/i18n';
import { createAndOpen, entryUrl, moveToTrash } from '../lib/actions';
import { BulkBar, SelectBox, useSelection } from './Bulk';
import { TaxonomyDialog } from './Taxonomy';
import { DataGrid } from './DataGrid';
import { Empty, PageHead, Segmented, Skeleton, StatusBadge, Switch, Menu, Dialog, Select } from '../ui/kit';
import { LangBadges } from '../ui/LangSwitch';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/toast';
import { formatPrice, shortId } from '../../shared/text';
import { templateStarter } from '../../shared/elements';
import type { CollectionDef, EntryStatus } from '../../shared/types';
import type { FieldDef } from '../../shared/fields';

type Col = CollectionDef & { active: boolean; count: number; review: number };

export interface Row {
  id: string;
  slug: string;
  status: EntryStatus;
  title: string;
  fields: Record<string, unknown>;
  updated_at: string;
  changed: boolean;
  author_name: string | null;
  author_id?: string | null;
  sort_index: number;
  translations?: { lang: string; status: string; changed: boolean }[];
  unpublish_at?: string | null;
}

export function ContentHub() {
  const { can, settings } = useSession();
  const { data } = useApi<{ collections: Col[] }>('/api/collections');
  const { data: counts } = useApi<{ counts: Record<string, number> }>('/api/dashboard');
  const mods = settings?.modules ?? [];
  const cols = (data?.collections ?? []).filter((c) => c.active && c.id !== 'pages');
  const extra = [
    {
      to: '/kalender',
      icon: 'calendar',
      name: t('Redaktionskalender'),
      sub: t('Erschienen, geplant, läuft ab – nach Tagen'),
      show: can('content.edit') || can('content.edit.own'),
    },
    { to: '/ersetzen', icon: 'search', name: t('Suchen und Ersetzen'), sub: t('Text auf allen Seiten auf einmal ändern'), show: can('content.edit') },
    { to: '/medien', icon: 'image', name: t('Mediathek'), sub: t('Bilder, Videos, Dokumente'), show: can('media.upload') },
    { to: '/formulare', icon: 'form', name: t('Formulare'), sub: t('Felder und Einträge'), show: can('forms.manage'), n: counts?.counts.unread },
    { to: '/kontakte', icon: 'people', name: t('Kontakte'), sub: t('Anfragen als Pipeline'), show: can('leads.view') && mods.includes('leads'), n: counts?.counts.new_leads },
    { to: '/kueche', icon: 'dish', name: t('Küche'), sub: t('Take-away und Lieferung, live'), show: can('orders.manage') && mods.includes('ordering') },
    {
      to: '/reservationen',
      icon: 'calendar',
      name: t('Reservationen'),
      sub: t('Tagesplan, Anfragen, Telefonbuchungen'),
      show: can('bookings.manage') && mods.includes('booking'),
      n: counts?.counts.pending_bookings,
    },
    { to: '/newsletter', icon: 'mail', name: t('Newsletter'), sub: t('Ausgaben, Abonnent:innen, Wochenrückblick'), show: can('newsletter.manage') && mods.includes('newsletter') },
    { to: '/mitglieder', icon: 'key', name: t('Mitglieder'), sub: t('Konten, Mitgliedschaft, geschützte Inhalte'), show: can('members.manage') && mods.includes('members') },
    {
      to: '/tickets',
      icon: 'ticket',
      name: t('Tickets & Anmeldungen'),
      sub: t('Verkauf, Teilnehmerlisten, Einlass'),
      show: can('events.manage') && (mods.includes('events') || mods.includes('courses')),
    },
    { to: '/spenden', icon: 'star', name: t('Spenden'), sub: t('Eingänge, Kampagnen, Bestätigungen'), show: can('donations.manage') && mods.includes('donations') },
    { to: '/bestellungen', icon: 'receipt', name: t('Bestellungen'), sub: t('Shop-Bestellungen'), show: can('orders.view') && mods.includes('shop'), n: counts?.counts.to_ship },
    { to: '/gutscheine', icon: 'ticket', name: t('Gutscheine'), sub: t('Rabattcodes'), show: can('orders.manage') && mods.includes('shop') },
    { to: '/kommentare', icon: 'chat', name: t('Kommentare'), sub: t('Moderation'), show: can('comments.moderate') && mods.includes('blog'), n: counts?.counts.comments },
    { to: '/papierkorb', icon: 'trash', name: t('Papierkorb'), sub: t('Gelöschtes 30 Tage zurückholen'), show: can('content.delete') || can('content.edit.own'), n: counts?.counts.trash },
  ].filter((x) => x.show);
  return (
    <div className="page">
      <PageHead title={t('Inhalte')} sub={t('Alles, was nicht eine einzelne Seite ist: Beiträge, Produkte, Gerichte, Formulare und mehr.')} />
      {!data ? (
        <Skeleton lines={5} />
      ) : (
        <div className="stack loose">
          <section className="card">
            <ul className="list">
              {cols.map((c) => (
                <li key={c.id}>
                  <Link to={`/inhalte/${c.id}`} className="list-item">
                    <Icon name={c.icon} className="faint" />
                    <div className="grow">
                      <div className="title">{tl(c.name)}</div>
                      <div className="xsmall muted">{c.count === 0 ? t('noch leer') : `${c.count} ${tl(c.count === 1 ? c.singular : c.name)}`}</div>
                    </div>
                    {c.review > 0 && <span className="badge sel">{t('{n} zur Freigabe', { n: c.review })}</span>}
                    <Icon name="chevronRight" size="s" className="faint" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section className="card">
            <ul className="list">
              {extra.map((x) => (
                <li key={x.to}>
                  <Link to={x.to} className="list-item">
                    <Icon name={x.icon} className="faint" />
                    <div className="grow">
                      <div className="title">{x.name}</div>
                      <div className="xsmall muted">{x.sub}</div>
                    </div>
                    {Boolean(x.n) && <span className="count">{x.n}</span>}
                    <Icon name="chevronRight" size="s" className="faint" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

/** Up to three informative columns, chosen from the field types. */
function columnsFor(c: CollectionDef): FieldDef[] {
  const pick = c.fields.filter((f) => (f.key !== c.title_field && ['money', 'select', 'date', 'number', 'boolean'].includes(f.type)) || f.key === 'category');
  return pick.filter((f) => !['weight', 'comparePrice', 'digital', 'allowComments', 'consentAdult', 'consentPublish', 'soldOut', 'daily'].includes(f.key)).slice(0, 3);
}

function cell(f: FieldDef, v: unknown) {
  if (v === null || v === undefined || v === '') return <span className="faint">–</span>;
  switch (f.type) {
    case 'money':
      return <span className="num">{formatPrice(v as number)}</span>;
    case 'date':
      return formatDate(v as string);
    case 'boolean':
      return v ? t('Ja') : t('Nein');
    case 'select':
      return tl(f.options?.find((o) => o.value === v)?.label) || String(v);
    default:
      return String(v);
  }
}

function SortRow({ row, col, onOpen }: { row: Row; col: CollectionDef; onOpen: () => void }) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={row}
      dragListener={false}
      dragControls={controls}
      className="list-item"
      style={{ listStyle: 'none' }}
      whileDrag={{ scale: 1.01, boxShadow: 'var(--shadow-3)', zIndex: 5 }}
    >
      <span className="grip" onPointerDown={(e) => controls.start(e)} aria-label={t('Ziehen zum Sortieren')} role="button">
        <Icon name="grip" />
      </span>
      <button className="grow" style={{ border: 0, background: 'none', textAlign: 'left', cursor: 'pointer', padding: 0, minWidth: 0 }} onClick={onOpen}>
        <div className="title ellipsis">{row.title || t('(ohne Titel)')}</div>
        <div className="xsmall muted ellipsis">
          {columnsFor(col)
            .map((f) =>
              row.fields[f.key] !== undefined && row.fields[f.key] !== null && row.fields[f.key] !== ''
                ? `${tl(f.label)}: ${f.type === 'money' ? formatPrice(row.fields[f.key] as number) : String(row.fields[f.key])}`
                : null,
            )
            .filter(Boolean)
            .join(' · ')}
        </div>
      </button>
      <StatusBadge status={row.status} changed={row.changed} />
    </Reorder.Item>
  );
}

export function CollectionList({ collection }: { collection: string }) {
  const { can, pro } = useSession();
  const toast = useToast();
  const { query } = usePath();
  const { data: cols } = useApi<{ collections: Col[] }>('/api/collections');
  const col = cols?.collections.find((c) => c.id === collection);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(query.get('status') ?? '');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [view, setView] = useState<'table' | 'order' | 'data'>(() => {
    try {
      return pro && localStorage.getItem('nova.listview') === 'data' ? 'data' : 'table';
    } catch {
      return 'table';
    }
  });
  const [apiOpen, setApiOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  const dq = useDebounced(q, 200);
  const { data, setData, reload } = useApi<{ entries: Row[]; total: number }>(`/api/entries${qs({ collection, q: dq, status, limit: 500 })}`);
  const [ordered, setOrdered] = useState<Row[]>([]);
  useEffect(() => setOrdered(data?.entries ?? []), [data]);

  const rows = useMemo(() => {
    const list = [...(data?.entries ?? [])];
    if (sort)
      list.sort((a, b) => {
        const av = sort.key === 'title' ? a.title : sort.key === 'updated' ? a.updated_at : a.fields[sort.key];
        const bv = sort.key === 'title' ? b.title : sort.key === 'updated' ? b.updated_at : b.fields[sort.key];
        return (String(av ?? '') < String(bv ?? '') ? -1 : String(av ?? '') > String(bv ?? '') ? 1 : 0) * sort.dir;
      });
    return list;
  }, [data, sort]);
  const selection = useSelection(rows.map((r) => r.id));
  const categories = useMemo(() => [...new Set((data?.entries ?? []).map((r) => r.fields.category).filter((c): c is string => typeof c === 'string' && c !== ''))].sort(), [data]);

  if (!col) return <div className="page">{cols ? <Empty title={t('Diesen Inhaltstyp gibt es nicht.')} /> : <Skeleton />}</div>;
  if (collection === 'dishes') return <MenuBoard col={col} />;

  const columns = columnsFor(col);
  const sortable = col.sort?.field === 'sort';
  const th = (key: string, label: string) => (
    <th>
      <button onClick={() => setSort((s) => (s?.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))}>
        {label}
        {sort?.key === key && <Icon name={sort.dir === 1 ? 'arrowUp' : 'arrowDown'} size="s" />}
      </button>
    </th>
  );
  const saveOrder = async (next: Row[]) => {
    setOrdered(next);
    try {
      await api.post('/api/entries/reorder', { ids: next.map((r) => r.id) });
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  /** The page template of this type: opens the one there is, or starts one bound to its fields. */
  const openTemplate = async () => {
    try {
      const list = await api.get<{ entries: { id: string; fields?: { kind?: string; template_for?: string } }[] }>('/api/entries?collection=sections&limit=500');
      const found = list.entries.find((x) => x.fields?.kind === 'template' && x.fields.template_for === collection);
      if (found) return navigate(entryUrl('sections', found.id));
      const els = templateStarter(col);
      const full = els.length === 1 && els[0].kind === 'entrybody';
      const r = await api.post<{ entry: { id: string } }>('/api/entries', {
        collection: 'sections',
        data: {
          title: t('Vorlage für {name}', { name: tl(col.name) }),
          kind: 'template',
          template_for: collection,
          blocks: [{ id: shortId(8), type: 'layout', props: { width: full ? 'full' : 'content', els }, style: {} }],
        },
      });
      navigate(entryUrl('sections', r.entry.id));
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  const remove = (r: Row) => moveToTrash(r.id, r.title, toast, () => void reload()).catch((e: Error) => toast(e.message, { kind: 'bad' }));

  return (
    <div className="page">
      <PageHead
        back={
          <Link to="/inhalte" className="crumb">
            <Icon name="chevronLeft" size="s" /> {t('Inhalte')}
          </Link>
        }
        title={tl(col.name)}
        actions={
          <>
            {pro && (
              <button className="btn" onClick={() => setApiOpen(true)}>
                <Icon name="code" size="s" /> API
              </button>
            )}
            {col.fields.some((f) => f.key === 'category' || f.type === 'tags') && (
              <button className="btn" onClick={() => setTaxOpen(true)}>
                <Icon name="tag" size="s" /> {t('Kategorien')}
              </button>
            )}
            {col.route && can('content.edit') && (
              <button className="btn" onClick={() => void openTemplate()} title={t('So sehen die Seiten aller Einträge aus – frei gestaltet, mit ihren Feldern verbunden.')}>
                <Icon name="layout" size="s" /> {t('Seitenvorlage')}
              </button>
            )}
            {(can('content.edit') || (collection === 'posts' && can('content.edit.own'))) && (
              <button className="btn primary" onClick={() => void createAndOpen(collection).catch((e) => toast(e.message, { kind: 'bad' }))}>
                <Icon name="plus" size="s" />
                {t('{name} anlegen', { name: tl(col.singular) })}
              </button>
            )}
          </>
        }
      />
      <div className="toolbar">
        <div className="search">
          <Icon name="search" />
          <input className="input" placeholder={t('{name} durchsuchen', { name: tl(col.name) })} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select
          inline
          label={t('Status')}
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: t('Alle') },
            { value: 'published', label: t('Online') },
            { value: 'draft', label: t('Entwürfe') },
            { value: 'review', label: t('Zur Freigabe') },
            { value: 'scheduled', label: t('Geplant') },
          ]}
        />
        {(sortable || pro) && (
          <Segmented
            label={t('Ansicht')}
            value={view === 'data' && !pro ? 'table' : view}
            onChange={(v) => {
              setView(v);
              try {
                localStorage.setItem('nova.listview', v);
              } catch {
                /* only a preference */
              }
            }}
            options={[
              { value: 'table' as const, label: t('Liste'), icon: 'nav' },
              ...(pro ? [{ value: 'data' as const, label: t('Daten'), icon: 'table' }] : []),
              ...(sortable ? [{ value: 'order' as const, label: t('Reihenfolge'), icon: 'grip' }] : []),
            ]}
          />
        )}
      </div>
      <section className="card">
        {!data ? (
          <Skeleton lines={5} />
        ) : rows.length === 0 ? (
          <Empty
            title={q || status ? t('Nichts gefunden') : t('Noch keine {name}', { name: tl(col.name) })}
            action={
              !q &&
              !status && (
                <button className="btn primary" onClick={() => void createAndOpen(collection)}>
                  {t('{name} anlegen', { name: tl(col.singular) })}
                </button>
              )
            }
          >
            {!q && !status ? tl(col.empty_hint) : t('Versuch einen anderen Suchbegriff oder Filter.')}
          </Empty>
        ) : view === 'data' && pro ? (
          <DataGrid
            col={col}
            rows={rows}
            selection={selection}
            onImported={() => void reload()}
            onRow={(row) => setData((d) => (d ? { ...d, entries: d.entries.map((x) => (x.id === row.id ? row : x)) } : d))}
          />
        ) : view === 'order' && sortable ? (
          <Reorder.Group axis="y" values={ordered} onReorder={saveOrder} className="list">
            {ordered.map((r) => (
              <SortRow key={r.id} row={r} col={col} onOpen={() => navigate(entryUrl(collection, r.id))} />
            ))}
          </Reorder.Group>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="check-cell">
                    <SelectBox checked={selection.all} mixed={selection.some} onChange={selection.setAll} label={t('Alle auswählen')} />
                  </th>
                  {th('title', tl(col.fields.find((f) => f.key === col.title_field)?.label) || t('Titel'))}
                  {columns.map((f) => th(f.key, tl(f.label)))}
                  <th>{t('Status')}</th>
                  {th('updated', t('Geändert'))}
                  <th aria-label={t('Aktionen')} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`clickable${selection.has(r.id) ? ' selected' : ''}`} onClick={() => navigate(entryUrl(collection, r.id))}>
                    <td className="check-cell" onClick={(e) => e.stopPropagation()}>
                      <SelectBox checked={selection.has(r.id)} onChange={() => selection.toggle(r.id)} label={t('«{name}» auswählen', { name: r.title })} />
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      <Link to={entryUrl(collection, r.id)} onClick={(e) => e.stopPropagation()} style={{ textDecoration: 'none' }}>
                        {r.title || '(ohne Titel)'}
                      </Link>
                    </td>
                    {columns.map((f) => (
                      <td key={f.key}>{cell(f, r.fields[f.key])}</td>
                    ))}
                    <td>
                      <LangBadges translations={r.translations} />
                      <StatusBadge status={r.status} changed={r.changed} until={r.unpublish_at} />
                    </td>
                    <td className="muted">{formatDate(r.updated_at)}</td>
                    <td className="right" onClick={(e) => e.stopPropagation()}>
                      <Menu
                        trigger={
                          <button className="btn ghost s icon-only" aria-label={t('Aktionen')}>
                            <Icon name="more" />
                          </button>
                        }
                        items={[
                          { label: t('Duplizieren'), icon: 'copy', onSelect: () => void api.post(`/api/entries/${r.id}/duplicate`).then(reload) },
                          { label: t('Löschen'), icon: 'trash', danger: true, onSelect: () => void remove(r), hidden: !can('content.delete') },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <TaxonomyDialog collection={collection} name={tl(col.name)} open={taxOpen} onClose={() => setTaxOpen(false)} onChanged={() => void reload()} />
      <BulkBar hasCategory={col.fields.some((f) => f.key === 'category')} selection={selection} categories={categories} onDone={() => void reload()} />
      <Dialog
        open={apiOpen}
        onOpenChange={setApiOpen}
        title={t('{name} über die API', { name: tl(col.name) })}
        description={t('Veröffentlichte Inhalte sind ohne Token lesbar. Für Entwürfe und Änderungen brauchst du ein Token (Einstellungen → API & Webhooks).')}
        wide
      >
        <div className="stack">
          <pre className="code-out">{`GET ${location.origin}/api/v1/${collection}?limit=20&sort=-published_at${columns[0] ? `&filter[${columns[0].key}]=…` : ''}
GET ${location.origin}/api/v1/${collection}/{slug}

POST ${location.origin}/api/v1/${collection}
Authorization: Bearer nova_…
{ "data": { "title": "…" }, "publish": true }`}</pre>
          <ApiPreview url={`/api/v1/${collection}?limit=2`} />
        </div>
      </Dialog>
    </div>
  );
}

function ApiPreview({ url }: { url: string }) {
  const [out, setOut] = useState('…');
  useEffect(() => {
    fetch(url)
      .then((r) => r.json())
      .then((j) => setOut(JSON.stringify(j, null, 2)))
      .catch((e) => setOut(String(e)));
  }, [url]);
  return <pre className="code-out">{out}</pre>;
}

/* ---------- Speisekarte: grouped, quick toggles, phone-friendly ---------- */

function MenuBoard({ col }: { col: Col }) {
  const toast = useToast();
  const { settings } = useSession();
  const { data, reload } = useApi<{ entries: Row[] }>('/api/entries?collection=dishes&limit=500');
  const [qr, setQr] = useState(false);
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of data?.entries ?? []) {
      const c = String(r.fields.category || '');
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(r);
    }
    return [...m];
  }, [data]);

  const toggle = async (r: Row, key: 'daily' | 'soldOut', value: boolean) => {
    try {
      const full = await api.get<{ entry: { data: Record<string, unknown>; version: number } }>(`/api/entries/${r.id}`);
      await api.put(`/api/entries/${r.id}`, { data: { ...full.entry.data, [key]: value }, baseVersion: full.entry.version });
      if (r.status === 'published') await api.post(`/api/entries/${r.id}/publish`);
      toast(
        key === 'daily'
          ? value
            ? t('«{name}» ist auf der Tageskarte.', { name: r.title })
            : t('«{name}» ist nicht mehr auf der Tageskarte.', { name: r.title })
          : value
            ? t('«{name}» als ausverkauft markiert.', { name: r.title })
            : t('«{name}» ist wieder da.', { name: r.title }),
      );
      void reload();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  const base = settings?.baseUrl || location.origin;

  return (
    <div className="page">
      <PageHead
        back={
          <Link to="/inhalte" className="crumb">
            <Icon name="chevronLeft" size="s" /> {t('Inhalte')}
          </Link>
        }
        title={t('Speisekarte')}
        sub={t('Tageskarte und «ausverkauft» schaltest du hier mit einem Tipp – auch vom Handy. Änderungen sind sofort online.')}
        actions={
          <>
            <a className="btn" href="/karte/druck" target="_blank" rel="noreferrer">
              <Icon name="download" size="s" /> {t('Druckversion / PDF')}
            </a>
            <button className="btn" onClick={() => setQr(true)}>
              <Icon name="qr" size="s" /> {t('QR-Code für Tische')}
            </button>
            <button className="btn primary" onClick={() => void createAndOpen('dishes')}>
              <Icon name="plus" size="s" /> {t('Gericht')}
            </button>
          </>
        }
      />
      {!data ? (
        <Skeleton lines={6} />
      ) : !data.entries.length ? (
        <section className="card">
          <Empty
            title={t('Füge dein erstes Gericht hinzu')}
            example={
              <>
                <strong>Älplermagronen mit Apfelmus</strong> · {t('Hauptgang')} · 26.–
                <br />
                {t('Allergene: Gluten, Milch, Ei · vegetarisch')}
              </>
            }
            action={
              <button
                className="btn primary"
                onClick={() =>
                  void createAndOpen('dishes', {
                    title: 'Älplermagronen mit Apfelmus',
                    category: 'Hauptgänge',
                    prices: [{ label: '', price: 2600 }],
                    allergens: ['gluten', 'milk', 'eggs'],
                    tags: ['vegetarian'],
                  })
                }
              >
                {t('Beispiel übernehmen')}
              </button>
            }
          >
            {tl(col.empty_hint)}
          </Empty>
        </section>
      ) : (
        <div className="stack loose">
          {groups.map(([cat, rows]) => (
            <section key={cat} className="card">
              <div className="card-head">
                <h2>{cat || t('Ohne Kategorie')}</h2>
                <span className="xsmall muted">{t('Tageskarte · Ausverkauft')}</span>
              </div>
              <ul className="list">
                {rows.map((r) => (
                  <li key={r.id} className="list-item">
                    <Link to={entryUrl('dishes', r.id)} className="grow" style={{ textDecoration: 'none', minWidth: 0 }}>
                      <div className="title ellipsis" style={{ textDecoration: r.fields.soldOut ? 'line-through' : undefined }}>
                        {r.title}
                      </div>
                      <div className="xsmall muted num">
                        {((r.fields.prices as { label?: string; price: number }[]) ?? []).map((p) => `${p.label ? `${p.label} ` : ''}${formatPrice(p.price)}`).join(' · ')}
                        {r.status !== 'published' && ` · ${t('Entwurf')}`}
                      </div>
                    </Link>
                    <Switch label={t('{name} auf der Tageskarte', { name: r.title })} checked={Boolean(r.fields.daily)} onChange={(v) => void toggle(r, 'daily', v)} />
                    <Switch label={t('{name} ausverkauft', { name: r.title })} checked={Boolean(r.fields.soldOut)} onChange={(v) => void toggle(r, 'soldOut', v)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <Dialog open={qr} onOpenChange={setQr} title={t('QR-Code für die Tische')} description={t('Drucken und auf die Tische stellen. Er führt direkt zur Karte.')}>
        <div className="stack" style={{ justifyItems: 'center' }}>
          <img className="qr" src={`/api/qr?url=${encodeURIComponent(`${base}/karte`)}`} alt={t('QR-Code zu {url}', { url: `${base}/karte` })} />
          <span className="mono small">{base.replace(/^https?:\/\//, '')}/karte</span>
          <a className="btn" href={`/api/qr?url=${encodeURIComponent(`${base}/karte`)}&download=1`} download="karte-qr.svg">
            <Icon name="download" size="s" /> {t('Als SVG herunterladen')}
          </a>
        </div>
      </Dialog>
    </div>
  );
}

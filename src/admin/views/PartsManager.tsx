import { useState } from 'react';
import { t, tl } from '../lib/i18n';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { navigate } from '../lib/router';
import { entryUrl } from '../lib/actions';
import { Icon } from '../ui/icons';
import { Menu, PageHead, Segmented, Skeleton, confirm } from '../ui/kit';
import { useToast } from '../ui/toast';
import { TemplateThumb } from '../editor/BlockPicker';
import { PART_STARTERS } from '../../shared/elements';
import { pickPart, partRuleText, type HeaderMode, type ShowOn } from '../../shared/global-parts';
import { shortId } from '../../shared/text';
import type { Entry } from '../../shared/types';

type Kind = 'header' | 'footer';
interface Row {
  id: string;
  title: string;
  status: string;
  changed?: boolean;
  updated_at: string;
  fields: { kind?: string; show_on?: string; show_paths?: string; header_mode?: string };
}

const MODE_LABEL: Record<HeaderMode, string> = {
  inherit: 'Wie in den Einstellungen',
  static: 'Scrollt mit der Seite weg',
  sticky: 'Bleibt oben',
  over: 'Durchsichtig über dem ersten Bereich',
  'over-sticky': 'Durchsichtig, beim Scrollen dunkel hinterlegt',
};

/** Where one applies, in words: «Ganze Website», «Nur: /shop, /blog/*». */
function ruleText(r: Row['fields']) {
  const { kind, paths } = partRuleText(r);
  return kind === 'all' ? t('Ganze Website') : `${kind === 'only' ? t('Nur auf') : t('Ausser auf')} ${paths.join(', ')}`;
}

/**
 * «Kopf- & Fusszeilen» – like JetEngine's theme parts: own headers and
 * footers designed in the free layout, each for the whole website or for
 * certain pages; where none fits, the style's own shows.
 */
export function PartsManager() {
  const toast = useToast();
  const { data, reload } = useApi<{ entries: Row[] }>('/api/entries?collection=sections&limit=500');
  const [rules, setRules] = useState<{ id: string; show_on: ShowOn; show_paths: string; header_mode: HeaderMode } | null>(null);
  const [probe, setProbe] = useState('/');
  if (!data) return <Skeleton />;
  const of = (kind: Kind) => data.entries.filter((x) => x.fields.kind === kind).sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const create = async (starterId: string) => {
    const s = PART_STARTERS.find((x) => x.id === starterId)!;
    try {
      const r = await api.post<{ entry: { id: string } }>('/api/entries', {
        collection: 'sections',
        data: {
          title: `${s.kind === 'header' ? t('Kopfzeile') : t('Fusszeile')} – ${tl(s.label)}`,
          kind: s.kind,
          show_on: 'all',
          ...(s.kind === 'header' ? { header_mode: s.mode ?? 'inherit' } : {}),
          blocks: [{ id: shortId(8), type: 'layout', props: { width: 'content', els: s.els() }, style: { spacing: s.kind === 'header' ? 'none' : 's' } }],
        },
      });
      navigate(entryUrl('sections', r.entry.id));
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  const duplicate = async (row: Row) => {
    const { entry } = await api.get<{ entry: Entry }>(`/api/entries/${row.id}`);
    await api.post('/api/entries', { collection: 'sections', data: { ...entry.data, title: t('{name} (Kopie)', { name: entry.data.title }) } });
    toast(t('Kopie angelegt – als Entwurf, bis du sie veröffentlichst.'));
    void reload();
  };
  const remove = async (row: Row) => {
    if (
      !(await confirm({
        title: t('«{name}» löschen?', { name: row.title }),
        message: t('Wo sie galt, zeigt die Website danach die nächstpassende – oder die des Stils. Im Papierkorb bleibt sie 30 Tage.'),
        confirm: t('Löschen'),
        danger: true,
      }))
    )
      return;
    await api.del(`/api/entries/${row.id}`);
    void reload();
  };
  /** New rules: saved, and live at once where the part is live without other unpublished changes. */
  const saveRules = async () => {
    if (!rules) return;
    const row = data.entries.find((x) => x.id === rules.id)!;
    try {
      const { entry } = await api.get<{ entry: Entry }>(`/api/entries/${rules.id}`);
      const patch = { show_on: rules.show_on, show_paths: rules.show_paths, ...(row.fields.kind === 'header' ? { header_mode: rules.header_mode } : {}) };
      await api.put(`/api/entries/${rules.id}`, { data: { ...entry.data, ...patch }, baseVersion: entry.version });
      if (row.status === 'published' && !row.changed) {
        await api.post(`/api/entries/${rules.id}/publish`, {});
        toast(t('Gespeichert – gilt sofort auf der Website.'));
      } else toast(t('Gespeichert. Auf der Website gilt es, sobald du sie im Editor veröffentlichst.'));
      setRules(null);
      void reload();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };

  const live = (kind: Kind) => of(kind).filter((x) => x.status === 'published');
  const shown = (kind: Kind) =>
    pickPart(
      live(kind).map((x) => ({ ...x.fields, id: x.id, title: x.title })),
      probe.trim() || '/',
    );

  const column = (kind: Kind) => {
    const rows = of(kind);
    const starters = PART_STARTERS.filter((x) => x.kind === kind);
    return (
      <section className="parts-col">
        <header className="row" style={{ gap: '0.5rem' }}>
          <h2 className="ds-title grow">{kind === 'header' ? t('Kopfzeilen') : t('Fusszeilen')}</h2>
          <Menu
            trigger={
              <button className="btn primary s">
                <Icon name="plus" size="s" /> {kind === 'header' ? t('Neue Kopfzeile') : t('Neue Fusszeile')}
              </button>
            }
            items={[
              { heading: t('Womit beginnen?') },
              ...starters.map((s) => ({ label: `${tl(s.label)} – ${tl(s.description)}`, icon: 'layout', onSelect: () => void create(s.id) })),
            ]}
          />
        </header>
        <ul className="parts-list">
          {rows.map((row) => {
            const open = rules?.id === row.id;
            return (
              <li key={row.id} className={`parts-card${open ? ' open' : ''}`}>
                <button type="button" className="parts-thumb" onClick={() => navigate(entryUrl('sections', row.id))} aria-label={t('«{name}» bearbeiten', { name: row.title })}>
                  <TemplateThumb id={row.id} />
                </button>
                <div className="parts-info">
                  <strong className="ellipsis">{row.title}</strong>
                  <span className="row" style={{ gap: '0.35rem', flexWrap: 'wrap' }}>
                    <span className={`badge ${row.status === 'published' ? 'ok' : ''}`}>
                      {row.status === 'published' ? (row.changed ? t('Live, mit Änderungen') : t('Live')) : t('Entwurf')}
                    </span>
                    <span className="xsmall muted">{ruleText(row.fields)}</span>
                  </span>
                  {kind === 'header' && <span className="xsmall faint">{t(MODE_LABEL[(row.fields.header_mode as HeaderMode) ?? 'inherit'] ?? MODE_LABEL.inherit)}</span>}
                </div>
                <div className="row" style={{ gap: '0.35rem' }}>
                  <button className="btn s" onClick={() => navigate(entryUrl('sections', row.id))}>
                    <Icon name="pen" size="s" /> {t('Gestalten')}
                  </button>
                  <button
                    className="btn s ghost"
                    aria-expanded={open}
                    onClick={() =>
                      setRules(
                        open
                          ? null
                          : {
                              id: row.id,
                              show_on: (row.fields.show_on as ShowOn) ?? 'all',
                              show_paths: row.fields.show_paths ?? '',
                              header_mode: (row.fields.header_mode as HeaderMode) ?? 'inherit',
                            },
                      )
                    }
                  >
                    <Icon name="filter" size="s" /> {t('Wo zeigen?')}
                  </button>
                  <Menu
                    trigger={
                      <button className="btn s ghost icon-only" aria-label={t('Mehr zu «{name}»', { name: row.title })}>
                        <Icon name="more" size="s" />
                      </button>
                    }
                    items={[
                      { label: t('Duplizieren'), icon: 'copy', onSelect: () => void duplicate(row) },
                      'sep',
                      { label: t('Löschen'), icon: 'trash', danger: true, onSelect: () => void remove(row) },
                    ]}
                  />
                </div>
                {open && rules && (
                  <div className="parts-rules">
                    <Segmented
                      label={t('Zeigen auf')}
                      value={rules.show_on}
                      onChange={(v) => setRules({ ...rules, show_on: v })}
                      options={[
                        { value: 'all', label: t('Ganze Website') },
                        { value: 'only', label: t('Nur auf …') },
                        { value: 'except', label: t('Ausser auf …') },
                      ]}
                    />
                    {rules.show_on !== 'all' && (
                      <label className="font-field">
                        <span className="xsmall muted">{t('Eine Adresse pro Zeile, z. B. /shop oder /blog/* für alles darunter.')}</span>
                        <textarea className="textarea mono" rows={3} value={rules.show_paths} onChange={(e) => setRules({ ...rules, show_paths: e.target.value })} />
                      </label>
                    )}
                    {kind === 'header' && (
                      <label className="font-field">
                        <span className="xsmall muted">{t('Verhalten beim Scrollen')}</span>
                        <select className="input" value={rules.header_mode} onChange={(e) => setRules({ ...rules, header_mode: e.target.value as HeaderMode })}>
                          {(Object.keys(MODE_LABEL) as HeaderMode[]).map((m) => (
                            <option key={m} value={m}>
                              {t(MODE_LABEL[m])}
                            </option>
                          ))}
                        </select>
                        {rules.header_mode.startsWith('over') && (
                          <span className="xsmall muted">
                            {t('Passt zu Seiten, die mit einem grossen Bild beginnen: Die Kopfzeile liegt darüber, der Inhalt beginnt ganz oben – ohne die Brotkrumen des Stils.')}
                          </span>
                        )}
                      </label>
                    )}
                    <div className="row" style={{ gap: '0.4rem' }}>
                      <button className="btn s primary" onClick={() => void saveRules()}>
                        {t('Übernehmen')}
                      </button>
                      <button className="btn s ghost" onClick={() => setRules(null)}>
                        {t('Abbrechen')}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
          <li className="parts-card theme">
            <span className="parts-thumb" aria-hidden="true">
              <Icon name="style" />
            </span>
            <div className="parts-info">
              <strong>{kind === 'header' ? t('Kopfzeile des Stils') : t('Fusszeile des Stils')}</strong>
              <span className="xsmall muted">{t('Gilt überall, wo keine eigene passt. Menü, Logo und Spalten stellst du unter «Menü & Fusszeile» ein.')}</span>
            </div>
            <button className="btn s ghost" onClick={() => navigate('/einstellungen/navigation')}>
              {t('Menü & Fusszeile')}
            </button>
          </li>
        </ul>
      </section>
    );
  };

  const h = shown('header');
  const f = shown('footer');
  return (
    <>
      <PageHead
        title={t('Kopf- & Fusszeilen')}
        sub={t('Eigene Kopf- und Fusszeilen im freien Layout gestalten – für die ganze Website oder nur für bestimmte Seiten. Gibt es mehrere, gilt die genaueste.')}
      />
      <div className="card parts-probe">
        <label className="font-field grow">
          <span className="xsmall muted">{t('Welche gilt wo? Adresse prüfen')}</span>
          <input className="input mono" value={probe} onChange={(e) => setProbe(e.target.value)} placeholder="/shop" />
        </label>
        <p className="small">
          <Icon name="layout" size="s" /> {t('Kopfzeile')}: <strong>{h ? h.title : t('die des Stils')}</strong>
          <br />
          <Icon name="layout" size="s" /> {t('Fusszeile')}: <strong>{f ? f.title : t('die des Stils')}</strong>
        </p>
      </div>
      <div className="parts-grid">
        {column('header')}
        {column('footer')}
      </div>
    </>
  );
}

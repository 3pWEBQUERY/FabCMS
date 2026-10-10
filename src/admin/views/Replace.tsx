import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { entryUrl } from '../lib/actions';
import { useApi } from '../lib/hooks';
import { t, tl, tm } from '../lib/i18n';
import { Link } from '../lib/router';
import { useSession } from '../lib/session';
import { Icon } from '../ui/icons';
import { Empty, Field, PageHead, Skeleton, Toggle, confirm } from '../ui/kit';
import { useToast } from '../ui/toast';
import { SelectBox } from './Bulk';
import type { CollectionDef } from '../../shared/types';

interface Snip {
  where: string;
  before: string;
  match: string;
  after: string;
}
interface Found {
  id: string;
  lang: string | null;
  collection: string;
  title: string;
  status: string;
  count: number;
  hits: Snip[];
}
interface Preview {
  entries: Found[];
  settings: { count: number; hits: Snip[] };
  total: number;
  truncated: boolean;
}

const key = (f: Pick<Found, 'id' | 'lang'>) => `${f.id}:${f.lang ?? ''}`;

/**
 * Search and replace across all content: a new phone number, a renamed
 * product, an old address. First every hit in context, then only the
 * ticked entries change – as drafts, with the state before in the history.
 */
export function Replace() {
  const { can } = useSession();
  const toast = useToast();
  const { data: cols } = useApi<{ collections: (CollectionDef & { active: boolean })[] }>('/api/collections');
  const [form, setForm] = useState({ find: '', replace: '', caseSensitive: false, wholeWord: false, collections: [] as string[] });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [asked, setAsked] = useState<typeof form | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [withSettings, setWithSettings] = useState(true);
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const colName = (id: string) => tl(cols?.collections.find((c) => c.id === id)?.name) || id;

  const search = async () => {
    if (!form.find) return;
    setBusy(true);
    try {
      setPreview(await api.post<Preview>('/api/replace/preview', form));
      setAsked(form);
      setOff(new Set());
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setBusy(false);
    }
  };
  const chosen = useMemo(() => preview?.entries.filter((f) => !off.has(key(f))) ?? [], [preview, off]);
  const settingsOn = Boolean(preview?.settings.count) && withSettings;
  const hits = chosen.reduce((n, f) => n + f.count, 0) + (settingsOn ? preview!.settings.count : 0);

  const apply = async () => {
    if (!asked || !preview) return;
    if (
      !(await confirm({
        title: t('{n} Stellen ersetzen?', { n: hits }),
        message: t('«{find}» wird zu «{replace}». Einträge ändern sich als Entwurf; den Stand davor findest du im Verlauf jedes Eintrags.', {
          find: asked.find,
          replace: asked.replace || t('(nichts)'),
        }),
        confirm: t('Ersetzen'),
      }))
    )
      return;
    setBusy(true);
    try {
      const r = await api.post<{ replaced: number; entries: number; failed: { title: string; error: string }[] }>('/api/replace/apply', {
        ...asked,
        targets: chosen.map((f) => ({ id: f.id, lang: f.lang })),
        settings: settingsOn,
        publish,
      });
      toast(
        r.failed.length
          ? t('{n} Stellen ersetzt. Nicht geändert: {list}', { n: r.replaced, list: r.failed.map((f) => `«${f.title}» (${tm(f.error)})`).join(', ') })
          : t('{n} Stellen in {m} Einträgen ersetzt.', { n: r.replaced, m: r.entries }),
        r.failed.length ? { kind: 'bad', ms: 10000 } : {},
      );
      setPreview(await api.post<Preview>('/api/replace/preview', asked));
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setBusy(false);
    }
  };

  const snip = (h: Snip, i: number) => (
    <li key={i}>
      <span className="rp-where">{tl(h.where)}</span>
      <span className="rp-text">
        {h.before}
        <del>{h.match}</del>
        {asked?.replace && <ins>{asked.replace}</ins>}
        {h.after}
      </span>
    </li>
  );

  return (
    <div className="page">
      <PageHead
        back={
          <Link to="/inhalte" className="crumb">
            <Icon name="chevronLeft" size="s" /> {t('Inhalte')}
          </Link>
        }
        title={t('Suchen und Ersetzen')}
        sub={t('Eine neue Telefonnummer, ein umbenanntes Produkt, eine alte Adresse – auf allen Seiten und in allen Einträgen auf einmal.')}
      />
      <form
        className="card card-pad stack"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <div className="grid-2">
          <Field label={t('Suchen')} htmlFor="rp-find">
            <input id="rp-find" className="input" value={form.find} maxLength={500} autoFocus onChange={(e) => setForm({ ...form, find: e.target.value })} />
          </Field>
          <Field label={t('Ersetzen durch')} htmlFor="rp-rep" help={t('Leer lassen, um den Text zu entfernen.')}>
            <input id="rp-rep" className="input" value={form.replace} maxLength={2000} onChange={(e) => setForm({ ...form, replace: e.target.value })} />
          </Field>
        </div>
        <div className="row wrap">
          <Toggle checked={form.caseSensitive} onChange={(v) => setForm({ ...form, caseSensitive: v })} label={t('Gross- und Kleinschreibung beachten')} />
          <Toggle checked={form.wholeWord} onChange={(v) => setForm({ ...form, wholeWord: v })} label={t('Nur ganze Wörter')} />
        </div>
        {cols && (
          <div className="stack tight">
            <span className="xsmall muted">{form.collections.length ? t('Nur in:') : t('In allen Inhaltstypen – oder nur in:')}</span>
            <div className="chips">
              {cols.collections
                .filter((c) => c.active)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="chip"
                    aria-pressed={form.collections.includes(c.id)}
                    onClick={() => setForm({ ...form, collections: form.collections.includes(c.id) ? form.collections.filter((x) => x !== c.id) : [...form.collections, c.id] })}
                  >
                    {tl(c.name)}
                  </button>
                ))}
            </div>
          </div>
        )}
        <div>
          <button className="btn primary" disabled={!form.find || busy}>
            <Icon name="search" size="s" /> {t('Treffer zeigen')}
          </button>
        </div>
      </form>

      {busy && !preview && <Skeleton lines={4} />}
      {preview && asked && (
        <section className="card rp-results" aria-live="polite">
          {preview.total === 0 ? (
            <Empty title={t('Nichts gefunden')}>{t('«{find}» kommt nirgends vor.', { find: asked.find })}</Empty>
          ) : (
            <>
              <div className="card-head">
                <h2>
                  {preview.entries.length === 1
                    ? t('{n} Treffer in einem Eintrag', { n: preview.total })
                    : preview.entries.length
                      ? t('{n} Treffer in {m} Einträgen', { n: preview.total, m: preview.entries.length })
                      : t('{n} Treffer in den Website-Einstellungen', { n: preview.total })}
                </h2>
                <button type="button" className="btn ghost s" onClick={() => setOff(off.size ? new Set() : new Set(preview.entries.map(key)))}>
                  {off.size ? t('Alle wählen') : t('Keine wählen')}
                </button>
              </div>
              {preview.truncated && (
                <p className="small muted card-pad">
                  {t('Sehr viele Treffer – es werden die neuesten 500 Einträge gezeigt. Grenze die Suche ein und ersetze in mehreren Durchgängen.')}
                </p>
              )}
              <ul className="rp-list">
                {preview.settings.count > 0 && (
                  <li>
                    <SelectBox checked={withSettings} onChange={setWithSettings} label={t('Website-Einstellungen einbeziehen')} />
                    <div className="grow">
                      <div className="rp-title">
                        <Icon name="settings" size="s" /> {t('Website-Einstellungen')} <span className="badge">{preview.settings.count}</span>
                      </div>
                      <p className="xsmall muted">{t('Name, Kontakt, Menü, Fusszeile – gilt sofort, auch online.')}</p>
                      <ul className="rp-snips">{preview.settings.hits.map(snip)}</ul>
                    </div>
                  </li>
                )}
                {preview.entries.map((f) => (
                  <li key={key(f)} className={off.has(key(f)) ? 'off' : ''}>
                    <SelectBox
                      checked={!off.has(key(f))}
                      onChange={() => {
                        const n = new Set(off);
                        if (n.has(key(f))) n.delete(key(f));
                        else n.add(key(f));
                        setOff(n);
                      }}
                      label={t('«{name}» einbeziehen', { name: f.title })}
                    />
                    <div className="grow">
                      <div className="rp-title">
                        <Link to={entryUrl(f.collection, f.id)}>{f.title || t('Ohne Titel')}</Link>
                        <span className="xsmall muted">
                          {colName(f.collection)}
                          {f.lang && ` · ${t('Übersetzung')} ${f.lang.toUpperCase()}`}
                        </span>
                        <span className="badge">{f.count}</span>
                      </div>
                      <ul className="rp-snips">{f.hits.map(snip)}</ul>
                      {f.count > f.hits.length && <p className="xsmall muted">{t('… und {n} weitere Stellen', { n: f.count - f.hits.length })}</p>}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="rp-apply">
                {can('content.publish') ? (
                  <Toggle checked={publish} onChange={setPublish} label={t('Veröffentlichte Einträge gleich neu veröffentlichen')} />
                ) : (
                  <span className="xsmall muted">{t('Veröffentlichte Einträge bekommen einen Entwurf – online ändert sich erst beim Veröffentlichen.')}</span>
                )}
                <span className="grow" />
                <button type="button" className="btn primary" disabled={busy || hits === 0} onClick={() => void apply()}>
                  {t('{n} Stellen ersetzen', { n: hits })}
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

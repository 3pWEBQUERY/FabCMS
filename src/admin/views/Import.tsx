import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Link } from '../lib/router';
import { Icon } from '../ui/icons';
import { Empty, PageHead, Toggle } from '../ui/kit';
import { useToast } from '../ui/toast';

interface Summary {
  source: string;
  label: string;
  counts: { post: number; page: number; product: number };
  drafts: number;
  sample: { kind: string; title: string; date: string | null; published: boolean }[];
  warnings: string[];
}
interface Job {
  id: string;
  status: 'running' | 'done' | 'failed';
  total: number;
  done: number;
  created: { kind: string; title: string; path: string | null; id: string }[];
  redirects: number;
  images: number;
  errors: string[];
  modules: string[];
}

const SOURCES = [
  {
    id: 'wordpress',
    name: 'WordPress',
    how: 'Website-Adresse eingeben – oder in WordPress unter Werkzeuge → Daten exportieren die XML-Datei holen.',
    url: 'wordpress',
    file: '.xml',
  },
  {
    id: 'squarespace',
    name: 'Squarespace',
    how: 'In Squarespace: Einstellungen → Import & Export → Exportieren (WordPress-Format). Die XML-Datei hier hochladen.',
    url: null,
    file: '.xml',
  },
  { id: 'wix', name: 'Wix', how: 'Wix hat keinen Export. Nova liest die Blogbeiträge aus dem Blog-Feed – gib einfach die Website-Adresse ein.', url: 'feed', file: null },
  { id: 'shopify', name: 'Shopify', how: 'In Shopify: Produkte → Exportieren → Alle Produkte, «CSV für Excel». Die CSV-Datei hier hochladen.', url: null, file: '.csv' },
  {
    id: 'markdown',
    name: 'Markdown',
    how: 'Eine .md-Datei oder eine ZIP-Datei mit Ordnern (Jekyll, Hugo, Astro, Obsidian …). Bilder in der ZIP-Datei werden mitgenommen.',
    url: null,
    file: '.md,.markdown,.zip',
  },
  { id: 'feed', name: 'Anderer Blog', how: 'Medium, Ghost, Substack, Blogger … – alles mit RSS- oder Atom-Feed.', url: 'feed', file: '.xml,.rss,.atom' },
] as const;

const KIND = { post: 'Beitrag', page: 'Seite', product: 'Produkt' } as Record<string, string>;

export function ImportSettings() {
  const toast = useToast();
  const [source, setSource] = useState<(typeof SOURCES)[number]>(SOURCES[0]);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ id: string; summary: Summary } | null>(null);
  const [opts, setOpts] = useState({ publish: true, images: true, redirects: true });
  const [job, setJob] = useState<Job | null>(null);

  useEffect(() => {
    if (!job || job.status !== 'running') return;
    const t = setInterval(async () => {
      try {
        setJob((await api.get<{ job: Job }>(`/api/import/jobs/${job.id}`)).job);
      } catch {
        /* next tick */
      }
    }, 1000);
    return () => clearInterval(t);
  }, [job]);

  const analyse = async (fn: () => Promise<{ id: string; summary: Summary }>) => {
    setBusy(true);
    try {
      setPreview(await fn());
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setBusy(false);
    }
  };
  const upload = (file: File) =>
    analyse(() => {
      const form = new FormData();
      form.append('file', file);
      return api.upload<{ id: string; summary: Summary }>('/api/import/upload', form);
    });
  const fromUrl = () => analyse(() => api.post('/api/import/url', { kind: source.url, url }));
  const run = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      setJob((await api.post<{ job: Job }>('/api/import/run', { id: preview.id, ...opts })).job);
      setPreview(null);
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setBusy(false);
    }
  };

  const s = preview?.summary;
  const total = s ? s.counts.post + s.counts.page + s.counts.product : 0;
  return (
    <>
      <PageHead title="Import" sub="Inhalte von einer anderen Plattform übernehmen: Texte, Bilder, Produkte – und alte Adressen leiten weiter." />
      {job ? (
        <section className="card card-pad stack">
          <div className="row between">
            <h2 style={{ fontSize: 'var(--t-m)', fontWeight: 650 }}>
              {job.status === 'running' ? 'Import läuft …' : job.status === 'done' ? 'Import fertig' : 'Import abgebrochen'}
            </h2>
            <span className="num small">
              {job.done} / {job.total}
            </span>
          </div>
          <div className="meter" role="progressbar" aria-label="Fortschritt" aria-valuemin={0} aria-valuemax={job.total} aria-valuenow={job.done}>
            <span style={{ width: `${job.total ? (job.done / job.total) * 100 : 0}%` }} />
          </div>
          <p className="small">
            {job.created.length} übernommen · {job.images} Bilder in der Mediathek (Ordner «Import») · {job.redirects} Weiterleitungen
            {job.modules.length ? ` · Module eingeschaltet: ${job.modules.join(', ')}` : ''}
          </p>
          {job.errors.length > 0 && (
            <details>
              <summary className="small">{job.errors.length} Hinweise</summary>
              <ul className="small muted">
                {job.errors.slice(0, 100).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}
          {job.status === 'done' && (
            <div className="row">
              <Link to="/inhalte" className="btn primary">
                Zu den Inhalten
              </Link>
              <button className="btn" onClick={() => setJob(null)}>
                Weiteren Import starten
              </button>
            </div>
          )}
        </section>
      ) : preview && s ? (
        <section className="card card-pad stack">
          <h2 style={{ fontSize: 'var(--t-m)', fontWeight: 650 }}>{s.label}</h2>
          <div className="kpis">
            {(['post', 'page', 'product'] as const)
              .filter((k) => s.counts[k])
              .map((k) => (
                <div className="kpi" key={k}>
                  <span className="label">{k === 'post' ? 'Beiträge' : k === 'page' ? 'Seiten' : 'Produkte'}</span>
                  <span className="value">{s.counts[k]}</span>
                </div>
              ))}
          </div>
          <ul className="list bordered">
            {s.sample.map((i, k) => (
              <li key={k} className="list-item">
                <span className="badge muted">{KIND[i.kind]}</span>
                <span className="grow ellipsis">{i.title}</span>
                <span className="xsmall muted">{[i.date, i.published ? '' : 'Entwurf'].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
          {total > s.sample.length && <p className="xsmall muted">… und {total - s.sample.length} weitere.</p>}
          {s.warnings.map((w) => (
            <p key={w} className="hint">
              <span>{w}</span>
            </p>
          ))}
          <Toggle
            checked={opts.publish}
            onChange={(v) => setOpts({ ...opts, publish: v })}
            label="Gleich veröffentlichen"
            help={`Was dort online war, geht hier auch online. ${s.drafts ? `${s.drafts} Entwürfe bleiben Entwürfe.` : ''}`}
          />
          <Toggle
            checked={opts.images}
            onChange={(v) => setOpts({ ...opts, images: v })}
            label="Bilder übernehmen"
            help="Nova lädt die Bilder in die eigene Mediathek – die alte Website kann danach weg."
          />
          <Toggle
            checked={opts.redirects}
            onChange={(v) => setOpts({ ...opts, redirects: v })}
            label="Alte Adressen weiterleiten"
            help="Links und Google-Treffer auf die alten Adressen führen per 301 zur neuen Seite."
          />
          <div className="row">
            <button className="btn primary" onClick={run} disabled={busy} data-busy={busy || undefined}>
              {total} {total === 1 ? 'Eintrag' : 'Einträge'} importieren
            </button>
            <button className="btn" onClick={() => setPreview(null)}>
              Abbrechen
            </button>
          </div>
        </section>
      ) : (
        <section className="card card-pad stack">
          <div className="seg-cards">
            {SOURCES.map((x) => (
              <button key={x.id} className={`tile-btn${x.id === source.id ? ' on' : ''}`} aria-pressed={x.id === source.id} onClick={() => setSource(x)}>
                {x.name}
              </button>
            ))}
          </div>
          <p className="small">{source.how}</p>
          {source.url && (
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                void fromUrl();
              }}
            >
              <input
                className="input grow"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={source.id === 'wix' ? 'www.meine-wix-seite.ch' : 'www.meine-website.ch'}
                aria-label="Adresse der alten Website"
              />
              <button className="btn primary" disabled={busy || !url.trim()} data-busy={busy || undefined}>
                Inhalte lesen
              </button>
            </form>
          )}
          {source.file && (
            <label className="dropzone" style={{ display: 'grid', justifyItems: 'center', gap: '.5rem', cursor: 'pointer' }} aria-busy={busy || undefined}>
              <Icon name="upload" />
              <span>
                {source.url ? 'Oder ' : ''}Datei wählen ({source.file.replace(/,/g, ', ')})
              </span>
              <input type="file" className="sr" accept={source.file} onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
            </label>
          )}
          <Empty title="So läuft es">
            Zuerst zeigt Nova, was gefunden wurde. Erst nach deinem Klick wird importiert – bestehende Inhalte bleiben unangetastet, gleiche Adressen bekommen eine Nummer
            angehängt.
          </Empty>
        </section>
      )}
    </>
  );
}

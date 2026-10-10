import { useState } from 'react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useSession } from '../lib/session';
import { Empty, PageHead, Segmented, Skeleton, confirm } from '../ui/kit';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/toast';
import { EXTENSION_CATEGORIES, type ExtensionCategory, type ExtensionManifest } from '../../shared/extensions';
import { t, tl } from '../lib/i18n';

/**
 * Marktplatz: packages of content types, sandboxed hooks, forms, sections
 * and CSS. Shows exactly what an extension adds before it is installed, and
 * what stays when it is removed.
 */
type Effect = { kind: 'collection' | 'hook' | 'form' | 'section' | 'css'; label: string; path?: string };
type Item = ExtensionManifest & { source: 'nova' | 'katalog'; effects: Effect[]; installed: string | null; update: string | null };

const KIND_ICON: Record<Effect['kind'], string> = { collection: 'database', hook: 'code', form: 'mail', section: 'link', css: 'style' };
const kindLabel = (k: Effect['kind']) => ({ collection: t('Inhaltstyp'), hook: t('Hook'), form: t('Formular'), section: t('Sektion'), css: t('Gestaltung') })[k];

export function ExtensionsSettings() {
  const toast = useToast();
  const { reloadSettings } = useSession();
  const { data, reload } = useApi<{ catalogue: Item[]; orphans: Item[]; own: boolean; error: string | null }>('/api/extensions');
  const [filter, setFilter] = useState<'all' | 'installed' | ExtensionCategory>('all');
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState('');
  if (!data) return <Skeleton />;
  const all = [...data.catalogue, ...data.orphans];
  const shown = all.filter((x) => (filter === 'all' ? true : filter === 'installed' ? x.installed : x.category === filter));

  const run = async (x: Item, action: 'install' | 'update' | 'remove') => {
    if (action === 'install') {
      const ok = await confirm({
        title: t('«{name}» installieren?', { name: tl(x.name) }),
        message: (
          <>
            {t('Das kommt dazu:')}
            <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem' }}>
              {x.effects.map((e, i) => (
                <li key={i}>
                  {kindLabel(e.kind)}: {tl(e.label)}
                </li>
              ))}
            </ul>
          </>
        ),
        confirm: t('Installieren'),
      });
      if (!ok) return;
    }
    if (action === 'remove') {
      const ok = await confirm({
        title: t('«{name}» entfernen?', { name: tl(x.name) }),
        message: t('Hooks und Gestaltung der Erweiterung verschwinden. Inhaltstypen mit Einträgen, Formulare mit Eingängen und eingesetzte Sektionen bleiben – als deine eigenen.'),
        confirm: t('Entfernen'),
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(x.id);
    try {
      if (action === 'remove') {
        const r = await api.del<{ removed: string[]; kept: string[] }>(`/api/extensions/${x.id}`);
        toast(r.kept.length ? t('Entfernt. Behalten: {kept}', { kept: r.kept.map((k) => tl(k)).join(', ') }) : t('Entfernt.'));
      } else {
        await api.post(`/api/extensions/${x.id}/${action}`, {});
        toast(action === 'install' ? t('«{name}» ist installiert.', { name: tl(x.name) }) : t('Auf Version {version} aktualisiert.', { version: x.update ?? '' }));
      }
      await Promise.all([reload(), reloadSettings()]);
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <PageHead
        title={t('Erweiterungen')}
        sub={t(
          'Fertige Pakete aus Inhaltstypen, Hooks, Formularen, Sektionen und Gestaltung. Erweiterungen führen keinen eigenen Servercode aus – ihre Hooks laufen in derselben Sandbox wie deine.',
        )}
        actions={
          data.own ? (
            <button
              className="btn"
              onClick={async () => {
                await api.post('/api/extensions/refresh', {});
                await reload();
              }}
            >
              <Icon name="recycle" size="s" /> {t('Katalog neu laden')}
            </button>
          ) : undefined
        }
      />
      {data.error && (
        <div className="hint bad" role="alert" style={{ marginBottom: '1rem' }}>
          {t('Eigener Katalog:')} {tl(data.error)}
        </div>
      )}
      <div style={{ marginBottom: '1rem', overflowX: 'auto' }}>
        <Segmented
          label={t('Filter')}
          value={filter}
          onChange={setFilter}
          options={[{ value: 'all', label: t('Alle') }, { value: 'installed', label: t('Installiert') }, ...EXTENSION_CATEGORIES.map((c) => ({ value: c.id, label: tl(c.label) }))]}
        />
      </div>
      {!shown.length ? (
        <section className="card">
          <Empty title={filter === 'installed' ? t('Noch nichts installiert') : t('Nichts in dieser Kategorie')}>{t('Wähle oben «Alle», um den ganzen Katalog zu sehen.')}</Empty>
        </section>
      ) : (
        <div className="ext-grid">
          {shown.map((x) => (
            <article key={x.id} className="card ext-card">
              <header className="ext-head">
                <div>
                  <h3>{tl(x.name)}</h3>
                  <p className="xsmall muted">
                    {x.installed ? t('Version {version} installiert', { version: x.installed }) : t('Version {version}', { version: x.version })} · {x.author}
                  </p>
                </div>
                <span className={`badge ${x.source === 'nova' ? 'ok' : ''}`}>{x.source === 'nova' ? t('Von Nova geprüft') : t('Eigener Katalog')}</span>
              </header>
              <p className="small">{tl(x.summary)}</p>
              <ul className="ext-effects" aria-label={t('Das kommt dazu')}>
                {x.effects.map((e, i) => (
                  <li key={i}>
                    <Icon name={KIND_ICON[e.kind]} size="s" />
                    <span>
                      <span className="muted">{kindLabel(e.kind)}:</span> {tl(e.label)} {e.path && <span className="mono xsmall muted">{e.path}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              {open === x.id && (
                <div className="small ext-more">
                  <p>{tl(x.description)}</p>
                  <p className="xsmall muted">
                    {t('Lizenz: {license}', { license: x.license })}
                    {x.homepage && (
                      <>
                        {' · '}
                        <a href={x.homepage} target="_blank" rel="noopener noreferrer">
                          {t('Website')}
                        </a>
                      </>
                    )}
                  </p>
                </div>
              )}
              <footer className="ext-foot">
                <button className="btn ghost s" aria-expanded={open === x.id} onClick={() => setOpen(open === x.id ? '' : x.id)}>
                  {open === x.id ? t('Weniger') : t('Mehr erfahren')}
                </button>
                <div className="row">
                  {x.installed && (
                    <button className="btn ghost s" disabled={busy === x.id} onClick={() => run(x, 'remove')}>
                      {t('Entfernen')}
                    </button>
                  )}
                  {x.update && (
                    <button className="btn s" disabled={busy === x.id} onClick={() => run(x, 'update')}>
                      {t('Auf {version} aktualisieren', { version: x.update })}
                    </button>
                  )}
                  {!x.installed && (
                    <button className="btn primary s" disabled={busy === x.id} onClick={() => run(x, 'install')}>
                      {busy === x.id && <span className="spin" aria-hidden="true" />}
                      {t('Installieren')}
                    </button>
                  )}
                </div>
              </footer>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

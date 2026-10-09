import { Field, PageHead, Select, Skeleton, Toggle } from '../ui/kit';
import { LANGS, defaultLang, extraLangs, langInfo, type Lang, type SiteTranslation } from '../../shared/i18n';
import type { NavItem } from '../../shared/types';
import { SaveBar, useSettingsDraft } from './settingsDraft';

/** Einstellungen → Sprachen: main language, additional languages and the site texts per language. */
export function LanguageSettings() {
  const { draft, set, dirty, save, reset } = useSettingsDraft();
  if (!draft) return <Skeleton />;
  const main = defaultLang(draft);
  const extra = extraLangs(draft);
  const toggle = (l: Lang, on: boolean) => set('languages', on ? [...extra, l] : extra.filter((x) => x !== l));
  const tr = (l: Lang): SiteTranslation => draft.translations?.[l] ?? {};
  const setTr = (l: Lang, patch: Partial<SiteTranslation>) => set('translations', { ...(draft.translations ?? {}), [l]: { ...tr(l), ...patch } });
  const flatNav = (items: NavItem[], depth = 0): { item: NavItem; depth: number }[] => items.flatMap((i) => [{ item: i, depth }, ...flatNav(i.children ?? [], depth + 1)]);

  return (
    <>
      <PageHead
        title="Sprachen"
        sub="Die Website in mehreren Sprachen: Hauptsprache unter der normalen Adresse, weitere unter /fr, /it oder /en. Texte, Seiten und Beiträge übersetzt du im Editor über den Sprachumschalter."
      />
      <div className="card">
        <div className="form-section">
          <header>
            <h2>Hauptsprache</h2>
            <p>In dieser Sprache entstehen die Inhalte. Preise, Bilder, Daten und Lager gelten für alle Sprachen gemeinsam.</p>
          </header>
          <div className="grid-2">
            <Field label="Hauptsprache">
              <Select
                value={main}
                onChange={(v) => {
                  set('locale', langInfo(v).locale);
                  set(
                    'languages',
                    extra.filter((x) => x !== v),
                  );
                }}
                options={LANGS.map((l) => ({ value: l.id, label: `${l.name} (${l.native})` }))}
              />
            </Field>
          </div>
        </div>
        <div className="form-section">
          <header>
            <h2>Weitere Sprachen</h2>
            <p>
              Eingeschaltete Sprachen erscheinen im Sprachumschalter. Nicht übersetzte Seiten zeigen die Hauptsprache und bleiben für Google unsichtbar, bis sie übersetzt sind.
            </p>
          </header>
          {LANGS.filter((l) => l.id !== main).map((l) => (
            <Toggle key={l.id} checked={extra.includes(l.id)} onChange={(v) => toggle(l.id, v)} label={`${l.name} – ${l.native}`} help={`Adressen beginnen mit /${l.id}`} />
          ))}
        </div>
      </div>

      {extra.map((l) => {
        const t = tr(l);
        const info = langInfo(l);
        return (
          <section key={l} className="card" style={{ marginTop: '1.5rem' }}>
            <div className="card-head">
              <h2>Texte auf {info.name}</h2>
              <span className="badge muted">/{l}</span>
            </div>
            <div className="form-section">
              <p className="small muted">Leere Felder zeigen den Text der Hauptsprache.</p>
              <div className="grid-2">
                <Field label="Name der Website">
                  <input className="input" lang={l} value={t.name ?? ''} placeholder={draft.name} onChange={(e) => setTr(l, { name: e.target.value })} />
                </Field>
                <Field label="Kurzbeschreibung">
                  <input className="input" lang={l} value={t.tagline ?? ''} placeholder={draft.tagline} onChange={(e) => setTr(l, { tagline: e.target.value })} />
                </Field>
                <Field label="Beschreibung für Google">
                  <input
                    className="input"
                    lang={l}
                    value={t.description ?? ''}
                    placeholder={draft.seo.defaultDescription}
                    onChange={(e) => setTr(l, { description: e.target.value })}
                  />
                </Field>
                <Field label="Hinweis zu den Öffnungszeiten">
                  <input className="input" lang={l} value={t.hoursNote ?? ''} placeholder={draft.hoursNote} onChange={(e) => setTr(l, { hoursNote: e.target.value })} />
                </Field>
                {draft.header.cta && (
                  <Field label="Knopf oben rechts">
                    <input className="input" lang={l} value={t.ctaLabel ?? ''} placeholder={draft.header.cta.label} onChange={(e) => setTr(l, { ctaLabel: e.target.value })} />
                  </Field>
                )}
                <Field label="Text in der Fusszeile">
                  <input className="input" lang={l} value={t.footerText ?? ''} placeholder={draft.footer.text} onChange={(e) => setTr(l, { footerText: e.target.value })} />
                </Field>
              </div>
            </div>
            {draft.nav.length > 0 && (
              <div className="form-section">
                <header>
                  <h2>Menü</h2>
                  <p>Die Ziele bleiben gleich – Nova führt automatisch zur übersetzten Seite.</p>
                </header>
                <div className="grid-2">
                  {flatNav(draft.nav).map(({ item, depth }) => (
                    <Field key={item.id} label={`${depth ? '↳ ' : ''}${item.label}`}>
                      <input
                        className="input"
                        lang={l}
                        value={t.nav?.[item.id] ?? ''}
                        placeholder={item.label}
                        onChange={(e) => setTr(l, { nav: { ...(t.nav ?? {}), [item.id]: e.target.value } })}
                      />
                    </Field>
                  ))}
                </div>
              </div>
            )}
            {draft.footer.columns.length > 0 && (
              <div className="form-section">
                <header>
                  <h2>Fusszeile</h2>
                </header>
                <div className="grid-2">
                  {draft.footer.columns.map((col, i) => (
                    <div key={i} className="stack">
                      <Field label={`Spalte «${col.title}»`}>
                        <input
                          className="input"
                          lang={l}
                          value={t.columns?.[i] ?? ''}
                          placeholder={col.title}
                          onChange={(e) => {
                            const columns = [...(t.columns ?? [])];
                            columns[i] = e.target.value;
                            setTr(l, { columns });
                          }}
                        />
                      </Field>
                      {col.links.map((link) => (
                        <Field key={link.href} label={`↳ ${link.label}`}>
                          <input
                            className="input"
                            lang={l}
                            value={t.links?.[link.href] ?? ''}
                            placeholder={link.label}
                            onChange={(e) => setTr(l, { links: { ...(t.links ?? {}), [link.href]: e.target.value } })}
                          />
                        </Field>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        );
      })}
      <SaveBar dirty={dirty} onSave={save} onReset={reset} />
    </>
  );
}

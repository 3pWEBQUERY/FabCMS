import { Reorder, useDragControls } from 'motion/react';
import { ImportSettings } from './Import';
import { LanguageSettings } from './Languages';
import { Fragment, createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { useApi, formatDate } from '../lib/hooks';
import { Link, navigate, usePath } from '../lib/router';
import { useSession } from '../lib/session';
import { entryUrl } from '../lib/actions';
import { Dialog, Field, Menu, PageHead, Segmented, Select, Skeleton, SuggestInput, Toggle, confirm } from '../ui/kit';
import { MediaField } from '../ui/FieldInput';
import { LoadingFrame } from '../ui/loading';
import { HoursEditor } from '../ui/HoursEditor';
import { BookingSettings } from './BookingSettings';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/toast';
import { MODULES } from '../../shared/collections';
import { ROLE_LABELS, ROLE_ORDER, type Capability } from '../../shared/roles';
import { shortId } from '../../shared/text';
import type { NavItem, Role, SiteSettings, User } from '../../shared/types';
import { ContentTypes, CodeSettings, ApiSettings, HooksSettings, Redirects, SqlConsole, AuditLog } from './SettingsPro';
import { SaveBar, useSettingsDraft } from './settingsDraft';
import { t, tl, tm } from '../lib/i18n';

interface Section {
  id: string;
  label: () => string;
  icon: string;
  cap?: Capability;
  pro?: boolean;
  module?: string;
}

const SECTIONS: Section[] = [
  { id: 'website', label: () => t('Name, Logo & Kontakt'), icon: 'globe', cap: 'settings.manage' },
  { id: 'design', label: () => t('Design'), icon: 'style', cap: 'design.manage' },
  { id: 'navigation', label: () => t('Menü & Fusszeile'), icon: 'nav', cap: 'settings.manage' },
  { id: 'sprachen', label: () => t('Sprachen'), icon: 'globe', cap: 'settings.manage' },
  { id: 'seo', label: () => t('Suchmaschinen'), icon: 'seo', cap: 'settings.manage' },
  { id: 'rechtliches', label: () => t('Rechtliches'), icon: 'scale', cap: 'settings.manage' },
  { id: 'domain', label: () => t('Domain'), icon: 'globe', cap: 'settings.manage' },
  { id: 'shop', label: () => t('Shop'), icon: 'bag', cap: 'settings.manage', module: 'shop' },
  { id: 'reservation', label: () => t('Reservation & Termine'), icon: 'calendar', cap: 'settings.manage', module: 'booking' },
  { id: 'module', label: () => t('Module'), icon: 'grid', cap: 'settings.manage' },
  { id: 'team', label: () => t('Team & Rollen'), icon: 'people', cap: 'users.manage' },
  { id: 'import', label: () => t('Import'), icon: 'upload', cap: 'settings.manage' },
  { id: 'daten', label: () => t('Daten & Datenschutz'), icon: 'database', cap: 'privacy.manage' },
  { id: 'typen', label: () => t('Inhaltstypen'), icon: 'database', cap: 'dev', pro: true },
  { id: 'code', label: () => t('CSS & Tokens'), icon: 'code', cap: 'dev', pro: true },
  { id: 'api', label: () => t('API & Webhooks'), icon: 'webhook', cap: 'dev', pro: true },
  { id: 'hooks', label: () => t('Hooks'), icon: 'code', cap: 'dev', pro: true },
  { id: 'weiterleitungen', label: () => t('Weiterleitungen'), icon: 'arrowRight', cap: 'settings.manage', pro: true },
  { id: 'sql', label: () => t('SQL-Abfrage'), icon: 'database', cap: 'data.sql', pro: true },
  { id: 'protokoll', label: () => t('Protokoll'), icon: 'history', cap: 'audit.view', pro: true },
];

export function Settings({ section }: { section: string }) {
  const { can, pro, settings } = useSession();
  const visible = SECTIONS.filter((s) => (!s.cap || can(s.cap)) && (!s.pro || pro) && (!s.module || settings?.modules.includes(s.module)));
  const current = visible.find((s) => s.id === section) ?? visible[0];
  useEffect(() => {
    const hash = location.hash.slice(1);
    if (hash) setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  }, [section]);
  if (!current)
    return (
      <div className="page">
        <PageHead title={t('Einstellungen')} />
        <Link to="/konto" className="btn">
          {t('Mein Konto')}
        </Link>
      </div>
    );
  return (
    <div className="page wide">
      <div className="settings">
        <nav className="settings-nav" aria-label={t('Einstellungen')}>
          <span className="section-title">{t('Website')}</span>
          {visible
            .filter((s) => !s.pro)
            .map((s) => (
              <Link key={s.id} to={`/einstellungen/${s.id}`} aria-current={s.id === current.id ? 'page' : undefined}>
                <Icon name={s.icon} size="s" /> {s.label()}
              </Link>
            ))}
          {pro && <span className="section-title">Werkbank</span>}
          {visible
            .filter((s) => s.pro)
            .map((s) => (
              <Link key={s.id} to={`/einstellungen/${s.id}`} aria-current={s.id === current.id ? 'page' : undefined}>
                <Icon name={s.icon} size="s" /> {s.label()}
              </Link>
            ))}
          <span className="section-title">{t('Ich')}</span>
          <Link to="/konto">
            <Icon name="user" size="s" /> {t('Mein Konto')}
          </Link>
        </nav>
        <div style={{ minWidth: 0 }}>
          {current.id === 'website' && <WebsiteSettings />}
          {current.id === 'design' && <DesignSettings />}
          {current.id === 'navigation' && <NavigationSettings />}
          {current.id === 'sprachen' && <LanguageSettings />}
          {current.id === 'seo' && <SeoSettings />}
          {current.id === 'rechtliches' && <LegalSettings />}
          {current.id === 'domain' && <DomainSettings />}
          {current.id === 'shop' && <ShopSettings />}
          {current.id === 'reservation' && <BookingSettings />}
          {current.id === 'module' && <ModuleSettings />}
          {current.id === 'team' && <TeamSettings />}
          {current.id === 'import' && <ImportSettings />}
          {current.id === 'daten' && <DataSettings />}
          {current.id === 'typen' && <ContentTypes />}
          {current.id === 'code' && <CodeSettings />}
          {current.id === 'api' && <ApiSettings />}
          {current.id === 'hooks' && <HooksSettings />}
          {current.id === 'weiterleitungen' && <Redirects />}
          {current.id === 'sql' && <SqlConsole />}
          {current.id === 'protokoll' && <AuditLog />}
        </div>
      </div>
    </div>
  );
}

function Section({ title, sub, children, id }: { title: string; sub?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <div className="form-section" id={id}>
      <header>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </header>
      {children}
    </div>
  );
}

/** Fills {placeholders} in a translated sentence with elements. */
function withEl(text: string, parts: Record<string, ReactNode>) {
  return text.split(/\{(\w+)\}/).map((x, i) => (i % 2 ? <Fragment key={i}>{parts[x]}</Fragment> : x));
}

/* ---------- website ---------- */

function WebsiteSettings() {
  const { draft, set, dirty, save, reset } = useSettingsDraft();
  if (!draft) return <Skeleton />;
  const b = draft.business;
  const setB = (patch: Partial<SiteSettings['business']>) => set('business', { ...b, ...patch });
  return (
    <>
      <PageHead title={t('Name, Logo & Kontakt')} sub={t('Diese Angaben erscheinen auf der Website, im Footer, im Impressum und bei Google.')} />
      <div className="card">
        <Section title={t('Website')}>
          <div className="grid-2">
            <Field label={t('Name')} htmlFor="s-name">
              <input id="s-name" className="input" value={draft.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label={t('Kurzbeschreibung')} htmlFor="s-tag" help={t('Erscheint auf der Startseite im Browser-Tab und bei Google.')}>
              <input id="s-tag" className="input" value={draft.tagline} onChange={(e) => set('tagline', e.target.value)} />
            </Field>
          </div>
          <div className="grid-2">
            <Field label={t('Logo')}>
              <MediaField value={draft.logo} type="image" onChange={(v) => set('logo', v)} />
            </Field>
            <Field label={t('Icon im Browser-Tab')} help={t('Leer = Logo oder Anfangsbuchstabe.')}>
              <MediaField value={draft.favicon} type="image" onChange={(v) => set('favicon', v)} />
            </Field>
          </div>
        </Section>
        <Section title={t('Kontakt & Adresse')}>
          <div className="grid-2">
            <Field label={t('Firmenname (offiziell)')}>
              <input className="input" value={b.legalName} onChange={(e) => setB({ legalName: e.target.value })} />
            </Field>
            <Field label={t('UID-Nummer')} help={t('z. B. CHE-123.456.789 – für Impressum und Rechnungen.')}>
              <input className="input" value={b.uid} onChange={(e) => setB({ uid: e.target.value })} />
            </Field>
            <Field label={t('Strasse und Nr.')}>
              <input className="input" value={b.street} onChange={(e) => setB({ street: e.target.value })} autoComplete="street-address" />
            </Field>
            <div className="grid-2" style={{ gridTemplateColumns: '6rem 1fr', gap: '0.5rem' }}>
              <Field label={t('PLZ')}>
                <input className="input" value={b.zip} onChange={(e) => setB({ zip: e.target.value })} inputMode="numeric" />
              </Field>
              <Field label={t('Ort')}>
                <input className="input" value={b.city} onChange={(e) => setB({ city: e.target.value })} />
              </Field>
            </div>
            <Field label={t('Telefon')}>
              <input className="input" type="tel" value={b.phone} onChange={(e) => setB({ phone: e.target.value })} />
            </Field>
            <Field label={t('E-Mail')} help={t('Hierhin gehen auch Formular-Benachrichtigungen.')}>
              <input className="input" type="email" value={b.email} onChange={(e) => setB({ email: e.target.value })} />
            </Field>
          </div>
          {b.lat && <p className="xsmall faint">{t('Auf der Karte gefunden ({lat}, {lng}).', { lat: b.lat.toFixed(4), lng: b.lng?.toFixed(4) ?? '' })}</p>}
        </Section>
        <Section title={t('Öffnungszeiten')} id="zeiten" sub={t('Erscheinen im Block «Öffnungszeiten», im Footer und bei Google. «Jetzt geöffnet» rechnet Nova selbst aus.')}>
          <HoursEditor hours={draft.hours} onChange={(h) => set('hours', h)} />
          <Field label={t('Hinweis zu den Zeiten')} help={t('z. B. «Betriebsferien 20. Juli bis 10. August»')}>
            <input className="input" value={draft.hoursNote} onChange={(e) => set('hoursNote', e.target.value)} />
          </Field>
        </Section>
        <Section title={t('Social Media')}>
          {draft.social.map((s, i) => (
            <div key={i} className="row">
              <input
                className="input"
                style={{ maxWidth: '10rem' }}
                value={s.label}
                placeholder="Instagram"
                onChange={(e) =>
                  set(
                    'social',
                    draft.social.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                  )
                }
              />
              <input
                className="input grow"
                value={s.href}
                placeholder="https://instagram.com/…"
                onChange={(e) =>
                  set(
                    'social',
                    draft.social.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)),
                  )
                }
              />
              <button
                className="btn ghost icon-only"
                aria-label={t('Entfernen')}
                onClick={() =>
                  set(
                    'social',
                    draft.social.filter((_, j) => j !== i),
                  )
                }
              >
                <Icon name="x" size="s" />
              </button>
            </div>
          ))}
          <button className="btn s" style={{ justifySelf: 'start' }} onClick={() => set('social', [...draft.social, { label: '', href: '' }])}>
            <Icon name="plus" size="s" /> {t('Profil hinzufügen')}
          </button>
        </Section>
        <Section title={t('Geschäftsart für Google')} sub={t('Bestimmt die strukturierten Daten (schema.org).')}>
          <div className="grid-2">
            <Field label={t('Art')}>
              <Select
                value={b.type}
                onChange={(v) => setB({ type: v })}
                options={[
                  ['LocalBusiness', t('Lokales Geschäft')],
                  ['Restaurant', t('Restaurant')],
                  ['CafeOrCoffeeShop', t('Café')],
                  ['BarOrPub', t('Bar')],
                  ['Store', t('Laden')],
                  ['BeautySalon', t('Coiffeur / Kosmetik')],
                  ['MedicalBusiness', t('Praxis')],
                  ['HomeAndConstructionBusiness', t('Handwerk')],
                  ['ProfessionalService', t('Dienstleistung')],
                  ['LodgingBusiness', t('Hotel / Unterkunft')],
                  ['SportsOrganization', t('Verein')],
                  ['NGO', t('Non-Profit')],
                  ['Organization', t('Organisation')],
                ].map(([value, label]) => ({ value, label }))}
              />
            </Field>
            <Field label={t('Preisniveau')} help={t('z. B. «CHF 20–50»')}>
              <input className="input" value={b.priceRange} onChange={(e) => setB({ priceRange: e.target.value })} />
            </Field>
            {['Restaurant', 'CafeOrCoffeeShop', 'BarOrPub'].includes(b.type) && (
              <Field label={t('Küche|Stil')} help={t('z. B. «Schweizer Küche, saisonal»')}>
                <input className="input" value={b.servesCuisine} onChange={(e) => setB({ servesCuisine: e.target.value })} />
              </Field>
            )}
          </div>
        </Section>
      </div>
      <SaveBar dirty={dirty} onSave={save} onReset={reset} />
    </>
  );
}

/* ---------- design ---------- */

function DesignSettings() {
  const { bundle, pro, user, setMode } = useSession();
  const { draft, set, dirty, save, reset } = useSettingsDraft();
  const [offer, setOffer] = useState(false);
  if (!draft || !bundle) return <Skeleton />;
  const cur = draft.theme;
  const setT = (patch: Partial<SiteSettings['theme']>) => set('theme', { ...cur, ...patch });
  const theme = bundle.themes.find((x) => x.id === cur.id) ?? bundle.themes[0];
  const preview = `/_nova/theme-preview?theme=${cur.id}&palette=${cur.palette}&fonts=${cur.fontPair}&spacing=${cur.spacing}&radius=${cur.radius}`;
  return (
    <>
      <PageHead title={t('Design')} sub={t('Kuratierte Stile, Farben und Schriften. Änderungen siehst du sofort in der Vorschau.')} />
      <div className="preview-split">
        <div className="card">
          <Section title={t('Stil')}>
            <div className="stack tight">
              {bundle.themes.map((th) => (
                <button key={th.id} type="button" className="tile" aria-pressed={cur.id === th.id} onClick={() => setT({ id: th.id, palette: 'default', fontPair: th.pair })}>
                  <strong>{tl(th.name)}</strong>
                  <span>{tl(th.description)}</span>
                </button>
              ))}
            </div>
          </Section>
          <Section title={t('Farben')}>
            <div className="row wrap" style={{ gap: '0.75rem' }}>
              {theme.palettes.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="chip"
                  aria-pressed={cur.palette === p.id}
                  onClick={() => setT({ palette: p.id })}
                  style={{ height: '2.25rem', paddingLeft: '0.35rem' }}
                >
                  <span className="swatch" style={{ width: '1.5rem', height: '1.5rem', background: `linear-gradient(135deg, ${p.bg} 0 50%, ${p.accent} 50% 100%)` }} />
                  {tl(p.label)}
                </button>
              ))}
            </div>
          </Section>
          <Section title={t('Schriften')}>
            <Select
              label={t('Schriftpaar')}
              value={cur.fontPair}
              onChange={(v) => setT({ fontPair: v })}
              options={bundle.fontPairs.map((f) => ({ value: f.id, label: f.id === theme.pair ? t('{font} (passend zum Stil)', { font: f.label }) : f.label }))}
            />
          </Section>
          <Section title={t('Abstände & Ecken')}>
            <Field label={t('Luft zwischen Abschnitten: {n} %', { n: Math.round(cur.spacing * 100) })}>
              <input type="range" min={0.7} max={1.4} step={0.05} value={cur.spacing} onChange={(e) => setT({ spacing: Number(e.target.value) })} />
            </Field>
            <Field label={t('Rundung von Bildern: {n} px', { n: cur.radius })}>
              <input type="range" min={0} max={24} step={1} value={cur.radius} onChange={(e) => setT({ radius: Number(e.target.value) })} />
            </Field>
          </Section>
          {!pro && (
            <Section title={t('Mehr Kontrolle?')}>
              <p className="small muted">{t('Eigene Farben als Design-Tokens oder eigenes CSS gibt es in der Werkbank.')}</p>
              <button className="btn" style={{ justifySelf: 'start' }} onClick={() => setOffer(true)} disabled={!user.allowed_modes.includes('werkbank')}>
                <Icon name="code" size="s" /> {t('Eigenes CSS schreiben')}
              </button>
            </Section>
          )}
        </div>
        <div className="live-preview">
          <header>
            <Icon name="eye" size="s" /> <span className="grow">{t('Vorschau mit deinen Inhalten')}</span>
          </header>
          <LoadingFrame title={t('Design-Vorschau')} src={preview} />
        </div>
      </div>
      <SaveBar dirty={dirty} onSave={save} onReset={reset} />
      <Dialog
        open={offer}
        onOpenChange={setOffer}
        title={t('Zur Werkbank wechseln?')}
        description={t('Die Werkbank zeigt dieselben Inhalte – dazu Design-Tokens, eigenes CSS, Code-Ansicht pro Block, Inhaltstypen und API. Zurück ins Studio geht jederzeit.')}
      >
        <div className="dialog-actions">
          <button className="btn ghost" onClick={() => setOffer(false)}>
            {t('Lieber nicht')}
          </button>
          <button
            className="btn primary"
            onClick={async () => {
              await setMode('werkbank');
              setOffer(false);
              navigate('/einstellungen/code');
            }}
          >
            {t('Werkbank öffnen')}
          </button>
        </div>
      </Dialog>
    </>
  );
}

/* ---------- navigation ---------- */

/** Page addresses offered as link targets in every menu and footer row. */
const PageLinks = createContext<{ value: string; label: string }[]>([]);

function NavRow({ item, onChange, onRemove, depth }: { item: NavItem; onChange: (n: NavItem) => void; onRemove: () => void; depth: number }) {
  const controls = useDragControls();
  const pageLinks = useContext(PageLinks);
  return (
    <Reorder.Item value={item} dragListener={false} dragControls={controls} style={{ listStyle: 'none' }} whileDrag={{ scale: 1.01, zIndex: 4 }}>
      <div className="row" style={{ marginLeft: depth * 24, padding: '0.25rem 0' }}>
        <span className="grip" onPointerDown={(e) => controls.start(e)} aria-hidden="true">
          <Icon name="grip" size="s" />
        </span>
        <input
          className="input"
          style={{ maxWidth: '12rem' }}
          value={item.label}
          placeholder={t('Beschriftung')}
          onChange={(e) => onChange({ ...item, label: e.target.value })}
          aria-label={t('Beschriftung')}
        />
        <SuggestInput
          className="input grow mono"
          value={item.href}
          placeholder={t('/seite')}
          onChange={(v) => onChange({ ...item, href: v })}
          aria-label={t('Ziel')}
          suggestions={pageLinks}
        />
        {depth === 0 && (
          <button
            className="btn ghost s"
            onClick={() => onChange({ ...item, children: [...(item.children ?? []), { id: shortId(), label: '', href: '' }] })}
            title={t('Untermenü-Punkt')}
          >
            + {t('Unterpunkt')}
          </button>
        )}
        <button className="btn ghost s icon-only" aria-label={t('Entfernen')} onClick={onRemove}>
          <Icon name="x" size="s" />
        </button>
      </div>
      {depth === 0 && item.children && item.children.length > 0 && (
        <Reorder.Group axis="y" values={item.children} onReorder={(c) => onChange({ ...item, children: c })} style={{ padding: 0, margin: 0 }}>
          {item.children.map((c) => (
            <NavRow
              key={c.id}
              item={c}
              depth={1}
              onChange={(nc) => onChange({ ...item, children: item.children!.map((x) => (x.id === c.id ? nc : x)) })}
              onRemove={() => onChange({ ...item, children: item.children!.filter((x) => x.id !== c.id) })}
            />
          ))}
        </Reorder.Group>
      )}
    </Reorder.Item>
  );
}

function NavigationSettings() {
  const { draft, set, dirty, save, reset } = useSettingsDraft();
  const { data } = useApi<{ entries: { id: string; slug: string; title: string }[] }>('/api/entries?collection=pages&limit=300');
  const pageLinks = useMemo(() => (data?.entries ?? []).map((p) => ({ value: p.slug ? `/${p.slug}` : '/', label: p.title })), [data]);
  if (!draft) return <Skeleton />;
  return (
    <>
      <PageHead title={t('Menü & Fusszeile')} sub={t('Einmal ändern, auf allen Seiten aktuell.')} />
      <PageLinks.Provider value={pageLinks}>
        <div className="card">
          <Section title={t('Hauptmenü')} sub={t('Zieh die Punkte in die gewünschte Reihenfolge. Unterpunkte erscheinen als Aufklappmenü.')}>
            <Reorder.Group axis="y" values={draft.nav} onReorder={(n) => set('nav', n)} style={{ padding: 0, margin: 0 }}>
              {draft.nav.map((n) => (
                <NavRow
                  key={n.id}
                  item={n}
                  depth={0}
                  onChange={(nn) =>
                    set(
                      'nav',
                      draft.nav.map((x) => (x.id === n.id ? nn : x)),
                    )
                  }
                  onRemove={() =>
                    set(
                      'nav',
                      draft.nav.filter((x) => x.id !== n.id),
                    )
                  }
                />
              ))}
            </Reorder.Group>
            <button className="btn s" style={{ justifySelf: 'start' }} onClick={() => set('nav', [...draft.nav, { id: shortId(), label: '', href: '' }])}>
              <Icon name="plus" size="s" /> {t('Menüpunkt')}
            </button>
          </Section>
          <Section title={t('Kopfzeile')}>
            <div className="grid-2">
              <Field label={t('Knopf rechts im Menü')} help={t('z. B. «Tisch reservieren»')}>
                <input
                  className="input"
                  value={draft.header.cta?.label ?? ''}
                  onChange={(e) =>
                    set('header', { ...draft.header, cta: e.target.value || draft.header.cta?.href ? { label: e.target.value, href: draft.header.cta?.href ?? '' } : null })
                  }
                />
              </Field>
              <Field label={t('Ziel des Knopfs')}>
                <SuggestInput
                  className="input mono"
                  suggestions={pageLinks}
                  value={draft.header.cta?.href ?? ''}
                  onChange={(v) => set('header', { ...draft.header, cta: { label: draft.header.cta?.label ?? '', href: v } })}
                />
              </Field>
            </div>
            <Toggle checked={draft.header.sticky} onChange={(v) => set('header', { ...draft.header, sticky: v })} label={t('Kopfzeile beim Scrollen oben behalten')} />
          </Section>
          <Section title={t('Fusszeile')}>
            <Field label={t('Text')}>
              <textarea className="textarea" style={{ minHeight: '4rem' }} value={draft.footer.text} onChange={(e) => set('footer', { ...draft.footer, text: e.target.value })} />
            </Field>
            {draft.footer.columns.map((col, i) => (
              <div key={i} className="repeat-item" style={{ padding: '0.75rem' }}>
                <div className="row">
                  <input
                    className="input"
                    value={col.title}
                    placeholder={t('Spaltentitel')}
                    onChange={(e) => set('footer', { ...draft.footer, columns: draft.footer.columns.map((c, j) => (j === i ? { ...c, title: e.target.value } : c)) })}
                  />
                  <button
                    className="btn ghost s icon-only"
                    aria-label={t('Spalte entfernen')}
                    onClick={() => set('footer', { ...draft.footer, columns: draft.footer.columns.filter((_, j) => j !== i) })}
                  >
                    <Icon name="trash" size="s" />
                  </button>
                </div>
                {col.links.map((l, k) => (
                  <div key={k} className="row" style={{ marginTop: '0.4rem' }}>
                    <input
                      className="input"
                      value={l.label}
                      placeholder={t('Beschriftung')}
                      onChange={(e) =>
                        set('footer', {
                          ...draft.footer,
                          columns: draft.footer.columns.map((c, j) => (j === i ? { ...c, links: c.links.map((x, m) => (m === k ? { ...x, label: e.target.value } : x)) } : c)),
                        })
                      }
                    />
                    <SuggestInput
                      className="input mono"
                      suggestions={pageLinks}
                      value={l.href}
                      placeholder={t('/seite')}
                      aria-label={t('Ziel')}
                      onChange={(v) =>
                        set('footer', {
                          ...draft.footer,
                          columns: draft.footer.columns.map((c, j) => (j === i ? { ...c, links: c.links.map((x, m) => (m === k ? { ...x, href: v } : x)) } : c)),
                        })
                      }
                    />
                  </div>
                ))}
                <button
                  className="btn ghost s"
                  style={{ marginTop: '0.4rem' }}
                  onClick={() =>
                    set('footer', { ...draft.footer, columns: draft.footer.columns.map((c, j) => (j === i ? { ...c, links: [...c.links, { label: '', href: '' }] } : c)) })
                  }
                >
                  + {t('Link')}
                </button>
              </div>
            ))}
            <button
              className="btn s"
              style={{ justifySelf: 'start' }}
              onClick={() => set('footer', { ...draft.footer, columns: [...draft.footer.columns, { title: '', links: [] }] })}
            >
              <Icon name="plus" size="s" /> {t('Spalte')}
            </button>
            <p className="xsmall muted">{t('Adresse, Öffnungszeiten, Social-Media-Links und Rechtstexte erscheinen automatisch.')}</p>
          </Section>
        </div>
      </PageLinks.Provider>
      <SaveBar dirty={dirty} onSave={save} onReset={reset} />
    </>
  );
}

/* ---------- SEO ---------- */

interface Issue {
  kind: string;
  severity: 'bad' | 'warn';
  message: string;
  entryId?: string;
  title?: string;
}

function SeoSettings() {
  const { draft, set, dirty, save, reset } = useSettingsDraft();
  const check = useApi<{ issues: Issue[]; checked: number }>('/api/seo/site-check');
  const { data: pages } = useApi<{ entries: { id: string; collection: string }[] }>('/api/entries?collection=pages&limit=500');
  if (!draft) return <Skeleton />;
  const s = draft.seo;
  const coll = (id?: string) => (pages?.entries.some((p) => p.id === id) ? 'pages' : 'posts');
  return (
    <>
      <PageHead
        title={t('Suchmaschinen')}
        sub={t('Sitemap, strukturierte Daten, Social-Vorschaubilder und Weiterleitungen erledigt Nova automatisch. Hier siehst du, was noch fehlt.')}
      />
      <div className="stack loose">
        <section className="card">
          <div className="card-head">
            <h2>{t('Website-Check')}</h2>
            <button className="btn s" onClick={() => void check.reload()}>
              {t('Neu prüfen')}
            </button>
          </div>
          {!check.data ? (
            <Skeleton />
          ) : !check.data.issues.length ? (
            <p className="card-pad small" style={{ color: 'var(--ok)', fontWeight: 600 }}>
              {check.data.checked === 1 ? t('1 Seite geprüft – nichts gefunden. Sauber.') : t('{n} Seiten geprüft – nichts gefunden. Sauber.', { n: check.data.checked })}
            </p>
          ) : (
            <ul className="list">
              {check.data.issues.map((i, n) => (
                <li key={n} className="list-item">
                  <span className={`dot ${i.severity === 'bad' ? 'bad' : 'edited'}`} />
                  <div className="grow">
                    <div className="small" style={{ fontWeight: 600 }}>
                      {i.title}
                    </div>
                    <div className="xsmall muted">{tm(i.message)}</div>
                  </div>
                  {i.entryId && (
                    <Link className="btn s" to={entryUrl(coll(i.entryId), i.entryId)}>
                      {t('Beheben')}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="card">
          <Section title={t('Standardwerte')}>
            <Field label={t('Muster für Seitentitel')} help={t('%s = Seitentitel, %site = Name der Website')} keyName="seo.titleTemplate">
              <input className="input mono" value={s.titleTemplate} onChange={(e) => set('seo', { ...s, titleTemplate: e.target.value })} />
            </Field>
            <Field label={t('Standard-Beschreibung')} help={t('Für Seiten ohne eigenen Text.')}>
              <textarea className="textarea" value={s.defaultDescription} onChange={(e) => set('seo', { ...s, defaultDescription: e.target.value })} />
            </Field>
            <Field label={t('Standard-Bild für Social Media')} help={t('Leer = Nova erzeugt pro Seite ein Bild mit dem Titel.')}>
              <MediaField value={s.defaultImage} type="image" onChange={(v) => set('seo', { ...s, defaultImage: v })} />
            </Field>
          </Section>
          <Section title={t('Indexierung')}>
            <Toggle
              checked={!s.noindex}
              onChange={(v) => set('seo', { ...s, noindex: !v })}
              label={t('Suchmaschinen dürfen die Website aufnehmen')}
              help={t('Ausschalten, solange die Website noch im Aufbau ist.')}
            />
            <Toggle checked={s.indexNow} onChange={(v) => set('seo', { ...s, indexNow: v })} label={t('Bing & Co. bei Änderungen sofort benachrichtigen (IndexNow)')} />
            <Toggle
              checked={s.adult}
              onChange={(v) => set('seo', { ...s, adult: v })}
              label={t('Inhalte für Erwachsene kennzeichnen')}
              help={t('Für SafeSearch: Google zeigt die Website dann nicht bei eingeschaltetem Jugendschutz.')}
            />
            <p className="xsmall muted">
              Sitemap: <a href="/sitemap.xml">/sitemap.xml</a> · Robots: <a href="/robots.txt">/robots.txt</a>
            </p>
          </Section>
          <GscSection />
          <SearchSection />
          <Section title={t('Statistik')}>
            <Toggle
              checked={draft.analytics.enabled}
              onChange={(v) => set('analytics', { ...draft.analytics, enabled: v })}
              label={t('Besuche zählen (ohne Cookies)')}
              help={t('Ohne Einwilligungsbanner zulässig: keine Cookies, keine IP-Speicherung, keine Wiedererkennung über Tage.')}
            />
          </Section>
          <Section
            title={t('Weitere Statistik-Dienste')}
            sub={t(
              'Optional, zusätzlich zur eigenen Statistik. Was Cookies setzt, lädt erst nach Einwilligung – Besucher sehen dafür einen Hinweis mit «Nein, danke» und «Einverstanden». Danach die Datenschutzerklärung unter Rechtliches neu erzeugen.',
            )}
          >
            <div className="grid-2">
              <Field label={t('Plausible: Domain')} help={t('Wie bei Plausible eingetragen. Keine Cookies, kein Hinweis nötig.')}>
                <input
                  className="input mono"
                  value={draft.analytics.plausible.domain}
                  placeholder="beispiel.ch"
                  onChange={(e) => set('analytics', { ...draft.analytics, plausible: { ...draft.analytics.plausible, domain: e.target.value } })}
                />
              </Field>
              <Field label={t('Eigener Plausible-Server')} help={t('Leer lassen für plausible.io.')}>
                <input
                  className="input mono"
                  value={draft.analytics.plausible.host}
                  placeholder="https://plausible.io"
                  onChange={(e) => set('analytics', { ...draft.analytics, plausible: { ...draft.analytics.plausible, host: e.target.value } })}
                />
              </Field>
            </div>
            <div className="grid-2">
              <Field label={t('Matomo: Adresse')}>
                <input
                  className="input mono"
                  value={draft.analytics.matomo.url}
                  placeholder="https://statistik.beispiel.ch"
                  onChange={(e) => set('analytics', { ...draft.analytics, matomo: { ...draft.analytics.matomo, url: e.target.value } })}
                />
              </Field>
              <Field label={t('Matomo: Site-ID')}>
                <input
                  className="input mono"
                  inputMode="numeric"
                  value={draft.analytics.matomo.siteId}
                  placeholder="1"
                  onChange={(e) => set('analytics', { ...draft.analytics, matomo: { ...draft.analytics.matomo, siteId: e.target.value } })}
                />
              </Field>
            </div>
            <Toggle
              checked={draft.analytics.matomo.cookies}
              onChange={(v) => set('analytics', { ...draft.analytics, matomo: { ...draft.analytics.matomo, cookies: v } })}
              label={t('Matomo mit Cookies')}
              help={t('Erkennt Besucher über Tage wieder, läuft dafür erst nach Einwilligung. Ohne Cookies zählt Matomo ab dem ersten Aufruf.')}
            />
            <Field label={t('Google Analytics 4: Mess-ID')} help={t('Lädt erst nach Einwilligung. Ohne Einwilligung wird nichts an Google übertragen.')}>
              <input
                className="input mono"
                value={draft.analytics.ga4.id}
                placeholder="G-XXXXXXXXXX"
                onChange={(e) => set('analytics', { ...draft.analytics, ga4: { id: e.target.value } })}
              />
            </Field>
          </Section>
        </div>
      </div>
      <SaveBar dirty={dirty} onSave={save} onReset={reset} />
    </>
  );
}

interface GscStatus {
  configured: boolean;
  redirectUri: string;
  connected: boolean;
  email: string;
  site: string | null;
  sites: string[];
  connectedAt: string | null;
  sitemapAt: string | null;
}

/** Google Search Console: connect, choose the property, sitemap. */
function GscSection() {
  const toast = useToast();
  const { query } = usePath();
  const { data, setData } = useApi<GscStatus>('/api/gsc');
  const [busy, setBusy] = useState<string | null>(null);
  // Back from Google: say how it went, once.
  useEffect(() => {
    const r = query.get('gsc');
    if (!r) return;
    const msg: Record<string, [string, boolean]> = {
      verbunden: [t('Search Console verbunden, Sitemap eingereicht.'), true],
      property: [t('Search Console verbunden. Wähl noch die Property für diese Website.'), true],
      abgebrochen: [t('Die Verbindung wurde bei Google abgebrochen.'), false],
      abgelehnt: [t('Diese Antwort von Google passt nicht zu deiner Anfrage. Starte die Verbindung bitte nochmals.'), false],
      fehler: [t('Die Verbindung hat nicht geklappt. Prüf die Angaben des OAuth-Clients und versuch es nochmals.'), false],
    };
    const [text, ok] = msg[r] ?? msg.fehler;
    toast(text, { kind: ok ? 'info' : 'bad' });
    navigate('/einstellungen/seo', { replace: true });
  }, []);
  const run = async (what: string, fn: () => Promise<GscStatus | void>, done?: string) => {
    setBusy(what);
    try {
      const r = await fn();
      if (r) setData(r);
      if (done) toast(done);
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setBusy(null);
    }
  };
  if (!data) return null;
  return (
    <Section title={t('Google Search Console')} sub={t('Reicht die Sitemap bei Google ein und zeigt in der Statistik, mit welchen Suchbegriffen Leute die Website finden.')}>
      {!data.configured ? (
        <p className="small muted">
          {withEl(t('Dafür braucht es einen OAuth-Client bei Google (Typ «Webanwendung», Weiterleitungs-URI {uri}): {id} und {secret} in den Variablen des Dienstes setzen.'), {
            uri: <code>{data.redirectUri}</code>,
            id: <code>GOOGLE_CLIENT_ID</code>,
            secret: <code>GOOGLE_CLIENT_SECRET</code>,
          })}
        </p>
      ) : !data.connected ? (
        <div>
          <button
            type="button"
            className="btn"
            aria-busy={busy === 'connect' || undefined}
            onClick={() =>
              void run('connect', async () => {
                location.href = (await api.post<{ url: string }>('/api/gsc/connect')).url;
              })
            }
          >
            <Icon name="link" size="s" /> <span>{t('Mit Google verbinden')}</span>
          </button>
        </div>
      ) : (
        <div className="stack tight">
          <p className="small">
            {data.email ? t('Verbunden mit dem Google-Konto {email}.', { email: data.email }) : t('Mit Google verbunden.')}{' '}
            {data.sitemapAt ? t('Sitemap eingereicht am {date}.', { date: formatDate(data.sitemapAt) }) : ''}
          </p>
          {data.sites.length ? (
            <Field label={t('Property')} help={!data.site ? t('Keine Property passt genau zur Adresse der Website – wähl die richtige aus.') : undefined}>
              <Select
                value={data.site ?? ''}
                onChange={(v) => v && void run('site', () => api.post<GscStatus>('/api/gsc/site', { site: v }), t('Property gewählt, Sitemap eingereicht.'))}
                options={[
                  ...(data.site ? [] : [{ value: '', label: t('Bitte wählen') }]),
                  ...data.sites.map((x) => ({ value: x, label: x.replace(/^sc-domain:/, t('Domain: ')) })),
                ]}
              />
            </Field>
          ) : (
            <p className="small muted">{t('Dieses Google-Konto hat noch keine bestätigte Property. Füg die Website in der Search Console hinzu und verbinde danach neu.')}</p>
          )}
          <div className="row wrap">
            {data.site && (
              <button
                type="button"
                className="btn s"
                aria-busy={busy === 'sitemap' || undefined}
                onClick={() => void run('sitemap', () => api.post<GscStatus>('/api/gsc/sitemap'), t('Sitemap eingereicht.'))}
              >
                <span>{t('Sitemap erneut einreichen')}</span>
              </button>
            )}
            <button
              type="button"
              className="btn ghost s"
              aria-busy={busy === 'off' || undefined}
              onClick={() =>
                void run('off', async () => {
                  if (
                    await confirm({
                      title: t('Search Console trennen?'),
                      message: t('Nova gibt den Zugang bei Google zurück. In der Search Console selbst bleibt alles, wie es ist.'),
                      confirm: t('Trennen'),
                    })
                  )
                    return api.del<GscStatus>('/api/gsc');
                })
              }
            >
              <span>{t('Trennen')}</span>
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

/** Which search the website uses; Meilisearch with its state and a rebuild. */
function SearchSection() {
  const toast = useToast();
  const { data, reload } = useApi<{ engine: 'meilisearch' | 'postgres'; ok: boolean; at: string | null; error: string | null; documents: number }>('/api/search/status');
  const [busy, setBusy] = useState(false);
  const rebuild = async () => {
    setBusy(true);
    try {
      await api.post('/api/search/rebuild');
      toast(t('Suchindex neu aufgebaut.'));
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setBusy(false);
      void reload();
    }
  };
  if (!data) return null;
  return (
    <Section title={t('Suche auf der Website')}>
      {data.engine === 'meilisearch' ? (
        <div className="row wrap" style={{ justifyContent: 'space-between', gap: '0.75rem' }}>
          <p className="small" style={{ flex: '1 1 20rem' }}>
            {data.ok
              ? t('Meilisearch ist verbunden: {n} Einträge im Index, zuletzt abgeglichen {when}. Findet auch Wörter mit Tippfehlern und halb getippte Begriffe.', {
                  n: data.documents,
                  when: data.at ? formatDate(data.at) : '–',
                })
              : t('Meilisearch antwortet gerade nicht. Bis es wieder geht, sucht die Website in der Datenbank.')}
            {!data.ok && data.error && (
              <>
                {' '}
                <code className="xsmall">{data.error}</code>
              </>
            )}
          </p>
          <button type="button" className="btn s" onClick={() => void rebuild()} aria-busy={busy || undefined}>
            <span>{t('Index neu aufbauen')}</span>
          </button>
        </div>
      ) : (
        <p className="small muted">
          {withEl(t('Die Suche läuft über die Volltextsuche der Datenbank. Für eine Suche, die auch Tippfehler verzeiht, einen Meilisearch-Dienst hinzufügen und {var} setzen.'), {
            var: <code>MEILI_HOST</code>,
          })}
        </p>
      )}
    </Section>
  );
}

/* ---------- legal ---------- */

function LegalSettings() {
  const toast = useToast();
  const { bundle } = useSession();
  const { draft, set, dirty, save, reset } = useSettingsDraft();
  const { data, reload } = useApi<{ entries: { id: string; slug: string; status: string; title: string; changed: boolean }[] }>('/api/entries?collection=pages&limit=500');
  const legal = (data?.entries ?? []).filter((p) => ['impressum', 'datenschutz', 'agb'].includes(p.slug));
  const generate = async () => {
    if (
      legal.length &&
      !(await confirm({
        title: t('Texte neu erzeugen?'),
        message: t('Bestehende Entwürfe werden überschrieben. Ältere Fassungen bleiben im Verlauf.'),
        confirm: t('Neu erzeugen'),
      }))
    )
      return;
    try {
      await api.post('/api/legal/generate');
      toast(t('Texte erzeugt – bitte lesen, anpassen und veröffentlichen.'));
      void reload();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  if (!draft) return <Skeleton />;
  return (
    <>
      <PageHead
        title={t('Rechtliches')}
        sub={t('Nova erzeugt Impressum, Datenschutzerklärung und AGB aus dem, was deine Website tatsächlich tut – Formulare, Shop, Statistik, Einbettungen.')}
      />
      <div className="stack loose">
        <section className="card">
          <div className="card-head">
            <h2>{t('Rechtstexte')}</h2>
            <button className="btn primary s" onClick={generate}>
              {legal.length ? t('Neu erzeugen') : t('Texte erzeugen')}
            </button>
          </div>
          {legal.length ? (
            <ul className="list">
              {legal.map((p) => (
                <li key={p.id}>
                  <Link to={`/seiten/${p.id}`} className="list-item">
                    <Icon name="scale" className="faint" />
                    <span className="grow">{p.title}</span>
                    <span className={`badge ${p.status === 'published' ? 'ok' : ''}`}>{p.status === 'published' ? t('Online') : t('Entwurf – prüfen')}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="card-pad small muted">{t('Noch keine Rechtstexte.')}</p>
          )}
          <p className="card-pad xsmall muted" style={{ borderTop: '1px solid var(--line)' }}>
            {t('Das sind Vorlagen, keine Rechtsberatung. Lass sie prüfen, bevor du sie veröffentlichst – besonders bei Shop und Erwachsenen-Inhalten.')}
          </p>
        </section>
        <div className="card">
          <Section title={t('Einbettungen mit Zustimmung')} sub={t('Videos und Karten laden erst nach Klick (Zwei-Klick-Lösung). Ausschalten blendet sie ganz aus.')}>
            <Toggle checked={draft.consent.youtube} onChange={(v) => set('consent', { ...draft.consent, youtube: v })} label={t('YouTube (im Datenschutzmodus)')} />
            <Toggle checked={draft.consent.vimeo} onChange={(v) => set('consent', { ...draft.consent, vimeo: v })} label="Vimeo" />
            <Toggle checked={draft.consent.maps} onChange={(v) => set('consent', { ...draft.consent, maps: v })} label={t('Karte (OpenStreetMap)')} />
          </Section>
          <Section title={t('Altersschranke')} sub={t('Für Websites mit Inhalten für Erwachsene. Besucher bestätigen ihr Alter, bevor sie etwas sehen.')}>
            <Toggle checked={draft.ageGate.enabled} onChange={(v) => set('ageGate', { ...draft.ageGate, enabled: v })} label={t('Altersschranke anzeigen')} />
            {draft.ageGate.enabled && (
              <div className="grid-2">
                <Field label={t('Mindestalter')}>
                  <input
                    className="input num"
                    type="number"
                    min={16}
                    max={21}
                    value={draft.ageGate.minAge}
                    onChange={(e) => set('ageGate', { ...draft.ageGate, minAge: Number(e.target.value) })}
                  />
                </Field>
                <Field label={t('Hinweistext')}>
                  <input className="input" value={draft.ageGate.text} onChange={(e) => set('ageGate', { ...draft.ageGate, text: e.target.value })} />
                </Field>
              </div>
            )}
            {draft.ageGate.enabled && (
              <Field
                label={t('Prüfung')}
                help={
                  draft.ageGate.method === 'eid'
                    ? t(
                        'Besucher bestätigen ihr Alter mit der E-ID in der App swiyu. Bis dahin liefert die Website keine Inhalte aus – auch nicht über Feed und API. Bei 16 und 18 erfährst du nur «alt genug», bei anderen Grenzen wird das Geburtsdatum einmal geprüft und nicht gespeichert.',
                      )
                    : bundle?.system.eid
                      ? t('Wo das Gesetz eine echte Altersverifikation verlangt, reicht ein Klick nicht – dann die E-ID wählen.')
                      : t(
                          'Wo das Gesetz eine echte Altersverifikation verlangt, reicht ein Klick nicht. Für die Prüfung mit der E-ID braucht es einen eigenen swiyu-Verifier (SWIYU_VERIFIER_URL und SWIYU_ISSUER_DIDS, siehe README).',
                        )
                }
              >
                <Select
                  label={t('Prüfung')}
                  value={draft.ageGate.method === 'eid' && bundle?.system.eid ? 'eid' : 'self'}
                  onChange={(v) => set('ageGate', { ...draft.ageGate, method: v === 'eid' ? 'eid' : 'self' })}
                  options={[
                    { value: 'self', label: t('Selbstauskunft mit einem Klick') },
                    { value: 'eid', label: t('E-ID des Bundes (swiyu)'), disabled: !bundle?.system.eid },
                  ]}
                />
              </Field>
            )}
          </Section>
        </div>
      </div>
      <SaveBar dirty={dirty} onSave={save} onReset={reset} />
    </>
  );
}

/* ---------- domain ---------- */

function DomainSettings() {
  const { draft, set, dirty, save, reset } = useSettingsDraft();
  const { bundle } = useSession();
  if (!draft || !bundle) return <Skeleton />;
  const railway = bundle.system.publicUrl.replace(/^https?:\/\//, '');
  const custom = draft.baseUrl.replace(/^https?:\/\//, '');
  const apex = custom && custom.split('.').length === 2;
  return (
    <>
      <PageHead title={t('Domain')} sub={t('Deine Website ist sofort unter der Railway-Adresse erreichbar. Mit eigener Domain wirkt sie professioneller.')} />
      <div className="card">
        <Section title={t('Aktuelle Adresse')}>
          <div className="row">
            <Icon name="globe" />
            <span className="mono grow">{railway}</span>
            <span className="badge ok">{t('aktiv')}</span>
          </div>
        </Section>
        <Section title={t('Eigene Domain')} sub={t('So geht’s – Schritt für Schritt:')}>
          <Field label={t('Deine Domain')} help={t('Mit https://, ohne Pfad. Nova nutzt sie für Links, Sitemap und Social-Media-Vorschauen.')} htmlFor="d-url">
            <input id="d-url" className="input mono" value={draft.baseUrl} placeholder={t('https://www.meine-domain.ch')} onChange={(e) => set('baseUrl', e.target.value.trim())} />
          </Field>
          <ol className="small stack tight" style={{ paddingLeft: '1.2rem', margin: 0 }}>
            <li>
              {withEl(t('Öffne in Railway deinen Nova-Dienst → {path} und trag {domain} ein.'), {
                path: <strong>Settings → Networking → Custom Domain</strong>,
                domain: <span className="mono">{custom || t('www.meine-domain.ch')}</span>,
              })}
            </li>
            <li>
              {withEl(t('Railway zeigt dir einen {record} (Ziel endet auf {suffix}). Leg ihn bei deinem Domain-Anbieter (z. B. Hostpoint, Infomaniak, Cyon) an:'), {
                record: <strong>{t('CNAME-Eintrag')}</strong>,
                suffix: <span className="mono">.up.railway.app</span>,
              })}
              <pre className="code-out" style={{ marginTop: '0.5rem' }}>{`${t('Typ:')}   CNAME
${t('Name:')}  ${apex ? '@' : custom.split('.')[0] || 'www'}
${t('Ziel:')}  ${t('(aus Railway kopieren)')}`}</pre>
            </li>
            {apex && <li>{t('Für Domains ohne «www» braucht dein Anbieter CNAME-Flattening oder ALIAS. Sonst: www verwenden und die nackte Domain weiterleiten.')}</li>}
            <li>{t('Warten, bis Railway das Zertifikat ausgestellt hat (meist wenige Minuten, manchmal bis zu einer Stunde). Dann hier speichern.')}</li>
          </ol>
        </Section>
      </div>
      <SaveBar dirty={dirty} onSave={save} onReset={reset} />
    </>
  );
}

/* ---------- shop ---------- */

function ShopSettings() {
  const { draft, set, dirty, save, reset } = useSettingsDraft();
  const { bundle } = useSession();
  if (!draft || !bundle) return <Skeleton />;
  const sh = draft.shop;
  const setS = (patch: Partial<SiteSettings['shop']>) => set('shop', { ...sh, ...patch });
  const money = (v: number | null) => (v === null ? '' : (v / 100).toFixed(2));
  const parse = (v: string) => (v.trim() === '' ? null : Math.round(parseFloat(v.replace(',', '.')) * 100));
  return (
    <>
      <PageHead title={t('Shop')} />
      <div className="card">
        <Section title={t('Bezahlen')}>
          <div className="row">
            <span className={`dot ${bundle.system.stripe ? 'ok' : ''}`} />
            <span className="small grow">
              {t('Online-Zahlung (TWINT, Karte, Apple Pay, Google Pay via Stripe):')}{' '}
              {bundle.system.stripe ? (bundle.system.stripeWebhook ? t('eingerichtet') : t('Schlüssel da – Webhook-Secret fehlt noch')) : t('nicht eingerichtet')}
            </span>
          </div>
          {!bundle.system.stripeWebhook && (
            <p className="xsmall muted">
              {withEl(t('In Railway die Variablen {key} und {secret} setzen. Webhook-Ziel in Stripe: {url} mit den Ereignissen {events}.'), {
                key: <span className="mono">STRIPE_SECRET_KEY</span>,
                secret: <span className="mono">STRIPE_WEBHOOK_SECRET</span>,
                url: <span className="mono">{(draft.baseUrl || bundle.system.publicUrl) + '/_nova/stripe/webhook'}</span>,
                events: '«checkout.session.completed», «…async_payment_succeeded», «…async_payment_failed», «…expired»',
              })}{' '}
              {t('Welche Zahlarten (TWINT usw.) angeboten werden, stellst du im Stripe-Dashboard ein.')}
            </p>
          )}
          <Toggle checked={sh.invoiceEnabled} onChange={(v) => setS({ invoiceEnabled: v })} label={t('Kauf auf Rechnung anbieten')} />
          {sh.invoiceEnabled && (
            <>
              <Field
                label={t('IBAN für die QR-Rechnung')}
                help={t('Mit IBAN bekommt jede Rechnung den Schweizer QR-Zahlteil – die Kundschaft scannt ihn mit der Banking-App. QR-IBAN geht auch.')}
              >
                <input className="input mono" value={sh.iban} maxLength={40} placeholder="CH93 0076 2011 6238 5295 7" onChange={(e) => setS({ iban: e.target.value })} />
              </Field>
              <Field label={t('Weitere Zahlungsangaben')} help={t('Erscheint auf der Rechnung, z. B. Bank oder Zahlungsfrist.')}>
                <textarea className="textarea" style={{ minHeight: '4rem' }} value={sh.invoiceNote} onChange={(e) => setS({ invoiceNote: e.target.value })} />
              </Field>
            </>
          )}
        </Section>
        <Section title={t('Mehrwertsteuer')} sub={t('Preise werden inklusive MwSt. erfasst und angezeigt.')}>
          <div className="grid-2">
            <Field label={t('Normalsatz %')}>
              <input
                className="input num"
                type="number"
                step="0.1"
                value={sh.vatRates.standard}
                onChange={(e) => setS({ vatRates: { ...sh.vatRates, standard: Number(e.target.value) } })}
              />
            </Field>
            <Field label={t('Reduzierter Satz %')}>
              <input
                className="input num"
                type="number"
                step="0.1"
                value={sh.vatRates.reduced}
                onChange={(e) => setS({ vatRates: { ...sh.vatRates, reduced: Number(e.target.value) } })}
              />
            </Field>
          </div>
        </Section>
        <Section title={t('Versand')}>
          <div className="grid-2">
            <Field label={t('Versandkosten (CHF)')}>
              <input
                className="input num"
                inputMode="decimal"
                defaultValue={money(sh.shipping.flat)}
                onBlur={(e) => setS({ shipping: { ...sh.shipping, flat: parse(e.target.value) ?? 0 } })}
              />
            </Field>
            <Field label={t('Gratis ab (CHF)')} help={t('Leer = nie gratis')}>
              <input
                className="input num"
                inputMode="decimal"
                defaultValue={money(sh.shipping.freeFrom)}
                onBlur={(e) => setS({ shipping: { ...sh.shipping, freeFrom: parse(e.target.value) } })}
              />
            </Field>
          </div>
          <Toggle checked={sh.shipping.pickup} onChange={(v) => setS({ shipping: { ...sh.shipping, pickup: v } })} label={t('Abholung anbieten')} />
          <Field label={t('Lieferländer')} help={t('Ländercodes, z. B. CH, LI, DE, AT')}>
            <input
              className="input mono"
              value={sh.shipping.countries.join(', ')}
              onChange={(e) =>
                setS({
                  shipping: {
                    ...sh.shipping,
                    countries: e.target.value
                      .split(/[,\s]+/)
                      .map((x) => x.toUpperCase())
                      .filter((x) => /^[A-Z]{2}$/.test(x)),
                  },
                })
              }
            />
          </Field>
        </Section>
        <Section title={t('Bestellungen')}>
          <div className="grid-2">
            <Field label={t('Benachrichtigung an')} help={t('Leer = Kontakt-E-Mail')}>
              <input className="input" type="email" value={sh.notifyEmail} onChange={(e) => setS({ notifyEmail: e.target.value })} />
            </Field>
            <Field label={t('Präfix der Bestellnummer')}>
              <input className="input mono" value={sh.orderPrefix} onChange={(e) => setS({ orderPrefix: e.target.value })} />
            </Field>
          </div>
        </Section>
      </div>
      <SaveBar dirty={dirty} onSave={save} onReset={reset} />
    </>
  );
}

/* ---------- modules ---------- */

function ModuleSettings() {
  const { draft, set, dirty, save, reset } = useSettingsDraft();
  const { bundle } = useSession();
  if (!draft) return <Skeleton />;
  const aiKey = Boolean(bundle?.system.ai);
  return (
    <>
      <PageHead
        title={t('Module')}
        sub={t('Was 80 % aller Websites brauchen, ist eingebaut. Schalt ein, was du nutzt – ausgeschaltete Module verschwinden aus der Verwaltung, ihre Daten bleiben erhalten.')}
      />
      <div className="card">
        {MODULES.map((m) => (
          <div key={m.id} className="form-section">
            <Toggle
              checked={draft.modules.includes(m.id)}
              onChange={(v) => m.status === 'ready' && set('modules', v ? [...draft.modules, m.id] : draft.modules.filter((x) => x !== m.id))}
              label={
                <>
                  {tl(m.name)} {m.status === 'later' && <span className="badge">{t('Version 1.0')}</span>}
                </>
              }
              help={tl(m.description)}
            />
          </div>
        ))}
      </div>
      <div className="card" style={{ marginTop: '1rem' }}>
        <Section
          title={t('KI-Assistent')}
          sub={t('Schlägt bessere Formulierungen, Bildbeschreibungen und Übersetzungsentwürfe vor. Es ist immer nur ein Vorschlag – übernommen wird nur, was du bestätigst.')}
        >
          <Toggle
            checked={aiKey && draft.ai.enabled}
            onChange={(v) => aiKey && set('ai', { ...draft.ai, enabled: v })}
            label={t('KI-Assistent anbieten')}
            help={
              aiKey
                ? t(
                    'Texte und Bilder, für die jemand einen Vorschlag anfordert, gehen für diese eine Anfrage an Anthropic (USA). Anthropic verwendet sie nicht zum Trainieren. Inhalte von Besuchern werden nie übermittelt.',
                  )
                : withEl(t('Dafür braucht es einen Schlüssel von Anthropic: {var} in den Variablen des Railway-Dienstes setzen, danach neu starten.'), {
                    var: <code>ANTHROPIC_API_KEY</code>,
                  })
            }
          />
        </Section>
      </div>
      <SaveBar dirty={dirty} onSave={save} onReset={reset} />
    </>
  );
}

/* ---------- team ---------- */

function TeamSettings() {
  const { user: me, pro } = useSession();
  const toast = useToast();
  const { data, reload } = useApi<{ users: User[] }>('/api/users');
  const { draft, set, dirty, save, reset } = useSettingsDraft();
  const [invite, setInvite] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'editor' as Role });
  const [secret, setSecret] = useState<{ email: string; password: string; mailed: boolean } | null>(null);
  const create = async () => {
    try {
      const r = await api.post<{ temporaryPassword: string; mailed: boolean }>('/api/users', form);
      setSecret({ email: form.email, password: r.temporaryPassword, mailed: r.mailed });
      setInvite(false);
      setForm({ name: '', email: '', role: 'editor' });
      void reload();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  const changeRole = async (u: User, role: Role) => {
    try {
      await api.patch(`/api/users/${u.id}`, { role });
      void reload();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  return (
    <>
      <PageHead
        title={t('Team & Rollen')}
        actions={
          <button className="btn primary" onClick={() => setInvite(true)}>
            <Icon name="plus" size="s" /> {t('Person hinzufügen')}
          </button>
        }
      />
      <div className="stack loose">
        <section className="card">
          {!data ? (
            <Skeleton />
          ) : (
            <ul className="list">
              {data.users.map((u) => (
                <li key={u.id} className="list-item">
                  <Icon name="user" className="faint" />
                  <div className="grow">
                    <div className="title">
                      {u.name} {u.id === me.id && <span className="faint small">{t('(du)')}</span>}
                    </div>
                    <div className="xsmall muted">
                      {u.email} · {u.last_login_at ? t('zuletzt {date}', { date: formatDate(u.last_login_at) }) : t('noch nie angemeldet')}
                      {u.totp_enabled ? ' · 2FA' : ''}
                    </div>
                  </div>
                  <Select
                    inline
                    label={t('Rolle von {name}', { name: u.name })}
                    value={u.role}
                    disabled={u.id === me.id}
                    onChange={(v) => void changeRole(u, v as Role)}
                    options={ROLE_ORDER.map((r) => ({ value: r, label: tl(ROLE_LABELS[r].name) }))}
                  />
                  {u.id !== me.id && (
                    <Menu
                      trigger={
                        <button className="btn ghost s icon-only" aria-label={t('Aktionen')}>
                          <Icon name="more" />
                        </button>
                      }
                      items={[
                        {
                          label: t('Passwort zurücksetzen'),
                          icon: 'key',
                          onSelect: async () => {
                            if (
                              !(await confirm({
                                title: t('Passwort von {name} zurücksetzen?', { name: u.name }),
                                message: t('Alle Sitzungen werden beendet und 2FA wird ausgeschaltet.'),
                                confirm: t('Zurücksetzen'),
                              }))
                            )
                              return;
                            const r = await api.post<{ temporaryPassword: string }>(`/api/users/${u.id}/reset`);
                            setSecret({ email: u.email, password: r.temporaryPassword, mailed: false });
                          },
                        },
                        {
                          label: t('Entfernen'),
                          icon: 'trash',
                          danger: true,
                          onSelect: async () => {
                            if (
                              !(await confirm({
                                title: t('{name} entfernen?', { name: u.name }),
                                message: t('Inhalte der Person bleiben erhalten.'),
                                confirm: t('Entfernen'),
                                danger: true,
                              }))
                            )
                              return;
                            await api.del(`/api/users/${u.id}`);
                            void reload();
                          },
                        },
                      ]}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card card-pad stack tight">
          <h2 className="section-title">{t('Was die Rollen dürfen')}</h2>
          <dl className="small" style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.35rem 1rem' }}>
            {ROLE_ORDER.map((r) => (
              <div key={r} style={{ display: 'contents' }}>
                <dt style={{ fontWeight: 600 }}>{tl(ROLE_LABELS[r].name)}</dt>
                <dd style={{ margin: 0 }} className="muted">
                  {tl(ROLE_LABELS[r].help)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
        {pro && draft && (
          <section className="card">
            <div className="card-head">
              <h2>{t('Welche Rolle sieht welchen Modus')}</h2>
            </div>
            <div className="form-section">
              {(['editor', 'author'] as Role[]).map((r) => (
                <Toggle
                  key={r}
                  checked={draft.roleModes[r].includes('werkbank')}
                  onChange={(v) => set('roleModes', { ...draft.roleModes, [r]: v ? ['studio', 'werkbank'] : ['studio'] })}
                  label={t('{role} darf die Werkbank nutzen', { role: tl(ROLE_LABELS[r].name) })}
                  help={r === 'editor' ? t('Aus: Redaktion arbeitet nur im Studio und sieht keinen Code.') : undefined}
                />
              ))}
            </div>
          </section>
        )}
      </div>
      <SaveBar dirty={dirty} onSave={save} onReset={reset} />
      <Dialog open={invite} onOpenChange={setInvite} title={t('Person hinzufügen')}>
        <div className="stack">
          <div className="grid-2">
            <Field label={t('Name')}>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </Field>
            <Field label={t('E-Mail')}>
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
          </div>
          <Field label={t('Rolle')} help={tl(ROLE_LABELS[form.role].help)}>
            <Segmented
              label={t('Rolle')}
              value={form.role}
              onChange={(r) => setForm({ ...form, role: r })}
              options={(['admin', 'editor', 'author'] as Role[]).map((r) => ({ value: r, label: tl(ROLE_LABELS[r].name) }))}
            />
          </Field>
        </div>
        <div className="dialog-actions">
          <button className="btn ghost" onClick={() => setInvite(false)}>
            {t('Abbrechen')}
          </button>
          <button className="btn primary" onClick={create} disabled={!form.name || !form.email}>
            {t('Hinzufügen')}
          </button>
        </div>
      </Dialog>
      <Dialog
        open={Boolean(secret)}
        onOpenChange={(o) => !o && setSecret(null)}
        title={t('Vorläufiges Passwort')}
        description={secret?.mailed ? t('Wir haben die Zugangsdaten auch per E-Mail geschickt.') : t('Gib es persönlich weiter – es wird nur jetzt angezeigt.')}
      >
        {secret && (
          <div className="stack tight">
            <span className="small muted">{secret.email}</span>
            <code className="code-out" style={{ fontSize: '1.1rem' }}>
              {secret.password}
            </code>
          </div>
        )}
        <div className="dialog-actions">
          <button className="btn primary" onClick={() => setSecret(null)}>
            {t('Notiert')}
          </button>
        </div>
      </Dialog>
    </>
  );
}

/* ---------- data & privacy ---------- */

interface PersonData {
  counts: Record<string, number>;
}

/** «3 Kontakte», «1 Bestellung» … for the data kinds a person can have. */
function count(kind: string, n: number): string {
  const one = n === 1;
  switch (kind) {
    case 'contacts':
      return one ? t('1 Kontakt') : t('{n} Kontakte', { n });
    case 'submissions':
      return one ? t('1 Formulareintrag') : t('{n} Formulareinträge', { n });
    case 'orders':
      return one ? t('1 Bestellung') : t('{n} Bestellungen', { n });
    case 'comments':
      return one ? t('1 Kommentar') : t('{n} Kommentare', { n });
    case 'users':
      return one ? t('1 Benutzerkonto') : t('{n} Benutzerkonten', { n });
    case 'bookings':
      return one ? t('1 Reservation') : t('{n} Reservationen', { n });
    case 'subscribers':
      return one ? t('1 Newsletter-Anmeldung') : t('{n} Newsletter-Anmeldungen', { n });
    case 'members':
      return one ? t('1 Mitgliederkonto') : t('{n} Mitgliederkonten', { n });
    case 'ticketOrders':
      return one ? t('1 Ticketbestellung') : t('{n} Ticketbestellungen', { n });
    case 'waitlist':
      return one ? t('1 Wartelisten-Eintrag') : t('{n} Wartelisten-Einträge', { n });
    case 'donations':
      return one ? t('1 Spende') : t('{n} Spenden', { n });
    case 'foodOrders':
      return one ? t('1 Essensbestellung') : t('{n} Essensbestellungen', { n });
    default:
      return `${n} ${kind}`;
  }
}

function DataSettings() {
  const toast = useToast();
  const { bundle, can } = useSession();
  const backups = useApi<{ backups: { id: string; size: number; kind: string; created_at: string }[] }>('/api/backups');
  const [email, setEmail] = useState('');
  const [person, setPerson] = useState<PersonData | null>(null);
  const lookup = async () => {
    try {
      setPerson(await api.get<PersonData>(`/api/privacy?email=${encodeURIComponent(email)}`));
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  const erase = async () => {
    if (
      !(await confirm({
        title: t('Alle Daten von {email} löschen?', { email }),
        message: t(
          'Formulareinträge, Kontakt, Kommentare und Newsletter-Anmeldung werden gelöscht. Bestellungen werden anonymisiert (Aufbewahrungspflicht), Reservationen bleiben als belegte Zeit ohne Namen.',
        ),
        confirm: t('Löschen'),
        danger: true,
      }))
    )
      return;
    try {
      const r = await api.post<{ deleted: Record<string, number>; anonymizedOrders: number; anonymizedBookings: number }>('/api/privacy/delete', { email });
      const orders = r.anonymizedOrders ? count('orders', r.anonymizedOrders) : '';
      const bookings = r.anonymizedBookings ? count('bookings', r.anonymizedBookings) : '';
      const kept = orders && bookings ? t('{a} und {b}', { a: orders, b: bookings }) : orders || bookings;
      const deleted = [
        r.deleted.submissions === 1 ? t('1 Eintrag') : t('{n} Einträge', { n: r.deleted.submissions }),
        count('contacts', r.deleted.contacts),
        count('comments', r.deleted.comments),
        r.deleted.subscribers ? t('Newsletter-Anmeldung') : '',
        r.deleted.members ? t('Mitgliederkonto') : '',
      ].filter(Boolean);
      toast(`${t('Gelöscht: {list}.', { list: deleted.join(', ') })}${kept ? ` ${t('{list} anonymisiert.', { list: kept })}` : ''}`);
      setPerson(null);
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  return (
    <>
      <PageHead title={t('Daten & Datenschutz')} sub={t('Deine Daten gehören dir. Alles lässt sich jederzeit exportieren – ohne Umweg über den Support.')} />
      <div className="stack loose">
        <section className="card card-pad stack">
          <div className="row between wrap">
            <div>
              <h2 style={{ fontSize: 'var(--t-m)', fontWeight: 650 }}>{t('Alles exportieren')}</h2>
              <p className="small muted">{t('ZIP mit Inhalten (JSON + Markdown), Konfiguration als Code, Original-Medien und CSV für Kontakte, Bestellungen, Formulare.')}</p>
            </div>
            <a className="btn primary" href="/api/export">
              <Icon name="download" size="s" /> {t('Export herunterladen')}
            </a>
          </div>
        </section>
        <section className="card card-pad stack tight">
          <h2 style={{ fontSize: 'var(--t-m)', fontWeight: 650 }}>{t('Hochgeladene Dateien prüfen')}</h2>
          <p className="small muted">
            {t(
              'Jede Datei – aus der Mediathek und aus Formularen der Website – wird vor dem Speichern geprüft: keine Programme, keine Office-Makros, keine Archive mit Programmen, keine PDFs mit JavaScript oder angehängten Dateien.',
            )}{' '}
            {bundle?.system.clamav
              ? t('Zusätzlich sucht ClamAV mit seinen Signaturen nach Schadsoftware. Funde werden abgelehnt und in den Benachrichtigungen gemeldet.')
              : withEl(t('Für eine Virenprüfung mit Signaturen einen ClamAV-Dienst hinzufügen und {var} setzen.'), { var: <code>CLAMAV_HOST</code> })}
          </p>
        </section>
        <section className="card">
          <div className="card-head">
            <h2>{t('Auskunft & Löschung')}</h2>
          </div>
          <div className="form-section">
            <p className="small muted">{t('Jemand möchte wissen, was du über sie oder ihn gespeichert hast – oder es löschen lassen? Gib die E-Mail-Adresse ein.')}</p>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                void lookup();
              }}
            >
              <input className="input grow" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('person@beispiel.ch')} />
              <button className="btn">{t('Suchen')}</button>
            </form>
            {person && (
              <div className="stack tight">
                <p className="small">
                  {Object.entries(person.counts)
                    .map(([k, v]) => count(k, v))
                    .join(' · ')}
                </p>
                <div className="row">
                  <a className="btn" href={`/api/privacy?email=${encodeURIComponent(email)}&download=1`}>
                    <Icon name="download" size="s" /> {t('Auskunft als Datei')}
                  </a>
                  <button className="btn danger" onClick={erase}>
                    <Icon name="trash" size="s" /> {t('Alles löschen')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <h2>{t('Sicherungen')}</h2>
            <button
              className="btn s"
              onClick={async () => {
                await api.post('/api/backups');
                toast(t('Sicherung erstellt.'));
                void backups.reload();
              }}
            >
              {t('Jetzt sichern')}
            </button>
          </div>
          <p className="card-pad small muted" style={{ paddingBottom: 0 }}>
            {t('Nova sichert alle Inhalte täglich in den Bucket und behält 30 Tage. Medien liegen ohnehin im Bucket. Railway Postgres hat zusätzlich eigene Backups.')}
          </p>
          {!backups.data ? (
            <Skeleton />
          ) : !backups.data.backups.length ? (
            <p className="card-pad small muted">{t('Die erste Sicherung entsteht in der nächsten Stunde.')}</p>
          ) : (
            <ul className="list" style={{ marginTop: '0.75rem' }}>
              {backups.data.backups.map((b) => (
                <li key={b.id} className="list-item">
                  <Icon name="backup" className="faint" />
                  <span className="grow small">
                    {formatDate(b.created_at, true)} · {b.kind === 'auto' ? t('automatisch') : t('manuell')} · {Math.max(1, Math.round(b.size / 1024))} KB
                  </span>
                  <a className="btn ghost s" href={`/api/backups/${b.id}/download`}>
                    {t('Herunterladen')}
                  </a>
                  {can('data.sql') && (
                    <button
                      className="btn ghost s"
                      onClick={async () => {
                        if (
                          !(await confirm({
                            title: t('Diese Sicherung wiederherstellen?'),
                            message: t(
                              'Alle Inhalte, Formulare, Kontakte und Bestellungen werden auf diesen Stand gesetzt. Vorher legt Nova automatisch eine Sicherung des aktuellen Stands an.',
                            ),
                            confirm: t('Wiederherstellen'),
                            danger: true,
                          }))
                        )
                          return;
                        try {
                          await api.post(`/api/backups/${b.id}/restore`);
                          toast(t('Wiederhergestellt.'));
                          setTimeout(() => location.reload(), 800);
                        } catch (e) {
                          toast((e as Error).message, { kind: 'bad' });
                        }
                      }}
                    >
                      {t('Wiederherstellen')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        {bundle && (
          <section className="card card-pad stack tight">
            <h2 className="section-title">{t('System')}</h2>
            <p className="small row">
              <span className={`dot ${bundle.system.storage === 'bucket' ? 'ok' : 'edited'}`} /> {t('Dateispeicher:')}{' '}
              {bundle.system.storage === 'bucket' ? 'Railway Bucket' : t('lokal – für Railway Bucket-Variablen setzen, sonst gehen Uploads beim Neustart verloren')}
            </p>
            <p className="small row">
              <span className={`dot ${bundle.system.mail ? 'ok' : 'edited'}`} /> {t('E-Mail-Versand:')}{' '}
              {bundle.system.mail ? t('eingerichtet') : t('nicht eingerichtet (RESEND_API_KEY oder SMTP_URL)')}
              {bundle.system.mail && (
                <button
                  className="linkish xsmall"
                  onClick={() => api.post<{ ok: boolean }>('/api/mail/test').then((r) => toast(r.ok ? t('Test-Mail ist unterwegs.') : t('Versand fehlgeschlagen – siehe Logs.')))}
                >
                  {t('Test senden')}
                </button>
              )}
            </p>
          </section>
        )}
      </div>
    </>
  );
}

import { Reorder, useDragControls } from 'motion/react';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { useApi, formatDate } from '../lib/hooks';
import { Link, navigate } from '../lib/router';
import { useSession } from '../lib/session';
import { entryUrl } from '../lib/actions';
import { Dialog, Field, Menu, PageHead, Segmented, Select, Skeleton, SuggestInput, TimeInput, Toggle, confirm } from '../ui/kit';
import { MediaField } from '../ui/FieldInput';
import { LoadingFrame } from '../ui/loading';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/toast';
import { DAY_NAMES } from '../../shared/hours';
import { MODULES } from '../../shared/collections';
import { ROLE_LABELS, ROLE_ORDER, type Capability } from '../../shared/roles';
import { shortId } from '../../shared/text';
import type { NavItem, OpeningHoursDay, Role, SiteSettings, User } from '../../shared/types';
import { ContentTypes, CodeSettings, ApiSettings, Redirects, SqlConsole, AuditLog } from './SettingsPro';
import { SaveBar, useSettingsDraft } from './settingsDraft';

interface Section {
  id: string;
  label: string;
  icon: string;
  cap?: Capability;
  pro?: boolean;
  module?: string;
}

const SECTIONS: Section[] = [
  { id: 'website', label: 'Name, Logo & Kontakt', icon: 'globe', cap: 'settings.manage' },
  { id: 'design', label: 'Design', icon: 'style', cap: 'design.manage' },
  { id: 'navigation', label: 'Menü & Fusszeile', icon: 'nav', cap: 'settings.manage' },
  { id: 'seo', label: 'Suchmaschinen', icon: 'seo', cap: 'settings.manage' },
  { id: 'rechtliches', label: 'Rechtliches', icon: 'scale', cap: 'settings.manage' },
  { id: 'domain', label: 'Domain', icon: 'globe', cap: 'settings.manage' },
  { id: 'shop', label: 'Shop', icon: 'bag', cap: 'settings.manage', module: 'shop' },
  { id: 'module', label: 'Module', icon: 'grid', cap: 'settings.manage' },
  { id: 'team', label: 'Team & Rollen', icon: 'people', cap: 'users.manage' },
  { id: 'daten', label: 'Daten & Datenschutz', icon: 'database', cap: 'privacy.manage' },
  { id: 'typen', label: 'Inhaltstypen', icon: 'database', cap: 'dev', pro: true },
  { id: 'code', label: 'CSS & Tokens', icon: 'code', cap: 'dev', pro: true },
  { id: 'api', label: 'API & Webhooks', icon: 'webhook', cap: 'dev', pro: true },
  { id: 'weiterleitungen', label: 'Weiterleitungen', icon: 'arrowRight', cap: 'settings.manage', pro: true },
  { id: 'sql', label: 'SQL-Abfrage', icon: 'database', cap: 'data.sql', pro: true },
  { id: 'protokoll', label: 'Protokoll', icon: 'history', cap: 'audit.view', pro: true },
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
        <PageHead title="Einstellungen" />
        <Link to="/konto" className="btn">
          Mein Konto
        </Link>
      </div>
    );
  return (
    <div className="page wide">
      <div className="settings">
        <nav className="settings-nav" aria-label="Einstellungen">
          <span className="section-title">Website</span>
          {visible
            .filter((s) => !s.pro)
            .map((s) => (
              <Link key={s.id} to={`/einstellungen/${s.id}`} aria-current={s.id === current.id ? 'page' : undefined}>
                <Icon name={s.icon} size="s" /> {s.label}
              </Link>
            ))}
          {pro && <span className="section-title">Werkbank</span>}
          {visible
            .filter((s) => s.pro)
            .map((s) => (
              <Link key={s.id} to={`/einstellungen/${s.id}`} aria-current={s.id === current.id ? 'page' : undefined}>
                <Icon name={s.icon} size="s" /> {s.label}
              </Link>
            ))}
          <span className="section-title">Ich</span>
          <Link to="/konto">
            <Icon name="user" size="s" /> Mein Konto
          </Link>
        </nav>
        <div style={{ minWidth: 0 }}>
          {current.id === 'website' && <WebsiteSettings />}
          {current.id === 'design' && <DesignSettings />}
          {current.id === 'navigation' && <NavigationSettings />}
          {current.id === 'seo' && <SeoSettings />}
          {current.id === 'rechtliches' && <LegalSettings />}
          {current.id === 'domain' && <DomainSettings />}
          {current.id === 'shop' && <ShopSettings />}
          {current.id === 'module' && <ModuleSettings />}
          {current.id === 'team' && <TeamSettings />}
          {current.id === 'daten' && <DataSettings />}
          {current.id === 'typen' && <ContentTypes />}
          {current.id === 'code' && <CodeSettings />}
          {current.id === 'api' && <ApiSettings />}
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

/* ---------- website ---------- */

function HoursEditor({ hours, onChange }: { hours: OpeningHoursDay[]; onChange: (h: OpeningHoursDay[]) => void }) {
  const set = (day: number, patch: Partial<OpeningHoursDay>) => onChange(hours.map((h) => (h.day === day ? { ...h, ...patch } : h)));
  const copyFromMonday = () => {
    const mon = hours.find((h) => h.day === 1);
    if (mon) onChange(hours.map((h) => (h.day <= 5 ? { ...mon, day: h.day, slots: mon.slots.map((s) => ({ ...s })) } : h)));
  };
  return (
    <div className="stack tight">
      {[...hours]
        .sort((a, b) => a.day - b.day)
        .map((h) => (
          <div key={h.day} className="row wrap" style={{ gap: '0.6rem', alignItems: 'center' }}>
            <span style={{ width: '6.5rem', fontWeight: 550 }} className="small">
              {DAY_NAMES[h.day]}
            </span>
            <label className="check small" style={{ width: '7.5rem' }}>
              <input type="checkbox" checked={!h.closed} onChange={(e) => set(h.day, { closed: !e.target.checked, slots: e.target.checked && !h.slots.length ? [{ from: '09:00', to: '18:00' }] : h.slots })} />
              {h.closed ? 'geschlossen' : 'geöffnet'}
            </label>
            {!h.closed &&
              h.slots.map((s, i) => (
                <span key={i} className="row" style={{ gap: '0.3rem' }}>
                  <TimeInput label={`${DAY_NAMES[h.day]} von`} value={s.from} onChange={(v) => set(h.day, { slots: h.slots.map((x, j) => (j === i ? { ...x, from: v } : x)) })} />
                  –
                  <TimeInput label={`${DAY_NAMES[h.day]} bis`} value={s.to} onChange={(v) => set(h.day, { slots: h.slots.map((x, j) => (j === i ? { ...x, to: v } : x)) })} />
                  {h.slots.length > 1 && (
                    <button className="btn ghost s icon-only" aria-label="Zeitfenster entfernen" onClick={() => set(h.day, { slots: h.slots.filter((_, j) => j !== i) })}>
                      <Icon name="x" size="s" />
                    </button>
                  )}
                </span>
              ))}
            {!h.closed && h.slots.length < 3 && (
              <button className="btn ghost s" onClick={() => set(h.day, { slots: [...h.slots, { from: '14:00', to: '18:00' }] })}>
                + Mittagspause
              </button>
            )}
          </div>
        ))}
      <button className="linkish small" style={{ justifySelf: 'start' }} onClick={copyFromMonday}>
        Montag auf Dienstag bis Freitag übertragen
      </button>
    </div>
  );
}

function WebsiteSettings() {
  const { draft, set, dirty, save, reset } = useSettingsDraft();
  if (!draft) return <Skeleton />;
  const b = draft.business;
  const setB = (patch: Partial<SiteSettings['business']>) => set('business', { ...b, ...patch });
  return (
    <>
      <PageHead title="Name, Logo & Kontakt" sub="Diese Angaben erscheinen auf der Website, im Footer, im Impressum und bei Google." />
      <div className="card">
        <Section title="Website">
          <div className="grid-2">
            <Field label="Name" htmlFor="s-name">
              <input id="s-name" className="input" value={draft.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Kurzbeschreibung" htmlFor="s-tag" help="Erscheint auf der Startseite im Browser-Tab und bei Google.">
              <input id="s-tag" className="input" value={draft.tagline} onChange={(e) => set('tagline', e.target.value)} />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Logo">
              <MediaField value={draft.logo} type="image" onChange={(v) => set('logo', v)} />
            </Field>
            <Field label="Icon im Browser-Tab" help="Leer = Logo oder Anfangsbuchstabe.">
              <MediaField value={draft.favicon} type="image" onChange={(v) => set('favicon', v)} />
            </Field>
          </div>
        </Section>
        <Section title="Kontakt & Adresse">
          <div className="grid-2">
            <Field label="Firmenname (offiziell)">
              <input className="input" value={b.legalName} onChange={(e) => setB({ legalName: e.target.value })} />
            </Field>
            <Field label="UID-Nummer" help="z. B. CHE-123.456.789 – für Impressum und Rechnungen.">
              <input className="input" value={b.uid} onChange={(e) => setB({ uid: e.target.value })} />
            </Field>
            <Field label="Strasse und Nr.">
              <input className="input" value={b.street} onChange={(e) => setB({ street: e.target.value })} autoComplete="street-address" />
            </Field>
            <div className="grid-2" style={{ gridTemplateColumns: '6rem 1fr', gap: '0.5rem' }}>
              <Field label="PLZ">
                <input className="input" value={b.zip} onChange={(e) => setB({ zip: e.target.value })} inputMode="numeric" />
              </Field>
              <Field label="Ort">
                <input className="input" value={b.city} onChange={(e) => setB({ city: e.target.value })} />
              </Field>
            </div>
            <Field label="Telefon">
              <input className="input" type="tel" value={b.phone} onChange={(e) => setB({ phone: e.target.value })} />
            </Field>
            <Field label="E-Mail" help="Hierhin gehen auch Formular-Benachrichtigungen.">
              <input className="input" type="email" value={b.email} onChange={(e) => setB({ email: e.target.value })} />
            </Field>
          </div>
          {b.lat && <p className="xsmall faint">Auf der Karte gefunden ({b.lat.toFixed(4)}, {b.lng?.toFixed(4)}).</p>}
        </Section>
        <Section title="Öffnungszeiten" id="zeiten" sub="Erscheinen im Block «Öffnungszeiten», im Footer und bei Google. «Jetzt geöffnet» rechnet Nova selbst aus.">
          <HoursEditor hours={draft.hours} onChange={(h) => set('hours', h)} />
          <Field label="Hinweis zu den Zeiten" help="z. B. «Betriebsferien 20. Juli bis 10. August»">
            <input className="input" value={draft.hoursNote} onChange={(e) => set('hoursNote', e.target.value)} />
          </Field>
        </Section>
        <Section title="Social Media">
          {draft.social.map((s, i) => (
            <div key={i} className="row">
              <input className="input" style={{ maxWidth: '10rem' }} value={s.label} placeholder="Instagram" onChange={(e) => set('social', draft.social.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <input className="input grow" value={s.href} placeholder="https://instagram.com/…" onChange={(e) => set('social', draft.social.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)))} />
              <button className="btn ghost icon-only" aria-label="Entfernen" onClick={() => set('social', draft.social.filter((_, j) => j !== i))}>
                <Icon name="x" size="s" />
              </button>
            </div>
          ))}
          <button className="btn s" style={{ justifySelf: 'start' }} onClick={() => set('social', [...draft.social, { label: '', href: '' }])}>
            <Icon name="plus" size="s" /> Profil hinzufügen
          </button>
        </Section>
        <Section title="Geschäftsart für Google" sub="Bestimmt die strukturierten Daten (schema.org).">
          <div className="grid-2">
            <Field label="Art">
              <Select
                value={b.type}
                onChange={(v) => setB({ type: v })}
                options={[
                  ['LocalBusiness', 'Lokales Geschäft'],
                  ['Restaurant', 'Restaurant'],
                  ['CafeOrCoffeeShop', 'Café'],
                  ['BarOrPub', 'Bar'],
                  ['Store', 'Laden'],
                  ['BeautySalon', 'Coiffeur / Kosmetik'],
                  ['MedicalBusiness', 'Praxis'],
                  ['HomeAndConstructionBusiness', 'Handwerk'],
                  ['ProfessionalService', 'Dienstleistung'],
                  ['LodgingBusiness', 'Hotel / Unterkunft'],
                  ['SportsOrganization', 'Verein'],
                  ['NGO', 'Non-Profit'],
                  ['Organization', 'Organisation'],
                ].map(([value, label]) => ({ value, label }))}
              />
            </Field>
            <Field label="Preisniveau" help="z. B. «CHF 20–50»">
              <input className="input" value={b.priceRange} onChange={(e) => setB({ priceRange: e.target.value })} />
            </Field>
            {['Restaurant', 'CafeOrCoffeeShop', 'BarOrPub'].includes(b.type) && (
              <Field label="Küche" help="z. B. «Schweizer Küche, saisonal»">
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
  const t = draft.theme;
  const setT = (patch: Partial<SiteSettings['theme']>) => set('theme', { ...t, ...patch });
  const theme = bundle.themes.find((x) => x.id === t.id) ?? bundle.themes[0];
  const preview = `/_nova/theme-preview?theme=${t.id}&palette=${t.palette}&fonts=${t.fontPair}&spacing=${t.spacing}&radius=${t.radius}`;
  return (
    <>
      <PageHead title="Design" sub="Kuratierte Stile, Farben und Schriften. Änderungen siehst du sofort in der Vorschau." />
      <div className="preview-split">
        <div className="card">
          <Section title="Stil">
            <div className="stack tight">
              {bundle.themes.map((th) => (
                <button key={th.id} type="button" className="tile" aria-pressed={t.id === th.id} onClick={() => setT({ id: th.id, palette: 'default', fontPair: th.pair })}>
                  <strong>{th.name}</strong>
                  <span>{th.description}</span>
                </button>
              ))}
            </div>
          </Section>
          <Section title="Farben">
            <div className="row wrap" style={{ gap: '0.75rem' }}>
              {theme.palettes.map((p) => (
                <button key={p.id} type="button" className="chip" aria-pressed={t.palette === p.id} onClick={() => setT({ palette: p.id })} style={{ height: '2.25rem', paddingLeft: '0.35rem' }}>
                  <span className="swatch" style={{ width: '1.5rem', height: '1.5rem', background: `linear-gradient(135deg, ${p.bg} 0 50%, ${p.accent} 50% 100%)` }} />
                  {p.label}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Schriften">
            <Select
              label="Schriftpaar"
              value={t.fontPair}
              onChange={(v) => setT({ fontPair: v })}
              options={bundle.fontPairs.map((f) => ({ value: f.id, label: `${f.label}${f.id === theme.pair ? ' (passend zum Stil)' : ''}` }))}
            />
          </Section>
          <Section title="Abstände & Ecken">
            <Field label={`Luft zwischen Abschnitten: ${Math.round(t.spacing * 100)} %`}>
              <input type="range" min={0.7} max={1.4} step={0.05} value={t.spacing} onChange={(e) => setT({ spacing: Number(e.target.value) })} />
            </Field>
            <Field label={`Rundung von Bildern: ${t.radius} px`}>
              <input type="range" min={0} max={24} step={1} value={t.radius} onChange={(e) => setT({ radius: Number(e.target.value) })} />
            </Field>
          </Section>
          {!pro && (
            <Section title="Mehr Kontrolle?">
              <p className="small muted">Eigene Farben als Design-Tokens oder eigenes CSS gibt es in der Werkbank.</p>
              <button className="btn" style={{ justifySelf: 'start' }} onClick={() => setOffer(true)} disabled={!user.allowed_modes.includes('werkbank')}>
                <Icon name="code" size="s" /> Eigenes CSS schreiben
              </button>
            </Section>
          )}
        </div>
        <div className="live-preview">
          <header>
            <Icon name="eye" size="s" /> <span className="grow">Vorschau mit deinen Inhalten</span>
          </header>
          <LoadingFrame title="Design-Vorschau" src={preview} />
        </div>
      </div>
      <SaveBar dirty={dirty} onSave={save} onReset={reset} />
      <Dialog open={offer} onOpenChange={setOffer} title="Zur Werkbank wechseln?" description="Die Werkbank zeigt dieselben Inhalte – dazu Design-Tokens, eigenes CSS, Code-Ansicht pro Block, Inhaltstypen und API. Zurück ins Studio geht jederzeit.">
        <div className="dialog-actions">
          <button className="btn ghost" onClick={() => setOffer(false)}>
            Lieber nicht
          </button>
          <button
            className="btn primary"
            onClick={async () => {
              await setMode('werkbank');
              setOffer(false);
              navigate('/einstellungen/code');
            }}
          >
            Werkbank öffnen
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
        <input className="input" style={{ maxWidth: '12rem' }} value={item.label} placeholder="Beschriftung" onChange={(e) => onChange({ ...item, label: e.target.value })} aria-label="Beschriftung" />
        <SuggestInput className="input grow mono" value={item.href} placeholder="/seite" onChange={(v) => onChange({ ...item, href: v })} aria-label="Ziel" suggestions={pageLinks} />
        {depth === 0 && (
          <button className="btn ghost s" onClick={() => onChange({ ...item, children: [...(item.children ?? []), { id: shortId(), label: '', href: '' }] })} title="Untermenü-Punkt">
            + Unterpunkt
          </button>
        )}
        <button className="btn ghost s icon-only" aria-label="Entfernen" onClick={onRemove}>
          <Icon name="x" size="s" />
        </button>
      </div>
      {depth === 0 && item.children && item.children.length > 0 && (
        <Reorder.Group axis="y" values={item.children} onReorder={(c) => onChange({ ...item, children: c })} style={{ padding: 0, margin: 0 }}>
          {item.children.map((c) => (
            <NavRow key={c.id} item={c} depth={1} onChange={(nc) => onChange({ ...item, children: item.children!.map((x) => (x.id === c.id ? nc : x)) })} onRemove={() => onChange({ ...item, children: item.children!.filter((x) => x.id !== c.id) })} />
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
      <PageHead title="Menü & Fusszeile" sub="Einmal ändern, auf allen Seiten aktuell." />
      <PageLinks.Provider value={pageLinks}>
        <div className="card">
          <Section title="Hauptmenü" sub="Zieh die Punkte in die gewünschte Reihenfolge. Unterpunkte erscheinen als Aufklappmenü.">
            <Reorder.Group axis="y" values={draft.nav} onReorder={(n) => set('nav', n)} style={{ padding: 0, margin: 0 }}>
              {draft.nav.map((n) => (
                <NavRow key={n.id} item={n} depth={0} onChange={(nn) => set('nav', draft.nav.map((x) => (x.id === n.id ? nn : x)))} onRemove={() => set('nav', draft.nav.filter((x) => x.id !== n.id))} />
              ))}
            </Reorder.Group>
            <button className="btn s" style={{ justifySelf: 'start' }} onClick={() => set('nav', [...draft.nav, { id: shortId(), label: '', href: '' }])}>
              <Icon name="plus" size="s" /> Menüpunkt
            </button>
          </Section>
          <Section title="Kopfzeile">
            <div className="grid-2">
              <Field label="Knopf rechts im Menü" help="z. B. «Tisch reservieren»">
                <input className="input" value={draft.header.cta?.label ?? ''} onChange={(e) => set('header', { ...draft.header, cta: e.target.value || draft.header.cta?.href ? { label: e.target.value, href: draft.header.cta?.href ?? '' } : null })} />
              </Field>
              <Field label="Ziel des Knopfs">
                <SuggestInput className="input mono" suggestions={pageLinks} value={draft.header.cta?.href ?? ''} onChange={(v) => set('header', { ...draft.header, cta: { label: draft.header.cta?.label ?? '', href: v } })} />
              </Field>
            </div>
            <Toggle checked={draft.header.sticky} onChange={(v) => set('header', { ...draft.header, sticky: v })} label="Kopfzeile beim Scrollen oben behalten" />
          </Section>
          <Section title="Fusszeile">
            <Field label="Text">
              <textarea className="textarea" style={{ minHeight: '4rem' }} value={draft.footer.text} onChange={(e) => set('footer', { ...draft.footer, text: e.target.value })} />
            </Field>
            {draft.footer.columns.map((col, i) => (
              <div key={i} className="repeat-item" style={{ padding: '0.75rem' }}>
                <div className="row">
                  <input className="input" value={col.title} placeholder="Spaltentitel" onChange={(e) => set('footer', { ...draft.footer, columns: draft.footer.columns.map((c, j) => (j === i ? { ...c, title: e.target.value } : c)) })} />
                  <button className="btn ghost s icon-only" aria-label="Spalte entfernen" onClick={() => set('footer', { ...draft.footer, columns: draft.footer.columns.filter((_, j) => j !== i) })}>
                    <Icon name="trash" size="s" />
                  </button>
                </div>
                {col.links.map((l, k) => (
                  <div key={k} className="row" style={{ marginTop: '0.4rem' }}>
                    <input
                      className="input"
                      value={l.label}
                      placeholder="Beschriftung"
                      onChange={(e) => set('footer', { ...draft.footer, columns: draft.footer.columns.map((c, j) => (j === i ? { ...c, links: c.links.map((x, m) => (m === k ? { ...x, label: e.target.value } : x)) } : c)) })}
                    />
                    <SuggestInput
                      className="input mono"
                      suggestions={pageLinks}
                      value={l.href}
                      placeholder="/seite"
                      aria-label="Ziel"
                      onChange={(v) => set('footer', { ...draft.footer, columns: draft.footer.columns.map((c, j) => (j === i ? { ...c, links: c.links.map((x, m) => (m === k ? { ...x, href: v } : x)) } : c)) })}
                    />
                  </div>
                ))}
                <button className="btn ghost s" style={{ marginTop: '0.4rem' }} onClick={() => set('footer', { ...draft.footer, columns: draft.footer.columns.map((c, j) => (j === i ? { ...c, links: [...c.links, { label: '', href: '' }] } : c)) })}>
                  + Link
                </button>
              </div>
            ))}
            <button className="btn s" style={{ justifySelf: 'start' }} onClick={() => set('footer', { ...draft.footer, columns: [...draft.footer.columns, { title: '', links: [] }] })}>
              <Icon name="plus" size="s" /> Spalte
            </button>
            <p className="xsmall muted">Adresse, Öffnungszeiten, Social-Media-Links und Rechtstexte erscheinen automatisch.</p>
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
      <PageHead title="Suchmaschinen" sub="Sitemap, strukturierte Daten, Social-Vorschaubilder und Weiterleitungen erledigt Nova automatisch. Hier siehst du, was noch fehlt." />
      <div className="stack loose">
        <section className="card">
          <div className="card-head">
            <h2>Website-Check</h2>
            <button className="btn s" onClick={() => void check.reload()}>
              Neu prüfen
            </button>
          </div>
          {!check.data ? (
            <Skeleton />
          ) : !check.data.issues.length ? (
            <p className="card-pad small" style={{ color: 'var(--ok)', fontWeight: 600 }}>
              {check.data.checked} Seiten geprüft – nichts gefunden. Sauber.
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
                    <div className="xsmall muted">{i.message}</div>
                  </div>
                  {i.entryId && (
                    <Link className="btn s" to={entryUrl(coll(i.entryId), i.entryId)}>
                      Beheben
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="card">
          <Section title="Standardwerte">
            <Field label="Muster für Seitentitel" help="%s = Seitentitel, %site = Name der Website" keyName="seo.titleTemplate">
              <input className="input mono" value={s.titleTemplate} onChange={(e) => set('seo', { ...s, titleTemplate: e.target.value })} />
            </Field>
            <Field label="Standard-Beschreibung" help="Für Seiten ohne eigenen Text.">
              <textarea className="textarea" value={s.defaultDescription} onChange={(e) => set('seo', { ...s, defaultDescription: e.target.value })} />
            </Field>
            <Field label="Standard-Bild für Social Media" help="Leer = Nova erzeugt pro Seite ein Bild mit dem Titel.">
              <MediaField value={s.defaultImage} type="image" onChange={(v) => set('seo', { ...s, defaultImage: v })} />
            </Field>
          </Section>
          <Section title="Indexierung">
            <Toggle checked={!s.noindex} onChange={(v) => set('seo', { ...s, noindex: !v })} label="Suchmaschinen dürfen die Website aufnehmen" help="Ausschalten, solange die Website noch im Aufbau ist." />
            <Toggle checked={s.indexNow} onChange={(v) => set('seo', { ...s, indexNow: v })} label="Bing & Co. bei Änderungen sofort benachrichtigen (IndexNow)" />
            <Toggle checked={s.adult} onChange={(v) => set('seo', { ...s, adult: v })} label="Inhalte für Erwachsene kennzeichnen" help="Für SafeSearch: Google zeigt die Website dann nicht bei eingeschaltetem Jugendschutz." />
            <p className="xsmall muted">
              Sitemap: <a href="/sitemap.xml">/sitemap.xml</a> · Robots: <a href="/robots.txt">/robots.txt</a>. Die Google Search Console verbindest du, indem du dort die Sitemap einreichst.
            </p>
          </Section>
          <Section title="Statistik">
            <Toggle checked={draft.analytics.enabled} onChange={(v) => set('analytics', { ...draft.analytics, enabled: v })} label="Besuche zählen (ohne Cookies)" help="Ohne Einwilligungsbanner zulässig: keine Cookies, keine IP-Speicherung, keine Wiedererkennung über Tage." />
          </Section>
        </div>
      </div>
      <SaveBar dirty={dirty} onSave={save} onReset={reset} />
    </>
  );
}

/* ---------- legal ---------- */

function LegalSettings() {
  const toast = useToast();
  const { draft, set, dirty, save, reset } = useSettingsDraft();
  const { data, reload } = useApi<{ entries: { id: string; slug: string; status: string; title: string; changed: boolean }[] }>('/api/entries?collection=pages&limit=500');
  const legal = (data?.entries ?? []).filter((p) => ['impressum', 'datenschutz', 'agb'].includes(p.slug));
  const generate = async () => {
    if (legal.length && !(await confirm({ title: 'Texte neu erzeugen?', message: 'Bestehende Entwürfe werden überschrieben. Ältere Fassungen bleiben im Verlauf.', confirm: 'Neu erzeugen' }))) return;
    try {
      await api.post('/api/legal/generate');
      toast('Texte erzeugt – bitte lesen, anpassen und veröffentlichen.');
      void reload();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  if (!draft) return <Skeleton />;
  return (
    <>
      <PageHead title="Rechtliches" sub="Nova erzeugt Impressum, Datenschutzerklärung und AGB aus dem, was deine Website tatsächlich tut – Formulare, Shop, Statistik, Einbettungen." />
      <div className="stack loose">
        <section className="card">
          <div className="card-head">
            <h2>Rechtstexte</h2>
            <button className="btn primary s" onClick={generate}>
              {legal.length ? 'Neu erzeugen' : 'Texte erzeugen'}
            </button>
          </div>
          {legal.length ? (
            <ul className="list">
              {legal.map((p) => (
                <li key={p.id}>
                  <Link to={`/seiten/${p.id}`} className="list-item">
                    <Icon name="scale" className="faint" />
                    <span className="grow">{p.title}</span>
                    <span className={`badge ${p.status === 'published' ? 'ok' : ''}`}>{p.status === 'published' ? 'Online' : 'Entwurf – prüfen'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="card-pad small muted">Noch keine Rechtstexte.</p>
          )}
          <p className="card-pad xsmall muted" style={{ borderTop: '1px solid var(--line)' }}>
            Das sind Vorlagen, keine Rechtsberatung. Lass sie prüfen, bevor du sie veröffentlichst – besonders bei Shop und Erwachsenen-Inhalten.
          </p>
        </section>
        <div className="card">
          <Section title="Einbettungen mit Zustimmung" sub="Videos und Karten laden erst nach Klick (Zwei-Klick-Lösung). Ausschalten blendet sie ganz aus.">
            <Toggle checked={draft.consent.youtube} onChange={(v) => set('consent', { ...draft.consent, youtube: v })} label="YouTube (im Datenschutzmodus)" />
            <Toggle checked={draft.consent.vimeo} onChange={(v) => set('consent', { ...draft.consent, vimeo: v })} label="Vimeo" />
            <Toggle checked={draft.consent.maps} onChange={(v) => set('consent', { ...draft.consent, maps: v })} label="Karte (OpenStreetMap)" />
          </Section>
          <Section title="Altersschranke" sub="Für Websites mit Inhalten für Erwachsene. Besucher bestätigen ihr Alter, bevor sie etwas sehen.">
            <Toggle checked={draft.ageGate.enabled} onChange={(v) => set('ageGate', { ...draft.ageGate, enabled: v })} label="Altersschranke anzeigen" />
            {draft.ageGate.enabled && (
              <div className="grid-2">
                <Field label="Mindestalter">
                  <input className="input num" type="number" min={16} max={21} value={draft.ageGate.minAge} onChange={(e) => set('ageGate', { ...draft.ageGate, minAge: Number(e.target.value) })} />
                </Field>
                <Field label="Hinweistext">
                  <input className="input" value={draft.ageGate.text} onChange={(e) => set('ageGate', { ...draft.ageGate, text: e.target.value })} />
                </Field>
              </div>
            )}
            {draft.ageGate.enabled && <p className="xsmall muted">Wo das Gesetz eine echte Altersverifikation verlangt (z. B. in Deutschland), reicht eine Selbstauskunft nicht. Dafür braucht es einen Verifikationsanbieter.</p>}
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
      <PageHead title="Domain" sub="Deine Website ist sofort unter der Railway-Adresse erreichbar. Mit eigener Domain wirkt sie professioneller." />
      <div className="card">
        <Section title="Aktuelle Adresse">
          <div className="row">
            <Icon name="globe" />
            <span className="mono grow">{railway}</span>
            <span className="badge ok">aktiv</span>
          </div>
        </Section>
        <Section title="Eigene Domain" sub="So geht's – Schritt für Schritt:">
          <Field label="Deine Domain" help="Mit https://, ohne Pfad. Nova nutzt sie für Links, Sitemap und Social-Media-Vorschauen." htmlFor="d-url">
            <input id="d-url" className="input mono" value={draft.baseUrl} placeholder="https://www.meine-domain.ch" onChange={(e) => set('baseUrl', e.target.value.trim())} />
          </Field>
          <ol className="small stack tight" style={{ paddingLeft: '1.2rem', margin: 0 }}>
            <li>
              Öffne in Railway deinen Nova-Dienst → <strong>Settings → Networking → Custom Domain</strong> und trag <span className="mono">{custom || 'www.meine-domain.ch'}</span> ein.
            </li>
            <li>
              Railway zeigt dir einen <strong>CNAME-Eintrag</strong> (Ziel endet auf <span className="mono">.up.railway.app</span>). Leg ihn bei deinem Domain-Anbieter (z. B. Hostpoint, Infomaniak, Cyon) an:
              <pre className="code-out" style={{ marginTop: '0.5rem' }}>{`Typ:   CNAME
Name:  ${apex ? '@' : custom.split('.')[0] || 'www'}
Ziel:  (aus Railway kopieren)`}</pre>
            </li>
            {apex && <li>Für Domains ohne «www» braucht dein Anbieter CNAME-Flattening oder ALIAS. Sonst: www verwenden und die nackte Domain weiterleiten.</li>}
            <li>Warten, bis Railway das Zertifikat ausgestellt hat (meist wenige Minuten, manchmal bis zu einer Stunde). Dann hier speichern.</li>
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
      <PageHead title="Shop" />
      <div className="card">
        <Section title="Bezahlen">
          <div className="row">
            <span className={`dot ${bundle.system.stripe ? 'ok' : ''}`} />
            <span className="small grow">
              Online-Zahlung (TWINT, Karte, Apple Pay, Google Pay via Stripe):{' '}
              {bundle.system.stripe ? (bundle.system.stripeWebhook ? 'eingerichtet' : 'Schlüssel da – Webhook-Secret fehlt noch') : 'nicht eingerichtet'}
            </span>
          </div>
          {!bundle.system.stripeWebhook && (
            <p className="xsmall muted">
              In Railway die Variablen <span className="mono">STRIPE_SECRET_KEY</span> und <span className="mono">STRIPE_WEBHOOK_SECRET</span> setzen. Webhook-Ziel in Stripe: <span className="mono">{(draft.baseUrl || bundle.system.publicUrl) + '/_nova/stripe/webhook'}</span> mit den Ereignissen
              «checkout.session.completed», «…async_payment_succeeded», «…async_payment_failed», «…expired». Welche Zahlarten (TWINT usw.) angeboten werden, stellst du im Stripe-Dashboard ein.
            </p>
          )}
          <Toggle checked={sh.invoiceEnabled} onChange={(v) => setS({ invoiceEnabled: v })} label="Kauf auf Rechnung anbieten" />
          {sh.invoiceEnabled && (
            <Field label="Zahlungsangaben auf der Rechnung" help="IBAN, Empfänger, Bank">
              <textarea className="textarea" style={{ minHeight: '4rem' }} value={sh.invoiceNote} onChange={(e) => setS({ invoiceNote: e.target.value })} />
            </Field>
          )}
        </Section>
        <Section title="Mehrwertsteuer" sub="Preise werden inklusive MwSt. erfasst und angezeigt.">
          <div className="grid-2">
            <Field label="Normalsatz %">
              <input className="input num" type="number" step="0.1" value={sh.vatRates.standard} onChange={(e) => setS({ vatRates: { ...sh.vatRates, standard: Number(e.target.value) } })} />
            </Field>
            <Field label="Reduzierter Satz %">
              <input className="input num" type="number" step="0.1" value={sh.vatRates.reduced} onChange={(e) => setS({ vatRates: { ...sh.vatRates, reduced: Number(e.target.value) } })} />
            </Field>
          </div>
        </Section>
        <Section title="Versand">
          <div className="grid-2">
            <Field label="Versandkosten (CHF)">
              <input className="input num" inputMode="decimal" defaultValue={money(sh.shipping.flat)} onBlur={(e) => setS({ shipping: { ...sh.shipping, flat: parse(e.target.value) ?? 0 } })} />
            </Field>
            <Field label="Gratis ab (CHF)" help="Leer = nie gratis">
              <input className="input num" inputMode="decimal" defaultValue={money(sh.shipping.freeFrom)} onBlur={(e) => setS({ shipping: { ...sh.shipping, freeFrom: parse(e.target.value) } })} />
            </Field>
          </div>
          <Toggle checked={sh.shipping.pickup} onChange={(v) => setS({ shipping: { ...sh.shipping, pickup: v } })} label="Abholung anbieten" />
          <Field label="Lieferländer" help="Ländercodes, z. B. CH, LI, DE, AT">
            <input className="input mono" value={sh.shipping.countries.join(', ')} onChange={(e) => setS({ shipping: { ...sh.shipping, countries: e.target.value.split(/[,\s]+/).map((x) => x.toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x)) } })} />
          </Field>
        </Section>
        <Section title="Bestellungen">
          <div className="grid-2">
            <Field label="Benachrichtigung an" help="Leer = Kontakt-E-Mail">
              <input className="input" type="email" value={sh.notifyEmail} onChange={(e) => setS({ notifyEmail: e.target.value })} />
            </Field>
            <Field label="Präfix der Bestellnummer">
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
  if (!draft) return <Skeleton />;
  return (
    <>
      <PageHead title="Module" sub="Was 80 % aller Websites brauchen, ist eingebaut. Schalt ein, was du nutzt – ausgeschaltete Module verschwinden aus der Verwaltung, ihre Daten bleiben erhalten." />
      <div className="card">
        {MODULES.map((m) => (
          <div key={m.id} className="form-section">
            <Toggle
              checked={draft.modules.includes(m.id)}
              onChange={(v) => m.status === 'ready' && set('modules', v ? [...draft.modules, m.id] : draft.modules.filter((x) => x !== m.id))}
              label={
                <>
                  {m.name} {m.status === 'later' && <span className="badge">Version 1.0</span>}
                </>
              }
              help={m.description}
            />
          </div>
        ))}
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
        title="Team & Rollen"
        actions={
          <button className="btn primary" onClick={() => setInvite(true)}>
            <Icon name="plus" size="s" /> Person hinzufügen
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
                      {u.name} {u.id === me.id && <span className="faint small">(du)</span>}
                    </div>
                    <div className="xsmall muted">
                      {u.email} · {u.last_login_at ? `zuletzt ${formatDate(u.last_login_at)}` : 'noch nie angemeldet'}
                      {u.totp_enabled ? ' · 2FA' : ''}
                    </div>
                  </div>
                  <Select
                    inline
                    label={`Rolle von ${u.name}`}
                    value={u.role}
                    disabled={u.id === me.id}
                    onChange={(v) => void changeRole(u, v as Role)}
                    options={ROLE_ORDER.map((r) => ({ value: r, label: ROLE_LABELS[r].name }))}
                  />
                  {u.id !== me.id && (
                    <Menu
                      trigger={
                        <button className="btn ghost s icon-only" aria-label="Aktionen">
                          <Icon name="more" />
                        </button>
                      }
                      items={[
                        {
                          label: 'Passwort zurücksetzen',
                          icon: 'key',
                          onSelect: async () => {
                            if (!(await confirm({ title: `Passwort von ${u.name} zurücksetzen?`, message: 'Alle Sitzungen werden beendet und 2FA wird ausgeschaltet.', confirm: 'Zurücksetzen' }))) return;
                            const r = await api.post<{ temporaryPassword: string }>(`/api/users/${u.id}/reset`);
                            setSecret({ email: u.email, password: r.temporaryPassword, mailed: false });
                          },
                        },
                        {
                          label: 'Entfernen',
                          icon: 'trash',
                          danger: true,
                          onSelect: async () => {
                            if (!(await confirm({ title: `${u.name} entfernen?`, message: 'Inhalte der Person bleiben erhalten.', confirm: 'Entfernen', danger: true }))) return;
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
          <h2 className="section-title">Was die Rollen dürfen</h2>
          <dl className="small" style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.35rem 1rem' }}>
            {ROLE_ORDER.map((r) => (
              <div key={r} style={{ display: 'contents' }}>
                <dt style={{ fontWeight: 600 }}>{ROLE_LABELS[r].name}</dt>
                <dd style={{ margin: 0 }} className="muted">
                  {ROLE_LABELS[r].help}
                </dd>
              </div>
            ))}
          </dl>
        </section>
        {pro && draft && (
          <section className="card">
            <div className="card-head">
              <h2>Welche Rolle sieht welchen Modus</h2>
            </div>
            <div className="form-section">
              {(['editor', 'author'] as Role[]).map((r) => (
                <Toggle
                  key={r}
                  checked={draft.roleModes[r].includes('werkbank')}
                  onChange={(v) => set('roleModes', { ...draft.roleModes, [r]: v ? ['studio', 'werkbank'] : ['studio'] })}
                  label={`${ROLE_LABELS[r].name} darf die Werkbank nutzen`}
                  help={r === 'editor' ? 'Aus: Redaktion arbeitet nur im Studio und sieht keinen Code.' : undefined}
                />
              ))}
            </div>
          </section>
        )}
      </div>
      <SaveBar dirty={dirty} onSave={save} onReset={reset} />
      <Dialog open={invite} onOpenChange={setInvite} title="Person hinzufügen">
        <div className="stack">
          <div className="grid-2">
            <Field label="Name">
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </Field>
            <Field label="E-Mail">
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
          </div>
          <Field label="Rolle" help={ROLE_LABELS[form.role].help}>
            <Segmented
              label="Rolle"
              value={form.role}
              onChange={(r) => setForm({ ...form, role: r })}
              options={(['admin', 'editor', 'author'] as Role[]).map((r) => ({ value: r, label: ROLE_LABELS[r].name }))}
            />
          </Field>
        </div>
        <div className="dialog-actions">
          <button className="btn ghost" onClick={() => setInvite(false)}>
            Abbrechen
          </button>
          <button className="btn primary" onClick={create} disabled={!form.name || !form.email}>
            Hinzufügen
          </button>
        </div>
      </Dialog>
      <Dialog open={Boolean(secret)} onOpenChange={(o) => !o && setSecret(null)} title="Vorläufiges Passwort" description={secret?.mailed ? 'Wir haben die Zugangsdaten auch per E-Mail geschickt.' : 'Gib es persönlich weiter – es wird nur jetzt angezeigt.'}>
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
            Notiert
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
    if (!(await confirm({ title: `Alle Daten von ${email} löschen?`, message: 'Formulareinträge, Kontakt und Kommentare werden gelöscht. Bestellungen werden anonymisiert (Aufbewahrungspflicht).', confirm: 'Löschen', danger: true }))) return;
    try {
      const r = await api.post<{ deleted: Record<string, number>; anonymizedOrders: number }>('/api/privacy/delete', { email });
      toast(`Gelöscht: ${r.deleted.submissions} Einträge, ${r.deleted.contacts} Kontakte, ${r.deleted.comments} Kommentare. ${r.anonymizedOrders} Bestellungen anonymisiert.`);
      setPerson(null);
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  const LABEL: Record<string, string> = { contacts: 'Kontakte', submissions: 'Formulareinträge', orders: 'Bestellungen', comments: 'Kommentare', users: 'Benutzerkonten' };
  return (
    <>
      <PageHead title="Daten & Datenschutz" sub="Deine Daten gehören dir. Alles lässt sich jederzeit exportieren – ohne Umweg über den Support." />
      <div className="stack loose">
        <section className="card card-pad stack">
          <div className="row between wrap">
            <div>
              <h2 style={{ fontSize: 'var(--t-m)', fontWeight: 650 }}>Alles exportieren</h2>
              <p className="small muted">ZIP mit Inhalten (JSON + Markdown), Konfiguration als Code, Original-Medien und CSV für Kontakte, Bestellungen, Formulare.</p>
            </div>
            <a className="btn primary" href="/api/export">
              <Icon name="download" size="s" /> Export herunterladen
            </a>
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Auskunft & Löschung</h2>
          </div>
          <div className="form-section">
            <p className="small muted">Jemand möchte wissen, was du über sie oder ihn gespeichert hast – oder es löschen lassen? Gib die E-Mail-Adresse ein.</p>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                void lookup();
              }}
            >
              <input className="input grow" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@beispiel.ch" />
              <button className="btn">Suchen</button>
            </form>
            {person && (
              <div className="stack tight">
                <p className="small">
                  {Object.entries(person.counts)
                    .map(([k, v]) => `${v} ${LABEL[k] ?? k}`)
                    .join(' · ')}
                </p>
                <div className="row">
                  <a className="btn" href={`/api/privacy?email=${encodeURIComponent(email)}&download=1`}>
                    <Icon name="download" size="s" /> Auskunft als Datei
                  </a>
                  <button className="btn danger" onClick={erase}>
                    <Icon name="trash" size="s" /> Alles löschen
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Sicherungen</h2>
            <button
              className="btn s"
              onClick={async () => {
                await api.post('/api/backups');
                toast('Sicherung erstellt.');
                void backups.reload();
              }}
            >
              Jetzt sichern
            </button>
          </div>
          <p className="card-pad small muted" style={{ paddingBottom: 0 }}>
            Nova sichert alle Inhalte täglich in den Bucket und behält 30 Tage. Medien liegen ohnehin im Bucket. Railway Postgres hat zusätzlich eigene Backups.
          </p>
          {!backups.data ? (
            <Skeleton />
          ) : !backups.data.backups.length ? (
            <p className="card-pad small muted">Die erste Sicherung entsteht in der nächsten Stunde.</p>
          ) : (
            <ul className="list" style={{ marginTop: '0.75rem' }}>
              {backups.data.backups.map((b) => (
                <li key={b.id} className="list-item">
                  <Icon name="backup" className="faint" />
                  <span className="grow small">
                    {formatDate(b.created_at, true)} · {b.kind === 'auto' ? 'automatisch' : 'manuell'} · {Math.max(1, Math.round(b.size / 1024))} KB
                  </span>
                  <a className="btn ghost s" href={`/api/backups/${b.id}/download`}>
                    Herunterladen
                  </a>
                  {can('data.sql') && (
                    <button
                      className="btn ghost s"
                      onClick={async () => {
                        if (!(await confirm({ title: 'Diese Sicherung wiederherstellen?', message: 'Alle Inhalte, Formulare, Kontakte und Bestellungen werden auf diesen Stand gesetzt. Vorher legt Nova automatisch eine Sicherung des aktuellen Stands an.', confirm: 'Wiederherstellen', danger: true }))) return;
                        try {
                          await api.post(`/api/backups/${b.id}/restore`);
                          toast('Wiederhergestellt.');
                          setTimeout(() => location.reload(), 800);
                        } catch (e) {
                          toast((e as Error).message, { kind: 'bad' });
                        }
                      }}
                    >
                      Wiederherstellen
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        {bundle && (
          <section className="card card-pad stack tight">
            <h2 className="section-title">System</h2>
            <p className="small row">
              <span className={`dot ${bundle.system.storage === 'bucket' ? 'ok' : 'edited'}`} /> Dateispeicher: {bundle.system.storage === 'bucket' ? 'Railway Bucket' : 'lokal – für Railway Bucket-Variablen setzen, sonst gehen Uploads beim Neustart verloren'}
            </p>
            <p className="small row">
              <span className={`dot ${bundle.system.mail ? 'ok' : 'edited'}`} /> E-Mail-Versand: {bundle.system.mail ? 'eingerichtet' : 'nicht eingerichtet (RESEND_API_KEY oder SMTP_URL)'}
              {bundle.system.mail && (
                <button className="linkish xsmall" onClick={() => api.post<{ ok: boolean }>('/api/mail/test').then((r) => toast(r.ok ? 'Test-Mail ist unterwegs.' : 'Versand fehlgeschlagen – siehe Logs.'))}>
                  Test senden
                </button>
              )}
            </p>
          </section>
        )}
      </div>
    </>
  );
}


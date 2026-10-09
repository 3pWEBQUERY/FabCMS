import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as RDialog from '@radix-ui/react-dialog';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { useSession } from '../lib/session';
import { useApi, useDebounced } from '../lib/hooks';
import { createAndOpen, entryUrl } from '../lib/actions';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/toast';
import { HELP } from './help';
import type { Capability } from '../../shared/roles';
import type { CollectionDef } from '../../shared/types';

interface Cmd {
  id: string;
  label: string;
  group: string;
  icon: string;
  /** Extra words people might type: synonyms, everyday phrasing. */
  keywords?: string;
  hint?: string;
  cap?: Capability;
  pro?: boolean;
  module?: string;
  create?: boolean;
  run: () => void | Promise<unknown>;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss');

// Words that carry no meaning for matching ("Öffnungszeiten ändern" → "öffnungszeiten").
const STOP = new Set(
  'ich will mochte moechte wie wo kann man meine mein meinen die der das den dem ein eine einen zu zur zum und oder ist sind bitte mal andern aendern bearbeiten anpassen einstellen zeigen zeig offnen oeffnen gehe geh finden aktualisieren'.split(' '),
);
const CREATE = new Set(['neu', 'neue', 'neuer', 'neues', 'neuen', 'erstellen', 'anlegen', 'hinzufugen', 'hinzufuegen', 'schreiben', 'erfassen']);

function score(cmd: Cmd, q: string): number {
  const tokens = norm(q).split(/[^a-z0-9]+/).filter(Boolean);
  if (!tokens.length) return 1;
  const wantsCreate = tokens.some((t) => CREATE.has(t));
  const meaningful = tokens.filter((t) => !STOP.has(t) && !CREATE.has(t));
  const words = norm(`${cmd.label} ${cmd.keywords ?? ''}`).split(/[^a-z0-9]+/).filter(Boolean);
  const label = norm(cmd.label);
  let s = 0;
  for (const t of meaningful.length ? meaningful : tokens) {
    if (label.startsWith(t)) s += 6;
    else if (words.some((w) => w.startsWith(t))) s += 4;
    else if (t.length >= 4 && words.some((w) => w.includes(t))) s += 2;
    else return 0;
  }
  if (wantsCreate && cmd.create) s += 5;
  if (wantsCreate && !cmd.create && meaningful.length) s -= 1;
  return s;
}

interface SearchResult {
  kind: 'entry' | 'media' | 'contact' | 'order';
  id: string;
  title: string;
  subtitle?: string;
  collection?: string;
  collectionName?: string;
  status?: string;
  thumb?: string;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useSession();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [help, setHelp] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounced = useDebounced(q, 180);
  const { data: cols } = useApi<{ collections: (CollectionDef & { active: boolean })[] }>(open ? '/api/collections' : null);
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    if (!open) {
      setQ('');
      setSel(0);
      setHelp(null);
    }
  }, [open]);

  useEffect(() => {
    if (debounced.trim().length < 2) return setResults([]);
    let alive = true;
    api
      .get<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(debounced)}`)
      .then((r) => alive && setResults(r.results))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [debounced]);

  const go = (to: string) => () => navigate(to);
  const modules = session.settings?.modules ?? [];

  const commands = useMemo<Cmd[]>(() => {
    const list: Cmd[] = [
      { id: 'home', label: 'Übersicht', group: 'Gehe zu', icon: 'home', keywords: 'dashboard start startklar checkliste', run: go('/') },
      { id: 'stats', label: 'Statistik', group: 'Gehe zu', icon: 'chart', keywords: 'besucher zahlen aufrufe analytics conversions umsatz', run: go('/statistik') },
      { id: 'pages', label: 'Seiten', group: 'Gehe zu', icon: 'page', keywords: 'startseite unterseiten', run: go('/seiten') },
      { id: 'content', label: 'Inhalte', group: 'Gehe zu', icon: 'layers', run: go('/inhalte') },
      { id: 'media', label: 'Mediathek', group: 'Gehe zu', icon: 'image', keywords: 'bilder fotos dateien videos hochladen', run: go('/medien') },
      { id: 'forms', label: 'Formulare', group: 'Gehe zu', icon: 'form', keywords: 'anfragen einträge kontaktformular reservation', cap: 'forms.manage', run: go('/formulare') },
      { id: 'contacts', label: 'Kontakte', group: 'Gehe zu', icon: 'people', keywords: 'leads kunden anfragen crm pipeline', cap: 'leads.view', module: 'leads', run: go('/kontakte') },
      { id: 'orders', label: 'Bestellungen', group: 'Gehe zu', icon: 'receipt', keywords: 'shop verkäufe rechnungen versand', cap: 'orders.view', module: 'shop', run: go('/bestellungen') },
      { id: 'bookings', label: 'Reservationen heute', group: 'Gehe zu', icon: 'calendar', keywords: 'tisch termin buchung kalender tagesplan', cap: 'bookings.manage', module: 'booking', run: go('/reservationen') },
      { id: 'booking-new', label: 'Reservation eintragen', group: 'Aktionen', icon: 'plus', keywords: 'telefon anruf tisch termin buchen', cap: 'bookings.manage', module: 'booking', run: go('/reservationen?neu=1') },
      { id: 'newsletter', label: 'Newsletter', group: 'Gehe zu', icon: 'mail', keywords: 'abonnenten e-mail mailing ausgabe verschicken', cap: 'newsletter.manage', module: 'newsletter', run: go('/newsletter') },
      { id: 'newsletter-new', label: 'Newsletter schreiben', group: 'Aktionen', icon: 'plus', keywords: 'ausgabe e-mail mailing verschicken', cap: 'newsletter.manage', module: 'newsletter', run: go('/newsletter?id=neu') },
      { id: 'members', label: 'Mitglieder', group: 'Gehe zu', icon: 'key', keywords: 'konto abo mitgliedschaft paywall login', cap: 'members.manage', module: 'members', run: go('/mitglieder') },
      { id: 'tickets', label: 'Tickets & Anmeldungen', group: 'Gehe zu', icon: 'ticket', keywords: 'event kurs teilnehmer verkauf anmeldung', cap: 'events.manage', run: go('/tickets') },
      { id: 'checkin', label: 'Einlass: Tickets scannen', group: 'Aktionen', icon: 'qr', keywords: 'check-in qr scannen eingang tür kasse', cap: 'events.manage', run: go('/einlass') },
      { id: 's-booking', label: 'Reservation einrichten', group: 'Einstellungen', icon: 'calendar', keywords: 'tische zeiten leistungen sperrzeit ferien kalender', cap: 'settings.manage', module: 'booking', run: go('/einstellungen/reservation') },
      { id: 'coupons', label: 'Gutscheine', group: 'Gehe zu', icon: 'ticket', keywords: 'rabatt code aktion', cap: 'orders.manage', module: 'shop', run: go('/gutscheine') },
      { id: 'comments', label: 'Kommentare', group: 'Gehe zu', icon: 'chat', keywords: 'moderieren freigeben spam', cap: 'comments.moderate', module: 'blog', run: go('/kommentare') },
      { id: 's-site', label: 'Name, Logo & Kontakt', group: 'Einstellungen', icon: 'globe', keywords: 'adresse telefon email logo firma uid', cap: 'settings.manage', run: go('/einstellungen/website') },
      { id: 's-hours', label: 'Öffnungszeiten', group: 'Einstellungen', icon: 'clock', keywords: 'offen geschlossen ferien ruhetag zeiten', cap: 'settings.manage', run: go('/einstellungen/website#zeiten') },
      { id: 's-design', label: 'Design', group: 'Einstellungen', icon: 'style', keywords: 'farben schrift schriften stil theme vorlage abstände look', cap: 'design.manage', run: go('/einstellungen/design') },
      { id: 's-nav', label: 'Menü & Fusszeile', group: 'Einstellungen', icon: 'nav', keywords: 'navigation header footer menu links', cap: 'settings.manage', run: go('/einstellungen/navigation') },
      { id: 's-seo', label: 'Suchmaschinen (SEO)', group: 'Einstellungen', icon: 'seo', keywords: 'google seo titel beschreibung website-check kaputte links', cap: 'settings.manage', run: go('/einstellungen/seo') },
      { id: 's-legal', label: 'Impressum & Datenschutz', group: 'Einstellungen', icon: 'scale', keywords: 'rechtstexte agb dsgvo datenschutzerklärung', cap: 'settings.manage', run: go('/einstellungen/rechtliches') },
      { id: 's-domain', label: 'Domain', group: 'Einstellungen', icon: 'globe', keywords: 'adresse url dns eigene domain', cap: 'settings.manage', run: go('/einstellungen/domain') },
      { id: 's-shop', label: 'Shop-Einstellungen', group: 'Einstellungen', icon: 'bag', keywords: 'mwst versand zahlung twint rechnung', cap: 'settings.manage', module: 'shop', run: go('/einstellungen/shop') },
      { id: 's-modules', label: 'Module', group: 'Einstellungen', icon: 'grid', keywords: 'funktionen blog shop speisekarte portfolio aktivieren', cap: 'settings.manage', run: go('/einstellungen/module') },
      { id: 's-team', label: 'Team & Rollen', group: 'Einstellungen', icon: 'people', keywords: 'benutzer einladen rechte zugang mitarbeiter', cap: 'users.manage', run: go('/einstellungen/team') },
      { id: 's-data', label: 'Daten & Datenschutz', group: 'Einstellungen', icon: 'database', keywords: 'export backup sicherung auskunft löschen dsgvo', cap: 'privacy.manage', run: go('/einstellungen/daten') },
      { id: 's-account', label: 'Mein Konto', group: 'Einstellungen', icon: 'user', keywords: 'passwort 2fa zwei-faktor sitzungen profil', run: go('/konto') },
      { id: 'w-types', label: 'Inhaltstypen', group: 'Werkbank', icon: 'database', keywords: 'content types felder collections schema', pro: true, cap: 'dev', run: go('/einstellungen/typen') },
      { id: 'w-code', label: 'Eigenes CSS & Design-Tokens', group: 'Werkbank', icon: 'code', keywords: 'css tokens variablen', pro: true, cap: 'dev', run: go('/einstellungen/code') },
      { id: 'w-api', label: 'API & Webhooks', group: 'Werkbank', icon: 'webhook', keywords: 'rest token zapier make headless', pro: true, cap: 'dev', run: go('/einstellungen/api') },
      { id: 'w-redirects', label: 'Weiterleitungen', group: 'Werkbank', icon: 'arrowRight', keywords: '301 redirect alte adresse', pro: true, cap: 'settings.manage', run: go('/einstellungen/weiterleitungen') },
      { id: 'w-sql', label: 'SQL-Abfrage', group: 'Werkbank', icon: 'database', keywords: 'datenbank query select', pro: true, cap: 'data.sql', run: go('/einstellungen/sql') },
      { id: 'w-audit', label: 'Protokoll', group: 'Werkbank', icon: 'history', keywords: 'audit log wer hat was', pro: true, cap: 'audit.view', run: go('/einstellungen/protokoll') },
      { id: 'new-page', label: 'Neue Seite', group: 'Erstellen', icon: 'plus', keywords: 'seite unterseite', cap: 'content.edit', create: true, run: () => createAndOpen('pages') },
      { id: 'new-post', label: 'Neuer Beitrag', group: 'Erstellen', icon: 'plus', keywords: 'blog artikel journal news', module: 'blog', create: true, run: () => createAndOpen('posts') },
      { id: 'new-product', label: 'Neues Produkt', group: 'Erstellen', icon: 'plus', keywords: 'shop artikel', module: 'shop', cap: 'content.edit', create: true, run: () => createAndOpen('products') },
      { id: 'new-dish', label: 'Neues Gericht', group: 'Erstellen', icon: 'plus', keywords: 'speisekarte menü essen getränk', module: 'menu', cap: 'content.edit', create: true, run: () => createAndOpen('dishes') },
      { id: 'new-project', label: 'Neues Projekt', group: 'Erstellen', icon: 'plus', keywords: 'portfolio referenz arbeit', module: 'portfolio', cap: 'content.edit', create: true, run: () => createAndOpen('projects') },
      { id: 'upload', label: 'Bilder hochladen', group: 'Erstellen', icon: 'upload', keywords: 'foto bild datei', cap: 'media.upload', create: true, run: go('/medien?upload=1') },
      { id: 'mode', label: session.mode === 'studio' ? 'Zur Werkbank wechseln' : 'Zum Studio wechseln', group: 'Aktionen', icon: 'code', keywords: 'modus profi einfach', run: () => session.setMode(session.mode === 'studio' ? 'werkbank' : 'studio') },
      { id: 'site', label: 'Website ansehen', group: 'Aktionen', icon: 'external', keywords: 'live öffnen vorschau', run: () => window.open(session.bundle?.system.publicUrl ?? '/', '_blank') },
      { id: 'logout', label: 'Abmelden', group: 'Aktionen', icon: 'logout', run: () => session.logout() },
    ];
    for (const c of cols?.collections ?? []) {
      if (!c.active || ['pages'].includes(c.id)) continue;
      list.push({ id: `col-${c.id}`, label: c.name, group: 'Gehe zu', icon: c.icon, keywords: `${c.singular} ${c.id}`, run: go(`/inhalte/${c.id}`) });
      if (!c.builtin) list.push({ id: `new-${c.id}`, label: `${c.singular} anlegen`, group: 'Erstellen', icon: 'plus', create: true, run: () => createAndOpen(c.id) });
    }
    for (const h of HELP) list.push({ id: `help-${h.id}`, label: h.title, group: 'Hilfe', icon: 'help', keywords: h.keywords, run: () => setHelp(h.id) });
    return list.filter(
      (c) => (!c.cap || session.can(c.cap)) && (!c.pro || session.pro || q.trim().length > 2) && (!c.module || modules.includes(c.module)) && (c.id !== 'mode' || session.user.allowed_modes.length > 1),
    );
  }, [cols, session, modules, q]);

  const items = useMemo(() => {
    const scored = commands
      .map((c) => ({ c, s: score(c, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);
    const fromServer: Cmd[] = results.map((r) => ({
      id: `r-${r.kind}-${r.id}`,
      label: r.title,
      group: 'Gefunden',
      icon: r.kind === 'media' ? 'image' : r.kind === 'contact' ? 'user' : r.kind === 'order' ? 'receipt' : 'page',
      hint: r.kind === 'entry' ? r.collectionName : r.subtitle,
      run: () =>
        navigate(r.kind === 'entry' ? entryUrl(r.collection!, r.id) : r.kind === 'media' ? `/medien?id=${r.id}` : r.kind === 'contact' ? `/kontakte/${r.id}` : `/bestellungen/${r.id}`),
    }));
    const list = q.trim() ? [...scored.slice(0, 9).map((x) => x.c), ...fromServer] : commands.filter((c) => ['Gehe zu', 'Erstellen'].includes(c.group)).slice(0, 12);
    return list;
  }, [commands, results, q]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const runItem = async (c: Cmd) => {
    if (!c.id.startsWith('help-')) onClose();
    try {
      await c.run();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(items.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === 'Enter' && items[sel]) {
      e.preventDefault();
      void runItem(items[sel]);
    }
  };

  let lastGroup = '';
  const helpTopic = HELP.find((h) => h.id === help);

  return (
    <RDialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {open && (
          <RDialog.Portal forceMount>
            <RDialog.Overlay asChild forceMount>
              <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} />
            </RDialog.Overlay>
            <RDialog.Content asChild forceMount>
              <motion.div
                className="cmdk"
                initial={{ opacity: 0, scale: 0.97, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
                transition={{ type: 'spring', stiffness: 600, damping: 40 }}
              >
                <RDialog.Title className="sr">Suchen und Befehle</RDialog.Title>
                <RDialog.Description className="sr">Tipp, was du tun möchtest, zum Beispiel «Öffnungszeiten ändern».</RDialog.Description>
                {helpTopic ? (
                  <div style={{ padding: '1.25rem 1.25rem 1.5rem' }} className="stack">
                    <button className="crumb linkish" style={{ textDecoration: 'none' }} onClick={() => setHelp(null)}>
                      <Icon name="arrowLeft" size="s" /> Zurück
                    </button>
                    <h2 style={{ fontSize: 'var(--t-xl)', fontWeight: 650, letterSpacing: '-0.01em' }}>{helpTopic.title}</h2>
                    <div className="stack tight" style={{ color: 'var(--ink-2)' }}>
                      {helpTopic.body.map((p, i) => (
                        <p key={i}>{p}</p>
                      ))}
                    </div>
                    {helpTopic.to && (
                      <button
                        className="btn primary"
                        style={{ justifySelf: 'start' }}
                        onClick={() => {
                          onClose();
                          navigate(helpTopic.to!);
                        }}
                      >
                        Hinbringen
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="cmdk-input">
                      <Icon name="search" />
                      <input
                        autoFocus
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={onKey}
                        placeholder="Was möchtest du tun? z. B. «Öffnungszeiten ändern»"
                        aria-label="Suche"
                        role="combobox"
                        aria-expanded="true"
                        aria-controls="cmdk-list"
                        aria-activedescendant={items[sel] ? `cmdk-${items[sel].id}` : undefined}
                      />
                    </div>
                    <div className="cmdk-list" id="cmdk-list" role="listbox" ref={listRef}>
                      {items.length === 0 && <p className="muted small" style={{ padding: '1rem' }}>Nichts gefunden. Versuch ein anderes Wort – oder frag dich durch die Hilfe.</p>}
                      {items.map((c, i) => {
                        const header = c.group !== lastGroup ? (lastGroup = c.group) : null;
                        return (
                          <div key={c.id}>
                            {header && <div className="cmdk-group">{header}</div>}
                            <button
                              id={`cmdk-${c.id}`}
                              role="option"
                              aria-selected={i === sel}
                              data-idx={i}
                              className="cmdk-item"
                              onMouseMove={() => setSel(i)}
                              onClick={() => void runItem(c)}
                            >
                              <Icon name={c.icon} />
                              <span className="ellipsis">{c.label}</span>
                              {c.hint && <span className="hint">{c.hint}</span>}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <div className="cmdk-foot">
                      <span>
                        <kbd>↑</kbd> <kbd>↓</kbd> auswählen
                      </span>
                      <span>
                        <kbd>↵</kbd> ausführen
                      </span>
                      <span>
                        <kbd>esc</kbd> schliessen
                      </span>
                    </div>
                  </>
                )}
              </motion.div>
            </RDialog.Content>
          </RDialog.Portal>
        )}
      </AnimatePresence>
    </RDialog.Root>
  );
}

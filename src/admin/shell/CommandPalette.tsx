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
import { helpTopics } from './help';
import { adminLang, t, tl } from '../lib/i18n';
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

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');

// Words that carry no meaning for matching ("Öffnungszeiten ändern" → "öffnungszeiten").
const STOP = new Set(
  'ich will mochte moechte wie wo kann man meine mein meinen die der das den dem ein eine einen zu zur zum und oder ist sind bitte mal andern aendern bearbeiten anpassen einstellen zeigen zeig offnen oeffnen gehe geh finden aktualisieren'.split(
    ' ',
  ),
);
const CREATE = new Set(['neu', 'neue', 'neuer', 'neues', 'neuen', 'erstellen', 'anlegen', 'hinzufugen', 'hinzufuegen', 'schreiben', 'erfassen']);
// The same for the other interface languages (accents removed, as norm() does). German words keep working too.
const STOP_MORE: Record<string, string> = {
  fr: 'je veux voudrais aimerais comment ou peux peut on mes mon ma le la les l un une des de du d a au aux et est sont svp stp modifier changer editer adapter regler montrer afficher voir ouvrir aller trouver mettre jour',
  it: 'io voglio vorrei come dove posso puo si mio mia miei mie il lo la i gli le un uno una di del della dei a al alla e o per favore modificare modifica cambiare cambia adattare mostrare mostra vedere aprire apri andare vai trovare aggiornare',
  en: 'i want would like how where can my the a an to and or is are please change edit adjust set show see open go find update',
};
const CREATE_MORE: Record<string, string> = {
  fr: 'nouveau nouvelle nouvel creer ajouter ecrire saisir',
  it: 'nuovo nuova nuovi nuove creare crea aggiungere aggiungi scrivere scrivi inserire',
  en: 'new create add write',
};
const isStop = (w: string) => STOP.has(w) || (STOP_MORE[adminLang()] ?? '').split(' ').includes(w);
const isCreate = (w: string) => CREATE.has(w) || (CREATE_MORE[adminLang()] ?? '').split(' ').includes(w);

/** Group names are German identifiers; shown in the interface language. */
function groupLabel(group: string) {
  switch (group) {
    case 'Gehe zu':
      return t('Gehe zu');
    case 'Aktionen':
      return t('Aktionen');
    case 'Einstellungen':
      return t('Einstellungen');
    case 'Erstellen':
      return t('Erstellen');
    case 'Hilfe':
      return t('Hilfe');
    case 'Gefunden':
      return t('Gefunden');
    default:
      return group;
  }
}

function score(cmd: Cmd, q: string): number {
  const tokens = norm(q)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (!tokens.length) return 1;
  const wantsCreate = tokens.some(isCreate);
  const meaningful = tokens.filter((w) => !isStop(w) && !isCreate(w));
  const words = norm(`${cmd.label} ${cmd.keywords ?? ''}`)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const label = norm(cmd.label);
  let s = 0;
  for (const tok of meaningful.length ? meaningful : tokens) {
    if (label.startsWith(tok)) s += 6;
    else if (words.some((w) => w.startsWith(tok))) s += 4;
    else if (tok.length >= 4 && words.some((w) => w.includes(tok))) s += 2;
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
      { id: 'home', label: t('Übersicht'), group: 'Gehe zu', icon: 'home', keywords: t('dashboard start startklar checkliste'), run: go('/') },
      { id: 'stats', label: t('Statistik'), group: 'Gehe zu', icon: 'chart', keywords: t('besucher zahlen aufrufe analytics conversions umsatz'), run: go('/statistik') },
      { id: 'pages', label: t('Seiten'), group: 'Gehe zu', icon: 'page', keywords: t('startseite unterseiten'), run: go('/seiten') },
      { id: 'content', label: t('Inhalte'), group: 'Gehe zu', icon: 'layers', run: go('/inhalte') },
      { id: 'media', label: t('Mediathek'), group: 'Gehe zu', icon: 'image', keywords: t('bilder fotos dateien videos hochladen'), run: go('/medien') },
      {
        id: 'forms',
        label: t('Formulare'),
        group: 'Gehe zu',
        icon: 'form',
        keywords: t('anfragen einträge kontaktformular reservation'),
        cap: 'forms.manage',
        run: go('/formulare'),
      },
      {
        id: 'contacts',
        label: t('Kontakte'),
        group: 'Gehe zu',
        icon: 'people',
        keywords: t('leads kunden anfragen crm pipeline'),
        cap: 'leads.view',
        module: 'leads',
        run: go('/kontakte'),
      },
      {
        id: 'orders',
        label: t('Bestellungen'),
        group: 'Gehe zu',
        icon: 'receipt',
        keywords: t('shop verkäufe rechnungen versand'),
        cap: 'orders.view',
        module: 'shop',
        run: go('/bestellungen'),
      },
      {
        id: 'bookings',
        label: t('Reservationen heute'),
        group: 'Gehe zu',
        icon: 'calendar',
        keywords: t('tisch termin buchung kalender tagesplan'),
        cap: 'bookings.manage',
        module: 'booking',
        run: go('/reservationen'),
      },
      {
        id: 'booking-new',
        label: t('Reservation eintragen'),
        group: 'Aktionen',
        icon: 'plus',
        keywords: t('telefon anruf tisch termin buchen'),
        cap: 'bookings.manage',
        module: 'booking',
        run: go('/reservationen?neu=1'),
      },
      {
        id: 'newsletter',
        label: t('Newsletter'),
        group: 'Gehe zu',
        icon: 'mail',
        keywords: t('abonnenten e-mail mailing ausgabe verschicken'),
        cap: 'newsletter.manage',
        module: 'newsletter',
        run: go('/newsletter'),
      },
      {
        id: 'newsletter-new',
        label: t('Newsletter schreiben'),
        group: 'Aktionen',
        icon: 'plus',
        keywords: t('ausgabe e-mail mailing verschicken'),
        cap: 'newsletter.manage',
        module: 'newsletter',
        run: go('/newsletter?id=neu'),
      },
      {
        id: 'members',
        label: t('Mitglieder'),
        group: 'Gehe zu',
        icon: 'key',
        keywords: t('konto abo mitgliedschaft paywall login'),
        cap: 'members.manage',
        module: 'members',
        run: go('/mitglieder'),
      },
      {
        id: 'tickets',
        label: t('Tickets & Anmeldungen'),
        group: 'Gehe zu',
        icon: 'ticket',
        keywords: t('event kurs teilnehmer verkauf anmeldung'),
        cap: 'events.manage',
        run: go('/tickets'),
      },
      {
        id: 'checkin',
        label: t('Einlass: Tickets scannen'),
        group: 'Aktionen',
        icon: 'qr',
        keywords: t('check-in qr scannen eingang tür kasse'),
        cap: 'events.manage',
        run: go('/einlass'),
      },
      {
        id: 'kitchen',
        label: t('Küche: Bestellungen'),
        group: 'Gehe zu',
        icon: 'dish',
        keywords: t('take-away lieferung bestellung essen bon'),
        cap: 'orders.manage',
        module: 'ordering',
        run: go('/kueche'),
      },
      {
        id: 'kitchen-pause',
        label: t('Küche voll: Bestellungen pausieren'),
        group: 'Aktionen',
        icon: 'clock',
        keywords: t('pause stopp take-away'),
        cap: 'orders.manage',
        module: 'ordering',
        run: go('/kueche'),
      },
      {
        id: 'donations',
        label: t('Spenden'),
        group: 'Gehe zu',
        icon: 'star',
        keywords: t('spende kampagne bestätigung steuer'),
        cap: 'donations.manage',
        module: 'donations',
        run: go('/spenden'),
      },
      {
        id: 's-booking',
        label: t('Reservation einrichten'),
        group: 'Einstellungen',
        icon: 'calendar',
        keywords: t('tische zeiten leistungen sperrzeit ferien kalender'),
        cap: 'settings.manage',
        module: 'booking',
        run: go('/einstellungen/reservation'),
      },
      { id: 'coupons', label: t('Gutscheine'), group: 'Gehe zu', icon: 'ticket', keywords: t('rabatt code aktion'), cap: 'orders.manage', module: 'shop', run: go('/gutscheine') },
      {
        id: 'comments',
        label: t('Kommentare'),
        group: 'Gehe zu',
        icon: 'chat',
        keywords: t('moderieren freigeben spam'),
        cap: 'comments.moderate',
        module: 'blog',
        run: go('/kommentare'),
      },
      {
        id: 's-site',
        label: t('Name, Logo & Kontakt'),
        group: 'Einstellungen',
        icon: 'globe',
        keywords: t('adresse telefon email logo firma uid'),
        cap: 'settings.manage',
        run: go('/einstellungen/website'),
      },
      {
        id: 's-hours',
        label: t('Öffnungszeiten'),
        group: 'Einstellungen',
        icon: 'clock',
        keywords: t('offen geschlossen ferien ruhetag zeiten'),
        cap: 'settings.manage',
        run: go('/einstellungen/website#zeiten'),
      },
      {
        id: 's-design',
        label: t('Design'),
        group: 'Einstellungen',
        icon: 'style',
        keywords: t('farben schrift schriften stil theme vorlage abstände look'),
        cap: 'design.manage',
        run: go('/einstellungen/design'),
      },
      {
        id: 's-nav',
        label: t('Menü & Fusszeile'),
        group: 'Einstellungen',
        icon: 'nav',
        keywords: t('navigation header footer menu links'),
        cap: 'settings.manage',
        run: go('/einstellungen/navigation'),
      },
      {
        id: 's-seo',
        label: t('Suchmaschinen (SEO)'),
        group: 'Einstellungen',
        icon: 'seo',
        keywords: t('google seo titel beschreibung website-check kaputte links'),
        cap: 'settings.manage',
        run: go('/einstellungen/seo'),
      },
      {
        id: 's-legal',
        label: t('Impressum & Datenschutz'),
        group: 'Einstellungen',
        icon: 'scale',
        keywords: t('rechtstexte agb dsgvo datenschutzerklärung'),
        cap: 'settings.manage',
        run: go('/einstellungen/rechtliches'),
      },
      {
        id: 's-domain',
        label: t('Domain'),
        group: 'Einstellungen',
        icon: 'globe',
        keywords: t('adresse url dns eigene domain'),
        cap: 'settings.manage',
        run: go('/einstellungen/domain'),
      },
      {
        id: 's-shop',
        label: t('Shop-Einstellungen'),
        group: 'Einstellungen',
        icon: 'bag',
        keywords: t('mwst versand zahlung twint rechnung'),
        cap: 'settings.manage',
        module: 'shop',
        run: go('/einstellungen/shop'),
      },
      {
        id: 's-modules',
        label: t('Module'),
        group: 'Einstellungen',
        icon: 'grid',
        keywords: t('funktionen blog shop speisekarte portfolio aktivieren'),
        cap: 'settings.manage',
        run: go('/einstellungen/module'),
      },
      {
        id: 's-team',
        label: t('Team & Rollen'),
        group: 'Einstellungen',
        icon: 'people',
        keywords: t('benutzer einladen rechte zugang mitarbeiter'),
        cap: 'users.manage',
        run: go('/einstellungen/team'),
      },
      {
        id: 's-data',
        label: t('Daten & Datenschutz'),
        group: 'Einstellungen',
        icon: 'database',
        keywords: t('export backup sicherung auskunft löschen dsgvo'),
        cap: 'privacy.manage',
        run: go('/einstellungen/daten'),
      },
      { id: 's-account', label: t('Mein Konto'), group: 'Einstellungen', icon: 'user', keywords: t('passwort 2fa zwei-faktor sitzungen profil'), run: go('/konto') },
      {
        id: 'w-types',
        label: t('Inhaltstypen'),
        group: 'Werkbank',
        icon: 'database',
        keywords: t('content types felder collections schema'),
        pro: true,
        cap: 'dev',
        run: go('/einstellungen/typen'),
      },
      {
        id: 'w-code',
        label: t('Eigenes CSS & Design-Tokens'),
        group: 'Werkbank',
        icon: 'code',
        keywords: t('css tokens variablen'),
        pro: true,
        cap: 'dev',
        run: go('/einstellungen/code'),
      },
      {
        id: 'w-api',
        label: t('API & Webhooks'),
        group: 'Werkbank',
        icon: 'webhook',
        keywords: t('rest token zapier make headless'),
        pro: true,
        cap: 'dev',
        run: go('/einstellungen/api'),
      },
      {
        id: 'w-redirects',
        label: t('Weiterleitungen'),
        group: 'Werkbank',
        icon: 'arrowRight',
        keywords: t('301 redirect alte adresse'),
        pro: true,
        cap: 'settings.manage',
        run: go('/einstellungen/weiterleitungen'),
      },
      {
        id: 'w-sql',
        label: t('SQL-Abfrage'),
        group: 'Werkbank',
        icon: 'database',
        keywords: t('datenbank query select'),
        pro: true,
        cap: 'data.sql',
        run: go('/einstellungen/sql'),
      },
      {
        id: 'w-audit',
        label: t('Protokoll'),
        group: 'Werkbank',
        icon: 'history',
        keywords: t('audit log wer hat was'),
        pro: true,
        cap: 'audit.view',
        run: go('/einstellungen/protokoll'),
      },
      {
        id: 'new-page',
        label: t('Neue Seite'),
        group: 'Erstellen',
        icon: 'plus',
        keywords: t('seite unterseite'),
        cap: 'content.edit',
        create: true,
        run: () => createAndOpen('pages'),
      },
      {
        id: 'new-post',
        label: t('Neuer Beitrag'),
        group: 'Erstellen',
        icon: 'plus',
        keywords: t('blog artikel journal news'),
        module: 'blog',
        create: true,
        run: () => createAndOpen('posts'),
      },
      {
        id: 'new-product',
        label: t('Neues Produkt'),
        group: 'Erstellen',
        icon: 'plus',
        keywords: t('shop artikel'),
        module: 'shop',
        cap: 'content.edit',
        create: true,
        run: () => createAndOpen('products'),
      },
      {
        id: 'new-dish',
        label: t('Neues Gericht'),
        group: 'Erstellen',
        icon: 'plus',
        keywords: t('speisekarte menü essen getränk'),
        module: 'menu',
        cap: 'content.edit',
        create: true,
        run: () => createAndOpen('dishes'),
      },
      {
        id: 'new-project',
        label: t('Neues Projekt'),
        group: 'Erstellen',
        icon: 'plus',
        keywords: t('portfolio referenz arbeit'),
        module: 'portfolio',
        cap: 'content.edit',
        create: true,
        run: () => createAndOpen('projects'),
      },
      {
        id: 'upload',
        label: t('Bilder hochladen'),
        group: 'Erstellen',
        icon: 'upload',
        keywords: t('foto bild datei'),
        cap: 'media.upload',
        create: true,
        run: go('/medien?upload=1'),
      },
      {
        id: 'mode',
        label: session.mode === 'studio' ? t('Zur Werkbank wechseln') : t('Zum Studio wechseln'),
        group: 'Aktionen',
        icon: 'code',
        keywords: t('modus profi einfach'),
        run: () => session.setMode(session.mode === 'studio' ? 'werkbank' : 'studio'),
      },
      {
        id: 'site',
        label: t('Website ansehen'),
        group: 'Aktionen',
        icon: 'external',
        keywords: t('live öffnen vorschau'),
        run: () => window.open(session.bundle?.system.publicUrl ?? '/', '_blank'),
      },
      { id: 'logout', label: t('Abmelden'), group: 'Aktionen', icon: 'logout', run: () => session.logout() },
    ];
    for (const c of cols?.collections ?? []) {
      if (!c.active || ['pages'].includes(c.id)) continue;
      list.push({ id: `col-${c.id}`, label: tl(c.name), group: 'Gehe zu', icon: c.icon, keywords: `${tl(c.singular)} ${c.id}`, run: go(`/inhalte/${c.id}`) });
      if (!c.builtin)
        list.push({ id: `new-${c.id}`, label: t('{name} anlegen', { name: tl(c.singular) }), group: 'Erstellen', icon: 'plus', create: true, run: () => createAndOpen(c.id) });
    }
    for (const h of helpTopics()) list.push({ id: `help-${h.id}`, label: h.title, group: 'Hilfe', icon: 'help', keywords: h.keywords, run: () => setHelp(h.id) });
    return list.filter(
      (c) =>
        (!c.cap || session.can(c.cap)) &&
        (!c.pro || session.pro || q.trim().length > 2) &&
        (!c.module || modules.includes(c.module)) &&
        (c.id !== 'mode' || session.user.allowed_modes.length > 1),
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
      hint: r.kind === 'entry' ? tl(r.collectionName) : r.subtitle,
      run: () =>
        navigate(
          r.kind === 'entry' ? entryUrl(r.collection!, r.id) : r.kind === 'media' ? `/medien?id=${r.id}` : r.kind === 'contact' ? `/kontakte/${r.id}` : `/bestellungen/${r.id}`,
        ),
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
  const helpTopic = help ? helpTopics().find((h) => h.id === help) : undefined;

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
                <RDialog.Title className="sr">{t('Suchen und Befehle')}</RDialog.Title>
                <RDialog.Description className="sr">{t('Tipp, was du tun möchtest, zum Beispiel «Öffnungszeiten ändern».')}</RDialog.Description>
                {helpTopic ? (
                  <div style={{ padding: '1.25rem 1.25rem 1.5rem' }} className="stack">
                    <button className="crumb linkish" style={{ textDecoration: 'none' }} onClick={() => setHelp(null)}>
                      <Icon name="arrowLeft" size="s" /> {t('Zurück')}
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
                        {t('Hinbringen')}
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
                        placeholder={t('Was möchtest du tun? z. B. «Öffnungszeiten ändern»')}
                        aria-label={t('Suche')}
                        role="combobox"
                        aria-expanded="true"
                        aria-controls="cmdk-list"
                        aria-activedescendant={items[sel] ? `cmdk-${items[sel].id}` : undefined}
                      />
                    </div>
                    <div className="cmdk-list" id="cmdk-list" role="listbox" ref={listRef}>
                      {items.length === 0 && (
                        <p className="muted small" style={{ padding: '1rem' }}>
                          {t('Nichts gefunden. Versuch ein anderes Wort – oder frag dich durch die Hilfe.')}
                        </p>
                      )}
                      {items.map((c, i) => {
                        const header = c.group !== lastGroup ? (lastGroup = c.group) : null;
                        return (
                          <div key={c.id}>
                            {header && <div className="cmdk-group">{groupLabel(header)}</div>}
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
                        <kbd>↑</kbd> <kbd>↓</kbd> {t('auswählen')}
                      </span>
                      <span>
                        <kbd>↵</kbd> {t('ausführen')}
                      </span>
                      <span>
                        <kbd>esc</kbd> {t('schliessen')}
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

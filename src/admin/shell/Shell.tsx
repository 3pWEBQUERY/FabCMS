import { lazy, Suspense, useState } from 'react';
import { Link, Router, usePath, navigate } from '../lib/router';
import { useSession } from '../lib/session';
import { useHotkey, modKey } from '../lib/hooks';
import { Icon, NovaMark } from '../ui/icons';
import { Menu, Tip, motion } from '../ui/kit';
import { CommandPalette } from './CommandPalette';
import { ModeSwitch } from './ModeSwitch';
import { RouteLoading } from '../ui/loading';
import { NotificationBell, NotificationsProvider } from './Notifications';
import { Dashboard } from '../views/Dashboard';
import { PagesList } from '../views/Pages';
import { ContentHub, CollectionList } from '../views/Content';
import { EntryRoute } from '../views/EntryRoute';

// Less frequent areas load on demand, so the dashboard and editor start fast.
const MediaLibrary = lazy(() => import('../views/Media').then((m) => ({ default: m.MediaLibrary })));
const FormsList = lazy(() => import('../views/Forms').then((m) => ({ default: m.FormsList })));
const FormDetail = lazy(() => import('../views/Forms').then((m) => ({ default: m.FormDetail })));
const Contacts = lazy(() => import('../views/Contacts').then((m) => ({ default: m.Contacts })));
const ContactDetail = lazy(() => import('../views/Contacts').then((m) => ({ default: m.ContactDetail })));
const Orders = lazy(() => import('../views/Orders').then((m) => ({ default: m.Orders })));
const OrderDetail = lazy(() => import('../views/Orders').then((m) => ({ default: m.OrderDetail })));
const Coupons = lazy(() => import('../views/Orders').then((m) => ({ default: m.Coupons })));
const Comments = lazy(() => import('../views/Comments').then((m) => ({ default: m.Comments })));
const Settings = lazy(() => import('../views/Settings').then((m) => ({ default: m.Settings })));
const Account = lazy(() => import('../views/Account').then((m) => ({ default: m.Account })));
const Stats = lazy(() => import('../views/Stats').then((m) => ({ default: m.Stats })));
const Bookings = lazy(() => import('../views/Bookings').then((m) => ({ default: m.Bookings })));
const Newsletter = lazy(() => import('../views/Newsletter').then((m) => ({ default: m.Newsletter })));
const Members = lazy(() => import('../views/Members').then((m) => ({ default: m.Members })));
const Tickets = lazy(() => import('../views/Tickets').then((m) => ({ default: m.Tickets })));
const CheckIn = lazy(() => import('../views/CheckIn').then((m) => ({ default: m.CheckIn })));

const Editor = lazy(() => import('../editor/Editor').then((m) => ({ default: m.Editor })));

const LEVELS = [
  { to: '/seiten', label: 'Seiten', icon: 'page', match: ['/seiten'] },
  { to: '/inhalte', label: 'Inhalte', icon: 'layers', match: ['/inhalte', '/medien', '/formulare', '/kontakte', '/bestellungen', '/gutscheine', '/kommentare', '/reservationen', '/newsletter', '/mitglieder', '/tickets', '/einlass'] },
  { to: '/einstellungen', label: 'Einstellungen', icon: 'settings', match: ['/einstellungen', '/konto'] },
];

function setTheme(t: 'light' | 'dark' | 'system') {
  try {
    if (t === 'system') localStorage.removeItem('nova-theme');
    else localStorage.setItem('nova-theme', t);
  } catch {
    /* ignore */
  }
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

export function Shell() {
  const { path } = usePath();
  const session = useSession();
  const [cmdk, setCmdk] = useState(false);
  useHotkey('mod+k', (e) => {
    e.preventDefault();
    setCmdk((v) => !v);
  });
  useHotkey('mod+.', (e) => {
    e.preventDefault();
    const next = session.mode === 'studio' ? 'werkbank' : 'studio';
    if (session.user.allowed_modes.includes(next)) void session.setMode(next);
  });

  // The canvas editor takes the whole screen.
  const editorMatch = /^\/(seiten|inhalte\/[a-z0-9_]+)\/([0-9a-f-]{36})$/.exec(path);
  const active = LEVELS.find((l) => l.match.some((m) => path.startsWith(m)));
  const site = session.bundle?.system.publicUrl ?? location.origin;

  return (
    <NotificationsProvider>
      {editorMatch && path.startsWith('/seiten/') ? (
        <Suspense
          fallback={
            <RouteLoading>
              <div className="editor-skel" aria-hidden="true">
                <div className="editor-skel-bar" />
                <div className="frame-load-veil">
                  <span className="splash-bar" />
                  <span>Editor lädt …</span>
                </div>
              </div>
            </RouteLoading>
          }
        >
          <Editor id={editorMatch[2]} onOpenPalette={() => setCmdk(true)} />
        </Suspense>
      ) : (
        <div className="shell">
          <header className="topbar">
            <Link to="/" className="brand-mark" aria-label="Übersicht">
              <NovaMark />
              <span className="ellipsis hide-m" style={{ maxWidth: '14rem' }}>
                {session.settings?.name ?? 'Nova'}
              </span>
            </Link>
            <nav className="levels" aria-label="Bereiche">
              {LEVELS.map((l) => (
                <Link key={l.to} to={l.to} aria-current={active?.to === l.to ? 'page' : undefined}>
                  {l.label}
                  {active?.to === l.to && <motion.span layoutId="level-ind" className="level-ind" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                </Link>
              ))}
            </nav>
            <div className="grow" />
            <button className="cmdk-trigger" onClick={() => setCmdk(true)} aria-label="Suchen und Befehle">
              <Icon name="search" size="s" />
              <span className="cmdk-label">Suchen oder tun …</span>
              <kbd>{modKey} K</kbd>
            </button>
            <NotificationBell />
            <ModeSwitch />
            <Tip label="Website ansehen">
              <a className="btn ghost icon-only hide-m" href={site} target="_blank" rel="noreferrer" aria-label="Website ansehen">
                <Icon name="external" />
              </a>
            </Tip>
            <Menu
              trigger={
                <button className="btn ghost icon-only" aria-label="Konto">
                  <Icon name="user" />
                </button>
              }
              items={[
                { label: session.user.name, icon: 'user', onSelect: () => navigate('/konto') },
                'sep',
                { label: 'Hell', icon: 'sun', onSelect: () => setTheme('light') },
                { label: 'Dunkel', icon: 'eyeOff', onSelect: () => setTheme('dark') },
                { label: 'Wie das System', icon: 'desktop', onSelect: () => setTheme('system') },
                'sep',
                { label: 'Abmelden', icon: 'logout', onSelect: () => void session.logout() },
              ]}
            />
          </header>
          <main className="main">
            <Suspense fallback={<RouteLoading />}>
            <Router
              routes={[
                { path: '/', render: () => <Dashboard /> },
                { path: '/statistik', render: () => <Stats /> },
                { path: '/seiten', render: () => <PagesList /> },
                { path: '/inhalte', render: () => <ContentHub /> },
                { path: '/inhalte/:collection', render: (p) => <CollectionList key={p.collection} collection={p.collection} /> },
                { path: '/inhalte/:collection/:id', render: (p) => <EntryRoute key={p.id} collection={p.collection} id={p.id} onOpenPalette={() => setCmdk(true)} /> },
                { path: '/medien', render: () => <MediaLibrary /> },
                { path: '/formulare', render: () => <FormsList /> },
                { path: '/formulare/:id', render: (p) => <FormDetail key={p.id} id={p.id} /> },
                { path: '/kontakte', render: () => <Contacts /> },
                { path: '/kontakte/:id', render: (p) => <ContactDetail key={p.id} id={p.id} /> },
                { path: '/bestellungen', render: () => <Orders /> },
                { path: '/bestellungen/:id', render: (p) => <OrderDetail key={p.id} id={p.id} /> },
                { path: '/gutscheine', render: () => <Coupons /> },
                { path: '/reservationen', render: () => <Bookings /> },
                { path: '/newsletter', render: () => <Newsletter /> },
                { path: '/mitglieder', render: () => <Members /> },
                { path: '/tickets', render: () => <Tickets /> },
                { path: '/einlass', render: () => <CheckIn /> },
                { path: '/kommentare', render: () => <Comments /> },
                { path: '/einstellungen', render: () => <Settings section="website" /> },
                { path: '/einstellungen/:section', render: (p) => <Settings section={p.section} /> },
                { path: '/konto', render: () => <Account /> },
              ]}
              fallback={
                <div className="page">
                  <h1>Diese Seite gibt es im Admin nicht.</h1>
                  <p className="muted" style={{ marginTop: '.5rem' }}>
                    <Link to="/">Zur Übersicht</Link>
                  </p>
                </div>
              }
            />
            </Suspense>
          </main>
          <nav className="tabbar" aria-label="Bereiche">
            <Link to="/" aria-current={path === '/' || path === '/statistik' ? 'page' : undefined}>
              <Icon name="home" />
              Übersicht
            </Link>
            {LEVELS.map((l) => (
              <Link key={l.to} to={l.to} aria-current={active?.to === l.to ? 'page' : undefined}>
                <Icon name={l.icon} />
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
      <CommandPalette open={cmdk} onClose={() => setCmdk(false)} />
    </NotificationsProvider>
  );
}

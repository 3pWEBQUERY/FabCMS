import { createContext, useContext, useEffect, useMemo, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

/**
 * Minimal client router for /admin. Routes are matched in order; params are
 * written as :name. A navigation guard lets the editor warn before leaving
 * with unsaved changes.
 */
const BASE = '/admin';
/** A guard returns true to let the navigation happen; a promise lets it ask first (own dialog). */
type Guard = () => boolean | Promise<boolean>;
const guards = new Set<Guard>();

export function addNavigationGuard(g: Guard) {
  guards.add(g);
  return () => void guards.delete(g);
}

/** Asks every guard; calls `go` right away when all agree synchronously, else after the answers. */
function whenAllowed(go: () => void, stay?: () => void) {
  const answers = [...guards].map((g) => g());
  if (answers.every((a) => a === true)) return go();
  void Promise.all(answers).then((ok) => (ok.every(Boolean) ? go() : stay?.()));
}

let lastUrl = location.pathname + location.search;

function go(url: string, replace: boolean) {
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  lastUrl = url;
  window.dispatchEvent(new Event('nova:navigate'));
  if (!replace) window.scrollTo(0, 0);
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const url = to.startsWith('/admin') ? to : BASE + (to.startsWith('/') ? to : `/${to}`);
  whenAllowed(() => go(url, Boolean(opts.replace)));
}

// The browser's back/forward button: the URL has already changed, so put it back,
// ask, and only then go where the person wanted. Registered first, so views see
// the popstate only when it is allowed.
window.addEventListener('popstate', (e) => {
  const target = location.pathname + location.search;
  if ([...guards].length === 0) {
    lastUrl = target;
    return;
  }
  const answers = [...guards].map((g) => g());
  if (answers.every((a) => a === true)) {
    lastUrl = target;
    return;
  }
  e.stopImmediatePropagation();
  history.pushState(null, '', lastUrl);
  void Promise.all(answers).then((ok) => ok.every(Boolean) && go(target, false));
});

function currentPath() {
  const p = location.pathname.replace(/^\/admin/, '') || '/';
  return p.length > 1 ? p.replace(/\/$/, '') : p;
}

const RouteCtx = createContext<{ path: string; params: Record<string, string>; query: URLSearchParams }>({ path: '/', params: {}, query: new URLSearchParams() });

export function usePath() {
  const [path, setPath] = useState(currentPath);
  const [search, setSearch] = useState(location.search);
  useEffect(() => {
    const on = () => {
      setPath(currentPath());
      setSearch(location.search);
    };
    window.addEventListener('popstate', on);
    window.addEventListener('nova:navigate', on);
    return () => {
      window.removeEventListener('popstate', on);
      window.removeEventListener('nova:navigate', on);
    };
  }, []);
  return { path, query: useMemo(() => new URLSearchParams(search), [search]) };
}

export function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/').filter(Boolean);
  const b = path.split('/').filter(Boolean);
  if (a.length !== b.length && !pattern.endsWith('*')) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '*') return params;
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i] ?? '');
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

export interface Route {
  path: string;
  render: (params: Record<string, string>) => ReactNode;
}

export function Router({ routes, fallback }: { routes: Route[]; fallback: ReactNode }) {
  const { path, query } = usePath();
  for (const r of routes) {
    const params = match(r.path, path);
    if (params) return <RouteCtx.Provider value={{ path, params, query }}>{r.render(params)}</RouteCtx.Provider>;
  }
  return <>{fallback}</>;
}

export const useRoute = () => useContext(RouteCtx);

export function Link({ to, children, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const href = to.startsWith('http') ? to : BASE + (to.startsWith('/') ? to : `/${to}`);
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    rest.onClick?.(e);
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || rest.target === '_blank' || to.startsWith('http')) return;
    e.preventDefault();
    navigate(to);
  };
  return (
    <a href={href} {...rest} onClick={onClick}>
      {children}
    </a>
  );
}

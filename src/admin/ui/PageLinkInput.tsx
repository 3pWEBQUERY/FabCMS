import { createContext, useContext, useEffect, useState, type InputHTMLAttributes } from 'react';
import { api } from '../lib/api';
import { entryUrl } from '../lib/actions';
import { t, tl } from '../lib/i18n';
import { navigate } from '../lib/router';
import { SuggestInput } from './kit';
import { useToast } from './toast';
import { pageForLink } from '../../shared/paths';
import { pageAnchors, type PageAnchor } from '../../shared/anchors';
import type { Block } from '../../shared/types';

type PageLink = { value: string; label: string; id?: string };

// One list of the site's pages for every link field on screen, fetched again after half a minute or a new page.
let cache: { at: number; list: Promise<PageLink[]> } | null = null;
const listeners = new Set<() => void>();

function pageLinks(): Promise<PageLink[]> {
  if (!cache || Date.now() - cache.at > 30_000)
    cache = {
      at: Date.now(),
      list: api
        .get<{ entries: { id: string; slug: string; title: string }[] }>('/api/entries?collection=pages&limit=300')
        .then((r) => r.entries.map((p) => ({ value: p.slug ? `/${p.slug}` : '/', label: p.title, id: p.id })))
        .catch(() => []),
    };
  return cache.list;
}

/** The «Sprungmarken» of the page being edited – the editor provides them, link fields suggest them as #… */
export const PageAnchorsContext = createContext<PageAnchor[]>([]);

// Another page's «Sprungmarken», fetched once its address is typed with a «#».
const anchorCache = new Map<string, Promise<PageAnchor[]>>();
const anchorsOf = (id: string) => {
  if (!anchorCache.has(id))
    anchorCache.set(
      id,
      api
        .get<{ entry: { data: { blocks?: Block[] } } }>(`/api/entries/${id}`)
        .then((r) => pageAnchors(r.entry.data.blocks ?? []))
        .catch(() => []),
    );
  return anchorCache.get(id)!;
};

/** «Sprungmarken» as link suggestions: this page's as #…, another page's once its address is typed with a «#». */
function useAnchorLinks(value: string, pages: PageLink[]): PageLink[] {
  const here = useContext(PageAnchorsContext);
  const path = /^(\/[^#?\s]*)#/.exec(value.trim())?.[1];
  const other = path ? pages.find((p) => p.value === path) : undefined;
  const [there, setThere] = useState<{ id: string; list: PageAnchor[] } | null>(null);
  useEffect(() => {
    if (!other?.id) return;
    let alive = true;
    void anchorsOf(other.id).then((list) => alive && setThere({ id: other.id!, list }));
    return () => {
      alive = false;
    };
  }, [other?.id]);
  const label = (a: PageAnchor) => t('Sprungmarke · {name}', { name: tl(a.label) });
  return [
    ...here.map((a) => ({ value: `#${a.anchor}`, label: label(a) })),
    ...(other && there && there.id === other.id ? there.list.map((a) => ({ value: `${other.value}#${a.anchor}`, label: `${other.label} · ${label(a)}` })) : []),
  ];
}

/** The site's pages as link suggestions. */
export function usePageLinks(): PageLink[] {
  const [list, setList] = useState<PageLink[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => void pageLinks().then((l) => alive && setList(l));
    load();
    listeners.add(load);
    return () => {
      alive = false;
      listeners.delete(load);
    };
  }, []);
  return list;
}

/**
 * A link target with the site's pages as suggestions. Typed something no page
 * has yet – «/team» or «Unser Team» – it offers to create that page right away
 * (a draft) and links to it.
 */
export function PageLinkInput({
  value,
  onChange,
  ...rest
}: { value: string; onChange: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'list'>) {
  const pages = usePageLinks();
  const anchors = useAnchorLinks(value, pages);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const want = pageForLink(value);
  const taken = want && pages.some((p) => p.value === `/${want.slug}` || p.label.toLowerCase() === want.title.toLowerCase());
  const create = async () => {
    if (!want || busy) return;
    setBusy(true);
    try {
      const { entry } = await api.post<{ entry: { id: string; slug: string } }>('/api/entries', { collection: 'pages', slug: want.slug, data: { title: want.title } });
      onChange(`/${entry.slug}`);
      cache = null;
      listeners.forEach((l) => l());
      toast(t('Seite «{name}» als Entwurf angelegt. Veröffentliche sie, damit der Link auf der Website funktioniert.', { name: want.title }), {
        ms: 9000,
        action: { label: t('Öffnen'), run: () => navigate(entryUrl('pages', entry.id)) },
      });
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <SuggestInput
      {...rest}
      value={value}
      onChange={onChange}
      suggestions={value.includes('#') ? [...anchors, ...pages] : [...pages, ...anchors]}
      aria-busy={busy || undefined}
      extra={want && !taken ? { label: t('Neue Seite «{name}» anlegen', { name: want.title }), icon: 'plus', run: () => void create() } : undefined}
    />
  );
}

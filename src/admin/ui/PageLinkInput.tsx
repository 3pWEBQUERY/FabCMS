import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { api } from '../lib/api';
import { entryUrl } from '../lib/actions';
import { t } from '../lib/i18n';
import { navigate } from '../lib/router';
import { SuggestInput } from './kit';
import { useToast } from './toast';
import { pageForLink } from '../../shared/paths';

type PageLink = { value: string; label: string };

// One list of the site's pages for every link field on screen, fetched again after half a minute or a new page.
let cache: { at: number; list: Promise<PageLink[]> } | null = null;
const listeners = new Set<() => void>();

function pageLinks(): Promise<PageLink[]> {
  if (!cache || Date.now() - cache.at > 30_000)
    cache = {
      at: Date.now(),
      list: api
        .get<{ entries: { slug: string; title: string }[] }>('/api/entries?collection=pages&limit=300')
        .then((r) => r.entries.map((p) => ({ value: p.slug ? `/${p.slug}` : '/', label: p.title })))
        .catch(() => []),
    };
  return cache.list;
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
      suggestions={pages}
      aria-busy={busy || undefined}
      extra={want && !taken ? { label: t('Neue Seite «{name}» anlegen', { name: want.title }), icon: 'plus', run: () => void create() } : undefined}
    />
  );
}

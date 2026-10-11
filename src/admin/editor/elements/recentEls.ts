import { useState } from 'react';
import { EL_KINDS, type ElKind } from '../../../shared/elements';

/**
 * The elements someone reaches for: the last few inserted and the ones they
 * starred – remembered in this browser, at the top of the element picker.
 */
const RECENT = 'nova-el-recent';
const FAVS = 'nova-el-favs';
export const RECENT_MAX = 6;

const read = (key: string): ElKind[] => {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(v) ? v.filter((k): k is ElKind => (EL_KINDS as readonly string[]).includes(k) && k !== 'component') : [];
  } catch {
    return [];
  }
};
const write = (key: string, kinds: ElKind[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(kinds));
  } catch {
    /* not remembered */
  }
};

/** The newest first, each once, at most RECENT_MAX. */
export const withRecent = (list: ElKind[], kind: ElKind): ElKind[] => [kind, ...list.filter((k) => k !== kind)].slice(0, RECENT_MAX);

/** An element was inserted – by click, «/» or drag. */
export function rememberEl(kind: ElKind) {
  if (kind === 'component') return;
  write(RECENT, withRecent(read(RECENT), kind));
}

/** Recent and starred kinds, and the star switch. */
export function useElFavorites() {
  const [favs, setFavs] = useState(() => read(FAVS));
  const recent = read(RECENT);
  const toggle = (kind: ElKind) => {
    const next = favs.includes(kind) ? favs.filter((k) => k !== kind) : [...favs, kind];
    write(FAVS, next);
    setFavs(next);
  };
  return { favs, recent, toggle };
}

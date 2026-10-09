import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { addNavigationGuard } from './router';
import type { CollectionDef, Entry, EntryData } from '../../shared/types';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

export interface EntryDoc {
  entry: Entry | null;
  collection: CollectionDef | null;
  path: string | null;
  blockers: string[];
  data: EntryData | null;
  slug: string;
  saveState: SaveState;
  error: string | null;
  setData: (fn: (d: EntryData) => EntryData, opts?: { history?: boolean }) => void;
  setSlug: (s: string) => void;
  saveNow: () => Promise<boolean>;
  reload: () => Promise<void>;
  setEntry: (e: Entry) => void;
  markStockTouched: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Bumped when undo/redo replaced data wholesale (the canvas re-renders). */
  externalChange: number;
}

const SAVE_DELAY = 700;
const HISTORY_LIMIT = 300;

/**
 * Loads an entry and keeps it saved: every change is debounced to the server,
 * the version number guards against overwriting someone else's work, and an
 * unlimited (well, 300 steps) undo history lives in memory.
 */
export function useEntryDoc(id: string): EntryDoc {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [collection, setCollection] = useState<CollectionDef | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [data, setDataState] = useState<EntryData | null>(null);
  const [slug, setSlugState] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [error, setError] = useState<string | null>(null);
  const [externalChange, setExternalChange] = useState(0);
  const [hist, setHist] = useState({ past: 0, future: 0 });

  const dataRef = useRef<EntryData | null>(null);
  const slugRef = useRef('');
  const versionRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef<Promise<boolean> | null>(null);
  const pendingAgain = useRef(false);
  const stockTouched = useRef(false);
  const past = useRef<EntryData[]>([]);
  const future = useRef<EntryData[]>([]);
  const lastPush = useRef(0);

  const reload = useCallback(async () => {
    const r = await api.get<{ entry: Entry; collection: CollectionDef; path: string | null; blockers: string[] }>(`/api/entries/${id}`);
    setEntry(r.entry);
    setCollection(r.collection);
    setPath(r.path);
    setBlockers(r.blockers);
    setDataState(r.entry.data);
    dataRef.current = r.entry.data;
    setSlugState(r.entry.slug);
    slugRef.current = r.entry.slug;
    versionRef.current = r.entry.version;
    setSaveState('saved');
    setError(null);
  }, [id]);

  useEffect(() => {
    void reload().catch((e) => setError((e as Error).message));
  }, [reload]);

  const doSave = useCallback(async (): Promise<boolean> => {
    if (!dataRef.current) return true;
    if (saving.current) {
      pendingAgain.current = true;
      return saving.current;
    }
    setSaveState('saving');
    const run = (async () => {
      try {
        const r = await api.put<{ entry: Entry; path: string | null; blockers: string[] }>(`/api/entries/${id}`, {
          data: dataRef.current,
          slug: slugRef.current,
          baseVersion: versionRef.current,
          stockTouched: stockTouched.current || undefined,
        });
        versionRef.current = r.entry.version;
        stockTouched.current = false;
        setEntry(r.entry);
        setPath(r.path);
        setBlockers(r.blockers);
        if (r.entry.slug !== slugRef.current) {
          slugRef.current = r.entry.slug;
          setSlugState(r.entry.slug);
        }
        setError(null);
        return true;
      } catch (e) {
        const err = e as ApiError;
        setError(err.message);
        setSaveState(err.status === 409 ? 'conflict' : 'error');
        return false;
      }
    })();
    saving.current = run;
    const ok = await run;
    saving.current = null;
    if (pendingAgain.current) {
      pendingAgain.current = false;
      return doSave();
    }
    if (ok) setSaveState('saved');
    return ok;
  }, [id]);

  const schedule = useCallback(() => {
    setSaveState('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void doSave(), SAVE_DELAY);
  }, [doSave]);

  const setData = useCallback(
    (fn: (d: EntryData) => EntryData, opts: { history?: boolean } = {}) => {
      const cur = dataRef.current;
      if (!cur) return;
      const next = fn(cur);
      if (next === cur) return;
      if (opts.history !== false) {
        // Typing in one field coalesces into one undo step per 800 ms.
        const now = Date.now();
        if (now - lastPush.current > 800 || !past.current.length) {
          past.current.push(cur);
          if (past.current.length > HISTORY_LIMIT) past.current.shift();
        }
        lastPush.current = now;
        future.current = [];
        setHist({ past: past.current.length, future: 0 });
      }
      dataRef.current = next;
      setDataState(next);
      schedule();
    },
    [schedule],
  );

  const setSlug = useCallback(
    (s: string) => {
      slugRef.current = s;
      setSlugState(s);
      schedule();
    },
    [schedule],
  );

  const applyHistory = (from: React.MutableRefObject<EntryData[]>, to: React.MutableRefObject<EntryData[]>) => {
    const prev = from.current.pop();
    if (!prev || !dataRef.current) return;
    to.current.push(dataRef.current);
    dataRef.current = prev;
    setDataState(prev);
    lastPush.current = 0;
    setHist({ past: past.current.length, future: future.current.length });
    setExternalChange((n) => n + 1);
    schedule();
  };

  useEffect(() => {
    // Leaving the page (tab closed, reload, typed URL): the last change goes out with keepalive,
    // so the browser doesn't have to ask «Leave site?». It only asks when saving can't work:
    // the last save failed, someone else changed the entry, or the change is too big for keepalive.
    const flush = (): boolean => {
      if (saveState !== 'dirty' && saveState !== 'saving') return true;
      if (!dataRef.current) return true;
      const body = JSON.stringify({
        data: dataRef.current,
        slug: slugRef.current,
        // While a save is in flight it will bump the version; this newer copy must not bounce off it.
        baseVersion: saving.current ? undefined : versionRef.current,
        stockTouched: stockTouched.current || undefined,
      });
      if (body.length > 60_000) return false;
      void fetch(`/api/entries/${id}`, { method: 'PUT', keepalive: true, credentials: 'same-origin', headers: { 'X-Nova': '1', 'Content-Type': 'application/json' }, body }).catch(() => {});
      return true;
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (saveState === 'error' || saveState === 'conflict' || !flush()) e.preventDefault();
    };
    // Switching to another tab or app saves right away instead of waiting for the timer.
    const onHidden = () => {
      if (document.visibilityState === 'hidden' && saveState === 'dirty') {
        if (timer.current) clearTimeout(timer.current);
        void doSave();
      }
    };
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('visibilitychange', onHidden);
    const off = addNavigationGuard(() => {
      if (saveState === 'dirty') {
        if (timer.current) clearTimeout(timer.current);
        void doSave();
      }
      return true;
    });
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('visibilitychange', onHidden);
      off();
    };
  }, [saveState, doSave, id]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return {
    entry,
    collection,
    path,
    blockers,
    data,
    slug,
    saveState,
    error,
    setData,
    setSlug,
    saveNow: async () => {
      if (timer.current) clearTimeout(timer.current);
      return doSave();
    },
    reload,
    setEntry: (e) => {
      setEntry(e);
      versionRef.current = e.version;
    },
    markStockTouched: () => {
      stockTouched.current = true;
    },
    undo: () => applyHistory(past, future),
    redo: () => applyHistory(future, past),
    canUndo: hist.past > 0,
    canRedo: hist.future > 0,
    externalChange,
  };
}


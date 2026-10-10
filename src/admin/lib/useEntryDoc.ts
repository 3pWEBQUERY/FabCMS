import { useCallback, useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { api, ApiError } from './api';
import { addNavigationGuard } from './router';
import { useSession } from './session';
import { tm } from './i18n';
import { CollabSession, type LinkState, type Peer } from './collab';
import { applyData, changedBlocks, dataMap, toData } from '../../shared/collab-doc';
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
  /** Changes from other people: which blocks to re-render (or everything if the structure changed). */
  remote: { seq: number; changed: string[]; structure: boolean };
  /** Real-time link: live = changes go to everyone at once and the server saves. */
  link: LinkState | 'off';
  /** Others editing this entry right now. */
  peers: Peer[];
  /** Tell the others which block I'm on. */
  setPresence: (block: string | null) => void;
  /** Language being edited; null = main language. */
  lang: string | null;
  /** Which translations exist (for the language switcher). */
  translations: { lang: string; status: string; changed: boolean }[];
  /** Status of the original while a translation is edited. */
  original: { status: string; slug: string } | null;
}

const SAVE_DELAY = 700;
const HISTORY_LIMIT = 300;
/** Origin of my own changes in the shared document (the undo manager tracks only these). */
const LOCAL = { local: true };

/**
 * Loads an entry and keeps it saved.
 *
 * Live (the normal case): the entry is a shared Yjs document; changes reach
 * everyone in the room at once and the server saves them. Several people can
 * work on one page; different blocks and props never collide.
 *
 * Without a connection (blocked, offline, older proxy): every change is
 * debounced to the server as before, the version number guards against
 * overwriting someone else's work, and the undo history lives in memory.
 * The editor tries to go live again every few seconds.
 */
export function useEntryDoc(id: string, lang: string | null = null): EntryDoc {
  const q = lang ? `?lang=${lang}` : '';
  const { user } = useSession();
  const [translations, setTranslations] = useState<EntryDoc['translations']>([]);
  const [original, setOriginal] = useState<EntryDoc['original']>(null);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [collection, setCollection] = useState<CollectionDef | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [data, setDataState] = useState<EntryData | null>(null);
  const [slug, setSlugState] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [error, setError] = useState<string | null>(null);
  const [externalChange, setExternalChange] = useState(0);
  const [remote, setRemote] = useState<EntryDoc['remote']>({ seq: 0, changed: [], structure: false });
  const [hist, setHist] = useState({ past: 0, future: 0 });
  const [link, setLink] = useState<EntryDoc['link']>('off');
  const [peers, setPeers] = useState<Peer[]>([]);

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
  const session = useRef<CollabSession | null>(null);
  const undoer = useRef<Y.UndoManager | null>(null);
  const live = useRef(false);
  /** Local changes not yet confirmed saved (REST or room). */
  const dirty = useRef(false);

  const reload = useCallback(async () => {
    const r = await api.get<{
      entry: Entry;
      collection: CollectionDef;
      path: string | null;
      blockers: string[];
      translations?: EntryDoc['translations'];
      original?: EntryDoc['original'];
    }>(`/api/entries/${id}${q}`);
    setTranslations(r.translations ?? []);
    setOriginal(r.original ?? null);
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
    dirty.current = false;
    setError(null);
  }, [id, q]);

  useEffect(() => {
    void reload().catch((e) => setError((e as Error).message));
  }, [reload]);

  /* ---------- saving without a live connection (REST) ---------- */

  const doSave = useCallback(async (): Promise<boolean> => {
    if (!dataRef.current) return true;
    if (saving.current) {
      pendingAgain.current = true;
      return saving.current;
    }
    setSaveState('saving');
    const run = (async () => {
      try {
        const r = await api.put<{ entry: Entry; path: string | null; blockers: string[] }>(`/api/entries/${id}${q}`, {
          data: dataRef.current,
          slug: slugRef.current,
          // Live, the room is the only writer: no version to guard.
          baseVersion: live.current ? undefined : versionRef.current,
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
    if (ok) {
      dirty.current = false;
      setSaveState('saved');
    }
    return ok;
  }, [id, q]);

  /* ---------- live: shared document, the room saves ---------- */

  const flushLive = useCallback(async (): Promise<boolean> => {
    const s = session.current;
    if (!s || !live.current) return doSave();
    setSaveState('saving');
    dirty.current = false;
    const touched = stockTouched.current;
    stockTouched.current = false;
    const ok = await s.flush({ stockTouched: touched || undefined });
    if (!ok) {
      if (touched) stockTouched.current = true;
      // The room answered with an error (shown via status) or the link dropped: try the old way.
      if (!live.current) return doSave();
      return false;
    }
    if (!dirty.current) setSaveState('saved');
    return true;
  }, [doSave]);

  const schedule = useCallback(() => {
    dirty.current = true;
    setSaveState('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void (live.current ? flushLive() : doSave()), SAVE_DELAY);
  }, [doSave, flushLive]);

  useEffect(() => {
    if (!entry || typeof WebSocket === 'undefined') return;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const start = () => {
      if (stopped) return;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const s = new CollabSession(
        `${proto}://${location.host}/api/collab/${id}${q}`,
        { id: user.id, name: user.name },
        {
          state: (st) => {
            if (stopped || session.current !== s) return;
            if (st === 'live') {
              attempt = 0;
              live.current = true;
              // Changes made before the link was up (or while it was down) go into the shared document.
              if (dirty.current && dataRef.current) applyData(s.doc, dataRef.current, LOCAL);
              else {
                const d = toData(s.doc);
                if (JSON.stringify(d) !== JSON.stringify(dataRef.current)) {
                  dataRef.current = d;
                  setDataState(d);
                  setExternalChange((n) => n + 1);
                }
              }
              const um = new Y.UndoManager(dataMap(s.doc), { trackedOrigins: new Set([LOCAL]), captureTimeout: 800 });
              const onStack = () => setHist({ past: um.undoStack.length, future: um.redoStack.length });
              um.on('stack-item-added', onStack);
              um.on('stack-item-popped', onStack);
              undoer.current = um;
              setHist({ past: 0, future: 0 });
              setLink('live');
              if (dirty.current) void flushLive();
            } else if (st === 'offline') {
              live.current = false;
              undoer.current?.destroy();
              undoer.current = null;
              past.current = [];
              future.current = [];
              setHist({ past: 0, future: 0 });
              setPeers([]);
              setLink('offline');
              s.destroy();
              session.current = null;
              // Unsaved changes go the old way; a fresh session is tried a bit later.
              if (dirty.current) void doSave();
              retry = setTimeout(start, Math.min(30_000, 3000 * 2 ** attempt++));
            }
          },
          status: (st) => {
            if (stopped || session.current !== s) return;
            if (st.t === 'saved') {
              const e = st.entry as Entry;
              versionRef.current = e.version ?? versionRef.current;
              setEntry((prev) => (prev ? { ...prev, ...e, data: dataRef.current ?? prev.data } : prev));
              setPath(st.path);
              setBlockers(st.blockers.map(tm));
              setError(null);
              if (!dirty.current) setSaveState('saved');
            } else if (st.t === 'error') {
              setError(tm(st.message));
              setSaveState('error');
            }
          },
          peers: (p) => !stopped && session.current === s && setPeers(p),
        },
      );
      session.current = s;
      setLink('connecting');
      s.doc.on('afterTransaction', (tr: Y.Transaction) => {
        if (!live.current || session.current !== s || tr.origin === LOCAL || !tr.changed.size) return;
        const prev = dataRef.current;
        const next = toData(s.doc);
        dataRef.current = next;
        setDataState(next);
        if (tr.origin === undoer.current) {
          // My own undo/redo: the editor re-renders like before and saves.
          setExternalChange((n) => n + 1);
          schedule();
        } else {
          const diff = changedBlocks(prev, next);
          setRemote((r) => ({ seq: r.seq + 1, ...diff }));
        }
      });
    };
    start();
    const onOnline = () => {
      if (session.current || stopped) return;
      if (retry) clearTimeout(retry);
      attempt = 0;
      start();
    };
    window.addEventListener('online', onOnline);
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      window.removeEventListener('online', onOnline);
      undoer.current?.destroy();
      undoer.current = null;
      session.current?.destroy();
      session.current = null;
      live.current = false;
    };
    // One session per loaded entry; reload() of the same entry keeps it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(entry), id, q]);

  /* ---------- editing ---------- */

  const setData = useCallback(
    (fn: (d: EntryData) => EntryData, opts: { history?: boolean } = {}) => {
      const cur = dataRef.current;
      if (!cur) return;
      const next = fn(cur);
      if (next === cur) return;
      if (live.current && session.current) {
        dataRef.current = next;
        setDataState(next);
        if (opts.history === false) {
          // Not undoable (e.g. a server-side fix-up): outside the tracked origin.
          applyData(session.current.doc, next, null);
        } else applyData(session.current.doc, next, LOCAL);
        schedule();
        return;
      }
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
      // The address isn't part of the shared document: it goes the direct way, also when live.
      dirty.current = true;
      setSaveState('dirty');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void doSave(), SAVE_DELAY);
    },
    [doSave],
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
      if (live.current && session.current) {
        // The room saves what it has as soon as everyone left.
        void session.current.flush({ stockTouched: stockTouched.current || undefined });
        return true;
      }
      const body = JSON.stringify({
        data: dataRef.current,
        slug: slugRef.current,
        // While a save is in flight it will bump the version; this newer copy must not bounce off it.
        baseVersion: saving.current ? undefined : versionRef.current,
        stockTouched: stockTouched.current || undefined,
      });
      if (body.length > 60_000) return false;
      void fetch(`/api/entries/${id}${q}`, {
        method: 'PUT',
        keepalive: true,
        credentials: 'same-origin',
        headers: { 'X-Nova': '1', 'Content-Type': 'application/json' },
        body,
      }).catch(() => {});
      return true;
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (saveState === 'error' || saveState === 'conflict' || !flush()) e.preventDefault();
    };
    // Switching to another tab or app saves right away instead of waiting for the timer.
    const onHidden = () => {
      if (document.visibilityState === 'hidden' && saveState === 'dirty') {
        if (timer.current) clearTimeout(timer.current);
        void (live.current ? flushLive() : doSave());
      }
    };
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('visibilitychange', onHidden);
    const off = addNavigationGuard(() => {
      if (saveState === 'dirty') {
        if (timer.current) clearTimeout(timer.current);
        void (live.current ? flushLive() : doSave());
      }
      return true;
    });
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('visibilitychange', onHidden);
      off();
    };
  }, [saveState, doSave, flushLive, id, q]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

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
      // A pending address change goes the direct way first.
      if (entry && slugRef.current !== entry.slug && !(await doSave())) return false;
      return live.current ? flushLive() : doSave();
    },
    reload,
    setEntry: (e) => {
      setEntry(e);
      versionRef.current = e.version;
    },
    markStockTouched: () => {
      stockTouched.current = true;
    },
    undo: () => (live.current && undoer.current ? undoer.current.undo() : applyHistory(past, future)),
    redo: () => (live.current && undoer.current ? undoer.current.redo() : applyHistory(future, past)),
    lang,
    translations,
    original,
    canUndo: hist.past > 0,
    canRedo: hist.future > 0,
    externalChange,
    remote,
    link,
    peers,
    setPresence: (block) => session.current?.setBlock(block),
  };
}

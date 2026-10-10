import { AnimatePresence, motion, useAnimationControls } from 'motion/react';
import { LoadingFrame } from '../ui/loading';
import * as RPopover from '@radix-ui/react-popover';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useEntryDoc } from '../lib/useEntryDoc';
import { useSession } from '../lib/session';
import { t, tl } from '../lib/i18n';
import { navigate, usePath } from '../lib/router';
import { useApi, useHotkey, modKey, useMediaQuery, isMac } from '../lib/hooks';
import { LangSwitch, TranslationNote, useEditLang } from '../ui/LangSwitch';
import { CommentsPanel, useComments } from './Comments';
import { Presence } from '../ui/Presence';
import { AiTranslate } from '../ui/Ai';
import { Icon } from '../ui/icons';
import { Segmented, Tip } from '../ui/kit';
import { PublishControls, SaveStatus } from '../ui/Publish';
import { useToast } from '../ui/toast';
import { ModeSwitch } from '../shell/ModeSwitch';
import { BlockPicker } from './BlockPicker';
import { Inspector } from './Inspector';
import { GlobalPanel, HistoryPanel, PagePanel, SeoPanel, StructurePanel } from './Panels';
import { changedBlockIds, postToCanvas, setIn, updateBlock } from './util';
import { BLOCK_MAP, createBlock } from '../../shared/blocks';
import { shortId } from '../../shared/text';
import type { SeoCheck } from '../../shared/seo-analyze';
import type { Block, CollectionDef } from '../../shared/types';
import { blockCss, blockDomId, COLOR_TOKENS, designImages, type DesignState } from '../../shared/design';
import { TokenColors } from './design/controls';
import {
  cloneEl,
  createEl,
  EL_DEFS,
  elementImages,
  elementsCss,
  findEl,
  insertEl,
  isContainer,
  ITEM_CONTAINERS,
  moveEl,
  newItem,
  removeEl,
  updateEl,
  type El,
  type ElKind,
} from '../../shared/elements';
import { ElementInspector } from './elements/ElementInspector';
import { ElementPicker, ElementToolbar, elLabel } from './elements/ElementToolbar';
import { ContextMenu, KEYS, ShortcutsDialog, type CtxItem } from './ContextMenu';
import { shortcutAction, type EditorAction } from '../../shared/shortcuts';
import type { Design } from '../../shared/design';

/** Blocks and elements on the clipboard – kept in the browser, so they reach other pages too. */
type Clip = { kind: 'block'; block: Block } | { kind: 'el'; el: El };
const CLIPBOARD = 'nova-clipboard';
const DESIGN_CLIPBOARD = 'nova-design-clipboard';
function writeClip(c: Clip) {
  try {
    localStorage.setItem(CLIPBOARD, JSON.stringify(c));
  } catch {
    /* storage unavailable */
  }
}
function readClip(): Clip | null {
  try {
    const c = JSON.parse(localStorage.getItem(CLIPBOARD) ?? 'null');
    return c && (c.kind === 'block' ? typeof c.block?.type === 'string' && BLOCK_MAP[c.block.type] : c.kind === 'el' && typeof c.el?.kind === 'string') ? c : null;
  } catch {
    return null;
  }
}

/** The theme's colours as the canvas page really uses them. */
function readTokenColors(frame: HTMLIFrameElement | null): Record<string, string> {
  const win = frame?.contentWindow;
  if (!win) return {};
  const cs = win.getComputedStyle(win.document.documentElement);
  return Object.fromEntries(COLOR_TOKENS.map((k) => [k, cs.getPropertyValue(`--${k}`).trim()]).filter(([, v]) => v));
}

/** Background image URLs for the live preview (the server renders the same ones). */
const mediaUrlCache = new Map<string, string>();
async function mediaUrls(ids: string[]): Promise<Map<string, string>> {
  await Promise.all(
    ids
      .filter((m) => !mediaUrlCache.has(m))
      .map((m) =>
        api
          .get<{ media: { id: string; version: number } }>(`/api/media/${m}`)
          .then((r) => mediaUrlCache.set(m, `/media/${r.media.id}/v${r.media.version}/1920.webp`))
          .catch(() => {}),
      ),
  );
  return mediaUrlCache;
}

type Panel = 'inspector' | 'seo' | 'history' | 'page' | 'structure' | 'header' | 'footer' | 'comments' | null;
type Device = 'desktop' | 'tablet' | 'mobile';
type Rect = { top: number; left: number; width: number; height: number };

const DEVICE_WIDTH: Record<Device, string> = { desktop: '100%', tablet: '834px', mobile: '390px' };
const panelTitle = (p: Exclude<Panel, null>): string =>
  ({
    inspector: t('Block'),
    seo: t('Suchmaschinen'),
    history: t('Verlauf'),
    page: t('Seite'),
    structure: t('Aufbau'),
    header: t('Kopfzeile & Menü'),
    footer: t('Fusszeile'),
    comments: t('Kommentare'),
  })[p];

/** One editor per language: switching language mounts a fresh one (own history, own canvas). */
export function Editor({ id, onOpenPalette }: { id: string; onOpenPalette: () => void }) {
  const lang = useEditLang();
  return <EditorFor key={lang ?? ''} id={id} lang={lang} onOpenPalette={onOpenPalette} />;
}

function EditorFor({ id, lang, onOpenPalette }: { id: string; lang: string | null; onOpenPalette: () => void }) {
  const doc = useEntryDoc(id, lang);
  const comments = useComments(id);
  // ?kommentar=… (from a notification) opens the thread.
  const focusComment = usePath().query.get('kommentar');
  const session = useSession();
  const toast = useToast();
  const narrow = useMediaQuery('(max-width: 900px)');
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [panel, setPanel] = useState<Panel>(focusComment ? 'comments' : null);
  const [device, setDevice] = useState<Device>('desktop');
  const [designState, setDesignState] = useState<DesignState>('normal');
  const [tokenColors, setTokenColors] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState<{ index: number; rect: Rect } | null>(null);
  // Free layout: the selected element inside the selected block, and where to insert a new one.
  const [selectedEl, setSelectedEl] = useState<string | null>(null);
  const [elRect, setElRect] = useState<Rect | null>(null);
  const [elPicker, setElPicker] = useState<Rect | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);
  const [help, setHelp] = useState(false);
  const ctxAt = useRef(0);
  const [canvasKey, setCanvasKey] = useState(0);
  const glide = useAnimationControls();
  const renderSeq = useRef<Record<string, number>>({});
  const blocksRef = useRef<Block[]>([]);
  blocksRef.current = doc.data?.blocks ?? [];
  const { data: sectionsData } = useApi<{ entries: { id: string; title: string }[] }>('/api/entries?collection=sections&limit=200');

  const studio = session.mode !== 'werkbank';
  const selectedBlock = doc.data?.blocks?.find((b) => b.id === selected) ?? null;
  const elsOf = (b: Block | null | undefined) => (b?.props.els as El[] | undefined) ?? [];
  const selectedElInfo = selectedBlock?.type === 'layout' && selectedEl ? findEl(elsOf(selectedBlock), selectedEl) : null;
  // Elements inside a CMS list take their content from that list's content type.
  const { data: collectionsData } = useApi<{ collections: CollectionDef[] }>('/api/collections');
  const collections = collectionsData?.collections ?? [];
  const listAncestor = selectedElInfo ? [...selectedElInfo.ancestors].reverse().find((a) => a.kind === 'list') : null;
  const listSource = listAncestor ? (collections.find((c) => c.id === listAncestor.props.collection) ?? null) : null;
  const backTo = doc.collection?.id === 'pages' || !doc.collection ? '/seiten' : `/inhalte/${doc.collection.id}`;

  /* ---------- rendering into the canvas ---------- */

  const renderBlock = useCallback(
    async (blockId: string) => {
      const seq = (renderSeq.current[blockId] ?? 0) + 1;
      renderSeq.current[blockId] = seq;
      const r = await api.post<{ html: string }>('/api/render', { entryId: id, lang: lang ?? undefined, data: { ...doc.data, blocks: blocksRef.current }, blockId });
      if (renderSeq.current[blockId] === seq) postToCanvas(frame.current, { t: 'replace', id: blockId, html: r.html });
    },
    [id, doc.data],
  );

  const renderAll = useCallback(
    async (changed: string[] = []) => {
      const r = await api.post<{ html: string }>('/api/render', { entryId: id, lang: lang ?? undefined, data: { ...doc.data, blocks: blocksRef.current } });
      postToCanvas(frame.current, { t: 'main', html: r.html, changed });
    },
    [id, doc.data],
  );

  // Inspector edits re-render the block shortly after typing stops.
  const pendingBlock = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleBlockRender = (blockId: string, then?: () => void) => {
    if (pendingBlock.current) clearTimeout(pendingBlock.current);
    pendingBlock.current = setTimeout(
      () =>
        void renderBlock(blockId)
          .then(then)
          .catch(() => {}),
      220,
    );
  };

  const numbered = session.bundle?.themes.find((th) => th.id === session.settings?.theme.id)?.numbered ?? false;
  const afterStructureChange = () => {
    // Themes with section numbers («01») need the whole page re-rendered.
    if (numbered) setTimeout(() => void renderAll().catch(() => {}), 350);
  };

  /* ---------- messages from the canvas ---------- */

  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== location.origin || !e.data?.nova || e.source !== frame.current?.contentWindow) return;
      const m = e.data;
      switch (m.t) {
        case 'ready':
          setReady(true);
          setTokenColors(readTokenColors(frame.current));
          postToCanvas(frame.current, { t: 'init', studio });
          postToCanvas(frame.current, { t: 'comments', counts: comments.counts, label: t('Kommentare') });
          if (selected) postToCanvas(frame.current, { t: 'select', id: selected });
          break;
        case 'select':
          setSelected(m.id);
          setRect(m.rect);
          setPicker(null);
          setSelectedEl(null);
          setElRect(null);
          if (panel === 'header' || panel === 'footer') setPanel(null);
          break;
        case 'deselect':
          setSelected(null);
          setRect(null);
          setSelectedEl(null);
          setElRect(null);
          if (panel === 'inspector') setPanel(null);
          break;
        case 'rect':
          if (m.id === selected) setRect(m.rect);
          // Scrolling the page moves things away from the menu: it closes.
          if (ctx && Date.now() - ctxAt.current > 300) setCtx(null);
          break;
        case 'select-el':
          if (m.block) setSelected(m.block);
          if (m.blockRect) setRect(m.blockRect);
          setSelectedEl(m.el ?? null);
          setElRect(m.rect ?? null);
          setPicker(null);
          setElPicker(null);
          break;
        case 'el-rect':
          if (m.el === selectedEl) setElRect(m.rect);
          break;
        case 'context':
          setPicker(null);
          setElPicker(null);
          setCtx({ x: m.x, y: m.y });
          ctxAt.current = Date.now();
          break;
        case 'el-move':
          changeEls(m.block, (els) => moveEl(els, m.el, m.parent ?? null, m.index), m.el);
          break;
        case 'edit':
          lastLocal.current[m.id] = Date.now();
          doc.setData((d) => updateBlock(d, m.id, (b) => ({ ...b, props: setIn(b.props, m.path, m.value) })));
          break;
        case 'insert-at':
          setPicker({ index: m.index, rect: m.rect });
          break;
        case 'moved': {
          doc.setData((d) => {
            const list = [...(d.blocks ?? [])];
            const from = list.findIndex((b) => b.id === m.id);
            const [b] = list.splice(from, 1);
            list.splice(m.to, 0, b);
            return { ...d, blocks: list };
          });
          afterStructureChange();
          break;
        }
        case 'global':
          setSelected(null);
          setPanel(m.which);
          break;
        case 'section':
          navigate(`/inhalte/sections/${m.id}`);
          break;
        case 'comments-open':
          selectBlock(m.id);
          setPanel('comments');
          break;
        case 'key':
          if (m.key === 'undo') doc.undo();
          else if (m.key === 'redo') doc.redo();
          else if (m.key === 'palette') onOpenPalette();
          else if (m.key === 'save') void doc.saveNow();
          else if (m.key === 'mode') void session.setMode(session.mode === 'studio' ? 'werkbank' : 'studio');
          else if (['duplicate', 'copy', 'paste', 'copy-style', 'paste-style', 'move-up', 'move-down', 'help'].includes(m.key)) runAction(m.key as EditorAction);
          else if (m.key === 'delete' && selectedEl && selected) removeElement(selected, selectedEl);
          else if (m.key === 'delete' && selected) void removeBlock(selected);
          break;
      }
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  });

  // Open threads show as bubbles on their blocks.
  useEffect(() => {
    if (ready) postToCanvas(frame.current, { t: 'comments', counts: comments.counts, label: t('Kommentare') });
  }, [comments.counts, ready]);

  // Mode switch changes what's editable on the canvas.
  useEffect(() => {
    if (ready) postToCanvas(frame.current, { t: 'init', studio });
  }, [studio, ready]);

  // Changes from others: only their blocks re-render; the block I'm typing in waits until I pause.
  const lastLocal = useRef<Record<string, number>>({});
  const waiting = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!doc.remote.seq || !ready) return;
    if (doc.remote.structure) {
      void renderAll(doc.remote.changed).catch(() => {});
      return;
    }
    const later: string[] = [];
    for (const bid of doc.remote.changed) {
      if (Date.now() - (lastLocal.current[bid] ?? 0) < 1500) later.push(bid);
      else void renderBlock(bid).catch(() => {});
    }
    if (later.length) {
      if (waiting.current) clearTimeout(waiting.current);
      waiting.current = setTimeout(() => later.forEach((bid) => void renderBlock(bid).catch(() => {})), 1600);
    }
  }, [doc.remote.seq]);

  // Others see which block I'm on; I see theirs outlined in their colour.
  useEffect(() => doc.setPresence(selected), [selected, doc.link]);
  useEffect(() => {
    if (ready) postToCanvas(frame.current, { t: 'presence', peers: doc.peers.map((p) => ({ name: p.name, color: p.color, block: p.block })) });
  }, [doc.peers, ready]);

  // Undo/redo replace data wholesale: re-render and show what changed.
  const prevBlocks = useRef<Block[]>([]);
  useEffect(() => {
    if (!doc.externalChange) return;
    const changed = changedBlockIds(prevBlocks.current, blocksRef.current);
    // Offline the server can't render: at least the texts on the canvas follow the local copy.
    void renderAll(changed).catch(() => postToCanvas(frame.current, { t: 'patch-fields', blocks: blocksRef.current.map((b) => ({ id: b.id, props: b.props })) }));
  }, [doc.externalChange]);
  useEffect(() => {
    prevBlocks.current = doc.data?.blocks ?? [];
  });

  /* ---------- block operations ---------- */

  const changeBlock = (b: Block) => {
    const before = blocksRef.current.find((x) => x.id === b.id);
    doc.setData((d) => updateBlock(d, b.id, () => b));
    // Design shows on the canvas right away; the server's render confirms it a moment later.
    const look = (x: Block | undefined) => JSON.stringify([x?.style?.design, x?.style?.motion, x?.type === 'layout' ? x.props.els : null]);
    if (look(before) !== look(b)) {
      const els = b.type === 'layout' ? elsOf(b) : [];
      void mediaUrls([...designImages(b.style?.design), ...elementImages(els)]).then((urls) => {
        const opts = { image: (m: string) => urls.get(m) ?? null, forceHover: 'nova-hover' };
        postToCanvas(frame.current, { t: 'design', id: b.id, css: blockCss(`#${blockDomId(b)}`, b.style, opts) + elementsCss(els, opts) });
      });
    }
    // A new entrance plays as soon as the block is back from the server.
    const motionChanged = JSON.stringify(before?.style?.motion) !== JSON.stringify(b.style?.motion);
    scheduleBlockRender(b.id, motionChanged && b.style?.motion?.enter ? () => postToCanvas(frame.current, { t: 'motion-play', id: b.id }) : undefined);
  };

  // While the hover look is being designed, the canvas shows it on the selected block.
  useEffect(() => {
    if (ready) postToCanvas(frame.current, { t: 'hover-state', id: designState === 'hover' && panel === 'inspector' ? selected : null });
  }, [designState, panel, selected, ready]);

  const insertBlock = async (type: string, index: number, props?: Record<string, unknown>) => {
    const block = createBlock(type, props);
    setPicker(null);
    doc.setData((d) => {
      const list = [...(d.blocks ?? [])];
      list.splice(index, 0, block);
      return { ...d, blocks: list };
    });
    blocksRef.current = [...blocksRef.current.slice(0, index), block, ...blocksRef.current.slice(index)];
    try {
      const r = await api.post<{ html: string }>('/api/render', { entryId: id, lang: lang ?? undefined, data: { ...doc.data, blocks: blocksRef.current }, blockId: block.id });
      postToCanvas(frame.current, { t: 'insert', index, html: r.html, id: block.id });
      setSelected(block.id);
      // Blocks that need a choice first (image, form …) open their settings right away.
      if (BLOCK_MAP[type].fields.some((f) => f.required && ['image', 'form', 'relation'].includes(f.type))) setPanel('inspector');
      afterStructureChange();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };

  const removeBlock = async (blockId: string) => {
    const b = blocksRef.current.find((x) => x.id === blockId);
    if (!b) return;
    if (studio && b.lock && b.lock !== 'none') return toast(t('Dieser Block ist geschützt und lässt sich im Studio nicht entfernen.'));
    doc.setData((d) => ({ ...d, blocks: (d.blocks ?? []).filter((x) => x.id !== blockId) }));
    postToCanvas(frame.current, { t: 'remove', id: blockId });
    setSelected(null);
    setRect(null);
    if (panel === 'inspector') setPanel(null);
    toast(t('«{name}» entfernt.', { name: tl(BLOCK_MAP[b.type]?.label) }), { action: { label: t('Rückgängig'), run: () => doc.undo() } });
    afterStructureChange();
  };

  const duplicateBlock = async (blockId: string) => {
    const index = blocksRef.current.findIndex((x) => x.id === blockId);
    const b = blocksRef.current[index];
    if (b) await insertBlockCopy(b, index + 1);
  };

  /** A copy of a block at `index` – from duplicating or from the clipboard, also of another page. */
  const insertBlockCopy = async (b: Block, at: number) => {
    const index = at - 1;
    const copy: Block = { ...structuredClone(b), id: shortId(8), lock: 'none' };
    if (copy.type === 'layout') copy.props = { ...copy.props, els: elsOf(copy).map(cloneEl) };
    doc.setData((d) => {
      const list = [...(d.blocks ?? [])];
      list.splice(index + 1, 0, copy);
      return { ...d, blocks: list };
    });
    blocksRef.current = [...blocksRef.current.slice(0, index + 1), copy, ...blocksRef.current.slice(index + 1)];
    const r = await api.post<{ html: string }>('/api/render', { entryId: id, lang: lang ?? undefined, data: { ...doc.data, blocks: blocksRef.current }, blockId: copy.id });
    postToCanvas(frame.current, { t: 'insert', index: index + 1, html: r.html, id: copy.id });
    setSelected(copy.id);
    setSelectedEl(null);
    afterStructureChange();
  };

  const moveBlock = (blockId: string, dir: -1 | 1) => {
    const list = [...blocksRef.current];
    const from = list.findIndex((x) => x.id === blockId);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= list.length) return;
    const [b] = list.splice(from, 1);
    list.splice(to, 0, b);
    doc.setData((d) => ({ ...d, blocks: list }));
    postToCanvas(frame.current, { t: 'move', id: blockId, to });
    afterStructureChange();
  };

  const reorderAll = (next: Block[]) => {
    doc.setData((d) => ({ ...d, blocks: next }));
    blocksRef.current = next;
    void renderAll().catch(() => {});
  };

  /* ---------- elements of the free layout ---------- */

  /** Changes a layout block's element tree, re-renders it and selects `select` (if given). */
  const changeEls = (blockId: string, fn: (els: El[]) => El[], select?: string | null) => {
    const b = blocksRef.current.find((x) => x.id === blockId);
    if (!b) return;
    const next: Block = { ...b, props: { ...b.props, els: fn(elsOf(b)) } };
    doc.setData((d) => updateBlock(d, blockId, () => next));
    blocksRef.current = blocksRef.current.map((x) => (x.id === blockId ? next : x));
    void renderBlock(blockId)
      .then(() => {
        if (select === undefined) return;
        setSelectedEl(select);
        postToCanvas(frame.current, { t: 'select-el', block: blockId, el: select, scroll: false });
      })
      .catch(() => {});
  };

  const selectElement = (elId: string | null) => {
    setSelectedEl(elId);
    setElPicker(null);
    postToCanvas(frame.current, { t: 'select-el', block: selected, el: elId, scroll: true });
  };

  /** New element: into the selected container, after the selected element, or at the end. */
  const insertElement = (kind: ElKind) => {
    placeElement(createEl(kind));
    if (EL_DEFS[kind].fields.some((f) => ['image', 'url', 'icon'].includes(f.type))) setPanel('inspector');
  };

  /** Puts an element where the selection says; outside a free layout it brings its own. */
  const placeElement = (el: El, after = false) => {
    if (!selectedBlock || selectedBlock.type !== 'layout') {
      const index = selectedBlock ? blocksRef.current.findIndex((b) => b.id === selectedBlock.id) + 1 : blocksRef.current.length;
      void insertBlock('layout', index, { els: [el] });
      return;
    }
    const info = selectedElInfo;
    changeEls(
      selectedBlock.id,
      (els) =>
        !info
          ? insertEl(els, null, els.length, el)
          : info.el.kind === 'list' && info.el.children?.[0] && !after
            ? insertEl(els, info.el.children[0].id, info.el.children[0].children?.length ?? 0, el)
            : (info.el.kind === 'box' || ITEM_CONTAINERS.includes(info.el.kind)) && !after
              ? insertEl(els, info.el.id, info.el.children?.length ?? 0, el)
              : insertEl(els, info.parent?.id ?? null, info.index + 1, el),
      el.id,
    );
    setElPicker(null);
  };

  /* ---------- clipboard and shortcuts ---------- */

  const copySelection = () => {
    const clip: Clip | null = selectedElInfo ? { kind: 'el', el: selectedElInfo.el } : selectedBlock ? { kind: 'block', block: selectedBlock } : null;
    if (!clip) return;
    writeClip(clip);
    toast(
      t('«{name}» kopiert – mit {keys} einfügen, auch auf einer anderen Seite.', {
        name: clip.kind === 'el' ? elLabel(clip.el) : tl(BLOCK_MAP[clip.block.type]?.label),
        keys: KEYS.paste,
      }),
    );
  };

  const pasteClipboard = () => {
    const clip = readClip();
    if (!clip) return toast(t('Nichts zum Einfügen. Kopiere zuerst einen Block oder ein Element.'));
    if (clip.kind === 'block') {
      const index = selectedBlock ? blocksRef.current.findIndex((b) => b.id === selectedBlock.id) + 1 : blocksRef.current.length;
      void insertBlockCopy(clip.block, index);
    } else placeElement(cloneEl(clip.el), clip.el.id === selectedElInfo?.el.id);
  };

  /** Design of the selection – shares the clipboard with «Design kopieren» in the panel. */
  const copyStyle = () => {
    const design = selectedElInfo ? selectedElInfo.el.design : selectedBlock?.style?.design;
    if (!selectedBlock) return;
    try {
      localStorage.setItem(DESIGN_CLIPBOARD, JSON.stringify(design ?? {}));
      toast(t('Design kopiert.'));
    } catch {
      /* storage unavailable */
    }
  };
  const pasteStyle = () => {
    if (!selectedBlock) return;
    let design: Design | null = null;
    try {
      design = JSON.parse(localStorage.getItem(DESIGN_CLIPBOARD) ?? 'null');
    } catch {
      /* nothing stored */
    }
    if (!design) return toast(t('Kein Design kopiert.'));
    if (selectedElInfo) changeElement(selectedBlock.id, { ...selectedElInfo.el, design });
    else changeBlock({ ...selectedBlock, style: { ...(selectedBlock.style ?? {}), design } });
    toast(t('Design eingefügt.'));
  };

  const runAction = (a: EditorAction) => {
    if (a === 'help') return setHelp(true);
    if (a === 'paste') return pasteClipboard();
    if (!selectedBlock) return;
    if (a === 'copy') copySelection();
    else if (a === 'copy-style') copyStyle();
    else if (a === 'paste-style') pasteStyle();
    else if (a === 'duplicate') selectedElInfo ? duplicateElement(selectedBlock.id, selectedElInfo.el.id) : void duplicateBlock(selectedBlock.id);
    else if (a === 'move-up' || a === 'move-down') {
      const dir = a === 'move-up' ? -1 : 1;
      if (selectedElInfo) moveElementBy(selectedBlock.id, selectedElInfo.el.id, dir);
      else moveBlock(selectedBlock.id, dir);
    }
  };

  // The same shortcuts in the admin around the canvas (the canvas sends its own).
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable], [role="dialog"]')) return;
      const a = shortcutAction(e, isMac);
      if (!a) return;
      e.preventDefault();
      runAction(a);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  const contextItems = (): (CtxItem | 'sep')[] => {
    if (!selectedBlock) return [];
    const el = selectedElInfo;
    const locked = studio && (selectedBlock.lock ?? 'none') !== 'none';
    return [
      { label: t('Bearbeiten'), icon: 'settings', run: () => setPanel('inspector') },
      'sep',
      { label: t('Duplizieren'), icon: 'copy', keys: KEYS.duplicate, run: () => runAction('duplicate'), disabled: locked },
      { label: t('Kopieren'), icon: 'copy', keys: KEYS.copy, run: copySelection },
      { label: t('Einfügen'), icon: 'download', keys: KEYS.paste, run: pasteClipboard },
      'sep',
      { label: t('Design kopieren'), icon: 'style', keys: KEYS.copyStyle, run: copyStyle },
      { label: t('Design einfügen'), icon: 'style', keys: KEYS.pasteStyle, run: pasteStyle, disabled: locked },
      ...(el ? [{ label: t('In Container packen'), icon: 'box', run: () => wrapElement(selectedBlock.id, el.el.id), disabled: locked }] : []),
      'sep',
      { label: el ? t('Nach vorne') : t('Nach oben'), icon: 'arrowUp', keys: KEYS.up, run: () => runAction('move-up'), disabled: locked },
      { label: el ? t('Nach hinten') : t('Nach unten'), icon: 'arrowDown', keys: KEYS.down, run: () => runAction('move-down'), disabled: locked },
      'sep',
      {
        label: t('Entfernen'),
        icon: 'trash',
        keys: KEYS.remove,
        danger: true,
        disabled: locked,
        run: () => (el ? removeElement(selectedBlock.id, el.el.id) : void removeBlock(selectedBlock.id)),
      },
    ];
  };

  /** One more question, tab, slide or marquee entry – like the last one. */
  const addItem = (blockId: string, elId: string) => {
    const b = blocksRef.current.find((x) => x.id === blockId);
    const info = b && findEl(elsOf(b), elId);
    if (!info) return;
    const item = newItem(info.el);
    changeEls(blockId, (els) => insertEl(els, elId, info.el.children?.length ?? 0, item), item.id);
  };

  const duplicateElement = (blockId: string, elId: string) => {
    const b = blocksRef.current.find((x) => x.id === blockId);
    const info = b && findEl(elsOf(b), elId);
    if (!info) return;
    const copy = cloneEl(info.el);
    changeEls(blockId, (els) => insertEl(els, info.parent?.id ?? null, info.index + 1, copy), copy.id);
  };

  const removeElement = (blockId: string, elId: string) => {
    const b = blocksRef.current.find((x) => x.id === blockId);
    const info = b && findEl(elsOf(b), elId);
    if (!info) return;
    if (studio && b.lock && b.lock !== 'none') return toast(t('Dieser Block ist geschützt und lässt sich im Studio nicht ändern.'));
    changeEls(blockId, (els) => removeEl(els, elId), info.parent?.id ?? null);
    toast(t('«{name}» entfernt.', { name: elLabel(info.el) }), { action: { label: t('Rückgängig'), run: () => doc.undo() } });
  };

  const moveElementBy = (blockId: string, elId: string, dir: -1 | 1) => {
    const b = blocksRef.current.find((x) => x.id === blockId);
    const info = b && findEl(elsOf(b), elId);
    if (!info) return;
    changeEls(blockId, (els) => moveEl(els, elId, info.parent?.id ?? null, dir > 0 ? info.index + 2 : info.index - 1), elId);
  };

  /** Puts the element into a new container at the same place – the start of a row or a card. */
  const wrapElement = (blockId: string, elId: string) => {
    const b = blocksRef.current.find((x) => x.id === blockId);
    const info = b && findEl(elsOf(b), elId);
    if (!info) return;
    const wrapper = createEl('box', {}, { children: [info.el] });
    changeEls(blockId, (els) => insertEl(removeEl(els, elId), info.parent?.id ?? null, info.index, wrapper), wrapper.id);
  };

  const changeElement = (blockId: string, el: El) => {
    const b = blocksRef.current.find((x) => x.id === blockId);
    if (!b) return;
    changeBlock({ ...b, props: { ...b.props, els: updateEl(elsOf(b), el.id, () => el) } });
  };

  const selectBlock = (blockId: string, scroll = true) => {
    setSelected(blockId);
    setSelectedEl(null);
    postToCanvas(frame.current, { t: 'select', id: blockId, scroll });
  };

  const onSeoTarget = (c: SeoCheck) => {
    if (c.target?.blockId) {
      selectBlock(c.target.blockId);
      postToCanvas(frame.current, { t: 'focus-field', id: c.target.blockId, field: c.target.field });
    } else if (c.target?.panel === 'fields') setPanel('page');
    else if (c.target?.field === 'slug') setPanel('page');
    else if (c.target?.panel === 'seo') {
      const el = document.getElementById(c.target.field === 'title' ? 'seo-title' : c.target.field === 'description' ? 'seo-desc' : 'seo-kw');
      el?.focus();
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  };

  /* ---------- keyboard ---------- */

  useHotkey('mod+z', (e) => {
    if ((e.target as HTMLElement).closest('input, textarea, [contenteditable]')) return;
    e.preventDefault();
    doc.undo();
  });
  useHotkey('mod+shift+z', (e) => {
    if ((e.target as HTMLElement).closest('input, textarea, [contenteditable]')) return;
    e.preventDefault();
    doc.redo();
  });
  useHotkey('mod+s', (e) => {
    e.preventDefault();
    void doc.saveNow();
  });

  /* ---------- first-time hint ---------- */

  const [hint, setHint] = useState(false);
  useEffect(() => {
    if (!session.user.seen_hints.includes('editor-first')) setHint(true);
  }, [session.user.seen_hints]);
  const dismissHint = () => {
    setHint(false);
    session.updateUser({ seen_hints: [...session.user.seen_hints, 'editor-first'] });
    void api.patch('/api/me', { seenHint: 'editor-first' });
  };
  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(dismissHint, 9000);
    return () => clearTimeout(timer);
  });

  /* ---------- toolbar position ---------- */

  const toolbarPos = useMemo(() => {
    if (!rect) return null;
    const top = rect.top > 52 ? rect.top - 44 : Math.max(6, rect.top + 8);
    return { top, left: Math.max(8, rect.left + 8) };
  }, [rect]);

  if (doc.error && !doc.entry)
    return (
      <div className="editor">
        <div className="page">{doc.error}</div>
      </div>
    );

  const lock = selectedBlock && studio ? (selectedBlock.lock ?? 'none') : 'none';
  const index = selectedBlock ? blocksRef.current.findIndex((b) => b.id === selectedBlock.id) : -1;

  return (
    <div className="editor">
      <header className="editor-bar">
        <Tip label={t('Zurück')}>
          <button className="btn ghost icon-only" onClick={() => navigate(backTo)} aria-label={t('Zurück')}>
            <Icon name="arrowLeft" />
          </button>
        </Tip>
        <div className="editor-title grow">
          <strong className="ellipsis">{doc.data?.title || '…'}</strong>
          <span className="ellipsis mono">{doc.path ?? ''}</span>
        </div>
        <Presence peers={doc.peers} link={doc.link} local={doc.local} />
        <SaveStatus
          state={doc.saveState}
          error={doc.error}
          onRetry={() => (doc.saveState === 'conflict' ? void doc.reload().then(() => setCanvasKey((k) => k + 1)) : void doc.saveNow())}
        />
        <div className="row hide-m" style={{ gap: 2 }}>
          <Tip label={t('Rückgängig')} keys={`${modKey} Z`}>
            <button className="btn ghost icon-only" onClick={doc.undo} disabled={!doc.canUndo} aria-label={t('Rückgängig')}>
              <Icon name="undo" />
            </button>
          </Tip>
          <Tip label={t('Wiederholen')} keys={`${modKey} ⇧ Z`}>
            <button className="btn ghost icon-only" onClick={doc.redo} disabled={!doc.canRedo} aria-label={t('Wiederholen')}>
              <Icon name="redo" />
            </button>
          </Tip>
        </div>
        <div className="hide-m">
          <Segmented
            label={t('Vorschau-Grösse')}
            value={device}
            onChange={setDevice}
            options={[
              { value: 'desktop', label: '', icon: 'desktop', title: t('Computer') },
              { value: 'tablet', label: '', icon: 'tablet', title: t('Tablet') },
              { value: 'mobile', label: '', icon: 'phone', title: t('Handy') },
            ]}
          />
        </div>
        <div className="row editor-tools" style={{ gap: 2 }}>
          <Tip label={t('Kommentare')}>
            <button
              className="btn ghost icon-only badge-host"
              aria-pressed={panel === 'comments'}
              onClick={() => setPanel(panel === 'comments' ? null : 'comments')}
              aria-label={comments.open ? t('Kommentare, {n} offen', { n: comments.open }) : t('Kommentare')}
            >
              <Icon name="chat" />
              {comments.open > 0 && <span className="dot-count">{comments.open}</span>}
            </button>
          </Tip>
          {(
            [
              ['page', 'page', t('Seite')],
              ['structure', 'layers', t('Aufbau')],
              ['seo', 'seo', t('Suchmaschinen')],
              ['history', 'history', t('Verlauf')],
            ] as [Panel, string, string][]
          )
            .filter(([p]) => !(lang && p === 'history'))
            .map(([p, icon, label]) => (
              <Tip key={p} label={label}>
                <button className="btn ghost icon-only" aria-pressed={panel === p} onClick={() => setPanel(panel === p ? null : p)} aria-label={label}>
                  <Icon name={icon} />
                </button>
              </Tip>
            ))}
        </div>
        <Tip label={t('Tastenkürzel')} keys="?">
          <button className="btn ghost icon-only hide-m" onClick={() => setHelp(true)} aria-label={t('Tastenkürzel')}>
            <Icon name="keyboard" />
          </button>
        </Tip>
        <ShortcutsDialog open={help} onClose={() => setHelp(false)} />
        <span className="hide-m">
          <ModeSwitch />
        </span>
        <LangSwitch doc={doc} />
        <PublishControls doc={doc} onPublished={() => void glide.start({ scale: [0.985, 1], y: [6, 0], transition: { duration: 0.6, ease: [0.2, 0.7, 0.2, 1] } })} />
      </header>

      {lang && (
        <div className="editor-note">
          <TranslationNote doc={doc} action={<AiTranslate doc={doc} />} />
        </div>
      )}
      <div className="editor-stage">
        <div className="canvas-wrap" style={{ padding: device === 'desktop' ? 0 : '1rem 0' }}>
          <motion.div
            className="canvas-frame"
            animate={glide}
            style={{ width: DEVICE_WIDTH[device], position: 'relative', transition: 'width .32s cubic-bezier(.2,.7,.2,1)', maxWidth: '100%' }}
          >
            <LoadingFrame key={canvasKey} frameRef={frame} title={t('Seite bearbeiten')} src={`/_nova/canvas/${id}${lang ? `?lang=${lang}` : ''}`} label={t('Seite lädt …')} />
            <div className="canvas-overlay">
              <AnimatePresence>
                {selectedBlock && selectedElInfo && elRect && !picker && (
                  <ElementToolbar
                    key={`el-${selectedElInfo.el.id}`}
                    found={selectedElInfo}
                    top={elRect.top > 52 ? elRect.top - 44 : Math.max(6, elRect.top + 8)}
                    left={Math.max(8, elRect.left)}
                    locked={studio && (selectedBlock.lock ?? 'none') !== 'none'}
                    onSelect={selectElement}
                    onSelectBlock={() => selectElement(null)}
                    onEdit={() => setPanel('inspector')}
                    onMove={(dir) => moveElementBy(selectedBlock.id, selectedElInfo.el.id, dir)}
                    onInsert={(r) =>
                      setElPicker({
                        top: r.top - (frame.current?.getBoundingClientRect().top ?? 0),
                        left: r.left - (frame.current?.getBoundingClientRect().left ?? 0),
                        width: r.width,
                        height: r.height,
                      })
                    }
                    onAddItem={() => addItem(selectedBlock.id, selectedElInfo.el.id)}
                    onDuplicate={() => duplicateElement(selectedBlock.id, selectedElInfo.el.id)}
                    onWrap={() => wrapElement(selectedBlock.id, selectedElInfo.el.id)}
                    onRemove={() => removeElement(selectedBlock.id, selectedElInfo.el.id)}
                  />
                )}
                {selectedBlock && !selectedElInfo && toolbarPos && !picker && (
                  <motion.div
                    key={selectedBlock.id}
                    className="block-toolbar"
                    initial={{ opacity: 0, y: 4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1, top: toolbarPos.top, left: toolbarPos.left }}
                    exit={{ opacity: 0, transition: { duration: 0.08 } }}
                    transition={{ type: 'spring', stiffness: 700, damping: 45 }}
                    style={{ top: toolbarPos.top, left: toolbarPos.left }}
                    role="toolbar"
                    aria-label={t('{name} bearbeiten', { name: tl(BLOCK_MAP[selectedBlock.type]?.label) })}
                  >
                    <span className="name">
                      {lock !== 'none' && <Icon name="lock" size="s" style={{ marginRight: 4, verticalAlign: '-3px' }} />}
                      {tl(BLOCK_MAP[selectedBlock.type]?.label)}
                    </span>
                    <span className="sep" />
                    {lock !== 'all' && (
                      <button className="btn" onClick={() => setPanel('inspector')}>
                        <Icon name="settings" size="s" /> {t('Bearbeiten')}
                      </button>
                    )}
                    {lock === 'none' && (
                      <>
                        <Tip label={t('Nach oben')}>
                          <button className="btn icon-only" disabled={index <= 0} onClick={() => moveBlock(selectedBlock.id, -1)} aria-label={t('Nach oben')}>
                            <Icon name="arrowUp" size="s" />
                          </button>
                        </Tip>
                        <Tip label={t('Nach unten')}>
                          <button
                            className="btn icon-only"
                            disabled={index >= blocksRef.current.length - 1}
                            onClick={() => moveBlock(selectedBlock.id, 1)}
                            aria-label={t('Nach unten')}
                          >
                            <Icon name="arrowDown" size="s" />
                          </button>
                        </Tip>
                        {selectedBlock.type === 'layout' && (
                          <Tip label={t('Element einfügen')}>
                            <button
                              className="btn icon-only"
                              onClick={(e) => {
                                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                const f = frame.current?.getBoundingClientRect();
                                setElPicker({ top: r.top - (f?.top ?? 0), left: r.left - (f?.left ?? 0), width: r.width, height: r.height });
                              }}
                              aria-label={t('Element einfügen')}
                            >
                              <Icon name="box" size="s" />
                            </button>
                          </Tip>
                        )}
                        <Tip label={t('Block darunter einfügen')}>
                          <button
                            className="btn icon-only"
                            onClick={() => setPicker({ index: index + 1, rect: { top: toolbarPos.top, left: toolbarPos.left, width: 1, height: 36 } })}
                            aria-label={t('Block darunter einfügen')}
                          >
                            <Icon name="plus" size="s" />
                          </button>
                        </Tip>
                        <Tip label={t('Kommentieren')}>
                          <button className="btn icon-only" onClick={() => setPanel('comments')} aria-label={t('Kommentieren')}>
                            <Icon name="chat" size="s" />
                          </button>
                        </Tip>
                        <Tip label={t('Duplizieren')}>
                          <button className="btn icon-only" onClick={() => void duplicateBlock(selectedBlock.id)} aria-label={t('Duplizieren')}>
                            <Icon name="copy" size="s" />
                          </button>
                        </Tip>
                        <Tip label={t('Entfernen')}>
                          <button className="btn icon-only" onClick={() => void removeBlock(selectedBlock.id)} aria-label={t('Entfernen')}>
                            <Icon name="trash" size="s" />
                          </button>
                        </Tip>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
              {ctx && selectedBlock && <ContextMenu x={ctx.x} y={ctx.y} items={contextItems()} onClose={() => setCtx(null)} />}
              <RPopover.Root open={Boolean(elPicker)} onOpenChange={(o) => !o && setElPicker(null)}>
                <RPopover.Anchor asChild>
                  <span style={{ position: 'absolute', top: elPicker?.top ?? 0, left: elPicker?.left ?? 0, width: elPicker?.width ?? 0, height: elPicker?.height ?? 0 }} />
                </RPopover.Anchor>
                <RPopover.Portal>
                  <RPopover.Content className="popover pop-anim" style={{ padding: 0 }} sideOffset={8} collisionPadding={12}>
                    <ElementPicker
                      onPick={insertElement}
                      into={selectedElInfo && isContainer(selectedElInfo.el.kind) && selectedElInfo.el.kind !== 'list' ? elLabel(selectedElInfo.el) : null}
                    />
                  </RPopover.Content>
                </RPopover.Portal>
              </RPopover.Root>
              <RPopover.Root open={Boolean(picker)} onOpenChange={(o) => !o && setPicker(null)}>
                <RPopover.Anchor asChild>
                  <span
                    style={{ position: 'absolute', top: picker?.rect.top ?? 0, left: picker?.rect.left ?? 0, width: picker?.rect.width ?? 0, height: picker?.rect.height ?? 0 }}
                  />
                </RPopover.Anchor>
                <RPopover.Portal>
                  <RPopover.Content className="popover pop-anim" style={{ padding: 0 }} sideOffset={8} collisionPadding={12}>
                    {picker && (
                      <BlockPicker sections={(sectionsData?.entries ?? []).filter((s) => s.id !== id)} onPick={(type, props) => void insertBlock(type, picker.index, props)} />
                    )}
                  </RPopover.Content>
                </RPopover.Portal>
              </RPopover.Root>
              <AnimatePresence>
                {hint && ready && (
                  <motion.div
                    className="hint"
                    style={{
                      position: 'absolute',
                      left: '50%',
                      bottom: 20,
                      translateX: '-50%',
                      pointerEvents: 'auto',
                      boxShadow: 'var(--shadow-3)',
                      background: 'var(--panel)',
                      maxWidth: 'calc(100% - 2rem)',
                    }}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                  >
                    <svg className="hint-anim" viewBox="0 0 36 36" aria-hidden="true">
                      <rect x="4" y="12" width="28" height="12" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
                      <motion.rect
                        x="8"
                        y="16"
                        width="1.6"
                        height="4"
                        fill="currentColor"
                        animate={{ opacity: [1, 0, 1], x: [8, 8, 22] }}
                        transition={{ duration: 2.4, repeat: Infinity }}
                      />
                    </svg>
                    <span>{t('Klick in einen Text und schreib los. Mit «+» zwischen zwei Abschnitten fügst du neue hinzu.')}</span>
                    <button className="btn s ghost" onClick={dismissHint}>
                      {t('Verstanden')}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <AnimatePresence>
          {panel && doc.data && (
            <motion.aside
              className="side-panel"
              aria-label={panelTitle(panel)}
              initial={narrow ? { y: '100%' } : { x: 24, opacity: 0 }}
              animate={narrow ? { y: 0 } : { x: 0, opacity: 1 }}
              exit={narrow ? { y: '100%' } : { x: 24, opacity: 0, transition: { duration: 0.12 } }}
              transition={{ type: 'spring', stiffness: 520, damping: 44 }}
            >
              <header>
                <h2>
                  {panel === 'inspector' && selectedElInfo
                    ? elLabel(selectedElInfo.el)
                    : panel === 'inspector' && selectedBlock
                      ? tl(BLOCK_MAP[selectedBlock.type]?.label)
                      : panelTitle(panel)}
                </h2>
                <button className="btn ghost icon-only s" onClick={() => setPanel(null)} aria-label={t('Schliessen')}>
                  <Icon name="x" />
                </button>
              </header>
              <div className="side-body">
                {panel === 'inspector' && selectedBlock && selectedElInfo && (
                  <TokenColors.Provider value={tokenColors}>
                    <ElementInspector
                      key={selectedElInfo.el.id}
                      el={selectedElInfo.el}
                      onChange={(el) => changeElement(selectedBlock.id, el)}
                      device={device}
                      onDevice={setDevice}
                      designState={designState}
                      onDesignState={setDesignState}
                      onPlay={() => postToCanvas(frame.current, { t: 'motion-play-el', el: selectedElInfo.el.id })}
                      pro={session.pro}
                      collections={collections}
                      source={listSource}
                      onSelect={selectElement}
                      locked={studio && (selectedBlock.lock ?? 'none') !== 'none'}
                    />
                  </TokenColors.Provider>
                )}
                {panel === 'inspector' && selectedBlock && !selectedElInfo && (
                  <TokenColors.Provider value={tokenColors}>
                    <Inspector
                      key={selectedBlock.id}
                      block={selectedBlock}
                      onChange={changeBlock}
                      device={device}
                      onDevice={setDevice}
                      designState={designState}
                      onDesignState={setDesignState}
                      onPlay={() => postToCanvas(frame.current, { t: 'motion-play', id: selectedBlock.id })}
                    />
                  </TokenColors.Provider>
                )}
                {panel === 'inspector' && !selectedBlock && <p className="small muted">{t('Wähl auf der Seite einen Block aus.')}</p>}
                {panel === 'seo' && <SeoPanel doc={doc} onTarget={onSeoTarget} />}
                {panel === 'page' && <PagePanel doc={doc} />}
                {panel === 'history' && <HistoryPanel doc={doc} onRestored={() => void renderAll().catch(() => setCanvasKey((k) => k + 1))} />}
                {panel === 'structure' && (
                  <div className="stack">
                    <StructurePanel
                      blocks={doc.data.blocks ?? []}
                      selected={selected}
                      onSelect={(bid) => selectBlock(bid)}
                      onReorder={reorderAll}
                      layers={{
                        selectedEl,
                        onSelectEl: (bid, elId) => {
                          setSelected(bid);
                          setSelectedEl(elId);
                          postToCanvas(frame.current, { t: 'select-el', block: bid, el: elId, scroll: true });
                        },
                        onHoverEl: (elId) => postToCanvas(frame.current, { t: 'hover-el', el: elId }),
                        onMoveEl: (bid, elId, parent, index) => changeEls(bid, (els) => moveEl(els, elId, parent, index), elId),
                      }}
                    />
                    <button
                      className="btn"
                      style={{ justifySelf: 'start' }}
                      onClick={() => setPicker({ index: blocksRef.current.length, rect: { top: 80, left: 80, width: 1, height: 1 } })}
                    >
                      <Icon name="plus" size="s" /> {t('Block am Ende hinzufügen')}
                    </button>
                  </div>
                )}
                {(panel === 'header' || panel === 'footer') && <GlobalPanel which={panel} />}
                {panel === 'comments' && (
                  <CommentsPanel
                    entryId={id}
                    data={comments}
                    blocks={doc.data.blocks ?? []}
                    selectedBlock={selected}
                    focus={focusComment}
                    onSelectBlock={(bid) => selectBlock(bid)}
                  />
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

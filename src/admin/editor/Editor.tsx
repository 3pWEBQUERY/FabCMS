import { AnimatePresence, motion, useAnimationControls } from 'motion/react';
import * as RPopover from '@radix-ui/react-popover';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useEntryDoc } from '../lib/useEntryDoc';
import { useSession } from '../lib/session';
import { navigate } from '../lib/router';
import { useApi, useHotkey, modKey, useMediaQuery } from '../lib/hooks';
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
import type { Block } from '../../shared/types';

type Panel = 'inspector' | 'seo' | 'history' | 'page' | 'structure' | 'header' | 'footer' | null;
type Device = 'desktop' | 'tablet' | 'mobile';
type Rect = { top: number; left: number; width: number; height: number };

const DEVICE_WIDTH: Record<Device, string> = { desktop: '100%', tablet: '834px', mobile: '390px' };
const PANEL_TITLE: Record<Exclude<Panel, null>, string> = {
  inspector: 'Block',
  seo: 'Suchmaschinen',
  history: 'Verlauf',
  page: 'Seite',
  structure: 'Aufbau',
  header: 'Kopfzeile & Menü',
  footer: 'Fusszeile',
};

export function Editor({ id, onOpenPalette }: { id: string; onOpenPalette: () => void }) {
  const doc = useEntryDoc(id);
  const session = useSession();
  const toast = useToast();
  const narrow = useMediaQuery('(max-width: 900px)');
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [device, setDevice] = useState<Device>('desktop');
  const [picker, setPicker] = useState<{ index: number; rect: Rect } | null>(null);
  const [canvasKey, setCanvasKey] = useState(0);
  const glide = useAnimationControls();
  const renderSeq = useRef<Record<string, number>>({});
  const blocksRef = useRef<Block[]>([]);
  blocksRef.current = doc.data?.blocks ?? [];
  const { data: sectionsData } = useApi<{ entries: { id: string; title: string }[] }>('/api/entries?collection=sections&limit=200');

  const studio = session.mode !== 'werkbank';
  const selectedBlock = doc.data?.blocks?.find((b) => b.id === selected) ?? null;
  const backTo = doc.collection?.id === 'pages' || !doc.collection ? '/seiten' : `/inhalte/${doc.collection.id}`;

  /* ---------- rendering into the canvas ---------- */

  const renderBlock = useCallback(
    async (blockId: string) => {
      const seq = (renderSeq.current[blockId] ?? 0) + 1;
      renderSeq.current[blockId] = seq;
      const r = await api.post<{ html: string }>('/api/render', { entryId: id, data: { ...doc.data, blocks: blocksRef.current }, blockId });
      if (renderSeq.current[blockId] === seq) postToCanvas(frame.current, { t: 'replace', id: blockId, html: r.html });
    },
    [id, doc.data],
  );

  const renderAll = useCallback(
    async (changed: string[] = []) => {
      const r = await api.post<{ html: string }>('/api/render', { entryId: id, data: { ...doc.data, blocks: blocksRef.current } });
      postToCanvas(frame.current, { t: 'main', html: r.html, changed });
    },
    [id, doc.data],
  );

  // Inspector edits re-render the block shortly after typing stops.
  const pendingBlock = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleBlockRender = (blockId: string) => {
    if (pendingBlock.current) clearTimeout(pendingBlock.current);
    pendingBlock.current = setTimeout(() => void renderBlock(blockId).catch(() => {}), 220);
  };

  const numbered = session.bundle?.themes.find((t) => t.id === session.settings?.theme.id)?.numbered ?? false;
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
          postToCanvas(frame.current, { t: 'init', studio });
          if (selected) postToCanvas(frame.current, { t: 'select', id: selected });
          break;
        case 'select':
          setSelected(m.id);
          setRect(m.rect);
          setPicker(null);
          if (panel === 'header' || panel === 'footer') setPanel(null);
          break;
        case 'deselect':
          setSelected(null);
          setRect(null);
          if (panel === 'inspector') setPanel(null);
          break;
        case 'rect':
          if (m.id === selected) setRect(m.rect);
          break;
        case 'edit':
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
        case 'key':
          if (m.key === 'undo') doc.undo();
          else if (m.key === 'redo') doc.redo();
          else if (m.key === 'palette') onOpenPalette();
          else if (m.key === 'save') void doc.saveNow();
          else if (m.key === 'mode') void session.setMode(session.mode === 'studio' ? 'werkbank' : 'studio');
          else if (m.key === 'delete' && selected) void removeBlock(selected);
          break;
      }
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  });

  // Mode switch changes what's editable on the canvas.
  useEffect(() => {
    if (ready) postToCanvas(frame.current, { t: 'init', studio });
  }, [studio, ready]);

  // Undo/redo replace data wholesale: re-render and show what changed.
  const prevBlocks = useRef<Block[]>([]);
  useEffect(() => {
    if (!doc.externalChange) return;
    const changed = changedBlockIds(prevBlocks.current, blocksRef.current);
    void renderAll(changed).catch(() => {});
  }, [doc.externalChange]);
  useEffect(() => {
    prevBlocks.current = doc.data?.blocks ?? [];
  });

  /* ---------- block operations ---------- */

  const changeBlock = (b: Block) => {
    doc.setData((d) => updateBlock(d, b.id, () => b));
    scheduleBlockRender(b.id);
  };

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
      const r = await api.post<{ html: string }>('/api/render', { entryId: id, data: { ...doc.data, blocks: blocksRef.current }, blockId: block.id });
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
    if (studio && b.lock && b.lock !== 'none') return toast('Dieser Block ist geschützt und lässt sich im Studio nicht entfernen.');
    doc.setData((d) => ({ ...d, blocks: (d.blocks ?? []).filter((x) => x.id !== blockId) }));
    postToCanvas(frame.current, { t: 'remove', id: blockId });
    setSelected(null);
    setRect(null);
    if (panel === 'inspector') setPanel(null);
    toast(`«${BLOCK_MAP[b.type]?.label}» entfernt.`, { action: { label: 'Rückgängig', run: () => doc.undo() } });
    afterStructureChange();
  };

  const duplicateBlock = async (blockId: string) => {
    const index = blocksRef.current.findIndex((x) => x.id === blockId);
    const b = blocksRef.current[index];
    if (!b) return;
    const copy: Block = { ...structuredClone(b), id: shortId(8), lock: 'none' };
    doc.setData((d) => {
      const list = [...(d.blocks ?? [])];
      list.splice(index + 1, 0, copy);
      return { ...d, blocks: list };
    });
    blocksRef.current = [...blocksRef.current.slice(0, index + 1), copy, ...blocksRef.current.slice(index + 1)];
    const r = await api.post<{ html: string }>('/api/render', { entryId: id, data: { ...doc.data, blocks: blocksRef.current }, blockId: copy.id });
    postToCanvas(frame.current, { t: 'insert', index: index + 1, html: r.html, id: copy.id });
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

  const selectBlock = (blockId: string, scroll = true) => {
    setSelected(blockId);
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
    const t = setTimeout(dismissHint, 9000);
    return () => clearTimeout(t);
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

  const lock = selectedBlock && studio ? selectedBlock.lock ?? 'none' : 'none';
  const index = selectedBlock ? blocksRef.current.findIndex((b) => b.id === selectedBlock.id) : -1;

  return (
    <div className="editor">
      <header className="editor-bar">
        <Tip label="Zurück">
          <button className="btn ghost icon-only" onClick={() => navigate(backTo)} aria-label="Zurück">
            <Icon name="arrowLeft" />
          </button>
        </Tip>
        <div className="editor-title grow">
          <strong className="ellipsis">{doc.data?.title || '…'}</strong>
          <span className="ellipsis mono">{doc.path ?? ''}</span>
        </div>
        <SaveStatus state={doc.saveState} error={doc.error} onRetry={() => (doc.saveState === 'conflict' ? void doc.reload().then(() => setCanvasKey((k) => k + 1)) : void doc.saveNow())} />
        <div className="row hide-m" style={{ gap: 2 }}>
          <Tip label="Rückgängig" keys={`${modKey} Z`}>
            <button className="btn ghost icon-only" onClick={doc.undo} disabled={!doc.canUndo} aria-label="Rückgängig">
              <Icon name="undo" />
            </button>
          </Tip>
          <Tip label="Wiederholen" keys={`${modKey} ⇧ Z`}>
            <button className="btn ghost icon-only" onClick={doc.redo} disabled={!doc.canRedo} aria-label="Wiederholen">
              <Icon name="redo" />
            </button>
          </Tip>
        </div>
        <div className="hide-m">
          <Segmented
            label="Vorschau-Grösse"
            value={device}
            onChange={setDevice}
            options={[
              { value: 'desktop', label: '', icon: 'desktop', title: 'Computer' },
              { value: 'tablet', label: '', icon: 'tablet', title: 'Tablet' },
              { value: 'mobile', label: '', icon: 'phone', title: 'Handy' },
            ]}
          />
        </div>
        <div className="row" style={{ gap: 2 }}>
          {(
            [
              ['page', 'page', 'Seite'],
              ['structure', 'layers', 'Aufbau'],
              ['seo', 'seo', 'Suchmaschinen'],
              ['history', 'history', 'Verlauf'],
            ] as [Panel, string, string][]
          ).map(([p, icon, label]) => (
            <Tip key={p} label={label}>
              <button className="btn ghost icon-only" aria-pressed={panel === p} onClick={() => setPanel(panel === p ? null : p)} aria-label={label}>
                <Icon name={icon} />
              </button>
            </Tip>
          ))}
        </div>
        <span className="hide-m">
          <ModeSwitch />
        </span>
        <PublishControls
          doc={doc}
          onPublished={() =>
            void glide.start({ scale: [0.985, 1], y: [6, 0], transition: { duration: 0.6, ease: [0.2, 0.7, 0.2, 1] } })
          }
        />
      </header>

      <div className="editor-stage">
        <div className="canvas-wrap" style={{ padding: device === 'desktop' ? 0 : '1rem 0' }}>
          <motion.div className="canvas-frame" animate={glide} style={{ width: DEVICE_WIDTH[device], position: 'relative', transition: 'width .32s cubic-bezier(.2,.7,.2,1)', maxWidth: '100%' }}>
            <iframe key={canvasKey} ref={frame} title="Seite bearbeiten" src={`/_nova/canvas/${id}`} />
            <div className="canvas-overlay">
              <AnimatePresence>
                {selectedBlock && toolbarPos && !picker && (
                  <motion.div
                    key={selectedBlock.id}
                    className="block-toolbar"
                    initial={{ opacity: 0, y: 4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1, top: toolbarPos.top, left: toolbarPos.left }}
                    exit={{ opacity: 0, transition: { duration: 0.08 } }}
                    transition={{ type: 'spring', stiffness: 700, damping: 45 }}
                    style={{ top: toolbarPos.top, left: toolbarPos.left }}
                    role="toolbar"
                    aria-label={`${BLOCK_MAP[selectedBlock.type]?.label} bearbeiten`}
                  >
                    <span className="name">
                      {lock !== 'none' && <Icon name="lock" size="s" style={{ marginRight: 4, verticalAlign: '-3px' }} />}
                      {BLOCK_MAP[selectedBlock.type]?.label}
                    </span>
                    <span className="sep" />
                    {lock !== 'all' && (
                      <button className="btn" onClick={() => setPanel('inspector')}>
                        <Icon name="settings" size="s" /> Bearbeiten
                      </button>
                    )}
                    {lock === 'none' && (
                      <>
                        <Tip label="Nach oben">
                          <button className="btn icon-only" disabled={index <= 0} onClick={() => moveBlock(selectedBlock.id, -1)} aria-label="Nach oben">
                            <Icon name="arrowUp" size="s" />
                          </button>
                        </Tip>
                        <Tip label="Nach unten">
                          <button className="btn icon-only" disabled={index >= blocksRef.current.length - 1} onClick={() => moveBlock(selectedBlock.id, 1)} aria-label="Nach unten">
                            <Icon name="arrowDown" size="s" />
                          </button>
                        </Tip>
                        <Tip label="Duplizieren">
                          <button className="btn icon-only" onClick={() => void duplicateBlock(selectedBlock.id)} aria-label="Duplizieren">
                            <Icon name="copy" size="s" />
                          </button>
                        </Tip>
                        <Tip label="Entfernen">
                          <button className="btn icon-only" onClick={() => void removeBlock(selectedBlock.id)} aria-label="Entfernen">
                            <Icon name="trash" size="s" />
                          </button>
                        </Tip>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
              <RPopover.Root open={Boolean(picker)} onOpenChange={(o) => !o && setPicker(null)}>
                <RPopover.Anchor asChild>
                  <span style={{ position: 'absolute', top: picker?.rect.top ?? 0, left: picker?.rect.left ?? 0, width: picker?.rect.width ?? 0, height: picker?.rect.height ?? 0 }} />
                </RPopover.Anchor>
                <RPopover.Portal>
                  <RPopover.Content className="popover pop-anim" style={{ padding: 0 }} sideOffset={8} collisionPadding={12}>
                    {picker && <BlockPicker sections={(sectionsData?.entries ?? []).filter((s) => s.id !== id)} onPick={(type, props) => void insertBlock(type, picker.index, props)} />}
                  </RPopover.Content>
                </RPopover.Portal>
              </RPopover.Root>
              <AnimatePresence>
                {hint && ready && (
                  <motion.div
                    className="hint"
                    style={{ position: 'absolute', left: '50%', bottom: 20, translateX: '-50%', pointerEvents: 'auto', boxShadow: 'var(--shadow-3)', background: 'var(--panel)', maxWidth: 'calc(100% - 2rem)' }}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                  >
                    <svg className="hint-anim" viewBox="0 0 36 36" aria-hidden="true">
                      <rect x="4" y="12" width="28" height="12" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
                      <motion.rect x="8" y="16" width="1.6" height="4" fill="currentColor" animate={{ opacity: [1, 0, 1], x: [8, 8, 22] }} transition={{ duration: 2.4, repeat: Infinity }} />
                    </svg>
                    <span>Klick in einen Text und schreib los. Mit «+» zwischen zwei Abschnitten fügst du neue hinzu.</span>
                    <button className="btn s ghost" onClick={dismissHint}>
                      Verstanden
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
              aria-label={PANEL_TITLE[panel]}
              initial={narrow ? { y: '100%' } : { x: 24, opacity: 0 }}
              animate={narrow ? { y: 0 } : { x: 0, opacity: 1 }}
              exit={narrow ? { y: '100%' } : { x: 24, opacity: 0, transition: { duration: 0.12 } }}
              transition={{ type: 'spring', stiffness: 520, damping: 44 }}
            >
              <header>
                <h2>{panel === 'inspector' && selectedBlock ? BLOCK_MAP[selectedBlock.type]?.label : PANEL_TITLE[panel]}</h2>
                <button className="btn ghost icon-only s" onClick={() => setPanel(null)} aria-label="Schliessen">
                  <Icon name="x" />
                </button>
              </header>
              <div className="side-body">
                {panel === 'inspector' && selectedBlock && <Inspector key={selectedBlock.id} block={selectedBlock} onChange={changeBlock} />}
                {panel === 'inspector' && !selectedBlock && <p className="small muted">Wähl auf der Seite einen Block aus.</p>}
                {panel === 'seo' && <SeoPanel doc={doc} onTarget={onSeoTarget} />}
                {panel === 'page' && <PagePanel doc={doc} />}
                {panel === 'history' && <HistoryPanel doc={doc} onRestored={() => void renderAll().catch(() => setCanvasKey((k) => k + 1))} />}
                {panel === 'structure' && (
                  <div className="stack">
                    <StructurePanel blocks={doc.data.blocks ?? []} selected={selected} onSelect={(bid) => selectBlock(bid)} onReorder={reorderAll} />
                    <button className="btn" style={{ justifySelf: 'start' }} onClick={() => setPicker({ index: blocksRef.current.length, rect: { top: 80, left: 80, width: 1, height: 1 } })}>
                      <Icon name="plus" size="s" /> Block am Ende hinzufügen
                    </button>
                  </div>
                )}
                {(panel === 'header' || panel === 'footer') && <GlobalPanel which={panel} />}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

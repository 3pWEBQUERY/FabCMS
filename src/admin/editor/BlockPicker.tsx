import { useMemo, useState, type SyntheticEvent } from 'react';
import { BLOCKS, BLOCK_CATEGORIES } from '../../shared/blocks';
import { useSession } from '../lib/session';
import { touchScreen } from '../lib/hooks';
import { t, tl } from '../lib/i18n';
import { Icon } from '../ui/icons';
import { LAYOUT_PRESETS } from '../../shared/elements';
import { LayoutThumb } from './elements/LayoutThumb';
import { dragSource, NEW_BLOCK } from './dragNew';

/** Block library, grouped and searchable. Werkbank adds code blocks. */
export function BlockPicker({
  onPick,
  sections,
  saved = [],
  onPickSaved,
  drag,
}: {
  onPick: (type: string, props?: Record<string, unknown>) => void;
  sections: { id: string; title: string }[];
  /** «Meine Vorlagen»: sections saved to be inserted as copies. */
  saved?: { id: string; title: string }[];
  onPickSaved?: (id: string) => void;
  /** In the builder's side bar: always open, so no focus grab – and everything can be dragged onto the page. */
  drag?: boolean;
}) {
  const { pro, settings } = useSession();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const modules = settings?.modules ?? [];
  const list = useMemo(() => {
    const n = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
    const all = BLOCKS.filter((b) => (pro || !b.pro) && (!b.module || modules.includes(b.module)));
    const hits = q ? all.filter((b) => n(`${tl(b.label)} ${tl(b.description)} ${b.label} ${b.type}`).includes(n(q))) : all;
    return hits;
  }, [q, pro, modules]);

  const mine = saved.filter((x) => !q || x.title.toLowerCase().includes(q.toLowerCase()) || t('Meine Vorlagen').toLowerCase().includes(q.toLowerCase()));
  const items = [
    ...list.map((b) => ({
      key: b.type,
      label: tl(b.label),
      description: tl(b.description),
      icon: b.icon,
      category: b.category,
      data: { type: b.type } as Record<string, unknown>,
      // The free layout starts with an empty container to build in.
      run: () => onPick(b.type, b.type === 'layout' ? { els: LAYOUT_PRESETS.find((p) => p.id === 'empty')!.els() } : undefined),
    })),
    ...(q === '' || 'sektion wiederverwendbar'.includes(q.toLowerCase()) || t('Wiederverwendbare Sektion').toLowerCase().includes(q.toLowerCase())
      ? sections.map((s) => ({
          key: `s-${s.id}`,
          label: s.title,
          description: t('Wiederverwendbare Sektion'),
          icon: 'link',
          category: 'sections',
          data: { section: s.id },
          run: () => onPick('section', { section: s.id }),
        }))
      : []),
  ];

  const presets = LAYOUT_PRESETS.filter(
    (p) => (!p.module || modules.includes(p.module)) && (!q || `${tl(p.label)} ${tl(p.description)} layout`.toLowerCase().includes(q.toLowerCase())),
  );

  let last = '';
  return (
    <div className="picker">
      <div className="picker-head">
        <input
          className="input"
          autoFocus={!drag && !touchScreen()}
          placeholder={t('Block suchen – z. B. «Bild», «Preise», «Karte»')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSel((s) => Math.min(items.length - 1, s + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSel((s) => Math.max(0, s - 1));
            } else if (e.key === 'Enter' && items[sel]) {
              e.preventDefault();
              items[sel].run();
            }
          }}
          aria-label={t('Block suchen')}
        />
      </div>
      <div className="picker-list" role="listbox" aria-label={t('Blöcke')}>
        {mine.length > 0 && (
          <>
            <div className="cmdk-group">{t('Meine Vorlagen')}</div>
            <div className="tpl-grid">
              {mine.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className="tpl-tile"
                  {...dragSource(drag, NEW_BLOCK, { saved: x.id })}
                  onClick={() => onPickSaved?.(x.id)}
                  title={t('Eigene Vorlage – als Kopie eingefügt')}
                >
                  <TemplateThumb id={x.id} />
                  <span>{x.title}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {presets.length > 0 && (
          <>
            <div className="cmdk-group">{t('Freie Layouts')}</div>
            <div className="lt-grid">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="lt-tile"
                  {...dragSource(drag, NEW_BLOCK, { preset: p.id })}
                  onClick={() => onPick('layout', { els: p.els() })}
                  title={tl(p.description)}
                >
                  <LayoutThumb id={p.id} />
                  <span>{tl(p.label)}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {items.map((it, i) => {
          const cat = it.category === 'sections' ? t('Sektionen') : tl(BLOCK_CATEGORIES.find((c) => c.id === it.category)?.label);
          const head = !q && cat !== last ? (last = cat) : null;
          return (
            <div key={it.key}>
              {head && <div className="cmdk-group">{head}</div>}
              <button
                type="button"
                className="picker-item"
                role="option"
                aria-selected={i === sel}
                {...dragSource(drag, NEW_BLOCK, it.data)}
                onMouseMove={() => setSel(i)}
                onClick={it.run}
              >
                <span className="pi-icon">
                  <Icon name={it.icon} />
                </span>
                <strong>{it.label}</strong>
                <span>{it.description}</span>
              </button>
            </div>
          );
        })}
        {!items.length && (
          <p className="small muted" style={{ padding: '1rem' }}>
            {t('Kein Block passt. Versuch ein anderes Wort.')}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * A saved section as it looks: its draft rendered at desktop width and scaled
 * down, without the site's header, footer and breadcrumbs.
 */
function TemplateThumb({ id }: { id: string }) {
  const [fit, setFit] = useState<{ scale: number; height: number } | null>(null);
  const bare = (e: SyntheticEvent<HTMLIFrameElement>) => {
    const frame = e.currentTarget;
    const d = frame.contentDocument;
    const box = frame.parentElement;
    if (!d || !box) return;
    const style = d.createElement('style');
    style.textContent = 'body>*:not(main),main>.crumbs{display:none!important}html,body{overflow:hidden!important}';
    d.head.append(style);
    // As wide as the tile; as tall as the section, within reason.
    const scale = box.clientWidth / 1280;
    const content = d.querySelector('main')?.scrollHeight ?? 600;
    setFit({ scale, height: Math.round(Math.min(150, Math.max(56, content * scale))) });
  };
  return (
    <span className={`tpl-thumb${fit ? ' ready' : ''}`} aria-hidden="true" style={fit ? { height: fit.height } : undefined}>
      <iframe src={`/_nova/preview/${id}`} title="" tabIndex={-1} loading="lazy" onLoad={bare} style={fit ? { transform: `scale(${fit.scale})` } : undefined} />
    </span>
  );
}

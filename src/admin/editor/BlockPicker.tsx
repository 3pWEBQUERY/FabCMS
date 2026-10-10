import { useMemo, useState } from 'react';
import { BLOCKS, BLOCK_CATEGORIES } from '../../shared/blocks';
import { useSession } from '../lib/session';
import { touchScreen } from '../lib/hooks';
import { t, tl } from '../lib/i18n';
import { Icon } from '../ui/icons';

/** Block library, grouped and searchable. Werkbank adds code blocks. */
export function BlockPicker({ onPick, sections }: { onPick: (type: string, props?: Record<string, unknown>) => void; sections: { id: string; title: string }[] }) {
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

  const items = [
    ...list.map((b) => ({ key: b.type, label: tl(b.label), description: tl(b.description), icon: b.icon, category: b.category, run: () => onPick(b.type) })),
    ...(q === '' || 'sektion wiederverwendbar'.includes(q.toLowerCase()) || t('Wiederverwendbare Sektion').toLowerCase().includes(q.toLowerCase())
      ? sections.map((s) => ({
          key: `s-${s.id}`,
          label: s.title,
          description: t('Wiederverwendbare Sektion'),
          icon: 'link',
          category: 'sections',
          run: () => onPick('section', { section: s.id }),
        }))
      : []),
  ];

  let last = '';
  return (
    <div className="picker">
      <div className="picker-head">
        <input
          className="input"
          autoFocus={!touchScreen()}
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
        {items.map((it, i) => {
          const cat = it.category === 'sections' ? t('Sektionen') : tl(BLOCK_CATEGORIES.find((c) => c.id === it.category)?.label);
          const head = !q && cat !== last ? (last = cat) : null;
          return (
            <div key={it.key}>
              {head && <div className="cmdk-group">{head}</div>}
              <button type="button" className="picker-item" role="option" aria-selected={i === sel} onMouseMove={() => setSel(i)} onClick={it.run}>
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

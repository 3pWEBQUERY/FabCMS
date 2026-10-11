import { useState } from 'react';
import { t } from '../lib/i18n';
import { useApi } from '../lib/hooks';
import { navigate } from '../lib/router';
import { Icon } from '../ui/icons';
import { confirm } from '../ui/kit';
import { SECTIONS } from '../editor/design/DesignPanel';
import type { Design } from '../../shared/design';
import type { SavedStyle } from '../../shared/styles';

interface Usage {
  places: number;
  entries: { id: string; collection: string; title: string }[];
}

const PARTS: Record<string, () => string> = {
  layout: () => t('Layout'),
  spacing: () => t('Abstände'),
  size: () => t('Grösse'),
  position: () => t('Position'),
  type: () => t('Text & Farben'),
  background: () => t('Hintergrund'),
  border: () => t('Rahmen & Ecken'),
  effects: () => t('Effekte'),
};

/** What a style sets, in the words of the design panel, and for which screen sizes and states. */
function summary(d: Design): { parts: string[]; layers: string[] } {
  const layers = (['desktop', 'tablet', 'mobile', 'hover', 'focus', 'active'] as const).filter((l) => d[l] && Object.keys(d[l]!).length);
  const keys = new Set(layers.flatMap((l) => Object.keys(d[l]!)));
  const parts = Object.entries(SECTIONS)
    .filter(([, ks]) => ks.some((k) => keys.has(k)))
    .map(([sec]) => PARTS[sec]());
  const names = { desktop: t('Computer'), tablet: t('Tablet'), mobile: t('Handy'), hover: t('Hover'), focus: t('Fokus'), active: t('Gedrückt') };
  return { parts, layers: layers.map((l) => names[l]) };
}

const editorPath = (e: { id: string; collection: string }) => (e.collection === 'pages' ? `/seiten/${e.id}` : `/inhalte/${e.collection}/${e.id}`);

/**
 * Settings → Design: every saved style, what it sets and where it is used
 * across the whole site. Renaming and removing go into the page's draft
 * and are saved with its button, like every other design setting.
 */
export function SavedStylesOverview({ styles, onChange }: { styles: SavedStyle[]; onChange: (next: SavedStyle[]) => void }) {
  const { data } = useApi<{ usage: Record<string, Usage> }>('/api/styles/usage');
  const [editing, setEditing] = useState<string | null>(null);
  if (!styles.length)
    return <p className="small muted">{t('Noch keine. Im Editor wählst du einen Block oder ein Element und speicherst sein Design im Design-Panel mit «Als Stil speichern».')}</p>;
  const taken = (id: string, name: string) => styles.some((s) => s.id !== id && s.name.toLowerCase() === name.trim().toLowerCase());
  return (
    <ul className="st-list">
      {styles.map((s) => {
        const u = data?.usage[s.id];
        const { parts, layers } = summary(s.design);
        const pages = u?.entries ?? [];
        return (
          <li key={s.id} className="st-item">
            <div className="row" style={{ gap: '0.5rem', alignItems: 'center' }}>
              {editing === s.id ? (
                <input
                  className="input grow"
                  defaultValue={s.name}
                  maxLength={60}
                  autoFocus
                  aria-label={t('Name')}
                  onBlur={(e) => {
                    const name = e.target.value.replace(/\s+/g, ' ').trim();
                    if (name && !taken(s.id, name)) onChange(styles.map((x) => (x.id === s.id ? { ...x, name } : x)));
                    setEditing(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setEditing(null);
                  }}
                />
              ) : (
                <strong className="grow">{s.name}</strong>
              )}
              <button type="button" className="btn s ghost icon-only" onClick={() => setEditing(s.id)} aria-label={t('Stil «{name}» umbenennen', { name: s.name })}>
                <Icon name="pen" size="s" />
              </button>
              <button
                type="button"
                className="btn s ghost icon-only"
                aria-label={t('Stil «{name}» löschen', { name: s.name })}
                onClick={async () => {
                  const ok = await confirm({
                    title: t('Stil «{name}» löschen?', { name: s.name }),
                    message: u?.places
                      ? t('Er ist {n}× in Gebrauch. Dort fällt sein Design weg; was eine Stelle selbst eingestellt hat, bleibt. Wirkt, sobald du speicherst.', { n: u.places })
                      : t('Er wird nirgends verwendet. Wirkt, sobald du speicherst.'),
                    confirm: t('Löschen'),
                    danger: true,
                  });
                  if (ok) onChange(styles.filter((x) => x.id !== s.id));
                }}
              >
                <Icon name="trash" size="s" />
              </button>
            </div>
            <p className="xsmall muted">
              {parts.length ? parts.join(' · ') : t('Setzt noch nichts.')}
              {layers.length > 1 && <> — {layers.join(', ')}</>}
            </p>
            <p className="xsmall">
              {!data ? (
                <span className="faint">{t('Verwendung wird gezählt …')}</span>
              ) : !u ? (
                <span className="faint">{t('Nirgends verwendet.')}</span>
              ) : (
                <>
                  {t('{n}× verwendet, auf:', { n: u.places })}{' '}
                  {pages.map((e, i) => (
                    <span key={e.id}>
                      {i > 0 && ', '}
                      <button type="button" className="linkish" onClick={() => navigate(editorPath(e))}>
                        {e.title || t('(ohne Titel)')}
                      </button>
                    </span>
                  ))}
                </>
              )}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

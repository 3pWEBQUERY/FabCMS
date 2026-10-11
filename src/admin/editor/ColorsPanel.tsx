import { useContext, useState } from 'react';
import { t } from '../lib/i18n';
import { Icon } from '../ui/icons';
import { COLOR_TOKENS } from '../../shared/design';
import { pageColors } from '../../shared/page-colors';
import type { Block } from '../../shared/types';
import { ColorInput, colorTokenLabel, Swatch, TokenColors, toHex, useColorPreview } from './design/controls';

/** The theme colour a hex value is (nearly) the same as – using it keeps the page with the theme. */
function nearestToken(value: string, tokens: Record<string, string>): string | null {
  const hex = toHex(value);
  if (!hex || value.startsWith('$')) return null;
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r, g, b] = rgb(hex);
  let best: { tok: string; d: number } | null = null;
  for (const tok of COLOR_TOKENS) {
    const th = tokens[tok] ? toHex(tokens[tok]) : null;
    if (!th) continue;
    const [r2, g2, b2] = rgb(th);
    const d = Math.hypot(r - r2, g - g2, b - b2);
    if (!best || d < best.d) best = { tok, d };
  }
  return best && best.d <= 24 ? best.tok : null;
}

/**
 * «Farben dieser Seite»: every colour the page's designs use, how often, and
 * one change for all places at once – also into a theme colour, so the page
 * follows when the theme changes.
 */
export function ColorsPanel({ blocks, onReplace, locked }: { blocks: Block[]; onReplace: (from: string, to: string) => void; locked: number }) {
  const colors = pageColors(blocks);
  const tokens = useContext(TokenColors);
  const preview = useColorPreview();
  const [open, setOpen] = useState<string | null>(null);
  const [to, setTo] = useState<string | undefined>(undefined);
  if (!colors.length) return <p className="small muted">{t('Diese Seite nutzt nur die Farben des Themes. Eigene Farben aus dem Design-Panel erscheinen hier.')}</p>;
  const name = (v: string) => {
    const tok = /^\$([a-z0-9-]+)(?:\/(\d{1,3}))?$/.exec(v);
    return tok ? `${colorTokenLabel(tok[1])}${tok[2] ? ` ${tok[2]} %` : ''}` : (toHex(v) ?? v);
  };
  return (
    <div className="stack">
      <p className="small muted">{t('Alle Farben, die Blöcke und Elemente dieser Seite selbst setzen – auf allen Bildschirmgrössen und bei Hover.')}</p>
      <ul className="pc-list">
        {colors.map((c) => {
          const tok = nearestToken(c.value, tokens);
          const isOpen = open === c.value;
          return (
            <li key={c.value} className={isOpen ? 'open' : ''}>
              <button
                type="button"
                className="pc-row"
                aria-expanded={isOpen}
                onClick={() => {
                  setOpen(isOpen ? null : c.value);
                  setTo(undefined);
                }}
              >
                <Swatch color={preview(c.value)} size={22} />
                <span className="grow">
                  <strong>{name(c.value)}</strong>
                  <span className="xsmall muted">{c.value.startsWith('$') ? t('Theme-Farbe') : t('Eigene Farbe')}</span>
                </span>
                <span className="xsmall faint">{c.count === 1 ? t('1 Stelle') : t('{n} Stellen', { n: c.count })}</span>
              </button>
              {isOpen && (
                <div className="pc-edit stack tight">
                  {tok && (
                    <button type="button" className="btn s" onClick={() => onReplace(c.value, `$${tok}`)}>
                      <Swatch color={preview(`$${tok}`)} size={14} /> {t('Durch Theme-Farbe «{name}» ersetzen', { name: colorTokenLabel(tok) })}
                    </button>
                  )}
                  <ColorInput value={to} onChange={setTo} ariaLabel={t('Neue Farbe')} placeholder={c.value} allowNone={false} />
                  <button type="button" className="btn primary s" disabled={!to || to === c.value} onClick={() => to && onReplace(c.value, to)}>
                    <Icon name="paint" size="s" /> {t('Überall auf dieser Seite ersetzen')}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {locked > 0 && <p className="xsmall faint">{t('Gesperrte Blöcke bleiben, wie sie sind.')}</p>}
    </div>
  );
}

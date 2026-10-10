import { createContext, useContext } from 'react';
import { t } from '../../lib/i18n';
import { navigate } from '../../lib/router';
import { Icon } from '../../ui/icons';
import { formatRatio, type ContrastIssue } from '../../../shared/contrast';

/** The hardest-to-read text in what is selected, measured on the canvas. */
export const ContrastNow = createContext<ContrastIssue | null>(null);

/** The worst place first: furthest below what it needs. */
export const worstFirst = (list: ContrastIssue[]) => [...list].sort((a, b) => a.ratio / a.need - b.ratio / b.need);

function Sample({ issue }: { issue: ContrastIssue }) {
  return (
    <span className="ct-sample" style={{ color: issue.fg, background: issue.bg }} aria-hidden="true">
      Aa
    </span>
  );
}

/** Where the text sits when that isn't simply a block on the page. */
const placeOf = (i: ContrastIssue) => (i.global === 'header' ? t('Kopfzeile') : i.global === 'footer' ? t('Fusszeile') : i.hover ? t('Beim Darüberfahren') : null);

const ratioText = (i: ContrastIssue) => t('{ratio} : 1 – nötig sind {need} : 1', { ratio: formatRatio(i.ratio), need: formatRatio(i.need) });

/** In the design panel: the selection has text that is hard to read, and the colour that fixes it. */
export function ContrastNote({ onFix }: { onFix: (color: string) => void }) {
  const issue = useContext(ContrastNow);
  if (!issue) return null;
  return (
    <div className="ct-note" role="status">
      <Sample issue={issue} />
      <div className="grow stack tight">
        <strong className="small">{t('Schwer lesbar')}</strong>
        <span className="xsmall muted">{ratioText(issue)}</span>
        {issue.own && issue.fix ? (
          <button type="button" className="btn s" style={{ justifySelf: 'start' }} onClick={() => onFix(issue.fix!)}>
            <span className="ct-dot" style={{ background: issue.fix }} aria-hidden="true" /> {t('Textfarbe anpassen')}
          </button>
        ) : (
          <span className="xsmall muted">{t('Die Farbe kommt von einem Element darin oder aus dem Design der Website. Wähl die Stelle unter «Kontrast».')}</span>
        )}
      </div>
    </div>
  );
}

/**
 * Every place on the page where text is too faint for its background, with
 * a click to go there and, where the colour belongs to the block or
 * element, one to fix it.
 */
export function ContrastPanel({ issues, onGo, onFix }: { issues: ContrastIssue[]; onGo: (i: ContrastIssue) => void; onFix: (i: ContrastIssue) => void }) {
  return (
    <div className="stack">
      <p className="small muted">
        {t(
          'Text braucht genug Kontrast zum Hintergrund, damit ihn alle lesen können – auch draussen am Handy oder mit schwächeren Augen. Gemessen wird, was gerade auf der Vorschau zu sehen ist.',
        )}
      </p>
      {issues.length === 0 ? (
        <p className="ct-ok small">
          <Icon name="eye" size="s" /> {t('Alle Texte auf dieser Ansicht sind gut lesbar.')}
        </p>
      ) : (
        <ul className="ct-list">
          {worstFirst(issues).map((i) => (
            <li key={[i.global ?? i.block, i.hover ? 'hover' : '', i.els[0] ?? '', i.fg, i.bg].join('|')}>
              <button type="button" className="ct-go" onClick={() => onGo(i)}>
                <Sample issue={i} />
                <span className="grow">
                  <span className="ct-text">{i.text}</span>
                  <span className="xsmall muted">
                    {placeOf(i) && <span className="ct-place">{placeOf(i)}</span>}
                    {ratioText(i)}
                  </span>
                </span>
              </button>
              {i.global && (
                <button type="button" className="btn s ghost" onClick={() => navigate('/einstellungen/design')}>
                  {t('Farben')}
                </button>
              )}
              {i.own && i.fix && (
                <button type="button" className="btn s ghost" onClick={() => onFix(i)} aria-label={t('Textfarbe anpassen')}>
                  <span className="ct-dot" style={{ background: i.fix }} aria-hidden="true" /> {t('Anpassen')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="xsmall faint">
        {t('Grenzen nach WCAG 2.2: 4.5 : 1 für Text, 3 : 1 für grosse Schrift. Text auf Bildern und Verläufen lässt sich so nicht messen – prüf ihn von Auge.')}
      </p>
    </div>
  );
}

/** In the header or footer panel: its text is hard to read, and where its colours are chosen. */
export function GlobalContrast({ issues }: { issues: ContrastIssue[] }) {
  const worst = worstFirst(issues)[0];
  if (!worst) return null;
  return (
    <div className="ct-note" role="status">
      <Sample issue={worst} />
      <div className="grow stack tight">
        <strong className="small">{issues.length > 1 ? t('{n} Stellen schwer lesbar', { n: issues.length }) : t('Schwer lesbar')}</strong>
        <span className="xsmall muted">
          «{worst.text}» – {ratioText(worst)}
        </span>
        <span className="xsmall muted">{t('Kopf- und Fusszeile nehmen ihre Farben aus dem Design der Website.')}</span>
        <button type="button" className="btn s" style={{ justifySelf: 'start' }} onClick={() => navigate('/einstellungen/design')}>
          {t('Farben ändern')}
        </button>
      </div>
    </div>
  );
}

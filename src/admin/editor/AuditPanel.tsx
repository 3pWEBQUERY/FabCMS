import { t } from '../lib/i18n';
import { Icon } from '../ui/icons';
import { AUDIT_ERRORS, auditOrder, type AuditIssue, type AuditKind } from '../../shared/audit';

/** What each finding means, and what to do about it. */
const KINDS: Record<AuditKind, { title: () => string; fix: () => string }> = {
  'img-alt': {
    title: () => t('Bild ohne Beschreibung'),
    fix: () => t('Wähl das Bild und beschreib im Inspektor, was darauf zu sehen ist – oder in der Mediathek, dann gilt es überall.'),
  },
  'link-empty': { title: () => t('Link ohne Text'), fix: () => t('Gib dem Link einen Text oder – bei einem Symbol – eine Beschriftung, die sagt, wohin er führt.') },
  'link-dead': { title: () => t('Link führt nirgendwohin'), fix: () => t('Das Ziel ist noch «#». Wähl eine Seite, eine Sprungmarke oder eine Adresse.') },
  'button-empty': { title: () => t('Knopf ohne Beschriftung'), fix: () => t('Ein Knopf braucht Text oder eine Beschriftung für Screenreader.') },
  'h1-none': {
    title: () => t('Keine Hauptüberschrift (H1)'),
    fix: () => t('Jede Seite sollte genau eine H1 haben – meist den Seitentitel. Stell eine Überschrift auf «H1 – Seitentitel».'),
  },
  'h1-many': { title: () => t('Mehr als eine Hauptüberschrift'), fix: () => t('Nur eine H1 pro Seite. Stell diese auf H2 – die Grösse bleibt über «Design» gleich.') },
  'heading-skip': {
    title: () => t('Überschrift überspringt eine Ebene'),
    fix: () => t('Nach einer H2 kommt eine H3, nicht gleich eine H4. Die Ebene ordnet, die Grösse stellst du unter «Design» ein.'),
  },
  'heading-empty': { title: () => t('Leere Überschrift'), fix: () => t('Schreib etwas hinein oder entferne sie.') },
  'field-label': { title: () => t('Formularfeld ohne Beschriftung'), fix: () => t('Jedes Feld braucht eine sichtbare Beschriftung, damit man weiss, was hinein gehört.') },
  'iframe-title': { title: () => t('Eingebettetes ohne Titel'), fix: () => t('Gib dem eingebetteten Inhalt einen Titel, damit Screenreader ihn ansagen können.') },
  'id-double': { title: () => t('Sprungmarke doppelt'), fix: () => t('Zwei Stellen tragen dieselbe ID – Links finden nur die erste. Gib einer eine andere Sprungmarke.') },
  'text-small': { title: () => t('Sehr kleine Schrift'), fix: () => t('Unter 12 Pixel ist für viele schwer zu lesen. Mach die Schrift unter «Design» etwas grösser.') },
  'target-small': {
    title: () => t('Kleines Klickziel'),
    fix: () => t('Symbole zum Antippen sollten mindestens 24 × 24 Pixel gross sein – mit Innenabstand geht das auch bei kleinen Symbolen.'),
  },
};

/**
 * «Prüfung» like Webflow's audit panel: errors keep people out, warnings make
 * it harder. A click selects the place on the page.
 */
export function AuditPanel({ issues, onGo }: { issues: AuditIssue[]; onGo: (i: AuditIssue) => void }) {
  const errors = issues.filter((i) => AUDIT_ERRORS.has(i.kind)).length;
  return (
    <div className="stack">
      <p className="small muted">
        {t('Geprüft wird die Seite, wie sie gerade auf der Vorschau steht – damit alle sie benutzen können, auch mit Screenreader, Tastatur oder kleinem Bildschirm.')}
      </p>
      {issues.length === 0 ? (
        <p className="ct-ok small">
          <Icon name="shield" size="s" /> {t('Nichts gefunden – die Seite ist gut zugänglich.')}
        </p>
      ) : (
        <>
          <p className="small">
            {errors ? t('{n} Fehler', { n: errors }) : null}
            {errors && issues.length > errors ? ' · ' : null}
            {issues.length > errors ? t('{n} Hinweise', { n: issues.length - errors }) : null}
          </p>
          <ul className="audit-list">
            {auditOrder(issues).map((i, n) => {
              const k = KINDS[i.kind];
              const error = AUDIT_ERRORS.has(i.kind);
              return (
                <li key={`${i.kind}-${i.el ?? i.block ?? ''}-${n}`} className={error ? 'audit-error' : 'audit-warn'}>
                  <button type="button" className="audit-go" onClick={() => onGo(i)} disabled={!i.block}>
                    <Icon name={error ? 'alert' : 'info'} size="s" />
                    <span className="grow">
                      <strong className="small">{k.title()}</strong>
                      {i.text && <span className="xsmall muted audit-text">{i.text}</span>}
                      <span className="xsmall faint">{k.fix()}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

import { t } from '../lib/i18n';
import type { Peer } from '../lib/collab';
import type { EntryDoc } from '../lib/useEntryDoc';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** Who else is here (one avatar per person) and whether changes reach them live. */
export function Presence({ peers, link, local }: { peers: Peer[]; link: EntryDoc['link']; local?: boolean }) {
  const people = [...new Map(peers.map((p) => [p.id, p])).values()];
  return (
    <div className="presence" aria-live="polite">
      {people.slice(0, 4).map((p) => (
        <span
          key={p.id}
          className="avatar"
          style={{ ['--peer' as string]: p.color }}
          title={t('{name} bearbeitet gerade mit', { name: p.name })}
          aria-label={t('{name} bearbeitet gerade mit', { name: p.name })}
        >
          {initials(p.name)}
        </span>
      ))}
      {people.length > 4 && <span className="avatar more">+{people.length - 4}</span>}
      {link === 'offline' && local && (
        <span
          className="link-state offline"
          title={t('Keine Verbindung. Deine Änderungen sind in diesem Browser gesichert und werden zusammengeführt, sobald du wieder online bist.')}
        >
          {t('Offline · lokal gesichert')}
        </span>
      )}
      {link === 'offline' && !local && (
        <span className="link-state offline" title={t('Keine Live-Verbindung – Änderungen werden direkt gespeichert, die anderen sehen sie nach dem Neuladen.')}>
          {t('Nicht live')}
        </span>
      )}
    </div>
  );
}

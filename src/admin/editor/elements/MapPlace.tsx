import { useState } from 'react';
import { api } from '../../lib/api';
import { t } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { Icon } from '../../ui/icons';
import { Segmented } from '../../ui/kit';
import { useToast } from '../../ui/toast';
import type { El } from '../../../shared/elements';

/** Where the map's pin sits: at the website's address, or at a place found by its address. */
export function MapPlace({ el, onChange }: { el: El; onChange: (el: El) => void }) {
  const { settings } = useSession();
  const toast = useToast();
  const p = el.props;
  const own = typeof p.lat === 'number' && typeof p.lng === 'number';
  const [mode, setMode] = useState<'site' | 'own'>(own ? 'own' : 'site');
  const [q, setQ] = useState(String(p.place ?? ''));
  const [busy, setBusy] = useState(false);
  const biz = settings?.business;
  const siteAddress = biz ? [biz.street, [biz.zip, biz.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';
  const search = async () => {
    setBusy(true);
    try {
      const r = await api.get<{ place: { lat: number; lng: number; label: string } }>(`/api/geocode?q=${encodeURIComponent(q)}`);
      onChange({ ...el, props: { ...p, place: q.trim(), lat: r.place.lat, lng: r.place.lng } });
      toast(t('Gefunden: {place}', { place: r.place.label }));
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack tight">
      <Segmented
        label={t('Ort')}
        value={mode}
        onChange={(m) => {
          setMode(m);
          if (m === 'site') onChange({ ...el, props: { ...p, place: '', lat: null, lng: null } });
        }}
        options={[
          { value: 'site' as const, label: t('Standort der Website') },
          { value: 'own' as const, label: t('Eigener Ort') },
        ]}
      />
      {mode === 'site' ? (
        <p className="xsmall faint">
          {siteAddress && typeof biz?.lat === 'number'
            ? t('Die Stecknadel steht bei {address}.', { address: siteAddress })
            : t('Noch kein Standort: Adresse unter «Einstellungen → Name, Logo & Kontakt» eintragen – Nova findet ihn dann selbst.')}
        </p>
      ) : (
        <>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <input className="input grow" value={q} placeholder={t('Strasse, PLZ Ort')} aria-label={t('Adresse des Orts')} onChange={(e) => setQ(e.target.value)} />
            <button className="btn s" disabled={busy || q.trim().length < 3} aria-busy={busy || undefined}>
              <Icon name="search" size="s" /> {t('Suchen')}
            </button>
          </form>
          <p className="xsmall faint">
            {own
              ? t('Die Stecknadel steht bei {place} ({lat}, {lng}).', { place: String(p.place || ''), lat: String(p.lat), lng: String(p.lng) })
              : t('Adresse eingeben und suchen – OpenStreetMap findet den Ort.')}
          </p>
        </>
      )}
    </div>
  );
}

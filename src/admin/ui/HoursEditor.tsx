import { Icon } from './icons';
import { TimeInput } from './kit';
import { DAYS } from '../../shared/hours';
import { adminLang, t } from '../lib/i18n';
import type { OpeningHoursDay } from '../../shared/types';

/** Weekday name in the interface language, capitalised as a row label. */
const dayName = (day: number) => {
  const n = DAYS[adminLang()].long[day] ?? '';
  return n.charAt(0).toUpperCase() + n.slice(1);
};

/** Opening hours per weekday with up to three time windows (lunch break). Used for the business and for each bookable resource. */
export function HoursEditor({ hours, onChange }: { hours: OpeningHoursDay[]; onChange: (h: OpeningHoursDay[]) => void }) {
  const set = (day: number, patch: Partial<OpeningHoursDay>) => onChange(hours.map((h) => (h.day === day ? { ...h, ...patch } : h)));
  const copyFromMonday = () => {
    const mon = hours.find((h) => h.day === 1);
    if (mon) onChange(hours.map((h) => (h.day <= 5 ? { ...mon, day: h.day, slots: mon.slots.map((s) => ({ ...s })) } : h)));
  };
  return (
    <div className="stack tight">
      {[...hours]
        .sort((a, b) => a.day - b.day)
        .map((h) => (
          <div key={h.day} className="row wrap" style={{ gap: '0.6rem', alignItems: 'center' }}>
            <span style={{ width: '6.5rem', fontWeight: 550 }} className="small">
              {dayName(h.day)}
            </span>
            <label className="check small" style={{ width: '7.5rem' }}>
              <input
                type="checkbox"
                checked={!h.closed}
                onChange={(e) => set(h.day, { closed: !e.target.checked, slots: e.target.checked && !h.slots.length ? [{ from: '09:00', to: '18:00' }] : h.slots })}
              />
              {h.closed ? t('geschlossen') : t('geöffnet')}
            </label>
            {!h.closed &&
              h.slots.map((s, i) => (
                <span key={i} className="row" style={{ gap: '0.3rem' }}>
                  <TimeInput
                    label={t('{day} von', { day: dayName(h.day) })}
                    value={s.from}
                    onChange={(v) => set(h.day, { slots: h.slots.map((x, j) => (j === i ? { ...x, from: v } : x)) })}
                  />
                  –
                  <TimeInput
                    label={t('{day} bis', { day: dayName(h.day) })}
                    value={s.to}
                    onChange={(v) => set(h.day, { slots: h.slots.map((x, j) => (j === i ? { ...x, to: v } : x)) })}
                  />
                  {h.slots.length > 1 && (
                    <button className="btn ghost s icon-only" aria-label={t('Zeitfenster entfernen')} onClick={() => set(h.day, { slots: h.slots.filter((_, j) => j !== i) })}>
                      <Icon name="x" size="s" />
                    </button>
                  )}
                </span>
              ))}
            {!h.closed && h.slots.length < 3 && (
              <button className="btn ghost s" onClick={() => set(h.day, { slots: [...h.slots, { from: '14:00', to: '18:00' }] })}>
                {t('+ Mittagspause')}
              </button>
            )}
          </div>
        ))}
      <button className="linkish small" style={{ justifySelf: 'start' }} onClick={copyFromMonday}>
        {t('Montag auf Dienstag bis Freitag übertragen')}
      </button>
    </div>
  );
}

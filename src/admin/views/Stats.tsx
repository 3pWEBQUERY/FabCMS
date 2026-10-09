import { useState } from 'react';
import { useApi } from '../lib/hooks';
import { useSession } from '../lib/session';
import { PageHead, Segmented, Skeleton } from '../ui/kit';
import { BarList, VisitorsChart, type DayPoint } from '../ui/Chart';
import { formatMoney } from '../../shared/text';

interface Stats {
  totals: { visitors: number; pageviews: number; bounce: number; visitorsPrev: number; pageviewsPrev: number };
  series: DayPoint[];
  pages: { path: string; visitors: number; pageviews: number }[];
  sources: { source: string; visitors: number }[];
  devices: { device: string; visitors: number }[];
  goals: { goal: string; count: number; value: number }[];
}

const DEVICES: Record<string, string> = { mobile: 'Handy', tablet: 'Tablet', desktop: 'Computer' };
const GOALS: Record<string, string> = { form: 'Formular gesendet', order: 'Bestellung bezahlt', booking: 'Reservation', newsletter: 'Newsletter-Anmeldung', signup: 'Konto erstellt', ticket: 'Tickets bestellt', donation: 'Spende begonnen', property: 'Immobilien-Anfrage' };

function Kpi({ label, value, prev, suffix = '' }: { label: string; value: number; prev?: number; suffix?: string }) {
  const diff = prev !== undefined && prev > 0 ? Math.round(((value - prev) / prev) * 100) : null;
  return (
    <div className="kpi">
      <span className="label">{label}</span>
      <span className="value">
        {value.toLocaleString('de-CH')}
        {suffix}
      </span>
      {diff !== null && <span className={`delta ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}`}>{diff === 0 ? 'unverändert' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)} % zur Vorperiode`}</span>}
    </div>
  );
}

export function Stats() {
  const [days, setDays] = useState('30');
  const [table, setTable] = useState(false);
  const { settings } = useSession();
  const { data } = useApi<Stats>(`/api/stats?days=${days}`);
  return (
    <div className="page">
      <PageHead
        title="Statistik"
        sub="Ohne Cookies und ohne Einwilligungsbanner gezählt. Besucher werden nicht über Tage hinweg wiedererkannt."
        actions={
          <Segmented
            label="Zeitraum"
            value={days}
            onChange={setDays}
            options={[
              { value: '7', label: '7 Tage' },
              { value: '30', label: '30 Tage' },
              { value: '90', label: '90 Tage' },
              { value: '365', label: 'Jahr' },
            ]}
          />
        }
      />
      {!data ? (
        <Skeleton lines={6} />
      ) : (
        <div className="stack loose">
          <div className="kpis">
            <Kpi label="Besuche" value={data.totals.visitors} prev={data.totals.visitorsPrev} />
            <Kpi label="Seitenaufrufe" value={data.totals.pageviews} prev={data.totals.pageviewsPrev} />
            <Kpi label="Nur eine Seite angesehen" value={data.totals.bounce} suffix=" %" />
            {data.goals.map((g) => (
              <Kpi key={g.goal} label={GOALS[g.goal] ?? g.goal} value={g.count} />
            ))}
          </div>
          <section className="card">
            <div className="card-head">
              <h2>Besuche pro Tag</h2>
              <button className="btn ghost s" onClick={() => setTable((t) => !t)} aria-pressed={table}>
                {table ? 'Als Diagramm' : 'Als Tabelle'}
              </button>
            </div>
            <div className="card-pad">
              {table ? (
                <div className="table-wrap" style={{ maxHeight: '24rem' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Tag</th>
                        <th className="right">Besuche</th>
                        <th className="right">Seitenaufrufe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...data.series].reverse().map((d) => (
                        <tr key={d.day}>
                          <td>{new Date(`${d.day}T12:00:00`).toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                          <td className="right num">{d.visitors}</td>
                          <td className="right num">{d.pageviews}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <VisitorsChart data={data.series} label="Besuche pro Tag" />
              )}
            </div>
          </section>
          <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 20rem), 1fr))' }}>
            <section className="card">
              <div className="card-head">
                <h2>Meistbesuchte Seiten</h2>
              </div>
              <div style={{ padding: '0.5rem' }}>
                <BarList valueLabel="Besuche pro Seite" rows={data.pages.map((p) => ({ label: p.path, value: p.visitors }))} />
              </div>
            </section>
            <section className="card">
              <div className="card-head">
                <h2>Woher die Besuche kommen</h2>
              </div>
              <div style={{ padding: '0.5rem' }}>
                <BarList valueLabel="Besuche pro Quelle" rows={data.sources.map((s) => ({ label: s.source, value: s.visitors }))} />
              </div>
            </section>
            <section className="card">
              <div className="card-head">
                <h2>Geräte</h2>
              </div>
              <div style={{ padding: '0.5rem' }}>
                <BarList valueLabel="Besuche pro Gerät" rows={data.devices.map((d) => ({ label: DEVICES[d.device] ?? d.device, value: d.visitors }))} />
              </div>
            </section>
            {data.goals.some((g) => g.value > 0) && (
              <section className="card card-pad">
                <h2 className="section-title">Umsatz im Zeitraum</h2>
                <p style={{ fontSize: 'var(--t-2xl)', fontWeight: 650 }} className="num">
                  {formatMoney(
                    data.goals.reduce((s, g) => s + g.value, 0),
                    settings?.shop.currency ?? 'CHF',
                  )}
                </p>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

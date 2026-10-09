import { useState } from 'react';
import { api } from '../lib/api';
import { formatDate, useApi } from '../lib/hooks';
import { Link, navigate, usePath } from '../lib/router';
import { Icon } from '../ui/icons';
import { Empty, Field, PageHead, Segmented, Select, Skeleton, Toggle } from '../ui/kit';
import { useToast } from '../ui/toast';
import { formatMoney } from '../../shared/text';
import { useLeaveGuard } from './settingsDraft';

interface Donation {
  id: string;
  amount: number;
  currency: string;
  interval: 'once' | 'month';
  campaign: string;
  name: string;
  email: string;
  anonymous: boolean;
  parent_id: string | null;
  subscription_active: boolean;
  paid_at: string;
  token: string;
}
interface Settings {
  recipient: string;
  iban: string;
  taxDeductible: boolean;
  receiptNote: string;
}
interface Data {
  year: number;
  years: number[];
  donations: Donation[];
  kpi: { total: number; count: number; donors: number; monthly: number; monthlySum: number };
  campaigns: { campaign: string; total: number; count: number }[];
  settings: Settings;
  currency: string;
  stripe: boolean;
}

export function Donations() {
  const { query } = usePath();
  const tab = (query.get('tab') ?? 'spenden') as 'spenden' | 'bestaetigungen' | 'einstellungen';
  const year = Number(query.get('jahr')) || new Date().getFullYear();
  const data = useApi<Data>(`/api/donations?jahr=${year}`);
  const d = data.data;
  const go = (t: string, y = year) => navigate(`/spenden?tab=${t}&jahr=${y}`, { replace: true });
  const money = (c: number) => formatMoney(c, d?.currency ?? 'CHF');
  return (
    <div className="page">
      <PageHead
        back={
          <Link to="/inhalte" className="crumb">
            <Icon name="chevronLeft" size="s" /> Inhalte
          </Link>
        }
        title="Spenden"
        sub={d ? `${year}: ${money(d.kpi.total)} von ${d.kpi.donors} ${d.kpi.donors === 1 ? 'Person' : 'Personen'}` : undefined}
        actions={
          <a className="btn" href={`/api/donations.csv?jahr=${year}`} download>
            <Icon name="download" size="s" /> CSV {year}
          </a>
        }
      />
      {d && !d.stripe && (
        <p className="hint" role="note" style={{ marginBottom: '1rem' }}>
          <span>
            Für Online-Spenden fehlt noch <span className="mono">STRIPE_SECRET_KEY</span>. Bis dahin zeigt der Block «Spenden» die Bankverbindung aus den Einstellungen unten.
          </span>
        </p>
      )}
      <div className="toolbar">
        <Segmented
          label="Bereich"
          value={tab}
          onChange={(t) => go(t)}
          options={[
            { value: 'spenden', label: 'Spenden' },
            { value: 'bestaetigungen', label: 'Jahresbestätigungen' },
            { value: 'einstellungen', label: 'Einstellungen' },
          ]}
        />
        {tab !== 'einstellungen' && d && d.years.length > 1 && (
          <Select label="Jahr" value={String(year)} onChange={(v) => go(tab, Number(v))} options={d.years.map((y) => ({ value: String(y), label: String(y) }))} />
        )}
      </div>
      {!d ? (
        <section className="card">
          <Skeleton lines={5} />
        </section>
      ) : tab === 'einstellungen' ? (
        <DonationSettings settings={d.settings} onSaved={(s) => data.setData({ ...d, settings: s })} />
      ) : tab === 'bestaetigungen' ? (
        <Receipts year={year} taxDeductible={d.settings.taxDeductible} currency={d.currency} />
      ) : (
        <>
          <div className="kpis" style={{ marginBottom: '1.25rem' }}>
            <div className="kpi">
              <span className="label">Gesammelt {year}</span>
              <span className="value">{money(d.kpi.total)}</span>
              <span className="delta">{d.kpi.count} Zahlungen</span>
            </div>
            <div className="kpi">
              <span className="label">Monatlich Spendende</span>
              <span className="value">{d.kpi.monthly}</span>
              <span className="delta">{money(d.kpi.monthlySum)} pro Monat</span>
            </div>
            {d.campaigns.slice(0, 2).map((c) => (
              <div className="kpi" key={c.campaign}>
                <span className="label">{c.campaign || 'Allgemein'}</span>
                <span className="value">{money(c.total)}</span>
                <span className="delta">{c.count} Spenden</span>
              </div>
            ))}
          </div>
          <section className="card">
            {!d.donations.length ? (
              <Empty title={`Noch keine Spenden ${year}`}>Füg den Block «Spenden» auf einer Seite ein. Jede Spende erscheint hier, mit Kampagne und Rhythmus.</Empty>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Von</th>
                      <th>Für</th>
                      <th className="right">Betrag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.donations.map((x) => (
                      <tr key={x.id}>
                        <td>{formatDate(x.paid_at)}</td>
                        <td>
                          <div className="ellipsis">
                            {x.name || x.email} {x.anonymous && <span className="badge muted">anonym</span>}
                          </div>
                          <div className="xsmall muted ellipsis">{x.email}</div>
                        </td>
                        <td className="small">
                          {x.campaign || <span className="faint">Allgemein</span>}
                          {x.interval === 'month' && (
                            <span className={`badge ${x.subscription_active ? 'ok' : 'muted'}`} style={{ marginLeft: '.4rem' }}>
                              {x.parent_id ? 'Folgemonat' : x.subscription_active ? 'monatlich' : 'monatlich, beendet'}
                            </span>
                          )}
                        </td>
                        <td className="right num">{money(x.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Receipts({ year, taxDeductible, currency }: { year: number; taxDeductible: boolean; currency: string }) {
  const data = useApi<{ donors: { email: string; name: string; total: number; count: number; has_address: boolean }[] }>(`/api/donations/donors?jahr=${year}`);
  return (
    <section className="card">
      <div className="card-head">
        <h2>Bestätigungen {year}</h2>
        <span className="xsmall muted">Pro Person alle Spenden des Jahres auf einer Seite – drucken oder als PDF sichern.</span>
      </div>
      {!taxDeductible && (
        <p className="form-section small muted">
          Tipp: Ist deine Organisation steuerbefreit, schalte unter «Einstellungen» die Spendenbestätigung ein. Dann können Spender:innen sie auch selbst abrufen.
        </p>
      )}
      {!data.data ? (
        <Skeleton />
      ) : !data.data.donors.length ? (
        <Empty title="Keine Spenden in diesem Jahr" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Person</th>
                <th className="right">Spenden</th>
                <th className="right">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.data.donors.map((x) => (
                <tr key={x.email}>
                  <td>
                    <div className="ellipsis">{x.name || x.email}</div>
                    <div className="xsmall muted ellipsis">
                      {x.email}
                      {!x.has_address && ' · ohne Adresse'}
                    </div>
                  </td>
                  <td className="right num">{x.count}</td>
                  <td className="right num">{formatMoney(x.total, currency)}</td>
                  <td className="right">
                    <a className="btn small" href={`/api/donations/receipt?jahr=${year}&email=${encodeURIComponent(x.email)}`} target="_blank" rel="noreferrer">
                      Bestätigung
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DonationSettings({ settings, onSaved }: { settings: Settings; onSaved: (s: Settings) => void }) {
  const toast = useToast();
  const [f, setF] = useState(settings);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(settings);
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.put<{ settings: Settings }>('/api/donations/settings', f);
      onSaved(r.settings);
      setF(r.settings);
      toast('Gespeichert.');
      return true;
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
      return false;
    } finally {
      setBusy(false);
    }
  };
  useLeaveGuard(dirty, save, () => setF(settings));
  return (
    <section className="card card-pad stack">
      <div className="grid-2">
        <Field label="Empfänger" help="Name auf Bestätigungen. Leer = Firmenname aus den Einstellungen.">
          <input className="input" value={f.recipient} maxLength={120} onChange={(e) => setF({ ...f, recipient: e.target.value })} />
        </Field>
        <Field label="IBAN für Überweisungen" help="Erscheint beim Spendenblock als Alternative.">
          <input className="input mono" value={f.iban} maxLength={40} placeholder="CH93 0076 2011 6238 5295 7" onChange={(e) => setF({ ...f, iban: e.target.value })} />
        </Field>
      </div>
      <Toggle
        checked={f.taxDeductible}
        onChange={(v) => setF({ ...f, taxDeductible: v })}
        label="Spenden sind steuerlich abzugsfähig"
        help="Dann können Spender:innen eine Bestätigung ausdrucken, und das Formular fragt (freiwillig) nach der Adresse."
      />
      {f.taxDeductible && (
        <Field label="Satz auf der Bestätigung" help="z. B. «Der Verein ist vom Kantonalen Steueramt Zürich als gemeinnützig anerkannt (Verfügung vom …).»">
          <textarea className="textarea" rows={3} value={f.receiptNote} maxLength={400} onChange={(e) => setF({ ...f, receiptNote: e.target.value })} />
        </Field>
      )}
      <div className="row">
        <button className="btn primary" disabled={!dirty || busy} data-busy={busy || undefined} onClick={() => void save()}>
          Speichern
        </button>
      </div>
    </section>
  );
}

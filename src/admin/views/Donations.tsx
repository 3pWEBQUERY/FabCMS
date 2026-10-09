import { Fragment, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { formatDate, useApi } from '../lib/hooks';
import { t } from '../lib/i18n';
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

/** Fills {placeholders} in a translated sentence with elements. */
const rich = (text: string, parts: Record<string, ReactNode>) => text.split(/\{(\w+)\}/).map((s, i) => (i % 2 ? <Fragment key={i}>{parts[s]}</Fragment> : s));

export function Donations() {
  const { query } = usePath();
  const tab = (query.get('tab') ?? 'spenden') as 'spenden' | 'bestaetigungen' | 'einstellungen';
  const year = Number(query.get('jahr')) || new Date().getFullYear();
  const data = useApi<Data>(`/api/donations?jahr=${year}`);
  const d = data.data;
  const go = (v: string, y = year) => navigate(`/spenden?tab=${v}&jahr=${y}`, { replace: true });
  const money = (c: number) => formatMoney(c, d?.currency ?? 'CHF');
  return (
    <div className="page">
      <PageHead
        back={
          <Link to="/inhalte" className="crumb">
            <Icon name="chevronLeft" size="s" /> {t('Inhalte')}
          </Link>
        }
        title={t('Spenden')}
        sub={
          d
            ? d.kpi.donors === 1
              ? t('{year}: {amount} von 1 Person', { year, amount: money(d.kpi.total) })
              : t('{year}: {amount} von {n} Personen', { year, amount: money(d.kpi.total), n: d.kpi.donors })
            : undefined
        }
        actions={
          <a className="btn" href={`/api/donations.csv?jahr=${year}`} download>
            <Icon name="download" size="s" /> CSV {year}
          </a>
        }
      />
      {d && !d.stripe && (
        <p className="hint" role="note" style={{ marginBottom: '1rem' }}>
          <span>
            {rich(t('Für Online-Spenden fehlt noch {key}. Bis dahin zeigt der Block «Spenden» die Bankverbindung aus den Einstellungen unten.'), {
              key: <span className="mono">STRIPE_SECRET_KEY</span>,
            })}
          </span>
        </p>
      )}
      <div className="toolbar">
        <Segmented
          label={t('Bereich')}
          value={tab}
          onChange={(v) => go(v)}
          options={[
            { value: 'spenden', label: t('Spenden') },
            { value: 'bestaetigungen', label: t('Jahresbestätigungen') },
            { value: 'einstellungen', label: t('Einstellungen') },
          ]}
        />
        {tab !== 'einstellungen' && d && d.years.length > 1 && (
          <Select label={t('Jahr')} value={String(year)} onChange={(v) => go(tab, Number(v))} options={d.years.map((y) => ({ value: String(y), label: String(y) }))} />
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
              <span className="label">{t('Gesammelt {year}', { year })}</span>
              <span className="value">{money(d.kpi.total)}</span>
              <span className="delta">{d.kpi.count === 1 ? t('1 Zahlung') : t('{n} Zahlungen', { n: d.kpi.count })}</span>
            </div>
            <div className="kpi">
              <span className="label">{t('Monatlich Spendende')}</span>
              <span className="value">{d.kpi.monthly}</span>
              <span className="delta">{t('{amount} pro Monat', { amount: money(d.kpi.monthlySum) })}</span>
            </div>
            {d.campaigns.slice(0, 2).map((c) => (
              <div className="kpi" key={c.campaign}>
                <span className="label">{c.campaign || t('Allgemein')}</span>
                <span className="value">{money(c.total)}</span>
                <span className="delta">{c.count === 1 ? t('1 Spende') : t('{n} Spenden', { n: c.count })}</span>
              </div>
            ))}
          </div>
          <section className="card">
            {!d.donations.length ? (
              <Empty title={t('Noch keine Spenden {year}', { year })}>
                {t('Füg den Block «Spenden» auf einer Seite ein. Jede Spende erscheint hier, mit Kampagne und Rhythmus.')}
              </Empty>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('Datum')}</th>
                      <th>{t('Von')}</th>
                      <th>{t('Für')}</th>
                      <th className="right">{t('Betrag')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.donations.map((x) => (
                      <tr key={x.id}>
                        <td>{formatDate(x.paid_at)}</td>
                        <td>
                          <div className="ellipsis">
                            {x.name || x.email} {x.anonymous && <span className="badge muted">{t('anonym')}</span>}
                          </div>
                          <div className="xsmall muted ellipsis">{x.email}</div>
                        </td>
                        <td className="small">
                          {x.campaign || <span className="faint">{t('Allgemein')}</span>}
                          {x.interval === 'month' && (
                            <span className={`badge ${x.subscription_active ? 'ok' : 'muted'}`} style={{ marginLeft: '.4rem' }}>
                              {x.parent_id ? t('Folgemonat') : x.subscription_active ? t('monatlich') : t('monatlich, beendet')}
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
        <h2>{t('Bestätigungen {year}', { year })}</h2>
        <span className="xsmall muted">{t('Pro Person alle Spenden des Jahres auf einer Seite – drucken oder als PDF sichern.')}</span>
      </div>
      {!taxDeductible && (
        <p className="form-section small muted">
          {t('Tipp: Ist deine Organisation steuerbefreit, schalte unter «Einstellungen» die Spendenbestätigung ein. Dann können Spender:innen sie auch selbst abrufen.')}
        </p>
      )}
      {!data.data ? (
        <Skeleton />
      ) : !data.data.donors.length ? (
        <Empty title={t('Keine Spenden in diesem Jahr')} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('Person')}</th>
                <th className="right">{t('Spenden')}</th>
                <th className="right">{t('Total')}</th>
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
                      {!x.has_address && ` · ${t('ohne Adresse')}`}
                    </div>
                  </td>
                  <td className="right num">{x.count}</td>
                  <td className="right num">{formatMoney(x.total, currency)}</td>
                  <td className="right">
                    <a className="btn small" href={`/api/donations/receipt?jahr=${year}&email=${encodeURIComponent(x.email)}`} target="_blank" rel="noreferrer">
                      {t('Bestätigung')}
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
      toast(t('Gespeichert.'));
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
        <Field label={t('Empfänger')} help={t('Name auf Bestätigungen. Leer = Firmenname aus den Einstellungen.')}>
          <input className="input" value={f.recipient} maxLength={120} onChange={(e) => setF({ ...f, recipient: e.target.value })} />
        </Field>
        <Field label={t('IBAN für Überweisungen')} help={t('Erscheint beim Spendenblock als Alternative.')}>
          <input className="input mono" value={f.iban} maxLength={40} placeholder="CH93 0076 2011 6238 5295 7" onChange={(e) => setF({ ...f, iban: e.target.value })} />
        </Field>
      </div>
      <Toggle
        checked={f.taxDeductible}
        onChange={(v) => setF({ ...f, taxDeductible: v })}
        label={t('Spenden sind steuerlich abzugsfähig')}
        help={t('Dann können Spender:innen eine Bestätigung ausdrucken, und das Formular fragt (freiwillig) nach der Adresse.')}
      />
      {f.taxDeductible && (
        <Field label={t('Satz auf der Bestätigung')} help={t('z. B. «Der Verein ist vom Kantonalen Steueramt Zürich als gemeinnützig anerkannt (Verfügung vom …).»')}>
          <textarea className="textarea" rows={3} value={f.receiptNote} maxLength={400} onChange={(e) => setF({ ...f, receiptNote: e.target.value })} />
        </Field>
      )}
      <div className="row">
        <button className="btn primary" disabled={!dirty || busy} data-busy={busy || undefined} onClick={() => void save()}>
          {t('Speichern')}
        </button>
      </div>
    </section>
  );
}

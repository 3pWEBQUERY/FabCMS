import { useState } from 'react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { DateInput, Dialog, Field, PageHead, Segmented, Select, Skeleton, Toggle, confirm } from '../ui/kit';
import { HoursEditor } from '../ui/HoursEditor';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/toast';
import { SaveBar, useSettingsDraft } from './settingsDraft';
import type { BookingResource, BookingService } from '../../shared/booking';
import type { OpeningHoursDay } from '../../shared/types';
import { formatPrice } from '../../shared/text';
import { adminLocale, t } from '../lib/i18n';

interface Setup {
  services: BookingService[];
  resources: BookingResource[];
  blocks: { id: string; resource_id: string | null; starts_at: string; ends_at: string; reason: string }[];
  feed: string;
  stripe: boolean;
}

const KIND_LABEL: Record<BookingResource['kind'], () => string> = { table: () => t('Tisch'), staff: () => t('Person'), room: () => t('Raum') };

export function BookingSettings() {
  const { draft, set, dirty, save, reset } = useSettingsDraft();
  const setup = useApi<Setup>('/api/booking/setup');
  const toast = useToast();
  const [service, setService] = useState<Partial<BookingService> | null>(null);
  const [resource, setResource] = useState<Partial<BookingResource> | null>(null);
  const [closure, setClosure] = useState<{ from: string; to: string; resource_id: string; reason: string } | null>(null);
  if (!draft) return <Skeleton />;
  const b = draft.booking;
  const setB = (patch: Partial<typeof b>) => set('booking', { ...b, ...patch });
  const table = b.mode === 'table';

  return (
    <>
      <PageHead title={t('Reservation & Termine')} sub={t('Was online gebucht werden kann, wann und bei wem. Freie Zeiten berechnet Nova aus den Öffnungszeiten.')} />
      <div className="card">
        <section className="form-section">
          <h2 className="section-title">{t('Art')}</h2>
          <Segmented
            label={t('Art der Buchung')}
            value={b.mode}
            onChange={(v) => setB({ mode: v })}
            options={[
              { value: 'table', label: t('Tische reservieren'), icon: 'dish' },
              { value: 'appointment', label: t('Termine buchen'), icon: 'calendar' },
            ]}
          />
          <p className="small muted">
            {table
              ? t('Gäste wählen Personenzahl, Tag und Uhrzeit. Nova setzt sie an den kleinsten freien Tisch, der passt.')
              : t('Kundinnen wählen Leistung, Tag und Uhrzeit. Nova trägt sie bei einer freien Person ein.')}
          </p>
        </section>

        <section className="form-section">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 className="section-title">{table ? t('Was reserviert wird') : t('Leistungen')}</h2>
            <button
              className="btn s"
              onClick={() =>
                setService({
                  name: table ? t('Tisch') : '',
                  duration_min: table ? 120 : 45,
                  buffer_min: table ? 0 : 10,
                  price: null,
                  deposit: 0,
                  resource_ids: [],
                  active: true,
                  description: '',
                })
              }
            >
              <Icon name="plus" size="s" /> {table ? t('Angebot') : t('Leistung')}
            </button>
          </div>
          {!setup.data ? (
            <Skeleton lines={2} />
          ) : setup.data.services.length === 0 ? (
            <p className="small muted">{table ? t('Zum Beispiel «Tisch» mit 2 Stunden Dauer.') : t('Zum Beispiel «Haarschnitt», 45 Minuten, 10 Minuten Pause danach.')}</p>
          ) : (
            <ul className="list bordered">
              {setup.data.services.map((s) => (
                <li key={s.id}>
                  <button className="list-item" onClick={() => setService(s)}>
                    <Icon name={table ? 'dish' : 'clock'} className="faint" />
                    <div className="grow">
                      <div className="title">
                        {s.name} {!s.active && <span className="badge">{t('pausiert')}</span>}
                      </div>
                      <div className="xsmall muted">
                        {[
                          t('{n} Min.', { n: s.duration_min }),
                          s.buffer_min ? t('+ {n} Min. Pause', { n: s.buffer_min }) : '',
                          s.price ? formatPrice(s.price) : '',
                          s.deposit ? t('Anzahlung {amount}', { amount: formatPrice(s.deposit) }) : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                    <Icon name="chevronRight" size="s" className="faint" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="form-section">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 className="section-title">{table ? t('Tische') : t('Bei wem gebucht werden kann')}</h2>
            <button className="btn s" onClick={() => setResource({ name: '', kind: table ? 'table' : 'staff', capacity: table ? 4 : 1, hours: null, ical_url: '', active: true })}>
              <Icon name="plus" size="s" /> {table ? t('Tisch') : t('Person')}
            </button>
          </div>
          {!setup.data ? (
            <Skeleton lines={2} />
          ) : setup.data.resources.length === 0 ? (
            <p className="small muted">
              {table
                ? t('Trag deine Tische mit der Anzahl Plätze ein, z. B. «Tisch 1» für 4.')
                : t('Trag die Personen ein, bei denen gebucht werden kann – mit eigenen Arbeitszeiten, falls sie nicht immer da sind.')}
            </p>
          ) : (
            <ul className="list bordered">
              {setup.data.resources.map((r) => (
                <li key={r.id}>
                  <button className="list-item" onClick={() => setResource(r)}>
                    <Icon name={r.kind === 'staff' ? 'user' : 'grid'} className="faint" />
                    <div className="grow">
                      <div className="title">
                        {r.name} {!r.active && <span className="badge">{t('pausiert')}</span>}
                      </div>
                      <div className="xsmall muted">
                        {[
                          r.kind === 'staff' ? KIND_LABEL.staff() : t('{kind} für {n}', { kind: KIND_LABEL[r.kind](), n: r.capacity }),
                          r.hours ? t('eigene Zeiten') : t('Öffnungszeiten'),
                          r.ical_url ? t('Kalender verbunden') : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                    <Icon name="chevronRight" size="s" className="faint" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="form-section">
          <h2 className="section-title">{t('Regeln')}</h2>
          <div className="grid-2">
            <Field label={t('Zeiten im Abstand von')}>
              <Select
                value={String(b.slotStep)}
                onChange={(v) => setB({ slotStep: Number(v) })}
                options={[10, 15, 20, 30, 60].map((n) => ({ value: String(n), label: t('{n} Minuten', { n }) }))}
              />
            </Field>
            <Field label={t('Frühestens buchbar')}>
              <Select
                value={String(b.leadMinutes)}
                onChange={(v) => setB({ leadMinutes: Number(v) })}
                options={[
                  [0, t('sofort')],
                  [60, t('1 Stunde vorher')],
                  [120, t('{n} Stunden vorher', { n: 2 })],
                  [240, t('{n} Stunden vorher', { n: 4 })],
                  [1440, t('am Vortag')],
                  [2880, t('{n} Tage vorher', { n: 2 })],
                ].map(([v, l]) => ({ value: String(v), label: String(l) }))}
              />
            </Field>
            <Field label={t('Wie weit im Voraus')} help={t('In Tagen.')}>
              <input className="input num" type="number" min={1} max={730} value={b.horizonDays} onChange={(e) => setB({ horizonDays: Number(e.target.value) || 1 })} />
            </Field>
            {table && (
              <Field label={t('Höchstens Personen online')} help={t('Grössere Gruppen rufen an.')}>
                <input className="input num" type="number" min={1} max={99} value={b.maxParty} onChange={(e) => setB({ maxParty: Number(e.target.value) || 1 })} />
              </Field>
            )}
            <Field label={t('Erinnerung per E-Mail')}>
              <Select
                value={String(b.reminderHours)}
                onChange={(v) => setB({ reminderHours: Number(v) })}
                options={[
                  [0, t('keine')],
                  [3, t('{n} Stunden vorher', { n: 3 })],
                  [24, t('am Vortag')],
                  [48, t('{n} Tage vorher', { n: 2 })],
                ].map(([v, l]) => ({ value: String(v), label: String(l) }))}
              />
            </Field>
            <Field label={t('Selbst absagen bis')} help={t('Später nur noch telefonisch.')}>
              <Select
                value={String(b.cancelHours)}
                onChange={(v) => setB({ cancelHours: Number(v) })}
                options={[
                  [0, t('bis zum Beginn')],
                  [2, t('{n} Stunden vorher', { n: 2 })],
                  [4, t('{n} Stunden vorher', { n: 4 })],
                  [24, t('1 Tag vorher')],
                  [48, t('{n} Tage vorher', { n: 2 })],
                ].map(([v, l]) => ({ value: String(v), label: String(l) }))}
              />
            </Field>
            <Field label={t('Benachrichtigung an')} help={t('Leer = E-Mail aus «Name, Logo & Kontakt».')}>
              <input className="input" type="email" value={b.notifyEmail} onChange={(e) => setB({ notifyEmail: e.target.value })} />
            </Field>
          </div>
          <Toggle
            checked={b.autoConfirm}
            onChange={(v) => setB({ autoConfirm: v })}
            label={t('Sofort bestätigen')}
            help={t('Aus: Buchungen kommen als Anfrage, und du bestätigst sie von Hand.')}
          />
        </section>

        <section className="form-section">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 className="section-title">{t('Geschlossen')}</h2>
            <button className="btn s" onClick={() => setClosure({ from: '', to: '', resource_id: '', reason: '' })}>
              <Icon name="plus" size="s" /> {t('Sperrzeit')}
            </button>
          </div>
          <p className="small muted">{t('Ferien, ein geschlossener Anlass oder ein freier Tag einer Person.')}</p>
          {setup.data?.blocks.length ? (
            <ul className="list bordered">
              {setup.data.blocks.map((x) => (
                <li key={x.id} className="list-item">
                  <Icon name="lock" className="faint" />
                  <div className="grow">
                    <div className="title">{x.reason || t('Gesperrt')}</div>
                    <div className="xsmall muted">
                      {new Date(x.starts_at).toLocaleDateString(adminLocale())} – {new Date(new Date(x.ends_at).getTime() - 1).toLocaleDateString(adminLocale())}
                      {x.resource_id ? ` · ${setup.data!.resources.find((r) => r.id === x.resource_id)?.name ?? ''}` : ` · ${t('alles')}`}
                    </div>
                  </div>
                  <button
                    className="btn ghost s icon-only"
                    aria-label={t('Sperrzeit entfernen')}
                    onClick={async () => {
                      await api.del(`/api/booking/blocks/${x.id}`);
                      void setup.reload();
                    }}
                  >
                    <Icon name="trash" size="s" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {setup.data && (
          <section className="form-section">
            <h2 className="section-title">{t('Im eigenen Kalender sehen')}</h2>
            <p className="small muted">
              {t(
                'Abonniere diese Adresse in Google Kalender («Über URL hinzufügen»), Apple Kalender oder Outlook. Neue Reservationen erscheinen dort automatisch. Die Adresse ist geheim – gib sie nur dem Team.',
              )}
            </p>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input className="input mono grow" readOnly value={setup.data.feed} onFocus={(e) => e.target.select()} aria-label={t('Kalender-Adresse')} />
              <button
                className="btn"
                onClick={async () => {
                  await navigator.clipboard.writeText(setup.data!.feed);
                  toast(t('Kalender-Adresse kopiert.'));
                }}
              >
                <Icon name="copy" size="s" /> {t('Kopieren')}
              </button>
            </div>
          </section>
        )}
      </div>
      <SaveBar dirty={dirty} onSave={save} onReset={reset} />

      {service && setup.data && (
        <ServiceDialog
          service={service}
          table={table}
          resources={setup.data.resources}
          stripe={setup.data.stripe}
          onClose={() => setService(null)}
          onSaved={() => {
            setService(null);
            void setup.reload();
          }}
        />
      )}
      {resource && (
        <ResourceDialog
          resource={resource}
          businessHours={draft.hours}
          onClose={() => setResource(null)}
          onSaved={() => {
            setResource(null);
            void setup.reload();
          }}
        />
      )}
      {closure && setup.data && (
        <Dialog open onOpenChange={(o) => !o && setClosure(null)} title={t('Sperrzeit eintragen')} description={t('In dieser Zeit kann online nichts gebucht werden.')}>
          <div className="stack">
            <div className="row wrap" style={{ gap: '.75rem' }}>
              <Field label={t('Von')}>
                <DateInput value={closure.from} onChange={(v) => setClosure({ ...closure, from: v, to: closure.to && closure.to >= v ? closure.to : v })} />
              </Field>
              <Field label={t('Bis und mit')}>
                <DateInput value={closure.to} min={closure.from || undefined} onChange={(v) => setClosure({ ...closure, to: v })} />
              </Field>
            </div>
            <Field label={t('Für')}>
              <Select
                value={closure.resource_id}
                onChange={(v) => setClosure({ ...closure, resource_id: v })}
                options={[{ value: '', label: t('Alles (Betrieb geschlossen)') }, ...setup.data.resources.map((r) => ({ value: r.id, label: r.name }))]}
              />
            </Field>
            <Field label={t('Grund')} help={t('Nur für dich, z. B. «Betriebsferien».')}>
              <input className="input" value={closure.reason} onChange={(e) => setClosure({ ...closure, reason: e.target.value })} />
            </Field>
            <div className="dialog-actions">
              <button className="btn ghost" onClick={() => setClosure(null)}>
                {t('Abbrechen')}
              </button>
              <button
                className="btn primary"
                disabled={!closure.from || !closure.to}
                onClick={async () => {
                  try {
                    await api.post('/api/booking/blocks', { ...closure, resource_id: closure.resource_id || null });
                    setClosure(null);
                    void setup.reload();
                  } catch (e) {
                    toast((e as Error).message, { kind: 'bad' });
                  }
                }}
              >
                {t('Eintragen')}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}

const chf = (cents: number | null) => (cents == null ? '' : (cents / 100).toFixed(2).replace(/\.00$/, ''));
const cents = (v: string) => (v.trim() === '' ? null : Math.round(Number(v.replace(',', '.')) * 100));

function ServiceDialog({
  service,
  table,
  resources,
  stripe,
  onClose,
  onSaved,
}: {
  service: Partial<BookingService>;
  table: boolean;
  resources: BookingResource[];
  stripe: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState({ ...service, priceText: chf(service.price ?? null), depositText: chf(service.deposit ?? 0) || '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const body = {
        name: f.name,
        description: f.description ?? '',
        duration_min: f.duration_min,
        buffer_min: f.buffer_min ?? 0,
        price: cents(f.priceText),
        deposit: cents(f.depositText) ?? 0,
        resource_ids: f.resource_ids ?? [],
        active: f.active ?? true,
        sort_index: f.sort_index ?? 0,
      };
      if (service.id) await api.put(`/api/booking/services/${service.id}`, body);
      else await api.post('/api/booking/services', body);
      onSaved();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={service.id ? (f.name ?? '') : table ? t('Neues Angebot') : t('Neue Leistung')}>
      <div className="stack">
        <Field label={t('Name')}>
          <input className="input" value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus placeholder={table ? t('Tisch') : t('Haarschnitt')} />
        </Field>
        {!table && (
          <Field label={t('Beschreibung')} help={t('Erscheint bei der Auswahl.')}>
            <input className="input" value={f.description ?? ''} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>
        )}
        <div className="grid-2">
          <Field label={t('Dauer (Minuten)')} help={table ? t('Wie lange der Tisch belegt ist.') : undefined}>
            <input className="input num" type="number" min={5} step={5} value={f.duration_min ?? 60} onChange={(e) => setF({ ...f, duration_min: Number(e.target.value) || 5 })} />
          </Field>
          <Field label={t('Pause danach (Minuten)')} help={t('Zum Aufräumen oder Vorbereiten.')}>
            <input className="input num" type="number" min={0} step={5} value={f.buffer_min ?? 0} onChange={(e) => setF({ ...f, buffer_min: Number(e.target.value) || 0 })} />
          </Field>
          {!table && (
            <Field label={t('Preis (CHF)')} help={t('Wird nur angezeigt.')}>
              <input className="input num" inputMode="decimal" value={f.priceText} onChange={(e) => setF({ ...f, priceText: e.target.value })} placeholder={t('ohne')} />
            </Field>
          )}
          <Field label={t('Anzahlung online (CHF)')} help={stripe ? t('Bezahlt beim Buchen über Stripe.') : t('Braucht Stripe (Einstellungen → Shop).')}>
            <input
              className="input num"
              inputMode="decimal"
              value={f.depositText}
              disabled={!stripe}
              onChange={(e) => setF({ ...f, depositText: e.target.value })}
              placeholder={t('keine')}
            />
          </Field>
        </div>
        {resources.length > 0 && (
          <Field label={table ? t('Nur an diesen Tischen') : t('Nur bei')} help={t('Keine Auswahl = überall.')}>
            <div className="chips">
              {resources.map((r) => {
                const on = (f.resource_ids ?? []).includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    className="chip"
                    aria-pressed={on}
                    onClick={() => setF({ ...f, resource_ids: on ? (f.resource_ids ?? []).filter((x) => x !== r.id) : [...(f.resource_ids ?? []), r.id] })}
                  >
                    {r.name}
                  </button>
                );
              })}
            </div>
          </Field>
        )}
        <Toggle checked={f.active ?? true} onChange={(v) => setF({ ...f, active: v })} label={t('Online buchbar')} />
        <div className="dialog-actions">
          {service.id && (
            <button
              className="btn ghost danger-text"
              style={{ marginRight: 'auto' }}
              onClick={async () => {
                if (
                  !(await confirm({
                    title: t('«{name}» löschen?', { name: f.name ?? '' }),
                    message: t('Bestehende Reservationen bleiben erhalten.'),
                    confirm: t('Löschen'),
                    danger: true,
                  }))
                )
                  return;
                await api.del(`/api/booking/services/${service.id}`);
                onSaved();
              }}
            >
              {t('Löschen')}
            </button>
          )}
          <button className="btn ghost" onClick={onClose}>
            {t('Abbrechen')}
          </button>
          <button className="btn primary" disabled={!f.name} aria-busy={busy || undefined} onClick={save}>
            {t('Speichern')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function ResourceDialog({
  resource,
  businessHours,
  onClose,
  onSaved,
}: {
  resource: Partial<BookingResource>;
  businessHours: OpeningHoursDay[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState(resource);
  const [busy, setBusy] = useState(false);
  const staff = f.kind === 'staff';
  const save = async () => {
    setBusy(true);
    try {
      const body = {
        name: f.name,
        kind: f.kind,
        capacity: f.capacity ?? 1,
        hours: f.hours ?? null,
        ical_url: f.ical_url ?? '',
        active: f.active ?? true,
        sort_index: f.sort_index ?? 0,
      };
      if (resource.id) await api.put(`/api/booking/resources/${resource.id}`, body);
      else await api.post('/api/booking/resources', body);
      onSaved();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={resource.id ? (f.name ?? '') : staff ? t('Neue Person') : t('Neuer Tisch')} wide>
      <div className="stack">
        <div className="grid-2">
          <Field label={t('Name')}>
            <input className="input" value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus placeholder={staff ? 'Lea' : t('Tisch 4')} />
          </Field>
          <Field label={t('Art')}>
            <Select
              value={f.kind ?? 'table'}
              onChange={(v) => setF({ ...f, kind: v as BookingResource['kind'] })}
              options={[
                { value: 'table', label: t('Tisch') },
                { value: 'room', label: t('Raum') },
                { value: 'staff', label: t('Person') },
              ]}
            />
          </Field>
          {!staff && (
            <Field label={t('Plätze')}>
              <input className="input num" type="number" min={1} max={500} value={f.capacity ?? 2} onChange={(e) => setF({ ...f, capacity: Number(e.target.value) || 1 })} />
            </Field>
          )}
        </div>
        <Toggle
          checked={Boolean(f.hours)}
          onChange={(v) => setF({ ...f, hours: v ? structuredClone(businessHours) : null })}
          label={t('Eigene Zeiten')}
          help={staff ? t('Wenn die Person nicht während aller Öffnungszeiten da ist.') : t('Zum Beispiel eine Terrasse, die nur abends offen ist.')}
        />
        {f.hours && <HoursEditor hours={f.hours} onChange={(h) => setF({ ...f, hours: h })} />}
        <Field
          label={t('Belegte Zeiten aus einem Kalender')}
          help={t('iCal-Adresse, z. B. aus Google Kalender («Privatadresse im iCal-Format»). Termine dort sind hier nicht buchbar; alle 15 Minuten aktualisiert.')}
        >
          <input className="input mono" value={f.ical_url ?? ''} onChange={(e) => setF({ ...f, ical_url: e.target.value })} placeholder="https://calendar.google.com/…/basic.ics" />
        </Field>
        <Toggle checked={f.active ?? true} onChange={(v) => setF({ ...f, active: v })} label={t('Online buchbar')} />
        <div className="dialog-actions">
          {resource.id && (
            <button
              className="btn ghost danger-text"
              style={{ marginRight: 'auto' }}
              onClick={async () => {
                if (
                  !(await confirm({
                    title: t('«{name}» löschen?', { name: f.name ?? '' }),
                    message: t('Reservationen darauf bleiben bestehen, aber ohne Zuordnung.'),
                    confirm: t('Löschen'),
                    danger: true,
                  }))
                )
                  return;
                await api.del(`/api/booking/resources/${resource.id}`);
                onSaved();
              }}
            >
              {t('Löschen')}
            </button>
          )}
          <button className="btn ghost" onClick={onClose}>
            {t('Abbrechen')}
          </button>
          <button className="btn primary" disabled={!f.name} aria-busy={busy || undefined} onClick={save}>
            {t('Speichern')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

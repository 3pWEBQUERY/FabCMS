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

interface Setup {
  services: BookingService[];
  resources: BookingResource[];
  blocks: { id: string; resource_id: string | null; starts_at: string; ends_at: string; reason: string }[];
  feed: string;
  stripe: boolean;
}

const KIND_LABEL: Record<BookingResource['kind'], string> = { table: 'Tisch', staff: 'Person', room: 'Raum' };

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
      <PageHead title="Reservation & Termine" sub="Was online gebucht werden kann, wann und bei wem. Freie Zeiten berechnet Nova aus den Öffnungszeiten." />
      <div className="card">
        <section className="form-section">
          <h2 className="section-title">Art</h2>
          <Segmented
            label="Art der Buchung"
            value={b.mode}
            onChange={(v) => setB({ mode: v })}
            options={[
              { value: 'table', label: 'Tische reservieren', icon: 'dish' },
              { value: 'appointment', label: 'Termine buchen', icon: 'calendar' },
            ]}
          />
          <p className="small muted">{table ? 'Gäste wählen Personenzahl, Tag und Uhrzeit. Nova setzt sie an den kleinsten freien Tisch, der passt.' : 'Kundinnen wählen Leistung, Tag und Uhrzeit. Nova trägt sie bei einer freien Person ein.'}</p>
        </section>

        <section className="form-section">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 className="section-title">{table ? 'Was reserviert wird' : 'Leistungen'}</h2>
            <button className="btn s" onClick={() => setService({ name: table ? 'Tisch' : '', duration_min: table ? 120 : 45, buffer_min: table ? 0 : 10, price: null, deposit: 0, resource_ids: [], active: true, description: '' })}>
              <Icon name="plus" size="s" /> {table ? 'Angebot' : 'Leistung'}
            </button>
          </div>
          {!setup.data ? (
            <Skeleton lines={2} />
          ) : setup.data.services.length === 0 ? (
            <p className="small muted">{table ? 'Zum Beispiel «Tisch» mit 2 Stunden Dauer.' : 'Zum Beispiel «Haarschnitt», 45 Minuten, 10 Minuten Pause danach.'}</p>
          ) : (
            <ul className="list bordered">
              {setup.data.services.map((s) => (
                <li key={s.id}>
                  <button className="list-item" onClick={() => setService(s)}>
                    <Icon name={table ? 'dish' : 'clock'} className="faint" />
                    <div className="grow">
                      <div className="title">
                        {s.name} {!s.active && <span className="badge">pausiert</span>}
                      </div>
                      <div className="xsmall muted">{[`${s.duration_min} Min.`, s.buffer_min ? `+ ${s.buffer_min} Min. Pause` : '', s.price ? formatPrice(s.price) : '', s.deposit ? `Anzahlung ${formatPrice(s.deposit)}` : ''].filter(Boolean).join(' · ')}</div>
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
            <h2 className="section-title">{table ? 'Tische' : 'Bei wem gebucht werden kann'}</h2>
            <button className="btn s" onClick={() => setResource({ name: '', kind: table ? 'table' : 'staff', capacity: table ? 4 : 1, hours: null, ical_url: '', active: true })}>
              <Icon name="plus" size="s" /> {table ? 'Tisch' : 'Person'}
            </button>
          </div>
          {!setup.data ? (
            <Skeleton lines={2} />
          ) : setup.data.resources.length === 0 ? (
            <p className="small muted">{table ? 'Trag deine Tische mit der Anzahl Plätze ein, z. B. «Tisch 1» für 4.' : 'Trag die Personen ein, bei denen gebucht werden kann – mit eigenen Arbeitszeiten, falls sie nicht immer da sind.'}</p>
          ) : (
            <ul className="list bordered">
              {setup.data.resources.map((r) => (
                <li key={r.id}>
                  <button className="list-item" onClick={() => setResource(r)}>
                    <Icon name={r.kind === 'staff' ? 'user' : 'grid'} className="faint" />
                    <div className="grow">
                      <div className="title">
                        {r.name} {!r.active && <span className="badge">pausiert</span>}
                      </div>
                      <div className="xsmall muted">
                        {[r.kind === 'staff' ? KIND_LABEL.staff : `${KIND_LABEL[r.kind]} für ${r.capacity}`, r.hours ? 'eigene Zeiten' : 'Öffnungszeiten', r.ical_url ? 'Kalender verbunden' : ''].filter(Boolean).join(' · ')}
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
          <h2 className="section-title">Regeln</h2>
          <div className="grid-2">
            <Field label="Zeiten im Abstand von">
              <Select value={String(b.slotStep)} onChange={(v) => setB({ slotStep: Number(v) })} options={[10, 15, 20, 30, 60].map((n) => ({ value: String(n), label: `${n} Minuten` }))} />
            </Field>
            <Field label="Frühestens buchbar">
              <Select
                value={String(b.leadMinutes)}
                onChange={(v) => setB({ leadMinutes: Number(v) })}
                options={[
                  [0, 'sofort'],
                  [60, '1 Stunde vorher'],
                  [120, '2 Stunden vorher'],
                  [240, '4 Stunden vorher'],
                  [1440, 'am Vortag'],
                  [2880, '2 Tage vorher'],
                ].map(([v, l]) => ({ value: String(v), label: String(l) }))}
              />
            </Field>
            <Field label="Wie weit im Voraus" help="In Tagen.">
              <input className="input num" type="number" min={1} max={730} value={b.horizonDays} onChange={(e) => setB({ horizonDays: Number(e.target.value) || 1 })} />
            </Field>
            {table && (
              <Field label="Höchstens Personen online" help="Grössere Gruppen rufen an.">
                <input className="input num" type="number" min={1} max={99} value={b.maxParty} onChange={(e) => setB({ maxParty: Number(e.target.value) || 1 })} />
              </Field>
            )}
            <Field label="Erinnerung per E-Mail">
              <Select
                value={String(b.reminderHours)}
                onChange={(v) => setB({ reminderHours: Number(v) })}
                options={[
                  [0, 'keine'],
                  [3, '3 Stunden vorher'],
                  [24, 'am Vortag'],
                  [48, '2 Tage vorher'],
                ].map(([v, l]) => ({ value: String(v), label: String(l) }))}
              />
            </Field>
            <Field label="Selbst absagen bis" help="Später nur noch telefonisch.">
              <Select
                value={String(b.cancelHours)}
                onChange={(v) => setB({ cancelHours: Number(v) })}
                options={[
                  [0, 'bis zum Beginn'],
                  [2, '2 Stunden vorher'],
                  [4, '4 Stunden vorher'],
                  [24, '1 Tag vorher'],
                  [48, '2 Tage vorher'],
                ].map(([v, l]) => ({ value: String(v), label: String(l) }))}
              />
            </Field>
            <Field label="Benachrichtigung an" help="Leer = E-Mail aus «Name, Logo & Kontakt».">
              <input className="input" type="email" value={b.notifyEmail} onChange={(e) => setB({ notifyEmail: e.target.value })} />
            </Field>
          </div>
          <Toggle checked={b.autoConfirm} onChange={(v) => setB({ autoConfirm: v })} label="Sofort bestätigen" help="Aus: Buchungen kommen als Anfrage, und du bestätigst sie von Hand." />
        </section>

        <section className="form-section">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 className="section-title">Geschlossen</h2>
            <button className="btn s" onClick={() => setClosure({ from: '', to: '', resource_id: '', reason: '' })}>
              <Icon name="plus" size="s" /> Sperrzeit
            </button>
          </div>
          <p className="small muted">Ferien, ein geschlossener Anlass oder ein freier Tag einer Person.</p>
          {setup.data?.blocks.length ? (
            <ul className="list bordered">
              {setup.data.blocks.map((x) => (
                <li key={x.id} className="list-item">
                  <Icon name="lock" className="faint" />
                  <div className="grow">
                    <div className="title">{x.reason || 'Gesperrt'}</div>
                    <div className="xsmall muted">
                      {new Date(x.starts_at).toLocaleDateString('de-CH')} – {new Date(new Date(x.ends_at).getTime() - 1).toLocaleDateString('de-CH')}
                      {x.resource_id ? ` · ${setup.data!.resources.find((r) => r.id === x.resource_id)?.name ?? ''}` : ' · alles'}
                    </div>
                  </div>
                  <button
                    className="btn ghost s icon-only"
                    aria-label="Sperrzeit entfernen"
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
            <h2 className="section-title">Im eigenen Kalender sehen</h2>
            <p className="small muted">Abonniere diese Adresse in Google Kalender («Über URL hinzufügen»), Apple Kalender oder Outlook. Neue Reservationen erscheinen dort automatisch. Die Adresse ist geheim – gib sie nur dem Team.</p>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input className="input mono grow" readOnly value={setup.data.feed} onFocus={(e) => e.target.select()} aria-label="Kalender-Adresse" />
              <button
                className="btn"
                onClick={async () => {
                  await navigator.clipboard.writeText(setup.data!.feed);
                  toast('Kalender-Adresse kopiert.');
                }}
              >
                <Icon name="copy" size="s" /> Kopieren
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
        <Dialog open onOpenChange={(o) => !o && setClosure(null)} title="Sperrzeit eintragen" description="In dieser Zeit kann online nichts gebucht werden.">
          <div className="stack">
            <div className="row wrap" style={{ gap: '.75rem' }}>
              <Field label="Von">
                <DateInput value={closure.from} onChange={(v) => setClosure({ ...closure, from: v, to: closure.to && closure.to >= v ? closure.to : v })} />
              </Field>
              <Field label="Bis und mit">
                <DateInput value={closure.to} min={closure.from || undefined} onChange={(v) => setClosure({ ...closure, to: v })} />
              </Field>
            </div>
            <Field label="Für">
              <Select value={closure.resource_id} onChange={(v) => setClosure({ ...closure, resource_id: v })} options={[{ value: '', label: 'Alles (Betrieb geschlossen)' }, ...setup.data.resources.map((r) => ({ value: r.id, label: r.name }))]} />
            </Field>
            <Field label="Grund" help="Nur für dich, z. B. «Betriebsferien».">
              <input className="input" value={closure.reason} onChange={(e) => setClosure({ ...closure, reason: e.target.value })} />
            </Field>
            <div className="dialog-actions">
              <button className="btn ghost" onClick={() => setClosure(null)}>
                Abbrechen
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
                Eintragen
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

function ServiceDialog({ service, table, resources, stripe, onClose, onSaved }: { service: Partial<BookingService>; table: boolean; resources: BookingResource[]; stripe: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ ...service, priceText: chf(service.price ?? null), depositText: chf(service.deposit ?? 0) || '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const body = { name: f.name, description: f.description ?? '', duration_min: f.duration_min, buffer_min: f.buffer_min ?? 0, price: cents(f.priceText), deposit: cents(f.depositText) ?? 0, resource_ids: f.resource_ids ?? [], active: f.active ?? true, sort_index: f.sort_index ?? 0 };
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
    <Dialog open onOpenChange={(o) => !o && onClose()} title={service.id ? (f.name ?? '') : table ? 'Neues Angebot' : 'Neue Leistung'}>
      <div className="stack">
        <Field label="Name">
          <input className="input" value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus placeholder={table ? 'Tisch' : 'Haarschnitt'} />
        </Field>
        {!table && (
          <Field label="Beschreibung" help="Erscheint bei der Auswahl.">
            <input className="input" value={f.description ?? ''} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>
        )}
        <div className="grid-2">
          <Field label="Dauer (Minuten)" help={table ? 'Wie lange der Tisch belegt ist.' : undefined}>
            <input className="input num" type="number" min={5} step={5} value={f.duration_min ?? 60} onChange={(e) => setF({ ...f, duration_min: Number(e.target.value) || 5 })} />
          </Field>
          <Field label="Pause danach (Minuten)" help="Zum Aufräumen oder Vorbereiten.">
            <input className="input num" type="number" min={0} step={5} value={f.buffer_min ?? 0} onChange={(e) => setF({ ...f, buffer_min: Number(e.target.value) || 0 })} />
          </Field>
          {!table && (
            <Field label="Preis (CHF)" help="Wird nur angezeigt.">
              <input className="input num" inputMode="decimal" value={f.priceText} onChange={(e) => setF({ ...f, priceText: e.target.value })} placeholder="ohne" />
            </Field>
          )}
          <Field label="Anzahlung online (CHF)" help={stripe ? 'Bezahlt beim Buchen über Stripe.' : 'Braucht Stripe (Einstellungen → Shop).'}>
            <input className="input num" inputMode="decimal" value={f.depositText} disabled={!stripe} onChange={(e) => setF({ ...f, depositText: e.target.value })} placeholder="keine" />
          </Field>
        </div>
        {resources.length > 0 && (
          <Field label={table ? 'Nur an diesen Tischen' : 'Nur bei'} help="Keine Auswahl = überall.">
            <div className="chips">
              {resources.map((r) => {
                const on = (f.resource_ids ?? []).includes(r.id);
                return (
                  <button key={r.id} type="button" className="chip" aria-pressed={on} onClick={() => setF({ ...f, resource_ids: on ? (f.resource_ids ?? []).filter((x) => x !== r.id) : [...(f.resource_ids ?? []), r.id] })}>
                    {r.name}
                  </button>
                );
              })}
            </div>
          </Field>
        )}
        <Toggle checked={f.active ?? true} onChange={(v) => setF({ ...f, active: v })} label="Online buchbar" />
        <div className="dialog-actions">
          {service.id && (
            <button
              className="btn ghost danger-text"
              style={{ marginRight: 'auto' }}
              onClick={async () => {
                if (!(await confirm({ title: `«${f.name}» löschen?`, message: 'Bestehende Reservationen bleiben erhalten.', confirm: 'Löschen', danger: true }))) return;
                await api.del(`/api/booking/services/${service.id}`);
                onSaved();
              }}
            >
              Löschen
            </button>
          )}
          <button className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" disabled={!f.name} aria-busy={busy || undefined} onClick={save}>
            Speichern
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function ResourceDialog({ resource, businessHours, onClose, onSaved }: { resource: Partial<BookingResource>; businessHours: OpeningHoursDay[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState(resource);
  const [busy, setBusy] = useState(false);
  const staff = f.kind === 'staff';
  const save = async () => {
    setBusy(true);
    try {
      const body = { name: f.name, kind: f.kind, capacity: f.capacity ?? 1, hours: f.hours ?? null, ical_url: f.ical_url ?? '', active: f.active ?? true, sort_index: f.sort_index ?? 0 };
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
    <Dialog open onOpenChange={(o) => !o && onClose()} title={resource.id ? (f.name ?? '') : staff ? 'Neue Person' : 'Neuer Tisch'} wide>
      <div className="stack">
        <div className="grid-2">
          <Field label="Name">
            <input className="input" value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus placeholder={staff ? 'Lea' : 'Tisch 4'} />
          </Field>
          <Field label="Art">
            <Select
              value={f.kind ?? 'table'}
              onChange={(v) => setF({ ...f, kind: v as BookingResource['kind'] })}
              options={[
                { value: 'table', label: 'Tisch' },
                { value: 'room', label: 'Raum' },
                { value: 'staff', label: 'Person' },
              ]}
            />
          </Field>
          {!staff && (
            <Field label="Plätze">
              <input className="input num" type="number" min={1} max={500} value={f.capacity ?? 2} onChange={(e) => setF({ ...f, capacity: Number(e.target.value) || 1 })} />
            </Field>
          )}
        </div>
        <Toggle checked={Boolean(f.hours)} onChange={(v) => setF({ ...f, hours: v ? structuredClone(businessHours) : null })} label="Eigene Zeiten" help={staff ? 'Wenn die Person nicht während aller Öffnungszeiten da ist.' : 'Zum Beispiel eine Terrasse, die nur abends offen ist.'} />
        {f.hours && <HoursEditor hours={f.hours} onChange={(h) => setF({ ...f, hours: h })} />}
        <Field label="Belegte Zeiten aus einem Kalender" help="iCal-Adresse, z. B. aus Google Kalender («Privatadresse im iCal-Format»). Termine dort sind hier nicht buchbar; alle 15 Minuten aktualisiert.">
          <input className="input mono" value={f.ical_url ?? ''} onChange={(e) => setF({ ...f, ical_url: e.target.value })} placeholder="https://calendar.google.com/…/basic.ics" />
        </Field>
        <Toggle checked={f.active ?? true} onChange={(v) => setF({ ...f, active: v })} label="Online buchbar" />
        <div className="dialog-actions">
          {resource.id && (
            <button
              className="btn ghost danger-text"
              style={{ marginRight: 'auto' }}
              onClick={async () => {
                if (!(await confirm({ title: `«${f.name}» löschen?`, message: 'Reservationen darauf bleiben bestehen, aber ohne Zuordnung.', confirm: 'Löschen', danger: true }))) return;
                await api.del(`/api/booking/resources/${resource.id}`);
                onSaved();
              }}
            >
              Löschen
            </button>
          )}
          <button className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" disabled={!f.name} aria-busy={busy || undefined} onClick={save}>
            Speichern
          </button>
        </div>
      </div>
    </Dialog>
  );
}

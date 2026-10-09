import { useState } from 'react';
import { api } from '../lib/api';
import { useApi, formatDate } from '../lib/hooks';
import { useSession } from '../lib/session';
import { Dialog, Field, PageHead } from '../ui/kit';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/toast';
import { ROLE_LABELS } from '../../shared/roles';

export function Account() {
  const { user, updateUser } = useSession();
  const toast = useToast();
  const sessions = useApi<{ sessions: { id: string; user_agent: string; ip: string; last_seen_at: string; current: boolean }[] }>('/api/me/sessions');
  const [name, setName] = useState(user.name);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [totp, setTotp] = useState<{ secret: string; svg: string } | null>(null);
  const [code, setCode] = useState('');
  const [disable, setDisable] = useState(false);
  const [disablePw, setDisablePw] = useState('');

  const device = (ua: string) => {
    const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Unbekannt';
    const br = /Edg\//.test(ua) ? 'Edge' : /Firefox/.test(ua) ? 'Firefox' : /Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : '';
    return `${br} auf ${os}`;
  };

  return (
    <div className="page narrow">
      <PageHead title="Mein Konto" sub={`${user.email} · ${ROLE_LABELS[user.role].name}`} />
      <div className="stack loose">
        <section className="card form-section">
          <Field label="Name" htmlFor="a-name">
            <div className="row">
              <input id="a-name" className="input grow" value={name} onChange={(e) => setName(e.target.value)} />
              <button
                className="btn"
                disabled={name === user.name || !name.trim()}
                onClick={async () => {
                  await api.patch('/api/me', { name });
                  updateUser({ name });
                  toast('Gespeichert.');
                }}
              >
                Speichern
              </button>
            </div>
          </Field>
        </section>
        <section className="card form-section">
          <header>
            <h2>Passwort ändern</h2>
            <p>Danach werden alle anderen Geräte abgemeldet.</p>
          </header>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api.patch('/api/me', { currentPassword: pw.current, newPassword: pw.next });
                setPw({ current: '', next: '' });
                toast('Passwort geändert.');
                void sessions.reload();
              } catch (err) {
                toast((err as Error).message, { kind: 'bad' });
              }
            }}
          >
            <div className="grid-2">
              <Field label="Aktuelles Passwort">
                <input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
              </Field>
              <Field label="Neues Passwort" help="Mindestens 10 Zeichen.">
                <input className="input" type="password" autoComplete="new-password" minLength={10} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
              </Field>
            </div>
            <button className="btn" style={{ justifySelf: 'start' }} disabled={!pw.current || pw.next.length < 10}>
              Passwort ändern
            </button>
          </form>
        </section>
        <section className="card form-section">
          <header>
            <h2>Zwei-Faktor-Anmeldung</h2>
            <p>Zusätzlich zum Passwort ein Code aus einer App wie 1Password, Google Authenticator oder Apple Passwörter.</p>
          </header>
          {user.totp_enabled ? (
            <div className="row">
              <span className="badge ok">
                <Icon name="shield" size="s" /> Aktiv
              </span>
              <button className="btn ghost danger" onClick={() => setDisable(true)}>
                Ausschalten
              </button>
            </div>
          ) : totp ? (
            <div className="stack">
              <div className="row wrap" style={{ alignItems: 'flex-start', gap: '1.25rem' }}>
                <div className="qr" dangerouslySetInnerHTML={{ __html: totp.svg }} aria-label="QR-Code für die Authenticator-App" />
                <div className="stack tight" style={{ flex: 1, minWidth: '14rem' }}>
                  <p className="small">1. QR-Code mit der App scannen – oder den Schlüssel von Hand eingeben:</p>
                  <code className="mono small" style={{ wordBreak: 'break-all' }}>
                    {totp.secret.match(/.{1,4}/g)?.join(' ')}
                  </code>
                  <p className="small">2. Den sechsstelligen Code eingeben:</p>
                  <div className="row">
                    <input className="input num" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} style={{ maxWidth: '9rem', letterSpacing: '0.2em' }} />
                    <button
                      className="btn primary"
                      onClick={async () => {
                        try {
                          await api.post('/api/me/totp/enable', { code });
                          updateUser({ totp_enabled: true });
                          setTotp(null);
                          toast('Zwei-Faktor-Anmeldung ist aktiv.');
                        } catch (e) {
                          toast((e as Error).message, { kind: 'bad' });
                        }
                      }}
                    >
                      Aktivieren
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <button className="btn" style={{ justifySelf: 'start' }} onClick={async () => setTotp(await api.post('/api/me/totp/start'))}>
              <Icon name="shield" size="s" /> Einrichten
            </button>
          )}
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Angemeldete Geräte</h2>
          </div>
          <ul className="list">
            {sessions.data?.sessions.map((s) => (
              <li key={s.id} className="list-item">
                <Icon name={/iPhone|Android/.test(s.user_agent) ? 'phone' : 'desktop'} className="faint" />
                <div className="grow">
                  <div className="title small">
                    {device(s.user_agent)} {s.current && <span className="badge ok">dieses Gerät</span>}
                  </div>
                  <div className="xsmall muted">
                    zuletzt {formatDate(s.last_seen_at, true)} · {s.ip}
                  </div>
                </div>
                {!s.current && (
                  <button className="btn ghost s" onClick={() => api.del(`/api/me/sessions/${s.id}`).then(sessions.reload)}>
                    Abmelden
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <Dialog open={disable} onOpenChange={setDisable} title="Zwei-Faktor ausschalten?" description="Bestätige mit deinem Passwort.">
        <input className="input" type="password" value={disablePw} onChange={(e) => setDisablePw(e.target.value)} autoFocus />
        <div className="dialog-actions">
          <button className="btn ghost" onClick={() => setDisable(false)}>
            Abbrechen
          </button>
          <button
            className="btn danger"
            onClick={async () => {
              try {
                await api.post('/api/me/totp/disable', { password: disablePw });
                updateUser({ totp_enabled: false });
                setDisable(false);
              } catch (e) {
                toast((e as Error).message, { kind: 'bad' });
              }
            }}
          >
            Ausschalten
          </button>
        </div>
      </Dialog>
    </div>
  );
}

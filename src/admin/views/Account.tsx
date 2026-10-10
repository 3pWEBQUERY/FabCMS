import { useState } from 'react';
import { api } from '../lib/api';
import { useApi, formatDate } from '../lib/hooks';
import { useSession } from '../lib/session';
import { Dialog, Field, PageHead, Select, confirm } from '../ui/kit';
import { adminLang, loadAdminLang, pickAdminLang, t, tl } from '../lib/i18n';
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';
import { relativeTime } from '../../shared/text';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/toast';
import { ROLE_LABELS, isBuiltinRole } from '../../shared/roles';

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
    const os = /iPhone|iPad/.test(ua)
      ? 'iPhone/iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : t('Unbekannt');
    const br = /Edg\//.test(ua) ? 'Edge' : /Firefox/.test(ua) ? 'Firefox' : /Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : '';
    return t('{browser} auf {os}', { browser: br, os });
  };

  return (
    <div className="page narrow">
      <PageHead title={t('Mein Konto')} sub={`${user.email} · ${isBuiltinRole(user.role) ? tl(ROLE_LABELS[user.role].name) : (user.role_name ?? user.role)}`} />
      <div className="stack loose">
        <section className="card form-section">
          <Field label={t('Name')} htmlFor="a-name">
            <div className="row">
              <input id="a-name" className="input grow" value={name} onChange={(e) => setName(e.target.value)} />
              <button
                className="btn"
                disabled={name === user.name || !name.trim()}
                onClick={async () => {
                  await api.patch('/api/me', { name });
                  updateUser({ name });
                  toast(t('Gespeichert.'));
                }}
              >
                {t('Speichern')}
              </button>
            </div>
          </Field>
          <Field label={t('Sprache der Oberfläche')} help={t('Nur für dich. Die Sprachen der Website stellst du unter Einstellungen → Sprachen ein.')}>
            <Select
              value={user.ui_lang ?? ''}
              onChange={async (v) => {
                await api.patch('/api/me', { uiLang: v });
                updateUser({ ui_lang: v as typeof user.ui_lang });
                await loadAdminLang(pickAdminLang(v));
                location.reload();
              }}
              options={[
                { value: '', label: t('Wie im Browser') },
                { value: 'de', label: 'Deutsch' },
                { value: 'fr', label: 'Français' },
                { value: 'it', label: 'Italiano' },
                { value: 'en', label: 'English' },
              ]}
            />
          </Field>
        </section>
        <section className="card form-section">
          <header>
            <h2>{t('Passwort ändern')}</h2>
            <p>{t('Danach werden alle anderen Geräte abgemeldet.')}</p>
          </header>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api.patch('/api/me', { currentPassword: pw.current, newPassword: pw.next });
                setPw({ current: '', next: '' });
                toast(t('Passwort geändert.'));
                void sessions.reload();
              } catch (err) {
                toast((err as Error).message, { kind: 'bad' });
              }
            }}
          >
            <div className="grid-2">
              <Field label={t('Aktuelles Passwort')}>
                <input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
              </Field>
              <Field label={t('Neues Passwort')} help={t('Mindestens 10 Zeichen.')}>
                <input className="input" type="password" autoComplete="new-password" minLength={10} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
              </Field>
            </div>
            <button className="btn" style={{ justifySelf: 'start' }} disabled={!pw.current || pw.next.length < 10}>
              {t('Passwort ändern')}
            </button>
          </form>
        </section>
        <section className="card form-section">
          <header>
            <h2>{t('Zwei-Faktor-Anmeldung')}</h2>
            <p>{t('Zusätzlich zum Passwort ein Code aus einer App wie 1Password, Google Authenticator oder Apple Passwörter.')}</p>
          </header>
          {user.totp_enabled ? (
            <div className="row">
              <span className="badge ok">
                <Icon name="shield" size="s" /> {t('Aktiv')}
              </span>
              <button className="btn ghost danger" onClick={() => setDisable(true)}>
                {t('Ausschalten')}
              </button>
            </div>
          ) : totp ? (
            <div className="stack">
              <div className="row wrap" style={{ alignItems: 'flex-start', gap: '1.25rem' }}>
                <div className="qr" dangerouslySetInnerHTML={{ __html: totp.svg }} aria-label={t('QR-Code für die Authenticator-App')} />
                <div className="stack tight" style={{ flex: 1, minWidth: '14rem' }}>
                  <p className="small">{t('1. QR-Code mit der App scannen – oder den Schlüssel von Hand eingeben:')}</p>
                  <code className="mono small" style={{ wordBreak: 'break-all' }}>
                    {totp.secret.match(/.{1,4}/g)?.join(' ')}
                  </code>
                  <p className="small">{t('2. Den sechsstelligen Code eingeben:')}</p>
                  <div className="row">
                    <input
                      className="input num"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      style={{ maxWidth: '9rem', letterSpacing: '0.2em' }}
                    />
                    <button
                      className="btn primary"
                      onClick={async () => {
                        try {
                          await api.post('/api/me/totp/enable', { code });
                          updateUser({ totp_enabled: true });
                          setTotp(null);
                          toast(t('Zwei-Faktor-Anmeldung ist aktiv.'));
                        } catch (e) {
                          toast((e as Error).message, { kind: 'bad' });
                        }
                      }}
                    >
                      {t('Aktivieren')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <button className="btn" style={{ justifySelf: 'start' }} onClick={async () => setTotp(await api.post('/api/me/totp/start'))}>
              <Icon name="shield" size="s" /> {t('Einrichten')}
            </button>
          )}
        </section>
        <Passkeys />
        <section className="card">
          <div className="card-head">
            <h2>{t('Angemeldete Geräte')}</h2>
          </div>
          <ul className="list">
            {sessions.data?.sessions.map((s) => (
              <li key={s.id} className="list-item">
                <Icon name={/iPhone|Android/.test(s.user_agent) ? 'phone' : 'desktop'} className="faint" />
                <div className="grow">
                  <div className="title small">
                    {device(s.user_agent)} {s.current && <span className="badge ok">{t('dieses Gerät')}</span>}
                  </div>
                  <div className="xsmall muted">
                    {t('zuletzt {date}', { date: formatDate(s.last_seen_at, true) })} · {s.ip}
                  </div>
                </div>
                {!s.current && (
                  <button className="btn ghost s" onClick={() => api.del(`/api/me/sessions/${s.id}`).then(sessions.reload)}>
                    {t('Abmelden')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <Dialog open={disable} onOpenChange={setDisable} title={t('Zwei-Faktor ausschalten?')} description={t('Bestätige mit deinem Passwort.')}>
        <input className="input" type="password" value={disablePw} onChange={(e) => setDisablePw(e.target.value)} autoFocus />
        <div className="dialog-actions">
          <button className="btn ghost" onClick={() => setDisable(false)}>
            {t('Abbrechen')}
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
            {t('Ausschalten')}
          </button>
        </div>
      </Dialog>
    </div>
  );
}

interface Passkey {
  id: string;
  name: string;
  backed_up: boolean;
  created_at: string;
  last_used_at: string | null;
}

/** A sensible default name from the device the passkey is created on. */
function deviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac OS X/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Passkey';
}

function Passkeys() {
  const toast = useToast();
  const list = useApi<{ passkeys: Passkey[] }>('/api/me/passkeys');
  const [busy, setBusy] = useState(false);
  const supported = browserSupportsWebAuthn();
  const add = async () => {
    setBusy(true);
    try {
      const options = await api.post<Parameters<typeof startRegistration>[0]['optionsJSON']>('/api/me/passkeys/options');
      const response = await startRegistration({ optionsJSON: options });
      await api.post('/api/me/passkeys', { response, name: deviceName() });
      toast(t('Passkey gespeichert. Ab jetzt reicht Fingerabdruck, Gesicht oder PIN.'));
      void list.reload();
    } catch (e) {
      const err = e as Error;
      if (err.name === 'InvalidStateError') toast(t('Dieses Gerät hat schon einen Passkey für dein Konto.'));
      else if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') toast(err.message, { kind: 'bad' });
    } finally {
      setBusy(false);
    }
  };
  const remove = async (p: Passkey) => {
    if (
      !(await confirm({
        title: t('Passkey «{name}» entfernen?', { name: p.name }),
        message: t('Danach meldest du dich auf diesem Gerät wieder mit dem Passwort an. Entferne ihn auch im Passwort-Manager des Geräts.'),
        confirm: t('Entfernen'),
        danger: true,
      }))
    )
      return;
    await api.del(`/api/me/passkeys/${encodeURIComponent(p.id)}`);
    void list.reload();
  };
  return (
    <section className="card form-section">
      <header>
        <h2>{t('Passkeys')}</h2>
        <p>{t('Anmelden mit Fingerabdruck, Gesicht oder Geräte-PIN statt Passwort. Sicher gegen Phishing – der Passkey funktioniert nur auf dieser Website.')}</p>
      </header>
      {list.data?.passkeys.length ? (
        <div className="list bordered">
          {list.data.passkeys.map((p) => (
            <div key={p.id} className="list-item">
              <Icon name="key" size="s" />
              <span className="grow">
                {p.name}
                {p.backed_up && <span className="xsmall muted"> · {t('synchronisiert')}</span>}
              </span>
              <span className="xsmall muted">
                {p.last_used_at
                  ? t('zuletzt {time}', { time: relativeTime(p.last_used_at, new Date(), adminLang()) })
                  : t('seit {time}', { time: relativeTime(p.created_at, new Date(), adminLang()) })}
              </span>
              <button className="btn ghost small" aria-label={t('Passkey {name} entfernen', { name: p.name })} onClick={() => void remove(p)}>
                <Icon name="trash" size="s" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {supported ? (
        <button className="btn" style={{ justifySelf: 'start' }} onClick={add} disabled={busy} data-busy={busy || undefined}>
          <Icon name="plus" size="s" /> {t('Passkey hinzufügen')}
        </button>
      ) : (
        <p className="small muted">{t('Dieser Browser unterstützt keine Passkeys.')}</p>
      )}
    </section>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { browserSupportsWebAuthn, browserSupportsWebAuthnAutofill, startAuthentication, startRegistration, WebAuthnAbortService } from '@simplewebauthn/browser';
import { api } from '../lib/api';
import { Field } from '../ui/kit';
import { Icon, NovaMark } from '../ui/icons';
import { t } from '../lib/i18n';

function useSubmit(fn: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

type PasskeyOptions = { key: string; options: Parameters<typeof startAuthentication>[0]['optionsJSON'] };

export function Login({ siteName, onDone, onTwoFactor }: { siteName: string; onDone: () => void; onTwoFactor?: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pkError, setPkError] = useState<string | null>(null);
  const [pkBusy, setPkBusy] = useState(false);
  const canPasskey = browserSupportsWebAuthn();
  const { busy, error, submit } = useSubmit(async () => {
    WebAuthnAbortService.cancelCeremony();
    await api.post('/api/login', { email, password });
    onDone();
  });
  const finish = async (key: string, response: unknown) => {
    const r = await api.post<{ ok?: boolean; twoFactor?: boolean }>('/api/login/passkey', { key, response });
    if (r.twoFactor && onTwoFactor) onTwoFactor();
    else onDone();
  };
  // Autofill: the browser offers saved passkeys right in the e-mail field.
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!(await browserSupportsWebAuthnAutofill())) return;
      try {
        const { key, options } = await api.post<PasskeyOptions>('/api/login/passkey/options');
        const response = await startAuthentication({ optionsJSON: options, useBrowserAutofill: true });
        if (alive) await finish(key, response);
      } catch {
        /* cancelled or replaced by the button */
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const withPasskey = async () => {
    setPkBusy(true);
    setPkError(null);
    try {
      const { key, options } = await api.post<PasskeyOptions>('/api/login/passkey/options');
      await finish(key, await startAuthentication({ optionsJSON: options }));
    } catch (e) {
      const err = e as Error;
      // Closing the browser's dialog is not an error worth shouting about.
      if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') setPkError(err.message);
    } finally {
      setPkBusy(false);
    }
  };
  return (
    <main className="auth">
      <form className="auth-card" onSubmit={submit}>
        <NovaMark size={32} />
        <div>
          <h1>{t('Anmelden')}</h1>
          <p className="muted">{t('bei {site}', { site: siteName })}</p>
        </div>
        <Field label={t('E-Mail')} htmlFor="email">
          <input id="email" className="input" type="email" autoComplete="username webauthn" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <Field label={t('Passwort')} htmlFor="pw">
          <input id="pw" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary l" disabled={busy} aria-busy={busy || undefined}>
          {t('Anmelden')}
        </button>
        {canPasskey && (
          <>
            <div className="auth-or" aria-hidden="true">
              <span>{t('oder')}</span>
            </div>
            <button type="button" className="btn l" onClick={withPasskey} disabled={pkBusy} data-busy={pkBusy || undefined}>
              <Icon name="key" size="s" /> {t('Mit Passkey anmelden')}
            </button>
            {pkError && (
              <p className="field-error" role="alert">
                {pkError}
              </p>
            )}
          </>
        )}
        <p className="xsmall faint">{t('Passwort vergessen? Eine Person mit Admin-Rechten kann es unter «Team» zurücksetzen.')}</p>
      </form>
    </main>
  );
}

export function TwoFactor({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('');
  const { busy, error, submit } = useSubmit(async () => {
    await api.post('/api/login/2fa', { code });
    onDone();
  });
  return (
    <main className="auth">
      <form className="auth-card" onSubmit={submit}>
        <NovaMark size={32} />
        <div>
          <h1>{t('Bestätigungscode')}</h1>
          <p className="muted">{t('Gib die sechs Ziffern aus deiner Authenticator-App ein.')}</p>
        </div>
        <Field label={t('Code')} htmlFor="code">
          <input
            id="code"
            className="input num"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={{ fontSize: '1.4rem', letterSpacing: '0.3em' }}
          />
        </Field>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary l" disabled={busy} aria-busy={busy || undefined}>
          {t('Bestätigen')}
        </button>
      </form>
    </main>
  );
}

export function SetupOwner({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ code: '', name: '', email: '', password: '' });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const { busy, error, submit } = useSubmit(async () => {
    await api.post('/api/setup', form);
    onDone();
  });
  return (
    <main className="auth">
      <form className="auth-card" onSubmit={submit}>
        <NovaMark size={32} />
        <div>
          <h1>{t('Willkommen bei Nova')}</h1>
          <p className="muted">{t('Zuerst dein Zugang. Danach richten wir in fünf Fragen deine Website ein.')}</p>
        </div>
        <Field
          label={t('Einrichtungscode')}
          htmlFor="code"
          help={t('Steht in den Logs deines Railway-Dienstes, z. B. «482-913». Er verhindert, dass jemand anderes diese Installation übernimmt.')}
        >
          <input id="code" className="input num" required autoComplete="off" value={form.code} onChange={set('code')} autoFocus />
        </Field>
        <Field label={t('Dein Name')} htmlFor="name">
          <input id="name" className="input" required autoComplete="name" value={form.name} onChange={set('name')} />
        </Field>
        <Field label={t('E-Mail')} htmlFor="email">
          <input id="email" className="input" type="email" required autoComplete="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label={t('Passwort')} htmlFor="pw" help={t('Mindestens 10 Zeichen. Ein Satz ist sicherer als ein kompliziertes Wort.')}>
          <input id="pw" className="input" type="password" required minLength={10} autoComplete="new-password" value={form.password} onChange={set('password')} />
        </Field>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary l" disabled={busy} aria-busy={busy || undefined}>
          {t('Weiter')}
        </button>
      </form>
    </main>
  );
}

/**
 * The role of this person asks for a second factor and there is none yet:
 * before anything else, set up a passkey or a code from an authenticator app.
 */
export function SetupTwoFactor({ name, onDone }: { name: string; onDone: () => void }) {
  const [totp, setTotp] = useState<{ secret: string; svg: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const passkey = () =>
    run(async () => {
      const options = await api.post<Parameters<typeof startRegistration>[0]['optionsJSON']>('/api/me/passkeys/options');
      const response = await startRegistration({ optionsJSON: options });
      await api.post('/api/me/passkeys', { response, name: /iPhone|iPad|Android|Mac OS X|Windows/.exec(navigator.userAgent)?.[0].replace('Mac OS X', 'Mac') ?? 'Passkey' });
      onDone();
    });
  const enable = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api.post('/api/me/totp/enable', { code });
      onDone();
    });
  };
  const logout = () =>
    run(async () => {
      await api.post('/api/logout');
      onDone();
    });
  return (
    <main className="auth">
      <div className="auth-card">
        <NovaMark size={32} />
        <div>
          <h1>{t('Zweiten Faktor einrichten')}</h1>
          <p className="muted">{t('Hallo {name}. Für deine Rolle verlangt diese Website neben dem Passwort einen zweiten Faktor. Das dauert eine Minute.', { name })}</p>
        </div>
        {totp ? (
          <form className="stack" onSubmit={enable}>
            <div className="qr" dangerouslySetInnerHTML={{ __html: totp.svg }} aria-label={t('QR-Code für die Authenticator-App')} />
            <p className="small">{t('1. QR-Code mit der App scannen – oder den Schlüssel von Hand eingeben:')}</p>
            <code className="mono small" style={{ wordBreak: 'break-all' }}>
              {totp.secret.match(/.{1,4}/g)?.join(' ')}
            </code>
            <Field label={t('2. Den sechsstelligen Code eingeben:')} htmlFor="setup-code">
              <input
                id="setup-code"
                className="input num"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,7}"
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                style={{ fontSize: '1.4rem', letterSpacing: '0.3em' }}
              />
            </Field>
            <button className="btn primary l" disabled={busy} aria-busy={busy || undefined}>
              {t('Aktivieren')}
            </button>
            <button type="button" className="btn ghost" onClick={() => setTotp(null)}>
              {t('Zurück')}
            </button>
          </form>
        ) : (
          <div className="stack">
            {browserSupportsWebAuthn() && (
              <button className="btn primary l" disabled={busy} onClick={() => void passkey()}>
                <Icon name="key" /> {t('Passkey auf diesem Gerät')}
              </button>
            )}
            <button className="btn l" disabled={busy} onClick={() => void run(async () => setTotp(await api.post('/api/me/totp/start')))}>
              <Icon name="shield" /> {t('Code aus einer Authenticator-App')}
            </button>
          </div>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="btn ghost s" disabled={busy} onClick={() => void logout()}>
          {t('Abmelden')}
        </button>
      </div>
    </main>
  );
}

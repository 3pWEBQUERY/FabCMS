import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { Field } from '../ui/kit';
import { NovaMark } from '../ui/icons';

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

export function Login({ siteName, onDone }: { siteName: string; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, submit } = useSubmit(async () => {
    await api.post('/api/login', { email, password });
    onDone();
  });
  return (
    <main className="auth">
      <form className="auth-card" onSubmit={submit}>
        <NovaMark size={32} />
        <div>
          <h1>Anmelden</h1>
          <p className="muted">bei {siteName}</p>
        </div>
        <Field label="E-Mail" htmlFor="email">
          <input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <Field label="Passwort" htmlFor="pw">
          <input id="pw" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary l" disabled={busy} aria-busy={busy || undefined}>
          Anmelden
        </button>
        <p className="xsmall faint">Passwort vergessen? Eine Person mit Admin-Rechten kann es unter «Team» zurücksetzen.</p>
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
          <h1>Bestätigungscode</h1>
          <p className="muted">Gib die sechs Ziffern aus deiner Authenticator-App ein.</p>
        </div>
        <Field label="Code" htmlFor="code">
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
          Bestätigen
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
          <h1>Willkommen bei Nova</h1>
          <p className="muted">Zuerst dein Zugang. Danach richten wir in fünf Fragen deine Website ein.</p>
        </div>
        <Field label="Einrichtungscode" htmlFor="code" help="Steht in den Logs deines Railway-Dienstes, z. B. «482-913». Er verhindert, dass jemand anderes diese Installation übernimmt.">
          <input id="code" className="input num" required autoComplete="off" value={form.code} onChange={set('code')} autoFocus />
        </Field>
        <Field label="Dein Name" htmlFor="name">
          <input id="name" className="input" required autoComplete="name" value={form.name} onChange={set('name')} />
        </Field>
        <Field label="E-Mail" htmlFor="email">
          <input id="email" className="input" type="email" required autoComplete="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Passwort" htmlFor="pw" help="Mindestens 10 Zeichen. Ein Satz ist sicherer als ein kompliziertes Wort.">
          <input id="pw" className="input" type="password" required minLength={10} autoComplete="new-password" value={form.password} onChange={set('password')} />
        </Field>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary l" disabled={busy} aria-busy={busy || undefined}>
          Weiter
        </button>
      </form>
    </main>
  );
}

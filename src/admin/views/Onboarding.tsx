import { useEffect, useState } from 'react';
import { LoadingFrame } from '../ui/loading';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { Field, motion, AnimatePresence } from '../ui/kit';
import { Icon, NovaMark } from '../ui/icons';
import { SECTORS } from '../../shared/collections';
import { useToast } from '../ui/toast';

/**
 * Setup assistant: five questions, then a real website with the user's name
 * and sector content. Style previews render the actual home page.
 */
type Imported = { name?: string; description?: string; business?: Record<string, string>; hours?: unknown; themeColor?: string } | null;

const STEPS = ['Sparte', 'Name', 'Stil', 'Adresse', 'Modus'];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { bundle, reloadSettings, user } = useSession();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [sectors, setSectors] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [imported, setImported] = useState<Imported>(null);
  const [importing, setImporting] = useState(false);
  const [themes, setThemes] = useState<string[]>([]);
  const [theme, setTheme] = useState('');
  const [palette, setPalette] = useState('default');
  const [baseUrl, setBaseUrl] = useState('');
  const [mode, setMode] = useState<'studio' | 'werkbank'>('studio');
  const [busy, setBusy] = useState(false);
  const [seededFor, setSeededFor] = useState('');

  const toggleSector = (id: string) => setSectors((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 4 ? [...s, id] : s));

  const runImport = async () => {
    if (!url.trim()) return;
    setImporting(true);
    try {
      const r = await api.get<{ imported: Imported }>(`/api/onboarding/import?url=${encodeURIComponent(url)}`);
      setImported(r.imported);
      if (r.imported?.name && !name) setName(r.imported.name);
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setImporting(false);
    }
  };

  const next = async () => {
    if (step === 1) {
      const key = `${sectors.join(',')}|${name}`;
      if (seededFor !== key) {
        setBusy(true);
        try {
          const r = await api.post<{ themes: string[] }>('/api/onboarding/seed', { sectors, name, imported: imported ?? undefined });
          setThemes(r.themes);
          setTheme(r.themes[0]);
          setSeededFor(key);
          await reloadSettings();
        } catch (e) {
          toast((e as Error).message, { kind: 'bad' });
          setBusy(false);
          return;
        }
        setBusy(false);
      }
    }
    if (step === 4) {
      setBusy(true);
      try {
        await api.post('/api/onboarding/finish', { theme, palette, mode, baseUrl: baseUrl ? (baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`) : undefined });
        onDone();
      } catch (e) {
        toast((e as Error).message, { kind: 'bad' });
      } finally {
        setBusy(false);
      }
      return;
    }
    setStep((s) => s + 1);
  };

  const canNext = [sectors.length > 0, name.trim().length > 0, Boolean(theme), true, true][step];
  const themeInfo = bundle?.themes.find((t) => t.id === theme);
  const publicUrl = bundle?.system.publicUrl ?? location.origin;

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canNext && !busy) void next();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  return (
    <div className="wizard">
      <div className="wizard-top">
        <div className="row">
          <NovaMark />
          <span className="small muted">Hallo {user.name.split(' ')[0]}</span>
        </div>
        <div className="wizard-steps" aria-label={`Schritt ${step + 1} von 5`}>
          {STEPS.map((s, i) => (
            <span key={s} className={i <= step ? 'on' : ''} title={s} />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.main
          key={step}
          className="wizard-body"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ type: 'spring', stiffness: 420, damping: 40 }}
        >
          {step === 0 && (
            <>
              <h1>Was möchtest du online bringen?</h1>
              <p className="lede">Wähl alles, was passt – bis zu vier. Daraus stellt Nova Seiten, Formulare und Module zusammen.</p>
              <div className="tiles" role="group" aria-label="Sparten">
                {SECTORS.map((s) => (
                  <button key={s.id} type="button" className="tile" aria-pressed={sectors.includes(s.id)} onClick={() => toggleSector(s.id)}>
                    <strong>{s.name}</strong>
                    <span>{s.hint}</span>
                    {sectors.includes(s.id) && (
                      <motion.span className="tick" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 22 }}>
                        <Icon name="check" size="s" />
                      </motion.span>
                    )}
                  </button>
                ))}
              </div>
              <p className="small faint" style={{ marginTop: '1rem' }}>
                Reservation & Termine, Events und Kurse folgen mit Version 1.0.
              </p>
            </>
          )}

          {step === 1 && (
            <div className="stack loose" style={{ maxWidth: '34rem' }}>
              <div>
                <h1>Wie heisst dein Projekt?</h1>
                <p className="lede">So steht es oben auf der Website. Ändern kannst du es jederzeit.</p>
              </div>
              <Field label="Name" htmlFor="ob-name">
                <input id="ob-name" className="input" style={{ fontSize: '1.25rem', minHeight: '3rem' }} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="z. B. Gasthaus Linde" />
              </Field>
              <div className="card card-pad stack tight">
                <strong className="small">Gibt es schon eine Website?</strong>
                <p className="small muted">Nova übernimmt Name, Beschreibung, Adresse und Öffnungszeiten, wenn sie dort hinterlegt sind.</p>
                <div className="row">
                  <input className="input grow" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="www.meine-alte-website.ch" inputMode="url" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void runImport())} />
                  <button className="btn" onClick={runImport} disabled={importing || !url.trim()}>
                    {importing ? 'Lese …' : 'Übernehmen'}
                  </button>
                </div>
                {imported && (
                  <ul className="small" style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {imported.name && <li>Name: {imported.name}</li>}
                    {imported.description && <li>Beschreibung übernommen</li>}
                    {imported.business?.city && (
                      <li>
                        Adresse: {imported.business.street} {imported.business.zip} {imported.business.city}
                      </li>
                    )}
                    {Boolean(imported.hours) && <li>Öffnungszeiten übernommen</li>}
                    {!imported.name && !imported.description && !imported.business && <li>Nichts Verwertbares gefunden – kein Problem.</li>}
                  </ul>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <>
              <h1>Welcher Stil passt zu dir?</h1>
              <p className="lede">Das ist deine echte Startseite – mit deinem Namen. Farben und Schriften kannst du später anpassen.</p>
              <div className="style-previews">
                {themes.map((id) => {
                  const t = bundle?.themes.find((x) => x.id === id);
                  return (
                    <button key={id} type="button" className="style-preview" aria-pressed={theme === id} onClick={() => setTheme(id)}>
                      <div className="frame">
                        <LoadingFrame title={`Vorschau ${t?.name}`} src={`/_nova/theme-preview?theme=${id}&palette=${theme === id ? palette : 'default'}`} loading="lazy" tabIndex={-1} label="" />
                      </div>
                      <div className="meta">
                        <strong>{t?.name}</strong>
                        <span>{t?.description}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {themeInfo && (
                <div className="row" style={{ marginTop: '1.25rem', gap: '1rem' }}>
                  <span className="small muted">Farben</span>
                  <div className="swatches">
                    {themeInfo.palettes.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="swatch"
                        aria-pressed={palette === p.id}
                        aria-label={p.label}
                        title={p.label}
                        onClick={() => setPalette(p.id)}
                        style={{ background: `linear-gradient(135deg, ${p.bg} 0 50%, ${p.accent} 50% 100%)` }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <div className="stack loose" style={{ maxWidth: '36rem' }}>
              <div>
                <h1>Deine Adresse im Netz</h1>
                <p className="lede">Deine Website ist sofort unter dieser Adresse erreichbar – sobald du sie veröffentlichst.</p>
              </div>
              <div className="card card-pad row" style={{ gap: '0.75rem' }}>
                <Icon name="globe" />
                <span className="mono grow ellipsis">{publicUrl.replace(/^https?:\/\//, '')}</span>
                <span className="badge ok">Bereit</span>
              </div>
              <Field label="Eigene Domain (optional)" htmlFor="ob-domain" help="Hast du schon eine, z. B. «www.gasthaus-linde.ch»? Trag sie ein – die DNS-Einrichtung zeigen wir dir Schritt für Schritt unter Einstellungen → Domain.">
                <input id="ob-domain" className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="www.meine-domain.ch" inputMode="url" />
              </Field>
            </div>
          )}

          {step === 4 && (
            <>
              <h1>Wie möchtest du arbeiten?</h1>
              <p className="lede">Beide Modi zeigen dieselben Inhalte. Wechseln kannst du jederzeit oben rechts oder mit {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} + Punkt.</p>
              <div className="tiles" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 20rem), 1fr))' }}>
                <button type="button" className="tile" aria-pressed={mode === 'studio'} onClick={() => setMode('studio')} style={{ padding: '1.25rem 1.35rem', gap: '0.4rem' }}>
                  <strong style={{ fontSize: 'var(--t-l)' }}>Studio</strong>
                  <span>Direkt auf der Seite klicken und schreiben. Alltagssprache, keine Fachbegriffe. Du kannst nichts kaputt machen.</span>
                </button>
                <button
                  type="button"
                  className="tile"
                  aria-pressed={mode === 'werkbank'}
                  onClick={() => setMode('werkbank')}
                  disabled={!user.allowed_modes.includes('werkbank')}
                  style={{ padding: '1.25rem 1.35rem', gap: '0.4rem' }}
                >
                  <strong style={{ fontSize: 'var(--t-l)' }}>Werkbank</strong>
                  <span>Alles aus dem Studio, dazu eigene Inhaltstypen, CSS, Code-Ansicht pro Block, API, Webhooks und Datenbank-Abfragen.</span>
                </button>
              </div>
            </>
          )}
        </motion.main>
      </AnimatePresence>

      <footer className="wizard-foot">
        <button className="btn ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || busy}>
          <Icon name="arrowLeft" size="s" />
          Zurück
        </button>
        <span className="small faint hide-m">
          {step + 1} / 5 · {STEPS[step]}
        </span>
        <button className="btn primary l" onClick={next} disabled={!canNext || busy}>
          {busy && <span className="spin" aria-hidden="true" />}
          {busy ? (step === 1 ? 'Richte ein …' : 'Einen Moment …') : step === 4 ? 'Los geht’s' : 'Weiter'}
          {!busy && <Icon name="arrowRight" size="s" />}
        </button>
      </footer>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { adminLocale, t } from '../lib/i18n';
import { Link, usePath } from '../lib/router';
import { Icon } from '../ui/icons';
import { PageHead } from '../ui/kit';

interface Result {
  status: 'ok' | 'already' | 'unpaid' | 'cancelled' | 'unknown';
  code: string;
  ticket?: { category: string; name: string; entry_title: string; entry_id: string | null; checked_in_at: string | null };
  progress?: { checked: number; total: number };
}

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (o: { formats: string[] }) => Detector;
  }
}

const TEXT: Record<Result['status'], { title: string; tone: 'ok' | 'warn' | 'bad'; icon: string }> = {
  ok: { title: 'Gültig', tone: 'ok', icon: 'check' },
  already: { title: 'Schon eingelöst', tone: 'warn', icon: 'alert' },
  unpaid: { title: 'Nicht bezahlt', tone: 'bad', icon: 'x' },
  cancelled: { title: 'Storniert', tone: 'bad', icon: 'x' },
  unknown: { title: 'Unbekannter Code', tone: 'bad', icon: 'x' },
};

/** A scanned QR holds the check-in URL; typed codes are just the code. */
const codeFrom = (raw: string) => {
  try {
    return new URL(raw).searchParams.get('code') ?? raw;
  } catch {
    return raw;
  }
};

export function CheckIn() {
  const { query } = usePath();
  const [code, setCode] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const [camError, setCamError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const last = useRef({ code: '', at: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const canScan = typeof window !== 'undefined' && 'BarcodeDetector' in window && Boolean(navigator.mediaDevices?.getUserMedia);

  const check = useCallback(async (raw: string) => {
    const c = codeFrom(raw).trim();
    if (!c) return;
    setBusy(true);
    try {
      const r = await api.post<Result>('/api/tickets/checkin', { code: c });
      setResult(r);
      navigator.vibrate?.(r.status === 'ok' ? 80 : [60, 60, 60]);
    } catch (e) {
      setResult({ status: 'unknown', code: (e as Error).message });
    } finally {
      setBusy(false);
      setCode('');
      inputRef.current?.focus();
    }
  }, []);

  // Opened from a phone's camera app: /admin/einlass?code=…
  const fromUrl = query.get('code');
  useEffect(() => {
    if (fromUrl) void check(fromUrl);
  }, [fromUrl, check]);

  useEffect(() => {
    if (!camera || !window.BarcodeDetector) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const found = await detector.detect(videoRef.current);
            const raw = found[0]?.rawValue;
            // The same code stays in view for a while: one check per code every 3 s.
            if (raw && (raw !== last.current.code || Date.now() - last.current.at > 3000)) {
              last.current = { code: raw, at: Date.now() };
              await check(raw);
            }
          } catch {
            /* a frame that can't be read */
          }
          timer = window.setTimeout(tick, 250);
        };
        void tick();
      } catch {
        setCamError(t('Die Kamera lässt sich nicht öffnen. Erlaube den Zugriff im Browser oder gib den Code von Hand ein.'));
        setCamera(false);
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [camera, check]);

  const shown = result ? TEXT[result.status] : null;
  const eventId = query.get('event') ?? result?.ticket?.entry_id ?? null;
  return (
    <div className="page">
      <PageHead
        back={
          <Link to={eventId ? `/tickets?event=${eventId}` : '/tickets'} className="crumb">
            <Icon name="chevronLeft" size="s" /> {t('Tickets')}
          </Link>
        }
        title={t('Einlass')}
        sub={t('QR-Code scannen oder den Code vom Ticket eintippen.')}
      />
      <div className="door">
        <div className={`door-result ${shown?.tone ?? ''} ${result ? 'pop' : ''}`} key={result ? `${result.code}-${Date.now()}` : 'empty'} role="status" aria-live="assertive">
          {!result ? (
            <p className="muted">{t('Bereit.')}</p>
          ) : (
            <>
              <span className="door-icon" aria-hidden="true">
                <Icon name={shown!.icon} />
              </span>
              <h2>{t(shown!.title)}</h2>
              {result.ticket && (
                <>
                  <p style={{ fontSize: 'var(--t-l)', fontWeight: 600 }}>{result.ticket.name}</p>
                  <p className="muted">
                    {result.ticket.category} · {result.ticket.entry_title}
                  </p>
                  {result.status === 'already' && result.ticket.checked_in_at && (
                    <p className="small">
                      {t('Eingelöst um {time}', { time: new Date(result.ticket.checked_in_at).toLocaleTimeString(adminLocale(), { hour: '2-digit', minute: '2-digit' }) })}
                    </p>
                  )}
                </>
              )}
              <p className="mono small faint">{result.code}</p>
              {result.progress && <p className="small">{t('{checked} von {total} eingecheckt', { checked: result.progress.checked, total: result.progress.total })}</p>}
            </>
          )}
        </div>
        {camera && (
          <div className="door-cam">
            <video ref={videoRef} playsInline muted />
          </div>
        )}
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void check(code);
          }}
        >
          <input
            ref={inputRef}
            className="input grow mono"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCD-EFGH"
            aria-label={t('Ticket-Code')}
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
          <button className="btn primary" disabled={busy || !code.trim()} data-busy={busy || undefined}>
            {t('Prüfen')}
          </button>
        </form>
        {canScan ? (
          <button className="btn" onClick={() => setCamera((v) => !v)}>
            <Icon name="qr" size="s" /> {camera ? t('Kamera aus') : t('Mit der Kamera scannen')}
          </button>
        ) : (
          <p className="small muted">
            {t('Tipp: Mit der normalen Kamera-App des Handys den QR-Code scannen – der Link öffnet diese Seite und prüft das Ticket gleich. (Angemeldet bleiben.)')}
          </p>
        )}
        {camError && <p className="small danger-text">{camError}</p>}
      </div>
    </div>
  );
}

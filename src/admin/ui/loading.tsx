import { useEffect, useRef, useState, type IframeHTMLAttributes, type ReactNode } from 'react';
import { startLoading, useLoadingCount } from '../lib/progress';
import { NovaMark } from './icons';
import { t } from '../lib/i18n';

/** Shows children only after `ms`, so quick loads don't flash a placeholder. */
function Delayed({ ms, children }: { ms: number; children: ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShow(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return show ? <>{children}</> : null;
}

/**
 * Thin bar at the top of the window while the admin loads data or a view.
 * Appears only after 200 ms, creeps towards 85 % and finishes when done.
 */
export function TopProgress() {
  const count = useLoadingCount();
  const [state, setState] = useState<'idle' | 'run' | 'done'>('idle');
  const timer = useRef(0);
  useEffect(() => {
    clearTimeout(timer.current);
    if (count > 0) {
      if (state !== 'run') timer.current = window.setTimeout(() => setState('run'), 200);
    } else if (state === 'run') {
      setState('done');
      timer.current = window.setTimeout(() => setState('idle'), 450);
    }
    return () => clearTimeout(timer.current);
  }, [count, state]);
  if (state === 'idle') return null;
  return <div className={`top-progress ${state}`} role="progressbar" aria-label={t('Lädt')} aria-busy={state === 'run'} />;
}

/** Placeholder in the shape of an admin page while its code or data arrives. */
export function PageSkeleton() {
  return (
    <div className="page" aria-hidden="true">
      <div className="skel" style={{ width: '14rem', height: '1.9rem', marginBottom: '.6rem' }} />
      <div className="skel" style={{ width: '22rem', maxWidth: '80%', height: '0.95rem', marginBottom: '1.75rem' }} />
      <div className="card card-pad stack">
        {[92, 78, 85, 64, 72].map((w, i) => (
          <div key={i} className="row" style={{ gap: '.85rem' }}>
            <div className="skel" style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', flex: 'none' }} />
            <div className="stack tight grow">
              <div className="skel" style={{ width: `${w}%`, height: '.85rem' }} />
              <div className="skel" style={{ width: `${w - 30}%`, height: '.7rem' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Suspense fallback for views that load on demand: counts for the progress bar, skeleton after a moment. */
export function RouteLoading({ children }: { children?: ReactNode }) {
  useEffect(() => startLoading(), []);
  return <Delayed ms={150}>{children ?? <PageSkeleton />}</Delayed>;
}

/** Start screen while the admin finds out who is signed in (same markup as in index.html). */
export function Splash() {
  return (
    <div className="splash" role="status" aria-label={t('Nova lädt')}>
      <NovaMark size={40} />
      <span className="splash-bar" />
    </div>
  );
}

/**
 * An iframe (preview, canvas) with its own loading state: a soft placeholder
 * until the page inside has loaded, instead of a blank white box.
 */
export function LoadingFrame({
  label = t('Vorschau lädt …'),
  className,
  onLoad,
  frameRef,
  ...rest
}: IframeHTMLAttributes<HTMLIFrameElement> & { label?: string; frameRef?: React.Ref<HTMLIFrameElement> }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(false), [rest.src]);
  return (
    <div className={`frame-load ${loaded ? 'ready' : ''} ${className ?? ''}`}>
      <iframe
        ref={frameRef}
        {...rest}
        onLoad={(e) => {
          setLoaded(true);
          onLoad?.(e);
        }}
      />
      {!loaded && (
        <div className="frame-load-veil" aria-hidden="true">
          <span className="splash-bar" />
          <span>{label}</span>
        </div>
      )}
    </div>
  );
}

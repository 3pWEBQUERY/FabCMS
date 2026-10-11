import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import { Icon } from '../ui/icons';

type Device = 'desktop' | 'tablet' | 'mobile';

/** The three sizes side by side, each drawn at its real width and scaled to fit. */
const SIZES: { device: Device; width: number; icon: string }[] = [
  { device: 'desktop', width: 1280, icon: 'desktop' },
  { device: 'tablet', width: 834, icon: 'tablet' },
  { device: 'mobile', width: 390, icon: 'phone' },
];
const GAP = 24;
const HEAD = 34;

/**
 * «Alle Geräte»: the page as visitors see it on a computer, a tablet and a
 * phone at once – the saved draft, without the editor's handles. The three
 * scroll together; after each save they reload where they were.
 */
export function DeviceOverview({ src, version, onPick }: { src: string; version: number; onPick: (d: Device) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const frames = useRef<(HTMLIFrameElement | null)[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [loaded, setLoaded] = useState<Set<number>>(new Set());
  const keep = useRef<number[]>([]);
  const syncing = useRef(false);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A new save: reload in place and come back to the same spot.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    frames.current.forEach((f, i) => {
      const win = f?.contentWindow;
      if (!win) return;
      keep.current[i] = win.scrollY;
      win.location.reload();
    });
  }, [version]);

  const total = SIZES.reduce((s, x) => s + x.width, 0);
  const scale = size.w ? Math.min(1, (size.w - GAP * (SIZES.length + 1)) / total) : 0;
  const height = Math.max(200, size.h - HEAD - GAP * 2);

  /** Scrolling one moves the others to the same share of their page. */
  const follow = (from: number) => {
    if (syncing.current) return;
    const src = frames.current[from]?.contentWindow;
    if (!src) return;
    const max = src.document.documentElement.scrollHeight - src.innerHeight;
    const share = max > 0 ? src.scrollY / max : 0;
    syncing.current = true;
    frames.current.forEach((f, i) => {
      const win = f?.contentWindow;
      if (i === from || !win) return;
      // Instantly – the site scrolls smoothly, and smooth followers would chase each other.
      win.scrollTo({ top: share * (win.document.documentElement.scrollHeight - win.innerHeight), behavior: 'instant' });
    });
    requestAnimationFrame(() => (syncing.current = false));
  };

  return (
    <div className="dev-all" ref={box}>
      {scale > 0 &&
        SIZES.map((s, i) => (
          <figure key={s.device} className="dev-all-item" style={{ width: s.width * scale }}>
            <figcaption>
              <Icon name={s.icon} size="s" />
              <span>{s.device === 'desktop' ? t('Computer') : s.device === 'tablet' ? t('Tablet') : t('Handy')}</span>
              <span className="faint mono">{s.width}px</span>
              <button type="button" className="btn ghost s" onClick={() => onPick(s.device)}>
                {t('Hier bearbeiten')}
              </button>
            </figcaption>
            <div className={`dev-all-screen ${loaded.has(i) ? 'ready' : ''}`} style={{ width: s.width * scale, height }}>
              <iframe
                ref={(f) => {
                  frames.current[i] = f;
                }}
                title={t('Vorschau: {device}', { device: s.device === 'desktop' ? t('Computer') : s.device === 'tablet' ? t('Tablet') : t('Handy') })}
                src={src}
                style={{ width: s.width, height: height / scale, transform: `scale(${scale})` }}
                onLoad={(e) => {
                  const win = e.currentTarget.contentWindow;
                  setLoaded((l) => new Set(l).add(i));
                  if (!win) return;
                  if (keep.current[i]) win.scrollTo({ top: keep.current[i], behavior: 'instant' });
                  win.addEventListener('scroll', () => follow(i), { passive: true });
                }}
              />
            </div>
          </figure>
        ))}
    </div>
  );
}

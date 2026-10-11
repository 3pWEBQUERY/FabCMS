import { useRef } from 'react';
import { t } from '../../lib/i18n';
import { Field } from '../../ui/kit';
import { useMedia } from '../../ui/MediaPicker';
import { MAX_HOTSPOTS, type El } from '../../../shared/elements';

type Point = { x: number; y: number; title?: string; text?: string; href?: string };

const clamp = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 10) / 10;

/**
 * «Bild mit Hinweispunkten»: the picture small, its points on it. A tap on the
 * picture sets a new point there, a point is dragged to move it – or moved
 * with the arrow keys once it has the focus.
 */
export function HotspotPlacer({ el, onChange }: { el: El; onChange: (el: El) => void }) {
  const m = useMedia(typeof el.props.image === 'string' ? el.props.image : null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  if (!m?.preview) return null;
  const points = (el.props.points as Point[] | undefined) ?? [];
  const set = (next: Point[]) => onChange({ ...el, props: { ...el.props, points: next } });
  const at = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100) };
  };
  const move = (i: number, p: { x: number; y: number }) => set(points.map((pt, n) => (n === i ? { ...pt, ...p } : pt)));
  return (
    <Field
      label={t('Punkte setzen')}
      help={
        points.length >= MAX_HOTSPOTS
          ? t('Mehr als {n} Punkte gehen nicht.', { n: MAX_HOTSPOTS })
          : t('Tipp ins Bild für einen neuen Punkt, zieh einen Punkt, um ihn zu verschieben.')
      }
    >
      <div
        ref={box}
        className="hs-placer"
        onClick={(e) => {
          if (e.target !== e.currentTarget && !(e.target instanceof HTMLImageElement)) return;
          if (points.length >= MAX_HOTSPOTS) return;
          set([...points, { ...at(e), title: '', text: '', href: '' }]);
        }}
      >
        <img src={m.preview} alt="" draggable={false} />
        {points.map((pt, i) => (
          <button
            key={i}
            type="button"
            className="hs-placer-dot"
            style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
            aria-label={t('Punkt {n} – mit den Pfeiltasten verschieben', { n: i + 1 })}
            title={pt.title || undefined}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.focus();
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = i;
            }}
            onPointerMove={(e) => drag.current === i && move(i, at(e))}
            onPointerUp={() => (drag.current = null)}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 5 : 1;
              const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
              if (!d) return;
              e.preventDefault();
              move(i, { x: clamp(pt.x + d[0]), y: clamp(pt.y + d[1]) });
            }}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </Field>
  );
}

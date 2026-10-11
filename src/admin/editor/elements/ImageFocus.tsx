import { t } from '../../lib/i18n';
import { Field } from '../../ui/kit';
import { useMedia } from '../../ui/MediaPicker';
import type { El } from '../../../shared/elements';

/**
 * Where a picture is cropped around, for this place only. Unset, the focus
 * from the media library applies – the same picture can sit differently in
 * a narrow column and in a wide header.
 */
export function ImageFocus({ el, onChange }: { el: El; onChange: (el: El) => void }) {
  const m = useMedia(typeof el.props.image === 'string' ? el.props.image : null);
  if (!m?.image || !m.preview) return null;
  const own = el.props.focus as { x: number; y: number } | undefined;
  const f = own ? { x: own.x / 100, y: own.y / 100 } : (m.focus ?? { x: 0.5, y: 0.5 });
  const set = (x: number, y: number) =>
    onChange({ ...el, props: { ...el.props, focus: { x: Math.round(Math.min(1, Math.max(0, x)) * 100), y: Math.round(Math.min(1, Math.max(0, y)) * 100) } } });
  return (
    <Field label={t('Fokuspunkt')} help={own ? t('Gilt nur an dieser Stelle.') : t('Aus der Mediathek. Tipp ins Bild, um ihn nur hier zu ändern.')}>
      <div className="stack tight">
        <div
          className="focus-picker"
          role="button"
          tabIndex={0}
          aria-label={t('Fokuspunkt setzen – mit den Pfeiltasten verschieben')}
          onClick={(e) => {
            const r = (e.currentTarget.querySelector('img') as HTMLImageElement).getBoundingClientRect();
            set((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
          }}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 0.1 : 0.02;
            const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
            if (!d) return;
            e.preventDefault();
            set(f.x + d[0], f.y + d[1]);
          }}
        >
          <img src={m.preview} alt="" />
          <span className="focus-dot" style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%` }} />
        </div>
        {own && (
          <button type="button" className="btn s ghost" style={{ justifySelf: 'start' }} onClick={() => onChange({ ...el, props: { ...el.props, focus: undefined } })}>
            {t('Wie in der Mediathek')}
          </button>
        )}
      </div>
    </Field>
  );
}

import { SHAPE_KINDS, SHAPES, type El, type ShapeKind } from '../../../shared/elements';
import { t, tl } from '../../lib/i18n';
import { ColorInput, NumberInput } from '../design/controls';
import { Field } from '../../ui/kit';

/** A shape: which one (drawn as it will look), its colour, and an outline or line width. */
export function ShapeControls({ el, onChange, locked }: { el: El; onChange: (el: El) => void; locked: boolean }) {
  const kind = (SHAPE_KINDS.includes(el.props.shape as ShapeKind) ? el.props.shape : 'blob') as ShapeKind;
  const line = 'line' in SHAPES[kind];
  const set = (patch: Record<string, unknown>) => onChange({ ...el, props: { ...el.props, ...patch } });
  return (
    <div className="stack">
      <div className="shape-grid" role="radiogroup" aria-label={t('Form')}>
        {SHAPE_KINDS.map((k) => {
          const s: { d: string; label: string; line?: boolean } = SHAPES[k];
          return (
            <button key={k} type="button" role="radio" aria-checked={k === kind} disabled={locked} onClick={() => set({ shape: k })} title={tl(s.label)}>
              <svg viewBox="-6 -6 112 112" aria-hidden="true">
                <path d={s.d} className={s.line ? 'line' : ''} vectorEffect="non-scaling-stroke" />
              </svg>
              <span>{tl(s.label)}</span>
            </button>
          );
        })}
      </div>
      <Field label={line ? t('Farbe der Linie') : t('Füllfarbe')}>
        <ColorInput value={(el.props.fill as string) || undefined} placeholder="$accent" onChange={(v) => set({ fill: v ?? '' })} ariaLabel={t('Füllfarbe')} />
      </Field>
      {!line && (
        <Field label={t('Kontur')}>
          <ColorInput value={(el.props.stroke as string) || undefined} onChange={(v) => set({ stroke: v ?? '' })} ariaLabel={t('Kontur')} />
        </Field>
      )}
      <Field label={line ? t('Strichstärke') : t('Konturstärke')}>
        <NumberInput
          value={(el.props.strokeWidth as number) || undefined}
          placeholder={line ? 3 : 0}
          min={0}
          max={40}
          step={0.5}
          suffix="px"
          onChange={(v) => set({ strokeWidth: v ?? 0 })}
          ariaLabel={line ? t('Strichstärke') : t('Konturstärke')}
        />
      </Field>
      <p className="xsmall faint">{t('Grösse, Drehung und Deckkraft stellst du unter «Design» ein. Auf einer freien Fläche ziehst du die Form an ihren Platz.')}</p>
    </div>
  );
}

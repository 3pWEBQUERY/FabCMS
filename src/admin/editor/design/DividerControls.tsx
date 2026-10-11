import { t } from '../../lib/i18n';
import { Toggle } from '../../ui/kit';
import { ColorInput, NumberInput } from './controls';
import { DIVIDER_HEIGHT, DIVIDER_SHAPES, dividerSvg, type Divider, type DividerShape, type Dividers } from '../../../shared/dividers';

const SHAPE_LABEL: Record<DividerShape, () => string> = {
  wave: () => t('Welle'),
  waves: () => t('Wellen'),
  curve: () => t('Bogen'),
  tilt: () => t('Schräg'),
  triangle: () => t('Spitze'),
  zigzag: () => t('Zickzack'),
  mountains: () => t('Berge'),
};

function Edge({ where, value, onChange }: { where: 'top' | 'bottom'; value: Divider | undefined; onChange: (d: Divider | undefined) => void }) {
  return (
    <div className="stack tight">
      <span className="small" style={{ fontWeight: 600 }}>
        {where === 'top' ? t('Oben') : t('Unten')}
      </span>
      <div className="div-shapes" role="group" aria-label={where === 'top' ? t('Form oben') : t('Form unten')}>
        <button type="button" className="chip" aria-pressed={!value} onClick={() => onChange(undefined)}>
          {t('Keine')}
        </button>
        {DIVIDER_SHAPES.map((shape) => (
          <button
            key={shape}
            type="button"
            className="div-shape"
            aria-pressed={value?.shape === shape}
            title={SHAPE_LABEL[shape]()}
            aria-label={SHAPE_LABEL[shape]()}
            onClick={() => onChange({ height: DIVIDER_HEIGHT.default, ...value, shape })}
          >
            <span className={where === 'top' ? 'div-prev top' : 'div-prev'} dangerouslySetInnerHTML={{ __html: dividerSvg(shape) }} />
          </button>
        ))}
      </div>
      {value && (
        <>
          <div className="dp-grid2">
            <NumberInput
              label={t('Höhe')}
              suffix="px"
              value={value.height}
              min={DIVIDER_HEIGHT.min}
              max={DIVIDER_HEIGHT.max}
              onChange={(h) => onChange({ ...value, height: h ?? DIVIDER_HEIGHT.default })}
              ariaLabel={t('Höhe')}
            />
            <ColorInput value={value.color} placeholder="$bg" onChange={(c) => onChange({ ...value, color: c })} ariaLabel={t('Farbe')} />
          </div>
          <Toggle checked={Boolean(value.flip)} onChange={(on) => onChange({ ...value, flip: on || undefined })} label={t('Spiegeln')} />
          <Toggle checked={Boolean(value.invert)} onChange={(on) => onChange({ ...value, invert: on || undefined })} label={t('Umdrehen')} />
          <Toggle checked={Boolean(value.front)} onChange={(on) => onChange({ ...value, front: on || undefined })} label={t('Vor dem Inhalt')} />
        </>
      )}
    </div>
  );
}

/**
 * «Formtrenner»: a wave, curve or slant along the top and bottom edge of a
 * section, in the colour of its neighbour – by default the page's background.
 */
export function DividerControls({ value, onChange }: { value: Dividers | undefined; onChange: (d: Dividers | undefined) => void }) {
  const set = (where: 'top' | 'bottom', d: Divider | undefined) => {
    const next: Dividers = { ...value, [where]: d };
    if (!d) delete next[where];
    onChange(next.top || next.bottom ? next : undefined);
  };
  return (
    <div className="stack">
      <span className="section-title">{t('Formtrenner')}</span>
      <Edge where="top" value={value?.top} onChange={(d) => set('top', d)} />
      <Edge where="bottom" value={value?.bottom} onChange={(d) => set('bottom', d)} />
      <p className="xsmall faint">{t('Färbe ihn wie den Bereich daneben, dann fliessen die beiden ineinander. Auf dem Handy wird er etwas flacher.')}</p>
    </div>
  );
}

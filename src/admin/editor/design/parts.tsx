import { useRef, useState } from 'react';
import type { Gradient, Shadow, StyleProps } from '../../../shared/design';
import { t } from '../../lib/i18n';
import { Icon } from '../../ui/icons';
import { Popover, Tip } from '../../ui/kit';
import { ColorInput, LengthInput, NumberInput, parseLength, useColorPreview, type TokenOption } from './controls';

/* ---------- spacing scale ---------- */

export const spaceTokens = (): TokenOption[] => [
  { value: '$s-1', label: 'XXS' },
  { value: '$s-2', label: 'XS' },
  { value: '$s-3', label: 'S' },
  { value: '$s-4', label: 'M' },
  { value: '$s-5', label: 'L' },
  { value: '$s-6', label: 'XL' },
  { value: '$s-7', label: 'XXL' },
  { value: '$sp-s', label: t('Abschnitt S') },
  { value: '$sp-m', label: t('Abschnitt M') },
  { value: '$sp-l', label: t('Abschnitt L') },
  { value: '$gutter', label: t('Seitenrand') },
];

const short = (v: string | undefined) => {
  if (v === undefined) return null;
  if (v.startsWith('$')) return spaceTokens().find((x) => x.value === v)?.label ?? v.slice(1);
  const p = parseLength(v);
  return p.n === null ? v : p.unit === 'px' ? String(p.n) : `${p.n}${p.unit}`;
};

type Side = 't' | 'r' | 'b' | 'l';
type BoxKey = 'mt' | 'mr' | 'mb' | 'ml' | 'pt' | 'pr' | 'pb' | 'pl';

/**
 * Margin and padding as two nested boxes, like Webflow. Drag a value to change
 * it (up/down for top and bottom, sideways for left and right); Shift changes
 * all four sides of that box, Alt the opposite side as well. Click for exact values.
 */
export function BoxModel({
  get,
  set,
  inherited,
}: {
  get: (k: BoxKey) => string | undefined;
  set: (patch: Partial<Record<BoxKey, string | undefined>>) => void;
  inherited: (k: BoxKey) => string | undefined;
}) {
  const cell = (box: 'm' | 'p', side: Side) => <BoxValue key={box + side} box={box} side={side} get={get} set={set} inherited={inherited} />;
  return (
    <div className="dp-box" role="group" aria-label={t('Abstände')}>
      <span className="dp-box-tag">{t('Aussen')}</span>
      <div className="dp-box-t">{cell('m', 't')}</div>
      <div className="dp-box-l">{cell('m', 'l')}</div>
      <div className="dp-box-in">
        <span className="dp-box-tag">{t('Innen')}</span>
        <div className="dp-box-t">{cell('p', 't')}</div>
        <div className="dp-box-l">{cell('p', 'l')}</div>
        <div className="dp-box-core" />
        <div className="dp-box-r">{cell('p', 'r')}</div>
        <div className="dp-box-b">{cell('p', 'b')}</div>
      </div>
      <div className="dp-box-r">{cell('m', 'r')}</div>
      <div className="dp-box-b">{cell('m', 'b')}</div>
    </div>
  );
}

const OPP: Record<Side, Side> = { t: 'b', b: 't', l: 'r', r: 'l' };
const sideName = (s: Side) => ({ t: t('oben'), r: t('rechts'), b: t('unten'), l: t('links') })[s];

function BoxValue({
  box,
  side,
  get,
  set,
  inherited,
}: {
  box: 'm' | 'p';
  side: Side;
  get: (k: BoxKey) => string | undefined;
  set: (patch: Partial<Record<BoxKey, string | undefined>>) => void;
  inherited: (k: BoxKey) => string | undefined;
}) {
  const key = `${box}${side}` as BoxKey;
  const own = get(key);
  const inh = inherited(key);
  const start = useRef<{ x: number; y: number; n: number; unit: string; moved: boolean } | null>(null);
  const [open, setOpen] = useState(false);
  const label = `${box === 'm' ? t('Aussenabstand') : t('Innenabstand')} ${sideName(side)}`;
  const targets = (e: { shiftKey: boolean; altKey: boolean }): BoxKey[] =>
    e.shiftKey ? (['t', 'r', 'b', 'l'] as Side[]).map((s) => `${box}${s}` as BoxKey) : e.altKey ? [key, `${box}${OPP[side]}` as BoxKey] : [key];
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="center"
      trigger={
        <button
          type="button"
          className={`dp-box-v ${own !== undefined ? 'set' : inh !== undefined ? 'inherited' : ''} ${side === 't' || side === 'b' ? 'v' : 'h'}`}
          aria-label={`${label}: ${short(own ?? inh) ?? t('nicht gesetzt')}`}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            const p = parseLength(own ?? inh);
            start.current = { x: e.clientX, y: e.clientY, n: p.n ?? 0, unit: p.n === null ? 'px' : p.unit, moved: false };
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const s = start.current;
            if (!s) return;
            const dist = side === 't' || side === 'b' ? s.y - e.clientY : side === 'l' ? s.x - e.clientX : e.clientX - s.x;
            if (!s.moved && Math.abs(dist) < 3) return;
            if (!s.moved) document.body.classList.add('scrubbing', side === 't' || side === 'b' ? 'v' : 'h');
            s.moved = true;
            const step = s.unit === 'px' ? 1 : s.unit === 'rem' ? 0.125 : 1;
            const n = Math.round((s.n + Math.round(dist / 2) * step) * 1000) / 1000;
            const v = `${box === 'p' ? Math.max(0, n) : n}${s.unit}`;
            set(Object.fromEntries(targets(e).map((k) => [k, v])));
          }}
          onPointerUp={(e) => {
            const s = start.current;
            start.current = null;
            document.body.classList.remove('scrubbing', 'v', 'h');
            if (s?.moved) {
              e.preventDefault();
              // A drag is not a click: keep the popover closed.
              setTimeout(() => setOpen(false));
            }
          }}
        >
          {short(own ?? inh) ?? '–'}
        </button>
      }
    >
      <div className="dp-box-pop">
        <span className="dp-menu-head">{label}</span>
        <LengthInput value={own} placeholder={inh} onChange={(v) => set({ [key]: v })} ariaLabel={label} keywords={box === 'm' ? ['auto'] : []} min={box === 'p' ? 0 : -Infinity} />
        <div className="dp-chips">
          {spaceTokens()
            .slice(0, 7)
            .map((o) => (
              <button key={o.value} type="button" className="chip" aria-pressed={own === o.value} onClick={() => set({ [key]: o.value })}>
                {o.label}
              </button>
            ))}
        </div>
        <div className="dp-chips">
          {spaceTokens()
            .slice(7)
            .map((o) => (
              <button key={o.value} type="button" className="chip" aria-pressed={own === o.value} onClick={() => set({ [key]: o.value })}>
                {o.label}
              </button>
            ))}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button
            type="button"
            className="btn s ghost"
            onClick={() => set(Object.fromEntries((['t', 'r', 'b', 'l'] as Side[]).map((s) => [`${box}${s}`, own])))}
            disabled={own === undefined}
          >
            {t('Für alle Seiten')}
          </button>
          <button type="button" className="btn s ghost" onClick={() => set({ [key]: undefined })} disabled={own === undefined}>
            {t('Zurücksetzen')}
          </button>
        </div>
      </div>
    </Popover>
  );
}

/* ---------- gradient ---------- */

export const gradientPresets = (): { label: string; g: Gradient }[] => [
  {
    label: t('Akzent ausblenden'),
    g: {
      type: 'linear',
      angle: 180,
      stops: [
        { color: '$accent/24', at: 0 },
        { color: '$accent/0', at: 100 },
      ],
    },
  },
  {
    label: t('Fläche zu Hintergrund'),
    g: {
      type: 'linear',
      angle: 160,
      stops: [
        { color: '$surface', at: 0 },
        { color: '$bg', at: 100 },
      ],
    },
  },
  {
    label: t('Dunkel zu Akzent'),
    g: {
      type: 'linear',
      angle: 135,
      stops: [
        { color: '$inv-bg', at: 30 },
        { color: '$accent', at: 100 },
      ],
    },
  },
  {
    label: t('Leuchten'),
    g: {
      type: 'radial',
      stops: [
        { color: '$accent/30', at: 0 },
        { color: '$accent/0', at: 70 },
      ],
    },
  },
];

export function gradientPreviewCss(g: Gradient, preview: (c: string) => string | null): string {
  const stops = g.stops.map((s) => `${preview(s.color) ?? 'transparent'} ${s.at}%`).join(', ');
  return g.type === 'radial' ? `radial-gradient(circle at center, ${stops})` : `linear-gradient(${g.angle ?? 180}deg, ${stops})`;
}

export function GradientEditor({ value, onChange }: { value: Gradient | undefined; onChange: (g: Gradient | undefined) => void }) {
  const preview = useColorPreview();
  const [sel, setSel] = useState(0);
  const bar = useRef<HTMLDivElement>(null);
  const dial = useRef<HTMLDivElement>(null);
  if (!value)
    return (
      <div className="dp-grad-presets">
        {gradientPresets().map((p) => (
          <Tip key={p.label} label={p.label}>
            <button type="button" aria-label={p.label} style={{ background: gradientPreviewCss(p.g, preview) }} onClick={() => onChange(p.g)} />
          </Tip>
        ))}
        <Tip label={t('Eigener Verlauf')}>
          <button
            type="button"
            className="add"
            aria-label={t('Eigener Verlauf')}
            onClick={() =>
              onChange({
                type: 'linear',
                angle: 180,
                stops: [
                  { color: '$bg', at: 0 },
                  { color: '$accent', at: 100 },
                ],
              })
            }
          >
            <Icon name="plus" size="s" />
          </button>
        </Tip>
      </div>
    );
  const stops = value.stops;
  const cur = stops[Math.min(sel, stops.length - 1)];
  const setStops = (next: Gradient['stops']) => onChange({ ...value, stops: next });
  const pct = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.round(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };
  const angleAt = (e: { clientX: number; clientY: number }) => {
    const r = dial.current!.getBoundingClientRect();
    const a = (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI + 90;
    return Math.round(((a + 360) % 360) / 5) * 5;
  };
  return (
    <div className="dp-grad">
      <div className="row" style={{ gap: 6 }}>
        <div className="dp-choice" role="group" aria-label={t('Verlaufsart')}>
          <button type="button" aria-pressed={value.type === 'linear'} onClick={() => onChange({ ...value, type: 'linear' })}>
            {t('Linear')}
          </button>
          <button type="button" aria-pressed={value.type === 'radial'} onClick={() => onChange({ ...value, type: 'radial' })}>
            {t('Kreis')}
          </button>
        </div>
        {value.type === 'linear' && (
          <>
            <div
              ref={dial}
              className="dp-dial"
              role="slider"
              tabIndex={0}
              aria-label={t('Winkel')}
              aria-valuenow={value.angle ?? 180}
              aria-valuemin={0}
              aria-valuemax={360}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                onChange({ ...value, angle: angleAt(e) });
              }}
              onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && onChange({ ...value, angle: angleAt(e) })}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange({ ...value, angle: ((value.angle ?? 180) + 15) % 360 });
                if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange({ ...value, angle: ((value.angle ?? 180) + 345) % 360 });
              }}
            >
              <span style={{ transform: `rotate(${value.angle ?? 180}deg)` }} />
            </div>
            <NumberInput value={value.angle ?? 180} onChange={(a) => onChange({ ...value, angle: a ?? 180 })} min={0} max={360} suffix="°" ariaLabel={t('Winkel')} />
          </>
        )}
        <span className="grow" />
        <Tip label={t('Verlauf entfernen')}>
          <button type="button" className="btn ghost s icon-only" aria-label={t('Verlauf entfernen')} onClick={() => onChange(undefined)}>
            <Icon name="trash" size="s" />
          </button>
        </Tip>
      </div>
      <div
        ref={bar}
        className="dp-grad-bar"
        style={{ background: gradientPreviewCss({ ...value, type: 'linear', angle: 90 }, preview) }}
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget || stops.length >= 5) return;
          const at = pct(e.clientX);
          setStops([...stops, { color: cur.color, at }].sort((a, b) => a.at - b.at));
          setSel(stops.filter((s) => s.at < at).length);
        }}
      >
        {stops.map((s, i) => (
          <button
            key={i}
            type="button"
            className="dp-stop"
            aria-pressed={i === sel}
            aria-label={t('Farbstopp {n}', { n: i + 1 })}
            style={{ left: `${s.at}%`, ['--c' as string]: preview(s.color) ?? 'transparent' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              setSel(i);
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
              setStops(stops.map((x, j) => (j === i ? { ...x, at: pct(e.clientX) } : x)));
            }}
            onKeyDown={(e) => {
              if ((e.key === 'Delete' || e.key === 'Backspace') && stops.length > 2) {
                setStops(stops.filter((_, j) => j !== i));
                setSel(0);
              }
            }}
          />
        ))}
      </div>
      <div className="row" style={{ gap: 6 }}>
        <ColorInput
          value={cur.color}
          onChange={(c) => c && setStops(stops.map((x, j) => (j === sel ? { ...x, color: c } : x)))}
          ariaLabel={t('Farbe des Stopps')}
          allowNone={false}
        />
        <NumberInput
          value={cur.at}
          onChange={(n) => setStops(stops.map((x, j) => (j === sel ? { ...x, at: n ?? 0 } : x)))}
          min={0}
          max={100}
          suffix="%"
          ariaLabel={t('Position des Stopps')}
        />
        {stops.length > 2 && (
          <Tip label={t('Stopp entfernen')}>
            <button
              type="button"
              className="btn ghost s icon-only"
              aria-label={t('Stopp entfernen')}
              onClick={() => {
                setStops(stops.filter((_, j) => j !== sel));
                setSel(0);
              }}
            >
              <Icon name="x" size="s" />
            </button>
          </Tip>
        )}
      </div>
      <p className="xsmall faint">{t('Klick auf den Balken fügt einen Stopp hinzu.')}</p>
    </div>
  );
}

/* ---------- shadow ---------- */

export function ShadowEditor({
  value,
  inherited,
  onChange,
}: {
  value: StyleProps['shadow'];
  inherited: StyleProps['shadow'];
  onChange: (s: StyleProps['shadow'] | undefined) => void;
}) {
  const cur = value ?? inherited;
  const custom = typeof cur === 'object' ? cur : null;
  const presets: { v: Exclude<StyleProps['shadow'], Shadow | undefined>; label: string }[] = [
    { v: 'none', label: t('Keiner') },
    { v: 's', label: 'S' },
    { v: 'm', label: 'M' },
    { v: 'l', label: 'L' },
    { v: 'xl', label: 'XL' },
  ];
  const patch = (p: Partial<Shadow>) => onChange({ ...(custom ?? { x: 0, y: 8, blur: 24, spread: -4, color: '$ink/20' }), ...p });
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="dp-choice" role="group" aria-label={t('Schatten')}>
        {presets.map((p) => (
          <button
            key={p.v}
            type="button"
            aria-pressed={value === p.v}
            className={value === undefined && inherited === p.v ? 'inherited' : ''}
            onClick={() => onChange(value === p.v ? undefined : p.v)}
          >
            {p.label}
          </button>
        ))}
        <button type="button" aria-pressed={typeof value === 'object'} onClick={() => patch({})}>
          {t('Eigener')}
        </button>
      </div>
      {custom && (
        <div className="dp-grid2">
          <NumberInput value={custom.x} onChange={(n) => patch({ x: n ?? 0 })} label="X" suffix="px" ariaLabel={t('Versatz X')} min={-200} max={200} />
          <NumberInput value={custom.y} onChange={(n) => patch({ y: n ?? 0 })} label="Y" suffix="px" ariaLabel={t('Versatz Y')} min={-200} max={200} />
          <NumberInput value={custom.blur} onChange={(n) => patch({ blur: n ?? 0 })} icon="blur" suffix="px" ariaLabel={t('Unschärfe')} min={0} max={300} />
          <NumberInput value={custom.spread} onChange={(n) => patch({ spread: n ?? 0 })} icon="spread" suffix="px" ariaLabel={t('Ausdehnung')} min={-100} max={100} />
          <div style={{ gridColumn: '1 / -1' }} className="row">
            <ColorInput value={custom.color} onChange={(c) => patch({ color: c ?? '$ink/20' })} ariaLabel={t('Schattenfarbe')} allowNone={false} />
            <label className="row xsmall" style={{ gap: 6 }}>
              <input type="checkbox" checked={Boolean(custom.inset)} onChange={(e) => patch({ inset: e.target.checked })} />
              {t('Innen')}
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- background position ---------- */

const POSITIONS = ['left top', 'top', 'right top', 'left', 'center', 'right', 'left bottom', 'bottom', 'right bottom'];

export function PositionGrid({ value, inherited, onChange }: { value: string | undefined; inherited?: string; onChange: (v: string | undefined) => void }) {
  const cur = value ?? inherited ?? 'center';
  return (
    <div className="dp-pos" role="radiogroup" aria-label={t('Bildausschnitt')}>
      {POSITIONS.map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={cur === p}
          aria-label={p}
          className={value === undefined && cur === p ? 'inherited' : ''}
          onClick={() => onChange(value === p ? undefined : p)}
        >
          <span />
        </button>
      ))}
    </div>
  );
}

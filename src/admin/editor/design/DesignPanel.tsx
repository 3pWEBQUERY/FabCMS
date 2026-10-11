import type { CSSProperties, ReactNode } from 'react';
import type { ElKind } from '../../../shared/elements';
import {
  BLENDS,
  colRatios,
  DESIGN_BPS,
  effective,
  isEmptyDesign,
  setDesign,
  SHAPE_CUTS,
  SIZE_TOKENS,
  type Design,
  type DesignBp,
  type DesignState,
  type StyleProps,
} from '../../../shared/design';
import { t } from '../../lib/i18n';
import { Icon } from '../../ui/icons';
import { Menu, Select, Tip } from '../../ui/kit';
import { MediaField } from '../../ui/FieldInput';
import { ContrastNote } from './contrast';
import { useToast } from '../../ui/toast';
import { ColorInput, DesignSection, IconChoice, LengthInput, NumberInput, PropRow, useColorPreview } from './controls';
import { BoxModel, GradientEditor, gradientPreviewCss, overlayPresets, PositionGrid, ShadowEditor, spaceTokens } from './parts';

export type DesignTarget = 'block' | 'element';

const bpLabel = (b: DesignBp | 'normal') => ({ desktop: t('Computer'), tablet: t('Tablet'), mobile: t('Handy'), normal: t('Normal') })[b];

/** What can change on hover – colours, borders and effects; layout stays put. */
const HOVER_KEYS = new Set<keyof StyleProps>([
  'color',
  'accent',
  'bg',
  'gradient',
  'overlay',
  'borderColor',
  'borderWidth',
  'shadow',
  'opacity',
  'blur',
  'grayscale',
  'saturate',
  'brightness',
  'textGradient',
  'rotate',
  'scale',
  'x',
  'y',
  'textShadow',
  'rotateX',
  'rotateY',
  'skew',
]);

export const SECTIONS: Record<string, (keyof StyleProps)[]> = {
  layout: [
    'display',
    'direction',
    'wrap',
    'justify',
    'align',
    'gap',
    'columns',
    'colWidths',
    'rows',
    'autoFlow',
    'alignSelf',
    'grow',
    'order',
    'span',
    'colStart',
    'rowStart',
    'rowSpan',
  ],
  spacing: ['mt', 'mr', 'mb', 'ml', 'pt', 'pr', 'pb', 'pl'],
  size: ['width', 'minWidth', 'maxWidth', 'height', 'minHeight', 'maxHeight', 'contentWidth', 'aspect', 'overflow', 'fit', 'vAlign'],
  position: ['position', 'top', 'right', 'bottom', 'left', 'z'],
  type: [
    'font',
    'fontSize',
    'weight',
    'lineHeight',
    'tracking',
    'textAlign',
    'textTransform',
    'italic',
    'underline',
    'color',
    'textGradient',
    'accent',
    'textShadow',
    'textColumns',
  ],
  background: ['bg', 'gradient', 'bgImage', 'bgSize', 'bgPosition', 'bgRepeat', 'bgFixed', 'overlay', 'overlayGradient'],
  border: ['borderWidth', 'borderStyle', 'borderColor', 'borderSides', 'radius', 'radiusTL', 'radiusTR', 'radiusBR', 'radiusBL'],
  effects: [
    'shadow',
    'opacity',
    'blur',
    'grayscale',
    'saturate',
    'brightness',
    'blend',
    'shape',
    'backdrop',
    'rotate',
    'scale',
    'x',
    'y',
    'rotateX',
    'rotateY',
    'skew',
    'perspective',
    'cursor',
  ],
};

const CLIPBOARD = 'nova-design-clipboard';

/** Elements whose text can carry a gradient. */
const TEXT_KINDS = new Set(['heading', 'text', 'button', 'counter', 'marquee']);

const blendLabel = (b: string) =>
  (
    ({
      normal: t('Normal'),
      multiply: t('Multiplizieren'),
      screen: t('Negativ multiplizieren'),
      overlay: t('Überlagern'),
      darken: t('Abdunkeln'),
      lighten: t('Aufhellen'),
      difference: t('Differenz'),
      exclusion: t('Ausschluss'),
      luminosity: t('Luminanz'),
      color: t('Farbe'),
    }) as Record<string, string>
  )[b] ?? b;

const shapeLabel = (v: string) =>
  (
    ({
      none: t('Keine Form'),
      circle: t('Kreis'),
      arch: t('Bogen'),
      diamond: t('Raute'),
      slant: t('Schräge Kante'),
      blob: t('Organisch'),
      hexagon: t('Sechseck'),
    }) as Record<string, string>
  )[v] ?? v;

/** Ready-made looks for a whole section – one click, then fine-tune. */
const quickStyles = (): { id: string; label: string; look: StyleProps; thumb: (p: (c: string) => string | null) => CSSProperties }[] => [
  {
    id: 'card',
    label: t('Schwebende Karte'),
    look: { bg: '$surface', radius: '28px', ml: '$gutter', mr: '$gutter', shadow: 'l', mt: '$s-5', mb: '$s-5' },
    thumb: (p) => ({ background: p('$bg') ?? '', boxShadow: `inset 0 0 0 5px ${p('$bg')}, inset 0 0 0 40px ${p('$surface')}` }),
  },
  { id: 'accent', label: t('Akzentfläche'), look: { bg: '$accent', color: '$accent-ink', accent: '$accent-ink' }, thumb: (p) => ({ background: p('$accent') ?? '' }) },
  { id: 'inverse', label: t('Umgekehrt'), look: { bg: '$inv-bg', color: '$inv-ink' }, thumb: (p) => ({ background: p('$inv-bg') ?? '' }) },
  {
    id: 'glow',
    label: t('Leuchten'),
    look: {
      gradient: {
        type: 'radial',
        stops: [
          { color: '$accent/28', at: 0 },
          { color: '$accent/0', at: 65 },
        ],
      },
    },
    thumb: (p) => ({ background: `radial-gradient(circle, ${p('$accent/28') ?? ''}, ${p('$bg') ?? ''} 65%)` }),
  },
  {
    id: 'glass',
    label: t('Glas'),
    look: { bg: '$surface/55', backdrop: '18px', borderWidth: '1px', borderColor: '$line', radius: '28px', ml: '$gutter', mr: '$gutter' },
    thumb: (p) => ({ background: `linear-gradient(135deg, ${p('$accent/40')}, ${p('$surface/60')})`, outline: `1px solid ${p('$line')}`, outlineOffset: -5 }),
  },
  {
    id: 'full',
    label: t('Ganzer Bildschirm'),
    look: { minHeight: '100svh', vAlign: 'center' },
    thumb: (p) => ({ background: p('$surface') ?? '', borderTop: `8px solid ${p('$line')}` }),
  },
];

export interface DesignPanelProps {
  design: Design | undefined;
  onChange: (d: Design) => void;
  target: DesignTarget;
  bp: DesignBp;
  onBp: (b: DesignBp) => void;
  state: DesignState;
  onState: (s: DesignState) => void;
  /** Block extras: colour scheme, rhythm and visibility – the simple choices that were there before. */
  scheme?: ReactNode;
  /** Blocks: a video or slideshow behind the content (not per screen size). */
  bgMedia?: ReactNode;
  /** Blocks: shape dividers along the top and bottom edge. */
  dividers?: ReactNode;
  rhythm?: ReactNode;
  visibility?: ReactNode;
  pro: boolean;
  /** Elements: which kind – containers are flex columns unless set otherwise. */
  kind?: ElKind;
  /** The saved style in use and whether the panel changes it (design/SavedStyles.tsx). */
  savedStyle?: ReactNode;
}

/** Column splits offered per column count; the first is always «all equal». */
const equalCols = (n: number) => Array(n).fill('1').join(' ');
const COL_PRESETS: Record<number, string[]> = {
  2: ['1 1', '1 2', '2 1', '1 3', '3 1', '2 3', '3 2'],
  3: ['1 1 1', '1 2 1', '2 1 1', '1 1 2', '1 3 1'],
  4: ['1 1 1 1', '2 1 1 1', '1 1 1 2', '1 2 2 1'],
  5: ['1 1 1 1 1'],
  6: ['1 1 1 1 1 1'],
};

export function DesignPanel({ design, onChange, target, bp, onBp, state, onState, scheme, bgMedia, dividers, rhythm, visibility, pro, kind, savedStyle }: DesignPanelProps) {
  const toast = useToast();
  const preview = useColorPreview();
  const layer: DesignBp | 'hover' = state === 'hover' ? 'hover' : bp;
  const hover = state === 'hover';
  const block = target === 'block';

  const prop = <K extends keyof StyleProps>(key: K) => {
    const own = design?.[layer]?.[key];
    const inh = hover ? effective(design, bp, key) : bp === 'desktop' ? { value: undefined, from: null } : effective(design, bp === 'mobile' ? 'tablet' : 'desktop', key);
    return {
      value: own,
      inherited: inh.value as StyleProps[K] | undefined,
      state: (own !== undefined ? 'set' : inh.value !== undefined ? 'inherited' : 'none') as 'set' | 'inherited' | 'none',
      from: hover ? bpLabel('normal') : inh.from ? bpLabel(inh.from) : undefined,
      set: (v: StyleProps[K] | undefined) => onChange(setDesign(design, layer, key, v)),
    };
  };
  const setMany = (patch: Partial<StyleProps>) => {
    let d = design ?? {};
    for (const [k, v] of Object.entries(patch)) d = setDesign(d, layer, k as keyof StyleProps, v as never);
    onChange(d);
  };
  // Containers of the free layout are flex columns until someone says otherwise.
  const container = kind === 'box' || kind === 'list';
  const display = prop('display').value ?? prop('display').inherited ?? (kind === 'box' ? 'flex' : kind === 'list' ? 'grid' : undefined);
  const count = (sec: string) => SECTIONS[sec].filter((k) => design?.[layer]?.[k] !== undefined).length;
  const show = (k: keyof StyleProps) => !hover || HOVER_KEYS.has(k);

  const row = <K extends keyof StyleProps>(key: K, label: string, control: (p: ReturnType<typeof prop<K>>) => ReactNode, wide = false) => {
    if (!show(key)) return null;
    const p = prop(key);
    return (
      <PropRow key={key} label={label} state={p.state} from={p.from} onReset={() => p.set(undefined)} wide={wide}>
        {control(p)}
      </PropRow>
    );
  };
  const len = (key: keyof StyleProps, label: string, opts: { keywords?: string[]; tokens?: { value: string; label: string }[]; units?: string[]; min?: number } = {}) =>
    row(key, label, (p) => (
      <LengthInput
        value={p.value as string | undefined}
        placeholder={p.inherited as string | undefined}
        onChange={(v) => p.set(v as never)}
        ariaLabel={label}
        keywords={opts.keywords}
        tokens={opts.tokens}
        units={opts.units}
        min={opts.min}
      />
    ));
  const color = (key: 'color' | 'accent' | 'bg' | 'overlay' | 'borderColor', label: string) =>
    row(key, label, (p) => <ColorInput value={p.value} placeholder={p.inherited} onChange={(v) => p.set(v)} ariaLabel={label} />);

  const layerHasValues = (b: DesignBp | 'hover') => Boolean(design?.[b] && Object.keys(design[b]!).length);

  const copy = () => {
    try {
      localStorage.setItem(CLIPBOARD, JSON.stringify(design ?? {}));
      toast(t('Design kopiert.'));
    } catch {
      /* storage unavailable */
    }
  };
  const paste = () => {
    try {
      const d = JSON.parse(localStorage.getItem(CLIPBOARD) ?? 'null') as Design | null;
      if (d) {
        onChange(d);
        toast(t('Design eingefügt.'));
      }
    } catch {
      /* nothing to paste */
    }
  };

  const sizeTokens = SIZE_TOKENS.map((s) => ({ value: `$${s}`, label: s === 'step-0' ? t('Text') : s.replace('step-n', '−').replace('step-', 'T') }));

  return (
    <div className="dp">
      {savedStyle}
      <div className="dp-top">
        <div className="dp-bps" role="group" aria-label={t('Bildschirmgrösse')}>
          {DESIGN_BPS.map((b) => (
            <Tip key={b} label={b === 'desktop' ? t('Computer – gilt für alle, wenn nichts anderes gesetzt ist') : b === 'tablet' ? t('Tablet und kleiner') : t('Handy')}>
              <button type="button" aria-pressed={bp === b} aria-label={bpLabel(b)} onClick={() => onBp(b)}>
                <Icon name={b === 'mobile' ? 'phone' : b} size="s" />
                {layerHasValues(b) && <span className="dp-has" />}
              </button>
            </Tip>
          ))}
        </div>
        <div className="dp-bps" role="group" aria-label={t('Zustand')}>
          <button type="button" aria-pressed={!hover} onClick={() => onState('normal')}>
            {t('Normal')}
          </button>
          <button type="button" aria-pressed={hover} onClick={() => onState('hover')}>
            <Icon name="cursor" size="s" />
            {t('Hover')}
            {layerHasValues('hover') && <span className="dp-has" />}
          </button>
        </div>
        <span className="grow" />
        <Menu
          trigger={
            <button type="button" className="btn ghost s icon-only" aria-label={t('Design-Aktionen')}>
              <Icon name="more" />
            </button>
          }
          items={[
            { label: t('Design kopieren'), icon: 'copy', onSelect: copy, hidden: isEmptyDesign(design) },
            { label: t('Design einfügen'), icon: 'download', onSelect: paste },
            'sep',
            {
              label: hover ? t('Hover zurücksetzen') : t('{bp} zurücksetzen', { bp: bpLabel(bp) }),
              icon: 'undo',
              onSelect: () => {
                const d = { ...(design ?? {}) };
                delete d[layer];
                onChange(d);
              },
              hidden: !layerHasValues(layer),
            },
            { label: t('Ganzes Design zurücksetzen'), icon: 'trash', danger: true, onSelect: () => onChange({}), hidden: isEmptyDesign(design) },
          ]}
        />
      </div>
      {(bp !== 'desktop' || hover) && (
        <p className="dp-note">
          <Icon name={hover ? 'cursor' : bp === 'mobile' ? 'phone' : 'tablet'} size="s" />
          {hover
            ? t('Du gestaltest den Hover-Zustand: wie es aussieht, wenn die Maus darüber ist.')
            : bp === 'tablet'
              ? t('Änderungen gelten nur für Tablets und Handys. Der Rest kommt vom Computer.')
              : t('Änderungen gelten nur für Handys.')}
        </p>
      )}

      {block && bp === 'desktop' && !hover && (
        <div className="dp-quick" role="group" aria-label={t('Schnellstile')}>
          {quickStyles().map((q) => (
            <Tip key={q.id} label={q.label}>
              <button type="button" aria-label={q.label} onClick={() => setMany(q.look)}>
                <span style={q.thumb(preview)} />
              </button>
            </Tip>
          ))}
        </div>
      )}

      {!block && (
        <DesignSection id="layout" title={container ? t('Layout') : t('Im Container')} icon="columns" count={count('layout')} defaultOpen={container}>
          {container &&
            row('display', t('Anordnung'), (p) => (
              <IconChoice
                label={t('Anordnung')}
                value={p.value}
                inherited={p.inherited}
                onChange={p.set}
                options={[
                  { value: 'block', icon: 'dirBlock', label: t('Untereinander') },
                  { value: 'flex', icon: 'dirRow', label: t('Flexibel (Flexbox)') },
                  { value: 'grid', icon: 'grid', label: t('Raster (Grid)') },
                  { value: 'none', icon: 'eyeOff', label: t('Ausblenden') },
                ]}
              />
            ))}
          {container && display === 'flex' && (
            <>
              {row('direction', t('Richtung'), (p) => (
                <IconChoice
                  label={t('Richtung')}
                  value={p.value}
                  inherited={p.inherited}
                  onChange={p.set}
                  options={[
                    { value: 'row', icon: 'dirRow', label: t('Nebeneinander') },
                    { value: 'column', icon: 'dirColumn', label: t('Untereinander') },
                    { value: 'row-reverse', icon: 'dirRowRev', label: t('Nebeneinander, umgekehrt') },
                    { value: 'column-reverse', icon: 'dirColumnRev', label: t('Untereinander, umgekehrt') },
                  ]}
                />
              ))}
              {row('wrap', t('Umbrechen'), (p) => (
                <IconChoice
                  label={t('Umbrechen')}
                  value={p.value === undefined ? undefined : p.value ? 'yes' : 'no'}
                  inherited={p.inherited === undefined ? undefined : p.inherited ? 'yes' : 'no'}
                  onChange={(v) => p.set(v === undefined ? undefined : v === 'yes')}
                  options={[
                    { value: 'no', text: t('Nein'), label: t('Alles auf einer Linie') },
                    { value: 'yes', text: t('Ja'), label: t('In die nächste Zeile umbrechen') },
                  ]}
                />
              ))}
            </>
          )}
          {container &&
            display === 'grid' &&
            row('columns', t('Spalten'), (p) => (
              <NumberInput
                value={p.value}
                placeholder={p.inherited ?? colRatios(prop('colWidths').value ?? prop('colWidths').inherited)?.length}
                // A new count starts with equal columns again on this screen size.
                onChange={(n) => setMany({ columns: n, colWidths: undefined })}
                min={1}
                max={12}
                ariaLabel={t('Spalten')}
                icon="columns"
              />
            ))}
          {container &&
            display === 'grid' &&
            row('colWidths', t('Aufteilung'), (p) => {
              const count = colRatios(p.value ?? p.inherited)?.length ?? prop('columns').value ?? prop('columns').inherited ?? 1;
              const presets = COL_PRESETS[count] ?? [];
              return count < 2 ? (
                <span className="xsmall faint">{t('Erst ab zwei Spalten.')}</span>
              ) : (
                <div className="stack" style={{ gap: 6 }}>
                  <input
                    className="input mono"
                    value={p.value ?? ''}
                    placeholder={p.inherited ?? equalCols(count)}
                    aria-label={t('Aufteilung als Verhältnis')}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d. ]/g, '').replace(/\s+/g, ' ');
                      const ok = colRatios(v);
                      setMany(ok ? { colWidths: v.trim(), columns: ok.length } : { colWidths: v.trim() ? v : undefined });
                    }}
                  />
                  <div className="dp-chips">
                    {presets.map((v) => (
                      <button
                        key={v}
                        type="button"
                        className="col-preset"
                        aria-pressed={(p.value ?? p.inherited ?? equalCols(count)) === v}
                        title={v.split(' ').join(' : ')}
                        aria-label={t('Aufteilung {ratio}', { ratio: v.split(' ').join(' : ') })}
                        onClick={() => setMany({ columns: count, colWidths: v === equalCols(count) ? undefined : v })}
                      >
                        {v.split(' ').map((w, i) => (
                          <span key={i} style={{ flexGrow: Number(w) }} />
                        ))}
                      </button>
                    ))}
                  </div>
                  <p className="xsmall faint">{t('Verhältnis der Spalten, z. B. «1 2» für ein Drittel und zwei Drittel. Auf der Fläche lassen sich die Grenzen auch ziehen.')}</p>
                </div>
              );
            })}
          {container && display === 'grid' && (
            <div className="dp-grid2">
              {row('rows', t('Zeilen'), (p) => (
                <NumberInput value={p.value} placeholder={p.inherited} onChange={p.set} min={1} max={24} ariaLabel={t('Zeilen')} />
              ))}
              {row('autoFlow', t('Füllen'), (p) => (
                <Select
                  value={p.value ?? ''}
                  onChange={(v) => p.set((v || undefined) as 'row' | 'dense' | 'column' | undefined)}
                  label={t('Füllen')}
                  options={[
                    { value: '', label: p.inherited ? t('Wie grösser') : t('Zeile um Zeile') },
                    { value: 'dense', label: t('Lücken füllen') },
                    { value: 'column', label: t('Spalte um Spalte') },
                  ]}
                />
              ))}
            </div>
          )}
          {container && ['flex', 'grid'].includes(String(display)) && (
            <>
              {row('justify', t('Verteilen'), (p) => (
                <IconChoice
                  label={t('Verteilen')}
                  value={p.value}
                  inherited={p.inherited}
                  onChange={p.set}
                  options={[
                    { value: 'start', icon: 'justStart', label: t('Am Anfang') },
                    { value: 'center', icon: 'justCenter', label: t('In der Mitte') },
                    { value: 'end', icon: 'justEnd', label: t('Am Ende') },
                    { value: 'between', icon: 'justBetween', label: t('Mit Abstand dazwischen') },
                  ]}
                />
              ))}
              {row('align', t('Ausrichten'), (p) => (
                <IconChoice
                  label={t('Ausrichten')}
                  value={p.value}
                  inherited={p.inherited}
                  onChange={p.set}
                  options={[
                    { value: 'start', icon: 'alignTop', label: t('Oben') },
                    { value: 'center', icon: 'alignMiddle', label: t('Mittig') },
                    { value: 'end', icon: 'alignBottom', label: t('Unten') },
                    { value: 'stretch', icon: 'alignStretch', label: t('Strecken') },
                  ]}
                />
              ))}
              {len('gap', t('Zwischenraum'), { tokens: spaceTokens(), min: 0 })}
            </>
          )}
          {row('alignSelf', t('Selbst ausrichten'), (p) => (
            <IconChoice
              label={t('Selbst ausrichten')}
              value={p.value}
              inherited={p.inherited}
              onChange={p.set}
              options={[
                { value: 'start', icon: 'alignTop', label: t('Oben') },
                { value: 'center', icon: 'alignMiddle', label: t('Mittig') },
                { value: 'end', icon: 'alignBottom', label: t('Unten') },
                { value: 'stretch', icon: 'alignStretch', label: t('Strecken') },
              ]}
            />
          ))}
          <div className="dp-grid2">
            {row('grow', t('Wachsen'), (p) => (
              <NumberInput value={p.value} placeholder={p.inherited} onChange={p.set} min={0} max={10} ariaLabel={t('Wachsen')} />
            ))}
            {row('order', t('Reihenfolge'), (p) => (
              <NumberInput value={p.value} placeholder={p.inherited} onChange={p.set} min={-20} max={20} ariaLabel={t('Reihenfolge')} />
            ))}
          </div>
          <span className="xsmall faint dp-sub">{t('Platz im Raster')}</span>
          <div className="dp-grid2">
            {row('colStart', t('Ab Spalte'), (p) => (
              <NumberInput value={p.value} placeholder={p.inherited} onChange={p.set} min={1} max={12} ariaLabel={t('Ab Spalte')} />
            ))}
            {row('span', t('Spalten breit'), (p) => (
              <NumberInput value={p.value} placeholder={p.inherited} onChange={p.set} min={1} max={12} ariaLabel={t('Spalten breit')} />
            ))}
            {row('rowStart', t('Ab Zeile'), (p) => (
              <NumberInput value={p.value} placeholder={p.inherited} onChange={p.set} min={1} max={24} ariaLabel={t('Ab Zeile')} />
            ))}
            {row('rowSpan', t('Zeilen hoch'), (p) => (
              <NumberInput value={p.value} placeholder={p.inherited} onChange={p.set} min={1} max={12} ariaLabel={t('Zeilen hoch')} />
            ))}
          </div>
        </DesignSection>
      )}

      {!hover && (
        <DesignSection id="spacing" title={t('Abstände')} icon="spacing" count={count('spacing')} defaultOpen>
          {block && rhythm}
          <BoxModel get={(k) => prop(k).value} inherited={(k) => prop(k).inherited} set={setMany} />
          <p className="xsmall faint">{t('Ziehen ändert den Wert. Mit Shift alle vier Seiten, mit Alt die gegenüberliegende dazu.')}</p>
        </DesignSection>
      )}

      {!hover && (
        <DesignSection id="size" title={t('Grösse')} icon="size" count={count('size')}>
          {block ? (
            <>
              {len('contentWidth', t('Inhaltsbreite'), { tokens: [{ value: '$measure', label: t('Lesebreite') }], units: ['rem', 'px', '%', 'vw'] })}
              {row('minHeight', t('Mindesthöhe'), (p) => (
                <div className="stack" style={{ gap: 6 }}>
                  <LengthInput value={p.value} placeholder={p.inherited} onChange={p.set} ariaLabel={t('Mindesthöhe')} units={['vh', 'svh', 'px', 'rem']} min={0} />
                  <div className="dp-chips">
                    {[
                      ['50svh', t('Halb')],
                      ['75svh', t('Dreiviertel')],
                      ['100svh', t('Ganzer Bildschirm')],
                    ].map(([v, l]) => (
                      <button key={v} type="button" className="chip" aria-pressed={p.value === v} onClick={() => p.set(p.value === v ? undefined : v)}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {row('vAlign', t('Inhalt'), (p) => (
                <IconChoice
                  label={t('Inhalt')}
                  value={p.value}
                  inherited={p.inherited}
                  onChange={p.set}
                  options={[
                    { value: 'start', icon: 'alignTop', label: t('Oben') },
                    { value: 'center', icon: 'alignMiddle', label: t('Mittig') },
                    { value: 'end', icon: 'alignBottom', label: t('Unten') },
                  ]}
                />
              ))}
              <p className="xsmall faint">
                {t(
                  'Auf der Fläche: Der Griff unten zieht die Höhe, die Griffe links und rechts die Inhaltsbreite – für die gewählte Bildschirmgrösse. Doppelklick setzt zurück, Shift zieht ohne Einrasten.',
                )}
              </p>
            </>
          ) : (
            <>
              <div className="dp-grid2">
                {len('width', t('Breite'), { keywords: ['auto'], min: 0 })}
                {len('height', t('Höhe'), { keywords: ['auto'], min: 0 })}
                {len('minWidth', t('Min. Breite'), { min: 0 })}
                {len('minHeight', t('Min. Höhe'), { min: 0 })}
                {len('maxWidth', t('Max. Breite'), { keywords: ['none'], tokens: [{ value: '$measure', label: t('Lesebreite') }], min: 0 })}
                {len('maxHeight', t('Max. Höhe'), { keywords: ['none'], min: 0 })}
              </div>
              {row('aspect', t('Seitenverhältnis'), (p) => (
                <div className="dp-chips">
                  {['1/1', '4/3', '3/2', '16/9', '21/9', '3/4'].map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`chip ${p.value === undefined && p.inherited === v ? 'inherited' : ''}`}
                      aria-pressed={p.value === v}
                      onClick={() => p.set(p.value === v ? undefined : v)}
                    >
                      {v.replace('/', ':')}
                    </button>
                  ))}
                </div>
              ))}
              {kind === 'image' &&
                row('fit', t('Bild füllen'), (p) => (
                  <IconChoice
                    label={t('Bild füllen')}
                    value={p.value}
                    inherited={p.inherited}
                    onChange={p.set}
                    options={[
                      { value: 'cover', text: t('Füllen'), label: t('Füllt die Fläche, schneidet zu') },
                      { value: 'contain', text: t('Ganz'), label: t('Ganzes Bild, mit Rand') },
                    ]}
                  />
                ))}
            </>
          )}
          {row('overflow', t('Überlauf'), (p) => (
            <IconChoice
              label={t('Überlauf')}
              value={p.value}
              inherited={p.inherited}
              onChange={p.set}
              options={[
                { value: 'visible', text: t('Zeigen'), label: t('Überstehendes zeigen') },
                { value: 'hidden', text: t('Abschneiden'), label: t('Überstehendes abschneiden') },
                { value: 'auto', text: t('Scrollen'), label: t('Bei Bedarf scrollen') },
              ]}
            />
          ))}
        </DesignSection>
      )}

      <ContrastNote onFix={(c) => prop('color').set(c)} />
      <DesignSection id="type" title={t('Text & Farben')} icon="type" count={count('type')} defaultOpen={block}>
        {color('color', t('Textfarbe'))}
        {!block &&
          TEXT_KINDS.has(kind ?? '') &&
          row(
            'textGradient',
            t('Verlaufstext'),
            (p) => (
              <>
                {p.value === undefined && p.inherited && <span className="dp-inh-grad" style={{ background: gradientPreviewCss(p.inherited, preview) }} />}
                <GradientEditor value={p.value} onChange={p.set} />
              </>
            ),
            true,
          )}
        {color('accent', t('Akzentfarbe'))}
        {!hover && (
          <>
            {row('font', t('Schrift'), (p) => (
              <IconChoice
                label={t('Schrift')}
                value={p.value}
                inherited={p.inherited}
                onChange={p.set}
                options={[
                  { value: 'display', text: t('Titel'), label: t('Titelschrift des Themes') },
                  { value: 'body', text: t('Text'), label: t('Textschrift des Themes') },
                  { value: 'mono', text: 'Mono', label: t('Schreibmaschine') },
                ]}
              />
            ))}
            <div className="dp-grid2">
              {len('fontSize', t('Grösse'), { tokens: sizeTokens, units: ['px', 'rem', 'em', 'vw'], min: 0 })}
              {row('weight', t('Gewicht'), (p) => (
                <NumberInput value={p.value} placeholder={p.inherited} onChange={p.set} min={100} max={900} step={100} ariaLabel={t('Gewicht')} />
              ))}
              {row('lineHeight', t('Zeilenhöhe'), (p) => (
                <NumberInput
                  value={p.value === undefined ? undefined : Number(p.value)}
                  placeholder={p.inherited === undefined ? undefined : Number(p.inherited)}
                  onChange={(n) => p.set(n === undefined ? undefined : String(n))}
                  min={0.8}
                  max={3}
                  step={0.05}
                  suffix="×"
                  ariaLabel={t('Zeilenhöhe')}
                />
              ))}
              {len('tracking', t('Laufweite'), { units: ['em', 'px'] })}
            </div>
            {row('textAlign', t('Ausrichtung'), (p) => (
              <IconChoice
                label={t('Ausrichtung')}
                value={p.value}
                inherited={p.inherited}
                onChange={p.set}
                options={[
                  { value: 'left', icon: 'textLeft', label: t('Links') },
                  { value: 'center', icon: 'textCenter', label: t('Mitte') },
                  { value: 'right', icon: 'textRight', label: t('Rechts') },
                  { value: 'justify', icon: 'textJustify', label: t('Blocksatz') },
                ]}
              />
            ))}
            {row('textTransform', t('Schreibung'), (p) => (
              <IconChoice
                label={t('Schreibung')}
                value={p.value}
                inherited={p.inherited}
                onChange={p.set}
                options={[
                  { value: 'none', text: 'Aa', label: t('Wie geschrieben') },
                  { value: 'uppercase', text: 'AA', label: t('Grossbuchstaben') },
                  { value: 'lowercase', text: 'aa', label: t('Kleinbuchstaben') },
                  { value: 'capitalize', text: 'Ab', label: t('Wortanfänge gross') },
                ]}
              />
            ))}
            {row('italic', t('Kursiv'), (p) => (
              <IconChoice
                label={t('Kursiv')}
                value={p.value === undefined ? undefined : p.value ? 'yes' : 'no'}
                inherited={p.inherited === undefined ? undefined : p.inherited ? 'yes' : 'no'}
                onChange={(v) => p.set(v === undefined ? undefined : v === 'yes')}
                options={[
                  { value: 'no', text: t('Gerade'), label: t('Gerade') },
                  { value: 'yes', text: t('Kursiv'), label: t('Kursiv') },
                ]}
              />
            ))}
            {row('textColumns', t('Textspalten'), (p) => (
              <NumberInput value={p.value} placeholder={p.inherited ?? 1} onChange={p.set} min={1} max={4} icon="columns" ariaLabel={t('Textspalten')} />
            ))}
          </>
        )}
        {row('textShadow', t('Textschatten'), (p) => (
          <IconChoice
            label={t('Textschatten')}
            value={p.value}
            inherited={p.inherited}
            onChange={p.set}
            options={[
              { value: 'none', text: t('Kein'), label: t('Kein Schatten') },
              { value: 's', text: 'S', label: t('Leicht') },
              { value: 'm', text: 'M', label: t('Mittel') },
              { value: 'l', text: 'L', label: t('Stark') },
              { value: 'glow', text: t('Leuchten'), label: t('Leuchten in der Akzentfarbe') },
            ]}
          />
        ))}
      </DesignSection>

      <DesignSection id="background" title={t('Hintergrund')} icon="paint" count={count('background')} defaultOpen={block}>
        {block && !hover && bp === 'desktop' && scheme}
        {color('bg', t('Farbe'))}
        {show('gradient') &&
          row(
            'gradient',
            t('Verlauf'),
            (p) => (
              <>
                {p.value === undefined && p.inherited && (
                  <span className="dp-inh-grad" style={{ background: gradientPreviewCss(p.inherited, preview) }} title={t('Übernommen von: {from}', { from: p.from ?? '' })} />
                )}
                <GradientEditor value={p.value} onChange={p.set} />
              </>
            ),
            true,
          )}
        {!hover && (
          <>
            {row(
              'bgImage',
              t('Bild'),
              (p) => (
                <MediaField value={p.value ?? null} type="image" onChange={(v) => p.set(v ?? undefined)} />
              ),
              true,
            )}
            {(prop('bgImage').value ?? prop('bgImage').inherited) && (
              <>
                {row('bgSize', t('Grösse'), (p) => (
                  <IconChoice
                    label={t('Grösse')}
                    value={p.value}
                    inherited={p.inherited}
                    onChange={p.set}
                    options={[
                      { value: 'cover', text: t('Füllen'), label: t('Füllt die Fläche, schneidet zu') },
                      { value: 'contain', text: t('Ganz'), label: t('Ganzes Bild') },
                      { value: 'auto', text: t('Original'), label: t('Originalgrösse') },
                    ]}
                  />
                ))}
                {row('bgPosition', t('Ausschnitt'), (p) => (
                  <PositionGrid value={p.value} inherited={p.inherited} onChange={p.set} />
                ))}
                {row('bgFixed', t('Beim Scrollen'), (p) => (
                  <IconChoice
                    label={t('Beim Scrollen')}
                    value={p.value === undefined ? undefined : p.value ? 'yes' : 'no'}
                    inherited={p.inherited === undefined ? undefined : p.inherited ? 'yes' : 'no'}
                    onChange={(v) => p.set(v === undefined ? undefined : v === 'yes')}
                    options={[
                      { value: 'no', text: t('Mitlaufen'), label: t('Bild scrollt mit') },
                      { value: 'yes', text: t('Stehen'), label: t('Bild bleibt stehen (Tiefenwirkung)') },
                    ]}
                  />
                ))}
              </>
            )}
          </>
        )}
        {color('overlay', t('Überlagerung'))}
        {!hover &&
          row(
            'overlayGradient',
            t('Überlagerung als Verlauf'),
            (p) => (
              <>
                {p.value === undefined && p.inherited && (
                  <span className="dp-inh-grad" style={{ background: gradientPreviewCss(p.inherited, preview) }} title={t('Übernommen von: {from}', { from: p.from ?? '' })} />
                )}
                <GradientEditor value={p.value} onChange={p.set} presets={overlayPresets} />
              </>
            ),
            true,
          )}
        {block && !hover && bgMedia}
        {block && !hover && dividers}
      </DesignSection>

      <DesignSection id="border" title={t('Rahmen & Ecken')} icon="radius" count={count('border')}>
        <div className="dp-grid2">
          {len('borderWidth', t('Stärke'), { units: ['px'], min: 0 })}
          {row('borderStyle', t('Linie'), (p) => (
            <IconChoice
              label={t('Linie')}
              value={p.value}
              inherited={p.inherited}
              onChange={p.set}
              options={[
                { value: 'solid', text: '—', label: t('Durchgezogen') },
                { value: 'dashed', text: '– –', label: t('Gestrichelt') },
                { value: 'dotted', text: '···', label: t('Gepunktet') },
              ]}
            />
          ))}
        </div>
        {color('borderColor', t('Farbe'))}
        {!hover &&
          row('borderSides', t('Seiten'), (p) => (
            <IconChoice
              label={t('Seiten')}
              value={p.value}
              inherited={p.inherited}
              onChange={p.set}
              options={[
                { value: 'all', text: t('Rundum'), label: t('Rundum') },
                { value: 'top', text: '‾', label: t('Nur oben') },
                { value: 'bottom', text: '_', label: t('Nur unten') },
                { value: 'y', text: '=', label: t('Oben und unten') },
                { value: 'left', text: '▏', label: t('Nur links') },
                { value: 'right', text: '▕', label: t('Nur rechts') },
              ]}
            />
          ))}
        {!hover && (
          <>
            {len('radius', t('Ecken'), { units: ['px', 'rem', '%'], min: 0 })}
            <div className="dp-corners">
              {(
                [
                  ['radiusTL', 'cornerTL', t('Oben links')],
                  ['radiusTR', 'cornerTR', t('Oben rechts')],
                  ['radiusBL', 'cornerBL', t('Unten links')],
                  ['radiusBR', 'cornerBR', t('Unten rechts')],
                ] as const
              ).map(([k, icon, label]) => {
                const p = prop(k);
                return (
                  <LengthInput
                    key={k}
                    icon={icon}
                    value={p.value}
                    placeholder={p.inherited ?? prop('radius').value ?? prop('radius').inherited}
                    onChange={p.set}
                    ariaLabel={label}
                    min={0}
                  />
                );
              })}
            </div>
          </>
        )}
      </DesignSection>

      <DesignSection id="effects" title={t('Effekte')} icon="shadow" count={count('effects')}>
        {row(
          'shadow',
          t('Schatten'),
          (p) => (
            <ShadowEditor value={p.value} inherited={p.inherited} onChange={p.set} />
          ),
          true,
        )}
        {row('opacity', t('Deckkraft'), (p) => (
          <NumberInput value={p.value} placeholder={p.inherited ?? 100} onChange={p.set} min={0} max={100} suffix="%" icon="opacity" ariaLabel={t('Deckkraft')} />
        ))}
        <div className="dp-grid2">
          {len('blur', t('Unschärfe'), { units: ['px'], min: 0 })}
          {show('backdrop') && len('backdrop', t('Glas'), { units: ['px'], min: 0 })}
          {row('grayscale', t('Graustufen'), (p) => (
            <NumberInput value={p.value} placeholder={p.inherited ?? 0} onChange={p.set} min={0} max={100} suffix="%" icon="opacity" ariaLabel={t('Graustufen')} />
          ))}
          {row('saturate', t('Sättigung'), (p) => (
            <NumberInput value={p.value} placeholder={p.inherited ?? 100} onChange={p.set} min={0} max={300} step={5} suffix="%" icon="paint" ariaLabel={t('Sättigung')} />
          ))}
          {row('brightness', t('Helligkeit'), (p) => (
            <NumberInput value={p.value} placeholder={p.inherited ?? 100} onChange={p.set} min={0} max={300} step={5} suffix="%" icon="sun" ariaLabel={t('Helligkeit')} />
          ))}
        </div>
        {!hover &&
          row('blend', t('Mischen'), (p) => (
            <select className="input" value={p.value ?? ''} onChange={(e) => p.set((e.target.value || undefined) as StyleProps['blend'])} aria-label={t('Mischen')}>
              <option value="">{p.inherited ? `${blendLabel(p.inherited)} (${t('übernommen')})` : t('Normal')}</option>
              {BLENDS.filter((b) => b !== 'normal').map((b) => (
                <option key={b} value={b}>
                  {blendLabel(b)}
                </option>
              ))}
            </select>
          ))}
        {!hover &&
          !block &&
          row(
            'shape',
            t('Form'),
            (p) => (
              <div className="dp-shapes" role="group" aria-label={t('Form')}>
                {SHAPE_CUTS.map((v) => (
                  <Tip key={v} label={shapeLabel(v)}>
                    <button
                      type="button"
                      aria-label={shapeLabel(v)}
                      aria-pressed={(p.value ?? p.inherited ?? 'none') === v}
                      className={p.value === undefined && p.inherited === v ? 'inherited' : ''}
                      onClick={() => p.set(v === 'none' ? undefined : v)}
                    >
                      <span className={`dp-shape dp-shape-${v}`} aria-hidden="true" />
                    </button>
                  </Tip>
                ))}
              </div>
            ),
            true,
          )}
        <span className="dp-sub">{t('Verwandeln')}</span>
        <div className="dp-grid2">
          {len('x', t('Verschieben X'), { units: ['px', '%', 'rem'] })}
          {len('y', t('Verschieben Y'), { units: ['px', '%', 'rem'] })}
          {row('rotate', t('Drehen'), (p) => (
            <NumberInput value={p.value} placeholder={p.inherited} onChange={p.set} min={-360} max={360} suffix="°" icon="rotate" ariaLabel={t('Drehen')} />
          ))}
          {row('scale', t('Skalieren'), (p) => (
            <NumberInput value={p.value} placeholder={p.inherited ?? 1} onChange={p.set} min={0} max={5} step={0.05} suffix="×" icon="scale" ariaLabel={t('Skalieren')} />
          ))}
        </div>
        <span className="dp-sub">{t('3D und Neigen')}</span>
        <div className="dp-grid2">
          {row('rotateX', t('Kippen nach hinten'), (p) => (
            <NumberInput value={p.value} placeholder={p.inherited} onChange={p.set} min={-180} max={180} suffix="°" ariaLabel={t('Kippen nach hinten')} />
          ))}
          {row('rotateY', t('Drehen zur Seite'), (p) => (
            <NumberInput value={p.value} placeholder={p.inherited} onChange={p.set} min={-180} max={180} suffix="°" ariaLabel={t('Drehen zur Seite')} />
          ))}
          {row('skew', t('Neigen'), (p) => (
            <NumberInput value={p.value} placeholder={p.inherited} onChange={p.set} min={-45} max={45} suffix="°" ariaLabel={t('Neigen')} />
          ))}
          {!hover &&
            row('perspective', t('Tiefe'), (p) => (
              <NumberInput value={p.value} placeholder={p.inherited ?? 800} onChange={p.set} min={100} max={4000} step={50} suffix="px" ariaLabel={t('Tiefe')} />
            ))}
        </div>
        {hover && (
          <PropRow label={t('Übergang')} state={design?.transition !== undefined ? 'set' : 'none'} onReset={() => onChange({ ...(design ?? {}), transition: undefined })}>
            <NumberInput
              value={design?.transition}
              placeholder={250}
              onChange={(n) => onChange({ ...(design ?? {}), transition: n })}
              min={0}
              max={3000}
              step={50}
              suffix="ms"
              icon="clock"
              ariaLabel={t('Übergang')}
            />
          </PropRow>
        )}
        {!block &&
          !hover &&
          row('cursor', t('Mauszeiger'), (p) => (
            <IconChoice
              label={t('Mauszeiger')}
              value={p.value}
              inherited={p.inherited}
              onChange={p.set}
              options={[
                { value: 'auto', text: t('Normal'), label: t('Normal') },
                { value: 'pointer', icon: 'cursor', label: t('Hand (klickbar)') },
              ]}
            />
          ))}
      </DesignSection>

      {(pro || !block) && !hover && (
        <DesignSection id="position" title={t('Position')} icon="move" count={count('position')}>
          {row('position', t('Art'), (p) => (
            <IconChoice
              label={t('Art')}
              value={p.value}
              inherited={p.inherited}
              onChange={p.set}
              options={[
                { value: 'static', text: t('Normal'), label: t('Im Fluss der Seite') },
                { value: 'relative', text: t('Relativ'), label: t('Verschoben, Platz bleibt') },
                { value: 'absolute', text: t('Frei'), label: t('Frei im übergeordneten Element') },
                { value: 'sticky', text: t('Haftend'), label: t('Bleibt beim Scrollen stehen') },
              ]}
            />
          ))}
          {(prop('position').value ?? prop('position').inherited ?? 'static') !== 'static' && (
            <div className="dp-grid2">
              {len('top', t('Oben'), { keywords: ['auto'] })}
              {len('bottom', t('Unten'), { keywords: ['auto'] })}
              {len('left', t('Links'), { keywords: ['auto'] })}
              {len('right', t('Rechts'), { keywords: ['auto'] })}
              {row('z', t('Ebene'), (p) => (
                <NumberInput value={p.value} placeholder={p.inherited} onChange={p.set} min={-10} max={999} ariaLabel={t('Ebene (z-index)')} icon="layers" />
              ))}
            </div>
          )}
        </DesignSection>
      )}

      {block && !hover && visibility && (
        <DesignSection id="visibility" title={t('Sichtbarkeit & Sprungmarke')} icon="eye" count={0}>
          {visibility}
        </DesignSection>
      )}
    </div>
  );
}

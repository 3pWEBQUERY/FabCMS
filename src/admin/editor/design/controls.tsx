import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createContext, useContext } from 'react';
import { COLOR_TOKENS, cssColor } from '../../../shared/design';
import { t } from '../../lib/i18n';
import { Icon } from '../../ui/icons';
import { Popover, Tip } from '../../ui/kit';

/* ---------- theme colours, read from the canvas ---------- */

/** Token → the colour the page really uses (filled in by the editor from the canvas). */
export const TokenColors = createContext<Record<string, string>>({});

export const colorTokenLabel = (tok: string): string =>
  ({
    accent: t('Akzent'),
    'accent-ink': t('Text auf Akzent'),
    ink: t('Text'),
    'ink-2': t('Text leicht'),
    bg: t('Hintergrund'),
    surface: t('Fläche'),
    line: t('Linie'),
    'inv-bg': t('Dunkler Hintergrund'),
    'inv-ink': t('Text auf Dunkel'),
    'inv-ink2': t('Text auf Dunkel, leicht'),
  })[tok] ?? tok;

/* ---------- lengths ---------- */

export interface ParsedLength {
  n: number | null;
  unit: string;
  raw: string;
}

export function parseLength(v: string | undefined): ParsedLength {
  const raw = (v ?? '').trim();
  const m = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(px|rem|em|%|vw|vh|svh|dvh|ch|fr)?$/.exec(raw);
  if (m) return { n: Number(m[1]), unit: m[2] ?? 'px', raw };
  return { n: null, unit: '', raw };
}

const round = (n: number, step: number) => {
  const d = step < 1 ? (String(step).split('.')[1]?.length ?? 1) : 0;
  return Number(n.toFixed(Math.min(3, d)));
};

/** Dragging sideways on a label changes the value – like in Figma. Shift: ×10, Alt: ×0.1. */
export function useScrub(get: () => number, set: (n: number) => void, step = 1, min = -Infinity, max = Infinity) {
  const start = useRef<{ x: number; v: number } | null>(null);
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      start.current = { x: e.clientX, v: get() };
      document.body.classList.add('scrubbing');
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (!start.current) return;
      const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
      const delta = Math.round((e.clientX - start.current.x) / 3) * step * mult;
      set(Math.min(max, Math.max(min, round(start.current.v + delta, step * mult))));
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      start.current = null;
      document.body.classList.remove('scrubbing');
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    },
  };
}

const UNITS = ['px', 'rem', '%', 'vw', 'vh', 'em'] as const;
const STEP: Record<string, number> = { px: 1, rem: 0.125, em: 0.05, '%': 1, vw: 1, vh: 1, svh: 1, dvh: 1, ch: 1, fr: 1 };

export interface TokenOption {
  value: string;
  label: string;
}

/**
 * A length: number, unit, keyword or theme step. Accepts typed values like
 * «24», «2rem», «50%», «auto»; arrows nudge, the label scrubs.
 */
export function LengthInput({
  value,
  onChange,
  placeholder,
  label,
  icon,
  units = UNITS,
  keywords = [],
  tokens = [],
  min = -Infinity,
  max = Infinity,
  ariaLabel,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
  label?: ReactNode;
  icon?: string;
  units?: readonly string[];
  keywords?: string[];
  tokens?: TokenOption[];
  min?: number;
  max?: number;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const p = parseLength(value);
  const ph = parseLength(placeholder);
  const unit = p.n !== null ? p.unit : ph.n !== null ? ph.unit : units[0];
  const tokenLabel = value?.startsWith('$') ? (tokens.find((x) => x.value === value)?.label ?? value.slice(1)) : null;
  const shown = draft ?? (tokenLabel ? '' : p.n !== null ? String(p.n) : (value ?? ''));
  const commit = (raw: string) => {
    setDraft(null);
    const s = raw.trim();
    if (!s) return onChange(undefined);
    if (/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(s)) return onChange(`${Math.min(max, Math.max(min, Number(s)))}${unit}`);
    if (parseLength(s).n !== null || keywords.includes(s)) return onChange(s);
  };
  const base = p.n ?? ph.n ?? 0;
  const scrub = useScrub(
    () => base,
    (n) => onChange(`${n}${unit}`),
    STEP[unit] ?? 1,
    min,
    max,
  );
  return (
    <div className={`dp-len ${value !== undefined ? 'set' : ''}`}>
      {(label || icon) && (
        <span className="dp-scrub" {...scrub} aria-hidden="true">
          {icon ? <Icon name={icon} size="s" /> : label}
        </span>
      )}
      {tokenLabel ? (
        <button type="button" className="dp-token" onClick={() => onChange(undefined)} title={t('Wert lösen')}>
          {tokenLabel}
          <Icon name="x" size="s" />
        </button>
      ) : (
        <input
          className="dp-num"
          inputMode="decimal"
          value={shown}
          placeholder={ph.n !== null ? String(ph.n) : (placeholder ?? '')}
          aria-label={ariaLabel}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setDraft(null);
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const st = (STEP[unit] ?? 1) * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1);
              const n = round(Math.min(max, Math.max(min, base + (e.key === 'ArrowUp' ? st : -st))), st);
              setDraft(null);
              onChange(`${n}${unit}`);
            }
          }}
        />
      )}
      <Popover
        align="end"
        trigger={
          <button type="button" className="dp-unit" aria-label={t('Einheit')}>
            {tokenLabel ? '' : p.n !== null || ph.n !== null ? unit : value && keywords.includes(value) ? value : unit}
          </button>
        }
      >
        <div className="dp-menu">
          {units.map((u) => (
            <button key={u} type="button" aria-pressed={unit === u && p.n !== null} onClick={() => onChange(`${base}${u}`)}>
              {u}
            </button>
          ))}
          {keywords.map((k) => (
            <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>
              {k}
            </button>
          ))}
          {tokens.length > 0 && <span className="dp-menu-head">{t('Aus dem Theme')}</span>}
          {tokens.map((k) => (
            <button key={k.value} type="button" aria-pressed={value === k.value} onClick={() => onChange(k.value)}>
              {k.label}
            </button>
          ))}
        </div>
      </Popover>
    </div>
  );
}

/** A plain number with optional suffix (°, %, ×) – scrubbable. */
export function NumberInput({
  value,
  onChange,
  placeholder,
  label,
  icon,
  suffix,
  min = -Infinity,
  max = Infinity,
  step = 1,
  ariaLabel,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: number;
  label?: ReactNode;
  icon?: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const base = value ?? placeholder ?? 0;
  const clamp = (n: number) => round(Math.min(max, Math.max(min, n)), step);
  const scrub = useScrub(
    () => base,
    (n) => onChange(clamp(n)),
    step,
    min,
    max,
  );
  return (
    <div className={`dp-len ${value !== undefined ? 'set' : ''}`}>
      {(label || icon) && (
        <span className="dp-scrub" {...scrub} aria-hidden="true">
          {icon ? <Icon name={icon} size="s" /> : label}
        </span>
      )}
      <input
        className="dp-num"
        inputMode="decimal"
        value={draft ?? (value === undefined ? '' : String(value))}
        placeholder={placeholder === undefined ? '' : String(placeholder)}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          setDraft(null);
          const s = e.target.value.trim().replace(',', '.');
          if (!s) onChange(undefined);
          else if (!Number.isNaN(Number(s))) onChange(clamp(Number(s)));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const st = step * (e.shiftKey ? 10 : 1);
            setDraft(null);
            onChange(clamp(base + (e.key === 'ArrowUp' ? st : -st)));
          }
        }}
      />
      {suffix && <span className="dp-unit static">{suffix}</span>}
    </div>
  );
}

/* ---------- colours ---------- */

/** What a stored colour looks like on screen (tokens resolved through the canvas). */
export function useColorPreview() {
  const tokens = useContext(TokenColors);
  return (v: string | undefined): string | null => {
    if (!v) return null;
    const m = /^\$([a-z0-9-]+)(?:\/(\d{1,3}))?$/.exec(v);
    if (m) {
      const base = tokens[m[1]];
      if (!base) return null;
      return m[2] === undefined ? base : `color-mix(in srgb, ${base} ${m[2]}%, transparent)`;
    }
    return cssColor(v);
  };
}

function toHex(c: string): string | null {
  const s = c.trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(s))
    return `#${s
      .slice(1)
      .split('')
      .map((x) => x + x)
      .join('')}`.toLowerCase();
  if (/^#[0-9a-f]{8}$/i.test(s)) return s.slice(0, 7).toLowerCase();
  const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(s);
  if (m) return `#${[m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, '0')).join('')}`;
  return null;
}

function alphaOf(v: string): number {
  const tok = /^\$[a-z0-9-]+\/(\d{1,3})$/.exec(v);
  if (tok) return Number(tok[1]);
  if (/^#[0-9a-f]{8}$/i.test(v)) return Math.round((parseInt(v.slice(7, 9), 16) / 255) * 100);
  const m = /^rgba\([^)]*[,/]\s*([\d.]+)(%?)\s*\)$/i.exec(v);
  if (m) return m[2] ? Number(m[1]) : Math.round(Number(m[1]) * 100);
  return 100;
}

function withAlpha(v: string, a: number): string {
  const tok = /^(\$[a-z0-9-]+)(?:\/\d{1,3})?$/.exec(v);
  if (tok) return a >= 100 ? tok[1] : `${tok[1]}/${a}`;
  const hex = toHex(v);
  if (!hex) return v;
  if (a >= 100) return hex;
  return `${hex}${Math.round((a / 100) * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

export function Swatch({ color, size = 18 }: { color: string | null; size?: number }) {
  return (
    <span className="dp-swatch" style={{ width: size, height: size }} aria-hidden="true">
      {color ? <span style={{ background: color }} /> : <span className="none" />}
    </span>
  );
}

export function ColorInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  allowNone = true,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
  ariaLabel: string;
  allowNone?: boolean;
}) {
  const tokens = useContext(TokenColors);
  const preview = useColorPreview();
  const shown = value ?? placeholder;
  const tok = shown && /^\$([a-z0-9-]+)/.exec(shown)?.[1];
  const name = shown ? (tok ? colorTokenLabel(tok) : (toHex(shown) ?? shown)) : t('Keine');
  const alpha = shown ? alphaOf(shown) : 100;
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const [hoverTok, setHoverTok] = useState<string | null>(null);
  const hex = value ? (tok ? toHex(tokens[tok] ?? '') : toHex(value)) : null;
  return (
    <Popover
      align="start"
      className="dp-color-pop"
      trigger={
        <button type="button" className={`dp-color ${value !== undefined ? 'set' : ''}`} aria-label={`${ariaLabel}: ${name}`}>
          <Swatch color={preview(shown)} />
          <span className="ellipsis">{name}</span>
          {shown && alpha < 100 && <span className="dp-alpha">{alpha}%</span>}
        </button>
      }
    >
      <div className="dp-color-body">
        <span className="dp-menu-head">{t('Farben der Website')}</span>
        <div className="dp-tokens" onPointerLeave={() => setHoverTok(null)}>
          {COLOR_TOKENS.map((k) => (
            <button
              key={k}
              type="button"
              className="dp-token-swatch"
              aria-label={colorTokenLabel(k)}
              aria-pressed={tok === k && value !== undefined}
              onPointerEnter={() => setHoverTok(k)}
              onFocus={() => setHoverTok(k)}
              onClick={() => onChange(withAlpha(`$${k}`, alpha))}
            >
              <Swatch color={tokens[k] ?? null} size={26} />
            </button>
          ))}
        </div>
        <span className="dp-token-name">{hoverTok ? colorTokenLabel(hoverTok) : tok && value !== undefined ? colorTokenLabel(tok) : '\u00a0'}</span>
        <span className="dp-menu-head">{t('Eigene Farbe')}</span>
        <div className="dp-color-row">
          <label className="dp-native">
            <Swatch color={preview(value) ?? null} size={30} />
            <input type="color" value={hex ?? '#888888'} onChange={(e) => onChange(withAlpha(e.target.value, alpha))} aria-label={t('Farbe wählen')} />
          </label>
          <input
            className="input mono"
            value={hexDraft ?? (value && !tok ? (toHex(value) ?? value) : '')}
            placeholder="#2b59c3"
            aria-label={t('Farbwert')}
            onChange={(e) => setHexDraft(e.target.value)}
            onBlur={(e) => {
              setHexDraft(null);
              const s = e.target.value.trim();
              if (!s) return;
              const c = /^[0-9a-f]{3,8}$/i.test(s) ? `#${s}` : s;
              if (cssColor(c)) onChange(withAlpha(c, alpha));
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </div>
        <label className="dp-alpha-row">
          <span>{t('Deckkraft')}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={alpha}
            disabled={!value}
            onChange={(e) => value && onChange(withAlpha(value, Number(e.target.value)))}
            style={{ ['--c' as string]: preview(value ? withAlpha(value, 100) : undefined) ?? 'var(--ink)' }}
          />
          <span className="mono">{alpha}%</span>
        </label>
        {allowNone && (
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="btn s ghost" onClick={() => onChange('transparent')}>
              {t('Durchsichtig')}
            </button>
            <button type="button" className="btn s ghost" onClick={() => onChange(undefined)} disabled={value === undefined}>
              {t('Zurücksetzen')}
            </button>
          </div>
        )}
      </div>
    </Popover>
  );
}

/* ---------- choices ---------- */

/** Icon buttons for one choice; clicking the active one again clears it. */
export function IconChoice<T extends string>({
  value,
  inherited,
  onChange,
  options,
  label,
}: {
  value: T | undefined;
  inherited?: T;
  onChange: (v: T | undefined) => void;
  options: { value: T; icon?: string; label: string; text?: string }[];
  label: string;
}) {
  return (
    <div className="dp-choice" role="group" aria-label={label}>
      {options.map((o) => (
        <Tip key={o.value} label={o.label}>
          <button
            type="button"
            aria-label={o.label}
            aria-pressed={value === o.value}
            className={value === undefined && inherited === o.value ? 'inherited' : ''}
            onClick={() => onChange(value === o.value ? undefined : o.value)}
          >
            {o.icon ? <Icon name={o.icon} size="s" /> : o.text}
          </button>
        </Tip>
      ))}
    </div>
  );
}

/** A labelled row with the override marker: blue = set here, amber = comes from a wider screen. */
export function PropRow({
  label,
  state,
  from,
  onReset,
  children,
  wide,
}: {
  label: string;
  state: 'set' | 'inherited' | 'none';
  from?: string;
  onReset?: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`dp-row ${wide ? 'wide' : ''}`}>
      <span className="dp-label">
        {state === 'set' ? (
          <Tip label={t('Zurücksetzen')}>
            <button type="button" className="dp-dot set" onClick={onReset} aria-label={t('{name} zurücksetzen', { name: label })} />
          </Tip>
        ) : state === 'inherited' ? (
          <Tip label={t('Übernommen von: {from}', { from: from ?? '' })}>
            <span className="dp-dot inherited" />
          </Tip>
        ) : (
          <span className="dp-dot" />
        )}
        {label}
      </span>
      <div className="dp-ctl">{children}</div>
    </div>
  );
}

/** Collapsible group; remembers whether it was open. */
export function DesignSection({
  id,
  title,
  icon,
  count,
  children,
  defaultOpen = false,
}: {
  id: string;
  title: string;
  icon: string;
  count: number;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const key = `nova-dp-${id}`;
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? defaultOpen : v === '1';
    } catch {
      return defaultOpen;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, open ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  }, [open, key]);
  return (
    <section className={`dp-sec ${open ? 'open' : ''}`}>
      <button type="button" className="dp-sec-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name={icon} size="s" />
        <span className="grow">{title}</span>
        {count > 0 && <span className="dp-count">{count}</span>}
        <Icon name="chevronDown" size="s" className="dp-chev" />
      </button>
      {open && <div className="dp-sec-body">{children}</div>}
    </section>
  );
}

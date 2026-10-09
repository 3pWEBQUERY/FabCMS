import * as RDialog from '@radix-ui/react-dialog';
import * as RPopover from '@radix-ui/react-popover';
import * as RMenu from '@radix-ui/react-dropdown-menu';
import * as RTooltip from '@radix-ui/react-tooltip';
import * as RSelect from '@radix-ui/react-select';
import { AnimatePresence, motion, LayoutGroup } from 'motion/react';
import { useEffect, useId, useRef, useState, type CSSProperties, type InputHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Icon } from './icons';
import type { EntryStatus } from '../../shared/types';
import { parseTime } from '../../shared/hours';
import { MONTHS, WEEKDAYS_SHORT, addDays, addMonths, formatDay, fromIsoDay, isoDay, longDay, monthGrid, parseDay } from '../../shared/dates';

/* ---------- pointer origin: dialogs grow out of what was clicked ---------- */

let lastPointer = { x: window.innerWidth / 2, y: window.innerHeight / 3 };
window.addEventListener('pointerdown', (e) => (lastPointer = { x: e.clientX, y: e.clientY }), true);

const spring = { type: 'spring' as const, stiffness: 520, damping: 38, mass: 0.8 };

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const [origin, setOrigin] = useState(lastPointer);
  useEffect(() => {
    if (open) setOrigin(lastPointer);
  }, [open]);
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RDialog.Portal forceMount>
            <RDialog.Overlay asChild forceMount>
              <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} />
            </RDialog.Overlay>
            <RDialog.Content asChild forceMount aria-describedby={description ? undefined : undefined}>
              <motion.div
                className={`dialog ${wide ? 'wide' : ''}`}
                style={{ transformOrigin: `${origin.x - window.innerWidth / 2}px ${origin.y}px` }}
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
                transition={spring}
              >
                <RDialog.Title>{title}</RDialog.Title>
                {description ? <RDialog.Description className="muted">{description}</RDialog.Description> : <RDialog.Description className="sr">{title}</RDialog.Description>}
                <div style={{ marginTop: '1.1rem' }}>{children}</div>
              </motion.div>
            </RDialog.Content>
          </RDialog.Portal>
        )}
      </AnimatePresence>
    </RDialog.Root>
  );
}

/** Promise-based choice between several buttons; resolves with the chosen value, or null when closed. */
export function choose<T extends string>(opts: {
  title: string;
  message?: ReactNode;
  options: { label: string; value: T; kind?: 'primary' | 'danger' | 'ghost' }[];
}): Promise<T | null> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    function C() {
      const [open, setOpen] = useState(true);
      const close = (v: T | null) => {
        setOpen(false);
        resolve(v);
        setTimeout(() => {
          root.unmount();
          host.remove();
        }, 200);
      };
      return (
        <Dialog open={open} onOpenChange={(o) => !o && close(null)} title={opts.title} description={opts.message}>
          <div className="dialog-actions">
            {opts.options.map((o, i) => (
              <button key={o.value} className={`btn ${o.kind ?? ''}`} autoFocus={i === opts.options.length - 1} onClick={() => close(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </Dialog>
      );
    }
    root.render(<C />);
  });
}

/** Promise-based confirmation. */
export function confirm(opts: { title: string; message?: ReactNode; confirm?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const done = (v: boolean) => {
      resolve(v);
      setTimeout(() => {
        root.unmount();
        host.remove();
      }, 200);
    };
    function C() {
      const [open, setOpen] = useState(true);
      const close = (v: boolean) => {
        setOpen(false);
        done(v);
      };
      return (
        <Dialog open={open} onOpenChange={(o) => !o && close(false)} title={opts.title} description={opts.message}>
          <div className="dialog-actions">
            <button className="btn ghost" onClick={() => close(false)}>
              Abbrechen
            </button>
            <button className={`btn ${opts.danger ? 'danger' : 'primary'}`} autoFocus onClick={() => close(true)}>
              {opts.confirm ?? 'Bestätigen'}
            </button>
          </div>
        </Dialog>
      );
    }
    root.render(<C />);
  });
}

/* ---------- popover & menu ---------- */

export function Popover({
  trigger,
  children,
  open,
  onOpenChange,
  align = 'start',
  side = 'bottom',
  className = '',
}: {
  trigger: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}) {
  return (
    <RPopover.Root open={open} onOpenChange={onOpenChange}>
      <RPopover.Trigger asChild>{trigger}</RPopover.Trigger>
      <RPopover.Portal>
        <RPopover.Content align={align} side={side} sideOffset={6} collisionPadding={12} className={`popover pop-anim ${className}`}>
          {children}
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}

export interface MenuEntry {
  label: string;
  icon?: string;
  onSelect: () => void;
  danger?: boolean;
  hidden?: boolean;
}

export function Menu({ trigger, items, align = 'end' }: { trigger: ReactNode; items: (MenuEntry | 'sep')[]; align?: 'start' | 'end' }) {
  const visible = items.filter((i) => i === 'sep' || !i.hidden);
  return (
    <RMenu.Root>
      <RMenu.Trigger asChild>{trigger}</RMenu.Trigger>
      <RMenu.Portal>
        <RMenu.Content align={align} sideOffset={6} collisionPadding={12} className="popover pop-anim">
          {visible.map((i, idx) =>
            i === 'sep' ? (
              <RMenu.Separator key={idx} className="menu-sep" />
            ) : (
              <RMenu.Item key={idx} className={`menu-item ${i.danger ? 'danger' : ''}`} onSelect={i.onSelect}>
                {i.icon && <Icon name={i.icon} size="s" />}
                {i.label}
              </RMenu.Item>
            ),
          )}
        </RMenu.Content>
      </RMenu.Portal>
    </RMenu.Root>
  );
}

export function Tip({ label, keys, children, side = 'bottom' }: { label: string; keys?: string; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <RTooltip.Root delayDuration={350}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content side={side} sideOffset={6} className="tooltip">
          {label}
          {keys && <kbd>{keys}</kbd>}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

export const TooltipProvider = RTooltip.Provider;

/* ---------- select: own list instead of the browser/OS picker ---------- */

export interface SelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

// Radix reserves "" for "nothing selected"; options may still use it (e.g. «Alle»).
const EMPTY = '\u0000empty';
const enc = (v: string) => (v === '' ? EMPTY : v);
const dec = (v: string) => (v === EMPTY ? '' : v);

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Auswählen …',
  id,
  label,
  disabled,
  inline,
  className,
}: {
  value: string | null | undefined;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  id?: string;
  /** Accessible name when there is no visible <label htmlFor>. */
  label?: string;
  disabled?: boolean;
  /** Size to the content instead of filling the row (toolbars, table cells). */
  inline?: boolean;
  className?: string;
}) {
  const known = options.some((o) => o.value === (value ?? ''));
  return (
    <RSelect.Root value={known ? enc(value ?? '') : ''} onValueChange={(v) => onChange(dec(v))} disabled={disabled}>
      <RSelect.Trigger id={id} aria-label={label} className={`select sel-trigger ${inline ? 'inline' : ''} ${className ?? ''}`}>
        <span className="sel-value">
          <RSelect.Value placeholder={placeholder} />
        </span>
        <RSelect.Icon className="sel-chevron">
          <Icon name="chevronDown" size="s" />
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content position="popper" sideOffset={6} collisionPadding={12} className="popover sel-content pop-anim">
          <RSelect.Viewport className="sel-viewport">
            {options.map((o) => (
              <RSelect.Item key={o.value} value={enc(o.value)} disabled={o.disabled} className="menu-item sel-item">
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
                <RSelect.ItemIndicator className="sel-check">
                  <Icon name="check" size="s" />
                </RSelect.ItemIndicator>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}

/** Free text input with our own suggestion list (replaces <datalist>, whose popup is browser UI). */
export function SuggestInput({
  value,
  onChange,
  suggestions,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: { value: string; label?: string }[];
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'list'>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const q = value.trim().toLowerCase();
  const shown = suggestions
    .filter((s) => s.value !== value && (!q || s.value.toLowerCase().includes(q) || s.label?.toLowerCase().includes(q)))
    .slice(0, 50);
  const visible = open && shown.length > 0;
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setActive(-1);
  };
  return (
    <RPopover.Root open={visible} onOpenChange={setOpen}>
      <RPopover.Anchor asChild>
        <input
          {...rest}
          ref={input}
          role="combobox"
          aria-expanded={visible}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={visible && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={(e) => {
            setOpen(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setOpen(false);
            rest.onBlur?.(e);
          }}
          onKeyDown={(e) => {
            rest.onKeyDown?.(e);
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              if (!open) return setOpen(true);
              const n = shown.length;
              if (n) setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % n : (a - 1 + n) % n));
            } else if (e.key === 'Enter' && visible && active >= 0) {
              e.preventDefault();
              pick(shown[active].value);
            } else if (e.key === 'Escape' && visible) {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        />
      </RPopover.Anchor>
      <RPopover.Portal>
        <RPopover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="popover sel-content pop-anim"
          style={{ minWidth: 'max(var(--radix-popover-trigger-width), 12rem)', maxHeight: 'min(22rem, var(--radix-popover-content-available-height, 70vh))', overflow: 'auto' }}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.target === input.current && e.preventDefault()}
        >
          <div role="listbox" id={listId}>
            {shown.map((s, i) => (
              <div
                key={s.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                data-highlighted={i === active ? '' : undefined}
                className="menu-item sel-item"
                // mousedown would blur the input before the click lands
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => setActive(i)}
                onClick={() => pick(s.value)}
              >
                <span className="mono">{s.value}</span>
                {s.label && <span className="xsmall muted ellipsis">{s.label}</span>}
              </div>
            ))}
          </div>
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}

/* ---------- time: 24h text field with our own quarter-hour list ---------- */

const QUARTERS = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

export function TimeInput({ value, onChange, label, className, style }: { value: string; onChange: (v: string) => void; label: string; className?: string; style?: CSSProperties }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  useEffect(() => setText(value), [value]);

  // Highlight the quarter closest to what is typed (or the current value).
  const nearest = (t: string) => {
    const parsed = parseTime(t) ?? value;
    if (!parsed) return 0;
    const m = minutes(parsed);
    return Math.min(95, Math.round(m / 15));
  };
  // On open the current time sits in the middle of the list; while arrowing it just stays visible.
  const centred = useRef(false);
  useEffect(() => {
    if (!open) {
      centred.current = false;
      return;
    }
    requestAnimationFrame(() => {
      list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: centred.current ? 'nearest' : 'center' });
      centred.current = true;
    });
  }, [open, active]);

  const commit = (t: string) => {
    const parsed = parseTime(t);
    if (parsed) {
      setText(parsed);
      if (parsed !== value) onChange(parsed);
    } else setText(value);
  };
  const pick = (t: string) => {
    commit(t);
    setOpen(false);
  };

  return (
    <RPopover.Root open={open} onOpenChange={setOpen}>
      <RPopover.Anchor asChild>
        <input
          ref={input}
          className={`input num time-input ${className ?? ''}`}
          style={style}
          inputMode="numeric"
          autoComplete="off"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          aria-invalid={text !== value && text.trim() !== '' && !parseTime(text) ? true : undefined}
          value={text}
          onFocus={(e) => {
            e.target.select();
            setActive(nearest(value));
            setOpen(true);
          }}
          onChange={(e) => {
            setText(e.target.value);
            setActive(nearest(e.target.value));
            setOpen(true);
          }}
          onBlur={() => {
            commit(text);
            setOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const next = (active + (e.key === 'ArrowDown' ? 1 : -1) + 96) % 96;
              setActive(next);
              setText(QUARTERS[next]);
              setOpen(true);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              pick(open && parseTime(text) === null ? QUARTERS[active] : text);
            } else if (e.key === 'Escape' && open) {
              e.stopPropagation();
              setText(value);
              setOpen(false);
            }
          }}
        />
      </RPopover.Anchor>
      <RPopover.Portal>
        <RPopover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="popover sel-content time-list pop-anim"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.target === input.current && e.preventDefault()}
        >
          <div role="listbox" id={listId} ref={list} aria-label={label}>
            {QUARTERS.map((q, i) => (
              <div
                key={q}
                id={`${listId}-${i}`}
                data-i={i}
                role="option"
                aria-selected={q === value}
                data-highlighted={i === active ? '' : undefined}
                className="menu-item sel-item num"
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => setActive(i)}
                onClick={() => pick(q)}
              >
                <span>{q}</span>
                {q === value && <Icon name="check" size="s" className="sel-check" />}
              </div>
            ))}
          </div>
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}

/* ---------- date: Swiss text field with our own calendar ---------- */

export function DateInput({
  value,
  onChange,
  id,
  label,
  min,
  clearable = true,
  className,
}: {
  /** "YYYY-MM-DD" or "" */
  value: string;
  onChange: (v: string) => void;
  id?: string;
  label?: string;
  /** Earliest selectable day, "YYYY-MM-DD". */
  min?: string;
  clearable?: boolean;
  className?: string;
}) {
  const today = isoDay(new Date());
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(formatDay(value));
  const [active, setActive] = useState(value || today);
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const inGrid = useRef(false);
  // Focus returns to the field after a pick; that must not reopen the calendar.
  const quietFocus = useRef(false);
  const gridId = useId();
  useEffect(() => setText(formatDay(value)), [value]);
  useEffect(() => {
    if (inGrid.current) panel.current?.querySelector<HTMLElement>(`[data-day="${active}"]`)?.focus();
  }, [active]);

  const allowed = (d: string) => !min || d >= min;
  const view = fromIsoDay(active) ?? new Date();
  const days = monthGrid(view.getFullYear(), view.getMonth());
  const viewMonth = active.slice(0, 7);

  const commit = (t: string) => {
    if (!t.trim()) {
      setText('');
      if (clearable && value) onChange('');
      else if (!clearable) setText(formatDay(value));
      return;
    }
    const d = parseDay(t);
    if (d && allowed(d)) {
      setText(formatDay(d));
      if (d !== value) onChange(d);
    } else setText(formatDay(value));
  };
  const close = (refocus: boolean) => {
    inGrid.current = false;
    setOpen(false);
    if (refocus && document.activeElement !== input.current) {
      quietFocus.current = true;
      input.current?.focus();
    }
  };
  const pick = (d: string) => {
    if (!allowed(d)) return;
    setActive(d);
    setText(formatDay(d));
    if (d !== value) onChange(d);
    close(true);
  };
  const openAt = (d: string) => {
    setActive(d);
    setOpen(true);
  };
  /** Where the calendar opens: what is typed, else the value, else today (or the earliest allowed day). */
  const start = () => parseDay(text) ?? (value || (min && min > today ? min : today));
  const leaving = (to: EventTarget | null) => !(to instanceof Node && (panel.current?.contains(to) || input.current === to));

  const gridKeys = (e: ReactKeyboardEvent) => {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(active, -1),
      ArrowRight: () => addDays(active, 1),
      ArrowUp: () => addDays(active, -7),
      ArrowDown: () => addDays(active, 7),
      PageUp: () => addMonths(active, -1),
      PageDown: () => addMonths(active, 1),
      Home: () => addDays(active, -((fromIsoDay(active)!.getDay() + 6) % 7)),
      End: () => addDays(active, 6 - ((fromIsoDay(active)!.getDay() + 6) % 7)),
    };
    if (moves[e.key]) {
      e.preventDefault();
      setActive(moves[e.key]());
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    }
  };

  return (
    <RPopover.Root open={open} onOpenChange={(o) => (o ? setOpen(true) : close(false))}>
      <RPopover.Anchor asChild>
        <span className={`date-input ${className ?? ''}`}>
          <input
            ref={input}
            id={id}
            className="input num"
            placeholder="TT.MM.JJJJ"
            inputMode="numeric"
            autoComplete="off"
            role="combobox"
            aria-label={label}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={gridId}
            aria-invalid={text.trim() !== '' && text !== formatDay(value) && !parseDay(text) ? true : undefined}
            value={text}
            onFocus={() => {
              if (quietFocus.current) quietFocus.current = false;
              else openAt(start());
            }}
            onClick={() => !open && openAt(start())}
            onChange={(e) => {
              setText(e.target.value);
              const d = parseDay(e.target.value);
              if (d) setActive(d);
              setOpen(true);
            }}
            onBlur={(e) => {
              if (!leaving(e.relatedTarget)) return;
              commit(text);
              close(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                const from = open ? active : start();
                setActive(from);
                setOpen(true);
                inGrid.current = true;
                requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>(`[data-day="${from}"]`)?.focus());
              } else if (e.key === 'Enter') {
                e.preventDefault();
                commit(text);
                close(false);
              } else if (e.key === 'Escape' && open) {
                e.stopPropagation();
                setText(formatDay(value));
                close(false);
              }
            }}
          />
          <Icon name="calendar" size="s" className="date-icon" />
        </span>
      </RPopover.Anchor>
      <RPopover.Portal>
        <RPopover.Content
          ref={panel}
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="popover cal pop-anim"
          role="dialog"
          aria-label={label ? `${label}: Datum wählen` : 'Datum wählen'}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.target instanceof Node && input.current?.parentElement?.contains(e.target) && e.preventDefault()}
          // Clicks on plain text inside the panel must not steal focus (that would read as leaving).
          onMouseDown={(e) => e.target instanceof Element && !e.target.closest('button') && e.preventDefault()}
          onBlur={(e) => {
            if (leaving(e.relatedTarget)) {
              commit(text);
              close(false);
            }
          }}
        >
          <div className="cal-head">
            <button type="button" className="btn ghost s icon-only" aria-label="Vorheriger Monat" onMouseDown={(e) => e.preventDefault()} onClick={() => setActive(addMonths(active, -1))}>
              <Icon name="chevronLeft" size="s" />
            </button>
            <strong aria-live="polite">
              {MONTHS[view.getMonth()]} {view.getFullYear()}
            </strong>
            <button type="button" className="btn ghost s icon-only" aria-label="Nächster Monat" onMouseDown={(e) => e.preventDefault()} onClick={() => setActive(addMonths(active, 1))}>
              <Icon name="chevronRight" size="s" />
            </button>
          </div>
          <div role="grid" id={gridId} className="cal-grid" onKeyDown={gridKeys}>
            <div role="row" className="cal-row">
              {WEEKDAYS_SHORT.map((w) => (
                <span key={w} role="columnheader" className="cal-wd">
                  {w}
                </span>
              ))}
            </div>
            {[0, 1, 2, 3, 4, 5].map((r) => (
              <div key={r} role="row" className="cal-row">
                {days.slice(r * 7, r * 7 + 7).map((d) => (
                  <span key={d} role="gridcell" aria-selected={d === value}>
                    <button
                      type="button"
                      data-day={d}
                      tabIndex={d === active ? 0 : -1}
                      className="cal-day num"
                      data-outside={d.slice(0, 7) !== viewMonth ? '' : undefined}
                      data-today={d === today ? '' : undefined}
                      data-selected={d === value ? '' : undefined}
                      data-active={d === active ? '' : undefined}
                      disabled={!allowed(d)}
                      aria-label={longDay(d)}
                      onMouseDown={(e) => !inGrid.current && e.preventDefault()}
                      onFocus={() => {
                        inGrid.current = true;
                        if (d !== active) setActive(d);
                      }}
                      onClick={() => pick(d)}
                    >
                      {Number(d.slice(8))}
                    </button>
                  </span>
                ))}
              </div>
            ))}
          </div>
          <div className="cal-foot">
            <button type="button" className="linkish small" disabled={!allowed(today)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(today)}>
              Heute
            </button>
            {clearable && value && (
              <button
                type="button"
                className="linkish small muted"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setText('');
                  onChange('');
                  close(true);
                }}
              >
                Leeren
              </button>
            )}
          </div>
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}

/** Date + time as "YYYY-MM-DDTHH:MM" (local), built from DateInput and TimeInput. */
export function DateTimeInput({ value, onChange, id, label, min, defaultTime = '09:00' }: { value: string; onChange: (v: string) => void; id?: string; label?: string; min?: string; defaultTime?: string }) {
  const day = value.slice(0, 10);
  const time = value.slice(11, 16);
  return (
    <div className="row" style={{ gap: '0.5rem', flexWrap: 'nowrap' }}>
      <DateInput id={id} label={label ? `${label}, Datum` : 'Datum'} value={day} min={min?.slice(0, 10)} onChange={(d) => onChange(d ? `${d}T${time || defaultTime}` : '')} />
      <TimeInput label={label ? `${label}, Uhrzeit` : 'Uhrzeit'} value={time} onChange={(t) => onChange(`${day || isoDay(new Date())}T${t}`)} />
    </div>
  );
}

/* ---------- small controls ---------- */

export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label?: string; id?: string }) {
  return <button type="button" role="switch" id={id} aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}

export function Toggle({ checked, onChange, label, help }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; help?: ReactNode }) {
  const id = useId();
  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: '0.75rem' }}>
      <Switch id={id} checked={checked} onChange={onChange} />
      <label htmlFor={id} style={{ cursor: 'pointer', display: 'grid', gap: '0.1rem' }}>
        <span style={{ fontWeight: 550, fontSize: 'var(--t-s)' }}>{label}</span>
        {help && <span className="field-help">{help}</span>}
      </label>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; icon?: string; title?: string }[]; label: string }) {
  const id = useId();
  return (
    <LayoutGroup id={id}>
        <div className="seg" role="group" aria-label={label}>
          {options.map((o) => (
            <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)} title={o.title} aria-label={o.title}>
              {value === o.value && <motion.span layoutId="thumb" className="seg-thumb" transition={spring} />}
              <span>
                {o.icon && <Icon name={o.icon} size="s" />}
                {o.label}
              </span>
            </button>
          ))}
        </div>
    </LayoutGroup>
  );
}

export function Field({
  label,
  help,
  error,
  children,
  htmlFor,
  keyName,
}: {
  label: ReactNode;
  help?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
  keyName?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>
        {label}
        {keyName && <span className="field-key">{keyName}</span>}
      </label>
      {children}
      {error ? <span className="field-error">{error}</span> : help ? <span className="field-help">{help}</span> : null}
    </div>
  );
}

export function ProgressRing({ value, size = 44 }: { value: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(value * 100)} % erledigt`}>
      <circle className="track" cx={size / 2} cy={size / 2} r={r} />
      <circle className="bar" cx={size / 2} cy={size / 2} r={r} strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))} />
    </svg>
  );
}

export function Empty({ title, children, action, example }: { title: string; children?: ReactNode; action?: ReactNode; example?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {example && <div className="example">{example}</div>}
      {action}
    </div>
  );
}

const STATUS: Record<EntryStatus, { label: string; cls: string }> = {
  draft: { label: 'Entwurf', cls: '' },
  review: { label: 'Zur Freigabe', cls: 'sel' },
  scheduled: { label: 'Geplant', cls: 'edited' },
  published: { label: 'Online', cls: 'ok' },
};

export function StatusBadge({ status, changed }: { status: EntryStatus; changed?: boolean }) {
  const s = STATUS[status];
  return (
    <span className={`badge ${changed ? 'edited' : s.cls}`}>
      <span className={`dot ${changed ? 'edited' : s.cls}`} />
      {changed ? 'Online · geändert' : s.label}
    </span>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="stack tight" aria-hidden="true" style={{ padding: '1rem 1.25rem' }}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} style={{ height: '0.85rem', width: `${85 - i * 17}%`, borderRadius: 4, background: 'var(--sunken)' }} />
      ))}
    </div>
  );
}

export function PageHead({ title, sub, actions, back }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <header className="page-head">
      <div style={{ minWidth: 0 }}>
        {back}
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="row wrap">{actions}</div>}
    </header>
  );
}

export { motion, AnimatePresence, spring };

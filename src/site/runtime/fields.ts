/**
 * Own form controls for public pages, loaded only where a page has selects,
 * date, number or file fields. Each native control stays in the form (hidden
 * under the new one), so submitting, required checks, show-if conditions and
 * the variant price keep working – and without JavaScript the styled native
 * controls remain. Validation messages are shown by site.js.
 */
import { MONTHS, WEEKDAYS_SHORT, addDays, addMonths, formatDay, fromIsoDay, isoDay, longDay, monthGrid, parseDay } from '../../shared/dates';

const d = document;
let uid = 0;
const nextId = (p: string) => `${p}${++uid}`;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, attrs: Record<string, string> = {}) => {
  const e = d.createElement(tag);
  e.className = cls;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};
const fire = (n: HTMLElement) => ['input', 'change'].forEach((t) => n.dispatchEvent(new Event(t, { bubbles: true })));

/** Puts the native control in a wrapper, hidden under the new control, and hands its label over to `target`. */
function adopt(native: HTMLInputElement | HTMLSelectElement, front: HTMLElement, target: HTMLElement = front): HTMLElement {
  const wrap = el('div', 'nw');
  native.before(wrap);
  wrap.append(front, native);
  native.classList.add('nn');
  native.tabIndex = -1;
  native.setAttribute('aria-hidden', 'true');
  if (native.id) {
    target.id = native.id;
    native.id = `${native.id}-n`;
  }
  if (native.hasAttribute('aria-describedby')) target.setAttribute('aria-describedby', native.getAttribute('aria-describedby')!);
  if (native.required) target.setAttribute('aria-required', 'true');
  // Messages come from site.js (own text under the field); here the visible control mirrors the state.
  native.addEventListener('invalid', () => target.setAttribute('aria-invalid', 'true'));
  native.addEventListener('change', () => native.validity.valid && target.removeAttribute('aria-invalid'));
  native.addEventListener('focus', () => target.focus());
  return wrap;
}

/** Opens a popup below (or above, if there is no room) its wrapper; closes on outside click. */
function popup(wrap: HTMLElement, pop: HTMLElement, onClose: () => void) {
  wrap.append(pop);
  pop.hidden = true;
  const outside = (e: PointerEvent) => !wrap.contains(e.target as Node) && close();
  const open = () => {
    pop.hidden = false;
    const r = wrap.getBoundingClientRect();
    pop.classList.toggle('up', innerHeight - r.bottom < pop.offsetHeight + 12 && r.top > pop.offsetHeight + 12);
    d.addEventListener('pointerdown', outside);
  };
  const close = () => {
    if (pop.hidden) return;
    pop.hidden = true;
    d.removeEventListener('pointerdown', outside);
    onClose();
  };
  return { open, close, isOpen: () => !pop.hidden };
}

/* ---------- select ---------- */

function select(sel: HTMLSelectElement) {
  const btn = el('button', 'nsel', { type: 'button', role: 'combobox', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' });
  const label = el('span', 'nsel-v');
  btn.append(label);
  const wrap = adopt(sel, btn);
  const list = el('div', 'npop nlist', { role: 'listbox', id: nextId('nl') });
  btn.setAttribute('aria-controls', list.id);
  const opts = [...sel.options].map((o, i) => {
    const n = el('div', 'nopt', { role: 'option', id: `${list.id}-${i}` });
    n.textContent = o.text;
    if (o.disabled) n.setAttribute('aria-disabled', 'true');
    // «Bitte wählen» is a placeholder, not a choice, when the field is required.
    if (o.value === '' && sel.required) n.hidden = true;
    n.addEventListener('pointerdown', (e) => e.preventDefault());
    n.addEventListener('click', () => pick(i));
    n.addEventListener('pointermove', () => highlight(i));
    list.append(n);
    return n;
  });
  let active = sel.selectedIndex;
  const sync = () => {
    const o = sel.selectedOptions[0];
    label.textContent = o?.text ?? '';
    btn.classList.toggle('ph', !o || o.value === '');
    opts.forEach((n, i) => n.setAttribute('aria-selected', String(i === sel.selectedIndex)));
  };
  const highlight = (i: number) => {
    active = i;
    opts.forEach((n, j) => n.classList.toggle('on', j === i));
    btn.setAttribute('aria-activedescendant', opts[i]?.id ?? '');
    opts[i]?.scrollIntoView({ block: 'nearest' });
  };
  const p = popup(wrap, list, () => {
    btn.setAttribute('aria-expanded', 'false');
    btn.removeAttribute('aria-activedescendant');
  });
  const show = () => {
    p.open();
    btn.setAttribute('aria-expanded', 'true');
    highlight(usable(Math.max(0, sel.selectedIndex)) ? Math.max(0, sel.selectedIndex) : opts.findIndex((_, i) => usable(i)));
  };
  const pick = (i: number) => {
    if (i < 0 || !usable(i)) return;
    if (sel.selectedIndex !== i) {
      sel.selectedIndex = i;
      fire(sel);
    }
    sync();
    p.close();
    btn.focus();
  };
  const usable = (i: number) => !sel.options[i].disabled && !opts[i].hidden;
  const move = (by: number) => {
    for (let i = active + by; i >= 0 && i < opts.length; i += by) if (usable(i)) return highlight(i);
  };
  let typed = '';
  let typedAt = 0;
  btn.addEventListener('click', () => (p.isOpen() ? p.close() : show()));
  btn.addEventListener('keydown', (e) => {
    const k = e.key;
    if (!p.isOpen()) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(k)) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (k === 'ArrowDown' || k === 'ArrowUp') move(k === 'ArrowDown' ? 1 : -1);
    else if (k === 'Home' || k === 'End') highlight(k === 'Home' ? opts.findIndex((_, i) => usable(i)) : opts.length - 1);
    else if (k === 'Enter' || k === ' ') pick(active);
    else if (k === 'Escape') p.close();
    else if (k === 'Tab') return p.close();
    else if (k.length === 1) {
      // Typeahead: jump to the first option starting with what was typed.
      typed = Date.now() - typedAt > 700 ? k : typed + k;
      typedAt = Date.now();
      const i = opts.findIndex((n, j) => usable(j) && n.textContent!.toLowerCase().startsWith(typed.toLowerCase()));
      if (i >= 0) highlight(i);
    } else return;
    e.preventDefault();
  });
  sel.addEventListener('change', sync);
  sync();
}

/* ---------- date ---------- */

function date(native: HTMLInputElement) {
  const input = el('input', 'ndate', { type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'TT.MM.JJJJ', role: 'combobox', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }) as HTMLInputElement;
  input.value = formatDay(native.value);
  const wrap = adopt(native, input);
  const today = isoDay(new Date());
  const allowed = (s: string) => (!native.min || s >= native.min) && (!native.max || s <= native.max);
  const cal = el('div', 'npop ncal', { role: 'dialog', 'aria-label': 'Datum wählen' });
  let active = native.value || (native.min && native.min > today ? native.min : today);

  const set = (s: string) => {
    input.value = formatDay(s);
    if (native.value !== s) {
      native.value = s;
      fire(native);
    }
  };
  const commit = () => {
    const t = input.value.trim();
    if (!t) return set('');
    const s = parseDay(t);
    if (s && allowed(s)) set(s);
    else input.value = formatDay(native.value);
  };
  const render = () => {
    const v = fromIsoDay(active)!;
    const month = active.slice(0, 7);
    cal.innerHTML = `<div class="ncal-h"><button type="button" data-m="-1" aria-label="Vorheriger Monat">‹</button><strong aria-live="polite">${MONTHS[v.getMonth()]} ${v.getFullYear()}</strong><button type="button" data-m="1" aria-label="Nächster Monat">›</button></div><div class="ncal-g" role="grid">${WEEKDAYS_SHORT.map(
      (w) => `<span role="columnheader">${w}</span>`,
    ).join('')}${monthGrid(v.getFullYear(), v.getMonth())
      .map(
        (s) =>
          `<button type="button" role="gridcell" data-d="${s}" tabindex="${s === active ? 0 : -1}" aria-label="${longDay(s)}"${s === native.value ? ' aria-selected="true"' : ''}${s === today ? ' aria-current="date"' : ''}${s.slice(0, 7) !== month ? ' data-out' : ''}${allowed(s) ? '' : ' disabled'}>${Number(s.slice(8))}</button>`,
      )
      .join('')}</div>`;
  };
  const focusDay = () => cal.querySelector<HTMLElement>(`[data-d="${active}"]`)?.focus();
  const p = popup(wrap, cal, () => input.setAttribute('aria-expanded', 'false'));
  const show = () => {
    active = parseDay(input.value) ?? (native.value || active);
    render();
    p.open();
    input.setAttribute('aria-expanded', 'true');
  };
  const choose = (s: string) => {
    if (!allowed(s)) return;
    set(s);
    p.close();
    input.focus();
  };

  input.addEventListener('click', () => !p.isOpen() && show());
  input.addEventListener('input', () => {
    const s = parseDay(input.value);
    if (s && p.isOpen()) {
      active = s;
      render();
    }
  });
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!p.isOpen()) show();
      focusDay();
    } else if (e.key === 'Escape' && p.isOpen()) {
      e.preventDefault();
      p.close();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit();
      p.close();
    }
  });
  cal.addEventListener('pointerdown', (e) => !(e.target as Element).closest('button') && e.preventDefault());
  cal.addEventListener('click', (e) => {
    const b = (e.target as Element).closest('button');
    if (!b) return;
    if (b.dataset.m) {
      active = addMonths(active, Number(b.dataset.m));
      render();
    } else if (b.dataset.d) choose(b.dataset.d);
  });
  cal.addEventListener('keydown', (e) => {
    const k = e.key;
    const wd = (fromIsoDay(active)!.getDay() + 6) % 7;
    const to: Record<string, () => string> = {
      ArrowLeft: () => addDays(active, -1),
      ArrowRight: () => addDays(active, 1),
      ArrowUp: () => addDays(active, -7),
      ArrowDown: () => addDays(active, 7),
      PageUp: () => addMonths(active, -1),
      PageDown: () => addMonths(active, 1),
      Home: () => addDays(active, -wd),
      End: () => addDays(active, 6 - wd),
    };
    if (to[k] && (e.target as Element).matches('[data-d]')) {
      active = to[k]();
      render();
      focusDay();
    } else if (k === 'Escape') {
      p.close();
      input.focus();
    } else return;
    e.preventDefault();
  });
  wrap.addEventListener('focusout', (e) => {
    if (!wrap.contains(e.relatedTarget as Node)) {
      commit();
      p.close();
    }
  });
}

/* ---------- number: own − / + instead of the spin buttons ---------- */

function number(input: HTMLInputElement) {
  const wrap = el('div', 'nstep');
  input.before(wrap);
  const btn = (by: number, label: string, sign: string) => {
    const b = el('button', '', { type: 'button', 'aria-label': label, tabindex: '-1' });
    b.textContent = sign;
    b.addEventListener('click', () => {
      if (by > 0) input.stepUp();
      else input.stepDown();
      fire(input);
    });
    return b;
  };
  wrap.append(btn(-1, 'Weniger', '−'), input, btn(1, 'Mehr', '+'));
}

/* ---------- file: own button and file name, drop zone ---------- */

function file(native: HTMLInputElement) {
  const btn = el('button', 'nfile-b', { type: 'button' });
  btn.textContent = native.multiple ? 'Dateien wählen' : 'Datei wählen';
  const name = el('span', 'nfile-n');
  const front = el('div', 'nfile');
  front.append(btn, name);
  const wrap = adopt(native, front, btn);
  name.id = nextId('nf');
  btn.setAttribute('aria-describedby', `${btn.getAttribute('aria-describedby') ?? ''} ${name.id}`.trim());
  const sync = () => {
    const files = [...(native.files ?? [])];
    name.textContent = files.length ? files.map((f) => f.name).join(', ') : 'Keine Datei ausgewählt';
    front.classList.toggle('has', files.length > 0);
  };
  btn.addEventListener('click', () => native.click());
  native.addEventListener('change', sync);
  wrap.addEventListener('dragover', (e) => {
    e.preventDefault();
    front.classList.add('drop');
  });
  wrap.addEventListener('dragleave', () => front.classList.remove('drop'));
  wrap.addEventListener('drop', (e) => {
    e.preventDefault();
    front.classList.remove('drop');
    if (e.dataTransfer?.files.length) {
      native.files = e.dataTransfer.files;
      fire(native);
    }
  });
  sync();
}

d.querySelectorAll<HTMLSelectElement>('select:not([multiple])').forEach(select);
d.querySelectorAll<HTMLInputElement>('input[type=date]').forEach(date);
d.querySelectorAll<HTMLInputElement>('input[type=number]').forEach(number);
d.querySelectorAll<HTMLInputElement>('input[type=file]').forEach(file);

/**
 * The only JavaScript public pages load (a few KB). Everything works without
 * it; this file only enhances: analytics beacon, two-click embeds, lightbox,
 * multi-step forms, add-to-cart without reload.
 */
const d = document;
d.documentElement.classList.add('js');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- cookieless analytics ---------- */
if (d.body.dataset.a) {
  const send = () => {
    const body = JSON.stringify({ p: location.pathname, r: d.referrer, w: innerWidth });
    if (!navigator.sendBeacon?.('/_nova/hit', body)) fetch('/_nova/hit', { method: 'POST', body, keepalive: true }).catch(() => {});
  };
  if ((d.visibilityState as string) === 'prerender') d.addEventListener('visibilitychange', send, { once: true });
  else send();
}

/* ---------- two-click embeds ---------- */
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

function loadEmbed(box: HTMLElement, autoplay: boolean) {
  const src = box.dataset.src!;
  const f = d.createElement('iframe');
  f.src = autoplay ? src : src.replace('autoplay=1', 'autoplay=0');
  f.title = box.dataset.title || 'Eingebetteter Inhalt';
  f.allow = 'autoplay; fullscreen; picture-in-picture';
  f.loading = 'lazy';
  f.referrerPolicy = 'strict-origin-when-cross-origin';
  box.replaceChildren(f);
}

d.querySelectorAll<HTMLElement>('[data-consent]').forEach((box) => {
  const kind = box.dataset.consent!;
  if (store.get(`nova-consent-${kind}`) === '1') return loadEmbed(box, false);
  box.querySelector('[data-consent-load]')?.addEventListener('click', () => {
    if ((box.querySelector('[data-consent-remember]') as HTMLInputElement | null)?.checked) store.set(`nova-consent-${kind}`, '1');
    loadEmbed(box, true);
  });
});

/* ---------- video: own controls (without JS the native ones stay) ---------- */
// [filled shape, outline] per icon, drawn on a 20×20 grid.
const ICON: Record<string, [string, string]> = {
  play: ['M7 4.5v11l9-5.5z', ''],
  pause: ['M6 4.5h3v11H6zm5 0h3v11h-3z', ''],
  vol: ['M3 7.5h3l4-3.5v12l-4-3.5H3z', 'M13 7a4 4 0 0 1 0 6M15 4.5a7.5 7.5 0 0 1 0 11'],
  mute: ['M3 7.5h3l4-3.5v12l-4-3.5H3z', 'M13.5 8l4 4m0-4-4 4'],
  full: ['', 'M3.5 7.5v-4h4m5 0h4v4m0 5v4h-4m-5 0h-4v-4'],
  exit: ['', 'M7.5 3.5v4h-4m13 0h-4v-4m0 13v-4h4m-13 0h4v4'],
};
const icon = (n: string) => `<svg viewBox="0 0 20 20" aria-hidden="true"><path class="f" d="${ICON[n][0]}"/><path d="${ICON[n][1]}"/></svg>`;
const clock = (t: number) => (Number.isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '–:––');

d.querySelectorAll<HTMLVideoElement>('video.vid').forEach((v) => {
  v.controls = false;
  const box = d.createElement('div');
  box.className = 'nvid paused';
  box.tabIndex = 0;
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'Videoplayer');
  v.before(box);
  box.append(v);
  box.insertAdjacentHTML(
    'beforeend',
    `<button type="button" class="nvid-big" aria-label="Abspielen">${icon('play')}</button><div class="nvid-bar"><button type="button" class="nvid-pp" aria-label="Abspielen">${icon('play')}</button><div class="nvid-track" role="slider" tabindex="0" aria-label="Position" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="nvid-fill"></div></div><span class="nvid-time">0:00 / –:––</span><button type="button" class="nvid-vol" aria-label="Ton aus">${icon('vol')}</button><button type="button" class="nvid-fs" aria-label="Vollbild">${icon('full')}</button></div>`,
  );
  const $ = <T extends HTMLElement>(c: string) => box.querySelector<T>(c)!;
  const [big, pp, track, fill, time, vol, fs] = ['.nvid-big', '.nvid-pp', '.nvid-track', '.nvid-fill', '.nvid-time', '.nvid-vol', '.nvid-fs'].map((c) => $(c));
  const toggle = () => (v.paused ? v.play() : v.pause());
  const seek = (t: number) => {
    if (Number.isFinite(v.duration)) v.currentTime = Math.max(0, Math.min(v.duration, t));
  };
  const paint = () => {
    const p = v.duration ? (v.currentTime / v.duration) * 100 : 0;
    fill.style.width = `${p}%`;
    track.setAttribute('aria-valuenow', String(Math.round(p)));
    track.setAttribute('aria-valuetext', `${clock(v.currentTime)} von ${clock(v.duration)}`);
    time.textContent = `${clock(v.currentTime)} / ${clock(v.duration)}`;
  };
  const state = () => {
    box.classList.toggle('paused', v.paused);
    const label = v.paused ? 'Abspielen' : 'Pause';
    pp.innerHTML = icon(v.paused ? 'play' : 'pause');
    pp.setAttribute('aria-label', label);
    big.setAttribute('aria-label', label);
  };
  let idle = 0;
  const wake = () => {
    box.classList.add('awake');
    clearTimeout(idle);
    idle = window.setTimeout(() => !v.paused && box.classList.remove('awake'), 2200);
  };
  v.addEventListener('play', state);
  v.addEventListener('pause', state);
  v.addEventListener('ended', state);
  v.addEventListener('timeupdate', paint);
  v.addEventListener('loadedmetadata', paint);
  v.addEventListener('volumechange', () => {
    vol.innerHTML = icon(v.muted ? 'mute' : 'vol');
    vol.setAttribute('aria-label', v.muted ? 'Ton an' : 'Ton aus');
  });
  v.addEventListener('click', toggle);
  big.addEventListener('click', toggle);
  pp.addEventListener('click', toggle);
  vol.addEventListener('click', () => (v.muted = !v.muted));
  fs.addEventListener('click', () => {
    if (d.fullscreenElement) d.exitFullscreen();
    else if (box.requestFullscreen) box.requestFullscreen();
    else (v as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen?.(); // iPhone
  });
  d.addEventListener('fullscreenchange', () => {
    const on = d.fullscreenElement === box;
    fs.innerHTML = icon(on ? 'exit' : 'full');
    fs.setAttribute('aria-label', on ? 'Vollbild beenden' : 'Vollbild');
  });
  const scrub = (e: PointerEvent) => {
    const r = track.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * v.duration);
  };
  track.addEventListener('pointerdown', (e) => {
    track.setPointerCapture(e.pointerId);
    scrub(e);
    const move = (ev: PointerEvent) => scrub(ev);
    track.addEventListener('pointermove', move);
    track.addEventListener('pointerup', () => track.removeEventListener('pointermove', move), { once: true });
  });
  box.addEventListener('pointermove', wake);
  box.addEventListener('focusin', wake);
  box.addEventListener('keydown', (e) => {
    const k = e.key;
    if ((e.target as HTMLElement).matches('button') && (k === ' ' || k === 'Enter')) return;
    if (k === ' ' || k === 'k') toggle();
    else if (k === 'ArrowRight' || k === 'ArrowLeft') seek(v.currentTime + (k === 'ArrowRight' ? 5 : -5));
    else if (k === 'm') v.muted = !v.muted;
    else if (k === 'f') fs.click();
    else return;
    e.preventDefault();
    wake();
  });
});

/* ---------- lightbox ---------- */
d.querySelectorAll<HTMLElement>('[data-lightbox]').forEach((gal) => {
  const links = [...gal.querySelectorAll<HTMLAnchorElement>('a[href]')];
  links.forEach((a, i) =>
    a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      open(i);
    }),
  );
  function open(start: number) {
    let i = start;
    const opener = d.activeElement as HTMLElement | null;
    const lb = d.createElement('div');
    lb.className = 'lb';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', 'Bildansicht');
    lb.innerHTML = '<img alt=""><button class="x" aria-label="Schliessen">×</button>' + (links.length > 1 ? '<button class="prev" aria-label="Vorheriges Bild">‹</button><button class="next" aria-label="Nächstes Bild">›</button>' : '');
    const img = lb.querySelector('img')!;
    const show = () => {
      img.src = links[i].href;
      img.alt = links[i].dataset.caption || links[i].querySelector('img')?.alt || '';
    };
    const close = () => {
      lb.classList.remove('on');
      setTimeout(() => lb.remove(), reduced ? 0 : 200);
      d.removeEventListener('keydown', key);
      opener?.focus();
    };
    const step = (n: number) => {
      i = (i + n + links.length) % links.length;
      show();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    lb.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.classList.contains('prev')) step(-1);
      else if (t.classList.contains('next')) step(1);
      else if (t !== img) close();
    });
    d.addEventListener('keydown', key);
    show();
    d.body.append(lb);
    requestAnimationFrame(() => lb.classList.add('on'));
    (lb.querySelector('.x') as HTMLElement).focus();
  }
});

/* ---------- text fields: growing textareas, length counter, own clear button for search ---------- */
const grows = CSS.supports('field-sizing', 'content');
d.querySelectorAll<HTMLTextAreaElement>('.fld textarea').forEach((t) => {
  if (!grows) {
    // Fallback for browsers without field-sizing: grow with the content up to the CSS max-height.
    const fit = () => {
      t.style.height = 'auto';
      t.style.height = `${t.scrollHeight + 2}px`;
    };
    t.addEventListener('input', fit);
    fit();
  }
  if (t.maxLength > 0) {
    const max = t.maxLength;
    const n = d.createElement('span');
    n.className = 'ncount';
    n.setAttribute('aria-hidden', 'true');
    // Screen readers hear it once, when the limit is close.
    const live = d.createElement('span');
    live.className = 'sr';
    live.setAttribute('aria-live', 'polite');
    let warned = false;
    const count = () => {
      const left = max - t.value.length;
      n.textContent = `${t.value.length.toLocaleString('de-CH')} / ${max.toLocaleString('de-CH')}`;
      n.classList.toggle('near', left <= max * 0.1);
      if (left <= max * 0.1 && !warned) live.textContent = `Noch ${left} Zeichen möglich.`;
      warned = left <= max * 0.1;
    };
    t.after(n, live);
    t.addEventListener('input', count);
    count();
  }
});
d.querySelectorAll<HTMLInputElement>('input[type=search]').forEach((q) => {
  const box = d.createElement('span');
  box.className = 'nsearch';
  q.before(box);
  box.append(q);
  const x = d.createElement('button');
  x.type = 'button';
  x.className = 'nclear';
  x.setAttribute('aria-label', 'Suchbegriff löschen');
  x.textContent = '×';
  box.append(x);
  const sync = () => (x.hidden = !q.value);
  x.addEventListener('click', () => {
    q.value = '';
    sync();
    q.focus();
  });
  q.addEventListener('input', sync);
  sync();
});

/* ---------- form validation: own German messages under the field, no browser bubbles ---------- */
type Ctrl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
function message(c: Ctrl): string {
  const v = c.validity;
  const type = c instanceof HTMLInputElement ? c.type : c instanceof HTMLSelectElement ? 'select' : 'text';
  if (v.valueMissing)
    return type === 'checkbox' ? 'Bitte bestätige das.' : type === 'select' || type === 'radio' ? 'Bitte wähle etwas aus.' : type === 'file' ? 'Bitte wähle eine Datei.' : type === 'date' ? 'Bitte gib ein Datum ein.' : 'Bitte fülle dieses Feld aus.';
  if (v.typeMismatch) return type === 'email' ? 'Bitte gib eine gültige E-Mail-Adresse ein, z. B. name@beispiel.ch.' : 'Bitte gib eine gültige Adresse ein.';
  if (v.rangeUnderflow) return type === 'date' ? 'Dieses Datum ist zu früh.' : `Bitte mindestens ${(c as HTMLInputElement).min}.`;
  if (v.rangeOverflow) return type === 'date' ? 'Dieses Datum ist zu spät.' : `Bitte höchstens ${(c as HTMLInputElement).max}.`;
  if (v.tooShort) return `Bitte mindestens ${(c as HTMLInputElement).minLength} Zeichen.`;
  if (v.badInput || v.stepMismatch) return 'Bitte gib eine gültige Zahl ein.';
  return c.validationMessage;
}
let focusedInvalid = false;
d.addEventListener(
  'invalid',
  (e) => {
    const c = e.target as Ctrl;
    if (!c.closest('form')) return;
    e.preventDefault();
    // Where the message goes: after an own control's wrapper (fields.js), at the end of a checkbox row, else after the field.
    const host = (c.closest('.nw') ?? (c.type === 'checkbox' ? c.closest('.fld') : null) ?? c) as HTMLElement;
    const id = `${c.name || c.id}-err`;
    // An own control from fields.js took over the id; the native one is "<id>-n".
    const front = (c.id.endsWith('-n') && d.getElementById(c.id.slice(0, -2))) || c;
    let msg = d.getElementById(id);
    if (!msg) {
      msg = d.createElement('span');
      msg.className = 'nerr';
      msg.id = id;
      if (host === c.closest('.fld') && host !== c) host.append(msg);
      else host.after(msg);
      front.setAttribute('aria-describedby', `${front.getAttribute('aria-describedby') ?? ''} ${id}`.trim());
    }
    msg.textContent = message(c);
    c.setAttribute('aria-invalid', 'true');
    if (!focusedInvalid) {
      focusedInvalid = true;
      c.focus();
      setTimeout(() => (focusedInvalid = false));
    }
    if (c.dataset.nv) return;
    c.dataset.nv = '1';
    // validity.valid, not checkValidity(): that would fire "invalid" again.
    const clear = () => {
      if (!c.validity.valid) return;
      d.getElementById(id)?.remove();
      c.removeAttribute('aria-invalid');
    };
    c.addEventListener('input', clear);
    c.addEventListener('change', clear);
  },
  true,
);

/* ---------- forms: conditions, steps, async submit ---------- */
d.querySelectorAll<HTMLFormElement>('form[data-nova-form]').forEach((form) => {
  const conds = [...form.querySelectorAll<HTMLElement>('[data-show-if]')];
  const evaluate = () => {
    for (const el of conds) {
      const rule = JSON.parse(el.dataset.showIf!) as { field: string; equals: string };
      const ctrl = form.elements.namedItem(rule.field) as HTMLInputElement | HTMLSelectElement | null;
      const value = ctrl instanceof HTMLInputElement && ctrl.type === 'checkbox' ? (ctrl.checked ? 'ja' : '') : (ctrl?.value ?? '');
      const visible = value === rule.equals;
      el.hidden = !visible;
      el.querySelectorAll<HTMLInputElement>('input,select,textarea').forEach((x) => (x.disabled = !visible));
    }
  };
  if (conds.length) {
    form.addEventListener('input', evaluate);
    evaluate();
  }

  const steps = [...form.querySelectorAll<HTMLFieldSetElement>('fieldset[data-step]')];
  let current = 0;
  const go = (n: number) => {
    steps[current].classList.remove('on');
    current = n;
    steps[current].classList.add('on');
    steps[current].querySelector<HTMLElement>('input,select,textarea')?.focus();
  };
  form.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.matches('[data-step-next]')) {
      const fields = [...steps[current].querySelectorAll<HTMLInputElement>('input,select,textarea')];
      if (fields.every((f) => f.disabled || f.reportValidity())) go(current + 1);
    } else if (t.matches('[data-step-back]')) go(current - 1);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = form.querySelector<HTMLButtonElement>('button[type=submit]:not([hidden])') ?? form.querySelector('button[type=submit]');
    if (button?.getAttribute('aria-busy')) return;
    button?.setAttribute('aria-busy', 'true');
    form.querySelector('.form-err')?.remove();
    try {
      const r = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
      const res = (await r.json()) as { ok: boolean; message: string };
      if (!res.ok) throw new Error(res.message);
      const ok = d.createElement('div');
      ok.className = 'form-ok';
      ok.setAttribute('role', 'status');
      ok.tabIndex = -1;
      ok.textContent = res.message;
      if (!reduced) ok.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.7,.2,1)' });
      form.replaceWith(ok);
      ok.focus();
    } catch (err) {
      const p = d.createElement('p');
      p.className = 'form-err';
      p.setAttribute('role', 'alert');
      p.textContent = (err as Error).message || 'Das hat nicht geklappt. Bitte versuch es nochmals.';
      form.prepend(p);
      button?.removeAttribute('aria-busy');
    }
  });
});

/* ---------- shop ---------- */
d.querySelectorAll<HTMLSelectElement>('select[name=variant]').forEach((sel) => {
  const target = d.querySelector('[data-price]');
  sel.addEventListener('change', () => {
    const price = sel.selectedOptions[0]?.dataset.price;
    if (target && price) target.textContent = price;
  });
});

d.querySelectorAll<HTMLFormElement>('form[data-add-to-cart]').forEach((form) => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = form.querySelector('button[type=submit], button:not([type])');
    if (button?.getAttribute('aria-busy')) return;
    button?.setAttribute('aria-busy', 'true');
    try {
      const r = await fetch(form.action, { method: 'POST', body: new URLSearchParams(new FormData(form) as unknown as Record<string, string>), headers: { Accept: 'application/json' } });
      const res = (await r.json()) as { ok: boolean; count: number; message: string };
      d.querySelectorAll<HTMLElement>('[data-cart-count]').forEach((el) => {
        el.textContent = String(res.count);
        if (!reduced) el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(.3,1.6,.5,1)' });
      });
      let note = form.querySelector<HTMLElement>('.form-ok, .form-err');
      if (!note) {
        note = d.createElement('p');
        note.setAttribute('role', 'status');
        form.append(note);
      }
      note.className = res.ok ? 'form-ok' : 'form-err';
      note.innerHTML = '';
      note.append(res.message + ' ');
      if (res.ok) {
        const a = d.createElement('a');
        a.href = '/warenkorb';
        a.textContent = 'Zum Warenkorb';
        note.append(a);
      }
    } finally {
      button?.removeAttribute('aria-busy');
    }
  });
});

/* ---------- buttons: busy state while a normal form submits, no double orders ---------- */
d.addEventListener('submit', (e) => {
  if (e.defaultPrevented) return; // async forms above handle themselves
  const form = e.target as HTMLFormElement;
  if (form.dataset.busy) return e.preventDefault();
  form.dataset.busy = '1';
  (e.submitter ?? form.querySelector('button[type=submit], button:not([type])'))?.setAttribute('aria-busy', 'true');
});
// Back/forward cache: a page restored after navigating away must not stay busy.
addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  d.querySelectorAll('[aria-busy]').forEach((b) => b.removeAttribute('aria-busy'));
  d.querySelectorAll<HTMLFormElement>('form[data-busy]').forEach((f) => delete f.dataset.busy);
});

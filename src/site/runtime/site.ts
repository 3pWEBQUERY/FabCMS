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
    if (button) button.disabled = true;
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
      if (button) button.disabled = false;
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
    const button = form.querySelector('button');
    if (button) button.disabled = true;
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
      if (button) button.disabled = false;
    }
  });
});

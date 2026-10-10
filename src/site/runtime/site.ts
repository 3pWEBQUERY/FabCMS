/**
 * The only JavaScript public pages load (a few KB). Everything works without
 * it; this file only enhances: analytics beacon, two-click embeds, lightbox,
 * multi-step forms, add-to-cart without reload.
 */
const d = document;
d.documentElement.classList.add('js');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- language: German source, local dictionary (no server code in this bundle) ---------- */
const LOC = d.documentElement.lang || 'de-CH';
const DICT: Record<string, Record<string, string>> = {
  fr: {
    'Eingebetteter Inhalt': 'Contenu intégré',
    Videoplayer: 'Lecteur vidéo',
    Abspielen: 'Lire',
    Pause: 'Pause',
    Position: 'Position',
    'Ton aus': 'Couper le son',
    'Ton an': 'Activer le son',
    Vollbild: 'Plein écran',
    'Vollbild beenden': 'Quitter le plein écran',
    '{a} von {b}': '{a} sur {b}',
    Bildansicht: 'Visionneuse d’images',
    Schliessen: 'Fermer',
    'Vorheriges Bild': 'Image précédente',
    'Nächstes Bild': 'Image suivante',
    'Noch {n} Zeichen möglich.': 'Encore {n} caractères possibles.',
    'Suchbegriff löschen': 'Effacer la recherche',
    'Bitte bestätige das.': 'Veuillez confirmer.',
    'Bitte wähle etwas aus.': 'Veuillez faire un choix.',
    'Bitte wähle eine Datei.': 'Veuillez choisir un fichier.',
    'Bitte gib ein Datum ein.': 'Veuillez saisir une date.',
    'Bitte fülle dieses Feld aus.': 'Veuillez remplir ce champ.',
    'Bitte gib eine gültige E-Mail-Adresse ein, z. B. name@beispiel.ch.': 'Veuillez saisir une adresse e-mail valable, p. ex. nom@exemple.ch.',
    'Bitte gib eine gültige Adresse ein.': 'Veuillez saisir une adresse valable.',
    'Dieses Datum ist zu früh.': 'Cette date est trop précoce.',
    'Dieses Datum ist zu spät.': 'Cette date est trop tardive.',
    'Bitte mindestens {n}.': 'Minimum {n}.',
    'Bitte höchstens {n}.': 'Maximum {n}.',
    'Bitte mindestens {n} Zeichen.': 'Au moins {n} caractères.',
    'Bitte gib eine gültige Zahl ein.': 'Veuillez saisir un nombre valable.',
    'Das hat nicht geklappt. Bitte versuch es nochmals.': 'Cela n’a pas fonctionné. Veuillez réessayer.',
    'Zum Warenkorb': 'Voir le panier',
  },
  it: {
    'Eingebetteter Inhalt': 'Contenuto incorporato',
    Videoplayer: 'Lettore video',
    Abspielen: 'Riproduci',
    Pause: 'Pausa',
    Position: 'Posizione',
    'Ton aus': 'Disattiva audio',
    'Ton an': 'Attiva audio',
    Vollbild: 'Schermo intero',
    'Vollbild beenden': 'Esci da schermo intero',
    '{a} von {b}': '{a} di {b}',
    Bildansicht: 'Visualizzatore immagini',
    Schliessen: 'Chiudi',
    'Vorheriges Bild': 'Immagine precedente',
    'Nächstes Bild': 'Immagine successiva',
    'Noch {n} Zeichen möglich.': 'Ancora {n} caratteri disponibili.',
    'Suchbegriff löschen': 'Cancella la ricerca',
    'Bitte bestätige das.': 'Conferma, per favore.',
    'Bitte wähle etwas aus.': 'Scegli un’opzione.',
    'Bitte wähle eine Datei.': 'Scegli un file.',
    'Bitte gib ein Datum ein.': 'Inserisci una data.',
    'Bitte fülle dieses Feld aus.': 'Compila questo campo.',
    'Bitte gib eine gültige E-Mail-Adresse ein, z. B. name@beispiel.ch.': 'Inserisci un indirizzo e-mail valido, p. es. nome@esempio.ch.',
    'Bitte gib eine gültige Adresse ein.': 'Inserisci un indirizzo valido.',
    'Dieses Datum ist zu früh.': 'Questa data è troppo anticipata.',
    'Dieses Datum ist zu spät.': 'Questa data è troppo lontana.',
    'Bitte mindestens {n}.': 'Almeno {n}.',
    'Bitte höchstens {n}.': 'Al massimo {n}.',
    'Bitte mindestens {n} Zeichen.': 'Almeno {n} caratteri.',
    'Bitte gib eine gültige Zahl ein.': 'Inserisci un numero valido.',
    'Das hat nicht geklappt. Bitte versuch es nochmals.': 'Non ha funzionato. Riprova.',
    'Zum Warenkorb': 'Vai al carrello',
  },
  en: {
    'Eingebetteter Inhalt': 'Embedded content',
    Videoplayer: 'Video player',
    Abspielen: 'Play',
    Pause: 'Pause',
    Position: 'Position',
    'Ton aus': 'Mute',
    'Ton an': 'Unmute',
    Vollbild: 'Full screen',
    'Vollbild beenden': 'Exit full screen',
    '{a} von {b}': '{a} of {b}',
    Bildansicht: 'Image viewer',
    Schliessen: 'Close',
    'Vorheriges Bild': 'Previous image',
    'Nächstes Bild': 'Next image',
    'Noch {n} Zeichen möglich.': '{n} characters left.',
    'Suchbegriff löschen': 'Clear search',
    'Bitte bestätige das.': 'Please confirm this.',
    'Bitte wähle etwas aus.': 'Please choose an option.',
    'Bitte wähle eine Datei.': 'Please choose a file.',
    'Bitte gib ein Datum ein.': 'Please enter a date.',
    'Bitte fülle dieses Feld aus.': 'Please fill in this field.',
    'Bitte gib eine gültige E-Mail-Adresse ein, z. B. name@beispiel.ch.': 'Please enter a valid email address, e.g. name@example.ch.',
    'Bitte gib eine gültige Adresse ein.': 'Please enter a valid address.',
    'Dieses Datum ist zu früh.': 'This date is too early.',
    'Dieses Datum ist zu spät.': 'This date is too late.',
    'Bitte mindestens {n}.': 'At least {n}, please.',
    'Bitte höchstens {n}.': 'At most {n}, please.',
    'Bitte mindestens {n} Zeichen.': 'At least {n} characters, please.',
    'Bitte gib eine gültige Zahl ein.': 'Please enter a valid number.',
    'Das hat nicht geklappt. Bitte versuch es nochmals.': 'That didn’t work. Please try again.',
    'Zum Warenkorb': 'Go to cart',
  },
};
/** Text in the page's language; German (the source) when there is no entry. */
const tx = (de: string, params?: Record<string, string | number>) => {
  const text = DICT[LOC.slice(0, 2)]?.[de] ?? de;
  return params ? text.replace(/\{(\w+)\}/g, (m, k: string) => (params[k] !== undefined ? String(params[k]) : m)) : text;
};

/* ---------- cookieless analytics ---------- */
if (d.body.dataset.a) {
  const send = () => {
    const body = JSON.stringify({ p: location.pathname, r: d.referrer, w: innerWidth });
    if (!navigator.sendBeacon?.('/_nova/hit', body)) fetch('/_nova/hit', { method: 'POST', body, keepalive: true }).catch(() => {});
  };
  if ((d.visibilityState as string) === 'prerender') d.addEventListener('visibilitychange', send, { once: true });
  else send();
}

/* ---------- statistics services: Plausible, Matomo, Google Analytics ---------- */
const statsEl = d.getElementById('nova-stats');
if (statsEl) {
  type Cfg = { plausible?: { domain: string; src: string }; matomo?: { url: string; siteId: string; cookies: boolean }; ga4?: { id: string }; consent: string[]; key: string };
  const cfg = JSON.parse(statsEl.textContent || '{}') as Cfg;
  const w = window as unknown as Record<string, any>;
  const load = (src: string, attrs: Record<string, string> = {}) => {
    const el = d.createElement('script');
    el.src = src;
    el.async = true;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    d.head.append(el);
  };
  const goals = () => [...d.querySelectorAll<HTMLElement>('[data-goal]')].map((el) => el.dataset.goal!);
  const started = new Set<string>();
  const plausible = () => {
    if (!cfg.plausible || started.has('plausible')) return;
    started.add('plausible');
    w.plausible ??= function (...args: unknown[]) {
      (w.plausible.q = w.plausible.q || []).push(args);
    };
    load(cfg.plausible.src, { 'data-domain': cfg.plausible.domain, defer: '' });
    for (const g of goals()) w.plausible(g);
  };
  const matomo = () => {
    if (!cfg.matomo || started.has('matomo')) return;
    started.add('matomo');
    const q = (w._paq = w._paq || []);
    if (!cfg.matomo.cookies) q.push(['disableCookies']);
    q.push(['setTrackerUrl', `${cfg.matomo.url}matomo.php`], ['setSiteId', cfg.matomo.siteId], ['trackPageView'], ['enableLinkTracking']);
    for (const g of goals()) q.push(['trackEvent', 'Nova', g]);
    load(`${cfg.matomo.url}matomo.js`);
  };
  const ga4 = () => {
    if (!cfg.ga4 || started.has('ga4')) return;
    started.add('ga4');
    w.dataLayer = w.dataLayer || [];
    // gtag needs the arguments object itself, not an array.
    w.gtag = function () {
      w.dataLayer.push(arguments);
    };
    w.gtag('js', new Date());
    w.gtag('config', cfg.ga4.id);
    for (const g of goals()) w.gtag('event', g);
    load(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(cfg.ga4.id)}`);
  };
  const withConsent = () => {
    ga4();
    if (cfg.matomo?.cookies) matomo();
  };
  // Without cookies, no consent needed.
  plausible();
  if (cfg.matomo && !cfg.matomo.cookies) matomo();

  if (cfg.consent.length) {
    const KEY = 'nova-consent';
    const read = (): boolean | null => {
      try {
        const v = JSON.parse(localStorage.getItem(KEY) || 'null') as { key: string; ok: boolean } | null;
        return v && v.key === cfg.key ? v.ok : null;
      } catch {
        return null;
      }
    };
    const save = (ok: boolean) => {
      try {
        localStorage.setItem(KEY, JSON.stringify({ key: cfg.key, ok, at: new Date().toISOString() }));
      } catch {
        /* private mode: asked again next time */
      }
    };
    const bar = d.getElementById('nova-consent');
    const show = () => {
      if (!bar) return;
      bar.hidden = false;
      bar.querySelector<HTMLElement>('[data-consent-no]')?.focus({ preventScroll: true });
    };
    // Cookies the services set, on this host and the ones above it.
    const forget = () => {
      const hosts = location.hostname.split('.').map((_, i, a) => a.slice(i).join('.')).filter((h) => h.includes('.'));
      for (const c of d.cookie.split(';')) {
        const name = c.split('=')[0].trim();
        if (!/^(_ga|_gid|_gat|_pk_|mtm_|MATOMO_)/.test(name)) continue;
        for (const h of ['', ...hosts.map((x) => `;domain=.${x}`)]) d.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/${h}`;
      }
    };
    const answer = (ok: boolean) => {
      const before = read();
      save(ok);
      if (bar) bar.hidden = true;
      if (ok) withConsent();
      else if (before) {
        // Scripts that already run can't be unloaded: remove their cookies and start over without them.
        forget();
        location.reload();
      }
    };
    bar?.querySelector('[data-consent-yes]')?.addEventListener('click', () => answer(true));
    bar?.querySelector('[data-consent-no]')?.addEventListener('click', () => answer(false));
    d.querySelectorAll('[data-consent-open]').forEach((b) => b.addEventListener('click', show));
    const stored = read();
    // Global Privacy Control counts as «no» – and then there is nothing to ask.
    const gpc = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
    if (stored === true) withConsent();
    else if (stored === null && !gpc) show();
  }
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
  f.title = box.dataset.title || tx('Eingebetteter Inhalt');
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
  box.setAttribute('aria-label', tx('Videoplayer'));
  v.before(box);
  box.append(v);
  box.insertAdjacentHTML(
    'beforeend',
    `<button type="button" class="nvid-big" aria-label="${tx('Abspielen')}">${icon('play')}</button><div class="nvid-bar"><button type="button" class="nvid-pp" aria-label="${tx('Abspielen')}">${icon('play')}</button><div class="nvid-track" role="slider" tabindex="0" aria-label="${tx('Position')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="nvid-fill"></div></div><span class="nvid-time">0:00 / ${clock(Number(v.dataset.duration) || NaN)}</span><button type="button" class="nvid-vol" aria-label="${tx('Ton aus')}">${icon('vol')}</button><button type="button" class="nvid-fs" aria-label="${tx('Vollbild')}">${icon('full')}</button></div>`,
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
    track.setAttribute('aria-valuetext', tx('{a} von {b}', { a: clock(v.currentTime), b: clock(v.duration) }));
    time.textContent = `${clock(v.currentTime)} / ${clock(v.duration)}`;
  };
  const state = () => {
    box.classList.toggle('paused', v.paused);
    const label = tx(v.paused ? 'Abspielen' : 'Pause');
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
    vol.setAttribute('aria-label', tx(v.muted ? 'Ton an' : 'Ton aus'));
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
    fs.setAttribute('aria-label', tx(on ? 'Vollbild beenden' : 'Vollbild'));
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
    lb.setAttribute('aria-label', tx('Bildansicht'));
    lb.innerHTML =
      `<img alt=""><button class="x" aria-label="${tx('Schliessen')}">×</button>` +
      (links.length > 1 ? `<button class="prev" aria-label="${tx('Vorheriges Bild')}">‹</button><button class="next" aria-label="${tx('Nächstes Bild')}">›</button>` : '');
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
      n.textContent = `${t.value.length.toLocaleString(LOC)} / ${max.toLocaleString(LOC)}`;
      n.classList.toggle('near', left <= max * 0.1);
      if (left <= max * 0.1 && !warned) live.textContent = tx('Noch {n} Zeichen möglich.', { n: left });
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
  x.setAttribute('aria-label', tx('Suchbegriff löschen'));
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
    return tx(
      type === 'checkbox'
        ? 'Bitte bestätige das.'
        : type === 'select' || type === 'radio'
          ? 'Bitte wähle etwas aus.'
          : type === 'file'
            ? 'Bitte wähle eine Datei.'
            : type === 'date'
              ? 'Bitte gib ein Datum ein.'
              : 'Bitte fülle dieses Feld aus.',
    );
  if (v.typeMismatch) return tx(type === 'email' ? 'Bitte gib eine gültige E-Mail-Adresse ein, z. B. name@beispiel.ch.' : 'Bitte gib eine gültige Adresse ein.');
  if (v.rangeUnderflow) return type === 'date' ? tx('Dieses Datum ist zu früh.') : tx('Bitte mindestens {n}.', { n: (c as HTMLInputElement).min });
  if (v.rangeOverflow) return type === 'date' ? tx('Dieses Datum ist zu spät.') : tx('Bitte höchstens {n}.', { n: (c as HTMLInputElement).max });
  if (v.tooShort) return tx('Bitte mindestens {n} Zeichen.', { n: (c as HTMLInputElement).minLength });
  if (v.badInput || v.stepMismatch) return tx('Bitte gib eine gültige Zahl ein.');
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
      p.textContent = (err as Error).message || tx('Das hat nicht geklappt. Bitte versuch es nochmals.');
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
        // The header's cart link already points to the page's language (/fr/…).
        a.href = d.querySelector<HTMLAnchorElement>('a.cart-link')?.getAttribute('href') || '/warenkorb';
        a.textContent = tx('Zum Warenkorb');
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

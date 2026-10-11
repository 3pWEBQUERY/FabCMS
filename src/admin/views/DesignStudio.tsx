import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { t, tl } from '../lib/i18n';
import { useApi } from '../lib/hooks';
import { useSession } from '../lib/session';
import { Icon } from '../ui/icons';
import { Field, Menu, Segmented, Select, Skeleton, Toggle, confirm } from '../ui/kit';
import { LoadingFrame } from '../ui/loading';
import { useToast } from '../ui/toast';
import { SaveBar, useSettingsDraft } from './settingsDraft';
import { shortId } from '../../shared/text';
import { contrastRatio, fixColor, parseHex } from '../../shared/contrast';
import { BLANK_COLORS, blankDesign, MAX_DESIGNS, type DesignBase, type DesignColors, type SiteDesign } from '../../shared/site-design';

/** A colour as hex: the browser's picker and the code side by side. */
function HexColor({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className="ds-color">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      <span className="ds-color-name">{label}</span>
      <input
        className="input mono"
        value={text}
        maxLength={7}
        spellCheck={false}
        aria-label={t('{label} als Hex-Code', { label })}
        onChange={(e) => {
          setText(e.target.value);
          if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value.toLowerCase());
        }}
        onBlur={() => setText(value)}
      />
    </label>
  );
}

const COLOR_FIELDS: { key: keyof Omit<DesignColors, 'dark'>; label: string }[] = [
  { key: 'bg', label: 'Hintergrund' },
  { key: 'surface', label: 'Flächen und Karten' },
  { key: 'ink', label: 'Text' },
  { key: 'ink2', label: 'Leiser Text' },
  { key: 'line', label: 'Linien' },
  { key: 'accent', label: 'Akzent' },
  { key: 'accentInk', label: 'Text auf Akzent' },
];
const INVERSE_FIELDS: { key: keyof Omit<DesignColors, 'dark'>; label: string }[] = [
  { key: 'invBg', label: 'Hintergrund' },
  { key: 'invInk', label: 'Text' },
  { key: 'invInk2', label: 'Leiser Text' },
  { key: 'invLine', label: 'Linien' },
];

const RATIOS = [
  { value: '1.125', label: 'Ruhig – kleine Sprünge' },
  { value: '1.2', label: 'Ausgewogen' },
  { value: '1.25', label: 'Deutlich' },
  { value: '1.333', label: 'Kräftig' },
  { value: '1.414', label: 'Dramatisch – grosse Titel' },
];

/** The pairs of colours that must stay readable, and what they are for. */
const CHECKS: { fg: keyof DesignColors; bg: keyof DesignColors; label: string; need: number }[] = [
  { fg: 'ink', bg: 'bg', label: 'Text auf Hintergrund', need: 4.5 },
  { fg: 'ink2', bg: 'bg', label: 'Leiser Text auf Hintergrund', need: 4.5 },
  { fg: 'ink', bg: 'surface', label: 'Text auf Flächen', need: 4.5 },
  { fg: 'accentInk', bg: 'accent', label: 'Text auf Akzent (Knöpfe)', need: 4.5 },
  { fg: 'accent', bg: 'bg', label: 'Akzent auf Hintergrund (Links, Umrandungen)', need: 3 },
  { fg: 'invInk', bg: 'invBg', label: 'Text in invertierten Bereichen', need: 4.5 },
];

function Group({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <section className="ds-group">
      <h3>{title}</h3>
      {sub && <p className="xsmall muted">{sub}</p>}
      {children}
    </section>
  );
}

/**
 * «Eigene Designs», like the theme styles in Bricks: a whole look built from
 * scratch – colours, fonts, sizes, titles, buttons, links and widths – while
 * the website keeps its current one. Every change shows at once in the
 * preview with the real pages; it goes live only when activated.
 */
export function DesignStudio() {
  const { bundle } = useSession();
  const toast = useToast();
  const { draft, set, dirty, save, reset } = useSettingsDraft();
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState('');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [goLive, setGoLive] = useState<string | null | undefined>(undefined);
  const { data: pages } = useApi<{ entries: { id: string; slug: string; title?: string; data?: { title?: string } }[] }>('/api/entries?collection=pages&limit=200');
  const designs = draft?.designs ?? [];
  const open = designs.find((d) => d.id === openId) ?? null;
  const active = draft?.activeDesign ?? null;

  // Going live: set, then saved together with the designs.
  useEffect(() => {
    if (goLive === undefined || !draft || draft.activeDesign !== goLive) return;
    setGoLive(undefined);
    void save().then((ok) => ok && toast(goLive ? t('Das Design ist jetzt live.') : t('Die Website zeigt wieder den gewählten Stil.')));
  }, [goLive, draft, save, toast]);

  // The preview follows every change, a moment after the last one.
  const [shown, setShown] = useState('');
  const encoded = useMemo(
    () =>
      open
        ? btoa(unescape(encodeURIComponent(JSON.stringify(open))))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '')
        : '',
    [open],
  );
  useEffect(() => {
    const timer = setTimeout(() => setShown(open ? `/_nova/theme-preview?design=${encoded}&page=${encodeURIComponent(page)}` : ''), 350);
    return () => clearTimeout(timer);
  }, [encoded, page, open]);

  if (!draft || !bundle) return <Skeleton />;

  const setDesigns = (next: SiteDesign[]) => set('designs', next);
  const change = (patch: Partial<SiteDesign>) => open && setDesigns(designs.map((d) => (d.id === open.id ? { ...d, ...patch, updatedAt: new Date().toISOString() } : d)));
  const nameFor = (base: string) => {
    let n = 1;
    while (designs.some((d) => d.name === (n === 1 ? base : `${base} ${n}`))) n++;
    return n === 1 ? base : `${base} ${n}`;
  };
  const add = (d: SiteDesign) => {
    if (designs.length >= MAX_DESIGNS) return toast(t('Höchstens {n} eigene Designs.', { n: MAX_DESIGNS }), { kind: 'bad' });
    setDesigns([...designs, d]);
    setOpenId(d.id);
  };
  /** A new design taking over a curated style – its colours, fonts and character. */
  const fromTheme = (themeId: string, paletteId: string, fontPair: string, spacing = 1, radius = 8) => {
    const th = bundle.themes.find((x) => x.id === themeId) ?? bundle.themes[0];
    const pal = th.palettes.find((x) => x.id === paletteId) ?? th.palettes[0];
    const pair = bundle.fontPairs.find((x) => x.id === fontPair) ?? bundle.fontPairs.find((x) => x.id === th.pair);
    const d = blankDesign(shortId(8), nameFor(t('Design nach «{name}»', { name: tl(th.name) })));
    const { id: _id, label: _label, dark, ...colors } = pal as typeof pal & { dark?: boolean };
    d.base = (['neutral', 'kante', 'bistro', 'salon', 'feuilleton'].includes(th.id) ? th.id : 'neutral') as DesignBase;
    d.colors = { ...BLANK_COLORS, ...colors, dark: Boolean(dark) };
    if (pair) d.fonts = { display: pair.display, body: pair.body };
    d.type.headingItalic = Boolean((th as { italicDisplay?: boolean }).italicDisplay);
    d.layout = { ...d.layout, rhythm: spacing, radius };
    return d;
  };
  const remove = async (d: SiteDesign) => {
    if (
      !(await confirm({
        title: t('Design «{name}» löschen?', { name: d.name }),
        message: d.id === active ? t('Es ist gerade live – die Website zeigt danach wieder den gewählten Stil.') : t('Das lässt sich nicht rückgängig machen.'),
        confirm: t('Löschen'),
        danger: true,
      }))
    )
      return;
    setDesigns(designs.filter((x) => x.id !== d.id));
    if (d.id === active) set('activeDesign', null);
    if (openId === d.id) setOpenId(null);
  };
  const activate = async (id: string | null) => {
    const d = designs.find((x) => x.id === id);
    if (
      !(await confirm({
        title: d ? t('«{name}» live schalten?', { name: d.name }) : t('Zurück zum gewählten Stil?'),
        message: d
          ? t('Alle Seiten zeigen sofort dieses Design. Das bisherige bleibt erhalten – du kannst jederzeit zurückwechseln.')
          : t('Die Website zeigt wieder den Stil aus «Design». Deine eigenen Designs bleiben gespeichert.'),
        confirm: d ? t('Live schalten') : t('Zurückwechseln'),
      }))
    )
      return;
    set('activeDesign', id);
    setGoLive(id);
  };

  const c = open?.colors;
  const checks = c
    ? CHECKS.map((x) => {
        const fg = parseHex(c[x.fg] as string);
        const bg = parseHex(c[x.bg] as string);
        const ratio = fg && bg ? contrastRatio(fg, bg) : 21;
        return { ...x, ratio, fix: ratio < x.need && fg && bg ? fixColor(fg, bg, x.need) : null };
      })
    : [];

  return (
    <>
      <div className="ds-library card">
        <header className="row" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
          <div className="grow">
            <h2 className="ds-title">{t('Eigene Designs')}</h2>
            <p className="small muted">
              {t('Bau ein Design ganz neu auf – Farben, Schriften, Grössen, Knöpfe, Breiten. Die Website zeigt so lange das aktuelle, bis du deins live schaltest.')}
            </p>
          </div>
          <Menu
            trigger={
              <button className="btn primary" disabled={designs.length >= MAX_DESIGNS}>
                <Icon name="plus" size="s" /> {t('Neues Design')}
              </button>
            }
            items={[
              { heading: t('Wie beginnen?') },
              { label: t('Leer – ganz von vorn'), icon: 'shape', onSelect: () => add(blankDesign(shortId(8), nameFor(t('Neues Design')))) },
              {
                label: t('Vom aktuellen Stil ausgehen'),
                icon: 'copy',
                onSelect: () => add(fromTheme(draft.theme.id, draft.theme.palette, draft.theme.fontPair, draft.theme.spacing, draft.theme.radius)),
              },
              'sep',
              { heading: t('Von einem Stil ausgehen') },
              ...bundle.themes.map((th) => ({ label: tl(th.name), icon: 'style', onSelect: () => add(fromTheme(th.id, 'default', th.pair)) })),
            ]}
          />
        </header>
        <div className="ds-cards">
          <div className={`ds-card${active ? '' : ' live'}`}>
            <span className="ds-swatches" aria-hidden="true">
              <i style={{ background: 'var(--sunken)' }} />
            </span>
            <span className="grow">
              <strong>{t('Gewählter Stil')}</strong>
              <span className="xsmall muted">{tl(bundle.themes.find((x) => x.id === draft.theme.id)?.name ?? draft.theme.id)}</span>
            </span>
            {active ? (
              <button className="btn s ghost" onClick={() => void activate(null)}>
                {t('Wieder verwenden')}
              </button>
            ) : (
              <span className="badge ok">{t('Live')}</span>
            )}
          </div>
          {designs.map((d) => (
            <div key={d.id} className={`ds-card${d.id === active ? ' live' : ''}${d.id === openId ? ' open' : ''}`}>
              <button type="button" className="ds-swatches" onClick={() => setOpenId(d.id)} aria-label={t('«{name}» bearbeiten', { name: d.name })}>
                {[d.colors.bg, d.colors.ink, d.colors.accent, d.colors.surface].map((x, i) => (
                  <i key={i} style={{ background: x }} />
                ))}
              </button>
              <span className="grow">
                <strong>{d.name}</strong>
                <span className="xsmall muted">{d.id === active ? t('Live auf der Website') : t('Entwurf')}</span>
              </span>
              {d.id === active ? <span className="badge ok">{t('Live')}</span> : null}
              <button className="btn s" onClick={() => setOpenId(d.id === openId ? null : d.id)} aria-pressed={d.id === openId}>
                <Icon name="pen" size="s" /> {t('Bearbeiten')}
              </button>
              <Menu
                trigger={
                  <button className="btn s ghost icon-only" aria-label={t('Mehr zu «{name}»', { name: d.name })}>
                    <Icon name="more" size="s" />
                  </button>
                }
                items={[
                  { label: t('Live schalten'), icon: 'publish', onSelect: () => void activate(d.id), hidden: d.id === active },
                  { label: t('Duplizieren'), icon: 'copy', onSelect: () => add({ ...structuredClone(d), id: shortId(8), name: nameFor(d.name) }) },
                  'sep',
                  { label: t('Löschen'), icon: 'trash', danger: true, onSelect: () => void remove(d) },
                ]}
              />
            </div>
          ))}
        </div>
      </div>

      {open && c && (
        <div className="preview-split ds-editor">
          <div className="card stack">
            <div className="row" style={{ gap: '0.5rem' }}>
              <Field label={t('Name')}>
                <input className="input" value={open.name} maxLength={60} onChange={(e) => change({ name: e.target.value })} />
              </Field>
            </div>

            <Group title={t('Grundlage')} sub={t('Woher die Feinheiten kommen – Ornamente, Linien, Kopfzeile. «Neutral» bringt keine eigene Handschrift mit.')}>
              <Select
                label={t('Grundlage')}
                value={open.base}
                onChange={(v) => change({ base: v as DesignBase })}
                options={bundle.themes.map((th) => ({ value: th.id, label: tl(th.name) }))}
              />
            </Group>

            <Group title={t('Farben')}>
              <Toggle
                checked={c.dark}
                onChange={(v) => change({ colors: { ...c, dark: v } })}
                label={t('Dunkles Design')}
                help={t('Sagt dem Browser und den Diagrammen, dass der Grund dunkel ist.')}
              />
              <div className="ds-colors">
                {COLOR_FIELDS.map((f) => (
                  <HexColor key={f.key} label={t(f.label)} value={c[f.key]} onChange={(v) => change({ colors: { ...c, [f.key]: v } })} />
                ))}
              </div>
              <details className="ds-more">
                <summary className="small">{t('Invertierte Bereiche')}</summary>
                <div className="ds-colors">
                  {INVERSE_FIELDS.map((f) => (
                    <HexColor key={f.key} label={t(f.label)} value={c[f.key]} onChange={(v) => change({ colors: { ...c, [f.key]: v } })} />
                  ))}
                </div>
              </details>
              <ul className="ds-checks">
                {checks.map((x) => (
                  <li key={`${x.fg}-${x.bg}`} className={x.ratio >= x.need ? 'ok' : 'bad'}>
                    <Icon name={x.ratio >= x.need ? 'check' : 'alert'} size="s" />
                    <span className="grow">{t(x.label)}</span>
                    <span className="mono xsmall">{(Math.round(x.ratio * 10) / 10).toFixed(1)} : 1</span>
                    {x.fix && (
                      <button className="btn s ghost" onClick={() => change({ colors: { ...c, [x.fg]: x.fix! } })}>
                        {t('Lesbar machen')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </Group>

            <Group title={t('Schriften')}>
              <div className="ds-two">
                <Select
                  label={t('Titel')}
                  value={open.fonts.display}
                  onChange={(v) => change({ fonts: { ...open.fonts, display: v } })}
                  options={bundle.fonts.map((f) => ({ value: f.id, label: f.family }))}
                />
                <Select
                  label={t('Fliesstext')}
                  value={open.fonts.body}
                  onChange={(v) => change({ fonts: { ...open.fonts, body: v } })}
                  options={bundle.fonts.map((f) => ({ value: f.id, label: f.family }))}
                />
              </div>
            </Group>

            <Group title={t('Schriftgrössen')} sub={t('Alle Grössen der Website folgen einer Skala: die Grundgrösse und der Schritt von einer Stufe zur nächsten.')}>
              <Field label={t('Grundgrösse: {n} px', { n: open.type.base })}>
                <input type="range" min={14} max={22} step={0.5} value={open.type.base} onChange={(e) => change({ type: { ...open.type, base: Number(e.target.value) } })} />
              </Field>
              <Select
                label={t('Stufen')}
                value={String(RATIOS.reduce((best, r) => (Math.abs(Number(r.value) - open.type.ratio) < Math.abs(Number(best.value) - open.type.ratio) ? r : best)).value)}
                onChange={(v) => change({ type: { ...open.type, ratio: Number(v) } })}
                options={RATIOS.map((r) => ({ value: r.value, label: t(r.label) }))}
              />
              <Field label={t('Zeilenabstand im Text: {n}', { n: open.type.bodyLeading.toFixed(2) })}>
                <input
                  type="range"
                  min={1.3}
                  max={1.9}
                  step={0.05}
                  value={open.type.bodyLeading}
                  onChange={(e) => change({ type: { ...open.type, bodyLeading: Number(e.target.value) } })}
                />
              </Field>
            </Group>

            <Group title={t('Titel')}>
              <div className="ds-two">
                <Select
                  label={t('Stärke')}
                  value={String(open.type.headingWeight)}
                  onChange={(v) => change({ type: { ...open.type, headingWeight: Number(v) } })}
                  options={[300, 400, 500, 600, 700, 800, 900].map((w) => ({ value: String(w), label: String(w) }))}
                />
                <Field label={t('Zeilenabstand: {n}', { n: open.type.headingLeading.toFixed(2) })}>
                  <input
                    type="range"
                    min={0.9}
                    max={1.4}
                    step={0.05}
                    value={open.type.headingLeading}
                    onChange={(e) => change({ type: { ...open.type, headingLeading: Number(e.target.value) } })}
                  />
                </Field>
              </div>
              <Field label={t('Buchstabenabstand: {n} em', { n: open.type.headingTracking.toFixed(3) })}>
                <input
                  type="range"
                  min={-0.06}
                  max={0.15}
                  step={0.005}
                  value={open.type.headingTracking}
                  onChange={(e) => change({ type: { ...open.type, headingTracking: Number(e.target.value) } })}
                />
              </Field>
              <Toggle
                checked={open.type.headingCase === 'uppercase'}
                onChange={(v) => change({ type: { ...open.type, headingCase: v ? 'uppercase' : 'none' } })}
                label={t('In Grossbuchstaben')}
              />
              <Toggle checked={open.type.headingItalic} onChange={(v) => change({ type: { ...open.type, headingItalic: v } })} label={t('Kursiv')} />
            </Group>

            <Group title={t('Knöpfe')}>
              <Segmented
                label={t('Form')}
                value={open.buttons.shape}
                onChange={(v) => change({ buttons: { ...open.buttons, shape: v } })}
                options={[
                  { value: 'square', label: t('Eckig') },
                  { value: 'rounded', label: t('Abgerundet') },
                  { value: 'pill', label: t('Pille') },
                ]}
              />
              <Segmented
                label={t('Art')}
                value={open.buttons.style}
                onChange={(v) => change({ buttons: { ...open.buttons, style: v } })}
                options={[
                  { value: 'solid', label: t('Gefüllt') },
                  { value: 'outline', label: t('Umrandet') },
                ]}
              />
              <Segmented
                label={t('Grösse')}
                value={open.buttons.size}
                onChange={(v) => change({ buttons: { ...open.buttons, size: v } })}
                options={[
                  { value: 's', label: 'S' },
                  { value: 'm', label: 'M' },
                  { value: 'l', label: 'L' },
                ]}
              />
              <Toggle
                checked={open.buttons.case === 'uppercase'}
                onChange={(v) => change({ buttons: { ...open.buttons, case: v ? 'uppercase' : 'none' } })}
                label={t('In Grossbuchstaben')}
              />
            </Group>

            <Group title={t('Links im Text')}>
              <Segmented
                label={t('Unterstrichen')}
                value={open.links.underline}
                onChange={(v) => change({ links: { underline: v } })}
                options={[
                  { value: 'always', label: t('Immer') },
                  { value: 'hover', label: t('Beim Darüberfahren') },
                ]}
              />
            </Group>

            <Group title={t('Breite, Luft und Ecken')}>
              <Field label={t('Grösste Inhaltsbreite: {n} px', { n: open.layout.max * 16 })}>
                <input type="range" min={48} max={110} step={1} value={open.layout.max} onChange={(e) => change({ layout: { ...open.layout, max: Number(e.target.value) } })} />
              </Field>
              <Field label={t('Luft zwischen Abschnitten: {n} %', { n: Math.round(open.layout.rhythm * 100) })}>
                <input
                  type="range"
                  min={0.6}
                  max={1.6}
                  step={0.05}
                  value={open.layout.rhythm}
                  onChange={(e) => change({ layout: { ...open.layout, rhythm: Number(e.target.value) } })}
                />
              </Field>
              <Field label={t('Rundung von Bildern, Karten und Feldern: {n} px', { n: open.layout.radius })}>
                <input type="range" min={0} max={40} step={1} value={open.layout.radius} onChange={(e) => change({ layout: { ...open.layout, radius: Number(e.target.value) } })} />
              </Field>
            </Group>

            <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
              {open.id !== active ? (
                <button className="btn primary" onClick={() => void activate(open.id)}>
                  <Icon name="publish" size="s" /> {t('Live schalten')}
                </button>
              ) : (
                <span className="badge ok">{t('Dieses Design ist live')}</span>
              )}
            </div>
          </div>
          <div className="live-preview">
            <header className="row" style={{ gap: '0.5rem' }}>
              <Icon name="eye" size="s" />
              <span className="grow">{t('Vorschau – noch nicht live')}</span>
              <select className="input ds-page" value={page} onChange={(e) => setPage(e.target.value)} aria-label={t('Seite in der Vorschau')}>
                {(pages?.entries ?? [])
                  .slice()
                  .sort((a, b) => (a.slug === '' ? -1 : b.slug === '' ? 1 : a.slug.localeCompare(b.slug)))
                  .map((p) => (
                    <option key={p.id} value={p.slug}>
                      {p.slug === '' ? t('Startseite') : p.title || p.data?.title || `/${p.slug}`}
                    </option>
                  ))}
              </select>
              <Segmented
                label={t('Vorschau-Grösse')}
                value={device}
                onChange={setDevice}
                options={[
                  { value: 'desktop', label: '', icon: 'desktop', title: t('Computer') },
                  { value: 'mobile', label: '', icon: 'phone', title: t('Handy') },
                ]}
              />
            </header>
            <div className={`ds-frame ds-${device}`}>{shown && <LoadingFrame title={t('Design-Vorschau')} src={shown} />}</div>
          </div>
        </div>
      )}
      <SaveBar dirty={dirty} onSave={save} onReset={reset} />
    </>
  );
}

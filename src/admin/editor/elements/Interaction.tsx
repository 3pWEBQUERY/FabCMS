import { useContext } from 'react';
import { t, tl } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { Field, Select, Toggle } from '../../ui/kit';
import { Icon } from '../../ui/icons';
import { EL_DEFS, MAX_IA, walkEls, type El, type ElAct, type Ia } from '../../../shared/elements';
import { SavedStyles } from '../design/SavedStyles';
import { stripHtml } from '../../../shared/text';

/** How an element is called in the lists: its own name, else its kind and the first words it shows. */
function label(el: El): string {
  const text =
    typeof el.props.text === 'string' ? el.props.text : typeof el.props.label === 'string' ? el.props.label : typeof el.props.html === 'string' ? stripHtml(el.props.html) : '';
  const kind = el.name || tl(EL_DEFS[el.kind].label);
  return text ? `${kind} – ${text.slice(0, 40)}` : kind;
}

/**
 * «Beim Klick» for buttons and «Anfangs versteckt» for every element: a
 * button shows, hides or toggles another element of the same layout.
 */
export function InteractionControls({ el, els, onChange, onSelect }: { el: El; els: El[]; onChange: (el: El) => void; onSelect: (id: string) => void }) {
  const all: El[] = [];
  walkEls(els, (x) => void all.push(x));
  const targets = all.filter((x) => x.id !== el.id);
  const target = el.act ? all.find((x) => x.id === el.act!.target) : undefined;
  // Something hidden that nothing can bring back would stay invisible for good.
  const aims = (x: El, ia: Ia) => (ia.target === 'self' ? x.id : ia.target) === el.id;
  const opener = all.some((x) => (x.act && x.act.target === el.id && x.act.do !== 'hide') || x.on?.some((ia) => aims(x, ia) && (ia.do === 'show' || ia.do === 'toggle')));
  const openers = all.filter((x) => x.act?.target === el.id || (x.id !== el.id && x.on?.some((ia) => aims(x, ia))));

  return (
    <div className="stack tight ia-box">
      <span className="section-title">{t('Interaktion')}</span>
      {el.kind === 'button' && (
        <>
          <Field label={t('Beim Klick')} htmlFor="ia-do">
            <Select
              id="ia-do"
              value={el.act?.do ?? ''}
              onChange={(v) => onChange({ ...el, act: v ? { do: v as ElAct, target: el.act?.target ?? '' } : undefined })}
              options={[
                { value: '', label: t('Link öffnen') },
                { value: 'toggle', label: t('Element ein- und ausblenden') },
                { value: 'show', label: t('Element zeigen') },
                { value: 'hide', label: t('Element verbergen') },
              ]}
            />
          </Field>
          {el.act && (
            <Field
              label={t('Welches Element?')}
              htmlFor="ia-target"
              error={!target ? t('Wähl das Element, das sich zeigen oder verbergen soll.') : undefined}
              help={target && !target.hidden && el.act.do !== 'hide' ? t('Tipp: Stell das Element auf «Anfangs versteckt», damit es erst nach dem Klick erscheint.') : undefined}
            >
              <div className="row tight">
                <Select
                  id="ia-target"
                  value={el.act.target}
                  onChange={(v) => onChange({ ...el, act: { ...el.act!, target: v } })}
                  options={targets.map((x) => ({ value: x.id, label: label(x) }))}
                  placeholder={t('Element wählen …')}
                />
                {target && (
                  <button type="button" className="btn s ghost icon-only" onClick={() => onSelect(target.id)} aria-label={t('Zum Element')}>
                    <Icon name="arrowRight" size="s" />
                  </button>
                )}
              </div>
            </Field>
          )}
        </>
      )}
      <IaList el={el} targets={targets} onChange={onChange} />
      <Toggle
        checked={Boolean(el.hidden)}
        onChange={(v) => onChange({ ...el, hidden: v || undefined })}
        label={t('Anfangs versteckt')}
        help={t('Erscheint erst, wenn ein Knopf oder eine Interaktion es zeigt. Im Editor bleibt es sichtbar und ist gestrichelt markiert.')}
      />
      {el.hidden && !opener && (
        <p className="xsmall ia-warn">
          {t('Noch zeigt nichts dieses Element – auf der Website bliebe es unsichtbar. Wähl bei einem Knopf «Beim Klick» oder gib einem Element eine Interaktion.')}
        </p>
      )}
      {openers.length > 0 && (
        <p className="xsmall muted">
          {t('Gesteuert von:')}{' '}
          {openers.map((x, i) => (
            <span key={x.id}>
              {i > 0 && ', '}
              <button type="button" className="linkish" onClick={() => onSelect(x.id)}>
                {label(x)}
              </button>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

const WHEN: { value: Ia['when']; label: () => string }[] = [
  { value: 'click', label: () => t('Beim Klick') },
  { value: 'hover', label: () => t('Beim Darüberfahren') },
  { value: 'view', label: () => t('Beim Sichtbarwerden') },
];
const DO: { value: Ia['do']; label: () => string }[] = [
  { value: 'toggle', label: () => t('Ein- und ausblenden') },
  { value: 'show', label: () => t('Zeigen') },
  { value: 'hide', label: () => t('Verbergen') },
  { value: 'class', label: () => t('Stil umschalten') },
  { value: 'scroll', label: () => t('Hinscrollen') },
];

/**
 * Interactions as in Bricks or Webflow: a trigger on this element, an action
 * on it or another element of the layout. On hover everything goes back
 * when the pointer leaves.
 */
function IaList({ el, targets, onChange }: { el: El; targets: El[]; onChange: (el: El) => void }) {
  const { pro } = useSession();
  const styles = useContext(SavedStyles)?.styles ?? [];
  const list = el.on ?? [];
  const set = (next: Ia[]) => onChange({ ...el, on: next.length ? next : undefined });
  const change = (i: number, patch: Partial<Ia>) => set(list.map((x, n) => (n === i ? { ...x, ...patch } : x)));
  return (
    <div className="stack tight">
      {list.map((ia, i) => (
        <div key={i} className="ia-row">
          <div className="ia-grid">
            <Select
              label={t('Auslöser')}
              value={ia.when}
              onChange={(v) => change(i, { when: v as Ia['when'] })}
              options={WHEN.map((o) => ({ value: o.value, label: o.label() }))}
            />
            <Select
              label={t('Aktion')}
              value={ia.do}
              onChange={(v) => change(i, { do: v as Ia['do'], ...(v === 'scroll' && ia.target === 'self' ? { target: targets[0]?.id ?? 'self' } : {}) })}
              options={DO.filter((o) => o.value !== 'scroll' || ia.when === 'click').map((o) => ({ value: o.value, label: o.label() }))}
            />
            <Select
              label={t('Woran?')}
              value={ia.target}
              onChange={(v) => change(i, { target: v })}
              options={[...(ia.do === 'scroll' ? [] : [{ value: 'self', label: t('An diesem Element') }]), ...targets.map((x) => ({ value: x.id, label: label(x) }))]}
            />
            {ia.do === 'class' && (
              <Select
                label={t('Welcher Stil?')}
                value={ia.style ?? (ia.cls ? '__own' : '')}
                onChange={(v) => change(i, v === '__own' ? { style: undefined, cls: ia.cls ?? 'aktiv' } : { style: v || undefined, cls: undefined })}
                options={[...styles.map((x) => ({ value: x.id, label: x.name })), ...(pro ? [{ value: '__own', label: t('Eigene CSS-Klasse …') }] : [])]}
                placeholder={styles.length ? t('Gespeicherten Stil wählen …') : t('Noch keine gespeicherten Stile')}
              />
            )}
            {ia.do === 'class' && !ia.style && pro && ia.cls !== undefined && (
              <input className="input mono" value={ia.cls} aria-label={t('CSS-Klasse')} onChange={(e) => change(i, { cls: e.target.value.replace(/[^\w-]/g, '') })} />
            )}
          </div>
          <button type="button" className="btn s ghost icon-only" onClick={() => set(list.filter((_, n) => n !== i))} aria-label={t('Interaktion entfernen')}>
            <Icon name="trash" size="s" />
          </button>
        </div>
      ))}
      {list.length < MAX_IA && (
        <button type="button" className="btn s" style={{ justifySelf: 'start' }} onClick={() => set([...list, { when: 'click', do: 'toggle', target: targets[0]?.id ?? 'self' }])}>
          <Icon name="plus" size="s" /> {t('Interaktion hinzufügen')}
        </button>
      )}
      {list.some((x) => x.do === 'class' && !x.style && !x.cls) && <p className="xsmall ia-warn">{t('Wähl den Stil, der umgeschaltet wird.')}</p>}
    </div>
  );
}

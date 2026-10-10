import { t, tl } from '../../lib/i18n';
import { Field, Select, Toggle } from '../../ui/kit';
import { Icon } from '../../ui/icons';
import { EL_DEFS, walkEls, type El, type ElAct } from '../../../shared/elements';
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
  // Something hidden that no button can bring back would stay invisible for good.
  const opener = all.some((x) => x.act && x.act.target === el.id && x.act.do !== 'hide');
  const openers = all.filter((x) => x.act?.target === el.id);

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
      <Toggle
        checked={Boolean(el.hidden)}
        onChange={(v) => onChange({ ...el, hidden: v || undefined })}
        label={t('Anfangs versteckt')}
        help={t('Erscheint erst, wenn ein Knopf es zeigt. Im Editor bleibt es sichtbar und ist gestrichelt markiert.')}
      />
      {el.hidden && !opener && (
        <p className="xsmall ia-warn">{t('Noch zeigt kein Knopf dieses Element – auf der Website bliebe es unsichtbar. Wähl bei einem Knopf «Beim Klick».')}</p>
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

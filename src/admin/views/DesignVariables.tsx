import { t } from '../lib/i18n';
import { Icon } from '../ui/icons';
import { confirm } from '../ui/kit';
import { ColorInput, LengthInput } from '../editor/design/controls';
import { MAX_VARIABLES, variableId, type DesignVariable } from '../../shared/variables';

/**
 * «Variablen» as in Webflow: colours and sizes of one's own, chosen in the
 * design panel like the theme's and changed here for the whole website. The
 * id stays when the name changes – everything that uses it keeps working.
 */
export function DesignVariables({ value, onChange }: { value: DesignVariable[]; onChange: (next: DesignVariable[]) => void }) {
  const add = (kind: DesignVariable['kind']) => {
    const base = kind === 'color' ? t('Farbe') : t('Grösse');
    let n = value.filter((v) => v.kind === kind).length + 1;
    while (value.some((v) => v.name.toLowerCase() === `${base} ${n}`.toLowerCase() || v.id === variableId(`${base} ${n}`))) n++;
    const name = `${base} ${n}`;
    onChange([...value, { id: variableId(name), name, kind, value: kind === 'color' ? '#2b59c3' : '24px' }]);
  };
  const change = (id: string, patch: Partial<DesignVariable>) => onChange(value.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  const remove = async (v: DesignVariable) => {
    if (
      await confirm({
        title: t('Variable «{name}» löschen?', { name: v.name }),
        message: t('Wo sie verwendet wird, gilt danach wieder der Wert des Themes oder gar keiner.'),
        confirm: t('Löschen'),
        danger: true,
      })
    )
      onChange(value.filter((x) => x.id !== v.id));
  };
  const taken = (v: DesignVariable) => value.some((x) => x.id !== v.id && x.name.trim().toLowerCase() === v.name.trim().toLowerCase());
  return (
    <div className="stack">
      {value.length === 0 && (
        <p className="small muted">{t('Noch keine Variablen. Leg Farben und Grössen an, die du immer wieder brauchst – z. B. «Marke Grün» oder «Kartenabstand».')}</p>
      )}
      {value.length > 0 && (
        <ul className="var-list">
          {value.map((v) => (
            <li key={v.id} className="var-row">
              <Icon name={v.kind === 'color' ? 'paint' : 'spacing'} size="s" className="faint" />
              <input
                className="input"
                value={v.name}
                maxLength={40}
                aria-label={t('Name der Variable')}
                aria-invalid={taken(v) || !v.name.trim() || undefined}
                onChange={(e) => change(v.id, { name: e.target.value })}
              />
              {v.kind === 'color' ? (
                <ColorInput value={v.value} onChange={(c) => change(v.id, { value: c ?? '#000000' })} ariaLabel={v.name} allowNone={false} />
              ) : (
                <LengthInput value={v.value} onChange={(l) => change(v.id, { value: l ?? '0' })} ariaLabel={v.name} units={['px', 'rem', 'em', '%', 'vw']} />
              )}
              <code className="xsmall faint" title={t('So heisst sie im Code')}>
                --v-{v.id}
              </code>
              <button type="button" className="btn s ghost icon-only" onClick={() => void remove(v)} aria-label={t('Variable «{name}» löschen', { name: v.name })}>
                <Icon name="trash" size="s" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {value.length < MAX_VARIABLES && (
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn s" onClick={() => add('color')}>
            <Icon name="plus" size="s" /> {t('Farbe hinzufügen')}
          </button>
          <button type="button" className="btn s" onClick={() => add('size')}>
            <Icon name="plus" size="s" /> {t('Grösse hinzufügen')}
          </button>
        </div>
      )}
      <p className="xsmall faint">
        {t('Im Editor findest du sie in jeder Farbe und jeder Grösse unter «Variablen». Änderst du hier einen Wert, ändert er sich überall, wo die Variable verwendet wird.')}
      </p>
    </div>
  );
}

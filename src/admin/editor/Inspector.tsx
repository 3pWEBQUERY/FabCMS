import { useEffect, useState } from 'react';
import { BLOCK_MAP } from '../../shared/blocks';
import type { Block, BlockLock, BlockStyle, Breakpoint } from '../../shared/types';
import { useSession } from '../lib/session';
import { t, tl } from '../lib/i18n';
import { FieldList } from '../ui/FieldInput';
import { Field, Segmented, Select } from '../ui/kit';
import { Icon } from '../ui/icons';

const tones = (): { value: NonNullable<BlockStyle['tone']>; label: string }[] => [
  { value: 'default', label: t('Normal') },
  { value: 'muted', label: t('Leicht abgesetzt') },
  { value: 'accent', label: t('Akzentfarbe') },
  { value: 'inverse', label: t('Dunkel') },
];
const spacing = () =>
  [
    { value: 'none', label: t('Keiner') },
    { value: 's', label: t('Klein') },
    { value: 'm', label: t('Mittel') },
    { value: 'l', label: t('Gross') },
  ] as const;

export function Inspector({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  const { pro } = useSession();
  const def = BLOCK_MAP[block.type];
  const [tab, setTab] = useState<'content' | 'style' | 'code'>('content');
  const lock = pro ? 'none' : (block.lock ?? 'none');
  useEffect(() => {
    if (!pro && tab === 'code') setTab('content');
  }, [pro, tab]);
  if (!def) return null;

  const style = block.style ?? {};
  const setStyle = (patch: Partial<BlockStyle>) => onChange({ ...block, style: { ...style, ...patch } });
  const fields = lock === 'layout' ? def.fields.filter((f) => ['text', 'textarea', 'richtext'].includes(f.type)) : def.fields;

  if (lock === 'all')
    return (
      <div className="hint" style={{ background: 'var(--sunken)' }}>
        <Icon name="lock" />
        <span>{t('Dieser Block ist gesperrt, damit das Layout stimmt. Frag die Person, die die Website eingerichtet hat.')}</span>
      </div>
    );

  return (
    <div className="stack">
      <p className="small muted">{tl(def.description)}</p>
      <Segmented
        label={t('Bereich')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'content', label: t('Inhalt') },
          ...(lock === 'none' ? [{ value: 'style' as const, label: t('Darstellung') }] : []),
          ...(pro ? [{ value: 'code' as const, label: t('Code') }] : []),
        ]}
      />
      {lock === 'layout' && (
        <p className="xsmall muted row">
          <Icon name="lock" size="s" /> {t('Layout gesperrt – du kannst die Texte ändern.')}
        </p>
      )}
      {tab === 'content' && (
        <div className="stack">
          <FieldList fields={fields} values={block.props} onChange={(k, v) => onChange({ ...block, props: { ...block.props, [k]: v } })} />
        </div>
      )}
      {tab === 'style' && (
        <div className="stack">
          <Field label={t('Hintergrund')}>
            <div className="chips">
              {tones().map((o) => (
                <button key={o.value} type="button" className="chip" aria-pressed={(style.tone ?? 'default') === o.value} onClick={() => setStyle({ tone: o.value })}>
                  {o.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t('Abstand oben und unten')}>
            <div className="chips">
              {spacing().map((s) => (
                <button key={s.value} type="button" className="chip" aria-pressed={(style.spacing ?? 'm') === s.value} onClick={() => setStyle({ spacing: s.value })}>
                  {s.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t('Abstand auf dem Handy')} help={t('Überschreibt den Abstand nur auf schmalen Bildschirmen.')}>
            <div className="chips">
              <button type="button" className="chip" aria-pressed={!style.spacingMobile} onClick={() => setStyle({ spacingMobile: undefined })}>
                {t('Wie oben')}
              </button>
              {spacing().map((s) => (
                <button key={s.value} type="button" className="chip" aria-pressed={style.spacingMobile === s.value} onClick={() => setStyle({ spacingMobile: s.value })}>
                  {s.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t('Ausblenden auf')}>
            <div className="chips">
              {(
                [
                  ['mobile', t('Handy')],
                  ['tablet', t('Tablet')],
                  ['desktop', t('Computer')],
                ] as [Breakpoint, string][]
              ).map(([bp, label]) => {
                const on = (style.hideOn ?? []).includes(bp);
                return (
                  <button
                    key={bp}
                    type="button"
                    className="chip"
                    aria-pressed={on}
                    onClick={() => setStyle({ hideOn: on ? (style.hideOn ?? []).filter((x) => x !== bp) : [...(style.hideOn ?? []), bp] })}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label={t('Sprungmarke')} help={t('Damit Links wie /#preise direkt hierher springen.')}>
            <div className="input-affix">
              <span>#</span>
              <input className="input" value={style.anchor ?? ''} onChange={(e) => setStyle({ anchor: e.target.value })} placeholder={t('preise')} />
            </div>
          </Field>
        </div>
      )}
      {tab === 'code' && <CodeTab block={block} onChange={onChange} />}
    </div>
  );
}

function CodeTab({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  const [json, setJson] = useState(() => JSON.stringify(block.props, null, 2));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    try {
      if (JSON.stringify(JSON.parse(json)) !== JSON.stringify(block.props)) setJson(JSON.stringify(block.props, null, 2));
    } catch {
      /* keep the user's broken JSON while they type */
    }
  }, [block.props]);
  const style = block.style ?? {};
  return (
    <div className="stack">
      <Field label="Props" keyName="block.props" error={err}>
        <textarea
          className="textarea code"
          spellCheck={false}
          value={json}
          onChange={(e) => {
            setJson(e.target.value);
            try {
              onChange({ ...block, props: JSON.parse(e.target.value) });
              setErr(null);
            } catch (x) {
              setErr((x as Error).message);
            }
          }}
        />
      </Field>
      <Field label={t('CSS-Klassen')} keyName="style.className">
        <input className="input mono" value={style.className ?? ''} onChange={(e) => onChange({ ...block, style: { ...style, className: e.target.value } })} />
      </Field>
      <Field
        label={t('CSS für diesen Block')}
        keyName="style.css"
        help={t('Regeln gelten nur innerhalb des Blocks. «&» steht für den Block selbst, z. B. {example}.', { example: '«& h2 { letter-spacing: 0 }»' })}
      >
        <textarea
          className="textarea code"
          style={{ minHeight: '8rem' }}
          spellCheck={false}
          value={style.css ?? ''}
          onChange={(e) => onChange({ ...block, style: { ...style, css: e.target.value } })}
        />
      </Field>
      <Field label={t('Schutzzone im Studio')} keyName="lock" help={t('Legt fest, was Personen im Studio-Modus an diesem Block ändern dürfen.')}>
        <Select
          value={block.lock ?? 'none'}
          onChange={(v) => onChange({ ...block, lock: v as BlockLock })}
          options={[
            { value: 'none', label: t('Alles frei') },
            { value: 'layout', label: t('Layout fix, Text frei') },
            { value: 'all', label: t('Komplett gesperrt') },
          ]}
        />
      </Field>
      <p className="xsmall faint mono">
        id: {block.id} · type: {block.type}
      </p>
    </div>
  );
}

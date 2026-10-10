import { useState } from 'react';
import { isEmptyDesign, type DesignBp, type DesignState } from '../../../shared/design';
import { EL_DEFS, type El } from '../../../shared/elements';
import { hasMotion } from '../../../shared/motion';
import { t, tl } from '../../lib/i18n';
import { FieldList } from '../../ui/FieldInput';
import { Field, Segmented } from '../../ui/kit';
import { DesignPanel } from '../design/DesignPanel';
import { MotionPanel } from '../design/MotionPanel';

/** Settings of one element of the free layout: what it says, how it looks, how it moves. */
export function ElementInspector({
  el,
  onChange,
  device,
  onDevice,
  designState,
  onDesignState,
  onPlay,
  pro,
}: {
  el: El;
  onChange: (el: El) => void;
  device: DesignBp;
  onDevice: (d: DesignBp) => void;
  designState: DesignState;
  onDesignState: (s: DesignState) => void;
  onPlay: () => void;
  pro: boolean;
}) {
  const def = EL_DEFS[el.kind];
  // Containers are mostly about arrangement: they open on Design.
  const [tab, setTab] = useState<'content' | 'style' | 'motion'>(el.kind === 'box' || !def.fields.length ? 'style' : 'content');
  return (
    <div className="stack">
      <p className="small muted">{tl(def.description)}</p>
      <Segmented
        label={t('Bereich')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'content' as const, label: t('Inhalt') },
          { value: 'style' as const, label: t('Design') },
          { value: 'motion' as const, label: t('Animation') },
        ]}
      />
      {tab === 'content' && (
        <div className="stack">
          <FieldList fields={def.fields} values={el.props} onChange={(k, v) => onChange({ ...el, props: { ...el.props, [k]: v } })} />
          <Field label={t('Name in den Ebenen')} help={t('Hilft, im Aufbau den Überblick zu behalten.')}>
            <input className="input" value={el.name ?? ''} placeholder={tl(def.label)} maxLength={60} onChange={(e) => onChange({ ...el, name: e.target.value || undefined })} />
          </Field>
        </div>
      )}
      {tab === 'style' && (
        <DesignPanel
          design={el.design}
          onChange={(d) => onChange({ ...el, design: isEmptyDesign(d) ? undefined : d })}
          target="element"
          kind={el.kind}
          bp={device}
          onBp={onDevice}
          state={designState}
          onState={onDesignState}
          pro={pro}
        />
      )}
      {tab === 'motion' && (
        <MotionPanel motion={el.motion} onChange={(m) => onChange({ ...el, motion: hasMotion(m) ? m : undefined })} onPlay={onPlay} target="element" items={el.kind === 'box'} />
      )}
    </div>
  );
}

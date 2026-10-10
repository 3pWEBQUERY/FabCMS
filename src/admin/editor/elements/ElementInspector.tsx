import { useState } from 'react';
import { useSavedStyle } from '../design/SavedStyles';
import { isEmptyDesign, type Design, type DesignBp, type DesignState } from '../../../shared/design';
import { BINDABLE, EL_DEFS, ITEM_CONTAINERS, type El, type ElKind } from '../../../shared/elements';
import type { CollectionDef } from '../../../shared/types';
import type { FieldType } from '../../../shared/fields';
import { hasMotion } from '../../../shared/motion';
import { t, tl } from '../../lib/i18n';
import { FieldList } from '../../ui/FieldInput';
import { Field, Segmented, Select } from '../../ui/kit';
import { DesignPanel } from '../design/DesignPanel';
import { MotionPanel } from '../design/MotionPanel';
import { ComponentInspector, VariantBar, type VariantControls } from './Components';
import { ItemsEditor } from './ItemsEditor';
import { ShapeControls } from './ShapeControls';

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
  collections,
  source,
  onSelect,
  locked,
  onOpenComponent,
  onDetach,
  variants,
}: {
  el: El;
  onChange: (el: El) => void;
  device: DesignBp;
  onDevice: (d: DesignBp) => void;
  designState: DesignState;
  onDesignState: (s: DesignState) => void;
  onPlay: () => void;
  pro: boolean;
  /** Content types (for CMS lists). */
  collections: CollectionDef[];
  /** Inside a CMS list: the content type its entries come from. */
  source: CollectionDef | null;
  /** Selects another element (an entry of tabs, accordion, slider). */
  onSelect: (id: string) => void;
  locked: boolean;
  /** Components: open the original, or turn this place into its own elements. */
  onOpenComponent: (id: string) => void;
  onDetach: (master: El[]) => void;
  /** In a component's original: its variants, and the design of this element in the active one. */
  variants?: VariantControls & { design: Design | undefined; onDesign: (d: Design | undefined) => void };
}) {
  const def = EL_DEFS[el.kind];
  // Containers are mostly about arrangement: they open on Design.
  const [tab, setTab] = useState<'content' | 'style' | 'motion'>(el.kind !== 'component' && el.kind !== 'shape' && (el.kind === 'box' || !def.fields.length) ? 'style' : 'content');
  const saved = useSavedStyle({ use: el.use, own: el.design, onOwn: (design) => onChange({ ...el, design }), onStyle: (use, design) => onChange({ ...el, use, design }) });
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
      {tab === 'content' && el.kind === 'component' && <ComponentInspector el={el} onChange={onChange} onOpen={onOpenComponent} onDetach={onDetach} locked={locked} />}
      {tab === 'content' && el.kind !== 'component' && (
        <div className="stack">
          {el.kind === 'shape' && <ShapeControls el={el} onChange={onChange} locked={locked} />}
          {source && BINDABLE[el.kind] && (
            <div className="bind-box">
              <span className="section-title">{t('Inhalt aus «{name}»', { name: tl(source.name) })}</span>
              {BINDABLE[el.kind]!.map((prop) => (
                <Field key={prop} label={propLabel(el, prop)}>
                  <Select
                    value={el.bind?.[prop] ?? ''}
                    onChange={(v) => {
                      const bind = { ...(el.bind ?? {}) };
                      if (v) bind[prop] = v;
                      else delete bind[prop];
                      onChange({ ...el, bind: Object.keys(bind).length ? bind : undefined });
                    }}
                    options={[{ value: '', label: t('Fest – selbst eingeben') }, ...bindOptions(source, el.kind, prop)]}
                  />
                </Field>
              ))}
            </div>
          )}
          <FieldList
            fields={
              el.kind === 'list' ? def.fields.map((f) => (f.key === 'collection' ? { ...f, options: collections.map((c) => ({ value: c.id, label: c.name })) } : f)) : def.fields
            }
            values={el.props}
            skip={Object.keys(el.bind ?? {})}
            onChange={(k, v) => onChange({ ...el, props: { ...el.props, [k]: v } })}
          />
          {ITEM_CONTAINERS.includes(el.kind) && <ItemsEditor el={el} onChange={onChange} onSelect={onSelect} locked={locked} />}
          {el.kind === 'list' && (
            <p className="xsmall faint">{t('Gestaltet wird der erste Eintrag – alle anderen sehen gleich aus. Verbinde seine Elemente mit den Feldern des Inhaltstyps.')}</p>
          )}
          <Field label={t('Name in den Ebenen')} help={t('Hilft, im Aufbau den Überblick zu behalten.')}>
            <input className="input" value={el.name ?? ''} placeholder={tl(def.label)} maxLength={60} onChange={(e) => onChange({ ...el, name: e.target.value || undefined })} />
          </Field>
        </div>
      )}
      {tab === 'style' && variants && <VariantBar v={variants} locked={locked} />}
      {tab === 'style' && (
        <DesignPanel
          key={variants?.active ?? 'standard'}
          design={variants?.active ? variants.design : saved.design}
          onChange={(d) => (variants?.active ? variants.onDesign(isEmptyDesign(d) ? undefined : d) : saved.onChange(d))}
          savedStyle={variants?.active ? undefined : saved.bar}
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

const propLabel = (el: El, prop: string): string => {
  if (prop === 'href') return t('Link');
  if (prop === 'image') return t('Bild');
  if (prop === 'html') return t('Text');
  return el.kind === 'button' ? t('Beschriftung') : t('Text');
};

/** Fields of the content type that fit a prop: texts for texts, pictures for pictures, addresses for links. */
function bindOptions(c: CollectionDef, kind: ElKind, prop: string): { value: string; label: string }[] {
  const fit: FieldType[] =
    prop === 'image'
      ? ['image', 'images']
      : prop === 'href'
        ? ['url']
        : prop === 'html'
          ? ['textarea', 'richtext', 'text']
          : ['text', 'textarea', 'select', 'number', 'money', 'date', 'datetime', 'email', 'tags'];
  const own = c.fields.filter((f) => fit.includes(f.type) && f.key !== c.title_field && f.key !== 'title').map((f) => ({ value: `field:${f.key}`, label: tl(f.label) }));
  if (prop === 'href') return [...(c.route ? [{ value: 'url', label: t('Seite des Eintrags') }] : []), ...own];
  if (prop === 'image') return own;
  return [{ value: 'title', label: t('Titel') }, ...(kind !== 'text' || prop === 'html' ? [{ value: 'date', label: t('Datum') }] : []), ...own];
}

import { useContext, useState } from 'react';
import { useSavedStyle } from '../design/SavedStyles';
import { isEmptyDesign, type Design, type DesignBp, type DesignState } from '../../../shared/design';
import { BINDABLE, bindKind, cleanAnchor, SITE_BINDS, EL_DEFS, ITEM_CONTAINERS, walkEls, type El, type ElKind } from '../../../shared/elements';
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
import { InteractionControls } from './Interaction';
import { ConditionControls } from './Conditions';
import { ImageFocus } from './ImageFocus';
import { LoopEntries, LoopRules, loopFields } from './LoopRules';
import { SiteData } from './SiteData';
import { MapPlace } from './MapPlace';
import { HotspotPlacer } from './HotspotPlacer';
import { PageAnchorsContext } from '../../ui/PageLinkInput';

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
  blockEls,
  bindSource,
  archiveFor,
  onSiteSaved,
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
  /** Every element of the layout – targets for a button's click. */
  blockEls: El[];
  /** Whose fields elements can show: the loop's or template's content type, or the entry being edited. */
  bindSource: CollectionDef | null;
  /** In an archive template: the content type it is the overview of. */
  archiveFor?: CollectionDef | null;
  /** The website's data shown by the element was saved: the whole canvas draws it anew. */
  onSiteSaved?: () => void;
}) {
  const def = EL_DEFS[el.kind];
  // Containers are mostly about arrangement: they open on Design.
  const [tab, setTab] = useState<'content' | 'style' | 'motion'>(el.kind !== 'component' && el.kind !== 'shape' && (el.kind === 'box' || !def.fields.length) ? 'style' : 'content');
  // «Dieses Archiv» takes the content type from the overview.
  const archiveLoop = el.kind === 'list' && el.props.archive === true && Boolean(archiveFor);
  const loopType = archiveLoop ? archiveFor! : collections.find((c) => c.id === el.props.collection);
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
          {BINDABLE[el.kind] && (
            <details className="bind-box" open={Boolean(el.bind && Object.keys(el.bind).length) || Boolean(source)}>
              <summary className="section-title">
                {bindSource ? t('Dynamische Daten – Website und «{name}»', { name: tl(bindSource.name) }) : t('Dynamische Daten – Website')}
              </summary>
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
                    options={[
                      { value: '', label: t('Fest – selbst eingeben') },
                      ...(bindSource ? bindOptions(bindSource, el.kind, prop).map((o) => ({ ...o, label: `${tl(bindSource.name)} · ${o.label}` })) : []),
                      ...SITE_BINDS[bindKind(prop)].map(([value, label]) => ({ value, label: `${t('Website')} · ${tl(label)}` })),
                    ]}
                  />
                </Field>
              ))}
            </details>
          )}
          <SiteData el={el} onSaved={onSiteSaved} />
          {el.kind === 'map' && <MapPlace el={el} onChange={onChange} />}
          {el.kind === 'hotspots' && <HotspotPlacer el={el} onChange={onChange} />}
          <FieldList
            fields={
              el.kind === 'list'
                ? loopFields(def.fields, collections, loopType, { archive: archiveLoop, offered: Boolean(archiveFor) || el.props.archive === true })
                : el.kind === 'filter'
                  ? def.fields.map((f) =>
                      f.key === 'target'
                        ? { ...f, options: loopsIn(blockEls).map((x) => ({ value: x.id, label: x.name || `${tl(EL_DEFS.list.label)} · ${loopName(x, collections)}` })) }
                        : f,
                    )
                  : el.kind === 'terms'
                    ? def.fields.map((f) =>
                        f.key === 'collection'
                          ? {
                              ...f,
                              options: [
                                { value: '', label: archiveFor ? t('Der dieser Übersicht ({name})', { name: tl(archiveFor.name) }) : t('Bitte wählen') },
                                ...collections.filter((c) => c.list_route && c.fields.some((x) => x.key === 'category')).map((c) => ({ value: c.id, label: tl(c.name) })),
                              ],
                            }
                          : f,
                      )
                    : def.fields
            }
            values={el.props}
            skip={Object.keys(el.bind ?? {})}
            onChange={(k, v) => onChange({ ...el, props: { ...el.props, [k]: v } })}
          />
          {el.kind === 'list' && <LoopRules el={el} collection={loopType} onChange={onChange} />}
          {el.kind === 'list' && loopType && <LoopEntries el={el} collection={loopType} />}
          {el.kind === 'image' && !el.bind?.image && <ImageFocus el={el} onChange={onChange} />}
          {ITEM_CONTAINERS.includes(el.kind) && <ItemsEditor el={el} onChange={onChange} onSelect={onSelect} locked={locked} />}
          {el.kind === 'list' && (
            <p className="xsmall faint">{t('Gestaltet wird der erste Eintrag – alle anderen sehen gleich aus. Verbinde seine Elemente mit den Feldern des Inhaltstyps.')}</p>
          )}
          {!source && <InteractionControls el={el} els={blockEls} onChange={onChange} onSelect={onSelect} />}
          <ConditionControls conds={el.show} source={bindSource} onChange={(show) => onChange({ ...el, show })} />
          <Field label={t('Name in den Ebenen')} help={t('Hilft, im Aufbau den Überblick zu behalten.')}>
            <input className="input" value={el.name ?? ''} placeholder={tl(def.label)} maxLength={60} onChange={(e) => onChange({ ...el, name: e.target.value || undefined })} />
          </Field>
          <AnchorField el={el} onChange={onChange} />
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
        <MotionPanel
          motion={el.motion}
          onChange={(m) => onChange({ ...el, motion: hasMotion(m) ? m : undefined })}
          onPlay={onPlay}
          target="element"
          items={el.kind === 'box'}
          text={el.kind === 'heading' || el.kind === 'text'}
        />
      )}
    </div>
  );
}

/** The loops of a layout – what a filter can narrow down. */
function loopsIn(els: El[]): El[] {
  const out: El[] = [];
  walkEls(els, (x) => void (x.kind === 'list' && out.push(x)));
  return out;
}
const loopName = (x: El, collections: CollectionDef[]) =>
  x.props.archive === true ? t('Dieses Archiv') : tl(collections.find((c) => c.id === x.props.collection)?.name ?? String(x.props.collection ?? ''));

const propLabel = (el: El, prop: string): string => {
  if (prop === 'href') return t('Link');
  if (prop === 'image') return t('Bild');
  if (prop === 'to') return t('Bis');
  if (prop === 'images') return t('Bilder');
  if (prop === 'html') return t('Text');
  return el.kind === 'button' ? t('Beschriftung') : t('Text');
};

/** Fields of the content type that fit a prop: texts for texts, pictures for pictures, addresses for links. */
function bindOptions(c: CollectionDef, kind: ElKind, prop: string): { value: string; label: string }[] {
  if (prop === 'images') return c.fields.filter((f) => f.type === 'images' || f.type === 'image').map((f) => ({ value: `field:${f.key}`, label: tl(f.label) }));
  if (prop === 'to')
    return [
      { value: 'date', label: t('Datum') },
      ...c.fields.filter((f) => (f.type === 'date' || f.type === 'datetime') && f.key !== 'date').map((f) => ({ value: `field:${f.key}`, label: tl(f.label) })),
    ];
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
  const extras =
    c.id === 'posts'
      ? [
          { value: 'author', label: t('Autor:in') },
          { value: 'readtime', label: t('Lesezeit') },
        ]
      : [];
  return [{ value: 'title', label: t('Titel') }, ...(kind !== 'text' || prop === 'html' ? [{ value: 'date', label: t('Datum') }] : []), ...extras, ...own];
}

/**
 * «Sprungmarke»: the element's own id in the page, so a menu entry or button
 * can jump right here (#team, or /ueber-uns#team from elsewhere).
 */
function AnchorField({ el, onChange }: { el: El; onChange: (el: El) => void }) {
  const clean = cleanAnchor(el.anchor);
  // Anywhere on the page: another element's, or a block's.
  const taken = useContext(PageAnchorsContext).some((a) => a.anchor === clean && a.owner !== el.id);
  return (
    <Field
      label={t('Sprungmarke')}
      htmlFor={`anchor-${el.id}`}
      error={taken ? t('Diese Sprungmarke gibt es auf der Seite schon – wähl eine andere.') : null}
      help={
        clean
          ? t('Verlinke mit «#{anchor}» auf dieser Seite, von anderen Seiten mit der Seitenadresse davor.', { anchor: clean })
          : t('Damit Links wie /#team direkt zu diesem Element springen.')
      }
    >
      <div className="input-affix">
        <span>#</span>
        <input
          id={`anchor-${el.id}`}
          className="input"
          value={el.anchor ?? ''}
          placeholder={t('team')}
          maxLength={60}
          aria-invalid={taken || undefined}
          onChange={(e) => onChange({ ...el, anchor: e.target.value || undefined })}
          // Tidied when leaving the field: «Unser Team» becomes unser-team.
          onBlur={() => el.anchor !== clean && onChange({ ...el, anchor: clean })}
        />
      </div>
    </Field>
  );
}

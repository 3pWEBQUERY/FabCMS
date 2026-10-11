import { useState } from 'react';
import { createAndOpen } from '../../lib/actions';
import { t, tl } from '../../lib/i18n';
import { navigate } from '../../lib/router';
import { Field, Select } from '../../ui/kit';
import { useToast } from '../../ui/toast';
import { Icon } from '../../ui/icons';
import { MAX_RULES, ruleFields, sortFields, timeField, type LoopRule } from '../../../shared/query';
import type { El } from '../../../shared/elements';
import type { FieldDef } from '../../../shared/fields';
import type { CollectionDef } from '../../../shared/types';

/** The loop's own settings with the choices that depend on its content type filled in, and those that don't fit left out. */
export function loopFields(fields: FieldDef[], collections: CollectionDef[], c: CollectionDef | undefined, archive = { archive: false, offered: false }): FieldDef[] {
  const hasTags = Boolean(c?.fields.some((f) => f.key === 'tags'));
  // «Dieses Archiv» only in archive templates; with it, type and filter come from the overview's address.
  const fromArchive = ['collection', 'category', 'tag', 'related', 'excludeCurrent'];
  return fields
    .filter((f) => (f.key !== 'archive' || archive.offered) && !(archive.archive && fromArchive.includes(f.key)))
    .filter((f) => (f.key !== 'time' || (c && timeField(c))) && (f.key !== 'tag' || hasTags))
    .map((f) =>
      f.key === 'collection'
        ? { ...f, options: collections.map((x) => ({ value: x.id, label: x.name })) }
        : f.key === 'sortField'
          ? { ...f, options: c ? sortFields(c).map((x) => ({ value: x.key, label: tl(x.label) })) : [] }
          : f.key === 'related' && !hasTags
            ? { ...f, options: f.options?.filter((o) => o.value !== 'tags') }
            : f,
    );
}

/** «Nur wenn»: a field of the content type has a value – up to four, all of them must hold. */
export function LoopRules({ el, collection, onChange }: { el: El; collection: CollectionDef | undefined; onChange: (el: El) => void }) {
  if (!collection) return null;
  const fields = ruleFields(collection);
  if (!fields.length) return null;
  const rules = ((el.props.rules as LoopRule[] | undefined) ?? []).slice(0, MAX_RULES);
  const set = (next: LoopRule[]) => onChange({ ...el, props: { ...el.props, rules: next } });
  const valueInput = (r: LoopRule, i: number) => {
    const f = fields.find((x) => x.key === r.field);
    const put = (is: string) => set(rules.map((x, j) => (j === i ? { ...x, is } : x)));
    if (f?.type === 'boolean')
      return (
        <Select
          value={r.is}
          onChange={put}
          label={t('Wert')}
          options={[
            { value: 'true', label: t('Ja') },
            { value: 'false', label: t('Nein') },
          ]}
        />
      );
    if (f?.options?.length) return <Select value={r.is} onChange={put} label={t('Wert')} options={f.options.map((o) => ({ value: String(o.value), label: tl(o.label) }))} />;
    return <input className="input" value={r.is} onChange={(e) => put(e.target.value)} aria-label={t('Wert')} placeholder={t('Wert')} maxLength={120} />;
  };
  return (
    <Field label={t('Nur wenn')} help={rules.length ? t('Alle Bedingungen müssen stimmen. Gross- und Kleinschreibung zählt nicht; bei Listen genügt ein Wert.') : undefined}>
      <div className="stack tight">
        {rules.map((r, i) => (
          <div key={i} className="loop-rule">
            <Select
              value={r.field}
              onChange={(field) => set(rules.map((x, j) => (j === i ? { field, is: '' } : x)))}
              label={t('Feld')}
              options={fields.map((f) => ({ value: f.key, label: tl(f.label) }))}
            />
            <span className="xsmall muted">{t('ist')}</span>
            {valueInput(r, i)}
            <button type="button" className="btn s ghost icon-only" onClick={() => set(rules.filter((_, j) => j !== i))} aria-label={t('Bedingung entfernen')}>
              <Icon name="x" size="s" />
            </button>
          </div>
        ))}
        {rules.length < MAX_RULES && (
          <button type="button" className="btn s" style={{ justifySelf: 'start' }} onClick={() => set([...rules, { field: fields[0].key, is: '' }])}>
            <Icon name="plus" size="s" /> {t('Bedingung hinzufügen')}
          </button>
        )}
      </div>
    </Field>
  );
}

/**
 * The loop's entries from where they show: a new one (with the loop's category
 * and tag already set) or the whole list. Single entries open from the canvas.
 */
export function LoopEntries({ el, collection }: { el: El; collection: CollectionDef }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const type = (k: string) => collection.fields.find((f) => f.key === k)?.type;
  const preset: Record<string, unknown> = {};
  if (type('category') && typeof el.props.category === 'string' && el.props.category) preset.category = el.props.category;
  // Free tags only: a list of fixed choices may not know the loop's word.
  if (type('tags') === 'tags' && typeof el.props.tag === 'string' && el.props.tag) preset.tags = [el.props.tag];
  const create = async () => {
    setBusy(true);
    try {
      await createAndOpen(collection.id, preset);
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
      setBusy(false);
    }
  };
  return (
    <div className="stack tight">
      <span className="section-title">{t('Einträge')}</span>
      <div className="row wrap">
        <button type="button" className="btn s" aria-busy={busy || undefined} disabled={busy} onClick={() => void create()}>
          <Icon name="plus" size="s" /> {t('Neuer Eintrag in «{name}»', { name: tl(collection.name) })}
        </button>
        <button type="button" className="btn ghost s" onClick={() => navigate(collection.id === 'pages' ? '/seiten' : `/inhalte/${collection.id}`)}>
          {t('Alle ansehen')}
        </button>
      </div>
      <p className="xsmall faint">{t('Einen gezeigten Eintrag öffnest du direkt auf der Fläche. Neue erscheinen in der Schleife, sobald sie veröffentlicht sind.')}</p>
    </div>
  );
}

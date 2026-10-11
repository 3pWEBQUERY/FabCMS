import { t, tl } from '../../lib/i18n';
import { Field, Select } from '../../ui/kit';
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

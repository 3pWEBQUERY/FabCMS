import { useState } from 'react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { t, tl } from '../lib/i18n';
import { useSession } from '../lib/session';
import { Icon } from '../ui/icons';
import { Dialog, Field, Popover, Select, Toggle } from '../ui/kit';
import { useToast } from '../ui/toast';
import { filterToParams, paramsToFilter, type ListFilter } from '../../shared/listfilter';
import type { FieldOption } from '../../shared/fields';

interface Facets {
  authors: { id: string; name: string; n: number }[];
  fields: { key: string; label: string; type: string; options: FieldOption[] | null; values: { value: string; n: number }[] }[];
}
interface View {
  id: string;
  name: string;
  query: Record<string, string>;
  shared: boolean;
  mine: boolean;
  owner_name: string | null;
}

const STATUS: Record<string, string> = { published: 'Online', draft: 'Entwürfe', review: 'Zur Freigabe', scheduled: 'Geplant' };
const UPDATED: Record<string, string> = {
  '1': 'Heute geändert',
  '7': 'In den letzten 7 Tagen geändert',
  '30': 'In den letzten 30 Tagen geändert',
  '90': 'In den letzten 90 Tagen geändert',
};
const same = (a: ListFilter, b: ListFilter) => JSON.stringify(filterToParams(a)) === JSON.stringify(filterToParams(b));

/**
 * Filters of a content list beyond search and status – author, last change,
 * category, choices, tags, yes/no – shown as chips, and saved views to get
 * back to a set of filters in one click.
 */
export function useListFilters(collection: string, filter: ListFilter, onChange: (f: ListFilter) => void) {
  const { can, user } = useSession();
  const toast = useToast();
  const { data: facets } = useApi<Facets>(`/api/entries/facets?collection=${collection}`);
  const { data: views, reload } = useApi<{ views: View[] }>(`/api/views?collection=${collection}`);
  const [saving, setSaving] = useState<{ name: string; shared: boolean } | null>(null);
  const fields = filter.fields ?? {};
  const setField = (key: string, value: string) => {
    const next = { ...fields };
    if (value) next[key] = value;
    else delete next[key];
    onChange({ ...filter, fields: next });
  };
  const fieldOf = (key: string) => facets?.fields.find((f) => f.key === key);
  const valueLabel = (key: string, value: string) => {
    const f = fieldOf(key);
    if (f?.type === 'boolean') return value === 'true' ? t('Ja') : t('Nein');
    return tl(f?.options?.find((o) => o.value === value)?.label) || value;
  };
  const authorName = (id: string) => (id === 'me' || id === user.id ? t('Ich') : (facets?.authors.find((a) => a.id === id)?.name ?? t('Unbekannt')));
  const active = views?.views.find((v) => same(paramsToFilter(v.query), filter));

  const chips: { label: string; clear: () => void }[] = [];
  if (filter.author) chips.push({ label: `${t('Von')}: ${authorName(filter.author)}`, clear: () => onChange({ ...filter, author: undefined }) });
  if (filter.updated) chips.push({ label: t(UPDATED[filter.updated]), clear: () => onChange({ ...filter, updated: undefined }) });
  for (const [k, v] of Object.entries(fields)) chips.push({ label: `${tl(fieldOf(k)?.label) || k}: ${valueLabel(k, v)}`, clear: () => setField(k, '') });
  const anything = chips.length > 0 || Boolean(filter.status) || Boolean(filter.q);

  const save = async () => {
    if (!saving) return;
    try {
      await api.post('/api/views', { collection, name: saving.name, shared: saving.shared, query: filterToParams(filter) });
      toast(t('Ansicht «{name}» gespeichert.', { name: saving.name.trim() }));
      setSaving(null);
      void reload();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  const remove = async (v: View) => {
    try {
      await api.del(`/api/views/${v.id}`);
      void reload();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };

  const filterCount = chips.length;
  const bar = (views?.views.length ?? 0) > 0 && (
    <nav className="lv-views" aria-label={t('Gespeicherte Ansichten')}>
      <button type="button" className="mf-chip" aria-pressed={!anything} onClick={() => onChange({})}>
        {t('Alle')}
      </button>
      {views!.views.map((v) => (
        <span key={v.id} className="lv-view">
          <button
            type="button"
            className="mf-chip"
            aria-pressed={active?.id === v.id}
            onClick={() => onChange(paramsToFilter(v.query))}
            title={v.shared && !v.mine ? t('Von {name} für alle', { name: v.owner_name ?? '' }) : undefined}
          >
            {v.shared && <Icon name="people" size="s" />}
            {v.name}
          </button>
          {(v.mine || (v.shared && can('content.publish'))) && (
            <button type="button" className="lv-x" onClick={() => void remove(v)} aria-label={t('Ansicht «{name}» löschen', { name: v.name })}>
              <Icon name="x" size="s" />
            </button>
          )}
        </span>
      ))}
    </nav>
  );
  const button = (
    <Popover
      align="end"
      trigger={
        <button className="btn" aria-label={t('Filter')}>
          <Icon name="filter" size="s" /> <span className="hide-m">{t('Filter')}</span>
          {filterCount > 0 && <span className="lv-n">{filterCount}</span>}
        </button>
      }
    >
      <div className="lv-pop stack">
        {!facets ? (
          <p className="small muted">{t('Lade …')}</p>
        ) : (
          <>
            <Field label={t('Von')}>
              <Select
                value={filter.author ?? ''}
                onChange={(v) => onChange({ ...filter, author: v || undefined })}
                options={[
                  { value: '', label: t('Allen') },
                  { value: 'me', label: t('Mir') },
                  ...facets.authors.filter((a) => a.id !== user.id).map((a) => ({ value: a.id, label: `${a.name || t('Unbekannt')} (${a.n})` })),
                ]}
              />
            </Field>
            <Field label={t('Geändert')}>
              <Select
                value={filter.updated ?? ''}
                onChange={(v) => onChange({ ...filter, updated: v || undefined })}
                options={[
                  { value: '', label: t('Jederzeit') },
                  { value: '1', label: t('Heute') },
                  { value: '7', label: t('In den letzten 7 Tagen') },
                  { value: '30', label: t('In den letzten 30 Tagen') },
                  { value: '90', label: t('In den letzten 90 Tagen') },
                ]}
              />
            </Field>
            {facets.fields.map((f) => (
              <Field key={f.key} label={tl(f.label)}>
                <Select
                  value={fields[f.key] ?? ''}
                  onChange={(v) => setField(f.key, v)}
                  options={[{ value: '', label: t('Alle') }, ...f.values.map((v) => ({ value: v.value, label: `${valueLabel(f.key, v.value)} (${v.n})` }))]}
                />
              </Field>
            ))}
          </>
        )}
      </div>
    </Popover>
  );
  const chipRow = anything && (
    <div className="lv-chips">
      {filter.status && <span className="lv-chip">{t(STATUS[filter.status] ?? filter.status)}</span>}
      {filter.q && <span className="lv-chip">«{filter.q}»</span>}
      {chips.map((c) => (
        <span key={c.label} className="lv-chip">
          {c.label}
          <button type="button" onClick={c.clear} aria-label={t('{name} entfernen', { name: c.label })}>
            <Icon name="x" size="s" />
          </button>
        </span>
      ))}
      <button type="button" className="linkish xsmall" onClick={() => onChange({})}>
        {t('Alle Filter entfernen')}
      </button>
      {!active && (
        <button type="button" className="btn s ghost" onClick={() => setSaving({ name: '', shared: false })}>
          <Icon name="plus" size="s" /> {t('Als Ansicht speichern')}
        </button>
      )}
    </div>
  );
  const dialog = (
    <Dialog open={saving !== null} onOpenChange={(o) => !o && setSaving(null)} title={t('Ansicht speichern')} description={t('Die Filter bleiben als ein Klick über der Liste.')}>
      {saving && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field label={t('Name')} htmlFor="lv-name">
            <input
              id="lv-name"
              className="input"
              autoFocus
              maxLength={60}
              placeholder={t('z. B. Meine Entwürfe')}
              value={saving.name}
              onChange={(e) => setSaving({ ...saving, name: e.target.value })}
            />
          </Field>
          {can('content.publish') && <Toggle checked={saving.shared} onChange={(v) => setSaving({ ...saving, shared: v })} label={t('Für alle im Team')} />}
          <div className="dialog-actions">
            <button type="button" className="btn ghost" onClick={() => setSaving(null)}>
              {t('Abbrechen')}
            </button>
            <button className="btn primary" disabled={!saving.name.trim()}>
              {t('Speichern')}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
  return { bar, button, chips: chipRow, dialog };
}

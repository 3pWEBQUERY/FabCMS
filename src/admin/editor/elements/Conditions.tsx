import { adminLang, t, tl } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { Select } from '../../ui/kit';
import { Icon } from '../../ui/icons';
import { MAX_CONDS, type Cond, type CondKind } from '../../../shared/conditions';
import { langInfo, siteLangs } from '../../../shared/i18n';
import { DAYS } from '../../../shared/hours';
import type { El } from '../../../shared/elements';
import type { CollectionDef } from '../../../shared/types';

const fresh = (kind: CondKind): Cond => {
  switch (kind) {
    case 'member':
      return { if: 'member', is: 'in' };
    case 'time':
      return { if: 'time' };
    case 'days':
      return { if: 'days', days: [6, 7] };
    case 'open':
      return { if: 'open', is: 'open' };
    case 'lang':
      return { if: 'lang', is: 'de' };
    case 'cart':
      return { if: 'cart', is: 'full' };
    case 'param':
      return { if: 'param', key: '', is: '' };
    case 'field':
      return { if: 'field', key: '', is: '' };
  }
};

/**
 * «Nur zeigen, wenn …»: up to four conditions, all of which must hold. In the
 * editor such an element stays visible, dashed; when it would not show right
 * now it is pale.
 */
export function ConditionControls({ el, source, onChange }: { el: El; source: CollectionDef | null; onChange: (el: El) => void }) {
  const { settings } = useSession();
  const conds = el.show ?? [];
  const set = (next: Cond[]) => onChange({ ...el, show: next.length ? next : undefined });
  const put = (i: number, c: Cond) => set(conds.map((x, j) => (j === i ? c : x)));
  const modules = settings?.modules ?? [];
  const kinds: { value: CondKind; label: string }[] = [
    ...(modules.includes('members') ? [{ value: 'member' as const, label: t('Mitglied') }] : []),
    { value: 'time', label: t('Zeitraum') },
    { value: 'days', label: t('Wochentage') },
    ...(settings?.hours.length ? [{ value: 'open' as const, label: t('Öffnungszeiten') }] : []),
    ...(settings && siteLangs(settings).length > 1 ? [{ value: 'lang' as const, label: t('Sprache') }] : []),
    ...(modules.includes('shop') ? [{ value: 'cart' as const, label: t('Warenkorb') }] : []),
    { value: 'param', label: t('Link-Parameter') },
    ...(source ? [{ value: 'field' as const, label: t('Feld von «{name}»', { name: tl(source.name) }) }] : []),
  ];
  const days = (DAYS[adminLang() as keyof typeof DAYS] ?? DAYS.de).short;

  const value = (c: Cond, i: number) => {
    switch (c.if) {
      case 'member':
        return (
          <Select
            label={t('Wer')}
            value={c.is}
            onChange={(v) => put(i, { if: 'member', is: v as 'in' | 'paid' | 'out' })}
            options={[
              { value: 'in', label: t('Angemeldete Mitglieder') },
              { value: 'paid', label: t('Mit bezahlter Mitgliedschaft') },
              { value: 'out', label: t('Nicht angemeldet') },
            ]}
          />
        );
      case 'time':
        return (
          <div className="cond-pair">
            <input
              className="input"
              type="datetime-local"
              aria-label={t('Ab')}
              title={t('Ab')}
              value={c.from ?? ''}
              onChange={(e) => put(i, { ...c, from: e.target.value.slice(0, 16) || undefined })}
            />
            <input
              className="input"
              type="datetime-local"
              aria-label={t('Bis')}
              title={t('Bis')}
              value={c.until ?? ''}
              onChange={(e) => put(i, { ...c, until: e.target.value.slice(0, 16) || undefined })}
            />
          </div>
        );
      case 'days':
        return (
          <div className="dp-chips" role="group" aria-label={t('Wochentage')}>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <button
                key={d}
                type="button"
                className="chip"
                aria-pressed={c.days.includes(d)}
                onClick={() => put(i, { if: 'days', days: c.days.includes(d) ? c.days.filter((x) => x !== d) : [...c.days, d].sort() })}
              >
                {days[d]}
              </button>
            ))}
          </div>
        );
      case 'open':
        return (
          <Select
            label={t('Wann')}
            value={c.is}
            onChange={(v) => put(i, { if: 'open', is: v as 'open' | 'closed' })}
            options={[
              { value: 'open', label: t('Jetzt geöffnet') },
              { value: 'closed', label: t('Jetzt geschlossen') },
            ]}
          />
        );
      case 'lang':
        return (
          <Select
            label={t('Sprache')}
            value={c.is}
            onChange={(v) => put(i, { if: 'lang', is: v })}
            options={(settings ? siteLangs(settings) : []).map((l) => ({ value: l, label: langInfo(l).native }))}
          />
        );
      case 'cart':
        return (
          <Select
            label={t('Warenkorb')}
            value={c.is}
            onChange={(v) => put(i, { if: 'cart', is: v as 'empty' | 'full' })}
            options={[
              { value: 'full', label: t('Etwas im Warenkorb') },
              { value: 'empty', label: t('Warenkorb leer') },
            ]}
          />
        );
      case 'param':
        return (
          <div className="cond-pair">
            <input
              className="input mono"
              value={c.key}
              placeholder="aktion"
              aria-label={t('Parameter')}
              onChange={(e) => put(i, { ...c, key: e.target.value.replace(/[^\w-]/g, '') })}
            />
            <input className="input" value={c.is} placeholder={t('beliebig')} aria-label={t('Wert')} onChange={(e) => put(i, { ...c, is: e.target.value })} />
          </div>
        );
      case 'field':
        return (
          <div className="cond-pair">
            <Select
              label={t('Feld')}
              value={c.key}
              placeholder={t('Feld wählen …')}
              onChange={(v) => put(i, { ...c, key: v })}
              options={(source?.fields ?? []).filter((f) => f.type !== 'blocks' && f.type !== 'group').map((f) => ({ value: f.key, label: tl(f.label) }))}
            />
            <input className="input" value={c.is} placeholder={t('hat einen Wert')} aria-label={t('Wert')} onChange={(e) => put(i, { ...c, is: e.target.value })} />
          </div>
        );
    }
  };

  return (
    <div className="stack tight cond-box">
      <span className="section-title">{t('Nur zeigen, wenn …')}</span>
      {conds.map((c, i) => (
        <div key={i} className="cond-row">
          <Select
            label={t('Bedingung')}
            value={c.if}
            onChange={(v) => put(i, fresh(v as CondKind))}
            options={kinds.some((k) => k.value === c.if) ? kinds : [...kinds, { value: c.if, label: c.if }]}
          />
          <button type="button" className="btn ghost s icon-only" aria-label={t('Bedingung entfernen')} onClick={() => set(conds.filter((_, j) => j !== i))}>
            <Icon name="trash" size="s" />
          </button>
          <div className="cond-value">{value(c, i)}</div>
          {c.if === 'param' && <p className="xsmall faint">{t('Für Links aus Newsletter oder Werbung, z. B. …?aktion=herbst. Leerer Wert = beliebig.')}</p>}
          {c.if === 'time' && <p className="xsmall faint">{t('In der Zeitzone der Website. Ein Feld darf leer bleiben.')}</p>}
        </div>
      ))}
      {conds.length < MAX_CONDS && (
        <button type="button" className="btn s" style={{ justifySelf: 'start' }} onClick={() => set([...conds, fresh(kinds[0].value)])}>
          <Icon name="plus" size="s" /> {conds.length ? t('Weitere Bedingung') : t('Bedingung hinzufügen')}
        </button>
      )}
      {conds.length > 0 && (
        <p className="xsmall faint">{t('Alle Bedingungen müssen stimmen. Im Editor bleibt das Element sichtbar – blass, wenn es gerade nicht erscheinen würde.')}</p>
      )}
    </div>
  );
}

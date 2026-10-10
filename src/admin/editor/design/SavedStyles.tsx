import { createContext, useContext, useState, type ReactNode } from 'react';
import { t } from '../../lib/i18n';
import { Dialog, Field, Segmented, Select, confirm } from '../../ui/kit';
import { Icon } from '../../ui/icons';
import { isEmptyDesign, type Design } from '../../../shared/design';
import { MAX_STYLES, type SavedStyle } from '../../../shared/styles';
import { shortId } from '../../../shared/text';

export interface SavedStylesValue {
  styles: SavedStyle[];
  /** Creating and changing styles is part of the site design. */
  canEdit: boolean;
  onStyles: (next: SavedStyle[]) => void;
  /** How many blocks and elements on this page use a style. */
  usedHere: (id: string) => number;
}

export const SavedStyles = createContext<SavedStylesValue | null>(null);

/** A style's design with the place's own on top, layer by layer – what the place looks like now. */
export function mergeDesign(base: Design | undefined, own: Design | undefined): Design | undefined {
  if (!base) return own;
  if (!own) return base;
  const out: Design = { ...base, ...own };
  for (const layer of ['desktop', 'tablet', 'mobile', 'hover'] as const) if (base[layer] || own[layer]) out[layer] = { ...base[layer], ...own[layer] };
  return out;
}

/**
 * Above the design panel: the saved style a block or element uses, and
 * whether the panel changes this place only or the style everywhere.
 * Returns the bar and the design the panel shows and changes.
 */
export function useSavedStyle({
  use,
  own,
  onOwn,
  onStyle,
}: {
  use: string | undefined;
  own: Design | undefined;
  onOwn: (d: Design | undefined) => void;
  /** Sets the style and the own design together. */
  onStyle: (use: string | undefined, own: Design | undefined) => void;
}): { bar: ReactNode; design: Design | undefined; onChange: (d: Design) => void } {
  const ctx = useContext(SavedStyles);
  const [scope, setScope] = useState<'own' | 'style'>('own');
  const [naming, setNaming] = useState<null | { mode: 'new' | 'rename'; name: string }>(null);
  if (!ctx) return { bar: null, design: own, onChange: (d) => onOwn(isEmptyDesign(d) ? undefined : d) };
  const style = ctx.styles.find((s) => s.id === use) ?? null;
  const editingStyle = scope === 'style' && style !== null && ctx.canEdit;
  const setStyleDesign = (d: Design) => ctx.onStyles(ctx.styles.map((s) => (s.id === style!.id ? { ...s, design: d } : s)));
  const nameTaken = (name: string) => ctx.styles.some((s) => s.name.toLowerCase() === name.trim().toLowerCase() && (naming?.mode === 'new' || s.id !== style?.id));

  const saveName = () => {
    if (!naming) return;
    const name = naming.name.replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!name || nameTaken(name)) return;
    if (naming.mode === 'rename' && style) ctx.onStyles(ctx.styles.map((s) => (s.id === style.id ? { ...s, name } : s)));
    else {
      // The look this place has now becomes the style; the place keeps nothing of its own.
      const created: SavedStyle = { id: shortId(10), name, design: mergeDesign(style?.design, own) ?? {} };
      ctx.onStyles([...ctx.styles, created]);
      onStyle(created.id, undefined);
      setScope('own');
    }
    setNaming(null);
  };
  const detach = () => {
    onStyle(undefined, mergeDesign(style?.design, own));
    setScope('own');
  };
  const remove = async () => {
    if (!style) return;
    const n = ctx.usedHere(style.id);
    const ok = await confirm({
      title: t('Stil «{name}» löschen?', { name: style.name }),
      message: t('Wo er verwendet wird – auf dieser Seite {n}× –, fällt sein Design weg; was dort selbst eingestellt ist, bleibt.', { n }),
      confirm: t('Löschen'),
      danger: true,
    });
    if (!ok) return;
    ctx.onStyles(ctx.styles.filter((s) => s.id !== style.id));
    onStyle(undefined, own);
    setScope('own');
  };

  const bar = (
    <div className="st-bar stack tight">
      <Field label={t('Gespeicherter Stil')} htmlFor="st-pick">
        <div className="row tight">
          <Select
            id="st-pick"
            value={use && style ? use : ''}
            onChange={(v) => {
              onStyle(v || undefined, own);
              setScope('own');
            }}
            options={[{ value: '', label: t('Kein Stil') }, ...ctx.styles.map((s) => ({ value: s.id, label: s.name }))]}
          />
          {ctx.canEdit && (!isEmptyDesign(own) || !style) && ctx.styles.length < MAX_STYLES && (
            <button type="button" className="btn s" onClick={() => setNaming({ mode: 'new', name: '' })} disabled={isEmptyDesign(own) && !style}>
              <Icon name="plus" size="s" /> {t('Als Stil speichern')}
            </button>
          )}
        </div>
      </Field>
      {style && (
        <>
          {ctx.canEdit ? (
            <Segmented
              label={t('Was du änderst')}
              value={editingStyle ? 'style' : 'own'}
              onChange={setScope}
              options={[
                { value: 'own', label: t('Nur hier') },
                { value: 'style', label: t('Stil überall') },
              ]}
            />
          ) : (
            <p className="xsmall muted">{t('Änderungen gelten nur hier. Den Stil selbst ändert, wer das Design der Website verwalten darf.')}</p>
          )}
          <p className="xsmall muted">
            {editingStyle
              ? t('Du änderst «{name}»: wirkt sofort überall, wo der Stil verwendet wird – auch auf veröffentlichten Seiten.', { name: style.name })
              : t('Was du hier einstellst, gilt zusätzlich zum Stil «{name}» und geht vor.', { name: style.name })}
          </p>
          <div className="row tight wrap">
            <button type="button" className="btn s ghost" onClick={detach}>
              {t('Vom Stil lösen')}
            </button>
            {ctx.canEdit && (
              <>
                <button type="button" className="btn s ghost" onClick={() => setNaming({ mode: 'rename', name: style.name })}>
                  {t('Umbenennen')}
                </button>
                <button type="button" className="btn s ghost danger" onClick={() => void remove()}>
                  {t('Stil löschen')}
                </button>
              </>
            )}
          </div>
        </>
      )}
      <Dialog
        open={naming !== null}
        onOpenChange={(o) => !o && setNaming(null)}
        title={naming?.mode === 'rename' ? t('Stil umbenennen') : t('Als Stil speichern')}
        description={
          naming?.mode === 'new'
            ? t('Das Design dieser Stelle wird zum Stil. Andere Blöcke und Elemente können ihn dann verwenden; änderst du ihn, ändern sie sich mit.')
            : undefined
        }
      >
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            saveName();
          }}
        >
          <Field label={t('Name')} htmlFor="st-name" error={naming && nameTaken(naming.name) ? t('Diesen Namen gibt es schon.') : undefined}>
            <input
              id="st-name"
              className="input"
              maxLength={60}
              value={naming?.name ?? ''}
              onChange={(e) => setNaming((n) => (n ? { ...n, name: e.target.value } : n))}
              autoFocus
            />
          </Field>
          <button type="submit" className="btn primary" style={{ justifySelf: 'start' }} disabled={!naming?.name.trim() || nameTaken(naming.name)}>
            {t('Speichern')}
          </button>
        </form>
      </Dialog>
    </div>
  );
  return {
    bar,
    design: editingStyle ? style.design : own,
    onChange: (d) => (editingStyle ? setStyleDesign(d) : onOwn(isEmptyDesign(d) ? undefined : d)),
  };
}

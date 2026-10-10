import { itemLabel, newItem, type El } from '../../../shared/elements';
import { t } from '../../lib/i18n';
import { Icon } from '../../ui/icons';
import { Tip } from '../../ui/kit';
import { addItemLabel, elLabel } from './ElementToolbar';

/**
 * The entries of an accordion, tabs, slider or marquee as a short list:
 * rename (for tabs the text on the button, for questions the question),
 * reorder, remove, add one more like the last – and jump to it on the page.
 */
export function ItemsEditor({ el, onChange, onSelect, locked }: { el: El; onChange: (el: El) => void; onSelect: (id: string) => void; locked: boolean }) {
  const kids = el.children ?? [];
  const set = (children: El[]) => onChange({ ...el, children });
  const title = el.kind === 'accordion' ? t('Fragen') : el.kind === 'tabs' ? t('Reiter') : el.kind === 'slider' ? t('Folien') : t('Einträge');

  // Questions are edited as the text of their first heading, tabs by the name on the button.
  const question = (c: El) => (el.kind === 'accordion' && c.children?.[0]?.kind === 'heading' ? c.children[0] : null);
  const textOf = (c: El, i: number) => {
    const q = question(c);
    return q ? String(q.props.text ?? '') : (c.name ?? (el.kind === 'tabs' ? itemLabel(c, i) : ''));
  };
  const rename = (i: number, v: string) =>
    set(
      kids.map((c, n) => {
        if (n !== i) return c;
        const q = question(c);
        if (q) return { ...c, children: c.children!.map((x, k) => (k === 0 ? { ...q, props: { ...q.props, text: v } } : x)) };
        return { ...c, name: v || undefined };
      }),
    );
  const move = (i: number, dir: -1 | 1) => {
    const next = [...kids];
    const [it] = next.splice(i, 1);
    next.splice(i + dir, 0, it);
    set(next);
  };

  return (
    <div className="items-ed">
      <div className="items-head">
        <span className="section-title">{title}</span>
        <span className="xsmall faint">{kids.length}</span>
      </div>
      <ol className="items-list">
        {kids.map((c, i) => (
          <li key={c.id} className="items-row">
            <Tip label={t('Auf der Seite zeigen')}>
              <button type="button" className="items-num" onClick={() => onSelect(c.id)} aria-label={t('Auf der Seite zeigen')}>
                {i + 1}
              </button>
            </Tip>
            <input
              className="input"
              value={textOf(c, i)}
              placeholder={el.kind === 'tabs' ? itemLabel(c, i) : elLabel(c)}
              aria-label={t('Name von Eintrag {n}', { n: i + 1 })}
              maxLength={question(c) ? 300 : 60}
              disabled={locked}
              onChange={(e) => rename(i, e.target.value)}
            />
            {!locked && (
              <span className="items-acts">
                <button type="button" className="btn ghost s icon-only" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('Nach vorne')}>
                  <Icon name="arrowUp" size="s" />
                </button>
                <button type="button" className="btn ghost s icon-only" disabled={i === kids.length - 1} onClick={() => move(i, 1)} aria-label={t('Nach hinten')}>
                  <Icon name="arrowDown" size="s" />
                </button>
                <button type="button" className="btn ghost s icon-only" disabled={kids.length <= 1} onClick={() => set(kids.filter((_, n) => n !== i))} aria-label={t('Entfernen')}>
                  <Icon name="trash" size="s" />
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>
      {!locked && (
        <button type="button" className="btn s items-add" onClick={() => set([...kids, newItem(el)])}>
          <Icon name="plus" size="s" /> {addItemLabel(el.kind)}
        </button>
      )}
      <p className="xsmall faint">
        {el.kind === 'accordion'
          ? t('Jede Frage ist ein Container: das erste Element ist die Frage, alles danach die Antwort – mit Bildern, Knöpfen, was du willst.')
          : el.kind === 'tabs'
            ? t('Jeder Reiter ist ein Container. Den Namen auf dem Knopf kannst du auch direkt auf der Seite schreiben.')
            : el.kind === 'slider'
              ? t('Jede Folie ist ein Container oder ein Bild. Neue Folien übernehmen das Design der letzten.')
              : t('Neue Einträge übernehmen das Design des letzten. Bewegung hält an, wenn jemand weniger Bewegung eingestellt hat.')}
      </p>
    </div>
  );
}

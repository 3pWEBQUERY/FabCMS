import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isMac, modKey } from '../lib/hooks';
import { t } from '../lib/i18n';
import { Icon } from '../ui/icons';
import { Dialog } from '../ui/kit';

export interface CtxItem {
  label: string;
  icon: string;
  keys?: string;
  run: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** Right-click menu on the canvas; stays inside it, closes on Escape or a click elsewhere. */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: (CtxItem | 'sep')[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  useLayoutEffect(() => {
    const box = ref.current;
    const room = box?.parentElement?.getBoundingClientRect();
    if (!box || !room) return;
    setPos({ x: Math.max(6, Math.min(x, room.width - box.offsetWidth - 6)), y: Math.max(6, Math.min(y, room.height - box.offsetHeight - 6)) });
    box.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [x, y]);
  useEffect(() => {
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const list = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
        const i = list.indexOf(document.activeElement as HTMLButtonElement);
        list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
      }
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', key);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);
  return (
    <div ref={ref} className="ctx-menu" role="menu" style={{ left: pos.x, top: pos.y }}>
      {items.map((it, i) =>
        it === 'sep' ? (
          <hr key={i} />
        ) : (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            className={it.danger ? 'danger' : ''}
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.run();
            }}
          >
            <Icon name={it.icon} size="s" />
            <span>{it.label}</span>
            {it.keys && <kbd>{it.keys}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}

const alt = isMac ? '⌥' : 'Alt';
export const KEYS = {
  duplicate: `${modKey} D`,
  copy: `${modKey} C`,
  paste: `${modKey} V`,
  copyStyle: `${alt} ${modKey} C`,
  pasteStyle: `${alt} ${modKey} V`,
  up: `${alt} ↑`,
  down: `${alt} ↓`,
  remove: isMac ? '⌫' : 'Entf',
};

/** Every shortcut of the editor on one page («?»). */
export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const groups: [string, [string, string][]][] = [
    [
      t('Allgemein'),
      [
        [t('Rückgängig'), `${modKey} Z`],
        [t('Wiederholen'), `${modKey} ⇧ Z`],
        [t('Sofort speichern'), `${modKey} S`],
        [t('Suchen und Befehle'), `${modKey} K`],
        [t('Studio und Werkbank wechseln'), `${modKey} .`],
        [t('Diese Übersicht'), '?'],
      ],
    ],
    [
      t('Blöcke und Elemente'),
      [
        [t('Übergeordnetes Element wählen'), 'Esc'],
        [t('Duplizieren'), KEYS.duplicate],
        [t('Kopieren – auch für eine andere Seite'), KEYS.copy],
        [t('Einfügen'), KEYS.paste],
        [t('Nach vorne / nach hinten'), `${KEYS.up} / ${KEYS.down}`],
        [t('Entfernen'), KEYS.remove],
      ],
    ],
    [
      t('Design'),
      [
        [t('Design kopieren'), KEYS.copyStyle],
        [t('Design einfügen'), KEYS.pasteStyle],
        [t('Wert in Zehnerschritten ändern'), '⇧ ↑ / ⇧ ↓'],
        [t('Wert ziehen: alle Seiten'), `⇧ + ${t('Ziehen')}`],
      ],
    ],
  ];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={t('Tastenkürzel')}>
      <div className="keys">
        {groups.map(([title, rows]) => (
          <section key={title}>
            <h3 className="section-title">{title}</h3>
            <dl>
              {rows.map(([what, keys]) => (
                <div key={what}>
                  <dt>{what}</dt>
                  <dd>
                    <kbd>{keys}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

import { useState, type DragEvent } from 'react';
import { api } from '../lib/api';
import { t } from '../lib/i18n';
import { useSession } from '../lib/session';
import { Icon } from '../ui/icons';
import { Menu, confirm } from '../ui/kit';
import { useToast } from '../ui/toast';

export interface FolderCount {
  folder: string;
  n: number;
}

/** Media tiles carry their ids under this type while dragged onto a folder. */
export const MEDIA_DRAG = 'application/x-nova-media';

/**
 * The folders of the media library as a bar: pick one to see its files,
 * make a new one (also empty), rename or remove it, and drop files on it.
 */
export function MediaFolders({
  folders,
  current,
  onPick,
  onChanged,
  onMove,
}: {
  folders: FolderCount[];
  current: string;
  onPick: (folder: string) => void;
  /** After create, rename or remove: the fresh list and where to look now. */
  onChanged: (folders: FolderCount[], current: string) => void;
  onMove: (ids: string[], folder: string) => void;
}) {
  const { can } = useSession();
  const toast = useToast();
  const [naming, setNaming] = useState<{ from: string | null; value: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const total = folders.reduce((n, f) => n + f.n, 0);

  const submit = async () => {
    if (!naming) return;
    const value = naming.value.trim();
    if (!value || value === naming.from) return setNaming(null);
    try {
      const r =
        naming.from === null
          ? await api.post<{ folder: string; folders: FolderCount[] }>('/api/media/folders', { name: value })
          : await api.patch<{ folder: string; folders: FolderCount[] }>('/api/media/folders', { from: naming.from, to: value });
      toast(naming.from === null ? t('Ordner «{name}» angelegt.', { name: r.folder }) : t('Ordner heisst jetzt «{name}».', { name: r.folder }));
      setNaming(null);
      onChanged(r.folders, r.folder);
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  const remove = async (f: FolderCount) => {
    if (
      !(await confirm({
        title: t('Ordner «{name}» löschen?', { name: f.folder }),
        message: f.n ? t('Die {n} Dateien darin bleiben und erscheinen unter «Ohne Ordner».', { n: f.n }) : undefined,
        confirm: t('Ordner löschen'),
        danger: true,
      }))
    )
      return;
    try {
      const r = await api.del<{ folders: FolderCount[] }>(`/api/media/folders?name=${encodeURIComponent(f.folder)}`);
      toast(t('Ordner «{name}» gelöscht.', { name: f.folder }));
      onChanged(r.folders, '*');
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };

  // Files dragged from the grid land in the folder they are dropped on.
  const drop = (folder: string) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(MEDIA_DRAG)) return;
      e.preventDefault();
      e.stopPropagation();
      setOver(folder);
    },
    onDragLeave: () => setOver((o) => (o === folder ? null : o)),
    onDrop: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(MEDIA_DRAG)) return;
      e.preventDefault();
      e.stopPropagation();
      setOver(null);
      const ids = JSON.parse(e.dataTransfer.getData(MEDIA_DRAG) || '[]') as string[];
      if (ids.length) onMove(ids, folder);
    },
  });

  const input = (
    <form
      className="mf-name"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Icon name="folder" size="s" />
      <input
        autoFocus
        className="input"
        value={naming?.value ?? ''}
        maxLength={80}
        placeholder={t('Name des Ordners')}
        aria-label={naming?.from === null ? t('Neuer Ordner') : t('Neuer Name')}
        onChange={(e) => naming && setNaming({ ...naming, value: e.target.value })}
        onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setNaming(null))}
        onBlur={() => void submit()}
      />
    </form>
  );

  return (
    <nav className="mf" aria-label={t('Ordner')}>
      <button type="button" className="mf-chip" aria-pressed={current === '*'} onClick={() => onPick('*')}>
        {t('Alle Dateien')} <span className="mf-n">{total}</span>
      </button>
      {folders.map((f) =>
        naming?.from === f.folder ? (
          <span key={f.folder || '-'}>{input}</span>
        ) : (
          <span key={f.folder || '-'} className={`mf-item${over === f.folder ? ' over' : ''}`} {...drop(f.folder)}>
            <button type="button" className="mf-chip" aria-pressed={current === f.folder} onClick={() => onPick(f.folder)}>
              <Icon name="folder" size="s" />
              {f.folder || t('Ohne Ordner')} <span className="mf-n">{f.n}</span>
            </button>
            {f.folder && current === f.folder && can('media.manage') && (
              <Menu
                align="start"
                trigger={
                  <button type="button" className="mf-more" aria-label={t('Ordner «{name}» bearbeiten', { name: f.folder })}>
                    <Icon name="more" size="s" />
                  </button>
                }
                items={[
                  { label: t('Umbenennen'), icon: 'pen', onSelect: () => setNaming({ from: f.folder, value: f.folder }) },
                  { label: t('Ordner löschen'), icon: 'trash', danger: true, onSelect: () => void remove(f) },
                ]}
              />
            )}
          </span>
        ),
      )}
      {can('media.upload') &&
        (naming?.from === null ? (
          input
        ) : (
          <button type="button" className="mf-chip mf-add" onClick={() => setNaming({ from: null, value: '' })}>
            <Icon name="plus" size="s" /> {t('Neuer Ordner')}
          </button>
        ))}
    </nav>
  );
}

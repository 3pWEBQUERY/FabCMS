import { useCallback, useEffect, useRef, useState } from 'react';
import { api, qs } from '../lib/api';
import { useDebounced } from '../lib/hooks';
import { Dialog } from './kit';
import { Icon } from './icons';
import { useToast } from './toast';

export interface MediaRow {
  id: string;
  filename: string;
  mime: string;
  alt: string;
  caption: string;
  width: number | null;
  height: number | null;
  focus: { x: number; y: number };
  edits: Record<string, unknown>;
  folder: string;
  tags: string[];
  version: number;
  image: boolean;
  thumb: string | null;
  preview: string | null;
  url: string;
  size: number;
  private?: boolean;
  created_at: string;
}

const cache = new Map<string, MediaRow>();

export async function getMedia(id: string): Promise<MediaRow | null> {
  if (cache.has(id)) return cache.get(id)!;
  try {
    const { media } = await api.get<{ media: MediaRow }>(`/api/media/${id}`);
    cache.set(id, media);
    return media;
  } catch {
    return null;
  }
}

export function rememberMedia(m: MediaRow) {
  cache.set(m.id, m);
}

export function useMedia(id: string | null | undefined) {
  const [m, setM] = useState<MediaRow | null>(id ? cache.get(id) ?? null : null);
  useEffect(() => {
    if (!id) return setM(null);
    let alive = true;
    void getMedia(id).then((x) => alive && setM(x));
    return () => {
      alive = false;
    };
  }, [id]);
  return m;
}

export async function uploadFiles(files: FileList | File[], opts: { folder?: string; private?: boolean } = {}): Promise<MediaRow[]> {
  const form = new FormData();
  for (const f of Array.from(files)) form.append('file', f);
  if (opts.folder) form.append('folder', opts.folder);
  if (opts.private) form.append('private', '1');
  const { media } = await api.upload<{ media: MediaRow[] }>('/api/media', form);
  media.forEach(rememberMedia);
  return media;
}

export function MediaPicker({
  open,
  onClose,
  onPick,
  multiple,
  type,
  privateUpload,
  initial = [],
}: {
  open: boolean;
  onClose: () => void;
  onPick: (ids: string[]) => void;
  multiple?: boolean;
  type?: 'image' | 'video' | 'file';
  privateUpload?: boolean;
  initial?: string[];
}) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<MediaRow[]>([]);
  const [selected, setSelected] = useState<string[]>(initial);
  const [uploading, setUploading] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const dq = useDebounced(q, 200);

  const load = useCallback(async () => {
    const r = await api.get<{ media: MediaRow[] }>(`/api/media${qs({ q: dq, type, limit: 120 })}`);
    r.media.forEach(rememberMedia);
    setItems(r.media);
  }, [dq, type]);

  useEffect(() => {
    if (open) {
      setSelected(initial);
      void load();
    }
  }, [open, load]);

  const upload = async (files: FileList | File[]) => {
    if (!files.length) return;
    setUploading(true);
    try {
      const added = await uploadFiles(files, { private: privateUpload });
      setItems((list) => [...added, ...list]);
      setSelected((s) => (multiple ? [...s, ...added.map((m) => m.id)] : [added[0].id]));
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setUploading(false);
    }
  };

  const toggle = (id: string) => setSelected((s) => (multiple ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id]));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={multiple ? 'Bilder auswählen' : type === 'image' || !type ? 'Bild auswählen' : 'Datei auswählen'} wide>
      <div
        className="stack"
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void upload(e.dataTransfer.files);
        }}
      >
        <div className="row">
          <div className="search">
            <Icon name="search" />
            <input className="input" placeholder="Suchen nach Name oder Beschreibung" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="btn" onClick={() => input.current?.click()} disabled={uploading}>
            <Icon name="upload" size="s" />
            {uploading ? 'Lädt hoch …' : 'Hochladen'}
          </button>
          <input
            ref={input}
            type="file"
            hidden
            multiple={multiple}
            accept={type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : undefined}
            onChange={(e) => e.target.files && void upload(e.target.files)}
          />
        </div>
        <div className={`dropzone ${over ? 'over' : ''}`} style={{ padding: items.length ? '0.6rem' : '2.5rem' }}>
          {items.length === 0 ? (
            <p>Zieh Dateien hierher oder tipp auf «Hochladen» – auch direkt vom Handy.</p>
          ) : (
            <div className="media-grid" style={{ maxHeight: '52vh', overflow: 'auto' }}>
              {items.map((m) => {
                const idx = selected.indexOf(m.id);
                return (
                  <button key={m.id} type="button" className="media-tile" aria-pressed={idx >= 0} onClick={() => toggle(m.id)} onDoubleClick={() => !multiple && onPick([m.id])} title={m.filename}>
                    {m.thumb ? <img src={m.thumb} alt={m.alt} loading="lazy" /> : <Icon name={m.mime.startsWith('video') ? 'video' : 'page'} />}
                    {!m.image && <span className="fname ellipsis">{m.filename}</span>}
                    {m.image && !m.alt && (
                      <span className="flag badge edited" title="Keine Bildbeschreibung">
                        Alt fehlt
                      </span>
                    )}
                    {multiple && idx >= 0 && <span className="order">{idx + 1}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div className="dialog-actions">
        <span className="small muted grow">{selected.length ? `${selected.length} ausgewählt` : ''}</span>
        <button className="btn ghost" onClick={onClose}>
          Abbrechen
        </button>
        <button className="btn primary" disabled={!selected.length} onClick={() => onPick(selected)}>
          Übernehmen
        </button>
      </div>
    </Dialog>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, qs } from '../lib/api';
import { useDebounced, formatDate } from '../lib/hooks';
import { usePath, navigate, Link } from '../lib/router';
import { useSession } from '../lib/session';
import { entryUrl } from '../lib/actions';
import { Dialog, Empty, Field, PageHead, Segmented, Skeleton, confirm, Select } from '../ui/kit';
import { AiAlt } from '../ui/Ai';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/toast';
import { rememberMedia, uploadFiles, type MediaRow, Thumb } from '../ui/MediaPicker';
import { TagInput } from '../ui/FieldInput';
import { t } from '../lib/i18n';

const sizeLabel = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function MediaLibrary() {
  const { can } = useSession();
  const toast = useToast();
  const { query } = usePath();
  const [items, setItems] = useState<MediaRow[] | null>(null);
  const [folders, setFolders] = useState<{ folder: string; n: number }[]>([]);
  const [folder, setFolder] = useState('*');
  const [type, setType] = useState('');
  const [missingAlt, setMissingAlt] = useState(query.get('missingAlt') === '1');
  const [q, setQ] = useState('');
  const [over, setOver] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [share, setShare] = useState(0);
  const [openId, setOpenId] = useState<string | null>(query.get('id'));
  const input = useRef<HTMLInputElement>(null);
  const dq = useDebounced(q, 200);

  const load = useCallback(async () => {
    const r = await api.get<{ media: MediaRow[]; folders: { folder: string; n: number }[] }>(
      `/api/media${qs({ folder, type, q: dq, missingAlt: missingAlt ? '1' : undefined, limit: 200 })}`,
    );
    r.media.forEach(rememberMedia);
    setItems(r.media);
    setFolders(r.folders);
  }, [folder, type, dq, missingAlt]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (query.get('upload') === '1') input.current?.click();
  }, [query]);

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setUploading(list.length);
    try {
      setShare(0);
      const added = await uploadFiles(list, { folder: folder === '*' ? '' : folder }, setShare);
      setItems((cur) => [...added, ...(cur ?? [])]);
      const noAlt = added.filter((m) => m.image).length;
      const done = added.length === 1 ? t('1 Datei hochgeladen.') : t('{n} Dateien hochgeladen.', { n: added.length });
      toast(noAlt ? `${done} ${t('Ergänze noch kurze Bildbeschreibungen.')}` : done);
      if (added.length === 1) setOpenId(added[0].id);
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setUploading(0);
    }
  };

  const open = items?.find((m) => m.id === openId) ?? null;

  return (
    <div
      className="page wide"
      onDragOver={(e) => {
        if (!can('media.upload')) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void upload(e.dataTransfer.files);
      }}
    >
      <PageHead
        back={
          <Link to="/inhalte" className="crumb">
            <Icon name="chevronLeft" size="s" /> {t('Inhalte')}
          </Link>
        }
        title={t('Mediathek')}
        sub={t('Lade Bilder so hoch, wie sie aus der Kamera kommen. Nova macht daraus schnelle AVIF- und WebP-Versionen in allen Grössen.')}
        actions={
          can('media.upload') && (
            <>
              <button
                className={`btn primary ${uploading ? 'uploading' : ''}`}
                style={{ '--up': share } as React.CSSProperties}
                onClick={() => input.current?.click()}
                disabled={uploading > 0}
              >
                {uploading ? <span className="spin" aria-hidden="true" /> : <Icon name="upload" size="s" />}
                {uploading ? (
                  <span>
                    {uploading === 1 ? t('Lädt hoch') : t('Lädt {n} Dateien hoch', { n: uploading })} · <span className="up-pct">{Math.round(share * 100)} %</span>
                  </span>
                ) : (
                  t('Hochladen')
                )}
              </button>
              <input
                ref={input}
                type="file"
                hidden
                multiple
                accept="image/*,video/*,.pdf,.docx,.xlsx,.zip,.mp3,.m4a,.csv,.txt"
                onChange={(e) => e.target.files && void upload(e.target.files)}
              />
            </>
          )
        }
      />
      <div className="toolbar">
        <div className="search">
          <Icon name="search" />
          <input className="input" placeholder={t('Dateiname, Beschreibung oder Schlagwort')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select
          inline
          label={t('Ordner')}
          value={folder}
          onChange={setFolder}
          options={[{ value: '*', label: t('Alle Ordner') }, ...folders.map((f) => ({ value: f.folder, label: `${f.folder || t('Ohne Ordner')} (${f.n})` }))]}
        />
        <Segmented
          label={t('Typ')}
          value={type}
          onChange={setType}
          options={[
            { value: '', label: t('Alle') },
            { value: 'image', label: t('Bilder') },
            { value: 'video', label: t('Videos') },
            { value: 'file', label: t('Dateien') },
          ]}
        />
        <button className="btn" aria-pressed={missingAlt} onClick={() => setMissingAlt((v) => !v)}>
          {t('Ohne Beschreibung')}
        </button>
      </div>
      <div className={`dropzone ${over ? 'over' : ''}`} style={{ padding: items?.length ? '0.75rem' : '3rem', textAlign: items?.length ? 'left' : 'center' }}>
        {!items ? (
          <Skeleton lines={4} />
        ) : items.length === 0 ? (
          <Empty title={q || missingAlt ? t('Nichts gefunden') : t('Noch keine Dateien')}>
            {q || missingAlt ? t('Versuch einen anderen Filter.') : t('Zieh Bilder hierher oder tipp auf «Hochladen» – auch direkt vom Handy aus der Kamera.')}
          </Empty>
        ) : (
          <div className="media-grid">
            {items.map((m) => (
              <button key={m.id} type="button" className="media-tile" onClick={() => setOpenId(m.id)} title={m.filename}>
                <Thumb m={m} />
                {!m.image && <span className="fname ellipsis">{m.filename}</span>}
                {m.image && !m.alt && <span className="flag badge edited">{t('Beschreibung fehlt')}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      {open && (
        <MediaDetail
          key={open.id}
          media={open}
          onClose={() => {
            setOpenId(null);
            if (query.get('id')) navigate('/medien', { replace: true });
          }}
          onChange={(m) => {
            rememberMedia(m);
            setItems((list) => list?.map((x) => (x.id === m.id ? m : x)) ?? null);
          }}
          onDelete={() => {
            setItems((list) => list?.filter((x) => x.id !== open.id) ?? null);
            setOpenId(null);
          }}
        />
      )}
    </div>
  );
}

function MediaDetail({ media, onClose, onChange, onDelete }: { media: MediaRow; onClose: () => void; onChange: (m: MediaRow) => void; onDelete: () => void }) {
  const { can } = useSession();
  const toast = useToast();
  const [alt, setAlt] = useState(media.alt);
  const [caption, setCaption] = useState(media.caption);
  const [folder, setFolder] = useState(media.folder);
  const [tags, setTags] = useState(media.tags);
  const [focus, setFocus] = useState(media.focus);
  const [editing, setEditing] = useState(false);
  const [usage, setUsage] = useState<{ id: string; collection: string; title: string }[] | null>(null);
  useEffect(() => {
    void api.get<{ usage: { id: string; collection: string; title: string }[] }>(`/api/media/${media.id}/usage`).then((r) => setUsage(r.usage));
  }, [media.id]);

  const save = async (patch: Record<string, unknown>) => {
    try {
      const r = await api.patch<{ media: MediaRow }>(`/api/media/${media.id}`, patch);
      onChange(r.media);
      return r.media;
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };

  const remove = async () => {
    const used = usage?.length ?? 0;
    if (
      !(await confirm({
        title: t('Datei löschen?'),
        message: used ? t('Diese Datei wird noch an {n} Stelle(n) verwendet. Dort fehlt sie danach.', { n: used }) : t('Die Datei wird endgültig entfernt.'),
        confirm: t('Löschen'),
        danger: true,
      }))
    )
      return;
    await api.del(`/api/media/${media.id}`);
    toast(t('Gelöscht.'));
    onDelete();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={media.filename} wide>
      {editing && media.image ? (
        <ImageEditor
          media={media}
          onCancel={() => setEditing(false)}
          onSave={async (edits) => {
            const m = await save({ edits });
            if (m) {
              setEditing(false);
              toast(t('Bild bearbeitet. Das Original bleibt unverändert.'));
            }
          }}
        />
      ) : (
        <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 22rem), 1fr))', alignItems: 'start', gap: '1.5rem' }}>
          <div className="stack tight">
            {media.image ? (
              <>
                <div
                  className="focus-picker"
                  onClick={(e) => {
                    const r = (e.currentTarget.querySelector('img') as HTMLImageElement).getBoundingClientRect();
                    const f = { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
                    setFocus(f);
                    void save({ focus: f });
                  }}
                  role="button"
                  aria-label={t('Fokuspunkt setzen')}
                >
                  <img src={media.preview!} alt={media.alt} />
                  <span className="focus-dot" style={{ left: `${focus.x * 100}%`, top: `${focus.y * 100}%` }} />
                </div>
                <p className="xsmall muted">{t('Tipp ins Bild, um den Fokuspunkt zu setzen. Beim Zuschneiden auf Hoch- oder Querformat bleibt diese Stelle sichtbar.')}</p>
              </>
            ) : media.mime.startsWith('video') ? (
              <>
                <video
                  key={media.video?.status}
                  src={webVersion(media) ?? media.url}
                  poster={media.thumb ?? undefined}
                  controls
                  preload="metadata"
                  style={{ width: '100%', borderRadius: 8, background: '#000' }}
                />
                {!media.private && <VideoStatus media={media} onChange={onChange} />}
              </>
            ) : (
              <div className="card card-pad row">
                <Icon name="page" /> {media.filename}
              </div>
            )}
            <p className="xsmall faint">
              {media.width && media.height ? `${media.width} × ${media.height} px · ` : ''}
              {sizeLabel(media.size)} · {formatDate(media.created_at)}
            </p>
          </div>
          <div className="stack">
            {media.image && (
              <Field
                label={t('Bildbeschreibung (Alt-Text)')}
                htmlFor="m-alt"
                help={
                  alt
                    ? t('Wird von Screenreadern vorgelesen und von Google gelesen.')
                    : t('Beschreib in einem Satz, was zu sehen ist – z. B. «Gaststube mit Holztischen am Abend».')
                }
                error={!alt ? t('Fehlt noch') : null}
                extra={
                  <AiAlt
                    media={media.id}
                    onApply={(v) => {
                      setAlt(v);
                      void save({ alt: v });
                    }}
                  />
                }
              >
                <input id="m-alt" className="input" value={alt} onChange={(e) => setAlt(e.target.value)} onBlur={() => alt !== media.alt && void save({ alt })} />
              </Field>
            )}
            <Field label={t('Bildunterschrift')} htmlFor="m-cap">
              <input id="m-cap" className="input" value={caption} onChange={(e) => setCaption(e.target.value)} onBlur={() => caption !== media.caption && void save({ caption })} />
            </Field>
            <div className="grid-2">
              <Field label={t('Ordner')} htmlFor="m-folder">
                <input id="m-folder" className="input" value={folder} onChange={(e) => setFolder(e.target.value)} onBlur={() => folder !== media.folder && void save({ folder })} />
              </Field>
              <Field label={t('Schlagwörter')}>
                <TagInput
                  value={tags}
                  onChange={(t) => {
                    setTags(t);
                    void save({ tags: t });
                  }}
                />
              </Field>
            </div>
            <div className="stack tight">
              <span className="section-title">{t('Verwendet in')}</span>
              {usage === null ? (
                <span className="small muted">…</span>
              ) : usage.length === 0 ? (
                <span className="small muted">{t('Nirgends.')}</span>
              ) : (
                <ul className="small" style={{ margin: 0, paddingLeft: '1.1rem' }}>
                  {usage.map((u) => (
                    <li key={u.id}>
                      <Link to={entryUrl(u.collection, u.id)} onClick={onClose}>
                        {u.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="row wrap">
              {media.image && can('media.upload') && (
                <button className="btn" onClick={() => setEditing(true)}>
                  <Icon name="crop" size="s" /> {t('Zuschneiden & drehen')}
                </button>
              )}
              <a className="btn" href={media.url} target="_blank" rel="noreferrer">
                <Icon name="external" size="s" /> {t('Öffnen')}
              </a>
              <button
                className="btn ghost"
                onClick={() => {
                  void navigator.clipboard?.writeText(location.origin + media.url);
                  toast(t('Link kopiert.'));
                }}
              >
                <Icon name="copy" size="s" /> {t('Link kopieren')}
              </button>
              {can('media.manage') && (
                <button className="btn danger" onClick={remove} style={{ marginLeft: 'auto' }}>
                  <Icon name="trash" size="s" /> {t('Löschen')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** Draws the image rotated on a canvas, so the crop box matches what is shown. */
function RotatedImage({ src, rotate, brightness }: { src: string; rotate: number; brightness: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = src;
  }, [src]);
  useEffect(() => {
    const c = ref.current;
    if (!c || !img) return;
    const swap = rotate === 90 || rotate === 270;
    c.width = swap ? img.naturalHeight : img.naturalWidth;
    c.height = swap ? img.naturalWidth : img.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.save();
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((rotate * Math.PI) / 180);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();
  }, [img, rotate]);
  return <canvas ref={ref} style={{ display: 'block', maxHeight: '52vh', maxWidth: '100%', filter: `brightness(${brightness})` }} />;
}

type Edits = { crop: { x: number; y: number; w: number; h: number } | null; rotate: 0 | 90 | 180 | 270; brightness: number };

/** Non-destructive editing: crop, rotate, brightness. The original stays untouched. */
function ImageEditor({ media, onSave, onCancel }: { media: MediaRow; onSave: (e: Edits) => void; onCancel: () => void }) {
  const cur = media.edits as Partial<Edits>;
  const [rotate, setRotate] = useState<Edits['rotate']>(cur.rotate ?? 0);
  const [brightness, setBrightness] = useState(cur.brightness ?? 1);
  const [crop, setCrop] = useState<Edits['crop']>(cur.crop ?? null);
  const [ratio, setRatio] = useState<'free' | '1' | '4/3' | '16/9' | '3/4'>('free');
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: 'move' | 'size'; sx: number; sy: number; start: NonNullable<Edits['crop']> } | null>(null);
  // Show the original (orientation-corrected) image; crop coordinates refer to the rotated image.
  const src = `/api/media/${media.id}/source`;
  const rotated = rotate === 90 || rotate === 270;
  const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };

  const applyRatio = (r: typeof ratio) => {
    setRatio(r);
    if (r === 'free') return;
    const [a, b] = r === '1' ? [1, 1] : r.split('/').map(Number);
    const imgW = (rotated ? media.height : media.width) ?? 1;
    const imgH = (rotated ? media.width : media.height) ?? 1;
    const target = a / b;
    let w = 1;
    let h = imgW / target / imgH;
    if (h > 1) {
      h = 1;
      w = (imgH * target) / imgW;
    }
    setCrop({ x: (1 - w) / 2, y: (1 - h) / 2, w, h });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const dx = (e.clientX - drag.current.sx) / r.width;
    const dy = (e.clientY - drag.current.sy) / r.height;
    const s = drag.current.start;
    if (drag.current.mode === 'move') setCrop({ ...s, x: Math.min(1 - s.w, Math.max(0, s.x + dx)), y: Math.min(1 - s.h, Math.max(0, s.y + dy)) });
    else {
      let w = Math.min(1 - s.x, Math.max(0.05, s.w + dx));
      let h = Math.min(1 - s.y, Math.max(0.05, s.h + dy));
      if (ratio !== 'free') {
        const [a, b] = ratio === '1' ? [1, 1] : ratio.split('/').map(Number);
        h = Math.min(1 - s.y, (w * r.width) / (a / b) / r.height);
        w = (h * r.height * (a / b)) / r.width;
      }
      setCrop({ ...s, w, h });
    }
  };

  return (
    <div className="stack">
      <div style={{ display: 'grid', placeItems: 'center', background: 'var(--sunken)', borderRadius: 8, padding: '1rem', overflow: 'hidden' }}>
        <div
          ref={box}
          style={{ position: 'relative', maxWidth: '100%', touchAction: 'none' }}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onPointerLeave={() => (drag.current = null)}
        >
          <RotatedImage src={src} rotate={rotate} brightness={brightness} />
          {crop && (
            <div
              className="crop-box"
              style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%` }}
              onPointerDown={(e) => {
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                drag.current = { mode: (e.target as HTMLElement).classList.contains('h') ? 'size' : 'move', sx: e.clientX, sy: e.clientY, start: c };
              }}
            >
              <span className="h" />
            </div>
          )}
        </div>
      </div>
      <p className="xsmall muted">{t('Zuschneiden wirkt auf das Bild nach dem Drehen. Ziehen verschiebt den Ausschnitt, die Ecke ändert die Grösse.')}</p>
      <div className="row wrap" style={{ gap: '1rem' }}>
        <Segmented
          label={t('Seitenverhältnis')}
          value={ratio}
          onChange={(r) => (crop || r !== 'free' ? applyRatio(r) : setRatio(r))}
          options={[
            { value: 'free', label: t('Frei') },
            { value: '1', label: '1:1' },
            { value: '4/3', label: '4:3' },
            { value: '16/9', label: '16:9' },
            { value: '3/4', label: '3:4' },
          ]}
        />
        <button className="btn" onClick={() => setCrop(crop ? null : { x: 0.1, y: 0.1, w: 0.8, h: 0.8 })} aria-pressed={Boolean(crop)}>
          <Icon name="crop" size="s" /> {crop ? t('Zuschnitt entfernen') : t('Zuschneiden')}
        </button>
        <button className="btn" onClick={() => setRotate((r) => ((r + 90) % 360) as Edits['rotate'])}>
          <Icon name="rotate" size="s" /> {t('Drehen')}
        </button>
        <label className="row small" style={{ gap: '0.5rem' }}>
          <Icon name="sun" size="s" /> {t('Helligkeit')}
          <input type="range" min={0.6} max={1.4} step={0.05} value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} />
        </label>
      </div>
      <div className="dialog-actions">
        <button className="btn ghost" onClick={() => onSave({ crop: null, rotate: 0, brightness: 1 })}>
          {t('Auf Original zurücksetzen')}
        </button>
        <span className="grow" />
        <button className="btn ghost" onClick={onCancel}>
          {t('Abbrechen')}
        </button>
        <button className="btn primary" onClick={() => onSave({ crop, rotate, brightness })}>
          {t('Übernehmen')}
        </button>
      </div>
    </div>
  );
}

/** Smallest web version of a video – plays everywhere, loads fastest in the admin. */
const webVersion = (m: MediaRow) => {
  const r = m.video?.status === 'ready' ? [...(m.video.renditions ?? [])].sort((a, b) => a.p - b.p)[0] : null;
  return r ? `/media/${m.id}/video/${r.p}.mp4` : null;
};

/** Where the web versions of a video stand; checks back while they are being made. */
function VideoStatus({ media, onChange }: { media: MediaRow; onChange: (m: MediaRow) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const v = media.video;
  const pending = v?.status === 'queued' || v?.status === 'working';
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(async () => {
      const r = await api.get<{ media: MediaRow }>(`/api/media/${media.id}`).catch(() => null);
      if (r && r.media.video?.status !== v?.status) onChange(r.media);
    }, 3000);
    return () => clearInterval(timer);
  }, [pending, media.id, v?.status, onChange]);
  if (!v) return null;

  const retry = async () => {
    setBusy(true);
    try {
      onChange((await api.post<{ media: MediaRow }>(`/api/media/${media.id}/video`)).media);
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setBusy(false);
    }
  };
  if (pending)
    return (
      <p className="xsmall muted row" role="status">
        <span className="mini-spin" aria-hidden="true" /> {t('Wird fürs Web aufbereitet … Bis dahin läuft auf der Website das Original.')}
      </p>
    );
  if (v.status === 'ready' && !v.renditions?.length)
    return (
      <p className="xsmall muted row" role="status">
        <Icon name="check" size="s" />
        {t('Das Original ist schon fürs Web geeignet und kleiner als eine neue Fassung – auf der Website läuft es direkt.')}
      </p>
    );
  if (v.status === 'ready') {
    const total = (v.renditions ?? []).reduce((n, r) => n + r.size, 0);
    return (
      <p className="xsmall muted row" role="status">
        <Icon name="check" size="s" />
        {t('Fürs Web aufbereitet: {sizes} – zusammen {web} statt {original}. Auf der Website laufen diese Fassungen, das Original bleibt für Downloads.', {
          sizes: (v.renditions ?? [])
            .map((r) => `${r.p}p`)
            .sort()
            .reverse()
            .join(', '),
          web: sizeLabel(total),
          original: sizeLabel(media.size),
        })}
      </p>
    );
  }
  const reason =
    v.error === 'ffmpeg fehlt auf dem Server'
      ? t('Auf diesem Server fehlt ffmpeg – das Video läuft so, wie es hochgeladen wurde.')
      : v.error === 'ausgeschaltet'
        ? t('Die Aufbereitung ist ausgeschaltet (NOVA_VIDEO=off) – das Video läuft so, wie es hochgeladen wurde.')
        : v.status === 'skipped'
          ? t('In dieser Datei ist keine Videospur – sie läuft so, wie sie ist.')
          : t('Konnte nicht fürs Web aufbereitet werden. Auf der Website läuft das Original.');
  return (
    <div className="row wrap xsmall muted" role="status">
      <Icon name="info" size="s" />
      <span style={{ flex: 1, minWidth: '12rem' }}>{reason}</span>
      {v.status === 'failed' || v.error === 'ffmpeg fehlt auf dem Server' ? (
        <button type="button" className="btn s" onClick={() => void retry()} aria-busy={busy || undefined}>
          <span>{t('Nochmals versuchen')}</span>
        </button>
      ) : null}
    </div>
  );
}

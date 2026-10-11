import { useRef, useState } from 'react';
import { t } from '../lib/i18n';
import { Icon } from '../ui/icons';
import { Select, confirm } from '../ui/kit';
import { useToast } from '../ui/toast';
import { uploadFiles } from '../ui/MediaPicker';
import {
  FONT_FILE_EXT,
  MAX_CUSTOM_FONTS,
  MAX_FONT_FACES,
  cleanFamily,
  customFontFaces,
  customFontId,
  customFontStack,
  fontFormatOf,
  guessFace,
  type CustomFont,
} from '../../shared/custom-fonts';

const WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900', '100 900'];
const weightLabel = (w: string) =>
  w === '100 900'
    ? t('Variabel – alle Stärken')
    : `${w} – ${t(({ 100: 'Hauchdünn', 200: 'Extraleicht', 300: 'Leicht', 400: 'Normal', 500: 'Mittel', 600: 'Halbfett', 700: 'Fett', 800: 'Extrafett', 900: 'Schwarz' } as Record<string, string>)[w] ?? 'Normal')}`;

/**
 * «Eigene Schriften»: font files uploaded once, grouped into families by
 * their names (Inter-Bold, Inter-Italic …), each cut with its weight and
 * style – then chosen in any own design like Nova's fonts.
 */
export function FontLibrary({ value, onChange }: { value: CustomFont[]; onChange: (next: CustomFont[]) => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [sample, setSample] = useState('');

  const upload = async (files: FileList | null) => {
    const list = Array.from(files ?? []).filter((f) => FONT_FILE_EXT.test(f.name));
    if (!list.length) return toast(t('Nur Schriftdateien: WOFF2, WOFF, TTF oder OTF.'), { kind: 'bad' });
    setBusy(true);
    try {
      const media = await uploadFiles(list, { folder: t('Schriften') });
      let next = structuredClone(value);
      for (const m of media) {
        const format = fontFormatOf(m.filename);
        if (!format) continue;
        const guess = guessFace(m.filename);
        let font = next.find((f) => f.family.toLowerCase() === guess.family.toLowerCase());
        if (!font) {
          if (next.length >= MAX_CUSTOM_FONTS) {
            toast(t('Höchstens {n} eigene Schriften.', { n: MAX_CUSTOM_FONTS }), { kind: 'bad' });
            break;
          }
          let id = customFontId(guess.family);
          for (let n = 2; next.some((f) => f.id === id); n++) id = `${customFontId(guess.family)}-${n}`;
          font = { id, family: guess.family, fallback: /serif|garamond|caslon|bodoni|didot|times/i.test(guess.family) ? 'serif' : 'sans', faces: [] };
          next = [...next, font];
        }
        if (font.faces.length >= MAX_FONT_FACES) continue;
        font.faces.push({ media: m.id, file: m.filename, format, weight: guess.weight, style: guess.style });
      }
      onChange(next);
      toast(t('{n} Schriftdateien hochgeladen. Prüf Stärke und Stil jedes Schnitts.', { n: media.length }));
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const change = (id: string, patch: Partial<CustomFont>) => onChange(value.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const remove = async (f: CustomFont) => {
    if (
      await confirm({
        title: t('Schrift «{name}» entfernen?', { name: f.family }),
        message: t('Designs, die sie verwenden, zeigen danach wieder Instrument Sans. Die Dateien bleiben in der Mediathek.'),
        confirm: t('Entfernen'),
        danger: true,
      })
    )
      onChange(value.filter((x) => x.id !== f.id));
  };

  return (
    <div className="stack">
      {/* The admin shows the fonts too – the same files the website uses. */}
      <style>
        {customFontFaces(
          value,
          value.map((f) => f.id),
        )}
      </style>
      <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
        <button className="btn" onClick={() => input.current?.click()} disabled={busy || value.length >= MAX_CUSTOM_FONTS}>
          <Icon name="upload" size="s" /> {busy ? t('Lädt hoch …') : t('Schriftdateien hochladen')}
        </button>
        <input ref={input} type="file" accept=".woff2,.woff,.ttf,.otf" multiple hidden onChange={(e) => void upload(e.target.files)} />
        <span className="xsmall muted grow">{t('WOFF2 ist am schnellsten. Mehrere Dateien einer Familie auf einmal – Nova ordnet sie nach dem Namen zu.')}</span>
      </div>
      {value.length === 0 ? (
        <p className="small muted">{t('Noch keine eigenen Schriften. Lade nur Schriften hoch, die du auf einer Website verwenden darfst (Web-Lizenz).')}</p>
      ) : (
        <>
          <input className="input" value={sample} onChange={(e) => setSample(e.target.value)} placeholder={t('Eigener Mustertext …')} aria-label={t('Mustertext')} />
          <ul className="font-list">
            {value.map((f) => (
              <li key={f.id} className="font-card">
                <div className="font-head">
                  <label className="font-field">
                    <span className="xsmall muted">{t('Name der Schrift')}</span>
                    <input className="input" value={f.family} maxLength={40} onChange={(e) => change(f.id, { family: cleanFamily(e.target.value) || f.family })} />
                  </label>
                  <div className="font-field">
                    <span className="xsmall muted" aria-hidden="true">
                      {t('Ersatz beim Laden')}
                    </span>
                    <Select
                      label={t('Ersatz beim Laden')}
                      value={f.fallback}
                      onChange={(v) => change(f.id, { fallback: v as CustomFont['fallback'] })}
                      options={[
                        { value: 'sans', label: t('Ohne Serifen') },
                        { value: 'serif', label: t('Mit Serifen') },
                        { value: 'mono', label: t('Gleiche Breite') },
                      ]}
                    />
                  </div>
                  <button className="btn s ghost icon-only" onClick={() => void remove(f)} aria-label={t('Schrift «{name}» entfernen', { name: f.family })}>
                    <Icon name="trash" size="s" />
                  </button>
                </div>
                <p className="font-sample" style={{ fontFamily: customFontStack(f) }}>
                  {sample || t('Grüezi! Frische Küche, ehrlich gekocht – 0123456789')}
                </p>
                <ul className="font-faces">
                  {f.faces.map((face, i) => (
                    <li key={`${face.media}-${i}`}>
                      <span className="font-face-name" style={{ fontFamily: customFontStack(f), fontWeight: face.weight.split(' ')[0], fontStyle: face.style }} title={face.file}>
                        {face.file}
                      </span>
                      <select
                        className="input"
                        value={face.weight}
                        aria-label={t('Stärke von {file}', { file: face.file })}
                        onChange={(e) => change(f.id, { faces: f.faces.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)) })}
                      >
                        {WEIGHTS.map((w) => (
                          <option key={w} value={w}>
                            {weightLabel(w)}
                          </option>
                        ))}
                      </select>
                      <select
                        className="input"
                        value={face.style}
                        aria-label={t('Stil von {file}', { file: face.file })}
                        onChange={(e) => change(f.id, { faces: f.faces.map((x, j) => (j === i ? { ...x, style: e.target.value as 'normal' | 'italic' } : x)) })}
                      >
                        <option value="normal">{t('Aufrecht')}</option>
                        <option value="italic">{t('Kursiv')}</option>
                      </select>
                      <button
                        className="btn s ghost icon-only"
                        onClick={() => change(f.id, { faces: f.faces.filter((_, j) => j !== i) })}
                        aria-label={t('Schnitt {file} entfernen', { file: face.file })}
                      >
                        <Icon name="x" size="s" />
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

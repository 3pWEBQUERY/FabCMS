import { t } from '../../lib/i18n';
import { Field, Segmented, Select, Toggle } from '../../ui/kit';
import { MediaField, MediaList } from '../../ui/FieldInput';
import { MAX_SLIDES, SLIDE_SECONDS, type BgMedia } from '../../../shared/bg-media';

/** «Bewegter Hintergrund» of a section: a video in a loop or a slideshow, behind the content and under the overlay. */
export function BgMediaControls({ value, onChange }: { value: BgMedia | undefined; onChange: (m: BgMedia | undefined) => void }) {
  const kind = value?.kind ?? 'none';
  return (
    <div className="stack tight">
      <Segmented
        label={t('Bewegter Hintergrund')}
        value={kind}
        onChange={(k) =>
          onChange(k === 'video' ? { kind: 'video', video: '' } : k === 'slides' ? { kind: 'slides', images: [], effect: 'fade', seconds: SLIDE_SECONDS.default } : undefined)
        }
        options={[
          { value: 'none' as const, label: t('Keiner') },
          { value: 'video' as const, label: t('Video') },
          { value: 'slides' as const, label: t('Diashow') },
        ]}
      />
      {value?.kind === 'video' && (
        <>
          <Field label={t('Video')} help={t('Läuft stumm in Schlaufe. MP4 – Nova macht daraus eine schlanke Web-Fassung.')}>
            <MediaField value={value.video || null} type="video" onChange={(v) => onChange({ ...value, video: v ?? '' })} />
          </Field>
          <Field label={t('Standbild')} help={t('Erscheint, bis das Video läuft, auf dem Handy und bei «weniger Bewegung». Leer = ein Bild aus dem Video.')}>
            <MediaField value={value.poster ?? null} type="image" onChange={(v) => onChange({ ...value, poster: v ?? undefined })} />
          </Field>
          <Toggle
            checked={Boolean(value.phones)}
            onChange={(on) => onChange({ ...value, phones: on || undefined })}
            label={t('Auch auf dem Handy abspielen')}
            help={t('Sonst zeigt das Handy das Standbild – das schont das Datenvolumen der Besucher.')}
          />
        </>
      )}
      {value?.kind === 'slides' && (
        <>
          <Field label={t('Bilder')} help={t('Bis zu {n}, in dieser Reihenfolge.', { n: MAX_SLIDES })}>
            <MediaList value={value.images} onChange={(images) => onChange({ ...value, images: images.slice(0, MAX_SLIDES) })} />
          </Field>
          <Field label={t('Übergang')}>
            <Select
              label={t('Übergang')}
              value={value.effect}
              onChange={(v) => onChange({ ...value, effect: v === 'kenburns' ? 'kenburns' : 'fade' })}
              options={[
                { value: 'fade', label: t('Überblenden') },
                { value: 'kenburns', label: t('Überblenden mit langsamem Zoom') },
              ]}
            />
          </Field>
          <Field label={t('Sekunden pro Bild')}>
            <input
              className="input"
              type="number"
              min={SLIDE_SECONDS.min}
              max={SLIDE_SECONDS.max}
              value={value.seconds}
              onChange={(e) => onChange({ ...value, seconds: Math.min(SLIDE_SECONDS.max, Math.max(SLIDE_SECONDS.min, Number(e.target.value) || SLIDE_SECONDS.default)) })}
            />
          </Field>
        </>
      )}
      {value && <p className="xsmall faint">{t('Die Überlagerung unten liegt auch über Video und Bildern – so bleibt der Text lesbar.')}</p>}
    </div>
  );
}

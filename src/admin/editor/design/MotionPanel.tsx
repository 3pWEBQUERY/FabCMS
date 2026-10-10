import type { ReactNode } from 'react';
import { type Easing, type EnterEffect, type ItemHover, type Motion, type ScrollEffect } from '../../../shared/motion';
import { t } from '../../lib/i18n';
import { Icon } from '../../ui/icons';
import { Switch, Tip } from '../../ui/kit';
import { DesignSection, NumberInput, PropRow } from './controls';

const enterEffects = (): { value: EnterEffect | ''; label: string }[] => [
  { value: '', label: t('Keine') },
  { value: 'fade', label: t('Einblenden') },
  { value: 'up', label: t('Von unten') },
  { value: 'down', label: t('Von oben') },
  { value: 'left', label: t('Von links') },
  { value: 'right', label: t('Von rechts') },
  { value: 'zoom', label: t('Heranzoomen') },
  { value: 'zoom-out', label: t('Aus der Nähe') },
  { value: 'blur', label: t('Aus der Unschärfe') },
  { value: 'flip', label: t('Aufklappen') },
  { value: 'tilt', label: t('Schräg') },
  { value: 'reveal', label: t('Aufdecken') },
];

const scrollEffects = (): { value: ScrollEffect | ''; label: string }[] => [
  { value: '', label: t('Keiner') },
  { value: 'parallax', label: t('Tiefe (Parallax)') },
  { value: 'fade', label: t('Ausblenden') },
  { value: 'zoom', label: t('Wachsen') },
  { value: 'slide', label: t('Gleiten') },
];

const hoverEffects = (): { value: ItemHover | ''; label: string }[] => [
  { value: '', label: t('Keiner') },
  { value: 'lift', label: t('Anheben') },
  { value: 'grow', label: t('Vergrössern') },
  { value: 'glow', label: t('Leuchten') },
  { value: 'tilt', label: t('3D-Neigen') },
];

const easings = (): { value: Easing; label: string; path: string }[] => [
  { value: 'smooth', label: t('Sanft'), path: 'M2 18C6 6 9 2 18 2' },
  { value: 'spring', label: t('Federnd'), path: 'M2 18C5 1 8 -3 13 1S18 2 18 2' },
  { value: 'snappy', label: t('Knackig'), path: 'M2 18C10 18 9 2 18 2' },
  { value: 'slow', label: t('Gemächlich'), path: 'M2 18C9 18 11 2 18 2' },
  { value: 'linear', label: t('Gleichmässig'), path: 'M2 18 18 2' },
];

/** A tile that shows its effect in miniature when the pointer is on it. */
function Tile({ kind, value, label, active, onClick }: { kind: string; value: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`mp-tile ${active ? 'on' : ''}`} aria-pressed={active} onClick={onClick}>
      <span className={`mp-stage mp-${kind}-${value || 'none'}`} aria-hidden="true">
        <span className="mp-card" />
        {kind === 'scroll' && <span className="mp-card ghost" />}
      </span>
      <span className="mp-label">{label}</span>
    </button>
  );
}

function Tiles({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="mp-tiles" role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function MotionPanel({ motion, onChange, onPlay, target }: { motion: Motion | undefined; onChange: (m: Motion) => void; onPlay: () => void; target: 'block' | 'element' }) {
  const m = motion ?? {};
  const set = (patch: Partial<Motion>) => {
    const next: Motion = { ...m, ...patch };
    for (const k of Object.keys(next) as (keyof Motion)[]) if (next[k] === undefined) delete next[k];
    onChange(next);
  };
  const enterCount = ['enter', 'duration', 'delay', 'distance', 'easing', 'stagger', 'repeat'].filter((k) => m[k as keyof Motion] !== undefined).length;
  const moves = m.enter && !['fade', 'zoom', 'zoom-out', 'reveal'].includes(m.enter);
  return (
    <div className="dp">
      <DesignSection id="motion-enter" title={t('Erscheinen')} icon="sparkStar" count={enterCount} defaultOpen>
        <Tiles label={t('Wie der Inhalt erscheint')}>
          {enterEffects().map((e) => (
            <Tile
              key={e.value}
              kind="enter"
              value={e.value}
              label={e.label}
              active={(m.enter ?? '') === e.value}
              onClick={() => set({ enter: (e.value || undefined) as EnterEffect | undefined })}
            />
          ))}
        </Tiles>
        {m.enter && (
          <>
            <div className="dp-grid2">
              <PropRow label={t('Dauer')} state={m.duration !== undefined ? 'set' : 'none'} onReset={() => set({ duration: undefined })}>
                <NumberInput
                  value={m.duration}
                  placeholder={700}
                  onChange={(v) => set({ duration: v })}
                  min={100}
                  max={4000}
                  step={50}
                  suffix="ms"
                  icon="clock"
                  ariaLabel={t('Dauer')}
                />
              </PropRow>
              <PropRow label={t('Verzögerung')} state={m.delay !== undefined ? 'set' : 'none'} onReset={() => set({ delay: undefined })}>
                <NumberInput
                  value={m.delay}
                  placeholder={0}
                  onChange={(v) => set({ delay: v })}
                  min={0}
                  max={5000}
                  step={50}
                  suffix="ms"
                  icon="history"
                  ariaLabel={t('Verzögerung')}
                />
              </PropRow>
              {moves && (
                <PropRow label={t('Weg')} state={m.distance !== undefined ? 'set' : 'none'} onReset={() => set({ distance: undefined })}>
                  <NumberInput value={m.distance} placeholder={32} onChange={(v) => set({ distance: v })} min={0} max={400} step={4} suffix="px" icon="move" ariaLabel={t('Weg')} />
                </PropRow>
              )}
            </div>
            <PropRow label={t('Verlauf')} state={m.easing !== undefined ? 'set' : 'none'} onReset={() => set({ easing: undefined })}>
              <div className="dp-choice" role="group" aria-label={t('Verlauf')}>
                {easings().map((e) => (
                  <Tip key={e.value} label={e.label}>
                    <button
                      type="button"
                      aria-label={e.label}
                      aria-pressed={(m.easing ?? 'smooth') === e.value}
                      onClick={() => set({ easing: e.value === 'smooth' ? undefined : e.value })}
                    >
                      <svg viewBox="-1 -4 22 26" width="20" height="20" aria-hidden="true" className="mp-curve">
                        <path d={e.path} />
                      </svg>
                    </button>
                  </Tip>
                ))}
              </div>
            </PropRow>
            {target === 'block' && (
              <div className="mp-switch">
                <span>
                  <strong>{t('Nacheinander')}</strong>
                  <span className="xsmall muted">{t('Karten, Zeilen und Bilder kommen eines nach dem anderen.')}</span>
                </span>
                <Switch checked={Boolean(m.stagger)} onChange={(v) => set({ stagger: v ? 90 : undefined })} label={t('Nacheinander')} />
              </div>
            )}
            {Boolean(m.stagger) && (
              <PropRow label={t('Abstand')} state="set">
                <NumberInput
                  value={m.stagger}
                  onChange={(v) => set({ stagger: v || 90 })}
                  min={20}
                  max={1000}
                  step={10}
                  suffix="ms"
                  ariaLabel={t('Abstand zwischen den Elementen')}
                />
              </PropRow>
            )}
            <div className="mp-switch">
              <span>
                <strong>{t('Jedes Mal')}</strong>
                <span className="xsmall muted">{t('Spielt wieder, wenn man zurückscrollt.')}</span>
              </span>
              <Switch checked={Boolean(m.repeat)} onChange={(v) => set({ repeat: v || undefined })} label={t('Jedes Mal')} />
            </div>
            <button type="button" className="btn mp-play" onClick={onPlay}>
              <Icon name="play" size="s" /> {t('Abspielen')}
            </button>
          </>
        )}
      </DesignSection>

      <DesignSection id="motion-scroll" title={t('Beim Scrollen')} icon="scroll" count={m.scroll ? 1 : 0}>
        <Tiles label={t('Was beim Scrollen passiert')}>
          {scrollEffects().map((e) => (
            <Tile
              key={e.value}
              kind="scroll"
              value={e.value}
              label={e.label}
              active={(m.scroll ?? '') === e.value}
              onClick={() => set({ scroll: (e.value || undefined) as ScrollEffect | undefined })}
            />
          ))}
        </Tiles>
        {m.scroll && (
          <PropRow label={t('Stärke')} state={m.scrollStrength !== undefined ? 'set' : 'none'} onReset={() => set({ scrollStrength: undefined })}>
            <div className="mp-range">
              <input type="range" min={1} max={100} value={m.scrollStrength ?? 30} onChange={(e) => set({ scrollStrength: Number(e.target.value) })} aria-label={t('Stärke')} />
              <span className="mono">{m.scrollStrength ?? 30}</span>
            </div>
          </PropRow>
        )}
        {m.scroll && <p className="xsmall faint">{t('Im Editor sichtbar, sobald du in der Seite scrollst.')}</p>}
      </DesignSection>

      {target === 'block' && (
        <DesignSection id="motion-hover" title={t('Karten bei Hover')} icon="cursor" count={m.itemHover ? 1 : 0}>
          <Tiles label={t('Wie Karten auf die Maus reagieren')}>
            {hoverEffects().map((e) => (
              <Tile
                key={e.value}
                kind="hover"
                value={e.value}
                label={e.label}
                active={(m.itemHover ?? '') === e.value}
                onClick={() => set({ itemHover: (e.value || undefined) as ItemHover | undefined })}
              />
            ))}
          </Tiles>
          <p className="xsmall faint">{t('Gilt für die Karten, Zeilen oder Bilder im Block – probier es im Editor mit der Maus aus.')}</p>
        </DesignSection>
      )}
      <p className="dp-note">
        <Icon name="info" size="s" />
        {t('Wer in den Einstellungen des Geräts «Bewegung reduzieren» gewählt hat, sieht alles sofort und ohne Animation.')}
      </p>
    </div>
  );
}

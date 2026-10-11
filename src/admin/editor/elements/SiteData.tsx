import { useState } from 'react';
import { t } from '../../lib/i18n';
import { Field } from '../../ui/kit';
import { MediaField } from '../../ui/FieldInput';
import { HoursEditor } from '../../ui/HoursEditor';
import { useSettingsDraft } from '../../views/settingsDraft';
import { FooterEditor, MenuEditor, SocialEditor } from '../../views/NavEditors';
import { siteDataOf, type El, type SiteKey } from '../../../shared/elements';

/** «Speichern – auf allen Seiten» under website data edited in the page editor. */
export function SiteSaveBar({ save, reset, onSaved }: { save: () => Promise<boolean>; reset: () => void; onSaved?: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="panel-save">
      <button className="btn ghost s" onClick={reset} disabled={busy}>
        {t('Verwerfen')}
      </button>
      <button
        className="btn primary s"
        aria-busy={busy || undefined}
        onClick={async () => {
          setBusy(true);
          try {
            if (await save()) onSaved?.();
          } finally {
            setBusy(false);
          }
        }}
      >
        {t('Speichern – auf allen Seiten')}
      </button>
    </div>
  );
}

/**
 * The website's name, contact, logo, opening hours or menus – edited right at
 * the element that shows them. They are the website's settings: saved, they
 * change on every page.
 */
export function SiteData({ el, onSaved }: { el: El; onSaved?: () => void }) {
  const { draft, set, dirty, save, reset } = useSettingsDraft();
  const keys = siteDataOf(el);
  if (!keys.length || !draft) return null;
  const has = (k: SiteKey) => keys.includes(k);
  const b = draft.business;
  const setB = (patch: Partial<typeof b>) => set('business', { ...b, ...patch });
  return (
    <>
      <details className="bind-box site-data" open>
        <summary className="section-title">{t('Website-Daten – gelten auf allen Seiten')}</summary>
        <div className="stack tight">
          {has('name') && (
            <Field label={t('Name der Website')}>
              <input className="input" value={draft.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
          )}
          {has('logo') && (
            <Field label={t('Logo')} help={t('Ohne Logo steht der Name in der Kopfzeile.')}>
              <MediaField value={draft.logo} type="image" onChange={(v) => set('logo', v)} />
            </Field>
          )}
          {has('tagline') && (
            <Field label={t('Kurzbeschreibung')}>
              <input className="input" value={draft.tagline} onChange={(e) => set('tagline', e.target.value)} />
            </Field>
          )}
          {has('phone') && (
            <Field label={t('Telefon')}>
              <input className="input" type="tel" value={b.phone} onChange={(e) => setB({ phone: e.target.value })} />
            </Field>
          )}
          {has('email') && (
            <Field label={t('E-Mail')} help={t('Hierhin gehen auch Formular-Benachrichtigungen.')}>
              <input className="input" type="email" value={b.email} onChange={(e) => setB({ email: e.target.value })} />
            </Field>
          )}
          {has('address') && (
            <>
              <Field label={t('Strasse und Nr.')}>
                <input className="input" value={b.street} onChange={(e) => setB({ street: e.target.value })} autoComplete="street-address" />
              </Field>
              <div className="grid-2" style={{ gridTemplateColumns: '5.5rem 1fr', gap: '0.5rem' }}>
                <Field label={t('PLZ')}>
                  <input className="input" value={b.zip} onChange={(e) => setB({ zip: e.target.value })} inputMode="numeric" />
                </Field>
                <Field label={t('Ort')}>
                  <input className="input" value={b.city} onChange={(e) => setB({ city: e.target.value })} />
                </Field>
              </div>
            </>
          )}
          {has('legal') && (
            <Field label={t('Firmenname (offiziell)')} help={t('Leer = der Name der Website.')}>
              <input className="input" value={b.legalName} placeholder={draft.name} onChange={(e) => setB({ legalName: e.target.value })} />
            </Field>
          )}
          {has('hours') && (
            <>
              <span className="section-title">{t('Öffnungszeiten')}</span>
              <div className="site-hours">
                <HoursEditor hours={draft.hours} onChange={(h) => set('hours', h)} />
              </div>
              <Field label={t('Hinweis zu den Zeiten')} help={t('z. B. «Betriebsferien 20. Juli bis 10. August»')}>
                <input className="input" value={draft.hoursNote} onChange={(e) => set('hoursNote', e.target.value)} />
              </Field>
            </>
          )}
          {(has('nav') || has('footer')) && (
            <>
              {has('nav') && <MenuEditor nav={draft.nav} onChange={(n) => set('nav', n)} />}
              {has('footer') && <FooterEditor footer={draft.footer} onChange={(f) => set('footer', f)} />}
            </>
          )}
          {has('social') && <SocialEditor social={draft.social} onChange={(v) => set('social', v)} />}
        </div>
      </details>
      {dirty && <SiteSaveBar save={save} reset={reset} onSaved={onSaved} />}
    </>
  );
}

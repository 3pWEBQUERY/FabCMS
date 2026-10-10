import { useState } from 'react';
import { api } from '../lib/api';
import { t, tl } from '../lib/i18n';
import { Icon } from '../ui/icons';
import { Dialog, Field, PageHead, Segmented, Skeleton, Toggle } from '../ui/kit';
import { useToast } from '../ui/toast';
import { MAIL_KINDS, type MailText } from '../../shared/mails';
import { langInfo, siteLangs, type Lang } from '../../shared/i18n';
import type { SiteSettings } from '../../shared/types';
import { SaveBar, useSettingsDraft } from './settingsDraft';

const EMPTY: SiteSettings['mail'] = { logo: true, color: '', signature: '', footer: '', texts: {} };

/**
 * The look of the mails to customers (logo, colour, signature, footer) and,
 * per kind of mail and language, an own subject and texts around what Nova
 * fills in itself – with a preview of the result.
 */
export function MailSettings() {
  const toast = useToast();
  const { draft, set, dirty, save, reset } = useSettingsDraft();
  const [open, setOpen] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang | null>(null);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  if (!draft) return <Skeleton />;
  const mail = { ...EMPTY, ...draft.mail };
  const langs = siteLangs(draft);
  const l = lang && langs.includes(lang) ? lang : langs[0];
  const setMail = (patch: Partial<SiteSettings['mail']>) => set('mail', { ...mail, ...patch });
  const textOf = (kind: string): MailText => mail.texts[kind]?.[l] ?? {};
  const setText = (kind: string, patch: MailText) => setMail({ texts: { ...mail.texts, [kind]: { ...mail.texts[kind], [l]: { ...textOf(kind), ...patch } } } });
  const kinds = MAIL_KINDS.filter((k) => !k.module || draft.modules.includes(k.module));

  const show = async (kind: string) => {
    try {
      setPreview(await api.post<{ subject: string; html: string }>('/api/mail/preview', { kind, lang: l, mail }));
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  const test = async (kind: string) => {
    try {
      const r = await api.post<{ ok: boolean; configured: boolean }>('/api/mail/test', { kind });
      toast(
        r.ok ? t('Testmail ist unterwegs – mit den gespeicherten Texten.') : r.configured ? t('Versand hat nicht geklappt.') : t('Für den Mailversand fehlt noch die Einrichtung.'),
        { kind: r.ok ? 'info' : 'bad' },
      );
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };

  return (
    <>
      <PageHead title={t('E-Mails')} sub={t('So sehen die Mails an Kundinnen und Kunden aus: Bestellungen, Reservationen, Tickets, Spenden, Konto.')} />
      <div className="stack loose">
        <section className="card form-section">
          <h2 className="section-title">{t('Aussehen')}</h2>
          <Toggle
            checked={mail.logo}
            onChange={(v) => setMail({ logo: v })}
            label={t('Logo oben statt Name')}
            help={draft.logo ? undefined : t('Lade zuerst unter «Name, Logo & Kontakt» ein Logo hoch.')}
          />
          <Field label={t('Farbe für Linie und Knöpfe')} htmlFor="ml-color" help={t('Leer lassen für die Farbe des Designs.')}>
            <div className="row">
              <input type="color" aria-label={t('Farbe wählen')} value={mail.color || '#1c1b19'} onChange={(e) => setMail({ color: e.target.value })} />
              <input
                id="ml-color"
                className="input mono"
                style={{ maxWidth: '9rem' }}
                value={mail.color}
                placeholder="#1c1b19"
                onChange={(e) => setMail({ color: e.target.value.trim() })}
              />
              {mail.color && (
                <button type="button" className="btn ghost s" onClick={() => setMail({ color: '' })}>
                  {t('Wie das Design')}
                </button>
              )}
            </div>
          </Field>
          <Field label={t('Gruss am Schluss')} htmlFor="ml-sign" help={t('Leer = Name der Website.')}>
            <textarea
              id="ml-sign"
              className="textarea"
              rows={2}
              maxLength={300}
              value={mail.signature}
              placeholder={draft.name}
              onChange={(e) => setMail({ signature: e.target.value })}
            />
          </Field>
          <Field label={t('Fusszeile')} htmlFor="ml-foot" help={t('Steht klein unter jeder Mail, über der Adresse – z. B. Öffnungszeiten oder Telefon.')}>
            <textarea id="ml-foot" className="textarea" rows={2} maxLength={500} value={mail.footer} onChange={(e) => setMail({ footer: e.target.value })} />
          </Field>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>{t('Texte pro Mail')}</h2>
            {langs.length > 1 && <Segmented label={t('Sprache')} value={l} onChange={(v) => setLang(v)} options={langs.map((x) => ({ value: x, label: langInfo(x).native }))} />}
          </div>
          <p className="small muted card-pad" style={{ paddingTop: 0 }}>
            {t('Nova füllt Bestellzeilen, Daten und Links selbst ein. Davor und danach kannst du eigene Sätze schreiben; leer bleibt Novas Text.')}
          </p>
          <ul className="ml-list">
            {kinds.map((k) => {
              const own = textOf(k.id);
              const custom = Boolean(own.subject || own.intro || own.outro);
              return (
                <li key={k.id}>
                  <button type="button" className="ml-head" aria-expanded={open === k.id} onClick={() => setOpen(open === k.id ? null : k.id)}>
                    <Icon name={open === k.id ? 'chevronDown' : 'chevronRight'} size="s" />
                    <span className="grow">
                      <span className="ml-name">{tl(k.label)}</span>
                      <span className="xsmall muted">{tl(k.when)}</span>
                    </span>
                    {custom && <span className="badge">{t('eigene Texte')}</span>}
                  </button>
                  {open === k.id && (
                    <div className="ml-body stack">
                      <Field label={t('Betreff')} htmlFor={`ml-s-${k.id}`} help={t('Leer = Novas Betreff.')}>
                        <input id={`ml-s-${k.id}`} className="input" maxLength={200} value={own.subject ?? ''} onChange={(e) => setText(k.id, { subject: e.target.value })} />
                      </Field>
                      <Field label={t('Text nach der Anrede')} htmlFor={`ml-i-${k.id}`}>
                        <textarea
                          id={`ml-i-${k.id}`}
                          className="textarea"
                          rows={3}
                          maxLength={2000}
                          value={own.intro ?? ''}
                          onChange={(e) => setText(k.id, { intro: e.target.value })}
                        />
                      </Field>
                      <Field label={t('Text vor dem Gruss')} htmlFor={`ml-o-${k.id}`}>
                        <textarea
                          id={`ml-o-${k.id}`}
                          className="textarea"
                          rows={3}
                          maxLength={2000}
                          value={own.outro ?? ''}
                          onChange={(e) => setText(k.id, { outro: e.target.value })}
                        />
                      </Field>
                      <p className="xsmall muted">
                        {t('Platzhalter:')}{' '}
                        {[...k.vars, 'site'].map((v) => (
                          <code key={v} className="ml-var">{`{${v}}`}</code>
                        ))}
                      </p>
                      <div className="row">
                        <button type="button" className="btn s" onClick={() => void show(k.id)}>
                          <Icon name="eye" size="s" /> {t('Vorschau')}
                        </button>
                        <button type="button" className="btn s ghost" disabled={dirty} title={dirty ? t('Zuerst speichern') : undefined} onClick={() => void test(k.id)}>
                          <Icon name="mail" size="s" /> {t('Testmail an mich')}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      <SaveBar dirty={dirty} onSave={save} onReset={reset} />
      <Dialog open={Boolean(preview)} onOpenChange={(o) => !o && setPreview(null)} title={preview?.subject ?? ''} description={t('Vorschau mit Beispielangaben')} wide>
        {preview && <iframe className="ml-frame" title={t('Vorschau')} sandbox="" srcDoc={preview.html} />}
      </Dialog>
    </>
  );
}

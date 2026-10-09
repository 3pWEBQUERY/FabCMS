import { api } from '../lib/api';
import { navigate, usePath } from '../lib/router';
import { useSession } from '../lib/session';
import { Menu, confirm } from './kit';
import { Icon } from './icons';
import { useToast } from './toast';
import { defaultLang, extraLangs, langInfo, type Lang } from '../../shared/i18n';
import type { EntryDoc } from '../lib/useEntryDoc';
import { t, tl } from '../lib/i18n';

/** Language being edited, from ?sprache=fr; null = main language. */
export function useEditLang(): string | null {
  const { query } = usePath();
  const { settings } = useSession();
  const l = query.get('sprache');
  return settings && l && extraLangs(settings).includes(l as Lang) ? l : null;
}

const here = () => location.pathname.replace(/^\/admin/, '') || '/';

/** «DE ▾» in the editor bar: switch language, see what is translated. */
export function LangSwitch({ doc }: { doc: EntryDoc }) {
  const { settings } = useSession();
  const toast = useToast();
  if (!settings || !extraLangs(settings).length || !doc.entry) return null;
  const main = defaultLang(settings);
  const current = (doc.lang ?? main) as Lang;
  const state = (l: Lang) => {
    if (l === main) return t('Original');
    const tr = doc.translations.find((x) => x.lang === l);
    return !tr ? t('noch nicht übersetzt') : tr.status === 'published' ? (tr.changed ? t('veröffentlicht, mit Änderungen') : t('veröffentlicht')) : t('Entwurf');
  };
  const go = async (l: Lang) => {
    if (!(await doc.saveNow())) return;
    navigate(l === main ? here() : `${here()}?sprache=${l}`);
  };
  return (
    <Menu
      align="end"
      trigger={
        <button className="btn ghost lang-btn" aria-label={t('Sprache: {name}', { name: tl(langInfo(current).name) })}>
          <Icon name="globe" size="s" />
          <span>{current.toUpperCase()}</span>
          <Icon name="chevronDown" size="s" />
        </button>
      }
      items={[
        ...[main, ...extraLangs(settings)].map((l) => ({
          label: `${l === current ? '✓ ' : ''}${langInfo(l).native} – ${state(l)}`,
          onSelect: () => void go(l),
        })),
        ...(doc.lang && doc.entry.translated
          ? [
              'sep' as const,
              {
                label: t('Übersetzung löschen'),
                icon: 'trash',
                danger: true,
                onSelect: async () => {
                  if (
                    !(await confirm({
                      title: t('Übersetzung {name} löschen?', { name: tl(langInfo(doc.lang!).name) }),
                      message: t('Die Seite erscheint in dieser Sprache danach wieder in der Hauptsprache.'),
                      confirm: t('Löschen'),
                      danger: true,
                    }))
                  )
                    return;
                  await api.del(`/api/entries/${doc.entry!.id}/translations/${doc.lang}`);
                  toast(t('Übersetzung gelöscht.'));
                  navigate(here());
                },
              },
            ]
          : []),
      ]}
    />
  );
}

/** Banner above the form or canvas while a translation is edited. */
export function TranslationNote({ doc }: { doc: EntryDoc }) {
  if (!doc.lang || !doc.entry) return null;
  const name = tl(langInfo(doc.lang).name);
  return (
    <p className="hint translation-note" role="note">
      <Icon name="globe" />
      <span>
        <strong>{t('Fassung auf {name}.', { name })}</strong>{' '}
        {doc.entry.translated
          ? t('Du änderst nur die Texte dieser Sprache.')
          : t('Noch nicht übersetzt – die Texte stammen aus dem Original. Sobald du etwas änderst, entsteht die Übersetzung.')}{' '}
        {t('Preise, Bilder, Daten und Einstellungen kommen vom Original.')}
        {doc.original && doc.original.status !== 'published' ? ` ${t('Das Original ist noch nicht veröffentlicht – die Übersetzung geht mit ihm online.')}` : ''}
      </span>
    </p>
  );
}

/** Small language marks in lists: filled = online, outlined = draft, faint = not translated yet. */
export function LangBadges({ translations }: { translations?: { lang: string; status: string; changed?: boolean }[] }) {
  const { settings } = useSession();
  if (!settings) return null;
  const langs = extraLangs(settings);
  if (!langs.length) return null;
  return (
    <span className="lang-badges">
      {langs.map((l) => {
        const tr = translations?.find((x) => x.lang === l);
        const state = !tr ? 'none' : tr.status === 'published' ? 'live' : 'draft';
        const title = t('{lang}: {state}', {
          lang: tl(langInfo(l).name),
          state: !tr ? t('noch nicht übersetzt') : tr.status === 'published' ? (tr.changed ? t('online, mit Änderungen') : t('online')) : t('Entwurf'),
        });
        return (
          <span key={l} className={`lang-badge ${state}`} title={title} aria-label={title}>
            {l.toUpperCase()}
          </span>
        );
      })}
    </span>
  );
}

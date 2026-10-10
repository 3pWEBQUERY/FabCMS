import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { api } from '../lib/api';
import { t } from '../lib/i18n';
import { useSession } from '../lib/session';
import { sanitizeRichText } from '../../shared/richtext';
import { Icon } from './icons';
import { Dialog, Menu } from './kit';
import { useToast } from './toast';
import { getAt, setAt, slotKey, type SlotKind, type SlotPath } from '../../shared/text-slots';
import { slugify } from '../../shared/text';
import type { EntryDoc } from '../lib/useEntryDoc';

/**
 * KI-Assistent in the admin. Every answer is shown as a suggestion next to
 * the field; nothing changes until someone presses «Übernehmen».
 */

const MODES = () =>
  [
    { id: 'clearer', label: t('Klarer') },
    { id: 'shorter', label: t('Kürzer') },
    { id: 'warmer', label: t('Persönlicher') },
    { id: 'formal', label: t('Sachlicher') },
    { id: 'fix', label: t('Rechtschreibung prüfen') },
  ] as const;
type Mode = ReturnType<typeof MODES>[number]['id'];

/** Whether the assistant is available here (key set and switched on). */
export function useAi(): boolean {
  const { bundle } = useSession();
  return Boolean(bundle?.system.ai && bundle.settings.ai?.enabled);
}

function SuggestionView({ text, kind }: { text: string; kind: SlotKind }) {
  if (kind === 'rich') return <div className="ai-text rich" dangerouslySetInnerHTML={{ __html: sanitizeRichText(text) }} />;
  return <div className="ai-text">{text}</div>;
}

function SuggestionCard({
  title,
  text,
  kind,
  busy,
  onApply,
  onAgain,
  onDismiss,
}: {
  title: string;
  text: string;
  kind: SlotKind;
  busy: boolean;
  onApply: () => void;
  onAgain: () => void;
  onDismiss: () => void;
}) {
  return (
    <motion.div
      className="ai-suggestion"
      role="region"
      aria-label={title}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }}
      transition={{ duration: 0.16 }}
    >
      <p className="ai-head">
        <Icon name="pen" size="s" /> {title}
      </p>
      <SuggestionView text={text} kind={kind} />
      <div className="row wrap">
        <button type="button" className="btn primary s" onClick={onApply}>
          {t('Übernehmen')}
        </button>
        <button type="button" className="btn ghost s" onClick={onAgain} aria-busy={busy || undefined}>
          <span>{t('Andere Variante')}</span>
        </button>
        <button type="button" className="btn ghost s" onClick={onDismiss}>
          {t('Verwerfen')}
        </button>
      </div>
    </motion.div>
  );
}

/** «Umformulieren» under a text field. */
export function AiRewrite({ value, kind, max, lang, onApply }: { value: string; kind: SlotKind; max?: number; lang?: string | null; onApply: (v: string) => void }) {
  const on = useAi();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ mode: Mode; text: string } | null>(null);
  const run = useRef(0);
  const toast = useToast();
  const empty = !(kind === 'rich' ? value.replace(/<[^>]+>/g, '') : value).trim();
  if (!on) return null;

  const ask = async (mode: Mode) => {
    const mine = ++run.current;
    setBusy(true);
    try {
      // The text is in the language being edited (?sprache=fr), otherwise in the main language.
      const textLang = lang ?? new URLSearchParams(location.search).get('sprache') ?? undefined;
      const r = await api.post<{ suggestion: string }>('/api/ai/rewrite', { text: value, kind, mode, lang: textLang, max });
      if (mine === run.current) setResult({ mode, text: r.suggestion });
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      if (mine === run.current) setBusy(false);
    }
  };
  const label = (m: Mode) => MODES().find((x) => x.id === m)!.label;

  return (
    <div className="ai-rewrite">
      {!result && (
        <Menu
          align="start"
          trigger={
            <button type="button" className="btn ghost s ai-trigger" disabled={empty} aria-busy={busy || undefined} title={empty ? t('Erst braucht es einen Text.') : undefined}>
              <Icon name="pen" size="s" />
              <span>{t('Umformulieren')}</span>
            </button>
          }
          items={MODES().map((m) => ({ label: m.label, onSelect: () => void ask(m.id) }))}
        />
      )}
      <AnimatePresence>
        {result && (
          <SuggestionCard
            title={t('Vorschlag: {how}', { how: label(result.mode) })}
            text={result.text}
            kind={kind}
            busy={busy}
            onApply={() => {
              onApply(result.text);
              setResult(null);
            }}
            onAgain={() => void ask(result.mode)}
            onDismiss={() => {
              run.current++;
              setBusy(false);
              setResult(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Alt text suggestion from the image itself. */
export function AiAlt({ media, onApply }: { media: string; onApply: (v: string) => void }) {
  const on = useAi();
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const toast = useToast();
  if (!on) return null;
  const ask = async () => {
    setBusy(true);
    try {
      setText((await api.post<{ suggestion: string }>('/api/ai/alt', { media })).suggestion);
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ai-rewrite">
      {text === null && (
        <button type="button" className="btn ghost s ai-trigger" onClick={() => void ask()} aria-busy={busy || undefined}>
          <Icon name="pen" size="s" />
          <span>{t('Beschreibung vorschlagen')}</span>
        </button>
      )}
      <AnimatePresence>
        {text !== null && (
          <SuggestionCard
            title={t('Vorschlag für die Bildbeschreibung')}
            text={text}
            kind="plain"
            busy={busy}
            onApply={() => {
              onApply(text);
              setText(null);
            }}
            onAgain={() => void ask()}
            onDismiss={() => setText(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

interface DraftItem {
  path: SlotPath;
  kind: SlotKind;
  source: string;
  text: string;
}
const plainText = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Translation draft for the language being edited: every text of the original, with a suggestion to pick. */
export function AiTranslate({ doc }: { doc: EntryDoc }) {
  const on = useAi();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<DraftItem[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const { entry, collection: col, lang, data } = doc;
  if (!on || !lang || !entry || !col || !data) return null;

  const load = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ items: DraftItem[] }>('/api/ai/translate', { entry: entry.id, lang });
      if (!r.items.length) return toast(t('Hier gibt es keine Texte zum Übersetzen.'));
      setItems(r.items);
      // Preselected: what still shows the original text. Texts someone already translated stay.
      setChosen(
        new Set(
          r.items
            .filter((it) => {
              const cur = getAt(data, it.path);
              return cur === undefined || cur === null || cur === '' || cur === it.source;
            })
            .map((it) => slotKey(it.path)),
        ),
      );
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    const pick = (items ?? []).filter((it) => chosen.has(slotKey(it.path)));
    const isTitle = (it: DraftItem) => it.path.length === 1 && (it.path[0] === col.title_field || it.path[0] === 'title');
    doc.setData((d) => {
      let next = d;
      for (const it of pick) {
        next = setAt(next, it.path, it.text);
        if (isTitle(it)) next = { ...next, title: it.text };
      }
      return next;
    });
    // Its own address in the new language, as long as it still has the original one.
    const title = pick.find(isTitle);
    if (title && col.route && doc.original && doc.slug === doc.original.slug) doc.setSlug(slugify(title.text));
    setItems(null);
    toast(t('{n} Texte übernommen. Lies sie durch, bevor du veröffentlichst.', { n: pick.length }));
  };

  const toggle = (k: string) =>
    setChosen((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <>
      <button type="button" className="btn s" onClick={() => void load()} aria-busy={busy || undefined}>
        <Icon name="pen" size="s" />
        <span>{t('Übersetzungsentwurf')}</span>
      </button>
      <Dialog
        open={items !== null}
        onOpenChange={(o) => !o && setItems(null)}
        wide
        title={t('Übersetzungsentwurf')}
        description={t(
          'Vorschläge vom KI-Assistenten. Wähl aus, was du übernehmen willst – danach kannst du alles wie gewohnt anpassen. Online geht erst etwas, wenn du veröffentlichst.',
        )}
      >
        <div className="ai-draft">
          {items?.map((it) => {
            const k = slotKey(it.path);
            return (
              <label key={k} className="ai-draft-row">
                <input type="checkbox" checked={chosen.has(k)} onChange={() => toggle(k)} />
                <span className="ai-draft-body">
                  <span className="xsmall muted ai-source">{plainText(it.source)}</span>
                  <SuggestionView text={it.text} kind={it.kind} />
                </span>
              </label>
            );
          })}
        </div>
        <div className="row wrap" style={{ marginTop: '1rem', justifyContent: 'space-between' }}>
          <div className="row">
            <button type="button" className="btn ghost s" onClick={() => setChosen(new Set((items ?? []).map((it) => slotKey(it.path))))}>
              {t('Alle')}
            </button>
            <button type="button" className="btn ghost s" onClick={() => setChosen(new Set())}>
              {t('Keine')}
            </button>
          </div>
          <div className="row">
            <button type="button" className="btn ghost" onClick={() => setItems(null)}>
              {t('Abbrechen')}
            </button>
            <button type="button" className="btn primary" disabled={!chosen.size} onClick={apply}>
              {t('{n} übernehmen', { n: chosen.size })}
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

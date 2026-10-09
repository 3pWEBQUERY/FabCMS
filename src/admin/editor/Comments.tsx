import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { adminLang, t, tl } from '../lib/i18n';
import { confirm } from '../ui/kit';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/toast';
import { relativeTime } from '../../shared/text';
import { BLOCK_MAP } from '../../shared/blocks';
import type { Block } from '../../shared/types';

export interface EntryComment {
  id: string;
  block_id: string | null;
  parent_id: string | null;
  body: string;
  author_id: string | null;
  author_name: string | null;
  resolved_at: string | null;
  resolved_by_name: string | null;
  created_at: string;
  updated_at: string;
}
interface Person {
  id: string;
  name: string;
}

/** Comments of one entry, reloaded every 15 s and when the tab comes back. */
export function useComments(entryId: string | null) {
  const [comments, setComments] = useState<EntryComment[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const reload = useCallback(async () => {
    if (!entryId) return;
    try {
      const r = await api.get<{ comments: EntryComment[]; people: Person[] }>(`/api/entries/${entryId}/comments`);
      setComments(r.comments);
      setPeople(r.people);
    } catch {
      /* offline or no rights: keep what we have */
    }
  }, [entryId]);
  useEffect(() => {
    void reload();
    const timer = setInterval(() => document.visibilityState === 'visible' && void reload(), 15_000);
    const onVisible = () => document.visibilityState === 'visible' && void reload();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload]);
  /** Open threads per block, for the bubbles on the canvas. */
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of comments) if (!c.parent_id && !c.resolved_at && c.block_id) out[c.block_id] = (out[c.block_id] ?? 0) + 1;
    return out;
  }, [comments]);
  const open = comments.filter((c) => !c.parent_id && !c.resolved_at).length;
  return { comments, people, reload, counts, open };
}

/** Text with @mentions highlighted. */
function Body({ text, people }: { text: string; people: Person[] }) {
  const parts: ReactNode[] = [];
  const names = people.map((p) => p.name).sort((a, b) => b.length - a.length);
  let rest = text;
  let key = 0;
  while (rest) {
    const at = rest.search(/(^|[\s(])@/);
    if (at < 0) {
      parts.push(rest);
      break;
    }
    const start = rest[at] === '@' ? at : at + 1;
    parts.push(rest.slice(0, start));
    const after = rest.slice(start + 1);
    const name =
      names.find((n) => after.toLowerCase().startsWith(n.toLowerCase())) ?? names.find((n) => after.toLowerCase().startsWith(n.split(' ')[0].toLowerCase()))?.split(' ')[0];
    if (name) {
      parts.push(
        <span key={key++} className="mention">
          @{after.slice(0, name.length)}
        </span>,
      );
      rest = after.slice(name.length);
    } else {
      parts.push('@');
      rest = after;
    }
  }
  return <p className="cmt-body">{parts}</p>;
}

/** Textarea with @mention suggestions. */
function Composer({
  people,
  placeholder,
  onSend,
  autoFocus,
  initial = '',
  submitLabel,
}: {
  people: Person[];
  placeholder: string;
  onSend: (body: string) => Promise<void>;
  autoFocus?: boolean;
  initial?: string;
  submitLabel: string;
}) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const caret = ref.current?.selectionStart ?? text.length;
  const query = /(?:^|[\s(])@([\p{L}'’-]*)$/u.exec(text.slice(0, caret))?.[1];
  const matches = query !== undefined ? people.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6) : [];
  const insert = (p: Person) => {
    const before = text.slice(0, caret).replace(/@([\p{L}'’-]*)$/u, `@${p.name} `);
    const next = before + text.slice(caret);
    setText(next);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(before.length, before.length);
    });
  };
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await onSend(text.trim());
      setText('');
    } finally {
      setBusy(false);
    }
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (matches.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setPick((i) => (i + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length);
    } else if (matches.length && (e.key === 'Enter' || e.key === 'Tab')) {
      e.preventDefault();
      insert(matches[Math.min(pick, matches.length - 1)]);
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  };
  return (
    <div className="cmt-composer">
      <textarea
        ref={ref}
        className="textarea"
        rows={2}
        value={text}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => {
          setText(e.target.value);
          setPick(0);
        }}
        onKeyDown={onKey}
        aria-label={placeholder}
      />
      {matches.length > 0 && (
        <ul className="cmt-mentions" role="listbox" aria-label={t('Person erwähnen')}>
          {matches.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === pick}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(p)}>
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="row between">
        <span className="xsmall faint">{t('@Name erwähnt jemanden · ⌘↵ sendet')}</span>
        <button className="btn s primary" onClick={() => void send()} disabled={!text.trim() || busy} data-busy={busy || undefined}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * Comments panel: new comment (on the selected block or the whole page),
 * open threads first, then the resolved ones.
 */
export function CommentsPanel({
  entryId,
  data,
  blocks,
  selectedBlock,
  focus,
  onSelectBlock,
}: {
  entryId: string;
  data: ReturnType<typeof useComments>;
  blocks: Block[];
  selectedBlock: string | null;
  focus?: string | null;
  onSelectBlock?: (id: string) => void;
}) {
  const { user } = useSession();
  const toast = useToast();
  const [onBlock, setOnBlock] = useState(Boolean(selectedBlock));
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  useEffect(() => setOnBlock(Boolean(selectedBlock)), [selectedBlock]);
  useEffect(() => {
    if (!focus) return;
    const root = data.comments.find((c) => c.id === focus);
    if (root?.resolved_at) setShowDone(true);
    requestAnimationFrame(() => document.getElementById(`cmt-${focus}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }, [focus, data.comments]);

  const blockName = (id: string | null) => {
    if (!id) return t('Ganze Seite');
    const b = blocks.find((x) => x.id === id);
    if (!b) return t('Entfernter Block');
    const heading = (b.props as { heading?: string; title?: string }).heading || (b.props as { title?: string }).title;
    return heading
      ? `${tl(BLOCK_MAP[b.type]?.label ?? b.type)} «${String(heading)
          .replace(/<[^>]+>/g, '')
          .slice(0, 40)}»`
      : tl(BLOCK_MAP[b.type]?.label ?? b.type);
  };
  const roots = data.comments.filter((c) => !c.parent_id);
  // Threads in page order: whole-page comments first, then by block position.
  const order = (c: EntryComment) => (c.block_id ? blocks.findIndex((b) => b.id === c.block_id) + 1 || 9999 : 0);
  const open = roots.filter((c) => !c.resolved_at).sort((a, b) => order(a) - order(b) || a.created_at.localeCompare(b.created_at));
  const done = roots.filter((c) => c.resolved_at).sort((a, b) => b.resolved_at!.localeCompare(a.resolved_at!));
  const replies = (id: string) => data.comments.filter((c) => c.parent_id === id);

  const post = async (body: string, extra: { blockId?: string | null; parentId?: string }) => {
    try {
      await api.post(`/api/entries/${entryId}/comments`, { body, ...extra });
      setReplyTo(null);
      await data.reload();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
      throw e;
    }
  };
  const patch = async (id: string, body: Record<string, unknown>) => {
    try {
      await api.patch(`/api/entry-comments/${id}`, body);
      await data.reload();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  const remove = async (c: EntryComment) => {
    if (!(await confirm({ title: t('Kommentar löschen?'), message: c.parent_id ? undefined : t('Die Antworten werden mitgelöscht.'), confirm: t('Löschen'), danger: true })))
      return;
    await api.del(`/api/entry-comments/${c.id}`);
    await data.reload();
  };

  const item = (c: EntryComment, root: boolean) => (
    <div key={c.id} id={`cmt-${c.id}`} className={`cmt${focus === c.id ? ' focus' : ''}`}>
      <div className="cmt-head">
        <strong>{c.author_name ?? t('Gelöschte Person')}</strong>
        <span className="xsmall faint">
          {relativeTime(c.created_at, new Date(), adminLang())}
          {c.updated_at !== c.created_at ? ` · ${t('bearbeitet')}` : ''}
        </span>
      </div>
      {editing === c.id ? (
        <Composer
          people={data.people}
          initial={c.body}
          autoFocus
          placeholder={t('Kommentar bearbeiten')}
          submitLabel={t('Speichern')}
          onSend={async (body) => {
            await patch(c.id, { body });
            setEditing(null);
          }}
        />
      ) : (
        <Body text={c.body} people={data.people} />
      )}
      <div className="cmt-actions">
        {root && (
          <button className="linkish xsmall" onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}>
            {t('Antworten')}
          </button>
        )}
        {root && (
          <button className="linkish xsmall" onClick={() => void patch(c.id, { resolved: !c.resolved_at })}>
            {c.resolved_at ? t('Wieder öffnen') : t('Erledigt')}
          </button>
        )}
        {c.author_id === user.id && editing !== c.id && (
          <button className="linkish xsmall" onClick={() => setEditing(c.id)}>
            {t('Bearbeiten')}
          </button>
        )}
        {c.author_id === user.id && (
          <button className="linkish xsmall" onClick={() => void remove(c)}>
            {t('Löschen')}
          </button>
        )}
      </div>
    </div>
  );

  const thread = (c: EntryComment) => (
    <li key={c.id} className={`cmt-thread${c.resolved_at ? ' done' : ''}`}>
      <button className="cmt-anchor" disabled={!c.block_id || !onSelectBlock} onClick={() => c.block_id && onSelectBlock?.(c.block_id)}>
        <Icon name={c.block_id ? 'layers' : 'page'} size="s" />
        <span className="ellipsis">{blockName(c.block_id)}</span>
      </button>
      {item(c, true)}
      {replies(c.id).map((r) => item(r, false))}
      {c.resolved_at && (
        <p className="xsmall faint">
          {t('Erledigt von {name}', { name: c.resolved_by_name ?? '–' })} · {relativeTime(c.resolved_at, new Date(), adminLang())}
        </p>
      )}
      {replyTo === c.id && (
        <Composer people={data.people} autoFocus placeholder={t('Antwort schreiben …')} submitLabel={t('Antworten')} onSend={(body) => post(body, { parentId: c.id })} />
      )}
    </li>
  );

  return (
    <div className="stack comments-panel">
      <div className="cmt-new">
        {selectedBlock && (
          <div className="cmt-target" role="radiogroup" aria-label={t('Kommentar zu')}>
            <button role="radio" aria-checked={onBlock} className="chip" onClick={() => setOnBlock(true)}>
              {blockName(selectedBlock)}
            </button>
            <button role="radio" aria-checked={!onBlock} className="chip" onClick={() => setOnBlock(false)}>
              {t('Ganze Seite')}
            </button>
          </div>
        )}
        <Composer
          people={data.people}
          placeholder={onBlock && selectedBlock ? t('Kommentar zu diesem Block …') : t('Kommentar zur ganzen Seite …')}
          submitLabel={t('Kommentieren')}
          onSend={(body) => post(body, { blockId: onBlock ? selectedBlock : null })}
        />
      </div>
      {!open.length && (
        <p className="small muted">{roots.length ? t('Alles erledigt.') : t('Noch keine Kommentare. Wähl einen Block und schreib etwas – mit @Name holst du jemanden dazu.')}</p>
      )}
      <ul className="cmt-list">{open.map(thread)}</ul>
      {done.length > 0 && (
        <>
          <button className="linkish small" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
            {showDone ? t('Erledigte ausblenden') : done.length === 1 ? t('1 erledigtes Gespräch') : t('{n} erledigte Gespräche', { n: done.length })}
          </button>
          {showDone && <ul className="cmt-list">{done.map(thread)}</ul>}
        </>
      )}
    </div>
  );
}

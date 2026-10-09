import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { t } from '../lib/i18n';
import { normalizeLinkInput, sanitizeRichText } from '../../shared/richtext';

/**
 * Small rich text editor for forms (the canvas edits rich text in place).
 * Same whitelist as the server: paragraphs, h2–h4, bold, italic, links, lists, quotes.
 */
export function RichText({ value, onChange, id, minHeight = 7 }: { value: string; onChange: (v: string) => void; id?: string; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef(value);
  useEffect(() => {
    if (ref.current && value !== last.current) {
      ref.current.innerHTML = value || '';
      last.current = value;
    }
  }, [value]);
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = value || '';
  }, []);
  const emit = () => {
    const html = sanitizeRichText(ref.current?.innerHTML ?? '');
    last.current = html;
    onChange(html);
  };
  const cmd = (c: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(c, false, arg);
    emit();
  };
  // Own link field in the toolbar instead of the browser's prompt(); the selection is kept meanwhile.
  const [linking, setLinking] = useState(false);
  const [href, setHref] = useState('');
  const saved = useRef<Range | null>(null);
  const link = () => {
    const sel = document.getSelection();
    if (!sel?.rangeCount || !ref.current?.contains(sel.anchorNode)) return ref.current?.focus();
    saved.current = sel.getRangeAt(0).cloneRange();
    const n = saved.current.startContainer;
    setHref((n.nodeType === 1 ? (n as Element) : n.parentElement)?.closest('a')?.getAttribute('href') ?? '');
    setLinking(true);
  };
  const finishLink = (apply: 'set' | 'remove' | null) => {
    setLinking(false);
    const sel = document.getSelection();
    if (saved.current && sel) {
      ref.current?.focus();
      sel.removeAllRanges();
      sel.addRange(saved.current);
    }
    saved.current = null;
    const url = normalizeLinkInput(href);
    if (apply === 'set' && url) cmd('createLink', url);
    else if (apply) cmd('unlink');
  };
  return (
    <div className="rte">
      {linking ? (
        <div className="rte-bar rte-link">
          <input
            autoFocus
            value={href}
            placeholder={t('/kontakt oder https://…')}
            aria-label={t('Link-Adresse')}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                finishLink('set');
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                finishLink(null);
              }
            }}
          />
          <button type="button" className="rte-ok" onMouseDown={(e) => e.preventDefault()} onClick={() => finishLink('set')}>
            OK
          </button>
          <button type="button" className="rte-txt" onMouseDown={(e) => e.preventDefault()} onClick={() => finishLink('remove')}>
            {t('Entfernen')}
          </button>
          <button type="button" aria-label={t('Abbrechen')} onMouseDown={(e) => e.preventDefault()} onClick={() => finishLink(null)}>
            <Icon name="x" size="s" />
          </button>
        </div>
      ) : (
        <div className="rte-bar" role="toolbar" aria-label={t('Formatierung')}>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('bold')} aria-label={t('Fett')}>
            <strong>{t('F')}</strong>
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('italic')} aria-label={t('Kursiv')}>
            <em>{t('K')}</em>
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('formatBlock', 'h2')} aria-label={t('Zwischentitel')}>
            H2
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('formatBlock', 'h3')} aria-label={t('Kleiner Zwischentitel')}>
            H3
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('formatBlock', 'p')} aria-label={t('Absatz')}>
            ¶
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('insertUnorderedList')} aria-label={t('Liste')}>
            <Icon name="nav" size="s" />
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={link} aria-label={t('Link')}>
            <Icon name="link" size="s" />
          </button>
        </div>
      )}
      <div
        ref={ref}
        id={id}
        className="rte-body"
        contentEditable
        role="textbox"
        aria-multiline="true"
        suppressContentEditableWarning
        style={{ minHeight: `${minHeight}rem` }}
        onInput={emit}
        onPaste={(e) => {
          // Paste as clean text to keep Word/Docs styling out.
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
        }}
      />
    </div>
  );
}

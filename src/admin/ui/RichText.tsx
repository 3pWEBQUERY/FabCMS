import { useEffect, useRef } from 'react';
import { Icon } from './icons';
import { sanitizeRichText } from '../../shared/richtext';

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
  const link = () => {
    const url = prompt('Link-Adresse (z. B. /kontakt oder https://…)');
    if (url) cmd('createLink', url);
  };
  return (
    <div className="rte">
      <div className="rte-bar" role="toolbar" aria-label="Formatierung">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('bold')} aria-label="Fett">
          <strong>F</strong>
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('italic')} aria-label="Kursiv">
          <em>K</em>
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('formatBlock', 'h2')} aria-label="Zwischentitel">
          H2
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('formatBlock', 'h3')} aria-label="Kleiner Zwischentitel">
          H3
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('formatBlock', 'p')} aria-label="Absatz">
          ¶
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('insertUnorderedList')} aria-label="Liste">
          <Icon name="nav" size="s" />
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={link} aria-label="Link">
          <Icon name="link" size="s" />
        </button>
      </div>
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

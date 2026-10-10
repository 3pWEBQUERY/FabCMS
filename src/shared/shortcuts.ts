/**
 * Editor shortcuts, read the same way in the admin and inside the canvas.
 * By physical key (`code`): with Alt, a Mac types «ç» instead of «c».
 */
export type EditorAction = 'duplicate' | 'copy' | 'paste' | 'copy-style' | 'paste-style' | 'move-up' | 'move-down' | 'help';

export interface KeyLike {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export function shortcutAction(e: KeyLike, mac: boolean): EditorAction | null {
  const mod = mac ? e.metaKey : e.ctrlKey;
  if (mod && e.altKey && e.code === 'KeyC') return 'copy-style';
  if (mod && e.altKey && e.code === 'KeyV') return 'paste-style';
  if (mod && !e.altKey && !e.shiftKey && e.code === 'KeyD') return 'duplicate';
  if (mod && !e.altKey && !e.shiftKey && e.code === 'KeyC') return 'copy';
  if (mod && !e.altKey && !e.shiftKey && e.code === 'KeyV') return 'paste';
  if (e.altKey && !mod && e.key === 'ArrowUp') return 'move-up';
  if (e.altKey && !mod && e.key === 'ArrowDown') return 'move-down';
  if (!mod && !e.altKey && e.key === '?') return 'help';
  return null;
}

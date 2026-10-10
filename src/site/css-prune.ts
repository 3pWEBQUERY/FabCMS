/**
 * Drops the CSS rules a page cannot use. Nova's base and theme CSS covers
 * every block and module (about 80 KB); a page needs a fraction of it, and
 * the rest sits inline in the critical path. A rule goes only when each of
 * its selectors names a class that appears neither in the page nor anywhere
 * in the site's scripts (which add classes like «on», «paused», «lb» later).
 *
 * Deliberately conservative: classes inside :is()/:not()/:has() and attribute
 * selectors are not counted, at-rules other than @media/@supports/@container
 * stay untouched.
 */

/** Index of the brace closing the block that opens at `open`, skipping strings. */
function closing(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      const end = css.indexOf(ch, i + 1);
      if (end < 0) return css.length - 1;
      i = end;
    } else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i;
  }
  return css.length - 1;
}

/** Splits a selector list at top-level commas (not inside parentheses or brackets). */
function selectors(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      out.push(list.slice(start, i));
      start = i + 1;
    }
  }
  out.push(list.slice(start));
  return out;
}

/** Classes a selector needs for sure: outside brackets and parentheses. */
export function requiredClasses(selector: string): string[] {
  let s = selector.replace(/\[(?:[^\]"']|"[^"]*"|'[^']*')*\]/g, '');
  for (let prev = ''; prev !== s; ) {
    prev = s;
    s = s.replace(/\([^()]*\)/g, '');
  }
  return [...s.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
}

const alive = (selector: string, used: Set<string>) => requiredClasses(selector).every((c) => used.has(c));

export function pruneCss(css: string, used: Set<string>): string {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const brace = css.indexOf('{', i);
    const semi = css.indexOf(';', i);
    // Statements without a block (@import, @charset, stray semicolons) stay as they are.
    if (brace < 0 || (semi >= 0 && semi < brace)) {
      if (brace < 0) {
        out += css.slice(i);
        break;
      }
      out += css.slice(i, semi + 1);
      i = semi + 1;
      continue;
    }
    const end = closing(css, brace);
    const prelude = css.slice(i, brace).trim();
    const body = css.slice(brace + 1, end);
    i = end + 1;
    if (prelude.startsWith('@')) {
      if (/^@(media|supports|container|layer)\b/.test(prelude)) {
        const inner = pruneCss(body, used);
        if (inner.trim()) out += `${prelude}{${inner}}`;
      } else out += `${prelude}{${body}}`;
      continue;
    }
    const keep = selectors(prelude).filter((sel) => alive(sel, used));
    if (keep.length) out += `${keep.join(',')}{${body}}`;
  }
  return out;
}

/** Every class attribute value in a piece of HTML. */
export function htmlClasses(html: string, into = new Set<string>()): Set<string> {
  for (const m of html.matchAll(/\sclass="([^"]*)"/g)) for (const c of m[1].split(/\s+/)) if (c) into.add(c);
  return into;
}

/** Every word in the site's scripts – anything a script could put into a class attribute. */
export function scriptWords(code: string, into = new Set<string>()): Set<string> {
  for (const m of code.matchAll(/[A-Za-z_][\w-]*/g)) into.add(m[0]);
  return into;
}

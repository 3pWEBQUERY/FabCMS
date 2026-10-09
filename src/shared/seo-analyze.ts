import { blocksHeadings, blocksImages, blocksLinks, blocksText } from './blocks';
import { readability, slugify, wordCount, type Lang } from './text';
import type { Block, SeoMeta } from './types';

export type CheckStatus = 'good' | 'warn' | 'bad';

export interface SeoCheck {
  id: string;
  status: CheckStatus;
  /** What was checked, short. */
  label: string;
  /** What to do – a concrete action, not a score. */
  message: string;
  target?: { blockId?: string; field?: string; panel?: 'seo' | 'fields' };
}

export interface SeoInput {
  title: string;
  slug: string;
  isHome: boolean;
  /** Collection templates that render their own H1 (posts, products …). */
  ownH1: boolean;
  seo: SeoMeta;
  blocks: Block[];
  /** Extra text from fields (excerpt, description). */
  extraText?: string;
  siteName: string;
  titleTemplate: string;
  /** Alt text per media id; missing key = unknown, '' = no alt. */
  alts: Record<string, string>;
  lang?: Lang;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');

function contains(haystack: string, needle: string) {
  return needle.trim() !== '' && norm(haystack).includes(norm(needle.trim()));
}

export function fullTitle(input: Pick<SeoInput, 'title' | 'seo' | 'isHome' | 'siteName' | 'titleTemplate'>): string {
  if (input.seo.title?.trim()) return input.seo.title.trim();
  if (input.isHome) return input.siteName;
  return (input.titleTemplate || '%s · %site').replace('%s', input.title).replace('%site', input.siteName);
}

export function analyzeSeo(input: SeoInput): { checks: SeoCheck[]; score: number; status: CheckStatus; words: number } {
  const checks: SeoCheck[] = [];
  const kw = input.seo.keyword?.trim() ?? '';
  const text = [blocksText(input.blocks), input.extraText ?? ''].join(' ').trim();
  const words = wordCount(text);
  const headings = blocksHeadings(input.blocks);
  const title = fullTitle(input);
  const firstHeading = input.ownH1 ? { text: input.title, blockId: undefined, field: undefined, level: 1 } : headings[0];
  const h1 = input.ownH1 ? 1 : headings.filter((h) => h.level === 1).length;

  // Focus keyword
  if (!kw) {
    checks.push({
      id: 'keyword',
      status: 'warn',
      label: 'Fokus-Keyword',
      message: 'Leg fest, unter welchem Begriff man diese Seite finden soll – zum Beispiel «Restaurant Uster».',
      target: { panel: 'seo' },
    });
  } else {
    checks.push(
      contains(title, kw)
        ? { id: 'kw-title', status: 'good', label: 'Keyword im Seitentitel', message: `«${kw}» steht im Titel.` }
        : { id: 'kw-title', status: 'bad', label: 'Keyword im Seitentitel', message: `Füge «${kw}» in den Seitentitel ein – möglichst weit vorne.`, target: { panel: 'seo', field: 'title' } },
    );
    checks.push(
      firstHeading && contains(firstHeading.text, kw)
        ? { id: 'kw-h1', status: 'good', label: 'Keyword in der Hauptüberschrift', message: 'Die erste Überschrift enthält das Keyword.' }
        : {
            id: 'kw-h1',
            status: 'bad',
            label: 'Keyword in der Hauptüberschrift',
            message: `Füge «${kw}» in die erste Überschrift ein.`,
            target: firstHeading?.blockId ? { blockId: firstHeading.blockId, field: firstHeading.field } : { panel: 'fields', field: 'title' },
          },
    );
    const intro = text.split(/\s+/).slice(0, 120).join(' ');
    checks.push(
      contains(intro, kw)
        ? { id: 'kw-intro', status: 'good', label: 'Keyword in der Einleitung', message: 'Das Keyword kommt früh im Text vor.' }
        : { id: 'kw-intro', status: 'warn', label: 'Keyword in der Einleitung', message: `Erwähne «${kw}» in den ersten zwei, drei Sätzen.`, target: input.blocks[0] ? { blockId: input.blocks[0].id } : undefined },
    );
    if (!input.isHome)
      checks.push(
        slugify(input.slug).includes(slugify(kw))
          ? { id: 'kw-slug', status: 'good', label: 'Keyword in der Adresse', message: 'Die Adresse enthält das Keyword.' }
          : { id: 'kw-slug', status: 'warn', label: 'Keyword in der Adresse', message: `Eine Adresse wie «/${slugify(kw)}» hilft. Die alte Adresse leitet Nova automatisch weiter.`, target: { panel: 'seo', field: 'slug' } },
      );
    const occurrences = norm(text).split(norm(kw)).length - 1;
    const density = words ? (occurrences * kw.split(/\s+/).length * 100) / words : 0;
    if (words > 150 && density > 3.5)
      checks.push({ id: 'kw-density', status: 'warn', label: 'Keyword-Häufigkeit', message: `«${kw}» kommt ${occurrences}-mal vor. Das wirkt gezwungen – formuliere einige Stellen um.` });
  }

  // Title & description
  if (title.length < 25) checks.push({ id: 'title-length', status: 'warn', label: 'Länge des Seitentitels', message: `Der Titel hat nur ${title.length} Zeichen. 40–60 Zeichen zeigen mehr in den Suchergebnissen.`, target: { panel: 'seo', field: 'title' } });
  else if (title.length > 62) checks.push({ id: 'title-length', status: 'warn', label: 'Länge des Seitentitels', message: `Der Titel hat ${title.length} Zeichen und wird bei Google abgeschnitten. Kürze auf etwa 60.`, target: { panel: 'seo', field: 'title' } });
  else checks.push({ id: 'title-length', status: 'good', label: 'Länge des Seitentitels', message: `${title.length} Zeichen – passt.` });

  const desc = input.seo.description?.trim() ?? '';
  if (!desc)
    checks.push({ id: 'description', status: 'warn', label: 'Beschreibung', message: 'Nova erzeugt eine Beschreibung aus dem Text. Eine eigene, die neugierig macht, bringt mehr Klicks.', target: { panel: 'seo', field: 'description' } });
  else if (desc.length < 70 || desc.length > 160)
    checks.push({ id: 'description', status: 'warn', label: 'Beschreibung', message: `Die Beschreibung hat ${desc.length} Zeichen. Ideal sind 120–155.`, target: { panel: 'seo', field: 'description' } });
  else if (kw && !contains(desc, kw))
    checks.push({ id: 'description', status: 'warn', label: 'Beschreibung', message: `Nimm «${kw}» in die Beschreibung auf – Google hebt es fett hervor.`, target: { panel: 'seo', field: 'description' } });
  else checks.push({ id: 'description', status: 'good', label: 'Beschreibung', message: 'Länge und Inhalt passen.' });

  // Structure
  if (h1 === 0)
    checks.push({
      id: 'h1',
      status: 'bad',
      label: 'Hauptüberschrift',
      message: 'Die Seite hat keine Hauptüberschrift. Beginne mit einem «Einstieg»-Block – sein Titel wird zur H1.',
      target: input.blocks[0] ? { blockId: input.blocks[0].id } : undefined,
    });
  else checks.push({ id: 'h1', status: 'good', label: 'Hauptüberschrift', message: 'Genau eine H1 – so soll es sein.' });

  let last = input.ownH1 ? 1 : 0;
  const skip = headings.find((h) => {
    const jump = h.level > last + 1 && last > 0;
    last = h.level;
    return jump;
  });
  if (skip)
    checks.push({
      id: 'heading-order',
      status: 'warn',
      label: 'Überschriften-Reihenfolge',
      message: `«${skip.text}» springt eine Ebene. Nutze zuerst eine Überschrift der höheren Ebene.`,
      target: { blockId: skip.blockId, field: skip.field },
    });

  // Content
  if (!input.isHome) {
    if (words < 120) checks.push({ id: 'length', status: 'warn', label: 'Textmenge', message: `Nur ${words} Wörter. Seiten mit 300+ Wörtern werden meist besser gefunden.` });
    else checks.push({ id: 'length', status: 'good', label: 'Textmenge', message: `${words} Wörter.` });
  }

  const images = blocksImages(input.blocks);
  const noAlt = images.filter((i) => input.alts[i.media] === '');
  if (noAlt.length)
    checks.push({
      id: 'alt',
      status: 'bad',
      label: 'Bildbeschreibungen',
      message: `${noAlt.length === 1 ? 'Ein Bild hat' : `${noAlt.length} Bilder haben`} keinen Alt-Text. Beschreib, was darauf zu sehen ist – für Menschen, die es nicht sehen können, und für Google.`,
      target: { blockId: noAlt[0].blockId },
    });
  else if (images.length) checks.push({ id: 'alt', status: 'good', label: 'Bildbeschreibungen', message: 'Alle Bilder sind beschrieben.' });

  const links = blocksLinks(input.blocks);
  const internal = links.filter((l) => l.href.startsWith('/') && !l.href.startsWith('//'));
  if (!internal.length && words > 80)
    checks.push({ id: 'links', status: 'warn', label: 'Interne Links', message: 'Verlinke auf mindestens eine andere Seite deiner Website – das hilft Lesern und Google.', target: input.blocks[0] ? { blockId: input.blocks[0].id } : undefined });
  else if (internal.length) checks.push({ id: 'links', status: 'good', label: 'Interne Links', message: `${internal.length} interne ${internal.length === 1 ? 'Verlinkung' : 'Verlinkungen'}.` });

  if (words >= 80) {
    const r = readability(text, input.lang ?? 'de');
    if (r.score < 35 || r.longSentences > 2)
      checks.push({
        id: 'readability',
        status: 'warn',
        label: 'Lesbarkeit',
        message: `Der Text ist ${r.label} (${r.score}/100). ${r.longSentences ? `${r.longSentences} Sätze haben mehr als 22 Wörter – teil sie auf.` : 'Kürzere Sätze und Wörter helfen.'}`,
      });
    else checks.push({ id: 'readability', status: 'good', label: 'Lesbarkeit', message: `Der Text ist ${r.label} (${r.score}/100).` });
  }

  if (input.seo.noindex) checks.push({ id: 'noindex', status: 'warn', label: 'Für Suchmaschinen gesperrt', message: 'Diese Seite ist auf «nicht indexieren» gestellt und erscheint nicht bei Google.', target: { panel: 'seo' } });

  const weight = { good: 1, warn: 0.5, bad: 0 };
  const score = checks.length ? Math.round((checks.reduce((s, c) => s + weight[c.status], 0) / checks.length) * 100) : 100;
  const status: CheckStatus = checks.some((c) => c.status === 'bad') ? 'bad' : score >= 80 ? 'good' : 'warn';
  const order = { bad: 0, warn: 1, good: 2 };
  checks.sort((a, b) => order[a.status] - order[b.status]);
  return { checks, score, status, words };
}

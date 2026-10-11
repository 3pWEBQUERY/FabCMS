import { createEl, structureBox, type El } from './elements';
import type { Design, StyleProps } from './design';
import { shortId } from './text';
import type { Block } from './types';

/**
 * «In Bausteine zerlegen»: a ready-made block becomes a free layout made of
 * the same parts – Container, Blocks, headings, texts, images and buttons –
 * so every detail can be designed like in Bricks. Texts, pictures, links and
 * the block's own look (tone, spacing, design) are kept.
 */

type P = Record<string, unknown>;
interface Link {
  label?: string;
  href?: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const items = (v: unknown): P[] => (Array.isArray(v) ? v.filter((x): x is P => Boolean(x) && typeof x === 'object') : []);
const d = (desktop: StyleProps, more: Omit<Design, 'desktop'> = {}): Design => ({ desktop, ...more });

/* the theme's text styles, as design */
const EYEBROW: StyleProps = { fontSize: '$step-n1', tracking: '0.08em', textTransform: 'uppercase', weight: 600, color: '$ink-2' };
const LEAD: StyleProps = { fontSize: '$step-1', color: '$ink-2', maxWidth: '36em' };
const CARD: StyleProps = { bg: '$surface', pt: '$s-6', pr: '$s-6', pb: '$s-6', pl: '$s-6', radius: '18px', gap: '$s-3' };

const heading = (text: string, level: 1 | 2 | 3, design?: Design) => createEl('heading', { text, level: String(level) }, design ? { design } : {});
const plainText = (text: string, design?: Design) =>
  createEl(
    'text',
    {
      html: text
        .split(/\n{2,}/)
        .map((para) => `<p>${esc(para).replace(/\n/g, '<br>')}</p>`)
        .join(''),
    },
    design ? { design } : {},
  );
const richText = (html: string, design?: Design) => createEl('text', { html }, design ? { design } : {});
const image = (id: unknown, design?: Design) => createEl('image', { image: typeof id === 'string' ? id : null, alt: '' }, design ? { design } : {});
const button = (l: unknown, variant: 'primary' | 'secondary' | 'link') => {
  const link = (l ?? {}) as Link;
  return link.href || link.label ? createEl('button', { label: link.label || 'Mehr erfahren', href: link.href || '', variant }) : null;
};
const buttonRow = (btns: (El | null)[], center = false) => {
  const list = btns.filter((x): x is El => Boolean(x));
  return list.length ? structureBox('div', list, d({ display: 'flex', direction: 'row', wrap: true, gap: '$s-3', ...(center ? { justify: 'center' } : {}) })) : null;
};
const grid = (children: El[], cols: number, gap = '$s-6') =>
  structureBox('block', children, d({ display: 'grid', columns: cols, gap }, { ...(cols > 2 ? { tablet: { columns: 2 } } : {}), mobile: { columns: 1 } }));
const twoCols = (a: El, b: El) => structureBox('block', [a, b], d({ display: 'grid', columns: 2, gap: '$s-7', align: 'center' }, { mobile: { columns: 1 } }));
const compact = (list: (El | null | false | undefined | '' | 0)[]) => list.filter((x): x is El => Boolean(x));
/** A section's head: its heading and the short text under it. */
const head = (p: P, center = false): El[] =>
  compact([
    str(p.heading) && heading(str(p.heading), 2, center ? d({ textAlign: 'center' }) : undefined),
    str(p.intro) && plainText(str(p.intro), d({ ...LEAD, ...(center ? { textAlign: 'center', ml: 'auto', mr: 'auto' } : {}) })),
  ]);

type Converted = { els: El[]; style?: Block['style'] };

/** How the theme shows the block: some centre their titles. Read from the page before it is taken apart. */
export interface ConvertHints {
  center?: boolean;
}

const CENTER: StyleProps = { textAlign: 'center', ml: 'auto', mr: 'auto' };

const CONVERTERS: Record<string, (p: P, first: boolean, hints: ConvertHints) => Converted> = {
  hero(p, first, hints) {
    const center = Boolean(hints.center) && p.variant !== 'split';
    const text = compact([
      str(p.eyebrow) && plainText(str(p.eyebrow), d({ ...EYEBROW, ...(center ? CENTER : {}) })),
      heading(str(p.title), first ? 1 : 2, d({ fontSize: '$step-7', maxWidth: '16ch', ...(center ? CENTER : {}) })),
      str(p.text) && plainText(str(p.text), d({ ...LEAD, ...(center ? CENTER : {}) })),
      buttonRow([button(p.primary, 'primary'), button(p.secondary, 'secondary')], center),
    ]);
    if (p.variant === 'split') return { els: [twoCols(structureBox('block', text, d({ gap: '$s-5' })), image(p.image, d({ aspect: '4/5', radius: '18px' })))] };
    if (p.variant === 'cover' && typeof p.image === 'string')
      // The picture behind the whole section, the text on it.
      return {
        els: [
          structureBox(
            'section',
            [structureBox('container', text, d({ gap: '$s-5' }))],
            d({ bgImage: p.image, overlay: 'rgb(0 0 0 / 0.45)', color: '#ffffff', minHeight: '70svh', display: 'flex', justify: 'end' }),
          ),
        ],
        style: { spacing: 'none' },
      };
    return { els: text };
  },
  text(p) {
    const center = p.align === 'center';
    return {
      els: [
        structureBox(
          'block',
          compact([str(p.heading) && heading(str(p.heading), 2), richText(str(p.body))]),
          d({ gap: '$s-5', ...(p.width === 'wide' ? {} : { maxWidth: '$measure' }), ...(center ? { textAlign: 'center', ml: 'auto', mr: 'auto' } : {}) }),
        ),
      ],
    };
  },
  split(p) {
    const text = structureBox(
      'block',
      compact([
        str(p.eyebrow) && plainText(str(p.eyebrow), d(EYEBROW)),
        str(p.heading) && heading(str(p.heading), 2),
        richText(str(p.body)),
        buttonRow([button(p.link, 'secondary')]),
      ]),
      d({ gap: '$s-5' }),
    );
    const pic = image(p.image, d({ aspect: '4/3', radius: '18px' }));
    return { els: [p.side === 'left' ? twoCols(pic, text) : twoCols(text, pic)] };
  },
  image(p) {
    return {
      els: compact([
        image(p.image, d({ radius: '12px', ...(p.ratio && p.ratio !== 'auto' ? { aspect: String(p.ratio) } : {}) })),
        str(p.caption) && plainText(str(p.caption), d({ fontSize: '$step-n1', color: '$ink-2' })),
      ]),
    };
  },
  cta(p) {
    return {
      els: [
        structureBox(
          'block',
          compact([
            heading(str(p.heading), 2, d({ fontSize: '$step-6' })),
            str(p.text) && plainText(str(p.text), d(LEAD)),
            buttonRow([button(p.primary, 'primary'), button(p.secondary, 'secondary')], true),
          ]),
          d({ align: 'center', textAlign: 'center', gap: '$s-5', maxWidth: '44rem', ml: 'auto', mr: 'auto' }),
        ),
      ],
    };
  },
  faq(p, _first, hints) {
    const questions = items(p.items).map((x) => createEl('box', {}, { name: 'Frage', children: [heading(str(x.q), 3), richText(str(x.a))] }));
    return { els: compact([...head(p, hints.center), questions.length && createEl('accordion', { single: true, first: false, faq: true }, { children: questions })]) };
  },
  quote(p) {
    return { els: [createEl('testimonial', { quote: str(p.quote), name: str(p.name), role: str(p.role), photo: null, stars: 0, look: 'plain' })] };
  },
  testimonials(p, _first, hints) {
    const list = items(p.items).map((x) => createEl('testimonial', { quote: str(x.quote), name: str(x.name), role: str(x.role), photo: null, stars: 0, look: 'card' }));
    return { els: compact([...head(p, hints.center), list.length && grid(list, Math.min(3, list.length))]) };
  },
  stats(p, _first, hints) {
    const cells = items(p.items).map((x) =>
      structureBox(
        'block',
        [heading(str(x.value), 3, d({ fontSize: '$step-6' })), plainText(str(x.label), d({ color: '$ink-2' }))],
        d({ gap: '$s-2', pl: '$s-4', borderWidth: '1px', borderStyle: 'solid', borderColor: '$line', borderSides: 'left' }),
      ),
    );
    return { els: compact([...head(p, hints.center), cells.length && grid(cells, Math.min(4, cells.length))]) };
  },
  columns(p, _first, hints) {
    const cards = items(p.items).map((x) =>
      structureBox(
        'block',
        compact([
          typeof x.image === 'string' && image(x.image, d({ aspect: '3/2', radius: '12px' })),
          heading(str(x.title), 3),
          str(x.text) && plainText(str(x.text)),
          buttonRow([button(x.link, 'secondary')]),
        ]),
        d({ gap: '$s-3' }),
      ),
    );
    return { els: compact([...head(p, hints.center), cards.length && grid(cards, Math.min(4, Math.max(1, Number(p.count) || 3)))]) };
  },
  list(p, _first, hints) {
    const numbered = p.style !== 'plain';
    const rows = items(p.items).map((x, i) =>
      structureBox(
        'block',
        compact([
          numbered && heading(String(i + 1).padStart(2, '0'), 3, d({ color: '$accent', fontSize: '$step-3', minWidth: '2.5ch' })),
          structureBox('block', compact([heading(str(x.title), 3), str(x.text) && plainText(str(x.text)), str(x.meta) && plainText(str(x.meta), d(EYEBROW))]), d({ gap: '$s-2' })),
        ]),
        d({ display: 'flex', direction: 'row', gap: '$s-5', align: 'start' }),
      ),
    );
    return { els: compact([...head(p, hints.center), structureBox('block', rows, d({ gap: '$s-6' }))]) };
  },
  timeline(p, _first, hints) {
    const rows = items(p.items).map((x) =>
      structureBox(
        'block',
        compact([str(x.when) && plainText(str(x.when), d(EYEBROW)), heading(str(x.title), 3), str(x.text) && plainText(str(x.text))]),
        d({ gap: '$s-2', pl: '$s-5', borderWidth: '2px', borderStyle: 'solid', borderColor: '$line', borderSides: 'left' }),
      ),
    );
    return { els: compact([...head(p, hints.center), structureBox('block', rows, d({ gap: '$s-6' }))]) };
  },
  buttons(p) {
    const row = buttonRow(
      items(p.items).map((x, i) => button(x, i === 0 ? 'primary' : 'secondary')),
      p.align === 'center',
    );
    return { els: compact([row]) };
  },
  pricing(p, _first, hints) {
    const plans = items(p.plans).map((x) =>
      structureBox(
        'block',
        compact([
          heading(str(x.name), 3),
          heading(str(x.price), 3, d({ fontSize: '$step-5' })),
          str(x.period) && plainText(str(x.period), d({ color: '$ink-2', fontSize: '$step-n1' })),
          str(x.description) && plainText(str(x.description)),
          str(x.features) &&
            createEl('iconlist', {
              items: str(x.features)
                .split('\n')
                .map((f) => f.trim())
                .filter(Boolean)
                .map((f) => ({ icon: 'check', text: f })),
              layout: 'column',
              size: 18,
            }),
          buttonRow([button(x.link, x.highlight ? 'primary' : 'link')]),
        ]),
        d({ ...CARD, ...(x.highlight ? { borderWidth: '2px', borderStyle: 'solid', borderColor: '$accent' } : {}) }),
      ),
    );
    return { els: compact([...head(p, hints.center ?? true), plans.length && grid(plans, Math.min(3, plans.length))]) };
  },
};

/** The ready-made blocks that can be taken apart. */
export const CONVERTIBLE = Object.keys(CONVERTERS);

/**
 * The block as a free layout: edge to edge, the parts in a Container of the
 * website's width (a cover picture: a Section of its own). Null for blocks
 * that can't be taken apart.
 */
export function blockToLayout(b: Block, first = false, hints: ConvertHints = {}): Block | null {
  const convert = CONVERTERS[b.type];
  if (!convert) return null;
  const { els, style } = convert((b.props ?? {}) as P, first, hints);
  const own = els.length === 1 && els[0].props.role === 'section';
  return {
    id: shortId(8),
    type: 'layout',
    props: { width: 'full', els: own ? els : [structureBox('container', els, d({ gap: '$s-6' }))] },
    ...(b.style || style ? { style: { ...b.style, ...style } } : {}),
  };
}

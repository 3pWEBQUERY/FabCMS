import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { sql } from './db';
import { storage } from './storage';
import { getSettings } from './settings';
import { listCollections } from './content';
import { toCsv } from './lib/http';
import { BLOCK_MAP } from '../shared/blocks';
import { entryPath } from '../shared/paths';
import { formatPrice } from '../shared/text';
import type { Block, EntryData, FormDef } from '../shared/types';

/** Rich text → Markdown, good enough for an honest export (headings, emphasis, links, lists). */
export function htmlToMarkdown(html: string): string {
  return html
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n\n')
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n#### $1\n\n')
    .replace(/<(strong|b)>(.*?)<\/\1>/gi, '**$2**')
    .replace(/<(em|i)>(.*?)<\/\1>/gi, '*$2*')
    .replace(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<li>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<blockquote>(.*?)<\/blockquote>/gis, (_, t: string) => `\n> ${t.replace(/<[^>]+>/g, '')}\n\n`)
    .replace(/<br\s*\/?>/gi, '  \n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function blocksToMarkdown(blocks: Block[] | undefined): string {
  return (blocks ?? [])
    .map((b) => {
      const p = b.props as Record<string, any>;
      if (b.type === 'text') return [p.heading && `## ${p.heading}`, htmlToMarkdown(p.body ?? '')].filter(Boolean).join('\n\n');
      if (b.type === 'hero') return [`# ${p.title}`, p.text].filter(Boolean).join('\n\n');
      if (b.type === 'quote') return `> ${p.quote}${p.name ? `\n> — ${p.name}` : ''}`;
      const text = BLOCK_MAP[b.type]?.text?.(p);
      return text ? `<!-- ${b.type} -->\n${text}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

function frontmatter(o: Record<string, unknown>): string {
  const lines = Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v)}`);
  return `---\n${lines.join('\n')}\n---\n\n`;
}

/** Streams a ZIP with everything: content (JSON + Markdown), config as code, media originals, CSVs. */
export function exportZip(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) return controller.error(err);
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      const text = (name: string, content: string) => {
        const f = new ZipDeflate(name, { level: 6 });
        zip.add(f);
        f.push(new TextEncoder().encode(content), true);
      };
      try {
        const settings = await getSettings();
        const collections = await listCollections();
        const forms = (await sql`select * from forms order by created_at`) as unknown as FormDef[];
        text(
          'LIESMICH.txt',
          `Nova-Export von «${settings.name}», erstellt am ${new Date().toLocaleString('de-CH')}.\n\nnova.config.json  Einstellungen, Inhaltstypen und Formulare (Konfiguration als Code)\ncontent/          Alle Inhalte als JSON, Seiten und Beiträge zusätzlich als Markdown\nmedia/            Originaldateien der Mediathek, media.json mit Alt-Texten und Fokuspunkten\ndata/             Kontakte, Bestellungen und Formulareinträge als CSV (Excel-kompatibel, Semikolon)\n`,
        );
        const { indexNowKey: _k, ...seo } = settings.seo;
        text('nova.config.json', JSON.stringify({ settings: { ...settings, seo, webhooks: settings.webhooks.map(({ secret: _s, ...w }) => w) }, collections, forms }, null, 2));

        const entries = await sql`select e.*, u.name as author_name from entries e left join users u on u.id = e.author_id order by collection, slug`;
        for (const e of entries) {
          const col = collections.find((c) => c.id === e.collection);
          const slug = (e.slug as string) || 'startseite';
          const data = e.data as EntryData;
          text(`content/${e.collection}/${slug.replace(/\//g, '__')}.json`, JSON.stringify({ id: e.id, slug: e.slug, status: e.status, path: col ? entryPath(col, e.slug as string) : null, data, published: e.published_data, published_at: e.published_at, updated_at: e.updated_at }, null, 2));
          if (col?.has_blocks) {
            const fm = frontmatter({ title: data.title, slug: e.slug, status: e.status, date: data.date ?? e.published_at, category: data.category, tags: data.tags, author: e.author_name, description: data.seo?.description || data.excerpt });
            text(`content/${e.collection}/${slug.replace(/\//g, '__')}.md`, fm + blocksToMarkdown(data.blocks) + '\n');
          }
        }

        const media = await sql`select * from media order by created_at`;
        text('media/media.json', JSON.stringify(media, null, 2));
        for (const m of media) {
          const obj = await storage.get(m.storage_key as string);
          if (!obj) continue;
          const f = new ZipPassThrough(`media/${m.id}-${m.filename}`);
          zip.add(f);
          for await (const chunk of obj.body) f.push(new Uint8Array(chunk as Buffer));
          f.push(new Uint8Array(0), true);
        }

        const contacts = await sql`select name, email, phone, company, status, source, created_at from contacts order by created_at`;
        text('data/kontakte.csv', toCsv(contacts as unknown as Record<string, unknown>[]));
        const orders = await sql`select * from orders order by created_at`;
        text(
          'data/bestellungen.csv',
          toCsv(
            orders.map((o) => ({
              nummer: o.number,
              datum: new Date(o.created_at).toISOString(),
              status: o.status,
              email: o.email,
              name: o.customer.name,
              adresse: [o.customer.street, o.customer.zip, o.customer.city, o.customer.country].filter(Boolean).join(', '),
              artikel: (o.items as { qty: number; title: string }[]).map((l) => `${l.qty}× ${l.title}`).join(', '),
              total: formatPrice(o.total),
              zahlung: o.payment_method,
            })),
          ),
        );
        for (const form of forms) {
          const subs = await sql`select data, page, created_at from submissions where form_id = ${form.id} order by created_at`;
          if (!subs.length) continue;
          text(
            `data/formular-${form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`,
            toCsv(subs.map((s) => ({ datum: new Date(s.created_at).toISOString(), ...(s.data as Record<string, string>), seite: s.page }))),
          );
        }
        zip.end();
      } catch (e) {
        controller.error(e);
      }
    },
  });
}

import { env } from './env';
import { getSettings } from './settings';
import { getVariant } from './media';
import { sql } from './db';
import { badRequest, HttpError } from './lib/http';
import { sanitizeRichText } from '../shared/richtext';
import { langInfo, type Lang } from '../shared/i18n';
import type { SlotKind, TextSlot } from '../shared/text-slots';

/**
 * KI-Assistent: suggestions for wording, alt texts and translation drafts.
 * Nothing here writes to the database – the editor shows each suggestion and
 * the person decides. Runs only with ANTHROPIC_API_KEY and the switch in the
 * settings; the texts go to Anthropic for that one request.
 */

export const aiConfigured = () => Boolean(env.ai.key);
export async function aiEnabled(): Promise<boolean> {
  return aiConfigured() && (await getSettings()).ai?.enabled === true;
}

/** House rules for every text the assistant writes (PRD: «Mikro-Texte mit Haltung», no AI slop). */
const RULES = `Du hilfst beim Schreiben von Website-Texten für kleine Unternehmen, Vereine und Selbständige in der Schweiz.
Regeln:
- Klar, konkret, menschlich. Kurze Sätze. Aktiv statt passiv.
- Keine Werbefloskeln («Entdecken Sie», «einzigartig», «Ihr Partner für», «Tauchen Sie ein», «Unlock your potential»), keine Superlative, die der Text nicht belegt, keine Emojis, keine Ausrufezeichen-Ketten.
- Erfinde nichts dazu: keine Zahlen, Preise, Namen, Auszeichnungen, Versprechen oder Öffnungszeiten, die nicht im Text stehen.
- Behalte die Anrede (du oder Sie) und Eigennamen bei.
- Deutsch: Schweizer Rechtschreibung (immer «ss», nie «ß»), Anführungszeichen «so». Französisch und Italienisch: Schweizer Gepflogenheiten, Guillemets « ».
- Antworte nur mit dem Ergebnis – ohne Einleitung, ohne Erklärung, ohne Anführungszeichen darum.`;

export const REWRITE_MODES = {
  clearer: 'Formuliere den Text klarer und leichter lesbar. Inhalt und Länge bleiben ungefähr gleich.',
  shorter: 'Kürze den Text deutlich, etwa um ein Drittel, ohne Wichtiges wegzulassen.',
  warmer: 'Formuliere den Text wärmer und persönlicher, ohne anbiedernd zu werden.',
  formal: 'Formuliere den Text sachlicher und förmlicher.',
  fix: 'Korrigiere nur Rechtschreibung, Grammatik und Zeichensetzung. Ändere sonst nichts.',
} as const;
export type RewriteMode = keyof typeof REWRITE_MODES;

const FORMAT: Record<SlotKind, string> = {
  plain: 'Der Text ist eine einzelne Zeile ohne Zeilenumbruch.',
  multi: 'Der Text ist reiner Text; Zeilenumbrüche sind erlaubt.',
  rich: 'Der Text ist HTML. Behalte Absätze, Listen, Hervorhebungen und alle Links (href unverändert) bei. Erlaubte Tags: p, br, strong, em, a, ul, ol, li, h2, h3, h4, blockquote. Antworte mit HTML.',
};

interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}
type Content = { type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

async function ask<T = string>(opts: { system: string; content: Content[]; maxTokens: number; tool?: ToolDef }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${env.ai.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'x-api-key': env.ai.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.ai.model,
        max_tokens: opts.maxTokens,
        system: opts.system,
        messages: [{ role: 'user', content: opts.content }],
        ...(opts.tool ? { tools: [opts.tool], tool_choice: { type: 'tool', name: opts.tool.name } } : {}),
      }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new HttpError(502, 'Der KI-Dienst ist gerade nicht erreichbar. Versuch es später nochmal.');
  }
  if (!res.ok) {
    console.warn(`[ai] ${res.status} ${(await res.text().catch(() => '')).slice(0, 300)}`);
    if (res.status === 401 || res.status === 403)
      throw new HttpError(502, 'Der Schlüssel für den KI-Assistenten wird nicht akzeptiert. Prüf ANTHROPIC_API_KEY in den Variablen des Dienstes.');
    if (res.status === 429 || res.status === 529) throw new HttpError(503, 'Der KI-Dienst ist gerade ausgelastet. Versuch es in einer Minute nochmal.');
    throw new HttpError(502, 'Der KI-Dienst hat keinen Vorschlag geliefert. Versuch es später nochmal.');
  }
  const body = (await res.json()) as { stop_reason?: string; content?: { type: string; text?: string; input?: unknown }[] };
  if (body.stop_reason === 'refusal') throw new HttpError(422, 'Dazu macht der KI-Assistent keinen Vorschlag.');
  if (opts.tool) {
    const use = body.content?.find((b) => b.type === 'tool_use');
    if (!use) throw new HttpError(502, 'Der KI-Dienst hat keinen Vorschlag geliefert. Versuch es später nochmal.');
    return use.input as T;
  }
  const text = (body.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
    .trim();
  if (!text) throw new HttpError(502, 'Der KI-Dienst hat keinen Vorschlag geliefert. Versuch es später nochmal.');
  return text as T;
}

const langName = (l: Lang) => langInfo(l).name;

/** Brings an answer into the shape of the field: no wrapping quotes, one line where needed, safe HTML. */
export function cleanSuggestion(text: string, kind: SlotKind, original = ''): string {
  // Swiss spelling – ß only ever turns up in German, where it is wrong here.
  let s = text.trim().replace(/ß/g, 'ss');
  if (kind === 'rich') {
    s = s.replace(/^```(?:html)?\s*|\s*```$/g, '');
    return sanitizeRichText(/^\s*</.test(s) ? s : `<p>${s.replace(/</g, '&lt;')}</p>`);
  }
  const quoted = /^(«[^»]*»|"[^"]*"|„[^“]*“|“[^”]*”)$/s;
  if (quoted.test(s) && !quoted.test(original.trim())) s = s.slice(1, -1).trim();
  return kind === 'plain' ? s.replace(/\s*\n+\s*/g, ' ') : s;
}

export async function rewrite(input: { text: string; kind: SlotKind; mode: RewriteMode; lang: Lang; max?: number }): Promise<string> {
  const task = [
    REWRITE_MODES[input.mode],
    `Der Text ist auf ${langName(input.lang)}; antworte in derselben Sprache.`,
    FORMAT[input.kind],
    input.max ? `Höchstens ${input.max} Zeichen.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const out = await ask({ system: RULES, maxTokens: 2000, content: [{ type: 'text', text: `${task}\n\n<text>\n${input.text}\n</text>` }] });
  return cleanSuggestion(out, input.kind, input.text);
}

export async function altText(mediaId: string, lang: Lang): Promise<string> {
  const [m] = await sql`select id, filename, mime, version, private from media where id = ${mediaId}`;
  if (!m) throw new HttpError(404, 'Dieses Bild gibt es nicht mehr.');
  if (!String(m.mime).startsWith('image/') || m.private) throw badRequest('Für diese Datei gibt es keinen Vorschlag.');
  const img = await getVariant(m.id, m.version, 960, 'jpg');
  if (!img) throw badRequest('Das Bild lässt sich nicht lesen.');
  const s = await getSettings();
  const out = await ask({
    system: RULES,
    maxTokens: 300,
    content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img.toString('base64') } },
      {
        type: 'text',
        text: [
          `Schreib den Alternativtext für dieses Bild auf der Website «${s.name}»${s.tagline ? ` (${s.tagline})` : ''}. Er ist für Menschen, die das Bild nicht sehen, und für Suchmaschinen.`,
          'Ein Satz, höchstens 125 Zeichen. Beschreibe, was zu sehen ist und was davon für die Website zählt.',
          'Nicht mit «Bild von», «Foto von» oder Ähnlichem beginnen. Keine Vermutungen über Personen (Namen, Alter, Herkunft). Wichtigen Text im Bild gib wieder.',
          `Dateiname als Hinweis: ${m.filename}`,
          `Sprache: ${langName(lang)}.`,
        ].join('\n'),
      },
    ],
  });
  return cleanSuggestion(out, 'plain').replace(/\.$/, '').slice(0, 300);
}

/** Batches of roughly this many characters per request. */
const BATCH = 8000;

export async function translateSlots(slots: TextSlot[], from: Lang, to: Lang): Promise<string[]> {
  const batches: number[][] = [];
  let size = Infinity;
  slots.forEach((s, i) => {
    if (size + s.text.length > BATCH) {
      batches.push([]);
      size = 0;
    }
    batches[batches.length - 1].push(i);
    size += s.text.length;
  });
  const result: string[] = slots.map(() => '');
  const tool: ToolDef = {
    name: 'uebersetzung',
    description: 'Gibt die Übersetzung jedes Textes zurück, mit derselben id.',
    input_schema: {
      type: 'object',
      properties: { items: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, text: { type: 'string' } }, required: ['id', 'text'] } } },
      required: ['items'],
    },
  };
  // A few batches at a time – fast enough, and gentle on the rate limit.
  for (let start = 0; start < batches.length; start += 3) {
    await Promise.all(
      batches.slice(start, start + 3).map(async (ids) => {
        const items = ids.map((i) => ({
          id: i,
          format: slots[i].kind === 'rich' ? 'html' : slots[i].kind === 'multi' ? 'text' : 'line',
          ...(slots[i].max ? { max: slots[i].max } : {}),
          text: slots[i].text,
        }));
        const out = await ask<{ items?: { id: number; text: string }[] }>({
          system: RULES,
          maxTokens: 8000,
          tool,
          content: [
            {
              type: 'text',
              text: [
                `Übersetze die Texte einer Website von ${langName(from)} nach ${langName(to)}. Es ist ein Entwurf, den ein Mensch prüft.`,
                'Übersetze natürlich, so wie man es in der Zielsprache schreiben würde, nicht Wort für Wort. Eigennamen, Markennamen, Adressen, Preise und Zahlen bleiben.',
                'format «line» = eine Zeile, «text» = Zeilenumbrüche erlaubt, «html» = HTML mit denselben Tags und Links zurückgeben. «max» = höchstens so viele Zeichen.',
                '',
                JSON.stringify(items),
              ].join('\n'),
            },
          ],
        });
        for (const it of out.items ?? []) if (ids.includes(it.id) && typeof it.text === 'string') result[it.id] = cleanSuggestion(it.text, slots[it.id].kind, slots[it.id].text);
      }),
    );
  }
  return result;
}

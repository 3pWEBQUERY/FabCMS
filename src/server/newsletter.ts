import { createHash } from 'node:crypto';
import { sql } from './db';
import { env } from './env';
import { getSettings } from './settings';
import { token } from './lib/crypto';
import { badRequest, notFound } from './lib/http';
import { mailConfigured, sendMail } from './mail';
import { notify } from './notify';
import { pageLang } from './translations';
import { T } from '../site/i18n';
import { activeCollections } from './content';
import { resolveTheme } from '../site/themes';
import { variantUrl } from '../site/picture';
import { entryPath } from '../shared/paths';
import { blocksText } from '../shared/blocks';
import { excerpt } from '../shared/text';
import { entryAccess } from '../shared/members';
import { localDay } from '../shared/booking';
import type { EntryData, MediaItem, SiteSettings } from '../shared/types';

/**
 * Newsletter light: a sign-up with double opt-in, issues made of an intro
 * and published posts, sent by Nova itself (Resend/SMTP), one-click
 * unsubscribe. Brevo or Mailchimp can mirror the list, if keys are set.
 */

export interface Subscriber {
  id: string;
  email: string;
  name: string;
  status: 'pending' | 'active' | 'unsubscribed';
  token: string;
  source: string;
  created_at: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
}

export interface Newsletter {
  id: string;
  subject: string;
  intro: string;
  entry_ids: string[];
  status: 'draft' | 'sending' | 'sent';
  auto: boolean;
  recipients: number;
  created_at: string;
  sent_at: string | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const base = (s: SiteSettings) => (s.baseUrl || env.publicUrl).replace(/\/$/, '');
const esc = (v: unknown) => String(v ?? '').replace(/[<>&"']/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[ch]!);

/* ---------- list provider mirror (optional) ---------- */

export function providerName(): string | null {
  if (env.newsletter.brevoKey && env.newsletter.brevoList) return 'Brevo';
  if (env.newsletter.mailchimpKey && env.newsletter.mailchimpList) return 'Mailchimp';
  return null;
}

/** Keeps Brevo/Mailchimp in step. Never throws: the own list is the source of truth. */
async function mirror(email: string, name: string, subscribed: boolean): Promise<void> {
  try {
    const n = env.newsletter;
    if (n.brevoKey && n.brevoList) {
      const headers = {
        'api-key': n.brevoKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      const list = Number(n.brevoList);
      const r = subscribed
        ? await fetch('https://api.brevo.com/v3/contacts', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              email,
              attributes: name ? { FIRSTNAME: name } : {},
              listIds: [list],
              updateEnabled: true,
            }),
          })
        : await fetch(`https://api.brevo.com/v3/contacts/lists/${list}/contacts/remove`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ emails: [email] }),
          });
      if (!r.ok && r.status !== 400) throw new Error(`Brevo ${r.status}: ${await r.text()}`);
    } else if (n.mailchimpKey && n.mailchimpList) {
      const dc = n.mailchimpKey.split('-').pop();
      const hash = createHash('md5').update(email.toLowerCase()).digest('hex');
      const r = await fetch(`https://${dc}.api.mailchimp.com/3.0/lists/${n.mailchimpList}/members/${hash}`, {
        method: 'PUT',
        headers: {
          Authorization: `Basic ${Buffer.from(`nova:${n.mailchimpKey}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email_address: email,
          status_if_new: subscribed ? 'subscribed' : 'unsubscribed',
          status: subscribed ? 'subscribed' : 'unsubscribed',
          merge_fields: name ? { FNAME: name } : {},
        }),
      });
      if (!r.ok) throw new Error(`Mailchimp ${r.status}: ${await r.text()}`);
    }
  } catch (e) {
    console.warn('[newsletter] Abgleich mit dem Anbieter fehlgeschlagen:', (e as Error).message);
  }
}

/* ---------- subscribe, confirm, unsubscribe ---------- */

async function confirmMail(sub: Subscriber): Promise<void> {
  const s = await getSettings();
  const link = `${base(s)}/newsletter/bestaetigen/${sub.token}`;
  // In the language of the page the visitor signed up on.
  const hello = sub.name ? T('Hallo {name},', { name: sub.name.split(' ')[0] }) : T('Hallo,');
  const wants = T('jemand – hoffentlich du – möchte den Newsletter von {name} an diese Adresse bekommen.', { name: s.name });
  const click = T('Ein Klick bestätigt die Anmeldung:');
  const notYou = T('Warst du das nicht? Dann ignoriere diese E-Mail einfach. Ohne Bestätigung schicken wir nichts.');
  await sendMail({
    to: sub.email,
    subject: T('Bitte bestätige: Newsletter von {name}', { name: s.name }),
    replyTo: s.business.email || undefined,
    text: [hello, '', wants, click, '', link, '', notYou, '', s.name].join('\n'),
    html: shell(
      s,
      `<p style="margin:0 0 16px">${esc(hello)}</p><p style="margin:0 0 16px">${esc(wants)} ${esc(click)}</p>${button(s, link, T('Anmeldung bestätigen'))}<p style="margin:24px 0 0;color:#6b6b66;font-size:14px">${esc(notYou)}</p>`,
      '',
      '',
      pageLang(),
    ),
  });
}

/**
 * Starts the double opt-in. The answer is the same whether the address is new
 * or already on the list, so the form does not reveal who subscribed.
 */
export async function subscribe(input: { email: string; name?: string; source?: string; ip?: string }): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) throw badRequest('Bitte gib eine gültige E-Mail-Adresse ein.');
  const name = (input.name ?? '').trim().slice(0, 80);
  const [existing] = await sql`select * from subscribers where lower(email) = ${email}`;
  if (existing?.status === 'active') return;
  let sub: Subscriber;
  if (existing) {
    // At most one confirmation mail per address every 10 minutes.
    if (existing.status === 'pending' && Date.now() - new Date(existing.created_at).getTime() < 10 * 60_000) return;
    const [row] = await sql`
      update subscribers set status = 'pending', name = coalesce(nullif(${name}, ''), name), token = ${token(24)},
        source = ${input.source ?? ''}, ip = ${input.ip ?? ''}, created_at = now(), unsubscribed_at = null
      where id = ${existing.id} returning *`;
    sub = row as unknown as Subscriber;
  } else {
    const [row] = await sql`
      insert into subscribers (email, name, token, source, ip) values (${email}, ${name}, ${token(24)}, ${input.source ?? ''}, ${input.ip ?? ''})
      on conflict ((lower(email))) do nothing returning *`;
    if (!row) return;
    sub = row as unknown as Subscriber;
  }
  await confirmMail(sub);
}

export async function confirmSubscription(t: string): Promise<{
  status: 'confirmed' | 'already' | 'unknown';
  subscriber?: Subscriber;
}> {
  const [row] = await sql`select * from subscribers where token = ${t}`;
  if (!row) return { status: 'unknown' };
  if (row.status === 'active') return { status: 'already', subscriber: row as unknown as Subscriber };
  const [sub] = await sql`update subscribers set status = 'active', confirmed_at = now(), unsubscribed_at = null where id = ${row.id} returning *`;
  void mirror(sub.email as string, sub.name as string, true);
  const [count] = await sql`select count(*)::int as n from subscribers where status = 'active'`;
  void notify({
    kind: 'system',
    cap: 'newsletter.manage',
    title: `Neu im Newsletter: ${sub.name || sub.email}`,
    body: `${count.n} Abonnent:innen`,
    href: '/newsletter?tab=abonnenten',
  });
  return { status: 'confirmed', subscriber: sub as unknown as Subscriber };
}

export async function subscriberByToken(t: string): Promise<Subscriber | null> {
  const [row] = await sql`select * from subscribers where token = ${t}`;
  return (row as unknown as Subscriber) ?? null;
}

export async function unsubscribe(t: string): Promise<Subscriber | null> {
  const [row] = await sql`
    update subscribers set status = 'unsubscribed', unsubscribed_at = coalesce(unsubscribed_at, now())
    where token = ${t} returning *`;
  if (!row) return null;
  void mirror(row.email as string, row.name as string, false);
  return row as unknown as Subscriber;
}

/** Admin: remove someone completely (privacy request or typo). */
export async function deleteSubscriber(id: string): Promise<void> {
  const [row] = await sql`delete from subscribers where id = ${id} returning email, name`;
  if (!row) throw notFound();
  void mirror(row.email as string, row.name as string, false);
}

/** Admin import of an existing list whose consent the operator vouches for. */
export async function importSubscribers(rows: { email: string; name: string }[]): Promise<{ added: number; skipped: number }> {
  let added = 0;
  let skipped = 0;
  for (const r of rows) {
    const email = r.email.trim().toLowerCase();
    if (!EMAIL.test(email)) {
      skipped++;
      continue;
    }
    const [row] = await sql`
      insert into subscribers (email, name, token, source, status, confirmed_at)
      values (${email}, ${r.name.trim().slice(0, 80)}, ${token(24)}, 'import', 'active', now())
      on conflict ((lower(email))) do nothing returning email, name`;
    if (row) {
      added++;
      void mirror(email, row.name as string, true);
    } else skipped++;
  }
  return { added, skipped };
}

/* ---------- rendering ---------- */

function colors(s: SiteSettings) {
  const { palette } = resolveTheme(s);
  // Mail clients show light backgrounds; dark palettes keep their accent for lines only.
  return {
    accent: palette.dark ? '#1c1b19' : palette.accent,
    accentInk: palette.dark ? '#ffffff' : palette.accentInk,
  };
}

function button(s: SiteSettings, href: string, label: string) {
  const c = colors(s);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:6px;background:${c.accent}"><a href="${esc(href)}" style="display:inline-block;padding:12px 22px;font-weight:600;color:${c.accentInk};text-decoration:none;border-radius:6px">${esc(label)}</a></td></tr></table>`;
}

/** Table layout and inline styles: what Outlook, Gmail and Apple Mail all understand. */
function shell(s: SiteSettings, body: string, footer: string, preheader = '', lang = 'de'): string {
  const address = [s.business.legalName || s.name, s.business.street, [s.business.zip, s.business.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(s.name)}</title></head>
<body style="margin:0;padding:0;background:#f3f2ee;-webkit-text-size-adjust:100%">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f2ee"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#1c1b19">
<tr><td style="padding:28px 32px 8px;font-size:18px;font-weight:700;letter-spacing:-.01em">${esc(s.name)}</td></tr>
<tr><td style="padding:16px 32px 32px">${body}</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#6b6b66">
<tr><td style="padding:20px 32px">${footer}${address ? `<p style="margin:8px 0 0">${esc(address)}</p>` : ''}</td></tr>
</table>
</td></tr></table></body></html>`;
}

interface IssueItem {
  title: string;
  excerpt: string;
  url: string;
  image: string | null;
  alt: string;
}

async function issueItems(ids: string[], s: SiteSettings): Promise<IssueItem[]> {
  if (!ids.length) return [];
  const cols = await activeCollections();
  const rows = await sql`
    select id, collection, published_slug as slug, published_data as data from entries
    where id = any(${ids}::uuid[]) and status = 'published'`;
  const covers = rows.map((r) => (r.data as EntryData).cover).filter((x): x is string => typeof x === 'string');
  const media = covers.length ? await sql`select * from media where id = any(${covers}::uuid[])` : [];
  const byId = new Map(media.map((m) => [m.id as string, m as unknown as MediaItem]));
  const items: IssueItem[] = [];
  // Keep the order the editor chose.
  for (const id of ids) {
    const r = rows.find((x) => x.id === id);
    if (!r) continue;
    const col = cols.find((x) => x.id === r.collection);
    const path = col ? entryPath(col, r.slug as string) : null;
    if (!path) continue;
    const d = r.data as EntryData;
    const m = typeof d.cover === 'string' ? byId.get(d.cover) : undefined;
    items.push({
      title: String(d.title ?? ''),
      excerpt: (d.excerpt as string) || (entryAccess(d) === 'public' ? excerpt(blocksText(d.blocks), 220) : ''),
      url: base(s) + path,
      image: m && m.width ? base(s) + variantUrl(m, 960, 'jpg') : null,
      alt: m?.alt ?? '',
    });
  }
  return items;
}

export async function renderIssue(
  n: Pick<Newsletter, 'subject' | 'intro' | 'entry_ids'>,
  sub: Pick<Subscriber, 'name' | 'token'> | null,
): Promise<{
  subject: string;
  html: string;
  text: string;
  unsubscribe: string;
}> {
  const s = await getSettings();
  const items = await issueItems(n.entry_ids, s);
  const c = colors(s);
  const unsubscribe = `${base(s)}/newsletter/abmelden/${sub?.token ?? 'vorschau'}`;
  const hello = sub?.name ? `Hallo ${sub.name.split(' ')[0]},` : '';
  const paragraphs = n.intro
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const body = [
    hello ? `<p style="margin:0 0 16px">${esc(hello)}</p>` : '',
    ...paragraphs.map((p) => `<p style="margin:0 0 16px">${esc(p).replace(/\n/g, '<br>')}</p>`),
    ...items.map(
      (
        i,
        k,
      ) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:${k || paragraphs.length || hello ? 28 : 4}px;border-top:1px solid #e6e4de"><tr><td style="padding-top:24px">
${i.image ? `<a href="${esc(i.url)}"><img src="${esc(i.image)}" alt="${esc(i.alt)}" width="536" style="display:block;width:100%;max-width:536px;height:auto;border:0;border-radius:6px;margin-bottom:16px"></a>` : ''}
<h2 style="margin:0 0 8px;font-size:21px;line-height:1.25"><a href="${esc(i.url)}" style="color:#1c1b19;text-decoration:none">${esc(i.title)}</a></h2>
${i.excerpt ? `<p style="margin:0 0 12px;color:#45443f">${esc(i.excerpt)}</p>` : ''}
<a href="${esc(i.url)}" style="color:${c.accent};font-weight:600;text-decoration:underline">Weiterlesen</a></td></tr></table>`,
    ),
  ].join('\n');
  const footer = `<p style="margin:0">Du bekommst diese E-Mail, weil du den Newsletter von ${esc(s.name)} abonniert hast. <a href="${esc(unsubscribe)}" style="color:#6b6b66">Abmelden</a></p>`;
  const text = [hello, hello ? '' : null, ...paragraphs.flatMap((p) => [p, '']), ...items.flatMap((i) => [i.title, i.excerpt, i.url, '']), '—', `Abmelden: ${unsubscribe}`]
    .filter((x) => x !== null)
    .join('\n');
  return {
    subject: n.subject,
    html: shell(s, body, footer, paragraphs[0] ?? items[0]?.excerpt ?? ''),
    text,
    unsubscribe,
  };
}

/* ---------- sending ---------- */

const running = new Set<string>();
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function mailTo(n: Newsletter, sub: Pick<Subscriber, 'email' | 'name' | 'token'>): Promise<boolean> {
  const s = await getSettings();
  const r = await renderIssue(n, sub);
  return sendMail({
    to: sub.email,
    subject: r.subject,
    text: r.text,
    html: r.html,
    replyTo: s.business.email || undefined,
    // RFC 8058: Gmail and Apple Mail show their own «Abmelden» button.
    headers: {
      'List-Unsubscribe': `<${r.unsubscribe}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
}

export async function sendTest(id: string, to: { email: string; name: string }): Promise<boolean> {
  const [n] = await sql`select * from newsletters where id = ${id}`;
  if (!n) throw notFound();
  return mailTo({ ...(n as unknown as Newsletter), subject: `[Test] ${n.subject}` }, { email: to.email, name: to.name, token: 'vorschau' });
}

/**
 * Sends to every active subscriber who has not got this issue yet. The send
 * log makes it safe to resume after a restart. Paced to stay under the
 * provider's rate limit (Resend: 2 per second on the free plan).
 */
async function deliver(id: string): Promise<void> {
  if (running.has(id)) return;
  running.add(id);
  try {
    const [n] = await sql`select * from newsletters where id = ${id}`;
    if (!n || n.status !== 'sending') return;
    for (;;) {
      const batch = await sql`
        select s.* from subscribers s
        where s.status = 'active' and not exists (select 1 from newsletter_sends x where x.newsletter_id = ${id} and x.subscriber_id = s.id)
        order by s.created_at limit 50`;
      if (!batch.length) break;
      for (const sub of batch) {
        const ok = await mailTo(n as unknown as Newsletter, sub as unknown as Subscriber);
        await sql`insert into newsletter_sends (newsletter_id, subscriber_id, ok) values (${id}, ${sub.id}, ${ok}) on conflict do nothing`;
        await pause(env.mail.resendKey ? 550 : 20);
      }
    }
    const [done] = await sql`
      update newsletters set status = 'sent', sent_at = now(),
        recipients = (select count(*) from newsletter_sends where newsletter_id = ${id} and ok)
      where id = ${id} returning subject, recipients`;
    void notify({
      kind: 'system',
      cap: 'newsletter.manage',
      title: `Newsletter verschickt: ${done.subject}`,
      body: `An ${done.recipients} Abonnent:innen`,
      href: `/newsletter?id=${id}`,
    });
  } finally {
    running.delete(id);
  }
}

export async function startSending(id: string): Promise<Newsletter> {
  const [n] = await sql`update newsletters set status = 'sending' where id = ${id} and status = 'draft' returning *`;
  if (!n) throw badRequest('Diese Ausgabe ist schon verschickt oder wird gerade verschickt.');
  void deliver(id).catch((e) => console.error('[newsletter] Versand abgebrochen:', (e as Error).message));
  return n as unknown as Newsletter;
}

/** Scheduler: picks up sends interrupted by a restart, and the weekly digest. */
export async function newsletterJobs(now = new Date()): Promise<void> {
  const open = await sql`select id from newsletters where status = 'sending'`;
  for (const n of open) if (!running.has(n.id as string)) void deliver(n.id as string).catch(() => {});
  await sql`delete from subscribers where status = 'pending' and created_at < now() - interval '30 days'`;

  const s = await getSettings();
  if (!s.modules.includes('newsletter') || s.newsletter.auto !== 'weekly') return;
  const local = localDay(now, s.timezone);
  if (local.weekday !== s.newsletter.weekday || local.minutes < 8 * 60) return;
  const [last] = await sql`select max(created_at) as at from newsletters where auto`;
  if (last.at && now.getTime() - new Date(last.at).getTime() < 6 * 86_400_000) return;
  const since = last.at ? new Date(last.at) : new Date(now.getTime() - 7 * 86_400_000);
  const posts = await sql`
    select id, published_data ->> 'title' as title from entries
    where collection = 'posts' and status = 'published' and published_at > ${since}
    order by published_at limit 10`;
  if (!posts.length) return;
  const subject = posts.length === 1 ? String(posts[0].title) : `Neu bei ${s.name}: ${posts[0].title} und ${posts.length - 1} weitere`;
  const [n] = await sql`
    insert into newsletters (subject, entry_ids, auto) values (${subject}, ${posts.map((p) => p.id as string)}::uuid[], true) returning id`;
  await sendOrHold(n.id as string, subject);
}

/** Called after a post goes live for the first time. */
export async function onPostPublished(entryId: string, title: string): Promise<void> {
  const s = await getSettings();
  if (!s.modules.includes('newsletter') || s.newsletter.auto !== 'each') return;
  const [n] = await sql`insert into newsletters (subject, entry_ids, auto) values (${title}, ${[entryId]}::uuid[], true) returning id`;
  await sendOrHold(n.id as string, title);
}

/** Without a mail service the issue waits as a draft instead of «going out» to nobody. */
async function sendOrHold(id: string, subject: string): Promise<void> {
  if (mailConfigured()) {
    await startSending(id);
    return;
  }
  void notify({
    kind: 'system',
    cap: 'newsletter.manage',
    title: `Newsletter bereit: ${subject}`,
    body: 'Er wartet als Entwurf, bis ein E-Mail-Dienst eingerichtet ist.',
    href: `/newsletter?id=${id}`,
  });
}

import type { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db";
import { audit, requireCap, type AppEnv } from "../auth";
import { badRequest, notFound } from "../lib/http";
import { getSettings, updateSettings } from "../settings";
import { mailConfigured } from "../mail";
import {
  deleteSubscriber,
  importSubscribers,
  providerName,
  renderIssue,
  sendTest,
  startSending,
  subscribe,
} from "../newsletter";

const issueBody = z.object({
  subject: z.string().trim().min(1, "Gib der Ausgabe einen Betreff.").max(150),
  intro: z.string().max(5000).default(""),
  entry_ids: z.array(z.string().uuid()).max(20).default([]),
});

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  // Leading =, +, -, @ would run as a formula in Excel.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",;\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function newsletterApi(app: Hono<AppEnv>) {
  app.get("/api/newsletter", async (c) => {
    requireCap(c, "newsletter.manage");
    const s = await getSettings();
    const [counts] = await sql`
      select count(*) filter (where status = 'active')::int as active,
             count(*) filter (where status = 'pending')::int as pending,
             count(*) filter (where status = 'unsubscribed')::int as unsubscribed,
             count(*) filter (where status = 'active' and confirmed_at > now() - interval '30 days')::int as new30
      from subscribers`;
    const issues = await sql`
      select n.*, (select count(*)::int from newsletter_sends x where x.newsletter_id = n.id) as done
      from newsletters n order by coalesce(n.sent_at, n.created_at) desc limit 100`;
    const posts = await sql`
      select id, published_data ->> 'title' as title, published_at from entries
      where collection = 'posts' and status = 'published' order by published_at desc limit 30`;
    return c.json({
      counts,
      issues,
      posts,
      provider: providerName(),
      mail: mailConfigured(),
      settings: s.newsletter,
    });
  });

  app.put("/api/newsletter/settings", async (c) => {
    requireCap(c, "newsletter.manage");
    const b = z
      .object({
        auto: z.enum(["off", "each", "weekly"]),
        weekday: z.number().int().min(1).max(7),
      })
      .parse(await c.req.json());
    const s = await updateSettings({ newsletter: b });
    await audit(c, "newsletter.settings", "", "", b);
    return c.json({ settings: s.newsletter });
  });

  /* subscribers */
  app.get("/api/newsletter/subscribers", async (c) => {
    requireCap(c, "newsletter.manage");
    const status = c.req.query("status") ?? "active";
    const q = `%${(c.req.query("q") ?? "").trim().toLowerCase()}%`;
    const rows = await sql`
      select id, email, name, status, source, created_at, confirmed_at, unsubscribed_at from subscribers
      where (${status} = 'all' or status = ${status}) and (lower(email) like ${q} or lower(name) like ${q})
      order by coalesce(confirmed_at, created_at) desc limit 500`;
    return c.json({ subscribers: rows });
  });

  app.get("/api/newsletter/subscribers.csv", async (c) => {
    requireCap(c, "newsletter.manage");
    const rows =
      await sql`select email, name, status, source, created_at, confirmed_at, unsubscribed_at from subscribers order by created_at`;
    const head = [
      "E-Mail",
      "Name",
      "Status",
      "Quelle",
      "Angemeldet",
      "Bestätigt",
      "Abgemeldet",
    ];
    const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : "");
    const body = [
      head,
      ...rows.map((r) => [
        r.email,
        r.name,
        r.status,
        r.source,
        iso(r.created_at),
        iso(r.confirmed_at),
        iso(r.unsubscribed_at),
      ]),
    ]
      .map((r) => r.map(csvCell).join(";"))
      .join("\r\n");
    await audit(c, "newsletter.export");
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header(
      "Content-Disposition",
      `attachment; filename="newsletter-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    return c.body(`﻿${body}`);
  });

  // Added by hand: still goes through the confirmation mail.
  app.post("/api/newsletter/subscribers", async (c) => {
    requireCap(c, "newsletter.manage");
    const b = z
      .object({
        email: z.string().trim(),
        name: z.string().max(80).default(""),
      })
      .parse(await c.req.json());
    await subscribe({ email: b.email, name: b.name, source: "admin" });
    await audit(c, "newsletter.invite", "subscriber", b.email.toLowerCase());
    return c.json({ ok: true });
  });

  app.post("/api/newsletter/import", async (c) => {
    requireCap(c, "newsletter.manage");
    const b = z
      .object({
        text: z.string().max(2_000_000),
        consent: z.literal(true, {
          message: "Bestätige, dass alle Personen eingewilligt haben.",
        }),
      })
      .parse(await c.req.json());
    const rows = b.text
      .split(/\r?\n/)
      .map((line) =>
        line.split(/[;,\t]/).map((x) => x.trim().replace(/^"|"$/g, "")),
      )
      .filter((cells) => cells[0] && cells[0].includes("@"))
      .map((cells) => ({ email: cells[0], name: cells[1] ?? "" }));
    if (!rows.length)
      throw badRequest(
        "In der Liste steht keine E-Mail-Adresse. Eine Adresse pro Zeile, optional mit Name: «anna@beispiel.ch; Anna».",
      );
    const r = await importSubscribers(rows.slice(0, 20_000));
    await audit(c, "newsletter.import", "", "", r);
    return c.json(r);
  });

  app.delete("/api/newsletter/subscribers/:id", async (c) => {
    requireCap(c, "newsletter.manage");
    await deleteSubscriber(c.req.param("id"));
    await audit(c, "newsletter.delete", "subscriber", c.req.param("id"));
    return c.json({ ok: true });
  });

  /* issues */
  app.post("/api/newsletter/preview", async (c) => {
    requireCap(c, "newsletter.manage");
    // While composing the subject may still be empty.
    const b = issueBody
      .extend({ subject: z.string().max(150).default("") })
      .parse(await c.req.json());
    const r = await renderIssue(
      { subject: b.subject, intro: b.intro, entry_ids: b.entry_ids },
      { name: c.get("user")!.name, token: "vorschau" },
    );
    return c.json({ html: r.html, text: r.text });
  });

  app.post("/api/newsletter/issues", async (c) => {
    const u = requireCap(c, "newsletter.manage");
    const b = issueBody.parse(await c.req.json());
    const [row] = await sql`
      insert into newsletters (subject, intro, entry_ids, created_by) values (${b.subject}, ${b.intro}, ${b.entry_ids}::uuid[], ${u.id}) returning *`;
    return c.json({ issue: row });
  });

  app.get("/api/newsletter/issues/:id", async (c) => {
    requireCap(c, "newsletter.manage");
    const [row] = await sql`
      select n.*, (select count(*)::int from newsletter_sends x where x.newsletter_id = n.id) as done,
        (select count(*)::int from subscribers where status = 'active') as audience
      from newsletters n where id = ${c.req.param("id")}`;
    if (!row) throw notFound();
    return c.json({ issue: row });
  });

  app.put("/api/newsletter/issues/:id", async (c) => {
    requireCap(c, "newsletter.manage");
    const b = issueBody.parse(await c.req.json());
    const [row] = await sql`
      update newsletters set subject = ${b.subject}, intro = ${b.intro}, entry_ids = ${b.entry_ids}::uuid[]
      where id = ${c.req.param("id")} and status = 'draft' returning *`;
    if (!row)
      throw badRequest("Verschickte Ausgaben lassen sich nicht mehr ändern.");
    return c.json({ issue: row });
  });

  app.delete("/api/newsletter/issues/:id", async (c) => {
    requireCap(c, "newsletter.manage");
    const [row] =
      await sql`delete from newsletters where id = ${c.req.param("id")} and status = 'draft' returning id`;
    if (!row)
      throw badRequest(
        "Verschickte Ausgaben bleiben als Nachweis gespeichert.",
      );
    return c.json({ ok: true });
  });

  app.post("/api/newsletter/issues/:id/test", async (c) => {
    const u = requireCap(c, "newsletter.manage");
    const ok = await sendTest(c.req.param("id"), {
      email: u.email,
      name: u.name,
    });
    if (!ok)
      throw badRequest(
        mailConfigured()
          ? "Die Test-E-Mail konnte nicht verschickt werden. Details stehen im Protokoll des Servers."
          : "Es ist noch kein E-Mail-Versand eingerichtet (RESEND_API_KEY oder SMTP_URL).",
      );
    return c.json({ ok: true, to: u.email });
  });

  app.post("/api/newsletter/issues/:id/send", async (c) => {
    requireCap(c, "newsletter.manage");
    if (!mailConfigured())
      throw badRequest(
        "Es ist noch kein E-Mail-Versand eingerichtet (RESEND_API_KEY oder SMTP_URL).",
      );
    const [count] =
      await sql`select count(*)::int as n from subscribers where status = 'active'`;
    if (!count.n)
      throw badRequest("Noch niemand hat den Newsletter abonniert.");
    const issue = await startSending(c.req.param("id"));
    await audit(c, "newsletter.send", "newsletter", issue.id, {
      subject: issue.subject,
      audience: count.n,
    });
    return c.json({ issue });
  });
}

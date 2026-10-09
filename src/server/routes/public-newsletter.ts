import type { Context, Hono } from "hono";
import type { AppEnv } from "../auth";
import { html, type Html } from "../../site/html";
import { renderSystemPage } from "../../site/render";
import { getSettings } from "../settings";
import { clientIp } from "../lib/http";
import { rateLimit } from "../lib/ratelimit";
import { recordGoal } from "../analytics";
import {
  confirmSubscription,
  subscribe,
  subscriberByToken,
  unsubscribe,
} from "../newsletter";
import { ctxFor, looksLikeSpam, notFoundPage, sendHtml } from "./public";

/** Sign-up form target, confirmation link and unsubscribe page (also RFC 8058 one-click). */
export function newsletterPublicRoutes(app: Hono<AppEnv>) {
  app.post("/_nova/newsletter", async (c) => {
    const s = await getSettings();
    if (!s.modules.includes("newsletter")) return c.notFound();
    const body = (await c.req.parseBody()) as Record<string, string>;
    const page = String(body._page ?? "/").startsWith("/")
      ? String(body._page)
      : "/";
    const block = String(body._block ?? "")
      .replace(/[^\w-]/g, "")
      .slice(0, 40);
    const back = (params: Record<string, string>) => {
      const u = new URL(page, "http://x");
      for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
      return c.redirect(`${u.pathname}${u.search}#nl-${block}-box`, 303);
    };
    // Bots get the same answer as people, so they learn nothing.
    if (looksLikeSpam(body)) return back({ nl: block });
    if (!rateLimit(`newsletter:${clientIp(c)}`, 5, 10 * 60_000).ok)
      return back({
        nl_err: block,
        meldung: "Zu viele Versuche. Bitte warte ein paar Minuten.",
      });
    try {
      await subscribe({
        email: String(body.email ?? ""),
        name: body.name,
        source: page,
        ip: clientIp(c),
      });
      await recordGoal(
        "newsletter",
        clientIp(c),
        c.req.header("user-agent") ?? "",
        page,
      );
      return back({ nl: block });
    } catch (e) {
      return back({ nl_err: block, meldung: (e as Error).message });
    }
  });

  const page = async (c: Context, title: string, body: Html) => {
    c.header("Cache-Control", "no-store");
    return sendHtml(
      c,
      await renderSystemPage(await ctxFor(c), { title, body, noindex: true }),
    );
  };

  app.get("/newsletter/bestaetigen/:token", async (c) => {
    const s = await getSettings();
    const r = await confirmSubscription(c.req.param("token"));
    if (r.status === "unknown")
      return page(
        c,
        "Link nicht mehr gültig",
        html`<div class="wrap sys-msg">
          <h1>Dieser Link ist nicht mehr gültig.</h1>
          <p>
            Bestätigungslinks verfallen nach 30 Tagen. Melde dich einfach noch
            einmal an.
          </p>
          <p><a class="btn" href="/">Zur Startseite</a></p>
        </div>`,
      );
    return page(
      c,
      "Anmeldung bestätigt",
      html`<div class="wrap sys-msg">
        <p class="label">Newsletter</p>
        <h1>
          ${r.status === "already"
            ? "Du bist schon dabei."
            : "Danke, du bist dabei!"}
        </h1>
        <p>
          Ab jetzt bekommst du Neues von ${s.name} an
          <strong>${r.subscriber!.email}</strong>. Abmelden kannst du dich mit
          dem Link unten in jeder E-Mail.
        </p>
        <p><a class="btn" href="/">Zur Startseite</a></p>
      </div>`,
    );
  });

  app.get("/newsletter/abmelden/:token", async (c) => {
    const s = await getSettings();
    const t = c.req.param("token");
    if (t === "vorschau")
      return page(
        c,
        "Abmelden",
        html`<div class="wrap sys-msg">
          <h1>Vorschau</h1>
          <p>
            In der echten E-Mail führt dieser Link zur Abmeldung der Person, die
            sie bekommen hat.
          </p>
        </div>`,
      );
    const sub = await subscriberByToken(t);
    if (!sub) return notFoundPage(c);
    if (sub.status === "unsubscribed" || c.req.query("fertig"))
      return page(
        c,
        "Abgemeldet",
        html`<div class="wrap sys-msg">
          <p class="label">Newsletter</p>
          <h1>Du bist abgemeldet.</h1>
          <p>
            ${sub.email} bekommt keinen Newsletter von ${s.name} mehr. Schade –
            aber danke fürs Lesen.
          </p>
          <form method="post" action="/newsletter/wieder/${t}">
            <button class="btn-2">Doch wieder anmelden</button>
          </form>
        </div>`,
      );
    return page(
      c,
      "Newsletter abmelden",
      html`<div class="wrap sys-msg">
        <p class="label">Newsletter</p>
        <h1>Abmelden?</h1>
        <p>${sub.email} bekommt dann keinen Newsletter von ${s.name} mehr.</p>
        <form method="post" action="/newsletter/abmelden/${t}">
          <button class="btn">Ja, abmelden</button>
        </form>
      </div>`,
    );
  });

  // The button above, and mail clients' one-click unsubscribe (body «List-Unsubscribe=One-Click»).
  app.post("/newsletter/abmelden/:token", async (c) => {
    const sub = await unsubscribe(c.req.param("token"));
    if (!sub) return c.notFound();
    const form = (await c.req.parseBody().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const oneClick = String(form["List-Unsubscribe"] ?? "") === "One-Click";
    if (oneClick) return c.text("Abgemeldet.");
    return c.redirect(
      `/newsletter/abmelden/${c.req.param("token")}?fertig=1`,
      303,
    );
  });

  app.post("/newsletter/wieder/:token", async (c) => {
    const sub = await subscriberByToken(c.req.param("token"));
    if (!sub) return c.notFound();
    // Back on the list only through a fresh confirmation – same rule as a new sign-up.
    await subscribe({
      email: sub.email,
      name: sub.name,
      source: "wieder angemeldet",
      ip: clientIp(c),
    });
    return page(
      c,
      "Bitte bestätigen",
      html`<div class="wrap sys-msg">
        <p class="label">Newsletter</p>
        <h1>Schau in dein Postfach.</h1>
        <p>
          Wir haben dir eine E-Mail geschickt. Ein Klick auf den Link darin, und
          du bist wieder dabei.
        </p>
      </div>`,
    );
  });
}

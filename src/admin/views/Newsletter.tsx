import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { formatDate, useApi } from "../lib/hooks";
import { Link, navigate, usePath } from "../lib/router";
import { useSession } from "../lib/session";
import { Icon } from "../ui/icons";
import {
  Dialog,
  Empty,
  Field,
  PageHead,
  Segmented,
  Select,
  Skeleton,
  confirm,
} from "../ui/kit";
import { useToast } from "../ui/toast";
import { useLeaveGuard } from "./settingsDraft";

interface Issue {
  id: string;
  subject: string;
  intro: string;
  entry_ids: string[];
  status: "draft" | "sending" | "sent";
  auto: boolean;
  recipients: number;
  done: number;
  audience?: number;
  created_at: string;
  sent_at: string | null;
}
interface Overview {
  counts: {
    active: number;
    pending: number;
    unsubscribed: number;
    new30: number;
  };
  issues: Issue[];
  posts: { id: string; title: string; published_at: string }[];
  provider: string | null;
  mail: boolean;
  settings: { auto: "off" | "each" | "weekly"; weekday: number };
}
interface Subscriber {
  id: string;
  email: string;
  name: string;
  status: "pending" | "active" | "unsubscribed";
  source: string;
  created_at: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
}

const ISSUE_STATUS = {
  draft: { label: "Entwurf", cls: "muted" },
  sending: { label: "Wird verschickt", cls: "warn" },
  sent: { label: "Verschickt", cls: "ok" },
} as const;
const SUB_STATUS = {
  active: { label: "Aktiv", cls: "ok" },
  pending: { label: "Unbestätigt", cls: "warn" },
  unsubscribed: { label: "Abgemeldet", cls: "muted" },
} as const;
const WEEKDAYS = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
];
const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString("de-CH")} ${n === 1 ? one : many}`;

export function Newsletter() {
  const { settings } = useSession();
  const { query } = usePath();
  const overview = useApi<Overview>("/api/newsletter");
  const tab = (query.get("tab") ?? "ausgaben") as
    | "ausgaben"
    | "abonnenten"
    | "automatik";
  const openId = query.get("id");
  const setTab = (t: string) =>
    navigate(`/newsletter?tab=${t}`, { replace: true });

  if (openId)
    return (
      <Compose
        id={openId === "neu" ? null : openId}
        overview={overview.data}
        onChanged={() => void overview.reload()}
      />
    );

  const d = overview.data;
  return (
    <div className="page">
      <PageHead
        back={
          <Link to="/inhalte" className="crumb">
            <Icon name="chevronLeft" size="s" /> Inhalte
          </Link>
        }
        title="Newsletter"
        sub={
          d
            ? `${plural(d.counts.active, "Abonnent:in", "Abonnent:innen")}${d.counts.new30 ? ` · ${d.counts.new30} neu in den letzten 30 Tagen` : ""}`
            : undefined
        }
        actions={
          <button
            className="btn primary"
            onClick={() => navigate("/newsletter?id=neu")}
          >
            <Icon name="plus" size="s" /> Neue Ausgabe
          </button>
        }
      />
      {settings && !settings.modules.includes("newsletter") && (
        <p className="hint" role="note" style={{ marginBottom: "1rem" }}>
          Das Modul ist noch aus. Schalte es unter{" "}
          <Link to="/einstellungen/module">Einstellungen → Module</Link> ein,
          damit der Block «Newsletter-Anmeldung» auf der Website erscheint.
        </p>
      )}
      {d && !d.mail && (
        <p className="hint" role="note" style={{ marginBottom: "1rem" }}>
          Für den Versand fehlt noch ein E-Mail-Dienst. Trag in Railway{" "}
          <span className="mono">RESEND_API_KEY</span> (empfohlen) oder{" "}
          <span className="mono">SMTP_URL</span> ein. Bis dahin kannst du
          Ausgaben vorbereiten.
        </p>
      )}
      <div className="toolbar">
        <Segmented
          label="Bereich"
          value={tab}
          onChange={setTab}
          options={[
            { value: "ausgaben", label: "Ausgaben" },
            {
              value: "abonnenten",
              label: d ? `Abonnent:innen ${d.counts.active}` : "Abonnent:innen",
            },
            { value: "automatik", label: "Automatik" },
          ]}
        />
      </div>
      {!d ? (
        <section className="card">
          <Skeleton lines={4} />
        </section>
      ) : tab === "abonnenten" ? (
        <Subscribers
          counts={d.counts}
          onChanged={() => void overview.reload()}
        />
      ) : tab === "automatik" ? (
        <Automation
          overview={d}
          onSaved={(s) => overview.setData({ ...d, settings: s })}
        />
      ) : (
        <Issues issues={d.issues} />
      )}
    </div>
  );
}

function Issues({ issues }: { issues: Issue[] }) {
  if (!issues.length)
    return (
      <section className="card">
        <Empty
          title="Noch keine Ausgabe"
          action={
            <button
              className="btn primary"
              onClick={() => navigate("/newsletter?id=neu")}
            >
              Erste Ausgabe schreiben
            </button>
          }
        >
          Eine Ausgabe ist ein paar Sätze von dir und die Beiträge, auf die du
          hinweisen möchtest. Nova macht daraus eine E-Mail, die auf dem Handy
          und in Outlook gut aussieht.
        </Empty>
      </section>
    );
  return (
    <section className="card">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Betreff</th>
              <th>Status</th>
              <th>Datum</th>
              <th className="right">Empfänger</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((n) => (
              <tr
                key={n.id}
                className="clickable"
                onClick={() => navigate(`/newsletter?id=${n.id}`)}
              >
                <td>
                  <span className="ellipsis">{n.subject}</span>
                  {n.auto && (
                    <span className="xsmall faint"> · automatisch</span>
                  )}
                </td>
                <td>
                  <span className={`badge ${ISSUE_STATUS[n.status].cls}`}>
                    {ISSUE_STATUS[n.status].label}
                  </span>
                </td>
                <td>{formatDate(n.sent_at ?? n.created_at, true)}</td>
                <td className="right num">
                  {n.status === "sent"
                    ? n.recipients
                    : n.status === "sending"
                      ? n.done
                      : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- compose ---------- */

function Compose({
  id,
  overview,
  onChanged,
}: {
  id: string | null;
  overview: Overview | null;
  onChanged: () => void;
}) {
  const toast = useToast();
  const loaded = useApi<{ issue: Issue }>(
    id ? `/api/newsletter/issues/${id}` : null,
  );
  const [draft, setDraft] = useState<{
    subject: string;
    intro: string;
    entry_ids: string[];
  } | null>(id ? null : { subject: "", intro: "", entry_ids: [] });
  const [saved, setSaved] = useState(
    id ? "" : JSON.stringify({ subject: "", intro: "", entry_ids: [] }),
  );
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "test" | "send">("");
  const issue = loaded.data?.issue ?? null;
  const editable = !issue || issue.status === "draft";

  useEffect(() => {
    if (!issue || draft) return;
    const d = {
      subject: issue.subject,
      intro: issue.intro,
      entry_ids: issue.entry_ids,
    };
    setDraft(d);
    setSaved(JSON.stringify(d));
  }, [issue, draft]);

  // Follow a running send.
  useEffect(() => {
    if (issue?.status !== "sending") return;
    const t = setInterval(() => void loaded.reload(), 2000);
    return () => clearInterval(t);
  }, [issue?.status, loaded]);
  const wasSending = useRef(false);
  useEffect(() => {
    if (issue?.status === "sending") wasSending.current = true;
    else if (issue?.status === "sent" && wasSending.current) {
      wasSending.current = false;
      toast(`Verschickt an ${plural(issue.recipients, "Person", "Personen")}.`);
      onChanged();
    }
  }, [issue?.status, issue?.recipients, toast, onChanged]);

  // Live preview, a moment after typing stops.
  useEffect(() => {
    if (!draft) return;
    const t = setTimeout(async () => {
      try {
        const r = await api.post<{ html: string }>(
          "/api/newsletter/preview",
          draft,
        );
        setPreview(r.html);
      } catch {
        /* the form shows what is wrong on save */
      }
    }, 350);
    return () => clearTimeout(t);
  }, [draft]);

  const dirty = editable && draft !== null && JSON.stringify(draft) !== saved;
  const save = async (): Promise<string | null> => {
    if (!draft) return null;
    setBusy("save");
    try {
      const r = id
        ? await api.put<{ issue: Issue }>(`/api/newsletter/issues/${id}`, draft)
        : await api.post<{ issue: Issue }>("/api/newsletter/issues", draft);
      setSaved(JSON.stringify(draft));
      onChanged();
      if (!id) navigate(`/newsletter?id=${r.issue.id}`, { replace: true });
      else void loaded.reload();
      return r.issue.id;
    } catch (e) {
      toast((e as Error).message, { kind: "bad" });
      return null;
    } finally {
      setBusy("");
    }
  };
  useLeaveGuard(
    dirty,
    async () => Boolean(await save()),
    () => setSaved(JSON.stringify(draft)),
  );

  const test = async () => {
    const at = dirty || !id ? await save() : id;
    if (!at) return;
    setBusy("test");
    try {
      const r = await api.post<{ to: string }>(
        `/api/newsletter/issues/${at}/test`,
      );
      toast(`Test-E-Mail an ${r.to} verschickt.`);
    } catch (e) {
      toast((e as Error).message, { kind: "bad" });
    } finally {
      setBusy("");
    }
  };
  const send = async () => {
    const audience = overview?.counts.active ?? 0;
    const at = dirty || !id ? await save() : id;
    if (!at) return;
    if (
      !(await confirm({
        title: `An ${plural(audience, "Person", "Personen")} verschicken?`,
        message:
          "Verschickte E-Mails lassen sich nicht zurückholen. Am besten schickst du dir vorher eine Test-E-Mail.",
        confirm: "Jetzt verschicken",
      }))
    )
      return;
    setBusy("send");
    try {
      await api.post(`/api/newsletter/issues/${at}/send`);
      await loaded.reload();
      onChanged();
    } catch (e) {
      toast((e as Error).message, { kind: "bad" });
    } finally {
      setBusy("");
    }
  };
  const remove = async () => {
    if (
      !id ||
      !(await confirm({
        title: "Entwurf löschen?",
        confirm: "Löschen",
        danger: true,
      }))
    )
      return;
    await api.del(`/api/newsletter/issues/${id}`);
    setSaved(JSON.stringify(draft));
    onChanged();
    navigate("/newsletter", { replace: true });
  };

  const posts = overview?.posts ?? [];
  const toggle = (pid: string) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            entry_ids: d.entry_ids.includes(pid)
              ? d.entry_ids.filter((x) => x !== pid)
              : [...d.entry_ids, pid],
          }
        : d,
    );
  // Suggest a subject from the first post, as long as none is typed.
  const subjectHint = draft?.entry_ids.length
    ? posts.find((p) => p.id === draft.entry_ids[0])?.title
    : undefined;

  return (
    <div className="page wide">
      <PageHead
        back={
          <Link to="/newsletter" className="crumb">
            <Icon name="chevronLeft" size="s" /> Newsletter
          </Link>
        }
        title={issue ? issue.subject : "Neue Ausgabe"}
        sub={
          issue?.status === "sent"
            ? `Verschickt am ${formatDate(issue.sent_at, true)} an ${plural(issue.recipients, "Person", "Personen")}`
            : issue?.status === "sending"
              ? "Wird gerade verschickt …"
              : "Ein paar Sätze von dir, dazu die Beiträge, auf die du hinweisen möchtest."
        }
        actions={
          editable && (
            <>
              {id && (
                <button
                  className="btn ghost"
                  onClick={remove}
                  aria-label="Entwurf löschen"
                >
                  <Icon name="trash" size="s" />
                </button>
              )}
              <button
                className="btn"
                onClick={test}
                disabled={!!busy || !draft?.subject.trim()}
                data-busy={busy === "test" || undefined}
              >
                <Icon name="mail" size="s" /> Test an mich
              </button>
              <button
                className="btn"
                onClick={() => void save()}
                disabled={!!busy || !dirty}
                data-busy={busy === "save" || undefined}
              >
                Speichern
              </button>
              <button
                className="btn primary"
                onClick={send}
                disabled={
                  !!busy || !draft?.subject.trim() || !overview?.counts.active
                }
                data-busy={busy === "send" || undefined}
              >
                <Icon name="publish" size="s" /> Verschicken
              </button>
            </>
          )
        }
      />
      {issue?.status === "sending" && (
        <div className="card card-pad stack tight" role="status">
          <div className="row between small">
            <span>
              Wird verschickt – du kannst das Fenster schliessen, der Versand
              läuft weiter.
            </span>
            <span className="num">
              {issue.done} / {issue.audience ?? "…"}
            </span>
          </div>
          <div
            className="meter"
            role="progressbar"
            aria-label="Versand"
            aria-valuemin={0}
            aria-valuemax={issue.audience ?? 0}
            aria-valuenow={issue.done}
          >
            <span
              style={{
                width: `${issue.audience ? Math.min(100, (issue.done / issue.audience) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      )}
      {!draft ? (
        <Skeleton lines={6} />
      ) : (
        <div className="preview-split">
          <div className="stack" style={{ alignContent: "start" }}>
            <section className="card card-pad stack">
              <Field
                label="Betreff"
                help="Kurz und konkret. Er entscheidet, ob jemand die E-Mail öffnet."
              >
                <input
                  className="input"
                  value={draft.subject}
                  maxLength={150}
                  disabled={!editable}
                  placeholder={subjectHint ?? "Was gibt es Neues?"}
                  onChange={(e) =>
                    setDraft({ ...draft, subject: e.target.value })
                  }
                />
              </Field>
              {editable && !draft.subject && subjectHint && (
                <button
                  className="linkish small"
                  style={{ justifySelf: "start" }}
                  onClick={() => setDraft({ ...draft, subject: subjectHint })}
                >
                  «{subjectHint}» als Betreff übernehmen
                </button>
              )}
              <Field
                label="Einleitung"
                help="Optional. Leerzeilen trennen Absätze. Die Anrede «Hallo …» setzt Nova selbst, wenn der Vorname bekannt ist."
              >
                <textarea
                  className="textarea"
                  rows={6}
                  value={draft.intro}
                  disabled={!editable}
                  maxLength={5000}
                  onChange={(e) =>
                    setDraft({ ...draft, intro: e.target.value })
                  }
                />
              </Field>
            </section>
            <section className="card">
              <div className="card-head">
                <h2>Beiträge</h2>
                <span className="xsmall muted">
                  {draft.entry_ids.length
                    ? `${draft.entry_ids.length} ausgewählt – in dieser Reihenfolge`
                    : "Mit Titelbild, Kurzfassung und Link"}
                </span>
              </div>
              {!posts.length ? (
                <p className="form-section small muted">
                  Noch keine veröffentlichten Beiträge. Eine Ausgabe geht auch
                  nur mit Text.
                </p>
              ) : (
                <div className="list">
                  {posts.map((p) => {
                    const pos = draft.entry_ids.indexOf(p.id);
                    return (
                      <label
                        key={p.id}
                        className="list-item check"
                        style={{ alignItems: "center" }}
                      >
                        <input
                          type="checkbox"
                          checked={pos >= 0}
                          disabled={!editable}
                          onChange={() => toggle(p.id)}
                        />
                        <span className="grow ellipsis">{p.title}</span>
                        {pos >= 0 && draft.entry_ids.length > 1 && (
                          <span className="badge">{pos + 1}</span>
                        )}
                        <span className="xsmall faint">
                          {formatDate(p.published_at)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
          <div className="live-preview">
            <header>
              <Icon name="mail" size="s" /> So sieht die E-Mail aus
            </header>
            {preview ? (
              <iframe title="Vorschau der E-Mail" srcDoc={preview} sandbox="" />
            ) : (
              <Skeleton lines={8} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- subscribers ---------- */

function Subscribers({
  counts,
  onChanged,
}: {
  counts: Overview["counts"];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [status, setStatus] = useState<
    "active" | "pending" | "unsubscribed" | "all"
  >("active");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const list = useApi<{ subscribers: Subscriber[] }>(
    `/api/newsletter/subscribers?status=${status}&q=${encodeURIComponent(term)}`,
  );
  const [dialog, setDialog] = useState<"" | "invite" | "import">("");

  const remove = async (s: Subscriber) => {
    if (
      !(await confirm({
        title: `${s.email} entfernen?`,
        message:
          "Die Adresse wird ganz gelöscht, auch der Nachweis der Anmeldung. Wer sich nur abmelden möchte, macht das selbst über den Link in jeder E-Mail.",
        confirm: "Entfernen",
        danger: true,
      }))
    )
      return;
    try {
      await api.del(`/api/newsletter/subscribers/${s.id}`);
      list.setData((d) =>
        d ? { subscribers: d.subscribers.filter((x) => x.id !== s.id) } : d,
      );
      onChanged();
    } catch (e) {
      toast((e as Error).message, { kind: "bad" });
    }
  };

  return (
    <>
      <div className="toolbar">
        <Segmented
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "active", label: `Aktiv ${counts.active}` },
            { value: "pending", label: `Unbestätigt ${counts.pending}` },
            {
              value: "unsubscribed",
              label: `Abgemeldet ${counts.unsubscribed}`,
            },
            { value: "all", label: "Alle" },
          ]}
        />
        <input
          className="input"
          type="search"
          placeholder="Suchen …"
          aria-label="Abonnent:innen suchen"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: "16rem" }}
        />
        <span className="grow" />
        <a className="btn" href="/api/newsletter/subscribers.csv" download>
          <Icon name="download" size="s" /> CSV
        </a>
        <button className="btn" onClick={() => setDialog("import")}>
          <Icon name="upload" size="s" /> Importieren
        </button>
        <button className="btn" onClick={() => setDialog("invite")}>
          <Icon name="plus" size="s" /> Einladen
        </button>
      </div>
      <section className="card">
        {!list.data ? (
          <Skeleton />
        ) : !list.data.subscribers.length ? (
          <Empty
            title={
              term
                ? "Niemand gefunden"
                : status === "active"
                  ? "Noch niemand dabei"
                  : "Hier ist niemand"
            }
          >
            {status === "active" && !term
              ? "Füg den Block «Newsletter-Anmeldung» auf einer Seite ein – zum Beispiel unter deinen Beiträgen. Wer sich einträgt und die E-Mail bestätigt, erscheint hier."
              : undefined}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>E-Mail</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Seit</th>
                  <th>Quelle</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.data.subscribers.map((s) => (
                  <tr key={s.id}>
                    <td className="ellipsis">{s.email}</td>
                    <td>{s.name || <span className="faint">–</span>}</td>
                    <td>
                      <span className={`badge ${SUB_STATUS[s.status].cls}`}>
                        {SUB_STATUS[s.status].label}
                      </span>
                    </td>
                    <td>
                      {formatDate(
                        s.unsubscribed_at ?? s.confirmed_at ?? s.created_at,
                      )}
                    </td>
                    <td className="small muted ellipsis">
                      {s.source === "admin"
                        ? "eingeladen"
                        : s.source === "import"
                          ? "importiert"
                          : s.source || "–"}
                    </td>
                    <td className="right">
                      <button
                        className="btn ghost small"
                        onClick={() => remove(s)}
                        aria-label={`${s.email} entfernen`}
                      >
                        <Icon name="trash" size="s" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <InviteDialog
        open={dialog === "invite"}
        onClose={() => setDialog("")}
        onDone={() => {
          setStatus("pending");
          void list.reload();
          onChanged();
        }}
      />
      <ImportDialog
        open={dialog === "import"}
        onClose={() => setDialog("")}
        onDone={() => {
          setStatus("active");
          void list.reload();
          onChanged();
        }}
      />
    </>
  );
}

function InviteDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.post("/api/newsletter/subscribers", { email, name });
      toast(`Bestätigungs-E-Mail an ${email} verschickt.`);
      setEmail("");
      setName("");
      onDone();
      onClose();
    } catch (e) {
      toast((e as Error).message, { kind: "bad" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Person einladen"
      description="Sie bekommt eine E-Mail mit einem Link zum Bestätigen. Erst dann ist sie dabei – so verlangt es das Gesetz."
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="E-Mail">
          <input
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Vorname" help="Optional, für die Anrede.">
          <input
            className="input"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button
            className="btn primary"
            disabled={busy}
            data-busy={busy || undefined}
          >
            Einladung schicken
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function ImportDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const lines = useMemo(
    () => text.split(/\r?\n/).filter((l) => l.includes("@")).length,
    [text],
  );
  const readFile = async (f: File) => setText(await f.text());
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ added: number; skipped: number }>(
        "/api/newsletter/import",
        { text, consent },
      );
      toast(
        `${plural(r.added, "Adresse", "Adressen")} übernommen${r.skipped ? `, ${r.skipped} übersprungen (schon da oder ungültig)` : ""}.`,
      );
      setText("");
      setConsent(false);
      onDone();
      onClose();
    } catch (e) {
      toast((e as Error).message, { kind: "bad" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Liste importieren"
      description="Zum Beispiel aus Mailchimp, Brevo oder einer Excel-Liste. Eine Adresse pro Zeile, optional mit Name dahinter."
    >
      <div className="stack">
        <Field label="Adressen">
          <textarea
            className="textarea mono"
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"anna@beispiel.ch; Anna\nbeat@beispiel.ch"}
          />
        </Field>
        <label className="btn" style={{ justifySelf: "start" }}>
          <Icon name="upload" size="s" /> CSV-Datei wählen
          <input
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="sr"
            onChange={(e) =>
              e.target.files?.[0] && void readFile(e.target.files[0])
            }
          />
        </label>
        <label className="check small">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            Alle diese Personen haben dem Newsletter zugestimmt, und ich kann
            das belegen. Sie bekommen keine Bestätigungs-E-Mail.
          </span>
        </label>
        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button
            className="btn primary"
            disabled={!lines || !consent || busy}
            data-busy={busy || undefined}
            onClick={submit}
          >
            {lines
              ? `${plural(lines, "Adresse", "Adressen")} importieren`
              : "Importieren"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/* ---------- automation ---------- */

function Automation({
  overview,
  onSaved,
}: {
  overview: Overview;
  onSaved: (s: Overview["settings"]) => void;
}) {
  const toast = useToast();
  const [auto, setAuto] = useState(overview.settings.auto);
  const [weekday, setWeekday] = useState(overview.settings.weekday);
  const [busy, setBusy] = useState(false);
  const dirty =
    auto !== overview.settings.auto || weekday !== overview.settings.weekday;
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.put<{ settings: Overview["settings"] }>(
        "/api/newsletter/settings",
        { auto, weekday },
      );
      onSaved(r.settings);
      toast("Gespeichert.");
      return true;
    } catch (e) {
      toast((e as Error).message, { kind: "bad" });
      return false;
    } finally {
      setBusy(false);
    }
  };
  useLeaveGuard(dirty, save, () => {
    setAuto(overview.settings.auto);
    setWeekday(overview.settings.weekday);
  });
  return (
    <div className="stack">
      <section className="card card-pad stack">
        <div className="stack" style={{ maxWidth: "26rem" }}>
          <Field label="Neue Beiträge automatisch verschicken">
            <Select
              label="Neue Beiträge automatisch verschicken"
              value={auto}
              onChange={(v) => setAuto(v as typeof auto)}
              options={[
                { value: "off", label: "Nein, ich verschicke von Hand" },
                { value: "each", label: "Jeden neuen Beitrag sofort" },
                { value: "weekly", label: "Einmal pro Woche als Rückblick" },
              ]}
            />
          </Field>
          {auto === "weekly" && (
            <Field
              label="Wochentag"
              help="Ab 8 Uhr, nur wenn es in der Woche etwas Neues gab."
            >
              <Select
                label="Wochentag"
                value={String(weekday)}
                onChange={(v) => setWeekday(Number(v))}
                options={WEEKDAYS.map((w, i) => ({
                  value: String(i + 1),
                  label: w,
                }))}
              />
            </Field>
          )}
        </div>
        <p className="small muted">
          {auto === "each"
            ? "Sobald ein Beitrag zum ersten Mal online geht, bekommen alle Abonnent:innen eine E-Mail mit Titelbild, Kurzfassung und Link. Spätere Änderungen lösen nichts mehr aus."
            : auto === "weekly"
              ? "Alle Beiträge der letzten Woche in einer E-Mail. Gab es nichts Neues, geht nichts raus."
              : "Du stellst jede Ausgabe selbst zusammen und entscheidest, wann sie rausgeht."}
        </p>
        <div className="row">
          <button
            className="btn primary"
            disabled={!dirty || busy}
            data-busy={busy || undefined}
            onClick={() => void save()}
          >
            Speichern
          </button>
        </div>
      </section>
      <section className="card card-pad stack tight">
        <h2 style={{ fontSize: "var(--t-m)", fontWeight: 650 }}>
          Anbindung an Brevo oder Mailchimp
        </h2>
        {overview.provider ? (
          <p className="small">
            Die Liste wird laufend mit <strong>{overview.provider}</strong>{" "}
            abgeglichen: Anmeldungen, Abmeldungen und Löschungen. Verschickt
            wird weiterhin von hier.
          </p>
        ) : (
          <p className="small muted">
            Optional. Wenn du die Liste zusätzlich dort haben möchtest, trag in
            Railway <span className="mono">BREVO_API_KEY</span> und{" "}
            <span className="mono">BREVO_LIST_ID</span> ein – oder{" "}
            <span className="mono">MAILCHIMP_API_KEY</span> und{" "}
            <span className="mono">MAILCHIMP_LIST_ID</span>.
          </p>
        )}
      </section>
    </div>
  );
}

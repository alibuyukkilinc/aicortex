import { useContext, useState } from "react";
import type { ApiError} from "./api";
import { api, useApi } from "./api";
import { LangContext, useLabels, useT } from "./i18n";
import { SchemaForm } from "./SchemaForm";
import type { Item, NodeSummary, Reply, Schema } from "./types";
import { ActorChip, Ago, Drawer, ErrorBox, Icon, Loading, Markdown, Modal, StatusChip, TypeChip, go, useSession, useToast } from "./ui";

export function useSchema(type: string | null) {
  const { data } = useApi<{ rules: Record<string, Schema> }>(type ? `/api/rules/${type}` : null);
  return type ? (data?.rules[type] ?? null) : null;
}

// Flat list of every knowledge path, for "which branch does this belong to" pickers.
export function useBranches(): string[] {
  const { data } = useApi<{ node: NodeSummary }>("/api/tree?depth=5");
  const out: string[] = [];
  const walk = (n: NodeSummary) => {
    if (n.path) out.push(n.path);
    n.children?.forEach(walk);
  };
  if (data) walk(data.node);
  return out;
}

export function nextStatuses(schema: Schema, from: string): string[] {
  if (schema.transitions === "any") return schema.statuses.filter((s) => s !== from);
  return schema.transitions[from] ?? [];
}

// ---- item detail -------------------------------------------------------------------

export function ItemDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useT();
  const label = useLabels();
  const toast = useToast();
  const { actors, me, ask } = useSession();
  const { data, error, loading, reload } = useApi<{ item: Item; replies: Reply[] }>(`/api/items/${id}`);
  const schema = useSchema(data?.item.type ?? null);
  const [body, setBody] = useState("");
  const [replyFields, setReplyFields] = useState<Record<string, unknown>>({});
  const [replyStatus, setReplyStatus] = useState("");
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  if (loading || !data) {
    return (
      <Drawer onClose={onClose} head={<span />}>
        {error ? <ErrorBox error={error} /> : <Loading />}
      </Drawer>
    );
  }
  const { item, replies } = data;
  const next = schema ? nextStatuses(schema, item.status) : [];

  const move = async (status: string, force = false) => {
    try {
      await api(`/api/items/${id}`, { method: "PATCH", body: { status, ...(force ? { force } : {}) } });
      toast({ text: `${t("board.moved")} ${label.status(status)}` });
      reload();
    } catch (e) {
      const ae = e as ApiError;
      toast({
        text: ae.message,
        error: true,
        ...(ae.code === "invalid_transition" && me.kind === "human" ? { action: { label: t("board.force"), run: () => void move(status, true) } } : {}),
      });
    }
  };

  const assign = async (assignee: string) => {
    try {
      await api(`/api/items/${id}`, { method: "PATCH", body: { assignee: assignee || null } });
      reload();
    } catch (e) {
      toast({ text: (e as Error).message, error: true });
    }
  };

  const claim = async () => {
    try {
      await api(`/api/items/${id}/claim`, { method: "POST", body: { action: "claim", force: me.kind === "human" } });
      reload();
    } catch (e) {
      toast({ text: (e as Error).message, error: true });
    }
  };
  const release = async (heldByMe: boolean) => {
    try {
      await api(`/api/items/${id}/claim`, { method: "POST", body: { action: "release", note: note || undefined, force: !heldByMe } });
      setNote("");
      reload();
    } catch (e) {
      toast({ text: (e as Error).message, error: true });
    }
  };

  const sendReply = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/items/${id}/replies`, { method: "POST", body: { body, fields: replyFields, ...(replyStatus ? { status: replyStatus } : {}) } });
      setBody("");
      setReplyFields({});
      setReplyStatus("");
      reload();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  const fieldEntries = Object.entries(item.fields ?? {});
  return (
    <Drawer
      onClose={onClose}
      head={
        <>
          <div className="row" style={{ gap: 6, marginBottom: 6 }}>
            <TypeChip type={item.type} />
            <StatusChip status={item.status} />
            {item.fields?.blocking === true && <span className="chip danger">{t("item.blocking")}</span>}
          </div>
          <h2>{item.title}</h2>
          <div className="row muted" style={{ gap: 6, marginTop: 6, fontSize: 12.5 }}>
            {t("common.by")} <ActorChip id={item.author} actors={actors} /> · <Ago iso={item.created_at} />
          </div>
        </>
      }
    >
      <div className="row" style={{ marginBottom: 16 }}>
        <label className="muted" style={{ fontSize: 12.5 }}>{t("item.status")}</label>
        <select className="select" style={{ width: "auto" }} value="" onChange={(e) => e.target.value && void move(e.target.value)}>
          <option value="">{label.status(item.status)} →</option>
          {next.map((s) => (
            <option key={s} value={s}>
              {label.status(s)}
              {schema?.human_only_statuses.includes(s) ? ` (${t("board.humanOnly")})` : ""}
            </option>
          ))}
        </select>
        <label className="muted" style={{ fontSize: 12.5 }}>{t("item.assignee")}</label>
        <select className="select" style={{ width: "auto" }} value={item.assignee ?? ""} onChange={(e) => void assign(e.target.value)}>
          <option value="">{t("common.unassigned")}</option>
          <option value="@humans">@humans</option>
          <option value="@ai">@ai</option>
          {actors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.id}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <button className="btn sm" onClick={() => ask(item.id, item.title)}>
          <Icon name="ask" /> {t("tree.ask")}
        </button>
      </div>

      <div className="row" style={{ marginBottom: 16, gap: 8 }}>
        <label className="muted" style={{ fontSize: 12.5 }}>{t("item.claim")}</label>
        {item.claimed_by ? (
          <>
            <ActorChip id={item.claimed_by} actors={actors} />
            <span className="muted" style={{ fontSize: 11.5 }}>
              <Ago iso={item.claimed_at!} />
            </span>
            {item.claimed_by === me.id && (
              <input className="input" style={{ width: 200 }} placeholder={t("item.handoffNote")} value={note} onChange={(e) => setNote(e.target.value)} />
            )}
            {(item.claimed_by === me.id || me.kind === "human") && (
              <button className="btn sm" onClick={() => void release(item.claimed_by === me.id)}>
                {t("item.release")}
              </button>
            )}
          </>
        ) : (
          <button className="btn sm" onClick={() => void claim()}>
            {t("item.claimBtn")}
          </button>
        )}
      </div>

      <Markdown text={item.body} />
      {item.handoff_note && (
        <p className="muted" style={{ fontSize: 12.5, fontStyle: "italic" }}>
          {t("item.handoffNote")}: {item.handoff_note}
        </p>
      )}

      {(fieldEntries.length > 0 || item.category_path || item.links) && (
        <div className="section">
          <h3>{t("item.fields")}</h3>
          <dl className="kv">
            {item.category_path && (
              <>
                <dt>{t("item.category")}</dt>
                <dd>
                  <a href={`#/knowledge/${item.category_path}`}>{item.category_path}</a>
                </dd>
              </>
            )}
            {fieldEntries.map(([k, v]) => (
              <FieldRow key={k} name={k} value={v} />
            ))}
            {item.links?.activity?.length ? (
              <>
                <dt>{t("nav.activity")}</dt>
                <dd>
                  {item.links.activity.map((a) => (
                    <a key={a} href={`#/activity?focus=${a}`} className="mono" style={{ marginRight: 8 }}>
                      {a.slice(-8)}
                    </a>
                  ))}
                </dd>
              </>
            ) : null}
            {item.links?.nodes?.length ? (
              <>
                <dt>{t("nav.knowledge")}</dt>
                <dd>
                  {item.links.nodes.map((p) => (
                    <a key={p} href={`#/knowledge/${p}`} style={{ marginRight: 8 }}>
                      {p || "(root)"}
                    </a>
                  ))}
                </dd>
              </>
            ) : null}
            {item.links?.items?.length ? (
              <>
                <dt>{t("item.links")}</dt>
                <dd>
                  {item.links.items.map((i) => (
                    <a key={i} href={`#/item/${i}`} className="mono" style={{ marginRight: 8 }}>
                      {i.slice(-8)}
                    </a>
                  ))}
                </dd>
              </>
            ) : null}
            {item.links?.code?.length ? (
              <>
                <dt>{t("tree.code")}</dt>
                <dd>
                  {item.links.code.map((c) => (
                    <span key={c.file} className="chip mono" style={{ marginRight: 4 }}>
                      {c.file}
                      {c.lines ? `:${c.lines}` : ""}
                    </span>
                  ))}
                </dd>
              </>
            ) : null}
          </dl>
        </div>
      )}

      <div className="section">
        <h3>
          {t("item.replies")} ({replies.length})
        </h3>
        {replies.map((r) => (
          <div className="reply" key={r.id}>
            <div className="reply-head">
              <ActorChip id={r.author} actors={actors} />
              <Ago iso={r.created_at} />
              {r.status_change && (
                <span>
                  {t("item.statusChange")} <StatusChip status={r.status_change.from} /> → <StatusChip status={r.status_change.to} />
                </span>
              )}
            </div>
            <Markdown text={r.body} />
            {r.fields && Object.keys(r.fields).length > 0 && (
              <dl className="kv" style={{ marginTop: 8 }}>
                {Object.entries(r.fields).map(([k, v]) => (
                  <FieldRow key={k} name={k} value={v} />
                ))}
              </dl>
            )}
          </div>
        ))}

        <div className="card" style={{ padding: 12, marginTop: 8 }}>
          <textarea className="textarea" placeholder={t("item.replyPlaceholder")} value={body} onChange={(e) => setBody(e.target.value)} />
          {schema?.reply?.fields && Object.keys(schema.reply.fields).length > 0 && (
            <div style={{ marginTop: 10 }}>
              <SchemaForm fields={schema.reply.fields} value={replyFields} onChange={setReplyFields} actors={actors} />
            </div>
          )}
          <ErrorBox error={err} />
          <div className="row" style={{ marginTop: 10 }}>
            <select className="select" style={{ width: "auto" }} value={replyStatus} onChange={(e) => setReplyStatus(e.target.value)}>
              <option value="">{label.status(item.status)}</option>
              {next.map((s) => (
                <option key={s} value={s}>
                  → {label.status(s)}
                </option>
              ))}
            </select>
            <span className="spacer" />
            <button className="btn primary" disabled={busy || !body.trim()} onClick={() => void sendReply()}>
              {t("item.reply")}
            </button>
          </div>
        </div>
      </div>

      {schema?.ai_instructions && (
        <details className="section">
          <summary className="muted" style={{ cursor: "pointer" }}>
            {t("item.rules")}
          </summary>
          <p className="muted">{schema.ai_instructions}</p>
          <a href={`#/rules/${item.type}`}>{t("nav.rules")} →</a>
        </details>
      )}
    </Drawer>
  );
}

function FieldRow({ name, value }: { name: string; value: unknown }) {
  const t = useT();
  const { lang } = useContext(LangContext);
  const label = useLabels();
  const text = Array.isArray(value)
    ? value.join(", ")
    : typeof value === "boolean"
      ? t(value ? "common.yes" : "common.no")
      : typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T00:00:00`).toLocaleDateString(lang, { day: "numeric", month: "long", year: "numeric" })
        : typeof value === "string"
          ? label.value(value)
        : String(value ?? "");
  return (
    <>
      <dt>{label.field(name)}</dt>
      <dd style={{ whiteSpace: "pre-wrap" }}>{text}</dd>
    </>
  );
}

// ---- create --------------------------------------------------------------------------

export function NewItemDialog({ type, onClose, defaultPath }: { type: string; onClose: () => void; defaultPath?: string }) {
  const t = useT();
  const label = useLabels();
  const { actors, itemTypes } = useSession();
  const [kind, setKind] = useState(type);
  const schema = useSchema(kind);
  const branches = useBranches();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState(defaultPath ?? "");
  const [assignee, setAssignee] = useState("");
  const [fields, setFields] = useState<Record<string, unknown>>({});
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ id: string }>("/api/items", {
        method: "POST",
        body: { type: kind, title, body, fields, ...(category ? { category_path: category } : {}), ...(assignee ? { assignee } : {}) },
      });
      onClose();
      go(`item/${r.id}`);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title={t("item.new")}>
      <div className="grid2">
        <div className="field">
          <label>{t("board.type")}</label>
          <select className="select" value={kind} onChange={(e) => (setKind(e.target.value), setFields({}))}>
            {itemTypes.map((x) => (
              <option key={x} value={x}>
                {label.type(x)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{t("item.assignee")}</label>
          <select className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">{t("common.unassigned")}</option>
            <option value="@humans">@humans</option>
            <option value="@ai">@ai</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.id} ({a.kind})
              </option>
            ))}
          </select>
        </div>
      </div>
      {schema?.description && <p className="muted" style={{ marginTop: 0 }}>{label.description(kind, schema.description)}</p>}
      <div className="field">
        <label>
          {t("item.title")} <span className="req">*</span>
        </label>
        <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label>
          {t("item.category")} {schema?.category_required && <span className="req">*</span>}
        </label>
        <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">—</option>
          {branches.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>{t("item.body")}</label>
        <textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      {schema && <SchemaForm fields={schema.fields} value={fields} onChange={setFields} actors={actors} />}
      <ErrorBox error={err} />
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button className="btn primary" disabled={busy || !title.trim()} onClick={() => void submit()}>
          {t("common.create")}
        </button>
      </div>
    </Modal>
  );
}

// ---- ask about anything ----------------------------------------------------------------

export function AskDialog({ about, label, onClose }: { about: string; label: string; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [blocking, setBlocking] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  const submit = async () => {
    setErr(null);
    try {
      const r = await api<{ id: string }>("/api/ask", { method: "POST", body: { about, title, body, blocking } });
      const item = await api<{ item: Item }>(`/api/items/${r.id}`);
      toast({ text: `${t("ask.sent")} ${item.item.assignee}` });
      onClose();
    } catch (e) {
      setErr(e);
    }
  };

  return (
    <Modal onClose={onClose} title={t("ask.title")}>
      <p className="muted" style={{ marginTop: 0 }}>
        {t("ask.about")}: <strong>{label}</strong>
      </p>
      <div className="field">
        <label>{t("ask.question")}</label>
        <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label>{t("ask.details")}</label>
        <textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <label className="check">
        <input type="checkbox" checked={blocking} onChange={(e) => setBlocking(e.target.checked)} /> {t("ask.blocking")}
      </label>
      <ErrorBox error={err} />
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button className="btn primary" disabled={!title.trim()} onClick={() => void submit()}>
          {t("common.send")}
        </button>
      </div>
    </Modal>
  );
}

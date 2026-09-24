import { useContext, useEffect, useState } from "react";
import type { ApiError } from "./api";
import { api, useApi } from "./api";
import { LangContext, useLabels, useT } from "./i18n";
import { SchemaForm } from "./SchemaForm";
import type { Attachment, Item, NodeSummary, Reply, Schema } from "./types";
import type { PendingFile } from "./attachments";
import {
  AttachmentGrid,
  MAX_BYTES,
  MarkdownField,
  PendingList,
  filesBase,
  formatSize,
  markdownRef,
  pendingName,
  safeName,
  uploadFile,
  useDropZone,
  usePasteFiles,
} from "./attachments";
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
  const { actors, me, ask, can } = useSession();
  const { data, error, loading, reload } = useApi<{ item: Item; replies: Reply[]; attachments?: Attachment[] }>(`/api/items/${id}`);
  const [uploading, setUploading] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null); // the description being edited, or null
  const canWrite = can("write_items");

  // Stores files on this item, one by one, and returns the names the server gave them.
  const upload = async (list: File[]): Promise<string[]> => {
    const names: string[] = [];
    for (const f of list) {
      if (f.size > MAX_BYTES) {
        toast({ text: t("att.tooBig").replace("{name}", f.name).replace("{size}", formatSize(MAX_BYTES)), error: true });
        continue;
      }
      setUploading((u) => [...u, f.name]);
      try {
        names.push((await uploadFile(id, f, f.name)).name);
      } catch (e) {
        toast({ text: `${f.name}: ${(e as Error).message}`, error: true });
      } finally {
        setUploading((u) => u.filter((n) => n !== f.name));
      }
    }
    if (names.length) {
      toast({ text: t("att.added").replace("{n}", String(names.length)) });
      reload();
    }
    return names;
  };
  const drop = useDropZone((list) => canWrite && void upload(list));
  usePasteFiles((list) => canWrite && void upload(list), t("att.screenshot"));

  const saveBody = async (text: string) => {
    try {
      const r = await api<{ applied: boolean; message: string }>(`/api/items/${id}`, { method: "PATCH", body: { body: text } });
      if (!r.applied) toast({ text: r.message });
      setEditing(null);
      reload();
    } catch (e) {
      toast({ text: (e as Error).message, error: true });
    }
  };
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

  // A status picked with nothing written is a plain move: the same PATCH the board cards use, so
  // "I am done with this" never forces a sentence nobody needs.
  const sendReply = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (!body.trim() && replyStatus) {
        await move(replyStatus);
      } else {
        await api(`/api/items/${id}/replies`, { method: "POST", body: { body, fields: replyFields, ...(replyStatus ? { status: replyStatus } : {}) } });
        reload();
      }
      setBody("");
      setReplyFields({});
      setReplyStatus("");
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
          <div className="row muted" style={{ gap: 6, marginTop: 6, fontSize: 12 }}>
            {t("common.by")} <ActorChip id={item.author} actors={actors} /> · <Ago iso={item.created_at} />
          </div>
        </>
      }
    >
      <div className="row" style={{ marginBottom: 16 }}>
        <label htmlFor="items-item-status" className="muted" style={{ fontSize: 12 }}>
          {t("item.status")}
        </label>
        <select id="items-item-status" className="select" style={{ width: "auto" }} value="" onChange={(e) => e.target.value && void move(e.target.value)}>
          <option value="">{label.status(item.status)} →</option>
          {next.map((s) => (
            <option key={s} value={s}>
              {label.status(s)}
              {schema?.human_only_statuses.includes(s) ? ` (${t("board.humanOnly")})` : ""}
            </option>
          ))}
        </select>
        <label htmlFor="items-item-assignee" className="muted" style={{ fontSize: 12 }}>
          {t("item.assignee")}
        </label>
        <select id="items-item-assignee" className="select" style={{ width: "auto" }} value={item.assignee ?? ""} onChange={(e) => void assign(e.target.value)}>
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
        <span className="muted" style={{ fontSize: 12 }}>
          {t("item.claim")}
        </span>
        {item.claimed_by ? (
          <>
            <ActorChip id={item.claimed_by} actors={actors} />
            <span className="muted" style={{ fontSize: 11 }}>
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

      <div className={`drop-area${drop.dragging ? " dropping" : ""}`} {...drop.props}>
        {drop.dragging && <div className="drop-hint">{t("att.dropHere")}</div>}
        <div className="section desc">
          <div className="row" style={{ marginBottom: 6 }}>
            <h3 style={{ margin: 0 }}>
              <Icon name="text" size={14} /> {t("item.body")}
            </h3>
            <span className="spacer" />
            {canWrite && editing === null && (
              <button type="button" className="btn sm ghost" onClick={() => setEditing(item.body ?? "")}>
                <Icon name="edit" size={14} /> {t("common.edit")}
              </button>
            )}
          </div>
          {editing !== null ? (
            <>
              <MarkdownField value={editing} onChange={setEditing} onFiles={upload} files={filesBase(id)} minHeight={180} autoFocus />
              <div className="row" style={{ marginTop: 8, justifyContent: "flex-end" }}>
                <button type="button" className="btn" onClick={() => setEditing(null)}>
                  {t("common.cancel")}
                </button>
                <button type="button" className="btn primary" disabled={editing === item.body} onClick={() => void saveBody(editing)}>
                  {t("common.save")}
                </button>
              </div>
            </>
          ) : item.body?.trim() ? (
            <Markdown text={item.body} files={filesBase(id)} />
          ) : (
            canWrite && (
              <button type="button" className="desc-empty" onClick={() => setEditing("")}>
                {t("att.addDescription")}
              </button>
            )
          )}
        </div>
        <AttachmentGrid
          itemId={id}
          files={data.attachments ?? []}
          canWrite={canWrite}
          uploading={uploading}
          onPick={(list) => void upload(list)}
          onChanged={reload}
          onInsert={(name) =>
            editing !== null
              ? setEditing(`${editing.trimEnd()}\n${markdownRef(name)}\n`)
              : void saveBody(`${(item.body ?? "").trimEnd()}\n\n${markdownRef(name)}\n`)
          }
        />
      </div>
      {item.handoff_note && (
        <p className="muted" style={{ fontSize: 12, fontStyle: "italic" }}>
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
            <Markdown text={r.body} files={filesBase(id)} />
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
          <MarkdownField value={body} onChange={setBody} onFiles={upload} files={filesBase(id)} placeholder={t("item.replyPlaceholder")} minHeight={80} />
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
            <button className="btn primary" disabled={busy || (!body.trim() && !replyStatus)} onClick={() => void sendReply()}>
              {body.trim() || !replyStatus ? t("item.reply") : `${t("board.moveTo")}: ${label.status(replyStatus)}`}
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
  const [pending, setPending] = useState<PendingFile[]>([]);
  const toast = useToast();

  // Files wait in the browser until the item exists; names are fixed now so references in the text hold.
  const queue = async (list: File[]): Promise<string[]> => {
    const added: PendingFile[] = [];
    for (const f of list) {
      if (f.size > MAX_BYTES) {
        toast({ text: t("att.tooBig").replace("{name}", f.name).replace("{size}", formatSize(MAX_BYTES)), error: true });
        continue;
      }
      const name = pendingName(
        safeName(f.name),
        [...pending, ...added].map((p) => p.name),
      );
      added.push({ name, file: f, url: URL.createObjectURL(f) });
    }
    setPending((p) => [...p, ...added]);
    return added.map((p) => p.name);
  };
  const unqueue = (name: string) =>
    setPending((p) => {
      const gone = p.find((x) => x.name === name);
      if (gone) URL.revokeObjectURL(gone.url);
      return p.filter((x) => x.name !== name);
    });
  useEffect(() => () => pending.forEach((p) => URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const drop = useDropZone((list) => void queue(list));
  usePasteFiles((list) => void queue(list), t("att.screenshot"));

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ id: string }>("/api/items", {
        method: "POST",
        body: { type: kind, title, body, fields, ...(category ? { category_path: category } : {}), ...(assignee ? { assignee } : {}) },
      });
      // The item exists now: send the files. One failing does not undo the item; the rest still go.
      const failed: string[] = [];
      for (const p of pending) {
        try {
          await uploadFile(r.id, p.file, p.name);
        } catch {
          failed.push(p.name);
        }
      }
      if (failed.length) toast({ text: t("att.someFailed").replace("{names}", failed.join(", ")), error: true });
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
      <div className={`drop-area${drop.dragging ? " dropping" : ""}`} {...drop.props}>
        {drop.dragging && <div className="drop-hint">{t("att.dropHere")}</div>}
        <div className="grid2">
          <div className="field">
            <label htmlFor="items-board-type">{t("board.type")}</label>
            <select id="items-board-type" className="select" value={kind} onChange={(e) => (setKind(e.target.value), setFields({}))}>
              {itemTypes.map((x) => (
                <option key={x} value={x}>
                  {label.type(x)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="items-item-assignee-2">{t("item.assignee")}</label>
            <select id="items-item-assignee-2" className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
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
        {schema?.description && (
          <p className="muted" style={{ marginTop: 0 }}>
            {label.description(kind, schema.description)}
          </p>
        )}
        <div className="field">
          <label htmlFor="items-item-title">
            {t("item.title")} <span className="req">*</span>
          </label>
          <input id="items-item-title" className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="items-item-category">
            {t("item.category")} {schema?.category_required && <span className="req">*</span>}
          </label>
          <select id="items-item-category" className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">—</option>
            {branches.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="items-item-body">{t("item.body")}</label>
          <MarkdownField
            id="items-item-body"
            value={body}
            onChange={setBody}
            onFiles={queue}
            files={(name) => pending.find((p) => p.name === name)?.url ?? ""}
          />
          <PendingList files={pending} onRemove={unqueue} />
          <p className="faint att-tip">{t("att.tip")}</p>
        </div>
        {schema && <SchemaForm fields={schema.fields} value={fields} onChange={setFields} actors={actors} />}
      </div>
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
        <label htmlFor="items-ask-question">{t("ask.question")}</label>
        <input id="items-ask-question" className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="items-ask-details">{t("ask.details")}</label>
        <textarea id="items-ask-details" className="textarea" value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <label htmlFor="items-ask-blocking" className="check">
        <input id="items-ask-blocking" type="checkbox" checked={blocking} onChange={(e) => setBlocking(e.target.checked)} /> {t("ask.blocking")}
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

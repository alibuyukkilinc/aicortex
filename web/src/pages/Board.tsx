import { useState } from "react";
import type { ApiError } from "../api";
import { api, qs, useApi } from "../api";
import { useLabels, useT } from "../i18n";
import { NewItemDialog, nextStatuses, useBranches, useSchema } from "../items";
import type { ItemSummary } from "../types";
import { ActorChip, ErrorBox, Icon, Loading, Pressable, go, useSession, useToast } from "../ui";
import { fileUrl } from "../attachments";
import type { Schema } from "../types";

export function Board({ type }: { type: string }) {
  const t = useT();
  const label = useLabels();
  const toast = useToast();
  const { actors, itemTypes, openItem, me, can } = useSession();
  const schema = useSchema(type);
  const branches = useBranches();
  const [branch, setBranch] = useState("");
  const [assignee, setAssignee] = useState("");
  const [creating, setCreating] = useState(false);
  const [dragging, setDragging] = useState<ItemSummary | null>(null);
  const [over, setOver] = useState<string | null>(null);
  // Read out by screen readers after a move: dragging gives sighted users that feedback for free.
  const [announce, setAnnounce] = useState("");
  const { data, error, loading, reload } = useApi<{ items: ItemSummary[]; total: number }>(`/api/items${qs({ type, path: branch, assignee, limit: 500 })}`);

  const move = async (item: ItemSummary, status: string, force = false) => {
    if (item.status === status) return;
    try {
      await api(`/api/items/${item.id}`, { method: "PATCH", body: { status, ...(force ? { force } : {}) } });
      const said = `${item.title}: ${t("board.moved")} ${label.status(status)}`;
      toast({ text: said });
      setAnnounce(said);
      reload();
    } catch (e) {
      const ae = e as ApiError;
      const allowed = (ae.hint as { allowed_from_here?: string[] } | undefined)?.allowed_from_here;
      toast({
        text: `${ae.message}${allowed ? ` (→ ${allowed.join(", ")})` : ""}`,
        error: true,
        ...(ae.code === "invalid_transition" && me.kind === "human" ? { action: { label: t("board.force"), run: () => void move(item, status, true) } } : {}),
      });
    }
  };

  const byStatus = (s: string) => (data?.items ?? []).filter((i) => i.status === s);

  return (
    <>
      <div className="page-head">
        <h1>{t("nav.board")}</h1>
        <select className="select" style={{ width: "auto" }} value={type} onChange={(e) => go(`board/${e.target.value}`)} aria-label={t("board.type")}>
          {itemTypes.map((x) => (
            <option key={x} value={x}>
              {label.type(x)}
            </option>
          ))}
        </select>
        <select className="select" style={{ width: "auto" }} value={branch} onChange={(e) => setBranch(e.target.value)} aria-label={t("board.branch")}>
          <option value="">
            {t("board.branch")}: {t("board.all")}
          </option>
          {branches.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
        <select className="select" style={{ width: "auto" }} value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label={t("item.assignee")}>
          <option value="">
            {t("item.assignee")}: {t("board.all")}
          </option>
          <option value="@humans">@humans</option>
          <option value="@ai">@ai</option>
          {actors.map((a) => (
            <option key={a.id}>{a.id}</option>
          ))}
        </select>
        <span className="spacer" />
        {(type === "question" ? can("ask") : can("write_items")) && (
          <button className="btn primary" onClick={() => setCreating(true)}>
            <Icon name="plus" /> {t("board.new")}
          </button>
        )}
      </div>
      {schema?.description && (
        <p className="muted" style={{ margin: "-6px 0 14px" }}>
          {label.description(type, schema.description)} <span className="faint">· {t("board.dropHint")}</span>
        </p>
      )}
      {error && <ErrorBox error={error} />}
      {loading || !schema ? (
        <Loading />
      ) : (
        <div className="board">
          {schema.statuses.map((status) => {
            const items = byStatus(status);
            const allowed = !dragging || dragging.status === status || nextStatuses(schema, dragging.status).includes(status);
            const humanOnly = schema.human_only_statuses.includes(status);
            return (
              <section
                key={status}
                className={`column ${over === status ? "over" : ""}`}
                style={{ opacity: allowed ? 1 : 0.5 }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(status);
                }}
                onDragLeave={() => setOver((o) => (o === status ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  if (dragging) void move(dragging, status);
                  setDragging(null);
                }}
              >
                <div className="column-head">
                  <span>{label.status(status)}</span>
                  <span className="count">{items.length}</span>
                  {humanOnly && (
                    <span className="lock" title={t("board.humanOnly")}>
                      <Icon name="lock" size={13} />
                    </span>
                  )}
                </div>
                <div className="column-body">
                  {items.length === 0 && (
                    <div className="faint" style={{ padding: "8px 4px", fontSize: 12.5 }}>
                      {t("board.empty")}
                    </div>
                  )}
                  {items.map((i) => (
                    <Pressable
                      as="article"
                      key={i.id}
                      className={`kcard ${dragging?.id === i.id ? "dragging" : ""}`}
                      draggable
                      onDragStart={() => setDragging(i)}
                      onDragEnd={() => setDragging(null)}
                      onPress={() => openItem(i.id)}
                    >
                      {i.cover && <img className="kcard-cover" src={fileUrl(i.id, i.cover)} alt="" loading="lazy" draggable={false} />}
                      {(i.level || i.blocking) && (
                        <div className="kcard-labels">
                          {i.level && <span className={`klabel lv-${i.level}`}>{label.value(i.level)}</span>}
                          {i.blocking && <span className="klabel lv-critical">{t("item.blocking")}</span>}
                        </div>
                      )}
                      <div className="title">{i.title}</div>
                      <div className="meta">
                        {i.due && <DueChip due={i.due} done={schema.statuses.indexOf(i.status) === schema.statuses.length - 1} />}
                        {i.has_body && (
                          <span className="kbadge" title={t("board.hasBody")} aria-label={t("board.hasBody")}>
                            <Icon name="text" size={13} />
                          </span>
                        )}
                        {i.replies ? (
                          <span className="kbadge" title={t("board.replies")}>
                            <Icon name="chat" size={13} /> {i.replies}
                          </span>
                        ) : null}
                        {i.files ? (
                          <span className="kbadge" title={t("board.files")}>
                            <Icon name="clip" size={13} /> {i.files}
                          </span>
                        ) : null}
                        {i.category_path && <span className="chip">{i.category_path}</span>}
                        <span className="spacer" />
                        {i.assignee && <ActorChip id={i.assignee} actors={actors} />}
                        {/* The same moves as dragging, for keyboards and touch screens. */}
                        {can("write_items") && nextStatuses(schema, i.status).length > 0 && (
                          <select
                            className="kcard-move"
                            value=""
                            aria-label={`${t("board.moveTo")}: ${i.title}`}
                            title={t("board.moveTo")}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => e.target.value && void move(i, e.target.value)}
                          >
                            <option value="">{t("board.moveTo")}…</option>
                            {nextStatuses(schema, i.status).map((s) => (
                              <option key={s} value={s}>
                                {label.status(s)}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </Pressable>
                  ))}
                </div>
                {(type === "question" ? can("ask") : can("write_items")) && (
                  <QuickAdd type={type} status={status} schema={schema} branch={branch} assignee={assignee} onAdded={reload} />
                )}
              </section>
            );
          })}
        </div>
      )}
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>
      {creating && <NewItemDialog type={type} defaultPath={branch || undefined} onClose={() => setCreating(false)} />}
    </>
  );
}

// Trello's due-date badge: red when late, amber when due today, quiet when done.
function DueChip({ due, done }: { due: string; done: boolean }) {
  const t = useT();
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const state = done ? "done" : due < key ? "late" : due === key ? "today" : "";
  const shown = new Date(`${due}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return (
    <span className={`kbadge due ${state}`} title={state === "late" ? t("board.overdue") : due}>
      <Icon name="clock" size={13} /> {shown}
    </span>
  );
}

// "Add a card" at the bottom of a column: type a title, Enter, and it lands in this column; the input
// stays open for the next one, as in Trello. The board's branch and assignee filters are applied.
function QuickAdd({
  type,
  status,
  schema,
  branch,
  assignee,
  onAdded,
}: {
  type: string;
  status: string;
  schema: Schema;
  branch: string;
  assignee: string;
  onAdded: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const text = title.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const r = await api<{ id: string }>("/api/items", {
        method: "POST",
        body: { type, title: text, ...(branch ? { category_path: branch } : {}), ...(assignee ? { assignee } : {}) },
      });
      // New items start in the type's first status; move it to the column it was typed into.
      if (status !== schema.initial) await api(`/api/items/${r.id}`, { method: "PATCH", body: { status } });
      setTitle("");
      onAdded();
    } catch (e) {
      toast({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  if (!open)
    return (
      <button type="button" className="quick-add-btn" onClick={() => setOpen(true)}>
        <Icon name="plus" size={14} /> {t("board.addCard")}
      </button>
    );
  return (
    <div className="quick-add">
      <textarea
        className="textarea"
        autoFocus
        rows={2}
        value={title}
        placeholder={t("board.addCardHint")}
        aria-label={t("board.addCard")}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void add();
          }
          if (e.key === "Escape") {
            e.stopPropagation();
            setOpen(false);
            setTitle("");
          }
        }}
      />
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn primary sm" disabled={busy || !title.trim()} onClick={() => void add()}>
          {t("board.addCard")}
        </button>
        <button type="button" className="icon-btn" aria-label={t("common.cancel")} onClick={() => (setOpen(false), setTitle(""))}>
          <Icon name="x" size={14} />
        </button>
      </div>
    </div>
  );
}

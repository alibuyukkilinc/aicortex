import { useState } from "react";
import { ApiError, api, qs, useApi } from "../api";
import { useLabels, useT } from "../i18n";
import { NewItemDialog, nextStatuses, useBranches, useSchema } from "../items";
import type { ItemSummary } from "../types";
import { ActorChip, ErrorBox, Icon, Loading, go, useSession, useToast } from "../ui";

export function Board({ type }: { type: string }) {
  const t = useT();
  const label = useLabels();
  const toast = useToast();
  const { actors, itemTypes, openItem, me } = useSession();
  const schema = useSchema(type);
  const branches = useBranches();
  const [branch, setBranch] = useState("");
  const [assignee, setAssignee] = useState("");
  const [creating, setCreating] = useState(false);
  const [dragging, setDragging] = useState<ItemSummary | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const { data, error, loading, reload } = useApi<{ items: ItemSummary[]; total: number }>(
    `/api/items${qs({ type, path: branch, assignee, limit: 500 })}`,
  );

  const move = async (item: ItemSummary, status: string, force = false) => {
    if (item.status === status) return;
    try {
      await api(`/api/items/${item.id}`, { method: "PATCH", body: { status, ...(force ? { force } : {}) } });
      toast({ text: `${item.title}: ${t("board.moved")} ${label.status(status)}` });
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
        <button className="btn primary" onClick={() => setCreating(true)}>
          <Icon name="plus" /> {t("board.new")}
        </button>
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
                  {items.length === 0 && <div className="faint" style={{ padding: "8px 4px", fontSize: 12.5 }}>{t("board.empty")}</div>}
                  {items.map((i) => (
                    <article
                      key={i.id}
                      className={`kcard ${dragging?.id === i.id ? "dragging" : ""}`}
                      draggable
                      onDragStart={() => setDragging(i)}
                      onDragEnd={() => setDragging(null)}
                      onClick={() => openItem(i.id)}
                    >
                      <div className="title">{i.title}</div>
                      <div className="meta">
                        {i.blocking && <span className="chip danger">{t("item.blocking")}</span>}
                        <ActorChip id={i.assignee} actors={actors} />
                        {i.category_path && <span className="chip">{i.category_path}</span>}
                        {i.replies ? (
                          <span className="chip" title={t("board.replies")}>
                            <Icon name="chat" size={12} /> {i.replies}
                          </span>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {creating && <NewItemDialog type={type} defaultPath={branch || undefined} onClose={() => setCreating(false)} />}
    </>
  );
}

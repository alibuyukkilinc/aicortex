import { useEffect, useState } from "react";
import { api, qs, useApi } from "../api";
import { useT } from "../i18n";
import type { ItemSummary, KnowledgeNode, NodeSummary, StaleInfo } from "../types";
import { ActorChip, Ago, ErrorBox, Icon, Loading, Markdown, Modal, StatusChip, TypeChip, go, useSession, useToast } from "../ui";

export function Knowledge({ path }: { path: string }) {
  const t = useT();
  const { data, error } = useApi<{ node: NodeSummary }>("/api/tree?depth=5");

  return (
    <>
      <div className="page-head">
        <h1>{t("tree.title")}</h1>
      </div>
      {error && <ErrorBox error={error} />}
      <div className="split">
        <nav className="card tree" aria-label={t("tree.title")}>
          {data ? <TreeNode node={data.node} active={path} depth={0} /> : <Loading />}
        </nav>
        <div className="card">{path !== undefined ? <NodeView path={path} /> : <div className="empty">{t("tree.select")}</div>}</div>
      </div>
    </>
  );
}

function TreeNode({ node, active, depth }: { node: NodeSummary; active: string; depth: number }) {
  const isAncestor = active === node.path || active.startsWith(node.path ? `${node.path}/` : "");
  const [open, setOpen] = useState(depth < 1 || isAncestor);
  useEffect(() => {
    if (isAncestor) setOpen(true);
  }, [isAncestor]);
  const hasKids = (node.children?.length ?? 0) > 0;
  return (
    <div>
      <div className={`tree-row ${active === node.path ? "active" : ""}`} onClick={() => go(`knowledge/${node.path}`)}>
        <span
          className="twisty"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
        >
          {hasKids && (
            <span style={{ display: "inline-flex", transform: open ? "rotate(90deg)" : "none", transition: "transform .1s" }}>
              <Icon name="chevron" size={12} />
            </span>
          )}
        </span>
        <span className="name" title={node.summary}>
          {node.title}
        </span>
        {node.open_items ? <span className="chip warn">{node.open_items}</span> : null}
        {node.status !== "active" && <StatusChip status={node.status} />}
      </div>
      {open && hasKids && (
        <div className="tree-children">
          {node.children!.map((c) => (
            <TreeNode key={c.path} node={c} active={active} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function NodeView({ path }: { path: string }) {
  const t = useT();
  const { actors, ask, openItem, can } = useSession();
  const { data, error, loading, reload } = useApi<{ node: KnowledgeNode; staleness?: StaleInfo }>(`/api/node/${path}`);
  const items = useApi<{ items: ItemSummary[]; total: number }>(`/api/items${qs({ path: path || undefined, open: true, limit: 20 })}`);
  const [editing, setEditing] = useState<"edit" | "child" | null>(null);
  const toast = useToast();

  // The server refuses when children or open items remain, and says which; we show that message.
  const remove = async (node: KnowledgeNode) => {
    if (!confirm(t("tree.confirmDelete").replace("{title}", node.title))) return;
    try {
      const r = await api<{ message: string }>(`/api/node/${node.path}`, { method: "DELETE" });
      toast({ text: r.message });
      go(`knowledge/${node.path.includes("/") ? node.path.slice(0, node.path.lastIndexOf("/")) : ""}`);
    } catch (e) {
      toast({ text: (e as Error).message, error: true });
    }
  };

  if (error) return <div className="doc"><ErrorBox error={error} /></div>;
  if (loading || !data) return <Loading />;
  const n = data.node;
  const crumbs = n.path ? n.path.split("/") : [];

  return (
    <article className="doc">
      {/* Path on the left, actions on the right; the title below gets the full width. */}
      <div className="doc-bar">
        <div className="breadcrumbs">
          <a href="#/knowledge/">root</a>
          {crumbs.map((c, i) => (
            <span key={i}>
              / <a href={`#/knowledge/${crumbs.slice(0, i + 1).join("/")}`}>{c}</a>
            </span>
          ))}
        </div>
        <div className="doc-actions">
          <button className="btn sm" onClick={() => ask(n.path, n.title)}>
            <Icon name="ask" size={14} /> {t("tree.ask")}
          </button>
          {can("write_knowledge") && (
            <>
              <button className="btn sm" onClick={() => setEditing("edit")}>
                <Icon name="edit" size={14} /> {t("common.edit")}
              </button>
              <button className="btn sm" onClick={() => setEditing("child")}>
                <Icon name="plus" size={14} /> {t("tree.newChild")}
              </button>
            </>
          )}
          {n.path !== "" && can("delete_knowledge") && (
            <button className="btn sm ghost danger" onClick={() => void remove(n)} title={t("tree.delete")}>
              <Icon name="x" size={14} /> {t("tree.delete")}
            </button>
          )}
        </div>
      </div>
      <h1>{n.title}</h1>
      <p className="summary">{n.summary}</p>
      {data.staleness && <StaleBanner info={data.staleness} path={n.path} onEdit={() => setEditing("edit")} onChanged={reload} />}
      <div className="row muted" style={{ fontSize: 12.5, gap: 6, marginBottom: 16 }}>
        <StatusChip status={n.status} />
        {t("tree.updated")} <ActorChip id={n.updated_by} actors={actors} /> · <Ago iso={n.updated_at} />
        {n.tags?.map((tag) => (
          <span key={tag} className="chip">
            #{tag}
          </span>
        ))}
      </div>
      <Markdown text={n.body} />
      {n.links?.code?.length ? (
        <div className="section">
          <h3>{t("tree.code")}</h3>
          <div className="row" style={{ gap: 6 }}>
            {n.links.code.map((c) => (
              <span key={c.file} className="chip mono">
                <Icon name="file" size={12} /> {c.file}
                {c.lines ? `:${c.lines}` : ""}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {items.data && items.data.total > 0 && (
        <div className="section">
          <h3>
            {items.data.total} {t("tree.openItems")}
          </h3>
          <div className="card list">
            {items.data.items.map((i) => (
              <div key={i.id} className="list-row" onClick={() => openItem(i.id)}>
                <TypeChip type={i.type} />
                <span className="title" style={{ flex: 1 }}>
                  {i.title}
                </span>
                <StatusChip status={i.status} />
              </div>
            ))}
          </div>
        </div>
      )}
      {editing && <NodeEditor node={editing === "edit" ? n : null} parent={n.path} onClose={() => setEditing(null)} />}
    </article>
  );
}

function NodeEditor({ node, parent, onClose }: { node: KnowledgeNode | null; parent: string; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState(node?.title ?? "");
  const [summary, setSummary] = useState(node?.summary ?? "");
  const [body, setBody] = useState(node?.body ?? "");
  const [err, setErr] = useState<unknown>(null);
  const path = node ? node.path : [parent, slug].filter(Boolean).join("/");

  const save = async () => {
    setErr(null);
    try {
      const r = await api<{ message: string; path: string }>(`/api/node/${path}`, {
        method: "PUT",
        body: { title, summary, body, tags: node?.tags, links: node?.links },
      });
      toast({ text: `${t("tree.draftNote")} ${r.message}` });
      onClose();
      go(`knowledge/${r.path}`);
    } catch (e) {
      setErr(e);
    }
  };

  return (
    <Modal onClose={onClose} title={node ? t("tree.edit") : t("tree.newChild")}>
      {!node && (
        <div className="field">
          <label>{t("tree.path")}</label>
          <div className="row" style={{ flexWrap: "nowrap", gap: 4 }}>
            <span className="mono muted">{parent ? `${parent}/` : ""}</span>
            <input className="input mono" value={slug} placeholder="new-node" onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} />
          </div>
        </div>
      )}
      <div className="field">
        <label>{t("item.title")}</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label>
          {t("tree.summary")} <span className="faint">({summary.length}/300)</span>
        </label>
        <textarea className="textarea" style={{ minHeight: 60 }} maxLength={300} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </div>
      <div className="field">
        <label>{t("item.body")}</label>
        <textarea className="textarea" style={{ minHeight: 200 }} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <ErrorBox error={err} />
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button className="btn primary" disabled={!title.trim() || !summary.trim() || (!node && !slug)} onClick={() => void save()}>
          {t("common.save")}
        </button>
      </div>
    </Modal>
  );
}

// Used on a node's page and, one per row, on the stale knowledge page (`compact` drops the heading there).
export function StaleBanner({
  info,
  path,
  onEdit,
  onChanged,
  compact = false,
}: {
  info: StaleInfo;
  path: string;
  onEdit: () => void;
  onChanged: () => void;
  compact?: boolean;
}) {
  const t = useT();
  const toast = useToast();
  const { can, me } = useSession();
  const call = async (url: string, method: "POST" | "DELETE", done: (r: { applied?: boolean; message?: string }) => string) => {
    try {
      const r = await api<{ applied?: boolean; message?: string }>(url, { method, body: {} });
      toast({ text: done(r) });
      onChanged();
    } catch (e) {
      toast({ text: (e as Error).message, error: true });
    }
  };
  const verify = () => call(`/api/verify/${path}`, "POST", (r) => (r.applied ? t("stale.verified") : (r.message ?? "")));
  const snooze = () => call(`/api/snooze/${path}`, "POST", () => t("stale.snoozed"));
  const wake = () => call(`/api/snooze/${path}`, "DELETE", () => t("stale.woken"));
  const quiet = info.severity === "low" || !!info.snoozed;
  return (
    <div className={`stale-banner${quiet ? " quiet" : ""}${compact ? " compact" : ""}`} role="status">
      <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
        {!compact && (
          <span style={{ color: quiet ? "var(--faint)" : "var(--warn)", marginTop: 2 }}>
            <Icon name="alert" />
          </span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!compact && (
            <div className="row" style={{ gap: 6 }}>
              <strong>{t(info.severity === "low" ? "stale.titleLow" : "stale.title")}</strong>
              <SeverityChip severity={info.severity} />
            </div>
          )}
          {info.reason === "unknown_commit" ? (
            <p style={{ margin: "4px 0 0" }}>{t("stale.unknown")}</p>
          ) : (
            <>
              {!compact && <p style={{ margin: "4px 0 6px" }}>{t(info.severity === "low" ? "stale.bodyLow" : "stale.body")}</p>}
              <ul className="stale-list">
                {info.changes.map((c) => (
                  <li key={`${c.file}:${c.lines ?? ""}`}>
                    <span className="mono">{c.file}</span>
                    {c.lines && (
                      <span className="faint">
                        {" "}
                        ({t("stale.lines")} {c.lines})
                      </span>
                    )}{" "}
                    {c.status === "deleted" && <span className="chip danger">{t("stale.deleted")}</span>}
                    {c.status === "renamed" && (
                      <span className="chip warn">
                        {t("stale.renamed")} {c.renamed_to}
                      </span>
                    )}
                    {c.formatting_only && <span className="chip">{t("stale.formatting")}</span>}
                    {c.last && (
                      <div className="faint" style={{ fontSize: 12.5 }}>
                        {c.commits} {t("stale.commits")} · <span className="mono">{c.last.hash.slice(0, 7)}</span> “{c.last.subject}” — {c.last.author}, <Ago iso={c.last.date} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>
            {t("stale.verifiedAt")}: <span className="mono">{info.verified_at_commit.slice(0, 7)}</span>
            {info.snoozed && (
              <>
                {" · "}
                {t("stale.snoozedBy")} {info.snoozed.by}, <Ago iso={info.snoozed.at} />
              </>
            )}
          </div>
        </div>
      </div>
      {can("write_knowledge") && (
        <div className="row" style={{ marginTop: 10, justifyContent: "flex-end" }}>
          {me.kind === "human" &&
            (info.snoozed ? (
              <button className="btn sm ghost" onClick={() => void wake()}>
                {t("stale.wake")}
              </button>
            ) : (
              <button className="btn sm ghost" onClick={() => void snooze()} title={t("stale.snoozeWhy")}>
                {t("stale.snooze")}
              </button>
            ))}
          <button className="btn sm" onClick={() => void verify()}>
            <Icon name="check" size={14} /> {t("stale.verify")}
          </button>
          <button className="btn sm primary" onClick={onEdit}>
            <Icon name="edit" size={14} /> {t("stale.fix")}
          </button>
        </div>
      )}
    </div>
  );
}

export function SeverityChip({ severity }: { severity: StaleInfo["severity"] }) {
  const t = useT();
  return <span className={`chip sev-${severity}`}>{t(`stale.sev.${severity}`)}</span>;
}

import { useEffect, useState } from "react";
import { api, qs, useApi } from "../api";
import { useT } from "../i18n";
import type { ItemSummary, KnowledgeNode, NodeSummary } from "../types";
import { ActorChip, Ago, ErrorBox, Icon, Loading, Markdown, Modal, StatusChip, go, useSession, useToast } from "../ui";

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
  const { actors, ask, openItem } = useSession();
  const { data, error, loading } = useApi<{ node: KnowledgeNode }>(`/api/node/${path}`);
  const items = useApi<{ items: ItemSummary[]; total: number }>(`/api/items${qs({ path: path || undefined, open: true, limit: 20 })}`);
  const [editing, setEditing] = useState<"edit" | "child" | null>(null);

  if (error) return <div className="doc"><ErrorBox error={error} /></div>;
  if (loading || !data) return <Loading />;
  const n = data.node;
  const crumbs = n.path ? n.path.split("/") : [];

  return (
    <article className="doc">
      <div className="breadcrumbs">
        <a href="#/knowledge/">root</a>
        {crumbs.map((c, i) => (
          <span key={i}>
            / <a href={`#/knowledge/${crumbs.slice(0, i + 1).join("/")}`}>{c}</a>
          </span>
        ))}
      </div>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <h1 style={{ flex: 1 }}>{n.title}</h1>
        <button className="btn sm" onClick={() => ask(n.path, n.title)}>
          <Icon name="ask" /> {t("tree.ask")}
        </button>
        <button className="btn sm" onClick={() => setEditing("edit")}>
          <Icon name="edit" /> {t("common.edit")}
        </button>
        <button className="btn sm" onClick={() => setEditing("child")}>
          <Icon name="plus" /> {t("tree.newChild")}
        </button>
      </div>
      <p className="summary">{n.summary}</p>
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
                <span className="chip mono">{i.type}</span>
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

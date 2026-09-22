import { useState } from "react";
import { ApiError, api, useApi } from "../api";
import { useT } from "../i18n";
import type { Draft } from "../types";
import { ActorChip, Ago, Drawer, ErrorBox, Loading, Markdown, TypeChip, useSession, useToast } from "../ui";

type BulkResult = { done: string[]; failed: { id: string; code: string; message: string }[] };

export function Approvals() {
  const t = useT();
  const toast = useToast();
  const { actors } = useSession();
  const { data, error, loading } = useApi<{ drafts: Draft[] }>("/api/approvals");
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<BulkResult["failed"]>([]);

  const drafts = data?.drafts ?? [];
  // Drafts approved elsewhere (or by another tab) drop out of the selection by themselves.
  const selected = drafts.filter((d) => picked.has(d.id)).map((d) => d.id);
  const all = drafts.length > 0 && selected.length === drafts.length;
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const bulk = async (what: "approve" | "reject") => {
    let reason: string | undefined;
    if (what === "approve" && !confirm(t("approvals.confirmBulk").replace("{n}", String(selected.length)))) return;
    if (what === "reject") {
      const r = prompt(t("approvals.rejectReason"));
      if (r === null) return;
      reason = r || undefined;
    }
    setBusy(true);
    try {
      const r = await api<BulkResult>(`/api/approvals/${what}`, { method: "POST", body: { ids: selected, ...(reason ? { reason } : {}) } });
      // Keep only the failures selected, so the reviewer can open them one by one.
      setPicked(new Set(r.failed.map((f) => f.id)));
      setFailed(r.failed);
      toast({ text: t(what === "approve" ? "approvals.bulkDone" : "approvals.bulkRejected").replace("{done}", String(r.done.length)), error: r.failed.length > 0 });
    } catch (e) {
      toast({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>{t("approvals.title")}</h1>
      </div>
      {error && <ErrorBox error={error} />}
      {failed.length > 0 && (
        <div className="card" style={{ padding: "12px 16px", marginBottom: 12, borderColor: "var(--danger)" }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{t("approvals.bulkFailed").replace("{n}", String(failed.length))}</div>
          {failed.map((f) => (
            <div key={f.id} className="muted" style={{ fontSize: 13 }}>
              {drafts.find((d) => d.id === f.id)?.title ?? f.id}: {f.message}
            </div>
          ))}
        </div>
      )}
      {loading ? (
        <Loading />
      ) : (
        <div className="card list">
          {drafts.length === 0 && <div className="empty">{t("approvals.empty")}</div>}
          {drafts.length > 0 && (
            <div className="bulk-bar">
              <label className="check">
                <input type="checkbox" checked={all} onChange={() => setPicked(all ? new Set() : new Set(drafts.map((d) => d.id)))} />
                {t("approvals.selectAll")}
              </label>
              {selected.length > 0 && (
                <span className="faint">
                  {selected.length} {t("approvals.selected")}
                </span>
              )}
              <span className="spacer" />
              <button className="btn danger" disabled={!selected.length || busy} onClick={() => void bulk("reject")}>
                {t("approvals.rejectSelected")}
              </button>
              <button className="btn primary" disabled={!selected.length || busy} onClick={() => void bulk("approve")}>
                {t("approvals.approveSelected")} {selected.length > 0 && `(${selected.length})`}
              </button>
            </div>
          )}
          {drafts.map((d) => (
            <div key={d.id} className={`list-row ${picked.has(d.id) ? "picked" : ""}`} onClick={() => setOpen(d.id)}>
              <input
                type="checkbox"
                className="row-check"
                aria-label={d.title}
                checked={picked.has(d.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggle(d.id)}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="title">{d.title}</div>
                <div className="meta">
                  <TypeChip type={d.kind} />
                  <span className="mono faint">{d.kind === "node" ? d.target || "(root)" : d.target.slice(-8)}</span>
                  <ActorChip id={d.proposed_by} actors={actors} />
                  {d.reason && <span>“{d.reason}”</span>}
                </div>
              </div>
              <span className="faint" style={{ fontSize: 12 }}>
                <Ago iso={d.proposed_at} />
              </span>
            </div>
          ))}
        </div>
      )}
      {open && <DraftDrawer id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

type Doc = { title: string; summary?: string; body: string; status?: string; fields?: Record<string, unknown> };

function DraftDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const { actors } = useSession();
  const { data, error } = useApi<{ draft: Draft & { data: Doc }; current: Doc | null }>(`/api/approvals/${id}`);
  const [err, setErr] = useState<unknown>(null);

  const act = async (what: "approve" | "reject", force = false) => {
    setErr(null);
    try {
      const reason = what === "reject" ? (prompt(t("approvals.rejectReason")) ?? undefined) : undefined;
      const r = await api<{ message: string }>(`/api/approvals/${id}/${what}${force ? "?force=true" : ""}`, {
        method: "POST",
        body: reason ? { reason } : {},
      });
      toast({ text: r.message });
      onClose();
    } catch (e) {
      if ((e as ApiError).code === "conflict" && confirm(t("approvals.conflict"))) return act(what, true);
      setErr(e);
    }
  };

  if (!data) return <Drawer onClose={onClose} head={<span />}>{error ? <ErrorBox error={error} /> : <Loading />}</Drawer>;
  const { draft, current } = data;
  const proposed = draft.data;

  return (
    <Drawer
      onClose={onClose}
      head={
        <>
          <div className="row" style={{ gap: 6, marginBottom: 6 }}>
            <TypeChip type={draft.kind} />
            <ActorChip id={draft.proposed_by} actors={actors} />
            <Ago iso={draft.proposed_at} />
          </div>
          <h2>{proposed.title}</h2>
          {draft.reason && (
            <p className="muted" style={{ margin: "6px 0 0" }}>
              {t("approvals.reason")}: {draft.reason}
            </p>
          )}
        </>
      }
    >
      <div className="row" style={{ marginBottom: 16 }}>
        <button className="btn primary" onClick={() => void act("approve")}>
          {t("approvals.approve")}
        </button>
        <button className="btn danger" onClick={() => void act("reject")}>
          {t("approvals.reject")}
        </button>
      </div>
      <ErrorBox error={err} />
      <div className="diff">
        <div className="old">
          <h3 style={{ marginBottom: 8 }}>{t("approvals.current")}</h3>
          {current ? <DocView doc={current} /> : <p className="muted">{t("approvals.new")}</p>}
        </div>
        <div className="new">
          <h3 style={{ marginBottom: 8 }}>{t("approvals.proposed")}</h3>
          <DocView doc={proposed} />
        </div>
      </div>
    </Drawer>
  );
}

function DocView({ doc }: { doc: Doc }) {
  return (
    <>
      <strong>{doc.title}</strong>
      {doc.summary && <p className="muted">{doc.summary}</p>}
      {doc.status && <p className="mono faint">status: {doc.status}</p>}
      {doc.fields && Object.keys(doc.fields).length > 0 && <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(doc.fields, null, 2)}</pre>}
      <Markdown text={doc.body} />
    </>
  );
}

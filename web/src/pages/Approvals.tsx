import { useState } from "react";
import { ApiError, api, useApi } from "../api";
import { useT } from "../i18n";
import type { Draft } from "../types";
import { ActorChip, Ago, Drawer, ErrorBox, Loading, Markdown, useSession, useToast } from "../ui";

export function Approvals() {
  const t = useT();
  const { actors } = useSession();
  const { data, error, loading } = useApi<{ drafts: Draft[] }>("/api/approvals");
  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      <div className="page-head">
        <h1>{t("approvals.title")}</h1>
      </div>
      {error && <ErrorBox error={error} />}
      {loading ? (
        <Loading />
      ) : (
        <div className="card list">
          {data?.drafts.length === 0 && <div className="empty">{t("approvals.empty")}</div>}
          {data?.drafts.map((d) => (
            <div key={d.id} className="list-row" onClick={() => setOpen(d.id)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="title">{d.title}</div>
                <div className="meta">
                  <span className="chip mono">{d.kind}</span>
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
            <span className="chip mono">{draft.kind}</span>
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

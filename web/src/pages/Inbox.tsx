import type { ReactNode } from "react";
import { useApi } from "../api";
import type { Key} from "../i18n";
import { useT } from "../i18n";
import type { Draft, ItemSummary, StaleInfo } from "../types";
import { ActorChip, Ago, ErrorBox, Icon, Loading, StatusChip, TypeChip, go, useSession } from "../ui";
import { SeverityChip } from "./Knowledge";

// Notifications: everything waiting for this person, counted and explained in plain words.
// One question per group: what is this, why am I seeing it, and what do I do with it?

export function Inbox() {
  const t = useT();
  const { actors, openItem, can } = useSession();
  const items = useApi<{ count: number; items: ItemSummary[] }>("/api/inbox?limit=100");
  const drafts = useApi<{ drafts: Draft[] }>(can("approve") ? "/api/approvals" : null);
  const stale = useApi<{ nodes: StaleInfo[] }>("/api/stale");

  const all = items.data?.items ?? [];
  const by = (reason: string, extra?: (i: ItemSummary) => boolean) => all.filter((i) => i.reason === reason && (!extra || extra(i)));
  const blocking = all.filter((i) => i.blocking && i.type === "question" && i.reason !== "your_question_answered");
  const mine = by("assigned_to_you", (i) => !blocking.includes(i));
  const group = by("assigned_to_group", (i) => !blocking.includes(i));
  const answered = by("your_question_answered");
  const replies = by("new_reply");
  const decisions = by("decision_needs_review");
  const pending = drafts.data?.drafts ?? [];
  // Only what needs a person: formatting-only changes and snoozed nodes wait on the stale page instead.
  const outdated = (stale.data?.nodes ?? []).filter((s) => s.severity !== "low" && !s.snoozed);

  const total = all.length + pending.length + outdated.length;
  const n = (key: Key, count: number) => (count ? t(key).replace("{n}", String(count)) : null);
  const summary = [
    n("notif.summaryTasks", mine.length + group.length),
    n("notif.summaryQuestions", blocking.length),
    n("notif.summaryDecisions", decisions.length),
    n("notif.summaryDrafts", pending.length),
    n("notif.summaryStale", outdated.length),
  ].filter(Boolean);

  const itemRow = (i: ItemSummary) => (
    <div className="list-row" key={i.id} onClick={() => openItem(i.id)}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="title">{i.title}</div>
        <div className="meta">
          <TypeChip type={i.type} />
          <StatusChip status={i.status} />
          <ActorChip id={i.author} actors={actors} />
          {i.category_path && <span className="faint">{i.category_path}</span>}
          <Ago iso={i.updated_at} />
        </div>
      </div>
      <span className="row-go" aria-hidden>
        <Icon name="chevron" size={16} />
      </span>
    </div>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("notif.title")}</h1>
          <p>
            {total === 0
              ? t("notif.nothing")
              : `${total === 1 ? t("notif.waitingOne") : t("notif.waitingCount").replace("{n}", String(total))} · ${summary.join(" · ")}`}
          </p>
        </div>
      </div>
      {items.error && <ErrorBox error={items.error} />}
      {items.loading ? (
        <Loading />
      ) : total === 0 ? (
        <div className="card empty">{t("notif.nothing")}</div>
      ) : (
        <div className="notif-groups">
          <Group title={t("notif.blocking")} why={t("notif.blockingWhy")} tone="danger" rows={blocking.map(itemRow)} />
          <Group title={t("notif.assigned")} why={t("notif.assignedWhy")} rows={mine.map(itemRow)} />
          <Group title={t("notif.group")} why={t("notif.groupWhy")} rows={group.map(itemRow)} />
          <Group title={t("notif.answered")} why={t("notif.answeredWhy")} rows={answered.map(itemRow)} />
          <Group title={t("notif.replies")} why={t("notif.repliesWhy")} rows={replies.map(itemRow)} />
          <Group title={t("notif.decisions")} why={t("notif.decisionsWhy")} rows={decisions.map(itemRow)} />
          <Group
            title={t("notif.drafts")}
            why={t("notif.draftsWhy")}
            action={{ label: t("notif.review"), run: () => go("approvals") }}
            rows={pending.map((d) => (
              <div className="list-row" key={d.id} onClick={() => go("approvals")}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="title">{d.title}</div>
                  <div className="meta">
                    <TypeChip type={d.kind} />
                    <span className="mono faint">{d.kind === "node" ? d.target || "(root)" : d.target.slice(-8)}</span>
                    <ActorChip id={d.proposed_by} actors={actors} />
                    <Ago iso={d.proposed_at} />
                  </div>
                </div>
                <span className="row-go" aria-hidden>
                  <Icon name="chevron" size={16} />
                </span>
              </div>
            ))}
          />
          <Group
            title={t("notif.stale")}
            why={t("notif.staleWhy")}
            tone="warn"
            rows={outdated.map((s) => (
              <a className="list-row" key={s.path} href={`#/knowledge/${s.path}`} style={{ color: "inherit" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="title">
                    {s.title ?? s.path} <SeverityChip severity={s.severity} />
                  </div>
                  <div className="meta">
                    <span className="faint mono">{s.changes.map((c) => c.file).join(", ")}</span>
                  </div>
                </div>
                <span className="row-go" aria-hidden>
                  <Icon name="chevron" size={16} />
                </span>
              </a>
            ))}
          />
        </div>
      )}
    </>
  );
}

function Group({ title, why, rows, tone, action }: { title: string; why: string; rows: ReactNode[]; tone?: "warn" | "danger"; action?: { label: string; run: () => void } }) {
  if (rows.length === 0) return null;
  return (
    <section className="notif-group">
      <div className="notif-head">
        <h2>
          {title} <span className={`count ${tone ?? ""}`}>{rows.length}</span>
        </h2>
        <p>{why}</p>
        {action && (
          <button className="btn sm" onClick={action.run}>
            {action.label}
          </button>
        )}
      </div>
      <div className="card list">{rows}</div>
    </section>
  );
}

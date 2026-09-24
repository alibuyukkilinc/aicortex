import type { ReactNode } from "react";
import { useContext, useState } from "react";
import { apiPath, qs, useApi } from "../api";
import { HBars, StackedColumns } from "../charts";
import { LangContext, useT } from "../i18n";
import { ActorChip, Ago, ErrorBox, Icon, Loading, StatusChip, useSession, useToast, ListRow } from "../ui";

// Mirrors the server's Report shape (src/core/reports.ts); only the fields the page reads.
interface Report {
  period: { since: string; until: string; days: number };
  totals: {
    activity: { logged: { total: number; ai: number; human: number }; system: { total: number } };
    ai_logged_changes: number;
    ai_changes_without_why: number;
    items_created: { total: number };
    items_closed: { total: number };
    questions: { asked: number; answered: number; median_answer_hours: number | null; open_blocking: number };
    decisions: { proposed: number; accepted: number; rejected: number };
    approvals: { proposed: number; approved: number; rejected: number; pending: number };
  };
  daily: { date: string; ai: number; human: number; system: number }[];
  actors: { id: string; kind: string; logged: number; writes: number; drafts: { approved: number; rejected: number }; approval_rate: number | null }[];
  highlights: {
    ai_changes: { id: string; at: string; actor: string; action: string; summary: string; why?: string; files?: string[] }[];
    decisions: { id: string; title: string; status: string; at: string; by: string }[];
    closed_issues: { id: string; title: string; days_open: number; resolution?: string; by: string }[];
  };
  attention: {
    open_issues: number;
    issue_aging: { bucket: string; count: number; by_severity: Record<string, number> }[];
    blocking_questions: { id: string; title: string; asked_by: string; assignee?: string; age_days: number }[];
    pending_approvals: { draft_id: string; kind: string; target: string; title: string; proposed_by: string; age_days: number }[];
    stale_nodes: { path: string; files: string[] }[];
    undocumented: string[];
  };
  knowledge: { nodes: number; with_code_links: number; stale: number; stale_ratio: number; undocumented: number; git: boolean };
}

const PRESETS = ["7d", "30d", "90d"];

export function Reports() {
  const t = useT();
  const toast = useToast();
  const { lang } = useContext(LangContext);
  const { actors, openItem } = useSession();
  const [since, setSince] = useState("7d");
  const [asTable, setAsTable] = useState(false);
  const { data, error, loading } = useApi<{ report: Report }>(`/api/report${qs({ since })}`);
  const r = data?.report;

  const markdown = async () => {
    const res = await fetch(apiPath(`/api/report${qs({ since, format: "md", lang })}`), { credentials: "same-origin" });
    return res.text();
  };
  const download = async () => {
    const blob = new Blob([await markdown()], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cortex-report-${new Date().toISOString().slice(0, 10)}-${since}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(await markdown());
      toast({ text: t("rep.copied") });
    } catch (e) {
      toast({ text: (e as Error).message, error: true });
    }
  };

  // Locale-aware: "%40" in Turkish, "40%" in English.
  const fmtPct = (x: number) => new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0 }).format(x);
  const ratio = (a: number, b: number) => (b ? fmtPct(a / b) : "—");
  // Server buckets are "0-3d", "30d+"; swap the unit for the UI language.
  const bucket = (b: string) => b.replace(/d/g, ` ${t("rep.d")}`).replace(" +", "+");

  const dayLabel = (row: Record<string, number | string>) =>
    new Date(`${row.date}T00:00:00Z`).toLocaleDateString(lang, { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <>
      {/* Filters: one row, above everything they scope. */}
      <div className="page-head">
        <div>
          <h1>{t("rep.title")}</h1>
          <p>{t("rep.intro")}</p>
        </div>
        <div className="page-actions">
          <div className="segmented" role="group" aria-label={t("rep.title")}>
            {PRESETS.map((p) => (
              <button key={p} className={since === p ? "on" : ""} aria-pressed={since === p} onClick={() => setSince(p)}>
                {parseInt(p, 10)} {t("rep.days")}
              </button>
            ))}
          </div>
          <button className="btn" onClick={() => void copy()}>
            {t("rep.copy")}
          </button>
          <button className="btn primary" onClick={() => void download()}>
            {t("rep.download")}
          </button>
        </div>
      </div>
      {error && <ErrorBox error={error} />}
      {!r ? (
        <Loading />
      ) : (
        <div style={{ opacity: loading ? 0.6 : 1 }}>
          <div className="kpis">
            <Kpi
              label={t("rep.aiChanges")}
              value={r.totals.ai_logged_changes}
              sub={r.totals.ai_changes_without_why ? `${r.totals.ai_changes_without_why} ${t("rep.withoutWhy")}` : undefined}
              warn={r.totals.ai_changes_without_why > 0}
            />
            <Kpi label={t("rep.closed")} value={r.totals.items_closed.total} sub={`${r.totals.items_created.total} ${t("rep.opened")}`} />
            <Kpi
              label={t("rep.questions")}
              value={`${r.totals.questions.answered} / ${r.totals.questions.asked}`}
              sub={
                r.totals.questions.median_answer_hours !== null ? `${t("rep.median")} ${r.totals.questions.median_answer_hours} ${t("rep.hours")}` : undefined
              }
            />
            <Kpi label={t("rep.decisions")} value={r.totals.decisions.accepted} sub={`${r.totals.decisions.proposed} ${t("rep.proposed")}`} />
            <Kpi
              label={t("rep.trust")}
              value={ratio(r.totals.approvals.approved, r.totals.approvals.approved + r.totals.approvals.rejected)}
              sub={`${r.totals.approvals.approved} / ${r.totals.approvals.rejected} · ${r.totals.approvals.pending} ${t("rep.pending")}`}
            />
            <Kpi
              label={t("rep.health")}
              value={r.knowledge.git ? `${r.knowledge.stale} / ${r.knowledge.with_code_links}` : t("rep.noGit")}
              sub={r.knowledge.git && r.knowledge.with_code_links > 0 ? `${fmtPct(r.knowledge.stale_ratio)} ${t("rep.staleWord")}` : undefined}
              warn={r.knowledge.stale > 0}
            >
              {r.knowledge.git && r.knowledge.with_code_links > 0 && (
                <div className="meter" aria-hidden>
                  <span style={{ width: `${Math.round(r.knowledge.stale_ratio * 100)}%`, background: "var(--warn)" }} />
                </div>
              )}
              <div className="sub">
                {r.knowledge.undocumented} {t("rep.undocumented")}
              </div>
            </Kpi>
          </div>

          <div className="charts">
            <section className="card chart-card">
              <div className="chart-head">
                <h2>{t("rep.daily")}</h2>
                <div className="legend" aria-hidden>
                  <span>
                    <i style={{ background: "var(--viz-ai)" }} />
                    {t("rep.ai")} {r.totals.activity.logged.ai}
                  </span>
                  <span>
                    <i style={{ background: "var(--viz-human)" }} />
                    {t("rep.humans")} {r.totals.activity.logged.human}
                  </span>
                  <span className="faint">
                    <i style={{ background: "var(--viz-system)" }} />
                    {t("rep.system")} {r.totals.activity.system.total}
                  </span>
                </div>
                <span className="spacer" />
                <label htmlFor="reports-rep-table" className="check" style={{ fontSize: 12 }}>
                  <input id="reports-rep-table" type="checkbox" checked={asTable} onChange={(e) => setAsTable(e.target.checked)} /> {t("rep.table")}
                </label>
              </div>
              {asTable ? (
                <div style={{ maxHeight: 220, overflow: "auto" }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t("rep.date")}</th>
                        <th className="num">{t("rep.ai")}</th>
                        <th className="num">{t("rep.humans")}</th>
                        <th className="num faint">{t("rep.system")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.daily.map((d) => (
                        <tr key={d.date}>
                          <td>{d.date}</td>
                          <td className="num">{d.ai}</td>
                          <td className="num">{d.human}</td>
                          <td className="num faint">{d.system}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <StackedColumns
                  data={r.daily}
                  series={[
                    { key: "ai", label: t("rep.ai"), color: "var(--viz-ai)" },
                    { key: "human", label: t("rep.humans"), color: "var(--viz-human)" },
                    // Audit entries run ten to thirty per logged change; drawn, they would flatten the work into the axis.
                    { key: "system", label: t("rep.system"), color: "var(--viz-system)", context: true },
                  ]}
                  xLabel={dayLabel}
                  ariaLabel={t("rep.daily")}
                />
              )}
            </section>
            <section className="card chart-card">
              <div className="chart-head">
                <h2>{t("rep.aging")}</h2>
                <span className="faint" style={{ fontSize: 12 }}>
                  {r.attention.open_issues} {t("rep.openIssues")}
                </span>
              </div>
              <HBars
                data={r.attention.issue_aging.map((b) => ({ label: bucket(b.bucket), value: b.count }))}
                color="var(--viz-bar)"
                ariaLabel={t("rep.aging")}
                detail={(i) => {
                  const b = r.attention.issue_aging[i];
                  const sev = Object.entries(b.by_severity);
                  return (
                    <>
                      <div className="faint" style={{ marginBottom: 4 }}>
                        {bucket(b.bucket)}
                      </div>
                      {sev.length ? (
                        sev.map(([k, v]) => (
                          <div key={k} className="tip-row">
                            <b>{v}</b> <span className="muted">{k}</span>
                          </div>
                        ))
                      ) : (
                        <b>0</b>
                      )}
                    </>
                  );
                }}
              />
            </section>
          </div>

          <div className="cols2">
            <Panel title={t("rep.whatAi")} empty={!r.highlights.ai_changes.length}>
              {r.highlights.ai_changes.map((c) => (
                <div key={c.id} className="list-row" style={{ cursor: "default" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="title">{c.summary}</div>
                    {c.why && <div className="tl-why">{c.why}</div>}
                    <div className="meta">
                      <ActorChip id={c.actor} actors={actors} />
                      <span className="chip mono">{c.action}</span>
                      {c.files?.map((f) => (
                        <span key={f} className="chip mono">
                          {f}
                        </span>
                      ))}
                      <Ago iso={c.at} />
                    </div>
                  </div>
                </div>
              ))}
            </Panel>

            <Panel
              title={t("rep.waiting")}
              empty={
                !r.attention.blocking_questions.length &&
                !r.attention.pending_approvals.length &&
                !r.attention.stale_nodes.length &&
                !r.attention.undocumented.length
              }
            >
              <Group title={t("rep.blocking")} n={r.attention.blocking_questions.length}>
                {r.attention.blocking_questions.map((q) => (
                  <ListRow key={q.id} onPress={() => openItem(q.id)}>
                    <span className="title" style={{ flex: 1 }}>
                      {q.title}
                    </span>
                    <span className="chip danger">
                      {q.age_days} {t("rep.d")}
                    </span>
                  </ListRow>
                ))}
              </Group>
              <Group title={t("rep.drafts")} n={r.attention.pending_approvals.length}>
                {r.attention.pending_approvals.map((d) => (
                  <a key={d.draft_id} className="list-row" href="#/approvals" style={{ color: "inherit", textDecoration: "none" }}>
                    <span className="title" style={{ flex: 1 }}>
                      {d.title}
                    </span>
                    <ActorChip id={d.proposed_by} actors={actors} />
                    <span className="chip">
                      {d.age_days} {t("rep.d")}
                    </span>
                  </a>
                ))}
              </Group>
              <Group title={t("rep.stale")} n={r.attention.stale_nodes.length}>
                {r.attention.stale_nodes.map((s) => (
                  <a key={s.path} className="list-row" href={`#/knowledge/${s.path}`} style={{ color: "inherit", textDecoration: "none" }}>
                    <span className="mono" style={{ flex: 1 }}>
                      {s.path}
                    </span>
                    <span className="faint mono" style={{ fontSize: 11.5 }}>
                      {s.files.join(", ")}
                    </span>
                  </a>
                ))}
              </Group>
              <Group title={t("rep.undoc")} n={r.attention.undocumented.length}>
                <div className="row" style={{ gap: 6, padding: "8px 16px" }}>
                  {r.attention.undocumented.map((p) => (
                    <a key={p} className="chip mono" href={`#/knowledge/${p === "(root)" ? "" : p}`}>
                      {p}
                    </a>
                  ))}
                </div>
              </Group>
            </Panel>
          </div>

          <div className="cols2">
            <Panel title={t("rep.decisionsMade")} empty={!r.highlights.decisions.length}>
              {r.highlights.decisions.map((d) => (
                <ListRow key={d.id} onPress={() => openItem(d.id)}>
                  <span className="title" style={{ flex: 1 }}>
                    {d.title}
                  </span>
                  <StatusChip status={d.status} />
                  <ActorChip id={d.by} actors={actors} />
                </ListRow>
              ))}
            </Panel>
            <Panel title={t("rep.closedIssues")} empty={!r.highlights.closed_issues.length}>
              {r.highlights.closed_issues.map((i) => (
                <ListRow key={i.id} onPress={() => openItem(i.id)}>
                  <span className="title" style={{ flex: 1 }}>
                    {i.title}
                  </span>
                  {i.resolution && <span className="chip ok">{i.resolution}</span>}
                  <span className="faint" style={{ fontSize: 11.5 }}>
                    {t("rep.openFor")} {i.days_open} {t("rep.d")}
                  </span>
                </ListRow>
              ))}
            </Panel>
          </div>

          <Panel title={t("rep.actors")} empty={!r.actors.length}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t("rep.actor")}</th>
                  <th className="num">{t("rep.logged")}</th>
                  <th className="num">{t("rep.writes")}</th>
                  <th className="num">{t("rep.approvedRejected")}</th>
                  <th className="num">{t("rep.rate")}</th>
                </tr>
              </thead>
              <tbody>
                {r.actors.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <ActorChip id={a.id} actors={actors} />
                    </td>
                    <td className="num">{a.logged}</td>
                    <td className="num">{a.writes}</td>
                    <td className="num">
                      {a.drafts.approved} / {a.drafts.rejected}
                    </td>
                    <td className="num">{a.approval_rate === null ? "—" : fmtPct(a.approval_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      )}
    </>
  );
}

function Kpi({ label, value, sub, warn, children }: { label: string; value: number | string; sub?: string; warn?: boolean; children?: ReactNode }) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && (
        <div className={`sub ${warn ? "warn" : ""}`}>
          {warn && <Icon name="alert" size={12} />} {sub}
        </div>
      )}
      {children}
    </div>
  );
}

function Panel({ title, empty, children }: { title: string; empty: boolean; children: ReactNode }) {
  const t = useT();
  return (
    <section className="card" style={{ marginBottom: 12 }}>
      <h3 style={{ padding: "14px 16px 6px" }}>{title}</h3>
      {empty ? (
        <div className="empty" style={{ padding: 20 }}>
          {t("rep.nothing")}
        </div>
      ) : (
        <div className="list">{children}</div>
      )}
    </section>
  );
}

function Group({ title, n, children }: { title: string; n: number; children: ReactNode }) {
  if (!n) return null;
  return (
    <div>
      <div className="faint" style={{ padding: "8px 16px 0", fontSize: 11.5, fontWeight: 600 }}>
        {title} ({n})
      </div>
      {children}
    </div>
  );
}

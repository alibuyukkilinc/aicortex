import { useState } from "react";
import { api, useApi } from "../api";
import type { Key } from "../i18n";
import { useT } from "../i18n";
import type { Severity, StaleInfo } from "../types";
import { ErrorBox, Loading, go, useSession, useToast } from "../ui";
import { SeverityChip, StaleBanner } from "./Knowledge";

// Knowledge whose code moved on, as a work list: the node on the left, what changed on the right, and
// Verify / Fix / Snooze on each row. Grouped by how likely the knowledge is to be wrong now.
const GROUPS: { severity: Severity; title: Key; why: Key }[] = [
  { severity: "high", title: "stale.groupHigh", why: "stale.groupHighWhy" },
  { severity: "medium", title: "stale.groupMedium", why: "stale.groupMediumWhy" },
  { severity: "low", title: "stale.groupLow", why: "stale.groupLowWhy" },
];

export function Stale() {
  const t = useT();
  const toast = useToast();
  const { can } = useSession();
  const { data, error, reload } = useApi<{ enabled: boolean; actionable: number; nodes: StaleInfo[] }>("/api/stale");
  const [busy, setBusy] = useState(false);
  const [showSnoozed, setShowSnoozed] = useState(false);

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const awake = data.nodes.filter((n) => !n.snoozed);
  const snoozed = data.nodes.filter((n) => n.snoozed);
  const low = awake.filter((n) => n.severity === "low");

  // Formatting changes cannot make knowledge wrong, so they can be cleared in one go.
  const verifyLow = async () => {
    if (!confirm(t("stale.verifyLowConfirm").replace("{n}", String(low.length)))) return;
    setBusy(true);
    try {
      const r = await api<{ done: string[]; drafts: number; failed: unknown[] }>("/api/verify", { method: "POST", body: { paths: low.map((n) => n.path) } });
      toast({ text: t("stale.verifyLowDone").replace("{n}", String(r.done.length)), error: r.failed.length > 0 });
      reload();
    } catch (e) {
      toast({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  const row = (n: StaleInfo) => (
    <div className="stale-row" key={n.path}>
      <div className="stale-node">
        <a href={`#/knowledge/${n.path}`} className="title">
          {n.title ?? n.path}
        </a>
        <div className="faint mono" style={{ fontSize: 12 }}>
          {n.path || "(root)"}
        </div>
        <SeverityChip severity={n.severity} />
      </div>
      <StaleBanner info={n} path={n.path} compact onEdit={() => go(`knowledge/${n.path}`)} onChanged={reload} />
    </div>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("stale.pageTitle")}</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            {data.enabled ? t("stale.pageIntro").replace("{n}", String(data.actionable)) : t("stale.noGit")}
          </p>
        </div>
      </div>
      {data.enabled && awake.length === 0 && <div className="empty">{t("stale.empty")}</div>}
      {GROUPS.map((g) => {
        const nodes = awake.filter((n) => n.severity === g.severity);
        if (!nodes.length) return null;
        return (
          <section key={g.severity} className="stale-group">
            <div className="stale-group-head">
              <h2>
                {t(g.title)} <span className="faint">{nodes.length}</span>
              </h2>
              {g.severity === "low" && can("write_knowledge") && (
                <button className="btn sm" disabled={busy} onClick={() => void verifyLow()}>
                  {t("stale.verifyLow")}
                </button>
              )}
            </div>
            <p className="muted" style={{ margin: "0 0 10px", fontSize: 13 }}>
              {t(g.why)}
            </p>
            {nodes.map(row)}
          </section>
        );
      })}
      {snoozed.length > 0 && (
        <section className="stale-group">
          <button className="btn ghost sm" aria-expanded={showSnoozed} onClick={() => setShowSnoozed(!showSnoozed)}>
            {t("stale.groupSnoozed")} ({snoozed.length})
          </button>
          {showSnoozed && snoozed.map(row)}
        </section>
      )}
    </>
  );
}

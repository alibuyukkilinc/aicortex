import { useEffect, useState } from "react";
import { qs, useApi } from "../api";
import { useLabels, useT } from "../i18n";
import type { Activity as Entry } from "../types";
import { Ago, Avatar, ErrorBox, Icon, Loading, routeQuery, useSession } from "../ui";

export function Activity() {
  const t = useT();
  const label = useLabels();
  const { actors, ask, openItem } = useSession();
  const [actor, setActor] = useState("");
  const [system, setSystem] = useState(false);
  const focus = routeQuery().get("focus");
  const { data, error, loading } = useApi<{ entries: Entry[] }>(`/api/activity${qs({ actor, include_system: system, limit: 200 })}`);

  useEffect(() => {
    if (focus && data) document.getElementById(`a-${focus}`)?.scrollIntoView({ block: "center" });
  }, [focus, data]);

  const refLink = (r: string) =>
    /^[0-9A-Z]{26}$/.test(r) ? (
      <button type="button" key={r} className="chip mono" onClick={() => openItem(r)} title={r}>
        {r.slice(-8)}
      </button>
    ) : (
      <a key={r} className="chip" href={`#/knowledge/${r}`}>
        {r || "(root)"}
      </a>
    );

  return (
    <>
      <div className="page-head">
        <h1>{t("activity.title")}</h1>
        <span className="spacer" />
        <select className="select" style={{ width: "auto" }} value={actor} onChange={(e) => setActor(e.target.value)}>
          <option value="">{t("board.all")}</option>
          {actors.map((a) => (
            <option key={a.id}>{a.id}</option>
          ))}
        </select>
        <label htmlFor="activity-activity-showsystem" className="check">
          <input id="activity-activity-showsystem" type="checkbox" checked={system} onChange={(e) => setSystem(e.target.checked)} /> {t("activity.showSystem")}
        </label>
      </div>
      {error && <ErrorBox error={error} />}
      {loading ? (
        <Loading />
      ) : (
        <div className="card timeline">
          {data?.entries.length === 0 && <div className="empty">{t("activity.empty")}</div>}
          {data?.entries.map((a) => (
            <div
              key={a.id}
              id={`a-${a.id}`}
              className={`tl-row ${a.system ? "system" : ""}`}
              style={focus === a.id ? { background: "var(--accent-soft)" } : undefined}
            >
              <Avatar id={a.actor} actors={actors} />
              <div style={{ minWidth: 0 }}>
                <div>
                  <strong>{a.actor}</strong>{" "}
                  <span className="chip" title={a.action}>
                    {label.action(a.action)}
                  </span>{" "}
                  {a.summary}
                </div>
                {a.why && (
                  <div className="tl-why">
                    <span className="muted">{t("activity.why")}:</span> {a.why}
                  </div>
                )}
                {(a.files?.length || a.commit || a.refs?.length) && (
                  <div className="tl-files">
                    {a.commit && <span className="chip mono">#{a.commit.slice(0, 7)}</span>}
                    {a.files?.map((f) => (
                      <span key={f} className="chip mono">
                        {f}
                      </span>
                    ))}
                    {a.refs?.map(refLink)}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right", fontSize: 12 }} className="faint">
                <Ago iso={a.at} />
                {!a.system && (
                  <div style={{ marginTop: 4 }}>
                    <button className="btn sm" onClick={() => ask(a.id, a.summary)}>
                      <Icon name="ask" size={13} /> {t("activity.ask")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

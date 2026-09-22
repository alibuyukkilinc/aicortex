import { qs, useApi } from "../api";
import { useT } from "../i18n";
import type { SearchHit } from "../types";
import { Ago, ErrorBox, Loading, StatusChip, go, useSession } from "../ui";

export function Search({ q }: { q: string }) {
  const t = useT();
  const { openItem } = useSession();
  const { data, error, loading } = useApi<{ results: SearchHit[] }>(q ? `/api/search${qs({ q, limit: 30 })}` : null);

  const open = (h: SearchHit) => {
    if (h.kind === "node") go(`knowledge/${h.path}`);
    else if (h.kind === "item") openItem(h.id!);
    else go(`activity?focus=${h.id}`);
  };

  return (
    <>
      <div className="page-head">
        <h1>
          {t("search.title")} “{q}”
        </h1>
      </div>
      {error && <ErrorBox error={error} />}
      {loading && q ? (
        <Loading />
      ) : (
        <div className="card list">
          {data?.results.length === 0 && <div className="empty">{t("search.none")}</div>}
          {data?.results.map((h) => (
            <div key={`${h.kind}-${h.id ?? h.path}`} className="list-row" onClick={() => open(h)}>
              <span className={`chip ${h.kind === "activity" ? "ai" : h.kind === "item" ? "accent" : ""}`} style={{ minWidth: 64, justifyContent: "center" }}>
                {h.kind === "item" ? h.type : h.kind}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="title">{h.title ?? h.summary}</div>
                <div className="meta">
                  {h.path !== undefined && <span className="mono">{h.path || "(root)"}</span>}
                  {h.status && <StatusChip status={h.status} />}
                  {h.actor && <span>{h.actor}</span>}
                  {h.at && <Ago iso={h.at} />}
                  {h.title && h.summary && <span className="faint">{h.summary}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

import { qs, useApi } from "../api";
import { Key, useT } from "../i18n";
import type { SearchHit } from "../types";
import { Ago, ErrorBox, Loading, StatusChip, go, useSession } from "../ui";

interface SearchResponse {
  mode: "hybrid" | "keyword";
  semantic: { state: string; indexed: number; total: number };
  results: SearchHit[];
}

export function Search({ q }: { q: string }) {
  const t = useT();
  const { openItem } = useSession();
  const { data, error, loading } = useApi<SearchResponse>(q ? `/api/search${qs({ q, limit: 30 })}` : null);

  const open = (h: SearchHit) => {
    if (h.kind === "node") go(`knowledge/${h.path}`);
    else if (h.kind === "item") openItem(h.id!);
    else go(`activity?focus=${h.id}`);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            {t("search.title")} “{q}”
          </h1>
          {data && <SearchMode data={data} />}
        </div>
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
              {h.match && data?.mode === "hybrid" && (
                <span className={`chip ${h.match === "keyword" ? "" : "ok"}`} title="match">
                  {t(`match.${h.match}` as Key)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function SearchMode({ data }: { data: SearchResponse }) {
  const t = useT();
  if (data.mode === "hybrid") {
    const s = data.semantic;
    return (
      <p>
        {s.indexed < s.total ? `${t("search.indexing")} ${s.indexed}/${s.total}` : t("search.hybrid")}
      </p>
    );
  }
  return (
    <p>
      {t("search.keywordOnly")} <code>npx projcortex semantic on</code>
    </p>
  );
}

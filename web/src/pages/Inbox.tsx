import { useApi } from "../api";
import { Key, useT } from "../i18n";
import type { ItemSummary } from "../types";
import { ActorChip, Ago, ErrorBox, Loading, StatusChip, useSession } from "../ui";

export function Inbox() {
  const t = useT();
  const { actors, openItem } = useSession();
  const { data, error, loading } = useApi<{ count: number; items: ItemSummary[] }>("/api/inbox?limit=100");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("inbox.title")}</h1>
        </div>
      </div>
      {error && <ErrorBox error={error} />}
      {loading ? (
        <Loading />
      ) : (
        <div className="card list">
          {data?.items.length === 0 && <div className="empty">{t("inbox.empty")}</div>}
          {data?.items.map((i) => (
            <div className="list-row" key={i.id} onClick={() => openItem(i.id)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="title">{i.title}</div>
                <div className="meta">
                  <span className="chip accent">{t(`reason.${i.reason}` as Key)}</span>
                  {i.blocking && <span className="chip danger">{t("item.blocking")}</span>}
                  <span className="chip mono">{i.type}</span>
                  <StatusChip status={i.status} />
                  <ActorChip id={i.author} actors={actors} />
                  {i.category_path && <span className="faint">{i.category_path}</span>}
                </div>
              </div>
              <span className="faint" style={{ fontSize: 12 }}>
                <Ago iso={i.updated_at} />
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

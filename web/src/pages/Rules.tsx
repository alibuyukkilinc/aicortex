import { useEffect, useState } from "react";
import { api, useApi } from "../api";
import { useT } from "../i18n";
import { ErrorBox, Icon, Loading, go, useSession, useToast } from "../ui";

const SPECIAL = ["_global", "activity", "node"];

const NEW_TYPE = (name: string) => `# Edited by humans only. Cortex enforces these rules and explains violations to AIs.
type: ${name}
description: ""
statuses: [open, done]
initial: open
terminal: [done]
transitions: any
human_only_statuses: []
fields: {}
ai_instructions: ""
`;

export function Rules({ name }: { name: string }) {
  const t = useT();
  const { itemTypes, me } = useSession();
  const names = [...SPECIAL, ...itemTypes];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("rules.title")}</h1>
          <p>{t("rules.intro")}</p>
        </div>
      </div>
      <div className="split">
        <nav className="card tree">
          {names.map((n) => (
            <div key={n} className={`tree-row ${n === name ? "active" : ""}`} onClick={() => go(`rules/${n}`)}>
              <span className="name mono">{n}</span>
            </div>
          ))}
          {me.kind === "human" && (
            <div
              className="tree-row"
              onClick={() => {
                const n = prompt(t("rules.newTypeName"))?.trim().toLowerCase();
                if (n) go(`rules/${n}?new=1`);
              }}
            >
              <Icon name="plus" size={14} /> <span className="name">{t("rules.newType")}</span>
            </div>
          )}
        </nav>
        <RuleEditor key={name} name={name} />
      </div>
    </>
  );
}

function RuleEditor({ name }: { name: string }) {
  const t = useT();
  const toast = useToast();
  const { data, error, loading } = useApi<{ source: string; exists: boolean; file: string }>(`/api/rules/${name}/source`);
  const [source, setSource] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);

  useEffect(() => {
    // Keep local edits when a live refresh arrives; only seed from the server once.
    if (data && source === null) setSource(data.source || NEW_TYPE(name));
  }, [data, source, name]);

  const save = async () => {
    setErr(null);
    try {
      await api(`/api/rules/${name}/source`, { method: "PUT", body: { source } });
      toast({ text: t("rules.saved") });
    } catch (e) {
      setErr(e);
    }
  };

  if (error && !data) return <div className="card doc"><ErrorBox error={error} /></div>;
  if (loading || source === null) return <div className="card"><Loading /></div>;
  const dirty = source !== data?.source;
  return (
    <div className="card doc">
      <div className="row" style={{ marginBottom: 10 }}>
        <h2 className="mono" style={{ flex: 1 }}>
          .cortex/rules/{data?.file}
        </h2>
        <button className="btn primary" disabled={!dirty} onClick={() => void save()}>
          {t("common.save")}
        </button>
      </div>
      <textarea className="textarea code" spellCheck={false} value={source} onChange={(e) => setSource(e.target.value)} aria-label={name} />
      <div style={{ marginTop: 10 }}>
        <ErrorBox error={err} />
      </div>
    </div>
  );
}

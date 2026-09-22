import DOMPurify from "dompurify";
import { marked } from "marked";
import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiError } from "./api";
import { GLOSSARY, LangContext, timeAgo, useLabels, useT } from "./i18n";
import type { Actor } from "./types";

// ---- routing (hash based: works from any static file server) --------------------

export function useRoute(): string[] {
  const read = () => decodeURIComponent(location.hash.replace(/^#\/?/, "")).split("?")[0].split("/").filter(Boolean);
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => setParts(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return parts;
}

export function routeQuery(): URLSearchParams {
  return new URLSearchParams(location.hash.split("?")[1] ?? "");
}

export const go = (path: string) => {
  location.hash = `#/${path.replace(/^\/+/, "")}`;
};

// ---- icons (inline, stroke-based) ------------------------------------------------

const paths: Record<string, string> = {
  inbox: "M4 13h4l2 3h4l2-3h4M4 13l2-8h12l2 8v6H4z",
  board: "M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v11h-4z",
  report: "M4 20h16M7 16v-4M12 16V6M17 16v-7",
  tree: "M6 4v16M6 8h8M6 16h8M14 6h6v4h-6zM14 14h6v4h-6z",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  check: "M5 12l5 5L20 7",
  rules: "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  sun: "M12 4V2M12 22v-2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
  x: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14",
  chevron: "M9 6l6 6-6 6",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z",
  ask: "M9 9a3 3 0 1 1 4 2.8c-.6.3-1 .9-1 1.6V14M12 17.5v.5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  file: "M14 3H6v18h12V7zM14 3v4h4",
  logout: "M15 4h4v16h-4M10 17l-5-5 5-5M5 12h11",
  alert: "M12 9v4M12 17v.5M10.3 4.3L2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z",
  edit: "M4 20h4L19 9l-4-4L4 16zM13 7l4 4",
  chat: "M5 5h14v10H9l-4 4z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c0-3.3 3.6-6 8-6s8 2.7 8 6",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z",
};

export function Icon({ name, size = 16 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={paths[name] ?? ""} />
    </svg>
  );
}

// ---- small pieces -----------------------------------------------------------------

export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text ?? "", { async: false, gfm: true, breaks: true }) as string), [text]);
  if (!text?.trim()) return null;
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function ActorChip({ id, actors }: { id?: string; actors: Actor[] }) {
  const t = useT();
  if (!id) return <span className="chip">{t("common.unassigned")}</span>;
  if (id === "@ai") return <span className="chip ai">@ai</span>;
  if (id === "@humans") return <span className="chip human">@humans</span>;
  const kind = actors.find((a) => a.id === id)?.kind ?? "human";
  return <span className={`chip ${kind}`}>{id}</span>;
}

export function Avatar({ id, actors }: { id: string; actors: Actor[] }) {
  const kind = actors.find((a) => a.id === id)?.kind ?? "human";
  return (
    <span className={`avatar ${kind}`} title={id}>
      {kind === "ai" ? "AI" : id.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function Ago({ iso }: { iso: string }) {
  const t = useT();
  const [, tick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(i);
  }, []);
  return <time dateTime={iso} title={new Date(iso).toLocaleString()}>{timeAgo(iso, t)}</time>;
}

const STATUS_TONE: Record<string, string> = {
  open: "warn", todo: "", backlog: "", doing: "accent", in_progress: "accent", review: "accent",
  answered: "ok", accepted: "ok", done: "ok", closed: "", resolved: "ok",
  proposed: "warn", rejected: "danger", superseded: "", archived: "", active: "ok",
  draft: "warn", stale: "danger", deprecated: "",
};
export function StatusChip({ status }: { status: string }) {
  const label = useLabels();
  return (
    <span className={`chip status ${STATUS_TONE[status] ?? ""}`} title={status}>
      {label.status(status)}
    </span>
  );
}

export function TypeChip({ type }: { type: string }) {
  const label = useLabels();
  return (
    <span className="chip type" title={type}>
      {label.type(type)}
    </span>
  );
}

// An English term we keep as-is because that is its name in the tools; hovering (or focusing) explains it.
export function Term({ w, children }: { w: keyof typeof GLOSSARY | string; children?: ReactNode }) {
  const { lang } = useContext(LangContext);
  const entry = GLOSSARY[w];
  if (!entry) return <>{children ?? w}</>;
  return (
    <abbr className="term" title={entry[lang]} tabIndex={0}>
      {children ?? w}
    </abbr>
  );
}

export function Loading() {
  const t = useT();
  return <div className="empty">{t("common.loading")}</div>;
}

export function ErrorBox({ error }: { error: unknown }) {
  const t = useT();
  if (!error) return null;
  const e = error as ApiError;
  const hint = e.hint as { issues?: string[]; allowed_from_here?: string[] } | undefined;
  return (
    <div className="error-box" role="alert">
      <strong>{e.message || t("common.error")}</strong>
      {hint?.issues && (
        <ul>
          {hint.issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
      {hint?.allowed_from_here && <div>→ {hint.allowed_from_here.join(", ") || "—"}</div>}
    </div>
  );
}

// ---- overlays --------------------------------------------------------------------

function useEscape(onClose: () => void) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [onClose]);
}

export function Drawer({ onClose, head, children }: { onClose: () => void; head: ReactNode; children: ReactNode }) {
  const t = useT();
  useEscape(onClose);
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal>
        <div className="drawer-head">
          <div style={{ flex: 1, minWidth: 0 }}>{head}</div>
          <button className="icon-btn" onClick={onClose} aria-label={t("common.close")}>
            <Icon name="x" />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  );
}

export function Modal({ onClose, title, children }: { onClose: () => void; title: string; children: ReactNode }) {
  const t = useT();
  useEscape(onClose);
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t("common.close")}>
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </>
  );
}

// ---- toasts ------------------------------------------------------------------------

interface Toast {
  id: number;
  text: string;
  error?: boolean;
  action?: { label: string; run: () => void };
}
const ToastContext = createContext<(t: Omit<Toast, "id">) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all, { ...t, id }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), t.action ? 9000 : 4500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.error ? "error" : ""}`}>
            <Icon name={t.error ? "alert" : "check"} size={16} />
            <span style={{ flex: 1 }}>{t.text}</span>
            {t.action && (
              <button
                className="btn sm"
                onClick={() => {
                  t.action!.run();
                  setToasts((all) => all.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ---- app-wide session ------------------------------------------------------------

export interface Session {
  me: Actor;
  actors: Actor[];
  itemTypes: string[];
  projectName: string;
  openItem: (id: string) => void;
  ask: (about: string, label: string) => void;
  can: (perm: string) => boolean;
}
export const SessionContext = createContext<Session>(null as unknown as Session);
export const useSession = () => useContext(SessionContext);

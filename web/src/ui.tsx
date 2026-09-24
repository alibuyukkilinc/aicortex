import DOMPurify from "dompurify";
import { marked } from "marked";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ApiError } from "./api";
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
  zap: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  target: "M12 12m-9 0a9 9 0 1 0 18 0 9 9 0 1 0-18 0M12 12m-5 0a5 5 0 1 0 10 0 5 5 0 1 0-10 0M12 12m-1 0a1 1 0 1 0 2 0 1 1 0 1 0-2 0",
  percent: "M19 5L5 19M6.5 6.5m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M17.5 17.5m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0",
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z",
  sidebar: "M4 5h16v14H4zM10 5v14",
  clip: "M20 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15.5 9.5m-1.5 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  text: "M4 6h16M4 11h16M4 16h10",
  clock: "M12 12m-9 0a9 9 0 1 0 18 0 9 9 0 1 0-18 0M12 7v5l3 2",
  debate: "M3 5h11v8H7l-4 3zM10 16h7l4 3v-9h-4",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0",
};

export function Icon({ name, size = 16 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={paths[name] ?? ""} />
    </svg>
  );
}

// ---- small pieces -----------------------------------------------------------------

const WITH_BLOB = /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

// `files`: where "files/<name>" links point: the attachments' URL base of the item this text belongs to,
// or a function for files that exist only in the browser so far (a new item's pasted screenshots).
export function Markdown({ text, files }: { text: string; files?: string | ((name: string) => string) }) {
  const html = useMemo(() => {
    let src = text ?? "";
    if (typeof files === "string") src = src.replace(/\]\((<?)files\//g, (_m, lt: string) => `](${lt}${files}/`);
    else if (files) src = src.replace(/\]\(<files\/([^>]+)>\)|\]\(files\/([^)\s]+)\)/g, (_m, a?: string, b?: string) => `](<${files(a ?? b ?? "")}>)`);
    const html = marked.parse(src, { async: false, gfm: true, breaks: true }) as string;
    // Files not uploaded yet are shown from blob: URLs this page made itself; DOMPurify drops those by
    // default, so they are allowed only in that case, next to its usual list.
    return typeof files === "function" ? DOMPurify.sanitize(html, { ALLOWED_URI_REGEXP: WITH_BLOB }) : DOMPurify.sanitize(html);
  }, [text, files]);
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
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()}>
      {timeAgo(iso, t)}
    </time>
  );
}

const STATUS_TONE: Record<string, string> = {
  open: "warn",
  todo: "",
  backlog: "",
  doing: "accent",
  in_progress: "accent",
  review: "accent",
  answered: "ok",
  accepted: "ok",
  done: "ok",
  closed: "",
  resolved: "ok",
  proposed: "warn",
  rejected: "danger",
  superseded: "",
  archived: "",
  active: "ok",
  draft: "warn",
  stale: "danger",
  deprecated: "",
  deliberating: "accent",
  voted: "warn",
  decided: "ok",
  cancelled: "",
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

// ---- pressable rows ----------------------------------------------------------------

// Something clicked that cannot be a <button>, because it holds block content (a list row, a board
// card, a tree row). It gets what a button gives for free: a role screen readers announce, a place in
// the tab order, and Enter/Space to activate. Keys pressed inside it (a checkbox, a menu) stay theirs.
export function Pressable({
  as = "div",
  onPress,
  className,
  label,
  current,
  children,
  ...rest
}: {
  as?: "div" | "article" | "li";
  onPress: () => void;
  className?: string;
  label?: string;
  current?: boolean;
  children: ReactNode;
} & Partial<Record<`data-${string}` | "draggable" | "onDragStart" | "onDragEnd" | "title", unknown>>) {
  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onPress();
    }
  };
  return createElement(
    as,
    { ...rest, className, role: "button", tabIndex: 0, onClick: onPress, onKeyDown, "aria-label": label, "aria-current": current ? "page" : undefined },
    children,
  );
}

// The `list-row` pattern every list page uses, as one keyboard-reachable component.
export function ListRow({ onPress, className, label, children }: { onPress: () => void; className?: string; label?: string; children: ReactNode }) {
  return (
    <Pressable onPress={onPress} className={`list-row${className ? ` ${className}` : ""}`} label={label}>
      {children}
    </Pressable>
  );
}

// ---- overlays --------------------------------------------------------------------

// Open overlays, newest last. Escape closes only the top one: a preview opened from a drawer must not
// take the drawer with it.
const overlays: { current: () => void }[] = [];
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !overlays.length) return;
    e.preventDefault();
    overlays[overlays.length - 1].current();
  });
}

function useEscape(onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    overlays.push(ref);
    return () => {
      overlays.splice(overlays.indexOf(ref), 1);
    };
  }, []);
}

export function Drawer({ onClose, head, children }: { onClose: () => void; head: ReactNode; children: ReactNode }) {
  const t = useT();
  useEscape(onClose);
  return (
    <>
      <div className="overlay" onClick={onClose} aria-hidden="true" />
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
      <div className="overlay" onClick={onClose} aria-hidden="true" />
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
  itemTypes: string[]; // the board's types: discussions live on their own screen
  allItemTypes: string[];
  projectName: string;
  openItem: (id: string) => void;
  ask: (about: string, label: string) => void;
  can: (perm: string) => boolean;
}
export const SessionContext = createContext<Session>(null as unknown as Session);
export const useSession = () => useContext(SessionContext);

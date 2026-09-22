import { FormEvent, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, LiveContext, api, apiPath, currentProject, useApi } from "./api";
import { AdminPage, HubFrame, HubHome, HubLogin, InvitePage, MembersPage, ProjectSwitcher, UserMenu, useHubMe } from "./hub";
import { Key, Lang, LangContext, initialLang, timeAgo, useT } from "./i18n";
import { AskDialog, ItemDrawer } from "./items";
import { Activity } from "./pages/Activity";
import { Approvals } from "./pages/Approvals";
import { Board } from "./pages/Board";
import { Inbox } from "./pages/Inbox";
import { Knowledge } from "./pages/Knowledge";
import { Reports } from "./pages/Reports";
import { Rules } from "./pages/Rules";
import { Search } from "./pages/Search";
import type { Activity as Entry, HubMe, Me } from "./types";
import { Icon, Loading, SessionContext, ToastProvider, go, routeQuery, useRoute } from "./ui";

export function App() {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("cortex.lang", l);
    } catch {
      // storage blocked: the choice lasts for this tab only
    }
  };
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <ToastProvider>
        <Root />
      </ToastProvider>
    </LangContext.Provider>
  );
}

// Which screen: the server says whether it is a single project or a hub; the path says where we are.
//   hub:  /invite/<token> · /admin (organization) · /p/<project>/ (a board) · / (projects)
//   single project: the board at /
function Root() {
  const [health, setHealth] = useState<{ mode: "hub" | "project"; org?: string } | null>(null);
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ mode: "project" }));
  }, []);
  if (!health) return <Loading />;
  const path = location.pathname;
  if (health.mode === "hub") {
    const invite = /^\/invite\/([^/]+)/.exec(path);
    if (invite) return <InvitePage token={decodeURIComponent(invite[1])} />;
    return <HubRoot org={health.org} />;
  }
  return <ProjectRoot />;
}

function ProjectRoot({ hubMe }: { hubMe?: HubMe }) {
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "login" | "forbidden">("loading");
  useEffect(() => {
    api<Me>("/api/me")
      .then((m) => {
        setMe(m);
        setStatus("ok");
      })
      .catch((e: ApiError) => setStatus(e.status === 403 || e.status === 404 ? "forbidden" : "login"));
  }, []);
  if (status === "loading") return <Loading />;
  if (status === "forbidden" && hubMe) return <NotMember me={hubMe} />;
  if (status !== "ok" || !me) return <LoginScreen />;
  return <Shell me={me} hubMe={hubMe} />;
}

function HubRoot({ org }: { org?: string }) {
  const me = useHubMe();
  if (me.loading && !me.data) return <Loading />;
  if (!me.data) return <HubLogin org={org} />;
  if (currentProject()) return <ProjectRoot hubMe={me.data} />;
  if (location.pathname.startsWith("/admin") && me.data.principal.org_admin) return <AdminPage me={me.data} />;
  return <HubHome me={me.data} />;
}

function NotMember({ me }: { me: HubMe }) {
  const t = useT();
  return (
    <HubFrame me={me}>
      <div className="card empty">
        <p>{t("hub.notMember")}</p>
        <a className="btn" href="/">
          {t("hub.backHome")}
        </a>
      </div>
    </HubFrame>
  );
}

function LoginScreen() {
  const t = useT();
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100%", padding: 16 }}>
      <div className="card" style={{ maxWidth: 480, padding: 28 }}>
        <div className="brand" style={{ marginBottom: 16 }}>
          <span className="brand-mark">
            <Icon name="activity" size={14} />
          </span>
          Cortex
        </div>
        <h1 style={{ marginBottom: 8 }}>{t("login.title")}</h1>
        <p className="muted">{t("login.body")}</p>
        <pre className="card" style={{ padding: "10px 12px", margin: "12px 0" }}>npx aicortex login</pre>
        <p className="muted">{t("login.after")}</p>
      </div>
    </div>
  );
}

// Server-sent events: every write anywhere (API, MCP process, git pull) bumps `live`, which refreshes open views.
function useLive() {
  const [version, setVersion] = useState(0);
  const [connected, setConnected] = useState(false);
  const [last, setLast] = useState<Entry | null>(null);
  const [pulse, setPulse] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const es = new EventSource(apiPath("/api/events"));
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (m) => {
      try {
        const e = JSON.parse(m.data) as { type: string; entry?: Entry };
        if (e.entry && !e.entry.system) setLast(e.entry);
      } catch {
        // ignore malformed events
      }
      setPulse((p) => p + 1);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setVersion((v) => v + 1), 250);
    };
    return () => es.close();
  }, []);
  return { version, connected, last, pulse };
}

const NAV: { key: Key; route: string; icon: string }[] = [
  { key: "nav.inbox", route: "inbox", icon: "inbox" },
  { key: "nav.board", route: "board", icon: "board" },
  { key: "nav.knowledge", route: "knowledge", icon: "tree" },
  { key: "nav.activity", route: "activity", icon: "activity" },
  { key: "nav.approvals", route: "approvals", icon: "check" },
  { key: "nav.reports", route: "reports", icon: "report" },
  { key: "nav.rules", route: "rules", icon: "rules" },
];

function Shell({ me, hubMe }: { me: Me; hubMe?: HubMe }) {
  const live = useLive();
  const route = useRoute();
  const [openId, setOpenId] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ about: string; label: string } | null>(null);

  const session = useMemo(
    () => ({
      me: me.actor,
      actors: me.actors,
      itemTypes: me.item_types,
      projectName: me.project.name,
      openItem: (id: string) => setOpenId(id),
      ask: (about: string, label: string) => setAsking({ about, label }),
      // Hub members carry their role's permissions; a single project allows everything a human can do.
      can: (perm: string) => !me.perms || me.perms.includes(perm),
    }),
    [me],
  );

  // #/item/<id> deep links open the drawer over the inbox.
  const page = route[0] === "item" ? "inbox" : (route[0] ?? "inbox");
  useEffect(() => {
    if (route[0] === "item" && route[1]) setOpenId(route[1]);
  }, [route]);
  const closeItem = () => {
    setOpenId(null);
    if (route[0] === "item") go("inbox");
  };

  let content;
  switch (page) {
    case "board":
      content = <Board key={route[1]} type={route[1] ?? me.item_types[0] ?? "task"} />;
      break;
    case "knowledge":
      content = <Knowledge path={route.slice(1).join("/")} />;
      break;
    case "activity":
      content = <Activity />;
      break;
    case "approvals":
      content = <Approvals />;
      break;
    case "rules":
      content = <Rules name={route[1] ?? "_global"} />;
      break;
    case "reports":
      content = <Reports />;
      break;
    case "members":
      content = hubMe ? <MembersPage canManage={session.can("manage_members")} /> : <Inbox />;
      break;
    case "search":
      content = <Search q={routeQuery().get("q") ?? ""} />;
      break;
    default:
      content = <Inbox />;
  }

  return (
    <SessionContext.Provider value={session}>
      <LiveContext.Provider value={live.version}>
        <div className="app">
          <TopBar me={me} live={live} hubMe={hubMe} />
          <SideBar page={page} hubMe={hubMe} me={me} />
          <main className="main">{content}</main>
        </div>
        {openId && <ItemDrawer key={openId} id={openId} onClose={closeItem} />}
        {asking && <AskDialog about={asking.about} label={asking.label} onClose={() => setAsking(null)} />}
      </LiveContext.Provider>
    </SessionContext.Provider>
  );
}

function TopBar({ me, live, hubMe }: { me: Me; live: ReturnType<typeof useLive>; hubMe?: HubMe }) {
  const t = useT();
  const [q, setQ] = useState(routeQuery().get("q") ?? "");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) go(`search?q=${encodeURIComponent(q.trim())}`);
  };
  const liveText = live.last ? `${live.last.actor}: ${live.last.summary} · ${timeAgo(live.last.at, t)}` : live.connected ? t("live.on") : t("live.off");

  return (
    <header className="topbar">
      <a className="brand" href="#/inbox" style={{ color: "inherit", textDecoration: "none" }}>
        <span className="brand-mark">
          <Icon name="activity" size={14} />
        </span>
        Cortex {!hubMe && <small>· {me.project.name}</small>}
      </a>
      {hubMe && <ProjectSwitcher me={hubMe} />}
      <form className="search" onSubmit={submit} role="search">
        <Icon name="search" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search.placeholder")} aria-label={t("search.placeholder")} />
      </form>
      <div className="topbar-right">
        <span className="live" title={liveText}>
          <span key={live.pulse} className={`live-dot ${live.connected ? "on" : ""} ${live.pulse ? "pulse" : ""}`} />
          <span className="live-text">{liveText}</span>
        </span>
        <ThemeToggle />
        {hubMe && <UserMenu me={hubMe} />}
      </div>
    </header>
  );
}

function ThemeToggle() {
  const t = useT();
  const isDark = () => {
    const root = document.documentElement;
    return root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  };
  const [dark, setDark] = useState(isDark);
  const toggle = () => {
    const root = document.documentElement;
    root.dataset.theme = isDark() ? "light" : "dark";
    setDark(root.dataset.theme === "dark");
    try {
      localStorage.setItem("cortex.theme", root.dataset.theme);
    } catch {
      // storage blocked: theme lasts for this tab only
    }
  };
  return (
    <button className="icon-btn" onClick={toggle} title={t("theme.toggle")} aria-label={t("theme.toggle")}>
      <Icon name={dark ? "sun" : "moon"} />
    </button>
  );
}

function SideBar({ page, hubMe, me }: { page: string; hubMe?: HubMe; me: Me }) {
  const t = useT();
  const inbox = useApi<{ count: number }>("/api/inbox?limit=1");
  const drafts = useApi<{ drafts: unknown[] }>("/api/approvals");
  const stale = useApi<{ nodes: unknown[] }>("/api/stale");
  const counts: Record<string, number> = {
    inbox: inbox.data?.count ?? 0,
    approvals: drafts.data?.drafts.length ?? 0,
    knowledge: stale.data?.nodes.length ?? 0, // knowledge that may be out of date
  };
  const { lang, setLang } = useContext(LangContext);
  const logout = async () => {
    await api("/api/logout", { method: "POST" }).catch(() => {});
    location.reload();
  };

  return (
    <nav className="sidebar" aria-label="main">
      {NAV.filter((n) => n.route !== "reports" || !me.restricted)
        .concat(hubMe ? [{ key: "nav.members", route: "members", icon: "user" }] : [])
        .map((n) => (
        <a key={n.route} href={`#/${n.route}`} className={`nav-link ${page === n.route ? "active" : ""}`}>
          <Icon name={n.icon} />
          {t(n.key)}
          {counts[n.route] ? <span className={`nav-count ${n.route === "knowledge" ? "warn" : ""}`}>{counts[n.route]}</span> : null}
        </a>
      ))}
      {!hubMe && (
      <div className="sidebar-foot">
        <button className="btn ghost sm" onClick={() => setLang(lang === "tr" ? "en" : "tr")}>
          <Icon name="globe" size={14} /> {t("lang.toggle")}
        </button>
        <button className="btn ghost sm" onClick={() => void logout()}>
          <Icon name="logout" size={14} /> {t("logout")}
        </button>
      </div>
      )}
    </nav>
  );
}


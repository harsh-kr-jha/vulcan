"use client";

import {
  Bell,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  Factory,
  Gauge,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  FolderKanban,
  Sigma,
  Settings2,
  ShieldAlert,
  Sprout,
  UploadCloud,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useFactory } from "@/lib/factory-context";
import { usePlatform } from "@/lib/variant";

function Brand() {
  const variant = usePlatform();
  const BrandIcon = variant.features.mushroomAnalytics ? Sprout : Factory;
  return <Link className="brand" href="/dashboard" aria-label={`${variant.displayName} home`}><span className="brand-mark"><BrandIcon size={18} strokeWidth={2.8} /></span><span><strong>{variant.displayName.toLocaleUpperCase("en-US")}</strong><small>{variant.descriptor}</small></span></Link>;
}

function Sidebar({ open, closed, onClose, onNavigate }: { open: boolean; closed: boolean; onClose: () => void; onNavigate: () => void }) {
  const pathname = usePathname();
  const variant = usePlatform();
  const { state, intelligence, setActiveFactory } = useFactory();
  const [factoryMenu, setFactoryMenu] = useState(false);
  const activeFactory = state.factories.find((factory) => factory.id === state.activeFactoryId) ?? state.factories[0];
  const newAlerts = intelligence.alerts.filter((alert) => alert.status === "new").length;
  const siteSingular = variant.terminology.siteSingular;
  const navGroups = [
    { label: "Workspace", items: [
      { href: "/dashboard", label: "Home", icon: LayoutDashboard, module: "dashboard" },
      { href: "/projects", label: variant.navigation.projects, icon: FolderKanban, module: "projects" },
      { href: "/digital-twin", label: variant.navigation["digital-twin"], icon: Workflow, module: "digital-twin" },
      { href: "/data", label: "Data", icon: UploadCloud, module: "uploads" },
      { href: "/performance", label: "Performance", icon: Gauge, module: "performance" },
      { href: "/alerts", label: "Alerts", icon: ShieldAlert, module: "alerts" },
    ].filter((item) => variant.modules.includes(item.module)) },
    { label: "Manage", items: [
      { href: "/settings", label: variant.navigation.settings, icon: Building2, module: "settings" },
      { href: "/rules", label: "Rules & targets", icon: Settings2, module: "rules" },
      { href: "/methodology", label: "Data visualisation", icon: Sigma, module: "methodology" },
    ].filter((item) => variant.modules.includes(item.module)) },
  ];

  return <>
    {open && <button className="sidebar-backdrop" onClick={onClose} aria-label="Close navigation" />}
    <aside className={`sidebar ${open ? "sidebar-open" : ""} ${closed ? "sidebar-closed" : ""}`}>
      <div className="sidebar-top"><Brand /></div>
      <div className="factory-switcher-wrap">
        <button className="factory-switcher" onClick={() => setFactoryMenu((value) => !value)} aria-expanded={factoryMenu}>
          <span className="factory-avatar"><Factory size={17} /></span>
          <span className="factory-switcher-copy"><small>Active {siteSingular}</small><strong>{activeFactory?.name ?? `Create ${siteSingular}`}</strong></span>
          <ChevronDown size={16} />
        </button>
        {factoryMenu && <div className="factory-menu">
          {state.factories.map((factory) => <button key={factory.id} className={factory.id === state.activeFactoryId ? "active" : ""} onClick={() => { setActiveFactory(factory.id); setFactoryMenu(false); }}><span><strong>{factory.name}</strong><small>{factory.code} · {factory.location}</small></span>{factory.id === state.activeFactoryId && <i />}</button>)}
          <Link href="/settings?create=factory" onClick={() => setFactoryMenu(false)}><Plus size={13} /> Create {siteSingular}</Link>
        </div>}
      </div>
      <nav className="sidebar-nav" aria-label="Primary navigation">
        {navGroups.map((group) => <div className="nav-group" key={group.label}><p>{group.label}</p>{group.items.map((item) => { const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href.split("?")[0]); const Icon = item.icon; return <Link className={`nav-item ${active ? "active" : ""}`} href={item.href} key={item.href} onClick={onNavigate}><Icon size={18} /><span>{item.label}</span>{item.href === "/alerts" && newAlerts > 0 && <span className="nav-badge">{newAlerts}</span>}</Link>; })}</div>)}
      </nav>
      <div className="sidebar-footer">
        <Link className="nav-item" href="/help" onClick={onNavigate}><CircleHelp size={18} /><span>Setup help</span></Link>
        <div className="data-health-mini"><div className="data-health-mini-top"><span>Data health</span><strong>{intelligence.dataQuality.toFixed(1)}%</strong></div><div className="mini-progress"><span style={{ width: `${intelligence.dataQuality}%` }} /></div><small>{state.uploads.length} preserved source dataset{state.uploads.length === 1 ? "" : "s"}</small></div>
        <div className="sidebar-byline"><small>by Tamaso.ai</small></div>
      </div>
    </aside>
  </>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarMode, setSidebarMode] = useState<"default" | "open" | "closed">("closed");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const topbarActionsRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { intelligence, filters, state, toggleAction } = useFactory();
  const { user, logout } = useAuth();
  const variant = usePlatform();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const openActions = state.actions.filter((action) => action.status === "open");
  const actionItems = [...state.actions].sort((first, second) => Number(first.status === "done") - Number(second.status === "done"));

  useEffect(() => {
    function closeTopbarPanels() {
      setNotificationsOpen(false);
      setActionsOpen(false);
      setProfileOpen(false);
    }

    function handlePointerDown(event: PointerEvent) {
      if (!topbarActionsRef.current?.contains(event.target as Node)) closeTopbarPanels();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeTopbarPanels();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (pathname === "/login") return <>{children}</>;

  function toggleSidebar() {
    setSidebarMode((current) => {
      const mobile = window.matchMedia("(max-width: 780px)").matches;
      const currentlyOpen = current === "open" || (current === "default" && !mobile);
      return currentlyOpen ? "closed" : "open";
    });
  }
  function closeSidebar() { setSidebarMode("closed"); }
  function closeAfterNavigation() { if (window.matchMedia("(max-width: 780px)").matches) closeSidebar(); }

  return <div className={`app-shell sidebar-is-${sidebarMode}`}>
    <Sidebar open={sidebarMode === "open"} closed={sidebarMode === "closed"} onClose={closeSidebar} onNavigate={closeAfterNavigation} />
    <button className="sidebar-toggle" onClick={toggleSidebar} aria-label="Open or close sidebar"><PanelLeftClose className="sidebar-close-icon" size={17} /><PanelLeftOpen className="sidebar-open-icon" size={17} /></button>
    <div className="app-main">
      <header className="topbar">
        <div className="mobile-brand-row"><div className="mobile-brand"><span className="brand-mark">{variant.features.mushroomAnalytics ? <Sprout size={16} /> : <Factory size={16} />}</span><strong>{variant.displayName.toLocaleUpperCase("en-US")}</strong></div></div>
        <div className="topbar-context"><span className="shift-label">{filters.shift === "all" ? "All shifts" : filters.shift} · {filters.from} to {filters.to}</span></div>
        <div className="topbar-actions" ref={topbarActionsRef}>
          <button className="icon-button action-menu-button" aria-label={`${openActions.length} open action items`} onClick={() => { setActionsOpen((value) => !value); setNotificationsOpen(false); setProfileOpen(false); }}><ClipboardList size={19} />{openActions.length > 0 && <span className="action-counter">{openActions.length > 99 ? "99+" : openActions.length}</span>}</button>
          {actionsOpen && <div className="topbar-popover action-popover"><div className="action-popover-heading"><span><strong>Action items</strong><small>{openActions.length} open for this factory</small></span><Link href="/alerts" onClick={() => setActionsOpen(false)}>View all</Link></div><div className="action-popover-list">{actionItems.slice(0, 6).map((action) => <button key={action.id} className={action.status === "done" ? "action-is-done" : ""} onClick={() => void toggleAction(action.id)}><span className="action-state-icon">{action.status === "done" ? <CheckCircle2 size={17} /> : <i />}</span><span><b>{action.title}</b><small>{action.owner} · due {new Date(`${action.dueDate}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</small></span><em>{action.status === "done" ? "Done" : "Mark done"}</em></button>)}{!state.actions.length && <p>No action items yet. Create one from an alert.</p>}</div></div>}
          <button className="icon-button notification-button" aria-label="Notifications" onClick={() => { setNotificationsOpen((value) => !value); setActionsOpen(false); setProfileOpen(false); }}><Bell size={19} />{intelligence.alerts.some((alert) => alert.status === "new") && <span />}</button>
          {notificationsOpen && <div className="topbar-popover notification-popover"><div><strong>Priority signals</strong><Link href="/alerts" onClick={() => setNotificationsOpen(false)}>View all</Link></div>{intelligence.alerts.filter((alert) => alert.status !== "resolved").slice(0, 3).map((alert) => <Link href="/alerts" key={alert.id} onClick={() => setNotificationsOpen(false)}><i className={`alert-indicator ${alert.severity}`} /><span><b>{alert.title}</b><small>{alert.observed}</small></span></Link>)}{!intelligence.alerts.some((alert) => alert.status !== "resolved") && <p>No open alerts for this selection.</p>}</div>}
          <button className="profile-button" aria-label="Open workspace menu" onClick={() => { setProfileOpen((value) => !value); setNotificationsOpen(false); setActionsOpen(false); setLogoutError(""); }}><span className="profile-avatar">{user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "I"}</span><span className="profile-copy"><strong>{user.name}</strong><small>{user.role ? user.role.replaceAll("_", " ") : "Workspace member"}</small></span><ChevronDown size={15} /></button>
          {profileOpen && <div className="topbar-popover profile-popover"><Link href="/settings" onClick={() => setProfileOpen(false)}><Settings2 size={14} /> {variant.navigation.settings}</Link><button type="button" disabled={loggingOut} onClick={() => { setLoggingOut(true); setLogoutError(""); void logout().catch(() => { setLoggingOut(false); setLogoutError("Sign out failed. Please try again."); }); }}><LogOut size={14} /> {loggingOut ? "Signing out…" : "Sign out"}</button>{logoutError && <p role="alert">{logoutError}</p>}</div>}
        </div>
      </header>
      <main className="page-content">{children}</main>
    </div>
  </div>;
}

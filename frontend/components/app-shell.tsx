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
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Sigma,
  Settings2,
  ShieldAlert,
  Sprout,
  UploadCloud,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useFactory } from "@/lib/factory-context";

const navGroups = [
  { label: "Workspace", items: [
    { href: "/", label: "Home", icon: LayoutDashboard },
    { href: "/digital-twin", label: "Mushroom factory twin", icon: Workflow },
    { href: "/uploads", label: "Data upload", icon: UploadCloud },
    { href: "/performance", label: "Performance", icon: Gauge },
    { href: "/alerts", label: "Alerts", icon: ShieldAlert },
  ] },
  { label: "Manage", items: [
    { href: "/settings", label: "Mushroom factory setup", icon: Building2 },
    { href: "/rules", label: "Rules & targets", icon: Settings2 },
    { href: "/methodology", label: "Data visualisation", icon: Sigma },
  ] },
];

function Brand() {
  return <Link className="brand" href="/" aria-label="Vulcan home"><span className="brand-mark"><Sprout size={18} strokeWidth={2.8} /></span><span><strong>VULCAN</strong><small>Cultivation intelligence</small></span></Link>;
}

function Sidebar({ open, closed, onClose, onNavigate }: { open: boolean; closed: boolean; onClose: () => void; onNavigate: () => void }) {
  const pathname = usePathname();
  const { state, intelligence, setActiveFactory } = useFactory();
  const [factoryMenu, setFactoryMenu] = useState(false);
  const activeFactory = state.factories.find((factory) => factory.id === state.activeFactoryId) ?? state.factories[0];
  const newAlerts = intelligence.alerts.filter((alert) => alert.status === "new").length;

  return <>
    {open && <button className="sidebar-backdrop" onClick={onClose} aria-label="Close navigation" />}
    <aside className={`sidebar ${open ? "sidebar-open" : ""} ${closed ? "sidebar-closed" : ""}`}>
      <div className="sidebar-top"><Brand /></div>
      <div className="factory-switcher-wrap">
        <button className="factory-switcher" onClick={() => setFactoryMenu((value) => !value)} aria-expanded={factoryMenu}>
          <span className="factory-avatar"><Factory size={17} /></span>
          <span className="factory-switcher-copy"><small>Active mushroom factory</small><strong>{activeFactory?.name ?? "Create mushroom factory"}</strong></span>
          <ChevronDown size={16} />
        </button>
        {factoryMenu && <div className="factory-menu">
          {state.factories.map((factory) => <button key={factory.id} className={factory.id === state.activeFactoryId ? "active" : ""} onClick={() => { setActiveFactory(factory.id); setFactoryMenu(false); }}><span><strong>{factory.name}</strong><small>{factory.code} · {factory.location}</small></span>{factory.id === state.activeFactoryId && <i />}</button>)}
          <Link href="/settings?create=factory" onClick={() => setFactoryMenu(false)}><Plus size={13} /> Create mushroom factory</Link>
        </div>}
      </div>
      <nav className="sidebar-nav" aria-label="Primary navigation">
        {navGroups.map((group) => <div className="nav-group" key={group.label}><p>{group.label}</p>{group.items.map((item) => { const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href.split("?")[0]); const Icon = item.icon; return <Link className={`nav-item ${active ? "active" : ""}`} href={item.href} key={item.href} onClick={onNavigate}><Icon size={18} /><span>{item.label}</span>{item.href === "/alerts" && newAlerts > 0 && <span className="nav-badge">{newAlerts}</span>}</Link>; })}</div>)}
      </nav>
      <div className="sidebar-footer">
        <Link className="nav-item" href="/help" onClick={onNavigate}><CircleHelp size={18} /><span>Setup help</span></Link>
        <div className="data-health-mini"><div className="data-health-mini-top"><span>Data health</span><strong>{intelligence.dataQuality.toFixed(1)}%</strong></div><div className="mini-progress"><span style={{ width: `${intelligence.dataQuality}%` }} /></div><small>{state.uploads.length} preserved source dataset{state.uploads.length === 1 ? "" : "s"}</small></div>
      </div>
    </aside>
  </>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarMode, setSidebarMode] = useState<"default" | "open" | "closed">("default");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const pathname = usePathname();
  const { intelligence, filters, state, toggleAction } = useFactory();
  const openActions = state.actions.filter((action) => action.status === "open");
  const actionItems = [...state.actions].sort((first, second) => Number(first.status === "done") - Number(second.status === "done"));
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
        <div className="mobile-brand-row"><div className="mobile-brand"><span className="brand-mark"><Sprout size={16} /></span><strong>VULCAN</strong></div></div>
        <div className="topbar-context"><span className="shift-label">{filters.shift === "all" ? "All shifts" : filters.shift} · {filters.from} to {filters.to}</span></div>
        <div className="topbar-actions">
          <button className="icon-button action-menu-button" aria-label={`${openActions.length} open action items`} onClick={() => { setActionsOpen((value) => !value); setNotificationsOpen(false); setProfileOpen(false); }}><ClipboardList size={19} />{openActions.length > 0 && <span className="action-counter">{openActions.length > 99 ? "99+" : openActions.length}</span>}</button>
          {actionsOpen && <div className="topbar-popover action-popover"><div className="action-popover-heading"><span><strong>Action items</strong><small>{openActions.length} open for this mushroom factory</small></span><Link href="/alerts" onClick={() => setActionsOpen(false)}>View all</Link></div><div className="action-popover-list">{actionItems.slice(0, 6).map((action) => <button key={action.id} className={action.status === "done" ? "action-is-done" : ""} onClick={() => void toggleAction(action.id)}><span className="action-state-icon">{action.status === "done" ? <CheckCircle2 size={17} /> : <i />}</span><span><b>{action.title}</b><small>{action.owner} · due {new Date(`${action.dueDate}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</small></span><em>{action.status === "done" ? "Done" : "Mark done"}</em></button>)}{!state.actions.length && <p>No action items yet. Create one from an alert.</p>}</div></div>}
          <button className="icon-button notification-button" aria-label="Notifications" onClick={() => { setNotificationsOpen((value) => !value); setActionsOpen(false); setProfileOpen(false); }}><Bell size={19} />{intelligence.alerts.some((alert) => alert.status === "new") && <span />}</button>
          {notificationsOpen && <div className="topbar-popover notification-popover"><div><strong>Priority signals</strong><Link href="/alerts" onClick={() => setNotificationsOpen(false)}>View all</Link></div>{intelligence.alerts.filter((alert) => alert.status !== "resolved").slice(0, 3).map((alert) => <Link href="/alerts" key={alert.id} onClick={() => setNotificationsOpen(false)}><i className={`alert-indicator ${alert.severity}`} /><span><b>{alert.title}</b><small>{alert.observed}</small></span></Link>)}{!intelligence.alerts.some((alert) => alert.status !== "resolved") && <p>No open alerts for this selection.</p>}</div>}
          <button className="profile-button" aria-label="Open workspace menu" onClick={() => { setProfileOpen((value) => !value); setNotificationsOpen(false); setActionsOpen(false); }}><span className="profile-avatar">MFT</span><span className="profile-copy"><strong>Mushroom factory team</strong><small>Open workspace</small></span><ChevronDown size={15} /></button>
          {profileOpen && <div className="topbar-popover profile-popover"><Link href="/settings" onClick={() => setProfileOpen(false)}><Settings2 size={14} /> Mushroom factory setup</Link></div>}
        </div>
      </header>
      <main className="page-content">{children}</main>
    </div>
  </div>;
}

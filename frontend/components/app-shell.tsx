"use client";

import {
  Bell,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  Database,
  Factory,
  Gauge,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Sigma,
  Settings2,
  Sparkles,
  Sprout,
  Workflow,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useFactory } from "@/lib/factory-context";

const navGroups = [
  { label: "Workspace", items: [
    { href: "/", label: "Home", icon: LayoutDashboard },
    { href: "/digital-twin", label: "Mushroom factory twin", icon: Workflow },
    { href: "/data", label: "Data", icon: Database },
    { href: "/performance", label: "Performance", icon: Gauge },
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
  const { state, intelligence, twinFeed, setActiveFactory } = useFactory();
  const [factoryMenu, setFactoryMenu] = useState(false);
  const activeFactory = state.factories.find((factory) => factory.id === state.activeFactoryId) ?? state.factories[0];

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
        {navGroups.map((group) => <div className="nav-group" key={group.label}><p>{group.label}</p>{group.items.map((item) => { const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href.split("?")[0]); const Icon = item.icon; return <Link className={`nav-item ${active ? "active" : ""}`} href={item.href} key={item.href} onClick={onNavigate}><Icon size={18} /><span>{item.label}</span></Link>; })}</div>)}
      </nav>
      <div className="sidebar-footer">
        <Link className="nav-item" href="/help" onClick={onNavigate}><CircleHelp size={18} /><span>Setup help</span></Link>
        <div className="data-health-mini">
          <div className="data-health-mini-top">
            <span>Twin data health</span>
            <strong>{intelligence.dataQuality.toFixed(1)}%</strong>
          </div>
          <div className="mini-progress">
            <span style={{ width: `${intelligence.dataQuality}%` }} />
          </div>
          <small>{twinFeed.freshness.machines.reporting_count} of {twinFeed.freshness.machines.total_count || "all"} rooms reporting</small>
        </div>
      </div>
    </aside>
  </>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarMode, setSidebarMode] = useState<"default" | "open" | "closed">("default");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [alertFilter, setAlertFilter] = useState<"active" | "critical" | "all">("active");
  const [alertFeedback, setAlertFeedback] = useState("");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const pathname = usePathname();
  const { intelligence, filters, state, toggleAction, updateAlertStatus, createAction } = useFactory();
  const openActions = state.actions.filter((action) => action.status === "open");
  const actionItems = [...state.actions].sort((first, second) => Number(first.status === "done") - Number(second.status === "done"));

  const allAlerts = intelligence.alerts;
  const activeAlerts = allAlerts.filter((alert) => alert.status !== "resolved" && alert.status !== "dismissed");
  const criticalAlerts = activeAlerts.filter((alert) => alert.severity === "critical");
  const newAlerts = activeAlerts.filter((alert) => alert.status === "new");

  const displayedAlerts = allAlerts.filter((alert) => {
    if (alertFilter === "active") return alert.status !== "resolved" && alert.status !== "dismissed";
    if (alertFilter === "critical") return alert.severity === "critical" && alert.status !== "resolved";
    return true;
  });

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

  function handleAlertStatus(id: string, status: "acknowledged" | "resolved" | "dismissed", title: string) {
    void updateAlertStatus(id, status);
    setAlertFeedback(`Alert "${title}" marked as ${status}.`);
    setTimeout(() => setAlertFeedback(""), 3000);
  }

  function handleCreateAction(alertId: string, title: string) {
    void createAction(alertId, `Resolve: ${title}`);
    setAlertFeedback(`Action item created for alert.`);
    setTimeout(() => setAlertFeedback(""), 3000);
  }

  return <div className={`app-shell sidebar-is-${sidebarMode}`}>
    <Sidebar open={sidebarMode === "open"} closed={sidebarMode === "closed"} onClose={closeSidebar} onNavigate={closeAfterNavigation} />
    <button className="sidebar-toggle" onClick={toggleSidebar} aria-label="Open or close sidebar"><PanelLeftClose className="sidebar-close-icon" size={17} /><PanelLeftOpen className="sidebar-open-icon" size={17} /></button>
    <div className="app-main">
      <header className="topbar">
        <div className="mobile-brand-row"><div className="mobile-brand"><span className="brand-mark"><Sprout size={16} /></span><strong>VULCAN</strong></div></div>
        <div className="topbar-context"><span className="shift-label">{filters.shift === "all" ? "All shifts" : filters.shift} · {filters.from} to {filters.to}</span></div>
        <div className="topbar-actions">
          <button className="icon-button action-menu-button" aria-label={`${openActions.length} open action items`} onClick={() => { setActionsOpen((value) => !value); setNotificationsOpen(false); setProfileOpen(false); }}>
            <ClipboardList size={19} />
            {openActions.length > 0 && <span className="action-counter">{openActions.length > 99 ? "99+" : openActions.length}</span>}
          </button>
          {actionsOpen && <div className="topbar-popover action-popover">
            <div className="action-popover-heading">
              <span><strong>Action items</strong><small>{openActions.length} open for this mushroom factory</small></span>
            </div>
            <div className="action-popover-list">
              {actionItems.slice(0, 8).map((action) => <button key={action.id} className={action.status === "done" ? "action-is-done" : ""} onClick={() => void toggleAction(action.id)}>
                <span className="action-state-icon">{action.status === "done" ? <CheckCircle2 size={17} /> : <i />}</span>
                <span><b>{action.title}</b><small>{action.owner} · due {new Date(`${action.dueDate}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</small></span>
                <em>{action.status === "done" ? "Done" : "Mark done"}</em>
              </button>)}
              {!state.actions.length && <p style={{ padding: "12px", color: "var(--color-text-muted)" }}>No action items yet. Create one from an alert.</p>}
            </div>
          </div>}

          <button className="icon-button notification-button" aria-label="Notifications & Alerts" onClick={() => { setNotificationsOpen((value) => !value); setActionsOpen(false); setProfileOpen(false); }}>
            <Bell size={19} />
            {activeAlerts.length > 0 && <span className="action-counter" style={{ background: criticalAlerts.length > 0 ? "var(--color-danger, #d9534f)" : "var(--color-accent, #337ab7)" }}>{activeAlerts.length}</span>}
          </button>
          {notificationsOpen && <div className="topbar-popover notification-popover" style={{ width: "380px", maxHeight: "520px", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "8px", borderBottom: "1px solid var(--color-border, #e5e7eb)" }}>
              <div>
                <strong>Alert Center</strong>
                <small style={{ display: "block", color: "var(--color-text-muted)", fontSize: "11px" }}>{activeAlerts.length} active exceptions</small>
              </div>
              <div style={{ display: "flex", gap: "4px" }}>
                {(["active", "critical", "all"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setAlertFilter(tab)}
                    style={{
                      padding: "2px 8px",
                      fontSize: "11px",
                      borderRadius: "12px",
                      border: "1px solid",
                      borderColor: alertFilter === tab ? "var(--color-primary, #416f57)" : "transparent",
                      background: alertFilter === tab ? "rgba(65,111,87,0.12)" : "transparent",
                      color: alertFilter === tab ? "var(--color-primary, #416f57)" : "var(--color-text-muted)",
                      cursor: "pointer",
                      textTransform: "capitalize",
                      fontWeight: alertFilter === tab ? 600 : 400,
                    }}
                  >
                    {tab} {tab === "active" ? `(${activeAlerts.length})` : tab === "critical" ? `(${criticalAlerts.length})` : `(${allAlerts.length})`}
                  </button>
                ))}
              </div>
            </div>

            {alertFeedback && <div style={{ padding: "6px 10px", background: "rgba(65,111,87,0.1)", color: "var(--color-primary, #416f57)", fontSize: "11px", borderRadius: "4px", margin: "6px 0", display: "flex", alignItems: "center", gap: "6px" }}>
              <Check size={12} /><span>{alertFeedback}</span>
            </div>}

            <div style={{ overflowY: "auto", flex: 1, paddingRight: "2px", marginTop: "6px" }}>
              {displayedAlerts.map((alert) => (
                <div
                  key={alert.id}
                  style={{
                    padding: "10px",
                    borderRadius: "6px",
                    marginBottom: "8px",
                    background: alert.status === "resolved" ? "rgba(0,0,0,0.02)" : "var(--color-card-bg, #ffffff)",
                    border: "1px solid var(--color-border, #e5e7eb)",
                    borderLeft: `4px solid ${alert.severity === "critical" ? "#e53e3e" : alert.severity === "high" ? "#dd6b20" : "#3182ce"}`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "6px" }}>
                    <strong style={{ fontSize: "12px", color: alert.status === "resolved" ? "var(--color-text-muted)" : "inherit" }}>
                      {alert.title}
                    </strong>
                    <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "3px", textTransform: "uppercase", background: alert.severity === "critical" ? "rgba(229,62,62,0.1)" : "rgba(0,0,0,0.06)", color: alert.severity === "critical" ? "#e53e3e" : "inherit" }}>
                      {alert.severity}
                    </span>
                  </div>
                  <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: "3px 0 6px 0" }}>
                    <b>{alert.asset}</b> · Observed: {alert.observed}
                  </p>
                  {alert.recommendation && (
                    <p style={{ fontSize: "11px", margin: "0 0 8px 0", color: "var(--color-text-secondary, #4a5568)", lineHeight: "1.3" }}>
                      {alert.recommendation}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center", marginTop: "4px" }}>
                    {alert.status === "new" && (
                      <button
                        className="button button-secondary"
                        style={{ padding: "2px 6px", fontSize: "10px", height: "auto" }}
                        onClick={() => handleAlertStatus(alert.id, "acknowledged", alert.title)}
                      >
                        <Check size={11} /> Acknowledge
                      </button>
                    )}
                    {alert.status !== "resolved" && (
                      <button
                        className="button button-primary"
                        style={{ padding: "2px 6px", fontSize: "10px", height: "auto" }}
                        onClick={() => handleAlertStatus(alert.id, "resolved", alert.title)}
                      >
                        <CheckCircle2 size={11} /> Resolve
                      </button>
                    )}
                    {alert.status !== "dismissed" && alert.status !== "resolved" && (
                      <button
                        className="button button-secondary"
                        style={{ padding: "2px 6px", fontSize: "10px", height: "auto" }}
                        onClick={() => handleAlertStatus(alert.id, "dismissed", alert.title)}
                      >
                        Dismiss
                      </button>
                    )}
                    <button
                      className="button button-secondary"
                      style={{ padding: "2px 6px", fontSize: "10px", height: "auto" }}
                      onClick={() => handleCreateAction(alert.id, alert.title)}
                    >
                      <Sparkles size={11} /> Action
                    </button>
                  </div>
                </div>
              ))}
              {!displayedAlerts.length && (
                <div style={{ padding: "24px 12px", textAlign: "center", color: "var(--color-text-muted)" }}>
                  <CheckCircle2 size={24} style={{ margin: "0 auto 8px auto", color: "var(--color-primary, #416f57)" }} />
                  <p style={{ margin: 0, fontWeight: 500 }}>All nominal</p>
                  <small>No {alertFilter !== "all" ? alertFilter : ""} alerts for this factory.</small>
                </div>
              )}
            </div>
          </div>}

          <button className="profile-button" aria-label="Open workspace menu" onClick={() => { setProfileOpen((value) => !value); setNotificationsOpen(false); setActionsOpen(false); }}>
            <span className="profile-avatar">MFT</span>
            <span className="profile-copy"><strong>Mushroom factory team</strong><small>Open workspace</small></span>
            <ChevronDown size={15} />
          </button>
          {profileOpen && <div className="topbar-popover profile-popover">
            <Link href="/settings" onClick={() => setProfileOpen(false)}><Settings2 size={14} /> Mushroom factory setup</Link>
          </div>}
        </div>
      </header>
      <main className="page-content">{children}</main>
    </div>
  </div>;
}

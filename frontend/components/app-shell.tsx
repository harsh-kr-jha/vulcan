"use client";

import {
  Bell,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  Clock,
  Database,
  Factory,
  Gauge,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ShieldAlert,
  Sigma,
  Settings2,
  Sparkles,
  Sprout,
  Workflow,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useFactory } from "@/lib/factory-context";
import type { IntelligenceAlert } from "@/lib/factory-domain";

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

  useEffect(() => {
    if (!notificationsOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setNotificationsOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [notificationsOpen]);

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

          <button
            className="icon-button notification-button"
            aria-label={`Notifications & Alerts (${activeAlerts.length} active)`}
            onClick={() => {
              setNotificationsOpen((value) => !value);
              setActionsOpen(false);
              setProfileOpen(false);
            }}
          >
            <Bell size={19} />
            {activeAlerts.length > 0 && (
              <span
                className="action-counter"
                style={{
                  background:
                    criticalAlerts.length > 0
                      ? "var(--red)"
                      : "var(--green)",
                }}
              >
                {activeAlerts.length > 99 ? "99+" : activeAlerts.length}
              </span>
            )}
          </button>

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

    {notificationsOpen && (
      <div
        className="modal-backdrop alert-dialog-backdrop"
        onClick={() => setNotificationsOpen(false)}
        role="presentation"
      >
        <div
          className="alert-center-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="alert-dialog-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="alert-dialog-header">
            <div>
              <h2 id="alert-dialog-title" className="typography-headline">Active Factory Exceptions</h2>
              <p className="typography-body">Real-time anomaly detection, machine variances, and guided resolution for active factory.</p>
            </div>
            <button
              type="button"
              className="alert-dialog-close"
              onClick={() => setNotificationsOpen(false)}
              aria-label="Close Alert Center"
            >
              <X size={18} />
            </button>
          </div>

          <div className="alert-dialog-toolbar">
            <div className="alert-filter-tabs">
              {(["active", "critical", "all"] as const).map((tab) => {
                const count =
                  tab === "active"
                    ? activeAlerts.length
                    : tab === "critical"
                    ? criticalAlerts.length
                    : allAlerts.length;
                const isSelected = alertFilter === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    className={`alert-tab-button ${isSelected ? "active" : ""}`}
                    onClick={() => setAlertFilter(tab)}
                  >
                    <span>{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
                    <span
                      className={`alert-tab-badge ${
                        tab === "critical" && criticalAlerts.length > 0
                          ? "critical-badge"
                          : ""
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="alert-dialog-stats">
              <span className="stat-pill">
                <small>Active</small> <strong>{activeAlerts.length}</strong>
              </span>
              <span className="stat-pill danger">
                <small>Critical</small> <strong>{criticalAlerts.length}</strong>
              </span>
              <span className="stat-pill">
                <small>Total</small> <strong>{allAlerts.length}</strong>
              </span>
            </div>
          </div>

          {alertFeedback && (
            <div className="alert-feedback-banner">
              <Check size={14} />
              <span>{alertFeedback}</span>
            </div>
          )}

          <div className="alert-dialog-body">
            {displayedAlerts.map((alert) => {
              const isResolved = alert.status === "resolved";
              const isNew = alert.status === "new";

              return (
                <article
                  key={alert.id}
                  className={`alert-entry-card severity-${alert.severity} status-${alert.status}`}
                >
                  <div className="alert-entry-top">
                    <div className="alert-entry-badges">
                      <span className={`severity-tag severity-${alert.severity}`}>
                        {alert.severity}
                      </span>
                      <span className={`status-tag status-${alert.status}`}>
                        {alert.status}
                      </span>
                    </div>
                    {(alert.relativeTime || alert.occurredAt) && (
                      <span className="alert-entry-time">
                        <Clock size={12} />
                        <span>{alert.relativeTime || alert.occurredAt}</span>
                      </span>
                    )}
                  </div>

                  <div className="alert-entry-title-row">
                    <h3 className="alert-entry-title">{alert.title}</h3>
                  </div>

                  {alert.description && alert.description !== alert.title && (
                    <p className="alert-entry-description">{alert.description}</p>
                  )}

                  <div className="alert-meta-grid">
                    <div className="alert-meta-item">
                      <span className="meta-label">Affected Area / Asset</span>
                      <strong className="meta-value">{alert.asset}</strong>
                    </div>
                    <div className="alert-meta-item">
                      <span className="meta-label">Observed Condition</span>
                      <strong className="meta-value">{alert.observed}</strong>
                    </div>
                    {alert.threshold && (
                      <div className="alert-meta-item">
                        <span className="meta-label">Target / Rule</span>
                        <strong className="meta-value">{alert.threshold}</strong>
                      </div>
                    )}
                  </div>

                  {alert.recommendation && (
                    <div className="alert-recommendation-box">
                      <div className="recommendation-header">
                        <Sparkles size={13} />
                        <span>Recommended Resolution</span>
                      </div>
                      <p className="recommendation-text">{alert.recommendation}</p>
                    </div>
                  )}

                  <div className="alert-entry-actions">
                    {isNew && (
                      <button
                        type="button"
                        className="alert-btn btn-acknowledge"
                        onClick={() =>
                          handleAlertStatus(alert.id, "acknowledged", alert.title)
                        }
                      >
                        <Check size={13} />
                        <span>Acknowledge</span>
                      </button>
                    )}
                    {!isResolved && (
                      <button
                        type="button"
                        className="alert-btn btn-resolve"
                        onClick={() => handleAlertStatus(alert.id, "resolved", alert.title)}
                      >
                        <CheckCircle2 size={13} />
                        <span>Resolve</span>
                      </button>
                    )}
                    {alert.status !== "dismissed" && !isResolved && (
                      <button
                        type="button"
                        className="alert-btn btn-dismiss"
                        onClick={() =>
                          handleAlertStatus(alert.id, "dismissed", alert.title)
                        }
                      >
                        <span>Dismiss</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="alert-btn btn-action"
                      onClick={() => handleCreateAction(alert.id, alert.title)}
                    >
                      <Sparkles size={13} />
                      <span>Create Action</span>
                    </button>
                  </div>
                </article>
              );
            })}

            {!displayedAlerts.length && (
              <div className="alert-empty-state">
                <div className="empty-icon-wrapper">
                  <CheckCircle2 size={32} />
                </div>
                <h4>All Nominal</h4>
                <p>
                  {alertFilter === "critical"
                    ? "No critical alerts found for this mushroom factory."
                    : alertFilter === "active"
                    ? "No active exceptions requiring immediate attention."
                    : "No alerts match the selected criteria."}
                </p>
              </div>
            )}
          </div>

          <div className="alert-dialog-footer">
            <div className="alert-footer-summary">
              <span>
                Showing <strong>{displayedAlerts.length}</strong> of{" "}
                <strong>{allAlerts.length}</strong> total exceptions
                {criticalAlerts.length > 0 && ` (${criticalAlerts.length} critical)`}
              </span>
            </div>
            <button
              type="button"
              className="button button-secondary alert-dialog-close-btn"
              onClick={() => setNotificationsOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )}
  </div>;
}

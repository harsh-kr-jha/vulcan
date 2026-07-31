"use client";

import {
  Bell,
  Bolt,
  Building2,
  ChevronDown,
  CircleHelp,
  Factory,
  Gauge,
  LayoutDashboard,
  Menu,
  Plus,
  Settings2,
  ShieldAlert,
  UploadCloud,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useFactory } from "@/lib/factory-context";

const navGroups = [
  { label: "Workspace", items: [
    { href: "/", label: "Home", icon: LayoutDashboard },
    { href: "/uploads", label: "Data upload", icon: UploadCloud },
    { href: "/performance", label: "Performance", icon: Gauge },
    { href: "/alerts", label: "Alerts", icon: ShieldAlert },
  ] },
  { label: "Manage", items: [
    { href: "/settings", label: "Factory setup", icon: Building2 },
  ] },
];

function Brand() {
  return <Link className="brand" href="/" aria-label="Vulcan home"><span className="brand-mark"><Bolt size={18} strokeWidth={2.8} /></span><span><strong>VULCAN</strong><small>Factory intelligence</small></span></Link>;
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { state, intelligence, setActiveFactory } = useFactory();
  const [factoryMenu, setFactoryMenu] = useState(false);
  const activeFactory = state.factories.find((factory) => factory.id === state.activeFactoryId) ?? state.factories[0];
  const newAlerts = intelligence.alerts.filter((alert) => alert.status === "new").length;

  return <>
    {open && <button className="sidebar-backdrop" onClick={onClose} aria-label="Close navigation" />}
    <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
      <div className="sidebar-top"><Brand /><button className="mobile-close" onClick={onClose} aria-label="Close navigation"><X size={20} /></button></div>
      <div className="factory-switcher-wrap">
        <button className="factory-switcher" onClick={() => setFactoryMenu((value) => !value)} aria-expanded={factoryMenu}>
          <span className="factory-avatar"><Factory size={17} /></span>
          <span className="factory-switcher-copy"><small>Active factory</small><strong>{activeFactory?.name ?? "Create factory"}</strong></span>
          <ChevronDown size={16} />
        </button>
        {factoryMenu && <div className="factory-menu">
          {state.factories.map((factory) => <button key={factory.id} className={factory.id === state.activeFactoryId ? "active" : ""} onClick={() => { setActiveFactory(factory.id); setFactoryMenu(false); }}><span><strong>{factory.name}</strong><small>{factory.code} · {factory.location}</small></span>{factory.id === state.activeFactoryId && <i />}</button>)}
          <Link href="/settings?create=factory" onClick={() => setFactoryMenu(false)}><Plus size={13} /> Create factory</Link>
        </div>}
      </div>
      <nav className="sidebar-nav" aria-label="Primary navigation">
        {navGroups.map((group) => <div className="nav-group" key={group.label}><p>{group.label}</p>{group.items.map((item) => { const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href.split("?")[0]); const Icon = item.icon; return <Link className={`nav-item ${active ? "active" : ""}`} href={item.href} key={item.href} onClick={onClose}><Icon size={18} /><span>{item.label}</span>{item.href === "/alerts" && newAlerts > 0 && <span className="nav-badge">{newAlerts}</span>}</Link>; })}</div>)}
      </nav>
      <div className="sidebar-footer">
        <Link className="nav-item" href="/settings"><CircleHelp size={18} /><span>Setup help</span></Link>
        <div className="data-health-mini"><div className="data-health-mini-top"><span>Data health</span><strong>{intelligence.dataQuality.toFixed(1)}%</strong></div><div className="mini-progress"><span style={{ width: `${intelligence.dataQuality}%` }} /></div><small>{state.uploads.length} preserved source dataset{state.uploads.length === 1 ? "" : "s"}</small></div>
      </div>
    </aside>
  </>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const pathname = usePathname();
  const { intelligence, filters } = useFactory();
  if (pathname === "/login") return <>{children}</>;

  return <div className="app-shell">
    <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
    <div className="app-main">
      <header className="topbar">
        <div className="mobile-brand-row"><button className="icon-button menu-button" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu size={20} /></button><div className="mobile-brand"><span className="brand-mark"><Bolt size={16} /></span><strong>VULCAN</strong></div></div>
        <div className="topbar-context"><span className="live-indicator"><i /> Operational answers</span><span className="topbar-separator" /><span className="shift-label">{filters.shift === "all" ? "All shifts" : filters.shift} · {filters.from} to {filters.to}</span></div>
        <div className="topbar-actions">
          <button className="icon-button notification-button" aria-label="Notifications" onClick={() => { setNotificationsOpen((value) => !value); setProfileOpen(false); }}><Bell size={19} />{intelligence.alerts.some((alert) => alert.status === "new") && <span />}</button>
          {notificationsOpen && <div className="topbar-popover notification-popover"><div><strong>Priority signals</strong><Link href="/alerts" onClick={() => setNotificationsOpen(false)}>View all</Link></div>{intelligence.alerts.filter((alert) => alert.status !== "resolved").slice(0, 3).map((alert) => <Link href="/alerts" key={alert.id} onClick={() => setNotificationsOpen(false)}><i className={`alert-indicator ${alert.severity}`} /><span><b>{alert.title}</b><small>{alert.observed}</small></span></Link>)}{!intelligence.alerts.some((alert) => alert.status !== "resolved") && <p>No open alerts for this selection.</p>}</div>}
          <button className="profile-button" aria-label="Open workspace menu" onClick={() => { setProfileOpen((value) => !value); setNotificationsOpen(false); }}><span className="profile-avatar">FT</span><span className="profile-copy"><strong>Factory team</strong><small>Open workspace</small></span><ChevronDown size={15} /></button>
          {profileOpen && <div className="topbar-popover profile-popover"><Link href="/settings" onClick={() => setProfileOpen(false)}><Settings2 size={14} /> Factory setup</Link></div>}
        </div>
      </header>
      <main className="page-content">{children}</main>
    </div>
  </div>;
}

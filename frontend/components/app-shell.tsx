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
  Settings2,
  ShieldAlert,
  UploadCloud,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navGroups = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/performance", label: "Performance", icon: Gauge },
      { href: "/uploads", label: "Data uploads", icon: UploadCloud },
      { href: "/alerts", label: "Alerts", icon: ShieldAlert, badge: "3" },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/settings", label: "Factory setup", icon: Building2 },
      { href: "/settings?tab=rules", label: "Rules & targets", icon: Settings2 },
    ],
  },
];

function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Vulcan overview">
      <span className="brand-mark">
        <Bolt size={18} strokeWidth={2.8} />
      </span>
      <span>
        <strong>VULCAN</strong>
        <small>Factory intelligence</small>
      </span>
    </Link>
  );
}

function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {open && <button className="sidebar-backdrop" onClick={onClose} aria-label="Close navigation" />}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <Brand />
          <button className="mobile-close" onClick={onClose} aria-label="Close navigation">
            <X size={20} />
          </button>
        </div>

        <button className="factory-switcher">
          <span className="factory-avatar">
            <Factory size={17} />
          </span>
          <span className="factory-switcher-copy">
            <small>Active factory</small>
            <strong>Pune Plant 01</strong>
          </span>
          <ChevronDown size={16} />
        </button>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href.split("?")[0]);
                const Icon = item.icon;
                return (
                  <Link
                    className={`nav-item ${active ? "active" : ""}`}
                    href={item.href}
                    key={item.href}
                    onClick={onClose}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                    {item.badge && <span className="nav-badge">{item.badge}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <Link className="nav-item" href="/settings?tab=support">
            <CircleHelp size={18} />
            <span>Help & support</span>
          </Link>
          <div className="data-health-mini">
            <div className="data-health-mini-top">
              <span>Data health</span>
              <strong>98.7%</strong>
            </div>
            <div className="mini-progress">
              <span style={{ width: "98.7%" }} />
            </div>
            <small>Updated 6 minutes ago</small>
          </div>
        </div>
      </aside>
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="app-shell">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="app-main">
        <header className="topbar">
          <div className="mobile-brand-row">
            <button
              className="icon-button menu-button"
              aria-label="Open navigation"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div className="mobile-brand">
              <span className="brand-mark"><Bolt size={16} /></span>
              <strong>VULCAN</strong>
            </div>
          </div>
          <div className="topbar-context">
            <span className="live-indicator"><i /> Live operations</span>
            <span className="topbar-separator" />
            <span className="shift-label">Shift A · 06:00–14:00</span>
          </div>
          <div className="topbar-actions">
            <button className="icon-button notification-button" aria-label="Notifications">
              <Bell size={19} />
              <span />
            </button>
            <button className="profile-button" aria-label="Open account menu">
              <span className="profile-avatar">HK</span>
              <span className="profile-copy">
                <strong>Harsh Kumar</strong>
                <small>Factory manager</small>
              </span>
              <ChevronDown size={15} />
            </button>
          </div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}

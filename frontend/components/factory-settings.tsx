"use client";

import {
  Boxes,
  Building2,
  CalendarClock,
  ChevronRight,
  ClipboardCheck,
  Factory,
  Gauge,
  MapPin,
  Package,
  Plus,
  Settings2,
  UsersRound,
  Wrench,
} from "lucide-react";
import { useState } from "react";

const sections = [
  { id: "profile", label: "Factory profile", icon: Building2 },
  { id: "assets", label: "Lines & machines", icon: Factory },
  { id: "catalogue", label: "Products & materials", icon: Package },
  { id: "calendar", label: "Shifts & calendar", icon: CalendarClock },
  { id: "reasons", label: "Reason codes", icon: ClipboardCheck },
  { id: "people", label: "People & access", icon: UsersRound },
  { id: "rules", label: "Rules & targets", icon: Settings2 },
];

const lines = [
  { name: "Assembly Line 01", code: "LN-01", machines: 8, shift: "A, B, C", status: "Active" },
  { name: "Press Line 02", code: "LN-02", machines: 6, shift: "A, B, C", status: "Active" },
  { name: "Packaging Line 03", code: "LN-03", machines: 5, shift: "A, B", status: "Active" },
];

export function FactorySettings() {
  const [section, setSection] = useState("profile");

  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">Administration</p><h1>Factory <span>setup</span></h1><p className="page-subtitle">Configure the operational context that makes incoming data reliable.</p></div>
        <button className="button button-primary">Save changes</button>
      </header>

      <div className="settings-layout">
        <aside className="panel settings-nav">
          <div className="settings-completion">
            <div><span>Setup health</span><strong>92%</strong></div>
            <i><b /></i>
            <p>2 recommended items remain</p>
          </div>
          <nav>
            {sections.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}>
                  <Icon size={16} /><span>{item.label}</span><ChevronRight size={13} />
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="settings-content">
          <section className="panel factory-profile-card">
            <div className="settings-section-header">
              <div><h2>Factory profile</h2><p>Identity, location, locale and operating context</p></div>
              <span className="configuration-state">Configured</span>
            </div>
            <div className="profile-form">
              <label>Factory name<input defaultValue="Pune Plant 01" /></label>
              <label>Factory code<input defaultValue="PNQ-01" /></label>
              <label>Company<input defaultValue="Vulcan Manufacturing India Pvt. Ltd." /></label>
              <label>Time zone<span className="select-field">Asia/Kolkata (IST)<ChevronRight size={13} /></span></label>
              <label className="full-field">Address<span className="input-with-icon"><MapPin size={14} /><input defaultValue="Chakan Industrial Area, Pune, Maharashtra 410501" /></span></label>
            </div>
          </section>

          <section className="setup-stat-grid">
            <article className="panel"><span><Factory size={16} /></span><div><strong>3</strong><small>Production lines</small></div></article>
            <article className="panel"><span><Wrench size={16} /></span><div><strong>19</strong><small>Machines</small></div></article>
            <article className="panel"><span><Boxes size={16} /></span><div><strong>42</strong><small>Active SKUs</small></div></article>
            <article className="panel"><span><Gauge size={16} /></span><div><strong>16</strong><small>KPI targets</small></div></article>
          </section>

          <section className="panel">
            <div className="settings-section-header">
              <div><h2>Production lines</h2><p>Assets used for mapping, validation and KPI grain</p></div>
              <button className="button button-secondary"><Plus size={13} /> Add line</button>
            </div>
            <div className="table-panel">
              <table className="data-table">
                <thead><tr><th>Line</th><th>Machines</th><th>Operating shifts</th><th>Status</th><th><span className="sr-only">Edit</span></th></tr></thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.code}>
                      <td><span className="table-primary">{line.name}</span><span className="table-secondary">{line.code}</span></td>
                      <td>{line.machines}</td><td>{line.shift}</td>
                      <td><span className="machine-status machine-running"><i />{line.status}</span></td>
                      <td><button className="row-menu" aria-label={`Edit ${line.name}`}><ChevronRight size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

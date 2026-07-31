"use client";

import {
  Boxes,
  Building2,
  CalendarClock,
  Check,
  ChevronRight,
  ClipboardCheck,
  Factory,
  Gauge,
  MapPin,
  Package,
  Plus,
  Settings2,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useFactory } from "@/lib/factory-context";
import type { MasterItem } from "@/lib/factory-domain";

const sections = [
  { id: "profile", label: "Company & factory", icon: Building2 },
  { id: "assets", label: "Lines & machines", icon: Factory },
  { id: "catalogue", label: "Products & materials", icon: Package },
  { id: "calendar", label: "Shifts & calendar", icon: CalendarClock },
  { id: "reasons", label: "Reason codes", icon: ClipboardCheck },
  { id: "rules", label: "Rules & targets", icon: Settings2 },
] as const;
type Section = (typeof sections)[number]["id"];
type MasterCollection = "lines" | "machines" | "skus" | "materials" | "suppliers" | "shifts" | "reasonCodes";

function SettingsHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="settings-section-header"><div><h2>{title}</h2><p>{subtitle}</p></div>{action}</div>;
}

function MasterManager({ collection, title, subtitle, parentCollection }: { collection: MasterCollection; title: string; subtitle: string; parentCollection?: "lines" }) {
  const { state, upsertMaster, removeMaster } = useFactory();
  const [editing, setEditing] = useState<MasterItem | null | "new">(null);
  const items = state.masters[collection].filter((item) => item.factoryId === state.activeFactoryId && item.active);
  const parents = parentCollection ? state.masters[parentCollection].filter((item) => item.factoryId === state.activeFactoryId && item.active) : [];
  const [form, setForm] = useState({ name: "", code: "", parentId: "" });
  function open(item?: MasterItem) { setEditing(item ?? "new"); setForm({ name: item?.name ?? "", code: item?.code ?? "", parentId: item?.parentId ?? parents[0]?.id ?? "" }); }
  async function save(event: FormEvent) { event.preventDefault(); await upsertMaster(collection, { id: editing === "new" ? undefined : editing?.id, name: form.name, code: form.code, parentId: form.parentId || undefined }); setEditing(null); }
  return <section className="panel master-manager"><SettingsHeader title={title} subtitle={subtitle} action={<button className="button button-secondary" onClick={() => open()}><Plus size={13} /> Add</button>} /><div className="master-list">{items.map((item) => <button key={item.id} onClick={() => open(item)}><span className="master-icon">{collection === "machines" ? <Wrench size={15} /> : collection === "materials" ? <Boxes size={15} /> : <Package size={15} />}</span><div><strong>{item.name}</strong><small>{item.code}{item.parentId ? ` · ${parents.find((parent) => parent.id === item.parentId)?.name ?? "Unassigned"}` : ""}</small></div><ChevronRight size={13} /></button>)}{!items.length && <div className="empty-state">No active {title.toLowerCase()} yet.</div>}</div>
    {editing && <div className="nested-editor"><form onSubmit={save}><div><strong>{editing === "new" ? `Add ${title.toLowerCase()}` : `Edit ${editing.name}`}</strong><button type="button" onClick={() => setEditing(null)}><X size={14} /></button></div><label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label><label>Code<input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required /></label>{parentCollection && <label>Production line<select value={form.parentId} onChange={(event) => setForm({ ...form, parentId: event.target.value })}>{parents.map((parent) => <option value={parent.id} key={parent.id}>{parent.name}</option>)}</select></label>}<div>{editing !== "new" && <button type="button" className="button button-danger" onClick={() => { removeMaster(collection, editing.id); setEditing(null); }}><Trash2 size={12} /> Deactivate</button>}<button className="button button-primary"><Check size={12} /> Save</button></div></form></div>}
  </section>;
}

function FactoryDialog({ onClose }: { onClose: () => void }) {
  const { createFactory } = useFactory();
  const [form, setForm] = useState({ name: "", code: "", location: "", timezone: "Asia/Kolkata", currency: "INR" });
  async function submit(event: FormEvent) { event.preventDefault(); await createFactory(form); onClose(); }
  return <div className="modal-backdrop"><form className="upload-modal compact-dialog" onSubmit={submit}><div className="modal-header"><div><span className="modal-step">New operating location</span><h2>Create a factory</h2><p>Master data and operational records remain isolated by factory.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={17} /></button></div><div className="modal-body profile-form"><label>Factory name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ahmedabad Plant 02" required /></label><label>Factory code<input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="AMD-02" required /></label><label className="full-field">Location<input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Sanand, Gujarat" required /></label><label>Time zone<select value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })}><option>Asia/Kolkata</option><option>Asia/Dubai</option><option>Europe/London</option></select></label><label>Currency<select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}><option>INR</option><option>USD</option><option>EUR</option></select></label></div><div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary">Create factory <ChevronRight size={13} /></button></div></form></div>;
}

function ProfileSection() {
  const { state, updateCompany, updateFactory } = useFactory();
  const active = state.factories.find((factory) => factory.id === state.activeFactoryId)!;
  const [company, setCompany] = useState(state.company);
  const [factory, setFactory] = useState(active);
  const [saved, setSaved] = useState(false);
  async function save(event: FormEvent) { event.preventDefault(); await updateCompany(company); await updateFactory(factory.id, factory); setSaved(true); window.setTimeout(() => setSaved(false), 2500); }
  return <form className="panel factory-profile-card" onSubmit={save}><SettingsHeader title="Company and factory profile" subtitle="Identity, industry, locale and operating context" action={<span className="configuration-state">Reviewable</span>} /><div className="profile-form"><label>Company name<input value={company.name} onChange={(event) => setCompany({ ...company, name: event.target.value })} required /></label><label>Industry<input value={company.industry} onChange={(event) => setCompany({ ...company, industry: event.target.value })} required /></label><label>Factory name<input value={factory.name} onChange={(event) => setFactory({ ...factory, name: event.target.value })} required /></label><label>Factory code<input value={factory.code} onChange={(event) => setFactory({ ...factory, code: event.target.value.toUpperCase() })} required /></label><label>Time zone<select value={factory.timezone} onChange={(event) => setFactory({ ...factory, timezone: event.target.value })}><option>Asia/Kolkata</option><option>Asia/Dubai</option><option>Europe/London</option></select></label><label>Currency<select value={factory.currency} onChange={(event) => setFactory({ ...factory, currency: event.target.value })}><option>INR</option><option>USD</option><option>EUR</option></select></label><label className="full-field">Location<span className="input-with-icon"><MapPin size={14} /><input value={factory.location} onChange={(event) => setFactory({ ...factory, location: event.target.value })} required /></span></label></div><div className="settings-form-actions"><span>{saved && <><Check size={12} /> Changes saved</>}</span><button className="button button-primary">Save profile</button></div></form>;
}

function RulesSection() {
  const { state, updateTargets } = useFactory();
  const [values, setValues] = useState(state.targets);
  const [saved, setSaved] = useState(false);
  async function save(event: FormEvent) { event.preventDefault(); await updateTargets(values); setSaved(true); window.setTimeout(() => setSaved(false), 2000); }
  const rules = [{ key: "oee", label: "OEE target", unit: "%" }, { key: "availability", label: "Availability target", unit: "%" }, { key: "performance", label: "Performance target", unit: "%" }, { key: "quality", label: "Quality target", unit: "%" }, { key: "stockCoverDays", label: "Material risk threshold", unit: "days" }, { key: "downtimeMinutes", label: "Downtime alert threshold", unit: "minutes" }] as const;
  return <form className="panel rules-form" onSubmit={save}><SettingsHeader title="Rules and KPI targets" subtitle="Versioned thresholds used by the command centre and alert engine" action={<span className="configuration-state">Rule set v1</span>} /><div>{rules.map((rule) => <label key={rule.key}><span><strong>{rule.label}</strong><small>Factory-level default · editable</small></span><input type="number" min="0" step="0.1" value={values[rule.key]} onChange={(event) => setValues({ ...values, [rule.key]: Number(event.target.value) })} /><b>{rule.unit}</b></label>)}</div><div className="settings-form-actions"><span>{saved && <><Check size={12} /> Rules applied to live answers</>}</span><button className="button button-primary">Save rule set</button></div></form>;
}

export function FactorySettings() {
  const { state } = useFactory();
  const [section, setSection] = useState<Section>("profile");
  const [createOpen, setCreateOpen] = useState(false);
  useEffect(() => {
    const queryTimer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const requested = params.get("tab") as Section | null;
      if (requested && sections.some((item) => item.id === requested)) setSection(requested);
      if (params.get("create") === "factory") setCreateOpen(true);
    }, 0);
    return () => window.clearTimeout(queryTimer);
  }, []);
  function select(next: Section) { setSection(next); window.history.replaceState(null, "", `/settings?tab=${next}`); }
  const activeCount = useMemo(() => ({ lines: state.masters.lines.filter((item) => item.factoryId === state.activeFactoryId && item.active).length, machines: state.masters.machines.filter((item) => item.factoryId === state.activeFactoryId && item.active).length, skus: state.masters.skus.filter((item) => item.factoryId === state.activeFactoryId && item.active).length, materials: state.masters.materials.filter((item) => item.factoryId === state.activeFactoryId && item.active).length }), [state]);

  return <><header className="page-header"><div><p className="eyebrow">Factory configuration</p><h1>One place to define <span>how the factory works.</span></h1><p className="page-subtitle">Factory profile, master data, shifts, reasons, rules and KPI targets—stored together in Django.</p></div><button className="button button-accent" onClick={() => setCreateOpen(true)}><Plus size={13} /> Create factory</button></header><div className="setup-stat-grid"><article className="panel"><span><Factory size={16} /></span><div><strong>{activeCount.lines}</strong><small>Production lines</small></div></article><article className="panel"><span><Wrench size={16} /></span><div><strong>{activeCount.machines}</strong><small>Machines</small></div></article><article className="panel"><span><Boxes size={16} /></span><div><strong>{activeCount.skus}</strong><small>Active SKUs</small></div></article><article className="panel"><span><Gauge size={16} /></span><div><strong>{activeCount.materials}</strong><small>Materials</small></div></article></div>
    <div className="settings-layout"><aside className="panel settings-nav"><div className="settings-completion"><div><span>Setup health</span><strong>92%</strong></div><i><b /></i><p>Core operating model configured</p></div><nav>{sections.map((item) => { const Icon = item.icon; return <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => select(item.id)}><Icon size={16} /><span>{item.label}</span><ChevronRight size={13} /></button>; })}</nav></aside><div className="settings-content">
      {section === "profile" && <ProfileSection key={state.activeFactoryId} />}
      {section === "assets" && <><MasterManager collection="lines" title="Production lines" subtitle="Logical production flow and KPI grouping" /><MasterManager collection="machines" title="Machines" subtitle="Assets connected to a production line" parentCollection="lines" /></>}
      {section === "catalogue" && <><MasterManager collection="skus" title="Products and SKUs" subtitle="Finished and intermediate goods" /><MasterManager collection="materials" title="Materials" subtitle="Consumed inventory and safety stock" /><MasterManager collection="suppliers" title="Suppliers" subtitle="Approved material sources" /></>}
      {section === "calendar" && <MasterManager collection="shifts" title="Shifts" subtitle="Factory calendar and operating windows" />}
      {section === "reasons" && <MasterManager collection="reasonCodes" title="Reason codes" subtitle="Standard loss and exception classification" />}
      {section === "rules" && <RulesSection />}
    </div></div>{createOpen && <FactoryDialog onClose={() => setCreateOpen(false)} />}</>;
}

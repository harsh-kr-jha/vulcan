"use client";

import { Activity, ArrowRight, Boxes, CheckCircle2, Clock3, Database, Gauge, Home, Info, PackageCheck, Plus, Sigma, Trash2, Truck, X } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";

import { useFactory } from "@/lib/factory-context";
import type { CustomKpiDefinition, CustomKpiResult, CustomKpiVariable, FactoryTargets, Intelligence } from "@/lib/factory-domain";

type Family = "Effectiveness" | "Flow" | "Quality" | "Loss" | "Supply" | "Governance";
type MetricDefinition = {
  name: string;
  family: Family;
  meaning: string;
  inputs: string[];
  formula: string;
  treatment: string;
  value: (intelligence: Intelligence) => string;
  target?: (targets: FactoryTargets) => string;
};

const metrics: MetricDefinition[] = [
  { name: "OEE", family: "Effectiveness", meaning: "Combined productive effectiveness of planned operating time.", inputs: ["Availability", "Performance", "Quality"], formula: "Availability × Performance × Quality ÷ 10,000", treatment: "Each component is capped at 100% before multiplication.", value: (data) => `${data.oee.value.toFixed(1)}%`, target: (targets) => `Target ≥ ${targets.oee}%` },
  { name: "Availability", family: "Effectiveness", meaning: "Share of planned time left after recorded downtime.", inputs: ["Planned minutes", "Downtime minutes"], formula: "(Planned min − Downtime min) ÷ Planned min × 100", treatment: "Run time cannot fall below zero; the result is capped at 100%.", value: (data) => `${data.oee.availability.toFixed(1)}%`, target: (targets) => `Target ≥ ${targets.availability}%` },
  { name: "Performance", family: "Effectiveness", meaning: "Actual running speed compared with the ideal cycle requirement.", inputs: ["Ideal cycle", "Actual quantity", "Run minutes"], formula: "Σ(Ideal cycle × Actual quantity) ÷ Run minutes × 100", treatment: "Uses the product mix in the selected period and is capped at 100%.", value: (data) => `${data.oee.performance.toFixed(1)}%`, target: (targets) => `Target ≥ ${targets.performance}%` },
  { name: "Quality", family: "Effectiveness", meaning: "Share of produced units classified as good output.", inputs: ["Good quantity", "Actual quantity"], formula: "Good quantity ÷ Actual quantity × 100", treatment: "Falls back to zero where no actual production exists.", value: (data) => `${data.oee.quality.toFixed(1)}%`, target: (targets) => `Target ≥ ${targets.quality}%` },
  { name: "Throughput", family: "Flow", meaning: "Average actual output produced per run hour.", inputs: ["Actual quantity", "Run minutes"], formula: "Actual quantity ÷ Run minutes × 60", treatment: "Excludes recorded downtime from the available run minutes.", value: (data) => `${data.totals.throughputRate.toFixed(1)} units/hr` },
  { name: "Weighted ideal cycle", family: "Flow", meaning: "Ideal minutes per unit adjusted for the selected product mix.", inputs: ["Ideal cycle", "Actual quantity"], formula: "Σ(Ideal cycle × Actual quantity) ÷ Actual quantity", treatment: "Weights every SKU by its produced quantity.", value: (data) => `${data.totals.idealCycleMinutes.toFixed(3)} min/unit` },
  { name: "Actual cycle", family: "Flow", meaning: "Observed run minutes consumed per produced unit.", inputs: ["Run minutes", "Actual quantity"], formula: "Run minutes ÷ Actual quantity", treatment: "Uses run time after subtracting downtime.", value: (data) => `${data.totals.actualCycleMinutes.toFixed(3)} min/unit` },
  { name: "Cycle variance", family: "Flow", meaning: "How far actual cycle time is from weighted ideal cycle time.", inputs: ["Actual cycle", "Weighted ideal cycle"], formula: "(Actual cycle − Ideal cycle) ÷ Ideal cycle × 100", treatment: "Positive values indicate operation slower than ideal.", value: (data) => `${data.totals.cycleTimeVariance.toFixed(1)}%` },
  { name: "First-pass yield", family: "Quality", meaning: "Share accepted without rejection or rework.", inputs: ["Inspected", "Rejected", "Reworked"], formula: "(Inspected − Rejected − Reworked) ÷ Inspected × 100", treatment: "Uses the quality sheet when present; otherwise good-output quality is used.", value: (data) => `${data.totals.firstPassYield.toFixed(1)}%` },
  { name: "Rejection rate", family: "Quality", meaning: "Rejected share of inspected production.", inputs: ["Rejected quantity", "Inspected quantity"], formula: "Rejected quantity ÷ Inspected quantity × 100", treatment: "Falls back to production actual quantity if no quality sheet is available.", value: (data) => `${data.totals.rejectionRate.toFixed(1)}%`, target: (targets) => `Limit ≤ ${targets.rejectionRate}%` },
  { name: "Rework rate", family: "Quality", meaning: "Share of inspected production requiring rework.", inputs: ["Reworked quantity", "Inspected quantity"], formula: "Reworked quantity ÷ Inspected quantity × 100", treatment: "Falls back to production totals if no quality sheet is available.", value: (data) => `${data.totals.reworkRate.toFixed(1)}%` },
  { name: "Output gap", family: "Loss", meaning: "Planned units that were not produced in the selected period.", inputs: ["Planned quantity", "Actual quantity"], formula: "max(Planned quantity − Actual quantity, 0)", treatment: "Never reports over-production as a negative loss.", value: (data) => `${data.losses.productionGapUnits.toFixed(0)} units` },
  { name: "Downtime frequency", family: "Loss", meaning: "Total standardized stoppage occurrences in the selected period.", inputs: ["Occurrence count per downtime row"], formula: "Σ Downtime occurrences", treatment: "A missing occurrence count is treated as one occurrence for that row.", value: (data) => `${data.totals.downtimeFrequency.toFixed(0)} stops` },
  { name: "Average stoppage", family: "Loss", meaning: "Typical duration of a recorded downtime occurrence.", inputs: ["Total downtime", "Occurrences"], formula: "Total downtime minutes ÷ Downtime occurrences", treatment: "Occurrences come from the mapped downtime sheet.", value: (data) => `${data.totals.averageDowntimeDuration.toFixed(1)} min` },
  { name: "Downtime output loss", family: "Loss", meaning: "Estimated units that downtime prevented at ideal cycle.", inputs: ["Downtime minutes", "Weighted ideal cycle"], formula: "Downtime minutes ÷ Weighted ideal cycle", treatment: "An estimate for comparison—not a posted production transaction.", value: (data) => `${data.losses.downtimeLostUnits.toFixed(0)} units` },
  { name: "Speed output loss", family: "Loss", meaning: "Estimated output lost while running below ideal speed.", inputs: ["Run minutes", "Weighted ideal cycle", "Actual quantity"], formula: "max(Run min ÷ Ideal cycle − Actual quantity, 0)", treatment: "Never reports a negative loss.", value: (data) => `${data.losses.speedLostUnits.toFixed(0)} units` },
  { name: "Inventory cover", family: "Supply", meaning: "Production days supported by the latest material balance.", inputs: ["Available quantity", "Daily consumption"], formula: "Available quantity ÷ Daily consumption", treatment: "Uses the latest inventory row on or before the selected end date.", value: (data) => data.inventoryRisks[0] ? `${data.inventoryRisks[0].stockDays.toFixed(1)} days` : "No material risk", target: (targets) => `Risk below ${targets.stockCoverDays} days` },
  { name: "Supplier score", family: "Supply", meaning: "Auditable delivery performance weighted across completed deliveries.", inputs: ["Delivery timing", "Quantity", "Accepted quality", "Terms"], formula: "Timing 60 + Quantity 25 + Accepted 10 + Terms 5", treatment: "Each late day removes 10 timing points; factory score is delivery-weighted.", value: (data) => `${data.supplierScore.toFixed(1)}/100`, target: (targets) => `Target ≥ ${targets.supplierScore}` },
  { name: "Order risk", family: "Supply", meaning: "Required remaining run rate compared with recent good output.", inputs: ["Remaining units", "Days left", "Average daily good"], formula: "(Remaining units ÷ Days left) ÷ Average daily good", treatment: "Due within one day is critical; above 0.5 is high; otherwise watch.", value: (data) => data.orderRisks[0] ? `${data.orderRisks[0].risk} · ${data.orderRisks[0].remaining.toLocaleString("en-IN")} units` : "No order risk" },
  { name: "Data quality", family: "Governance", meaning: "Average validation quality of completed source imports.", inputs: ["Completed upload quality scores"], formula: "Σ Upload quality score ÷ Completed uploads", treatment: "Raw sources and rejected rows remain preserved for lineage.", value: (data) => `${data.dataQuality.toFixed(1)}%` },
];

const families = ["All", "Effectiveness", "Flow", "Quality", "Loss", "Supply", "Governance"] as const;

const operatorLabels = { add: "+ Add", subtract: "− Subtract", multiply: "× Multiply", divide: "÷ Divide" } as const;

function definitionOf(item: CustomKpiResult): CustomKpiDefinition {
  return { id: item.id, name: item.name, variableA: item.variableA, operation: item.operation, variableB: item.variableB, scale: item.scale, decimals: item.decimals, unit: item.unit, pinnedToHome: item.pinnedToHome };
}

function VariableSelect({ value, variables, onChange }: { value: string; variables: CustomKpiVariable[]; onChange: (value: string) => void }) {
  const datasets = [...new Set(variables.map((item) => item.dataset))];
  return <select value={value} onChange={(event) => onChange(event.target.value)}>{datasets.map((dataset) => <optgroup label={dataset} key={dataset}>{variables.filter((item) => item.dataset === dataset).map((item) => <option value={item.key} key={item.key}>{item.label} · {item.value.toLocaleString("en-IN")} {item.sourceUnit}</option>)}</optgroup>)}</select>;
}

function CustomKpiBuilder({ variables, onClose, onSave }: { variables: CustomKpiVariable[]; onClose: () => void; onSave: (item: CustomKpiDefinition) => Promise<void> }) {
  const [form, setForm] = useState<Omit<CustomKpiDefinition, "id" | "pinnedToHome">>({ name: "", variableA: variables[1]?.key ?? "production.actual", operation: "divide", variableB: variables[5]?.key ?? "downtime.minutes", scale: 1, decimals: 1, unit: "" });
  const [saving, setSaving] = useState(false);
  const first = variables.find((item) => item.key === form.variableA);
  const second = variables.find((item) => item.key === form.variableB);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try { await onSave({ ...form, id: crypto.randomUUID(), pinnedToHome: false }); onClose(); } finally { setSaving(false); }
  }
  return <div className="modal-backdrop"><form className="upload-modal custom-kpi-dialog" onSubmit={submit}><div className="modal-header"><div><span className="modal-step">Custom KPI</span><h2>Build from approved variables</h2><p>Django saves and calculates this formula for the active factory and date filters.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div><div className="modal-body custom-kpi-form"><label className="full-field">KPI name<input value={form.name} maxLength={60} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Output per downtime minute" required /></label><label>First variable<VariableSelect variables={variables} value={form.variableA} onChange={(variableA) => setForm({ ...form, variableA })} /></label><label>Operation<select value={form.operation} onChange={(event) => setForm({ ...form, operation: event.target.value as CustomKpiDefinition["operation"] })}>{Object.entries(operatorLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><label>Second variable<VariableSelect variables={variables} value={form.variableB} onChange={(variableB) => setForm({ ...form, variableB })} /></label><label>Result scale<select value={form.scale} onChange={(event) => setForm({ ...form, scale: Number(event.target.value) as 1 | 100 })}><option value={1}>Raw result</option><option value={100}>Multiply by 100</option></select></label><label>Decimal places<select value={form.decimals} onChange={(event) => setForm({ ...form, decimals: Number(event.target.value) as 0 | 1 | 2 | 3 })}><option value={0}>0</option><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label><label>Display unit<input value={form.unit} maxLength={20} onChange={(event) => setForm({ ...form, unit: event.target.value })} placeholder="%, units/min, ₹/unit…" /></label><div className="custom-formula-preview full-field"><span>Formula preview</span><strong>{first?.label ?? "First variable"} {operatorLabels[form.operation].split(" ")[0]} {second?.label ?? "Second variable"}{form.scale === 100 ? " × 100" : ""}</strong><small>The result will be calculated server-side after saving.</small></div></div><div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Save custom KPI"} <CheckCircle2 size={13} /></button></div></form></div>;
}

export function KpiMethodology() {
  const { intelligence, state, updateCustomKpis } = useFactory();
  const [family, setFamily] = useState<(typeof families)[number]>("All");
  const [builderOpen, setBuilderOpen] = useState(false);
  const visibleMetrics = family === "All" ? metrics : metrics.filter((metric) => metric.family === family);
  const oeeParts = [
    { label: "Availability", value: intelligence.oee.availability, color: "var(--amber)" },
    { label: "Performance", value: intelligence.oee.performance, color: "var(--blue)" },
    { label: "Quality", value: intelligence.oee.quality, color: "var(--green)" },
  ];
  const customDefinitions = intelligence.customKpis.map(definitionOf);
  async function saveCustomKpi(item: CustomKpiDefinition) { await updateCustomKpis([...customDefinitions, item]); }
  async function toggleHome(item: CustomKpiResult) { await updateCustomKpis(customDefinitions.map((definition) => definition.id === item.id ? { ...definition, pinnedToHome: !definition.pinnedToHome } : definition)); }
  async function removeCustomKpi(item: CustomKpiResult) { await updateCustomKpis(customDefinitions.filter((definition) => definition.id !== item.id)); }

  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">Manage · calculation transparency</p><h1>See how every number <span>becomes a decision.</span></h1><p className="page-subtitle">A plain-language map of approved inputs, Django calculations, assumptions and the current factory result.</p></div>
        <button className="button button-accent" disabled={intelligence.customKpis.length >= 12} onClick={() => setBuilderOpen(true)}><Plus size={14} /> Add custom KPI</button>
      </header>
      <section className="panel methodology-flow">
        <div><Database size={18} /><span><strong>Approved records</strong><small>Mapped factory sheets</small></span></div><ArrowRight size={15} />
        <div><Sigma size={18} /><span><strong>Deterministic formulae</strong><small>Calculated in Django</small></span></div><ArrowRight size={15} />
        <div><CheckCircle2 size={18} /><span><strong>Operational answer</strong><small>Filtered to one factory</small></span></div>
      </section>
      <section className="panel oee-method-card">
        <header><div><Gauge size={19} /><span><h2>OEE calculation</h2><p>The headline effectiveness measure, decomposed without hiding the arithmetic.</p></span></div><strong>{intelligence.oee.value.toFixed(1)}%</strong></header>
        <div className="oee-equation">
          {oeeParts.map((part, index) => <div className="oee-equation-part" key={part.label}><span>{part.label}</span><strong>{part.value.toFixed(1)}%</strong><i><b style={{ width: `${Math.min(part.value, 100)}%`, background: part.color }} /></i>{index < 2 && <em>×</em>}</div>)}
          <div className="oee-equation-result"><span>OEE</span><strong>{intelligence.oee.value.toFixed(1)}%</strong><small>Target {state.targets.oee}%</small></div>
        </div>
        <div className="formula-note"><Info size={14} /><span><b>Formula:</b> Availability × Performance × Quality ÷ 10,000. Components are capped at 100%.</span></div>
      </section>
      {intelligence.customKpis.length > 0 && <section className="custom-kpi-section"><div className="custom-kpi-heading"><div><p className="eyebrow">Factory-defined</p><h2>Custom KPIs</h2></div><span>{intelligence.customKpis.length}/12</span></div><div className="custom-kpi-grid">{intelligence.customKpis.map((item) => <article className="panel custom-kpi-card" key={item.id}><header><span>{item.datasets.join(" + ")}</span><strong>{item.value === null ? "—" : item.value.toLocaleString("en-IN", { minimumFractionDigits: item.decimals, maximumFractionDigits: item.decimals })}{item.unit ? ` ${item.unit}` : ""}</strong></header><h3>{item.name}</h3><p>{item.formulaLabel}</p>{item.status === "unavailable" && <small>The second variable is zero, so this result cannot be calculated.</small>}<footer><button className={`button ${item.pinnedToHome ? "button-primary" : "button-secondary"}`} onClick={() => void toggleHome(item)}><Home size={12} /> {item.pinnedToHome ? "On Home" : "Add to Home"}</button><button className="icon-button" aria-label={`Delete ${item.name}`} onClick={() => void removeCustomKpi(item)}><Trash2 size={14} /></button></footer></article>)}</div></section>}
      <nav className="methodology-tabs" aria-label="Metric families">{families.map((item) => <button className={family === item ? "active" : ""} key={item} onClick={() => setFamily(item)}>{item}</button>)}</nav>
      <div className="methodology-grid">
        {visibleMetrics.map((metric) => (
          <article className="panel metric-method-card" key={metric.name}>
            <header><span className={`method-family method-${metric.family.toLowerCase()}`}>{metric.family}</span><strong>{metric.value(intelligence)}</strong></header>
            <h2>{metric.name}</h2><p>{metric.meaning}</p>
            <div className="method-inputs">{metric.inputs.map((input) => <span key={input}>{input}</span>)}</div>
            <div className="method-formula"><Sigma size={13} /><code>{metric.formula}</code></div>
            <footer><span>{metric.treatment}</span>{metric.target && <b>{metric.target(state.targets)}</b>}</footer>
          </article>
        ))}
      </div>
      <section className="panel methodology-sources">
        <header><h2>What each source contributes</h2><p>Only approved rows inside the active factory and selected dates enter these calculations.</p></header>
        <div>
          <article><Activity size={16} /><strong>Production</strong><span>Quantities, planned time, ideal cycle and recorded downtime</span></article>
          <article><Clock3 size={16} /><strong>Downtime</strong><span>Minutes, occurrences, machines and standardized reasons</span></article>
          <article><PackageCheck size={16} /><strong>Quality</strong><span>Inspected, rejected and reworked quantity by reason and SKU</span></article>
          <article><Boxes size={16} /><strong>Inventory</strong><span>Actual balance, unit, consumption and incoming receipt dates</span></article>
          <article><Truck size={16} /><strong>Suppliers</strong><span>Promised and actual delivery, quantity, acceptance and terms</span></article>
        </div>
      </section>
      {builderOpen && <CustomKpiBuilder variables={intelligence.customKpiVariables} onClose={() => setBuilderOpen(false)} onSave={saveCustomKpi} />}
    </>
  );
}

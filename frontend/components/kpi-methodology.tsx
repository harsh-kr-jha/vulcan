"use client";

import { Activity, ArrowRight, Boxes, CheckCircle2, Clock3, Database, Gauge, Home, Info, PackageCheck, Plus, Sigma, Trash2, Truck, X } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";

import { useFactory } from "@/lib/factory-context";
import { formatDuration } from "@/lib/formatters";
import type { CustomKpiDefinition, CustomKpiResult, CustomKpiVariable, FactoryTargets, Intelligence } from "@/lib/factory-domain";

type Family = "Cultivation" | "Harvest" | "Quality" | "Environment" | "Loss" | "Supply" | "Governance";
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
  { name: "Biological efficiency", family: "Cultivation", meaning: "Fresh mushroom harvest produced from dry substrate.", inputs: ["Harvest kg", "Unique dry substrate kg by batch"], formula: "Total harvest kg ÷ dry substrate kg × 100", treatment: "Dry substrate is counted once per crop batch, preventing daily observation duplication.", value: (data) => `${(data.mushroom?.biologicalEfficiency ?? 0).toFixed(1)}%`, target: (targets) => `Target ≥ ${targets.biologicalEfficiency}%` },
  { name: "Plan attainment", family: "Harvest", meaning: "Share of the planned harvest actually collected.", inputs: ["Harvest kg", "Planned harvest kg"], formula: "Harvest kg ÷ planned harvest kg × 100", treatment: "Uses approved harvest rows in the selected date window.", value: (data) => `${(data.mushroom?.planAttainment ?? 0).toFixed(1)}%`, target: (targets) => `Target ≥ ${targets.planAttainment}%` },
  { name: "Saleable yield", family: "Quality", meaning: "Harvest suitable for sale after grading and contamination loss.", inputs: ["Saleable harvest kg", "Total harvest kg"], formula: "Saleable harvest kg ÷ total harvest kg × 100", treatment: "Saleable harvest is the approved good quantity from harvest records.", value: (data) => `${(data.mushroom?.saleableYield ?? 0).toFixed(1)}%`, target: (targets) => `Target ≥ ${targets.saleableYield}%` },
  { name: "Contamination rate", family: "Quality", meaning: "Share of harvest rejected because of contamination or crop-quality loss.", inputs: ["Contaminated harvest kg", "Total harvest kg"], formula: "Contaminated harvest kg ÷ total harvest kg × 100", treatment: "Uses the rejected quantity retained against each harvest or quality record.", value: (data) => `${(data.mushroom?.contaminationRate ?? 0).toFixed(1)}%`, target: (targets) => `Limit ≤ ${targets.contaminationRate}%` },
  { name: "Yield per growing area", family: "Cultivation", meaning: "Harvest density across the active growing area.", inputs: ["Harvest kg", "Unique growing area m² by batch"], formula: "Total harvest kg ÷ growing area m²", treatment: "Growing area is counted once for each batch.", value: (data) => `${(data.mushroom?.yieldPerM2 ?? 0).toFixed(1)} kg/m²` },
  { name: "Water productivity", family: "Environment", meaning: "Mushrooms harvested per kilolitre of recorded water.", inputs: ["Harvest kg", "Water litres"], formula: "Harvest kg ÷ water litres × 1,000", treatment: "Includes water reported in harvest and room-observation sources.", value: (data) => `${(data.mushroom?.waterProductivityKgPerKl ?? 0).toFixed(1)} kg/kL`, target: (targets) => `Target ≥ ${targets.waterProductivity} kg/kL` },
  { name: "Climate compliance", family: "Environment", meaning: "Room observations inside stage-specific temperature, humidity and CO₂ limits.", inputs: ["Room readings", "Configured min/max limits"], formula: "Compliant readings ÷ evaluated readings × 100", treatment: "A reading is compliant only when every supplied limit is satisfied.", value: (data) => `${(data.mushroom?.environmentCompliance ?? 0).toFixed(1)}%`, target: (targets) => `Target ≥ ${targets.environmentCompliance}%` },
  { name: "Average crop age", family: "Cultivation", meaning: "Average crop age at each reported harvest.", inputs: ["Crop age days", "Harvest records"], formula: "Σ crop age days ÷ harvest records", treatment: "Only records with a supplied crop age enter the average.", value: (data) => `${(data.mushroom?.averageCropAgeDays ?? 0).toFixed(1)} days` },
  { name: "Harvest gap", family: "Loss", meaning: "Planned mushroom kg that were not harvested in the selected period.", inputs: ["Planned harvest kg", "Actual harvest kg"], formula: "max(planned harvest − actual harvest, 0)", treatment: "Over-plan harvest is never shown as a negative loss.", value: (data) => `${data.losses.productionGapUnits.toFixed(0)} kg` },
  { name: "Room downtime", family: "Loss", meaning: "Total recorded interruption across growing rooms and farm assets.", inputs: ["Downtime minutes", "Occurrence count"], formula: "Σ downtime minutes", treatment: "Reasons and assets remain traceable to their approved source rows.", value: (data) => formatDuration(data.totals.totalDowntime), target: (targets) => `Alert above ${targets.downtimeMinutes} min` },
  { name: "Inventory cover", family: "Supply", meaning: "Production days supported by the latest material balance.", inputs: ["Available quantity", "Daily consumption"], formula: "Available quantity ÷ Daily consumption", treatment: "Uses the latest inventory row on or before the selected end date.", value: (data) => data.inventoryRisks[0] ? `${data.inventoryRisks[0].stockDays.toFixed(1)} days` : "No material risk", target: (targets) => `Risk below ${targets.stockCoverDays} days` },
  { name: "Supplier score", family: "Supply", meaning: "Auditable delivery performance weighted across completed deliveries.", inputs: ["Delivery timing", "Quantity", "Accepted quality", "Terms"], formula: "Timing 60 + Quantity 25 + Accepted 10 + Terms 5", treatment: "Each late day removes 10 timing points; factory score is delivery-weighted.", value: (data) => `${data.supplierScore.toFixed(1)}/100`, target: (targets) => `Target ≥ ${targets.supplierScore}` },
  { name: "Order risk", family: "Supply", meaning: "Required remaining run rate compared with recent good output.", inputs: ["Remaining units", "Days left", "Average daily good"], formula: "(Remaining units ÷ Days left) ÷ Average daily good", treatment: "Due within one day is critical; above 0.5 is high; otherwise watch.", value: (data) => data.orderRisks[0] ? `${data.orderRisks[0].risk} · ${data.orderRisks[0].remaining.toLocaleString("en-IN")} units` : "No order risk" },
  { name: "Data quality", family: "Governance", meaning: "Average validation quality of completed source imports.", inputs: ["Completed upload quality scores"], formula: "Σ Upload quality score ÷ Completed uploads", treatment: "Raw sources and rejected rows remain preserved for lineage.", value: (data) => `${data.dataQuality.toFixed(1)}%` },
];

const families = ["All", "Cultivation", "Harvest", "Quality", "Environment", "Loss", "Supply", "Governance"] as const;

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
  return <div className="modal-backdrop"><form className="upload-modal custom-kpi-dialog" onSubmit={submit}><div className="modal-header"><div><span className="modal-step">Custom KPI</span><h2>Build from approved variables</h2><p>Django saves and calculates this formula for the active mushroom factory and date filters.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div><div className="modal-body custom-kpi-form"><label className="full-field">KPI name<input value={form.name} maxLength={60} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Output per downtime minute" required /></label><label>First variable<VariableSelect variables={variables} value={form.variableA} onChange={(variableA) => setForm({ ...form, variableA })} /></label><label>Operation<select value={form.operation} onChange={(event) => setForm({ ...form, operation: event.target.value as CustomKpiDefinition["operation"] })}>{Object.entries(operatorLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><label>Second variable<VariableSelect variables={variables} value={form.variableB} onChange={(variableB) => setForm({ ...form, variableB })} /></label><label>Result scale<select value={form.scale} onChange={(event) => setForm({ ...form, scale: Number(event.target.value) as 1 | 100 })}><option value={1}>Raw result</option><option value={100}>Multiply by 100</option></select></label><label>Decimal places<select value={form.decimals} onChange={(event) => setForm({ ...form, decimals: Number(event.target.value) as 0 | 1 | 2 | 3 })}><option value={0}>0</option><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label><label>Display unit<input value={form.unit} maxLength={20} onChange={(event) => setForm({ ...form, unit: event.target.value })} placeholder="%, units/min, ₹/unit…" /></label><div className="custom-formula-preview full-field"><span>Formula preview</span><strong>{first?.label ?? "First variable"} {operatorLabels[form.operation].split(" ")[0]} {second?.label ?? "Second variable"}{form.scale === 100 ? " × 100" : ""}</strong><small>The result will be calculated server-side after saving.</small></div></div><div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Save custom KPI"} <CheckCircle2 size={13} /></button></div></form></div>;
}

export function KpiMethodology() {
  const { intelligence, state, updateCustomKpis } = useFactory();
  const [family, setFamily] = useState<(typeof families)[number]>("All");
  const [builderOpen, setBuilderOpen] = useState(false);
  const visibleMetrics = family === "All" ? metrics : metrics.filter((metric) => metric.family === family);
  const cultivationParts = [
    { label: "Plan attainment", value: intelligence.mushroom.planAttainment, color: "var(--blue)" },
    { label: "Saleable yield", value: intelligence.mushroom.saleableYield, color: "var(--green)" },
    { label: "Climate compliance", value: intelligence.mushroom.environmentCompliance, color: "var(--amber)" },
  ];
  const customDefinitions = intelligence.customKpis.map(definitionOf);
  async function saveCustomKpi(item: CustomKpiDefinition) { await updateCustomKpis([...customDefinitions, item]); }
  async function toggleHome(item: CustomKpiResult) { await updateCustomKpis(customDefinitions.map((definition) => definition.id === item.id ? { ...definition, pinnedToHome: !definition.pinnedToHome } : definition)); }
  async function removeCustomKpi(item: CustomKpiResult) { await updateCustomKpis(customDefinitions.filter((definition) => definition.id !== item.id)); }

  return (
    <>
      <header className="page-header">
        <div><h1 className="typography-display">See how every number <span>becomes a decision.</span></h1><p className="page-subtitle typography-body">A plain-language map of approved inputs, Django calculations, assumptions and the current mushroom factory result.</p></div>
        <button className="button button-accent" disabled={intelligence.customKpis.length >= 12} onClick={() => setBuilderOpen(true)}><Plus size={14} /> Add custom KPI</button>
      </header>
      <section className="panel methodology-flow">
        <div><Database size={18} /><span><strong>Approved records</strong><small>Mapped mushroom factory sheets</small></span></div><ArrowRight size={15} />
        <div><Sigma size={18} /><span><strong>Deterministic formulae</strong><small>Calculated in Django</small></span></div><ArrowRight size={15} />
        <div><CheckCircle2 size={18} /><span><strong>Operational answer</strong><small>Filtered to one mushroom factory</small></span></div>
      </section>
      <section className="panel oee-method-card">
        <header><div><Gauge size={19} /><span><h2 className="typography-headline">Biological efficiency</h2><p className="typography-body">The core cultivation measure: fresh harvest returned by the dry substrate loaded.</p></span></div><strong>{(intelligence.mushroom?.biologicalEfficiency ?? 0).toFixed(1)}%</strong></header>
        <div className="oee-equation">
          {cultivationParts.map((part) => <div className="oee-equation-part" key={part.label}><span>{part.label}</span><strong>{(part.value ?? 0).toFixed(1)}%</strong><i><b style={{ width: `${Math.min(part.value, 100)}%`, background: part.color }} /></i></div>)}
          <div className="oee-equation-result"><span>BE</span><strong>{(intelligence.mushroom?.biologicalEfficiency ?? 0).toFixed(1)}%</strong><small>Target {state.targets.biologicalEfficiency}%</small></div>
        </div>
        <div className="formula-note"><Info size={14} /><span><b>Formula:</b> {(intelligence.mushroom?.totalHarvestKg ?? 0).toLocaleString("en-IN")} kg harvested ÷ {(intelligence.mushroom?.drySubstrateKg ?? 0).toLocaleString("en-IN")} kg dry substrate × 100. Substrate is deduplicated by batch.</span></div>
      </section>
      {intelligence.customKpis.length > 0 && <section className="custom-kpi-section"><div className="custom-kpi-heading"><div><h2 className="typography-headline">Custom KPIs</h2></div><span>{intelligence.customKpis.length}/12</span></div><div className="custom-kpi-grid">{intelligence.customKpis.map((item) => <article className="panel custom-kpi-card" key={item.id}><header><span className="typography-label">{item.datasets.join(" + ")}</span><strong>{item.value === null ? "—" : item.value.toLocaleString("en-IN", { minimumFractionDigits: item.decimals, maximumFractionDigits: item.decimals })}{item.unit ? ` ${item.unit}` : ""}</strong></header><h3 className="typography-title">{item.name}</h3><p className="typography-body">{item.formulaLabel}</p>{item.status === "unavailable" && <small>The second variable is zero, so this result cannot be calculated.</small>}<footer><button className={`button ${item.pinnedToHome ? "button-primary" : "button-secondary"}`} onClick={() => void toggleHome(item)}><Home size={12} /> {item.pinnedToHome ? "On Home" : "Add to Home"}</button><button className="icon-button" aria-label={`Delete ${item.name}`} onClick={() => void removeCustomKpi(item)}><Trash2 size={14} /></button></footer></article>)}</div></section>}
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
        <header><h2>What each source contributes</h2><p>Only approved rows inside the active mushroom factory and selected dates enter these calculations.</p></header>
        <div>
          <article><Activity size={16} /><strong>Harvest</strong><span>Planned, harvested, saleable and contaminated kg; batch, flush, substrate, area, water and crop age</span></article>
          <article><Gauge size={16} /><strong>Room observations</strong><span>Stage, room, batch, temperature, humidity, CO₂, substrate moisture, water and treatments</span></article>
          <article><Clock3 size={16} /><strong>Room downtime</strong><span>Minutes, occurrences, rooms, farm assets and standardized reasons</span></article>
          <article><PackageCheck size={16} /><strong>Crop quality</strong><span>Inspected, contaminated, held or reworked kg by reason and mushroom grade</span></article>
          <article><Boxes size={16} /><strong>Materials</strong><span>Substrate, spawn, casing, packaging and chemical balances with incoming receipts</span></article>
          <article><Truck size={16} /><strong>Suppliers</strong><span>Promised and actual delivery, quantity, acceptance and terms</span></article>
        </div>
      </section>
      {builderOpen && <CustomKpiBuilder variables={intelligence.customKpiVariables} onClose={() => setBuilderOpen(false)} onSave={saveCustomKpi} />}
    </>
  );
}

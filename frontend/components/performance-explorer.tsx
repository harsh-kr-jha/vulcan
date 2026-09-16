"use client";

import type { EChartsOption } from "echarts";
import { ArrowRight, BookOpen, CheckCircle2, Cpu, Download, FileSearch, Info, Loader2, Sigma, Target, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Chart } from "@/components/charts/chart";
import { CommandFilters } from "@/components/command-filters";
import { downloadBlob } from "@/lib/browser-files";
import { formatDuration } from "@/lib/formatters";
import { useFactory } from "@/lib/factory-context";

const tabs = ["Cultivation", "Harvest", "Room downtime", "Crop quality", "Inventory", "Suppliers"] as const;
type Tab = (typeof tabs)[number];

const colors = {
  green: "#416f57",
  blue: "#577fbc",
  amber: "#e2a040",
  red: "#db6653",
  line: "#e6e9e5",
  text: "#68736d",
};
const axis = {
  axisLine: { lineStyle: { color: colors.line } },
  axisTick: { show: false },
  axisLabel: { color: colors.text, fontSize: 11 },
};
const tooltip = {
  trigger: "axis" as const,
  backgroundColor: "#17211d",
  borderWidth: 0,
  textStyle: { color: "#fff", fontSize: 11 },
};

type MetricInfo = {
  name: string;
  family: string;
  meaning: string;
  formula: string;
  inputs: string[];
  treatment: string;
  benchmark?: string;
};

const PERFORMANCE_METRICS_INFO: Record<string, MetricInfo> = {
  "Biological efficiency": {
    name: "Biological efficiency",
    family: "Cultivation",
    meaning: "Fresh mushroom harvest produced from dry substrate weight across crop cycles.",
    formula: "Total harvest kg ÷ Dry substrate kg × 100",
    inputs: ["Harvest kg", "Unique dry substrate kg by batch"],
    treatment: "Dry substrate is counted once per crop batch, preventing duplicate counts across multiple flushes.",
    benchmark: "Industry benchmark for button mushrooms: 85%–110%",
  },
  "Saleable yield": {
    name: "Saleable yield",
    family: "Quality",
    meaning: "Proportion of total harvested mushrooms meeting grade standards and accepted for sale.",
    formula: "Saleable harvest kg ÷ Total harvest kg × 100",
    inputs: ["Saleable harvest kg", "Total harvest kg"],
    treatment: "Deducts contaminated, diseased, or undersized trimmings recorded at harvest grading.",
    benchmark: "Commercial benchmark: ≥ 92%",
  },
  "Climate compliance": {
    name: "Climate compliance",
    family: "Environment",
    meaning: "Percentage of room environmental readings within stage-specific temperature, humidity, and CO₂ limits.",
    formula: "Compliant room readings ÷ Total evaluated readings × 100",
    inputs: ["Telemetry sensor readings (Temp, RH, CO₂)", "Stage setpoint envelopes"],
    treatment: "A reading is compliant only when temperature, relative humidity, and CO₂ all satisfy active stage thresholds.",
    benchmark: "Target: ≥ 95% compliance",
  },
  "Plan attainment": {
    name: "Plan attainment",
    family: "Harvest",
    meaning: "Share of the scheduled production quota achieved during the reporting period.",
    formula: "Actual harvest kg ÷ Planned harvest kg × 100",
    inputs: ["Actual harvest kg", "Production plan target kg"],
    treatment: "Calculated across approved crop room records in the selected date window.",
    benchmark: "Target: ≥ 95%",
  },
  "Saleable harvest": {
    name: "Saleable harvest",
    family: "Harvest",
    meaning: "Net weight of fresh mushrooms packaged and approved for shipment after inspection.",
    formula: "Σ Daily approved good weight (kg)",
    inputs: ["Daily harvest logs", "Sorting station weighments"],
    treatment: "Excludes discarded stems, contaminated caps, and rework batches.",
  },
  "Yield density": {
    name: "Yield density",
    family: "Cultivation",
    meaning: "Harvest output normalized per unit of active growing shelf area.",
    formula: "Total harvest kg ÷ Total growing area (m²)",
    inputs: ["Harvest kg", "Growing room bed area (m²)"],
    treatment: "Growing shelf surface area is counted once per batch room layout.",
    benchmark: "High-yield commercial target: ≥ 28–32 kg/m²",
  },
  "Average crop age": {
    name: "Average crop age",
    family: "Cultivation",
    meaning: "Mean cycle duration from casing or spawning to harvest date.",
    formula: "Σ (Crop age days × Harvest kg) ÷ Total harvest kg",
    inputs: ["Crop initiation date", "Harvest date"],
    treatment: "Only flushes with verified spawning dates enter the weighted average.",
  },
  "Total downtime": {
    name: "Total downtime",
    family: "Downtime & Losses",
    meaning: "Aggregate recorded equipment, environmental system, or room operational stoppages.",
    formula: "Σ Interruption durations across all rooms (hours/minutes)",
    inputs: ["Maintenance logs", "Room climate alarm logs", "Operator shift logs"],
    treatment: "Parsed from IoT status alerts and manual supervisor logs.",
  },
  "Stoppages": {
    name: "Stoppages",
    family: "Downtime & Losses",
    meaning: "Total count of discrete downtime incidents recorded during the period.",
    formula: "Count of distinct outage events",
    inputs: ["Equipment failure events", "HVAC tripping alarms"],
    treatment: "Consecutive duplicate events under 2 minutes are de-bounced.",
  },
  "Average stop": {
    name: "Average stop",
    family: "Downtime & Losses",
    meaning: "Mean duration of downtime per stoppage incident (Mean Time To Repair / Recover).",
    formula: "Total downtime duration ÷ Total stop count",
    inputs: ["Total downtime minutes", "Stoppage count"],
    treatment: "Excludes scheduled sanitization and planned turnaround windows.",
  },
  "Estimated harvest lost": {
    name: "Estimated harvest lost",
    family: "Downtime & Losses",
    meaning: "Harvest potential lost due to climate excursion or room equipment stoppages.",
    formula: "Downtime hours × Configured standard harvest rate (kg/hr)",
    inputs: ["Downtime hours", "Standard flush run-rate"],
    treatment: "Uses room-specific nominal yields adjusted by crop stage.",
  },
  "Contamination": {
    name: "Contamination",
    family: "Quality",
    meaning: "Share of harvest rejected because of contamination or crop-quality loss.",
    formula: "Contaminated harvest kg ÷ Total harvest kg × 100",
    inputs: ["Contaminated harvest kg", "Total harvest kg"],
    treatment: "Uses the rejected quantity retained against each harvest or quality record.",
    benchmark: "Limit: ≤ 3.0%",
  },
  "Quality holds": {
    name: "Quality holds",
    family: "Quality",
    meaning: "Total weight of mushrooms quarantined for secondary inspection, grading, or trimming.",
    formula: "Σ Quarantined or reworked harvest weight (kg)",
    inputs: ["Quality control hold tags", "Sorting weighments"],
    treatment: "Tracked until re-graded, cleared, or condemned.",
  },
  "Overall score": {
    name: "Overall score",
    family: "Supply",
    meaning: "Auditable delivery performance weighted across completed deliveries.",
    formula: "Timing 60% + Quantity 25% + Accepted Quality 10% + Terms 5%",
    inputs: ["Delivery timing", "Quantity", "Accepted quality", "Terms"],
    treatment: "Each late day removes 10 timing points; facility score is delivery-weighted.",
    benchmark: "Target: ≥ 85.0",
  },
  "Suppliers measured": {
    name: "Suppliers measured",
    family: "Supply",
    meaning: "Total number of unique vendors with recorded deliveries in the selected period.",
    formula: "Count of distinct supplier accounts with delivery records",
    inputs: ["Vendor Master", "GRN log"],
    treatment: "Only vendors with completed receipts are evaluated.",
  },
  "Late deliveries": {
    name: "Late deliveries",
    family: "Supply",
    meaning: "Number of purchase order receipts delivered after the contractually promised date.",
    formula: "Count of deliveries where Actual Delivery Date > Promised Date",
    inputs: ["PO promised date", "Warehouse receiving timestamp"],
    treatment: "Uses supplier-specific delivery window terms.",
  },
  "Inventory cover": {
    name: "Inventory cover",
    family: "Supply & Inventory",
    meaning: "Production days supported by the current stock balance of critical mushroom growing supplies.",
    formula: "Available quantity ÷ Daily consumption rate",
    inputs: ["Current stock balance (raw materials, spawn, casing)", "Average daily usage"],
    treatment: "Uses the latest inventory row on or before the selected date. Triggers warning below safety stock threshold.",
    benchmark: "Target: ≥ 14 days cover",
  },
  "Attention items": {
    name: "Attention items",
    family: "Supply & Inventory",
    meaning: "Materials or consumables where stock-on-hand is below the configured reorder buffer.",
    formula: "Count of SKUs where Stock Days < Configured Safety Buffer",
    inputs: ["Inventory ledger", "Purchase orders in-transit"],
    treatment: "Includes casing soil, spawn bags, packaging film, and sanitization chemicals.",
  },
  "Active materials": {
    name: "Active materials",
    family: "Supply & Inventory",
    meaning: "Catalog of essential production ingredients monitored in the automated inventory loop.",
    formula: "Count of tracked inventory line items",
    inputs: ["Raw material master", "Warehouse bin locations"],
    treatment: "Monitored against daily room consumption and lead-time schedules.",
  },
};

type ActiveMetricModal = {
  label: string;
  value: string;
  detail?: string;
};

function MetricInfoModal({ metric, onClose }: { metric: ActiveMetricModal; onClose: () => void }) {
  const info = PERFORMANCE_METRICS_INFO[metric.label] ?? {
    name: metric.label,
    family: "Performance KPI",
    meaning: `Operational performance measure for ${metric.label.toLowerCase()}.`,
    formula: "Derived from factory records and telemetry.",
    inputs: ["Operational logs", "Factory telemetry"],
    treatment: "Evaluated over the filtered time window.",
  };

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="metric-dialog-title">
      <div className="upload-modal metric-info-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="modal-step">{info.family} · Calculation &amp; Methodology</span>
            <h2 id="metric-dialog-title">{info.name}</h2>
            <p>{info.meaning}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="metric-info-value-box">
            <div className="metric-info-val-left">
              <span>Current Value</span>
              <strong>{metric.value}</strong>
            </div>
            {metric.detail && (
              <div className="metric-info-val-right">
                <span>{metric.detail}</span>
              </div>
            )}
          </div>

          <div className="metric-info-block">
            <span className="metric-info-block-label">
              <Sigma size={13} style={{ color: "var(--green)" }} />
              Formula
            </span>
            <div className="metric-info-formula-code">{info.formula}</div>
          </div>

          <div className="metric-info-block">
            <span className="metric-info-block-label">Telemetry &amp; Inputs</span>
            <ul className="metric-info-inputs-list">
              {info.inputs.map((input) => (
                <li key={input} className="metric-info-input-chip">{input}</li>
              ))}
            </ul>
          </div>

          <div className="metric-info-block">
            <span className="metric-info-block-label">Data Treatment &amp; Rules</span>
            <p className="metric-info-treatment-text">{info.treatment}</p>
          </div>

          {info.benchmark && (
            <div className="metric-info-block">
              <span className="metric-info-block-label">Benchmark / Target</span>
              <p className="metric-info-desc-text" style={{ color: "var(--green)", fontWeight: 600 }}>{info.benchmark}</p>
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 22px", borderTop: "1px solid var(--line)" }}>
          <Link href="/methodology" className="button button-secondary" onClick={onClose} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <BookOpen size={14} /> Full KPI Methodology
          </Link>
          <button type="button" className="button button-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function MetricRow({
  metrics,
  onInfoClick,
}: {
  metrics: { label: string; value: string; detail: string }[];
  onInfoClick?: (label: string, value: string, detail: string) => void;
}) {
  return (
    <div className="performance-metric-strip" style={{ gridTemplateColumns: `repeat(${metrics.length}, 1fr)` }}>
      {metrics.map((metric) => (
        <div key={metric.label}>
          <div className="metric-strip-header">
            <span>{metric.label}</span>
            {onInfoClick && (
              <button
                type="button"
                className="metric-info-btn"
                aria-label={`Methodology and formula for ${metric.label}`}
                title={`View ${metric.label} methodology`}
                onClick={() => onInfoClick(metric.label, metric.value, metric.detail)}
              >
                <Info size={14} />
              </button>
            )}
          </div>
          <strong>{metric.value}</strong>
          <small>{metric.detail}</small>
        </div>
      ))}
    </div>
  );
}

function PerformancePanel({ title, subtitle, option }: { title: string; subtitle: string; option: EChartsOption }) {
  return (
    <section className="panel generic-performance-chart">
      <div className="panel-header">
        <div><h2 className="panel-title">{title}</h2><p className="panel-subtitle">{subtitle}</p></div>
      </div>
      <div className="chart-wrap"><Chart option={option} height={340} /></div>
    </section>
  );
}

function CultivationView({ onInfoClick }: { onInfoClick: (label: string, value: string, detail: string) => void }) {
  const { intelligence, state } = useFactory();
  const mushroom = intelligence.mushroom;
  const components = [
    { label: "Biological efficiency", value: mushroom?.biologicalEfficiency ?? 0, target: state.targets.biologicalEfficiency, color: colors.green },
    { label: "Saleable yield", value: mushroom?.saleableYield ?? 0, target: state.targets.saleableYield, color: colors.blue },
    { label: "Climate compliance", value: mushroom?.environmentCompliance ?? 0, target: state.targets.environmentCompliance, color: colors.amber },
    { label: "Plan attainment", value: mushroom?.planAttainment ?? 0, target: state.targets.planAttainment, color: colors.green },
  ];
  const option: EChartsOption = {
    grid: { left: 58, right: 24, top: 38, bottom: 38 },
    tooltip,
    legend: { top: 2, right: 8, textStyle: { color: colors.text, fontSize: 11 } },
    xAxis: { type: "category", data: intelligence.productionTrend.map((point) => point.date.slice(5)), ...axis },
    yAxis: { type: "value", name: "kg", axisLabel: { color: colors.text, fontSize: 11 }, splitLine: { lineStyle: { color: "#edf0ec", type: "dashed" } } },
    series: [
      { name: "Planned harvest", type: "bar", barWidth: 20, data: intelligence.productionTrend.map((point) => point.planned), itemStyle: { color: "#dfe4df", borderRadius: [4, 4, 0, 0] } },
      { name: "Harvested", type: "bar", barWidth: 14, data: intelligence.productionTrend.map((point) => point.actual), itemStyle: { color: colors.green, borderRadius: [3, 3, 0, 0] } },
      { name: "Saleable", type: "line", smooth: true, data: intelligence.productionTrend.map((point) => point.good), lineStyle: { color: "#9abb55", width: 2 }, itemStyle: { color: "#9abb55" } },
    ],
  };

  return (
    <>
      <section className="breakdown-grid performance-breakdown">
        {components.map((component) => (
          <div className="breakdown-card" key={component.label}>
            <div className="metric-strip-header">
              <span>{component.label}</span>
              <button
                type="button"
                className="metric-info-btn"
                aria-label={`Methodology and formula for ${component.label}`}
                title={`View ${component.label} methodology`}
                onClick={() => onInfoClick(component.label, `${component.value.toFixed(1)}%`, `Target ${component.target}%`)}
              >
                <Info size={14} />
              </button>
            </div>
            <strong>{component.value.toFixed(1)}%</strong>
            <p>Target {component.target}%</p>
            <i><b style={{ width: `${Math.min(component.value, 100)}%`, background: component.color }} /></i>
          </div>
        ))}
        <div className="formula-card">
          <div className="metric-strip-header">
            <span><Target size={13} /> Biological efficiency</span>
            <button
              type="button"
              className="metric-info-btn"
              style={{ color: "rgba(255, 255, 255, 0.75)" }}
              aria-label="Methodology and formula for Biological efficiency"
              title="View Biological efficiency methodology"
              onClick={() => onInfoClick("Biological efficiency", `${(mushroom?.biologicalEfficiency ?? 0).toFixed(1)}%`, `${(mushroom?.totalHarvestKg ?? 0).toLocaleString("en-IN")} kg ÷ ${(mushroom?.drySubstrateKg ?? 0).toLocaleString("en-IN")} kg dry substrate`)}
            >
              <Info size={14} />
            </button>
          </div>
          <p>{(mushroom?.totalHarvestKg ?? 0).toLocaleString("en-IN")} kg ÷ {(mushroom?.drySubstrateKg ?? 0).toLocaleString("en-IN")} kg dry substrate</p>
          <strong>{(mushroom?.biologicalEfficiency ?? 0).toFixed(1)}%</strong>
        </div>
      </section>
      <PerformancePanel title="Harvest trend" subtitle="Planned, harvested and saleable mushroom kg by day" option={option} />
    </>
  );
}

function HarvestView({ onInfoClick }: { onInfoClick: (label: string, value: string, detail: string) => void }) {
  const { intelligence } = useFactory();
  const option: EChartsOption = {
    grid: { left: 58, right: 24, top: 38, bottom: 38 },
    tooltip,
    legend: { top: 2, right: 8, textStyle: { color: colors.text, fontSize: 11 } },
    xAxis: { type: "category", data: intelligence.productionTrend.map((point) => point.date.slice(5)), ...axis },
    yAxis: { type: "value", axisLabel: { color: colors.text, fontSize: 11 }, splitLine: { lineStyle: { color: "#edf0ec", type: "dashed" } } },
    series: [
      { name: "Planned", type: "bar", barWidth: 20, data: intelligence.productionTrend.map((point) => point.planned), itemStyle: { color: "#dfe4df", borderRadius: [4, 4, 0, 0] } },
      { name: "Actual", type: "bar", barWidth: 14, data: intelligence.productionTrend.map((point) => point.actual), itemStyle: { color: colors.green, borderRadius: [3, 3, 0, 0] } },
      { name: "Good", type: "line", smooth: true, data: intelligence.productionTrend.map((point) => point.good), lineStyle: { color: "#9abb55", width: 2 }, itemStyle: { color: "#9abb55" } },
    ],
  };
  return (
    <>
      <MetricRow
        onInfoClick={onInfoClick}
        metrics={[
          { label: "Saleable harvest", value: `${(intelligence.mushroom?.saleableHarvestKg ?? 0).toLocaleString("en-IN")} kg`, detail: "accepted mushrooms" },
          { label: "Yield density", value: `${(intelligence.mushroom?.yieldPerM2 ?? 0).toFixed(1)} kg/m²`, detail: "harvest per growing area" },
          { label: "Average crop age", value: `${(intelligence.mushroom?.averageCropAgeDays ?? 0).toFixed(0)} days`, detail: "at harvest" },
        ]}
      />
      <PerformancePanel title="Flush harvest trend" subtitle="Planned, harvested and saleable mushroom kg by day" option={option} />
    </>
  );
}

function DowntimeView({ onInfoClick }: { onInfoClick: (label: string, value: string, detail: string) => void }) {
  const { intelligence } = useFactory();
  const reversed = [...intelligence.reasonLoss].slice(0, 8).reverse();
  const showHours = reversed.some((item) => item.minutes >= 60);
  const durationUnit = showHours ? "hr" : "min";
  const chartValue = (minutes: number) => showHours ? Number((minutes / 60).toFixed(1)) : minutes;
  const option: EChartsOption = {
    grid: { left: 150, right: 58, top: 20, bottom: 34 },
    tooltip,
    xAxis: { type: "value", axisLabel: { color: colors.text, fontSize: 11, formatter: `{value} ${durationUnit}` }, splitLine: { lineStyle: { color: "#edf0ec", type: "dashed" } } },
    yAxis: { type: "category", data: reversed.map((item) => item.reason), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: colors.text, fontSize: 11 } },
    series: [{ type: "bar", barWidth: 17, data: reversed.map((item, index) => ({ value: chartValue(item.minutes), itemStyle: { color: index >= reversed.length - 2 ? colors.red : colors.amber, borderRadius: [0, 5, 5, 0] } })), label: { show: true, position: "right", formatter: `{c} ${durationUnit}`, fontSize: 11, color: colors.text } }],
  };
  const metrics = [
    { label: "Total downtime", value: formatDuration(intelligence.totals.totalDowntime), detail: "selected period" },
    { label: "Stoppages", value: intelligence.totals.downtimeFrequency.toLocaleString("en-IN"), detail: "recorded occurrences" },
    { label: "Average stop", value: formatDuration(intelligence.totals.averageDowntimeDuration), detail: "per occurrence" },
    { label: "Estimated harvest lost", value: `${intelligence.losses.downtimeLostUnits.toFixed(0)} kg`, detail: "at the configured harvest rate" },
  ];
  return (
    <>
      <MetricRow onInfoClick={onInfoClick} metrics={metrics} />
      {reversed.length > 0 ? <PerformancePanel title="Room downtime reasons" subtitle={`Pareto of ${showHours ? "hours" : "minutes"} lost by room or farm asset`} option={option} /> : <section className="panel contextual-empty-state"><Info size={22} /><div><h2>Downtime total is available</h2><p>Upload the room downtime sheet to add occurrence, room and reason analysis.</p></div></section>}
    </>
  );
}

function QualityView({ onInfoClick }: { onInfoClick: (label: string, value: string, detail: string) => void }) {
  const { intelligence } = useFactory();
  const reversed = [...intelligence.skuQuality].slice(0, 10).reverse();
  const option: EChartsOption = {
    grid: { left: 120, right: 58, top: 20, bottom: 34 },
    tooltip: { ...tooltip, valueFormatter: (value) => `${Number(value).toFixed(2)}%` },
    xAxis: { type: "value", axisLabel: { color: colors.text, fontSize: 11, formatter: "{value}%" }, splitLine: { lineStyle: { color: "#edf0ec", type: "dashed" } } },
    yAxis: { type: "category", data: reversed.map((item) => item.sku), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: colors.text, fontSize: 11 } },
    series: [{ type: "bar", barWidth: 17, data: reversed.map((item) => ({ value: item.rejectionRate.toFixed(2), itemStyle: { color: item.rejectionRate > 5 ? colors.red : colors.amber, borderRadius: [0, 5, 5, 0] } })), label: { show: true, position: "right", formatter: "{c}%", fontSize: 10, color: colors.text } }],
  };
  return (
    <>
      <MetricRow
        onInfoClick={onInfoClick}
        metrics={[
          { label: "Saleable yield", value: `${(intelligence.mushroom?.saleableYield ?? 0).toFixed(1)}%`, detail: "saleable share of harvest" },
          { label: "Contamination", value: `${(intelligence.mushroom?.contaminationRate ?? 0).toFixed(1)}%`, detail: `${(intelligence.mushroom?.contaminatedHarvestKg ?? 0).toLocaleString("en-IN")} kg` },
          { label: "Quality holds", value: `${intelligence.totals.reworked.toLocaleString("en-IN")} kg`, detail: "trim, grade or rework" },
        ]}
      />
      <PerformancePanel title="Quality loss by mushroom grade" subtitle="Products ordered by contamination or rejection rate" option={option} />
    </>
  );
}

function InventoryView({ onInfoClick }: { onInfoClick: (label: string, value: string, detail: string) => void }) {
  const { intelligence } = useFactory();
  const risks = intelligence.inventoryRisks.slice(0, 10);
  return (
    <>
      <MetricRow
        onInfoClick={onInfoClick}
        metrics={[
          { label: "Inventory cover", value: intelligence.inventoryRisks[0] ? `${intelligence.inventoryRisks[0].stockDays.toFixed(1)} days` : "Adequate", detail: "minimum material cover" },
          { label: "Attention items", value: intelligence.inventoryRisks.length.toString(), detail: "below safety stock" },
          { label: "Active materials", value: intelligence.inventoryRisks.length > 0 ? `${intelligence.inventoryRisks.length} flagged` : "All healthy", detail: "tracked across warehouse" },
        ]}
      />
      {!risks.length ? (
        <section className="panel positive-empty-state"><CheckCircle2 size={28} /><h2>No material risk detected</h2><p>Uploaded inventory is above the configured stock-cover threshold.</p></section>
      ) : (
        <section className="panel inventory-balance-panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Inventory requiring attention</h2>
              <p className="panel-subtitle">Actual balance and unit, with calculated days of cover</p>
            </div>
          </div>
          <div className="inventory-balance-list">
            {risks.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.material}</strong>
                  <small>{item.supplier || "Supplier not specified"}</small>
                </div>
                <div>
                  <span>Available</span>
                  <strong>{item.availableQuantity.toLocaleString("en-IN")} {item.unit}</strong>
                </div>
                <div>
                  <span>Cover</span>
                  <strong>{item.stockDays.toFixed(1)} days</strong>
                </div>
                <div>
                  <span>Receipt</span>
                  <strong>{item.receiptStatus.replaceAll("_", " ")}</strong>
                  <small>{item.expectedReceiptDate ?? "No date"}</small>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function SuppliersView({ onInfoClick }: { onInfoClick: (label: string, value: string, detail: string) => void }) {
  const { intelligence } = useFactory();
  return (
    <>
      <MetricRow
        onInfoClick={onInfoClick}
        metrics={[
          { label: "Overall score", value: intelligence.supplierScore.toFixed(1), detail: "weighted by deliveries" },
          { label: "Suppliers measured", value: intelligence.supplierScores.length.toString(), detail: "with delivery records" },
          { label: "Late deliveries", value: intelligence.supplierScores.reduce((sum, supplier) => sum + supplier.lateDeliveries, 0).toString(), detail: "after promised date" },
        ]}
      />
      <section className="panel supplier-performance-panel">
        <div className="panel-header"><div><h2 className="panel-title">Supplier scorecard</h2><p className="panel-subtitle">60% on time · 25% quantity · 10% accepted quality · 5% agreed terms</p></div></div>
        <div className="supplier-performance-table">
          <div className="supplier-performance-head"><span>Supplier</span><span>Score</span><span>On time</span><span>Quantity</span><span>Accepted</span><span>Terms</span></div>
          {intelligence.supplierScores.map((supplier) => (
            <article key={supplier.supplier}>
              <div><strong>{supplier.supplier}</strong><small>{supplier.deliveries} deliveries · {supplier.materials.join(", ")}</small></div>
              <strong className={`supplier-score supplier-${supplier.status}`}>{supplier.score.toFixed(1)}</strong>
              <span>{supplier.onTimeRate.toFixed(0)}%</span>
              <span>{supplier.quantityFulfillment.toFixed(0)}%</span>
              <span>{supplier.acceptanceRate.toFixed(0)}%</span>
              <span>{supplier.termsFulfillment.toFixed(0)}%</span>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

export function PerformanceExplorer() {
  const { intelligence, filters, state, twinFeed, loading } = useFactory();
  const [activeTab, setActiveTab] = useState<Tab>("Cultivation");
  const [activeMetricModal, setActiveMetricModal] = useState<ActiveMetricModal | null>(null);

  const handleInfoClick = (label: string, value: string, detail: string) => {
    setActiveMetricModal({ label, value, detail });
  };

  const hasTwin = Boolean(twinFeed.layout_id && twinFeed.machines && twinFeed.machines.length > 0);
  const availableTabs = useMemo(() => {
    if (!hasTwin) return [];
    return tabs.filter((tab) => {
      if (tab === "Cultivation" || tab === "Harvest") return intelligence.dataAvailability.production > 0;
      if (tab === "Room downtime") return intelligence.dataAvailability.downtime > 0 || intelligence.totals.totalDowntime > 0;
      if (tab === "Crop quality") return intelligence.dataAvailability.quality > 0;
      if (tab === "Inventory") return intelligence.dataAvailability.inventory > 0;
      return intelligence.dataAvailability.supplier > 0;
    });
  }, [hasTwin, intelligence]);
  const selectedTab = availableTabs.includes(activeTab) ? activeTab : availableTabs[0];

  useEffect(() => {
    const queryTimer = window.setTimeout(() => {
      const requested = new URLSearchParams(window.location.search).get("tab") as Tab | null;
      if (requested && tabs.includes(requested)) setActiveTab(requested);
    }, 0);
    return () => window.clearTimeout(queryTimer);
  }, []);

  function selectTab(tab: Tab) {
    setActiveTab(tab);
    window.history.replaceState(null, "", `/performance?tab=${tab}`);
  }

  function exportData() {
    const prefix = state.factories.find((f) => f.id === state.activeFactoryId)?.name.toLowerCase().replace(/[^a-z0-9]/g, "-") || "mushroom";
    downloadBlob(JSON.stringify({ factory: state.activeFactoryId, filters, module: selectedTab, intelligence }, null, 2), `${prefix}-${selectedTab.toLowerCase().replaceAll(" ", "-")}-${filters.to}.json`, "application/json");
  }

  if (loading) {
    return (
      <>
        <header className="page-header">
          <div><p className="eyebrow">Yield &amp; Performance</p><h1 className="typography-display">Understand every crop. <span>Improve every flush.</span></h1><p className="page-subtitle typography-body">Harvest, climate, crop quality, rooms and supply intelligence from approved farm records.</p></div>
        </header>
        <div className="performance-loading">
          <Loader2 size={24} className="spin" style={{ color: "var(--accent, #416f57)" }} />
          <p>Checking Digital Twin and telemetry stream...</p>
        </div>
      </>
    );
  }

  if (!hasTwin) {
    return (
      <>
        <header className="page-header">
          <div><p className="eyebrow">Yield &amp; Performance</p><h1 className="typography-display">Understand every crop. <span>Improve every flush.</span></h1><p className="page-subtitle typography-body">Harvest, climate, crop quality, rooms and supply intelligence from approved farm records.</p></div>
        </header>
        <section className="panel performance-no-twin">
          <Cpu size={32} style={{ color: "var(--accent, #416f57)", marginBottom: 6 }} />
          <h2>Mushroom factory twin required</h2>
          <p>The Digital Twin is the single canonical source of truth for your facility. Configure your factory digital twin and room assets to unlock cultivation performance, yields, and climate analytics.</p>
          <Link href="/digital-twin" className="button button-accent" style={{ marginTop: 8 }}>
            Configure Digital Twin <ArrowRight size={13} style={{ marginLeft: 4 }} />
          </Link>
        </section>
      </>
    );
  }

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Yield &amp; Performance</p>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
            <h1 className="typography-display" style={{ margin: 0 }}>Understand every crop. <span>Improve every flush.</span></h1>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "rgba(65, 111, 87, 0.12)", color: "var(--accent, #416f57)", fontWeight: 600, border: "1px solid rgba(65, 111, 87, 0.25)" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent, #416f57)" }} />
              Live Digital Twin Telemetry
            </span>
          </div>
          <p className="page-subtitle typography-body">Harvest, climate, crop quality, rooms and supply intelligence derived directly from Digital Twin telemetry.</p>
        </div>
        {selectedTab && <button className="button button-secondary" onClick={exportData}><Download size={14} /> Export {selectedTab}</button>}
      </header>
      <CommandFilters />
      {availableTabs.length > 0 ? (
        <>
          <nav className="performance-tabs" aria-label="Available performance analysis">
            {availableTabs.map((tab) => <button className={selectedTab === tab ? "active" : ""} key={tab} onClick={() => selectTab(tab)}>{tab}</button>)}
          </nav>
          {selectedTab === "Cultivation" ? <CultivationView onInfoClick={handleInfoClick} /> : selectedTab === "Harvest" ? <HarvestView onInfoClick={handleInfoClick} /> : selectedTab === "Room downtime" ? <DowntimeView onInfoClick={handleInfoClick} /> : selectedTab === "Crop quality" ? <QualityView onInfoClick={handleInfoClick} /> : selectedTab === "Inventory" ? <InventoryView onInfoClick={handleInfoClick} /> : <SuppliersView onInfoClick={handleInfoClick} />}
        </>
      ) : (
        <section className="panel performance-no-data"><FileSearch size={28} /><h2>No cultivation analysis yet</h2><p>Upload a harvest or room observation sheet to begin farm intelligence.</p></section>
      )}
      {activeMetricModal && (
        <MetricInfoModal metric={activeMetricModal} onClose={() => setActiveMetricModal(null)} />
      )}
    </>
  );
}


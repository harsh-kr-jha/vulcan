"use client";

import type { EChartsOption } from "echarts";
import { ArrowRight, CheckCircle2, Cpu, Download, FileSearch, Info, Loader2, Target } from "lucide-react";
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

function MetricRow({ metrics }: { metrics: { label: string; value: string; detail: string }[] }) {
  return (
    <div className="performance-metric-strip" style={{ gridTemplateColumns: `repeat(${metrics.length}, 1fr)` }}>
      {metrics.map((metric) => (
        <div key={metric.label}>
          <span>{metric.label}</span>
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

function CultivationView() {
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
            <div><span>{component.label}</span><Info size={14} /></div>
            <strong>{component.value.toFixed(1)}%</strong>
            <p>Target {component.target}%</p>
            <i><b style={{ width: `${Math.min(component.value, 100)}%`, background: component.color }} /></i>
          </div>
        ))}
        <div className="formula-card">
          <span><Target size={13} /> Biological efficiency</span>
          <p>{(mushroom?.totalHarvestKg ?? 0).toLocaleString("en-IN")} kg ÷ {(mushroom?.drySubstrateKg ?? 0).toLocaleString("en-IN")} kg dry substrate</p>
          <strong>{(mushroom?.biologicalEfficiency ?? 0).toFixed(1)}%</strong>
        </div>
      </section>
      <PerformancePanel title="Harvest trend" subtitle="Planned, harvested and saleable mushroom kg by day" option={option} />
    </>
  );
}

function HarvestView() {
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
      <MetricRow metrics={[
        { label: "Saleable harvest", value: `${(intelligence.mushroom?.saleableHarvestKg ?? 0).toLocaleString("en-IN")} kg`, detail: "accepted mushrooms" },
        { label: "Yield density", value: `${(intelligence.mushroom?.yieldPerM2 ?? 0).toFixed(1)} kg/m²`, detail: "harvest per growing area" },
        { label: "Average crop age", value: `${(intelligence.mushroom?.averageCropAgeDays ?? 0).toFixed(0)} days`, detail: "at harvest" },
      ]} />
      <PerformancePanel title="Flush harvest trend" subtitle="Planned, harvested and saleable mushroom kg by day" option={option} />
    </>
  );
}

function DowntimeView() {
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
      <MetricRow metrics={metrics} />
      {reversed.length > 0 ? <PerformancePanel title="Room downtime reasons" subtitle={`Pareto of ${showHours ? "hours" : "minutes"} lost by room or farm asset`} option={option} /> : <section className="panel contextual-empty-state"><Info size={22} /><div><h2>Downtime total is available</h2><p>Upload the room downtime sheet to add occurrence, room and reason analysis.</p></div></section>}
    </>
  );
}

function QualityView() {
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
      <MetricRow metrics={[
        { label: "Saleable yield", value: `${(intelligence.mushroom?.saleableYield ?? 0).toFixed(1)}%`, detail: "saleable share of harvest" },
        { label: "Contamination", value: `${(intelligence.mushroom?.contaminationRate ?? 0).toFixed(1)}%`, detail: `${(intelligence.mushroom?.contaminatedHarvestKg ?? 0).toLocaleString("en-IN")} kg` },
        { label: "Quality holds", value: `${intelligence.totals.reworked.toLocaleString("en-IN")} kg`, detail: "trim, grade or rework" },
      ]} />
      <PerformancePanel title="Quality loss by mushroom grade" subtitle="Products ordered by contamination or rejection rate" option={option} />
    </>
  );
}

function InventoryView() {
  const { intelligence } = useFactory();
  const risks = intelligence.inventoryRisks.slice(0, 10);
  if (!risks.length) {
    return <section className="panel positive-empty-state"><CheckCircle2 size={28} /><h2>No material risk detected</h2><p>Uploaded inventory is above the configured stock-cover threshold.</p></section>;
  }
  return <section className="panel inventory-balance-panel"><div className="panel-header"><div><h2 className="panel-title">Inventory requiring attention</h2><p className="panel-subtitle">Actual balance and unit, with calculated days of cover</p></div></div><div className="inventory-balance-list">{risks.map((item) => <article key={item.id}><div><strong>{item.material}</strong><small>{item.supplier || "Supplier not specified"}</small></div><div><span>Available</span><strong>{item.availableQuantity.toLocaleString("en-IN")} {item.unit}</strong></div><div><span>Cover</span><strong>{item.stockDays.toFixed(1)} days</strong></div><div><span>Receipt</span><strong>{item.receiptStatus.replaceAll("_", " ")}</strong><small>{item.expectedReceiptDate ?? "No date"}</small></div></article>)}</div></section>;
}

function SuppliersView() {
  const { intelligence } = useFactory();
  return (
    <>
      <MetricRow metrics={[
        { label: "Overall score", value: intelligence.supplierScore.toFixed(1), detail: "weighted by deliveries" },
        { label: "Suppliers measured", value: intelligence.supplierScores.length.toString(), detail: "with delivery records" },
        { label: "Late deliveries", value: intelligence.supplierScores.reduce((sum, supplier) => sum + supplier.lateDeliveries, 0).toString(), detail: "after promised date" },
      ]} />
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
    if (!selectedTab) return;
    downloadBlob(JSON.stringify({ factory: state.activeFactoryId, filters, module: selectedTab, intelligence }, null, 2), `musroom-${selectedTab.toLowerCase().replaceAll(" ", "-")}-${filters.to}.json`, "application/json");
  }

  if (loading) {
    return (
      <>
        <header className="page-header">
          <div><h1 className="typography-display">Understand every crop. <span>Improve every flush.</span></h1><p className="page-subtitle typography-body">Harvest, climate, crop quality, rooms and supply intelligence from approved farm records.</p></div>
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
          <div><h1 className="typography-display">Understand every crop. <span>Improve every flush.</span></h1><p className="page-subtitle typography-body">Harvest, climate, crop quality, rooms and supply intelligence from approved farm records.</p></div>
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
        <div><h1 className="typography-display">Understand every crop. <span>Improve every flush.</span></h1><p className="page-subtitle typography-body">Harvest, climate, crop quality, rooms and supply intelligence from approved farm records.</p></div>
        {selectedTab && <button className="button button-secondary" onClick={exportData}><Download size={14} /> Export {selectedTab}</button>}
      </header>
      <CommandFilters />
      {availableTabs.length > 0 ? (
        <>
          <nav className="performance-tabs" aria-label="Available performance analysis">
            {availableTabs.map((tab) => <button className={selectedTab === tab ? "active" : ""} key={tab} onClick={() => selectTab(tab)}>{tab}</button>)}
          </nav>
          {selectedTab === "Cultivation" ? <CultivationView /> : selectedTab === "Harvest" ? <HarvestView /> : selectedTab === "Room downtime" ? <DowntimeView /> : selectedTab === "Crop quality" ? <QualityView /> : selectedTab === "Inventory" ? <InventoryView /> : <SuppliersView />}
        </>
      ) : (
        <section className="panel performance-no-data"><FileSearch size={28} /><h2>No cultivation analysis yet</h2><p>Upload a harvest or room observation sheet to begin farm intelligence.</p></section>
      )}
    </>
  );
}

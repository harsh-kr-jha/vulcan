"use client";

import type { EChartsOption } from "echarts";
import { CheckCircle2, Download, FileSearch, Info, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Chart } from "@/components/charts/chart";
import { CommandFilters } from "@/components/command-filters";
import { downloadBlob } from "@/lib/browser-files";
import { formatDuration } from "@/lib/formatters";
import { useFactory } from "@/lib/factory-context";

const tabs = ["OEE", "Production", "Downtime", "Quality", "Inventory", "Suppliers"] as const;
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

function OeeView() {
  const { intelligence, state } = useFactory();
  const components = [
    { label: "Availability", value: intelligence.oee.availability, target: state.targets.availability, color: colors.amber },
    { label: "Performance", value: intelligence.oee.performance, target: state.targets.performance, color: colors.blue },
    { label: "Quality", value: intelligence.oee.quality, target: state.targets.quality, color: colors.green },
  ];
  const daily = intelligence.dailyOee.map((point) => ({ ...point, date: point.date.slice(5) }));
  const option: EChartsOption = {
    grid: { left: 50, right: 24, top: 28, bottom: 36 },
    tooltip: { ...tooltip, valueFormatter: (value) => `${Number(value).toFixed(1)}%` },
    xAxis: { type: "category", data: daily.map((row) => row.date), ...axis },
    yAxis: { type: "value", min: 0, max: 100, axisLabel: { color: colors.text, fontSize: 11, formatter: "{value}%" }, splitLine: { lineStyle: { color: "#edf0ec", type: "dashed" } } },
    series: [{ name: "OEE", type: "line", smooth: true, symbolSize: 6, data: daily.map((row) => row.value.toFixed(1)), lineStyle: { color: colors.green, width: 2.5 }, itemStyle: { color: colors.green }, areaStyle: { color: "rgba(65,111,87,.10)" }, markLine: { silent: true, symbol: "none", lineStyle: { color: colors.amber, type: "dashed" }, data: [{ yAxis: state.targets.oee }] } }],
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
          <span><Target size={13} /> OEE formula</span>
          <p>{intelligence.oee.availability.toFixed(1)} × {intelligence.oee.performance.toFixed(1)} × {intelligence.oee.quality.toFixed(1)}</p>
          <strong>{intelligence.oee.value.toFixed(1)}%</strong>
        </div>
      </section>
      <PerformancePanel title="OEE trend" subtitle="Daily OEE with the configured factory target" option={option} />
    </>
  );
}

function ProductionView() {
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
        { label: "Good output", value: intelligence.totals.good.toLocaleString("en-IN"), detail: "accepted units" },
        { label: "Throughput", value: `${intelligence.totals.throughputRate.toFixed(1)}/hr`, detail: "actual units per run hour" },
        { label: "Cycle variance", value: `${intelligence.totals.cycleTimeVariance.toFixed(1)}%`, detail: "actual against ideal cycle" },
      ]} />
      <PerformancePanel title="Output trend" subtitle="Planned, actual and good quantity by day" option={option} />
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
        { label: "Estimated output lost", value: `${intelligence.losses.downtimeLostUnits.toFixed(0)} units`, detail: "at weighted ideal cycle" },
      ];
  return (
    <>
      <MetricRow metrics={metrics} />
      {reversed.length > 0 ? <PerformancePanel title="Downtime reasons" subtitle={`Pareto of ${showHours ? "hours" : "minutes"} lost by standard reason`} option={option} /> : <section className="panel contextual-empty-state"><Info size={22} /><div><h2>Downtime total is available</h2><p>Upload the downtime sheet to add stoppage frequency, machine ranking and reason Pareto.</p></div></section>}
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
        { label: "First-pass yield", value: `${intelligence.totals.firstPassYield.toFixed(1)}%`, detail: "good without rejection or rework" },
        { label: "Rejection", value: `${intelligence.totals.rejectionRate.toFixed(1)}%`, detail: `${intelligence.totals.rejected.toLocaleString("en-IN")} units` },
        { label: "Rework", value: `${intelligence.totals.reworkRate.toFixed(1)}%`, detail: `${intelligence.totals.reworked.toLocaleString("en-IN")} units` },
      ]} />
      <PerformancePanel title="Rejection by product" subtitle="Products ordered by rejection rate" option={option} />
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
  const { intelligence, filters, state } = useFactory();
  const [activeTab, setActiveTab] = useState<Tab>("OEE");
  const availableTabs = useMemo(() => tabs.filter((tab) => {
    if (tab === "OEE" || tab === "Production") return intelligence.dataAvailability.production > 0;
    if (tab === "Downtime") return intelligence.dataAvailability.downtime > 0 || intelligence.totals.totalDowntime > 0;
    if (tab === "Quality") return intelligence.dataAvailability.quality > 0;
    if (tab === "Inventory") return intelligence.dataAvailability.inventory > 0;
    return intelligence.dataAvailability.supplier > 0;
  }), [intelligence]);
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
    downloadBlob(JSON.stringify({ factory: state.activeFactoryId, filters, module: selectedTab, intelligence }, null, 2), `vulcan-${selectedTab?.toLowerCase() ?? "performance"}-${filters.to}.json`, "application/json");
  }

  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">Performance · validated data</p><h1>Understand the result. <span>Act on the cause.</span></h1><p className="page-subtitle">Only analyses supported by the selected factory’s uploads are shown.</p></div>
        {selectedTab && <button className="button button-secondary" onClick={exportData}><Download size={14} /> Export {selectedTab}</button>}
      </header>
      <CommandFilters />
      {availableTabs.length > 0 ? (
        <>
          <nav className="performance-tabs" aria-label="Available performance analysis">
            {availableTabs.map((tab) => <button className={selectedTab === tab ? "active" : ""} key={tab} onClick={() => selectTab(tab)}>{tab}</button>)}
          </nav>
          {selectedTab === "OEE" ? <OeeView /> : selectedTab === "Production" ? <ProductionView /> : selectedTab === "Downtime" ? <DowntimeView /> : selectedTab === "Quality" ? <QualityView /> : selectedTab === "Inventory" ? <InventoryView /> : <SuppliersView />}
        </>
      ) : (
        <section className="panel performance-no-data"><FileSearch size={28} /><h2>No performance analysis yet</h2><p>Upload an operational sheet for this factory. V2 will add only the relevant analysis tab.</p></section>
      )}
    </>
  );
}

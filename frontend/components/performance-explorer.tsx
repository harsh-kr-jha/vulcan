"use client";

import type { EChartsOption } from "echarts";
import { Download, FileSearch, Info, Target } from "lucide-react";
import { useEffect, useState } from "react";
import { Chart } from "@/components/charts/chart";
import { CommandFilters } from "@/components/command-filters";
import { useFactory } from "@/lib/factory-context";
import { downloadBlob } from "@/lib/ingestion";

const tabs = ["OEE", "Production", "Downtime", "Quality", "Inventory"] as const;
type Tab = (typeof tabs)[number];
const colors = { green: "#416f57", blue: "#577fbc", amber: "#e2a040", red: "#db6653", line: "#e6e9e5", text: "#7c8781" };
const axis = { axisLine: { lineStyle: { color: colors.line } }, axisTick: { show: false }, axisLabel: { color: colors.text, fontSize: 9 } };
const tooltip = { trigger: "axis" as const, backgroundColor: "#17211d", borderWidth: 0, textStyle: { color: "#fff", fontSize: 9 } };

function PerformancePanel({ title, subtitle, option, empty }: { title: string; subtitle: string; option: EChartsOption; empty?: boolean }) {
  return <section className="panel generic-performance-chart"><div className="panel-header"><div><h2 className="panel-title">{title}</h2><p className="panel-subtitle">{subtitle}</p></div></div>{empty ? <div className="performance-empty"><FileSearch size={22} /><strong>No matching records</strong><span>Change filters or add this dataset.</span></div> : <div className="chart-wrap"><Chart option={option} height={360} /></div>}</section>;
}

function OeeView() {
  const { intelligence, state } = useFactory();
  const components = [{ label: "Availability", value: intelligence.oee.availability, target: state.targets.availability, color: colors.amber }, { label: "Performance", value: intelligence.oee.performance, target: state.targets.performance, color: colors.blue }, { label: "Quality", value: intelligence.oee.quality, target: state.targets.quality, color: colors.green }];
  const dates = [...new Set(intelligence.production.map((row) => row.date))].sort();
  const daily = dates.map((date) => { const rows = intelligence.production.filter((row) => row.date === date); const planned = rows.reduce((sum, row) => sum + row.plannedMinutes, 0); const down = rows.reduce((sum, row) => sum + row.downtimeMinutes, 0); const run = planned - down; const actual = rows.reduce((sum, row) => sum + row.actualQuantity, 0); const good = rows.reduce((sum, row) => sum + row.goodQuantity, 0); const ideal = rows.reduce((sum, row) => sum + row.idealCycleMinutes * row.actualQuantity, 0); const value = planned && run && actual ? (run / planned) * (ideal / run) * (good / actual) * 100 : 0; return { date: date.slice(5), value }; });
  const option: EChartsOption = { grid: { left: 42, right: 20, top: 28, bottom: 32 }, tooltip: { ...tooltip, valueFormatter: (value) => `${Number(value).toFixed(1)}%` }, xAxis: { type: "category", data: daily.map((row) => row.date), ...axis }, yAxis: { type: "value", min: 40, max: 100, axisLabel: { color: colors.text, fontSize: 9, formatter: "{value}%" }, splitLine: { lineStyle: { color: "#edf0ec", type: "dashed" } } }, series: [{ name: "OEE", type: "line", smooth: true, symbolSize: 6, data: daily.map((row) => row.value.toFixed(1)), lineStyle: { color: colors.green, width: 2.5 }, itemStyle: { color: colors.green }, areaStyle: { color: "rgba(65,111,87,.12)" }, markLine: { silent: true, symbol: "none", lineStyle: { color: colors.amber, type: "dashed" }, data: [{ yAxis: 78 }] } }] };
  return <><section className="breakdown-grid performance-breakdown">{components.map((component) => <div className="breakdown-card" key={component.label}><div><span>{component.label}</span><Info size={12} /></div><strong>{component.value.toFixed(1)}%</strong><p>Target {component.target}%</p><i><b style={{ width: `${Math.min(component.value, 100)}%`, background: component.color }} /></i></div>)}<div className="formula-card"><span><Target size={11} /> OEE formula · v1</span><p><b>{intelligence.oee.availability.toFixed(1)}%</b> × <b>{intelligence.oee.performance.toFixed(1)}%</b> × <b>{intelligence.oee.quality.toFixed(1)}%</b></p><strong>= {intelligence.oee.value.toFixed(1)}%</strong></div></section><PerformancePanel title="OEE over time" subtitle={`Daily result with ${state.targets.oee}% factory target`} option={option} empty={!daily.length} /></>;
}

function ProductionView() {
  const { intelligence } = useFactory();
  const option: EChartsOption = { grid: { left: 48, right: 18, top: 34, bottom: 34 }, tooltip, legend: { top: 2, right: 8, textStyle: { color: colors.text, fontSize: 9 } }, xAxis: { type: "category", data: intelligence.productionTrend.map((point) => point.date.slice(5)), ...axis }, yAxis: { type: "value", axisLabel: { color: colors.text, fontSize: 9, formatter: (value: number) => `${value / 1000}k` }, splitLine: { lineStyle: { color: "#edf0ec", type: "dashed" } } }, series: [{ name: "Planned", type: "bar", barWidth: 20, data: intelligence.productionTrend.map((point) => point.planned), itemStyle: { color: "#dfe4df", borderRadius: [4, 4, 0, 0] } }, { name: "Actual", type: "bar", barWidth: 13, data: intelligence.productionTrend.map((point) => point.actual), itemStyle: { color: colors.green, borderRadius: [3, 3, 0, 0] } }, { name: "Good", type: "line", smooth: true, data: intelligence.productionTrend.map((point) => point.good), lineStyle: { color: "#9abb55", width: 2 }, itemStyle: { color: "#9abb55" } }] };
  return <><div className="performance-answer-row"><div><span>Plan</span><strong>{intelligence.totals.planned.toLocaleString("en-IN")}</strong></div><div><span>Actual</span><strong>{intelligence.totals.actual.toLocaleString("en-IN")}</strong></div><div><span>Good</span><strong>{intelligence.totals.good.toLocaleString("en-IN")}</strong></div><div><span>Gap</span><strong className="text-danger">{Math.max(intelligence.totals.planned - intelligence.totals.actual, 0).toLocaleString("en-IN")}</strong></div></div><PerformancePanel title="Planned, actual and good output" subtitle="Daily production performance at the selected grain" option={option} empty={!intelligence.productionTrend.length} /></>;
}

function DowntimeView() {
  const { intelligence } = useFactory();
  const reversed = [...intelligence.reasonLoss].slice(0, 8).reverse();
  const option: EChartsOption = { grid: { left: 130, right: 40, top: 20, bottom: 30 }, tooltip, xAxis: { type: "value", axisLabel: { color: colors.text, fontSize: 9, formatter: "{value} min" }, splitLine: { lineStyle: { color: "#edf0ec", type: "dashed" } } }, yAxis: { type: "category", data: reversed.map((item) => item.reason), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: colors.text, fontSize: 9 } }, series: [{ type: "bar", barWidth: 15, data: reversed.map((item, index) => ({ value: item.minutes, itemStyle: { color: index >= reversed.length - 2 ? colors.red : colors.amber, borderRadius: [0, 5, 5, 0] } })), label: { show: true, position: "right", formatter: "{c} min", fontSize: 8, color: colors.text } }] };
  return <PerformancePanel title="Downtime Pareto" subtitle="Minutes lost by standard reason code" option={option} empty={!reversed.length} />;
}

function QualityView() {
  const { intelligence } = useFactory();
  const reversed = [...intelligence.skuQuality].reverse();
  const option: EChartsOption = { grid: { left: 85, right: 40, top: 20, bottom: 30 }, tooltip: { ...tooltip, valueFormatter: (value) => `${Number(value).toFixed(2)}%` }, xAxis: { type: "value", axisLabel: { color: colors.text, fontSize: 9, formatter: "{value}%" }, splitLine: { lineStyle: { color: "#edf0ec", type: "dashed" } } }, yAxis: { type: "category", data: reversed.map((item) => item.sku), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: colors.text, fontSize: 9 } }, series: [{ type: "bar", barWidth: 16, data: reversed.map((item) => ({ value: item.rejectionRate.toFixed(2), itemStyle: { color: item.rejectionRate > 3 ? colors.red : colors.amber, borderRadius: [0, 5, 5, 0] } })), label: { show: true, position: "right", formatter: "{c}%", fontSize: 8, color: colors.text } }] };
  return <PerformancePanel title="Rejection by product" subtitle={`First-pass yield ${intelligence.totals.firstPassYield.toFixed(1)}% · highest defect: ${intelligence.defectLoss[0]?.reason ?? "none"}`} option={option} empty={!reversed.length} />;
}

function InventoryView() {
  const { intelligence } = useFactory();
  const reversed = [...intelligence.inventoryRisks].slice(0, 8).reverse();
  const option: EChartsOption = { grid: { left: 135, right: 42, top: 20, bottom: 30 }, tooltip, xAxis: { type: "value", max: Math.max(8, ...reversed.map((item) => item.stockDays + 1)), axisLabel: { color: colors.text, fontSize: 9, formatter: "{value} days" }, splitLine: { lineStyle: { color: "#edf0ec", type: "dashed" } } }, yAxis: { type: "category", data: reversed.map((item) => item.material), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: colors.text, fontSize: 9 } }, series: [{ type: "bar", barWidth: 16, data: reversed.map((item) => ({ value: item.stockDays.toFixed(1), itemStyle: { color: item.stockDays < 2 ? colors.red : item.stockDays < 4 ? colors.amber : colors.green, borderRadius: [0, 5, 5, 0] } })), label: { show: true, position: "right", formatter: "{c} days", fontSize: 8, color: colors.text } }] };
  return <PerformancePanel title="Material stock cover" subtitle="Projected days available at current consumption" option={option} empty={!reversed.length} />;
}

export function PerformanceExplorer() {
  const { intelligence, filters } = useFactory();
  const [activeTab, setActiveTab] = useState<Tab>("OEE");
  useEffect(() => {
    const queryTimer = window.setTimeout(() => {
      const requested = new URLSearchParams(window.location.search).get("tab") as Tab | null;
      if (requested && tabs.includes(requested)) setActiveTab(requested);
    }, 0);
    return () => window.clearTimeout(queryTimer);
  }, []);
  function selectTab(tab: Tab) { setActiveTab(tab); window.history.replaceState(null, "", `/performance?tab=${tab}`); }
  function exportData() { const data = activeTab === "Production" ? intelligence.production : activeTab === "Downtime" ? intelligence.downtime : activeTab === "Quality" ? intelligence.quality : activeTab === "Inventory" ? intelligence.inventory : intelligence.oee; downloadBlob(JSON.stringify({ filters, module: activeTab, data }, null, 2), `vulcan-${activeTab.toLowerCase()}-${filters.to}.json`, "application/json"); }
  return <><header className="page-header"><div><p className="eyebrow">Performance intelligence · explainable</p><h1>Understand the result. <span>Find the cause.</span></h1><p className="page-subtitle">Drill from factory KPIs into the assets, products and source records that created them.</p></div><button className="button button-secondary" onClick={exportData}><Download size={14} /> Export {activeTab}</button></header><CommandFilters /><nav className="performance-tabs" aria-label="Performance module">{tabs.map((tab) => <button className={activeTab === tab ? "active" : ""} key={tab} onClick={() => selectTab(tab)}>{tab}</button>)}</nav>{activeTab === "OEE" ? <OeeView /> : activeTab === "Production" ? <ProductionView /> : activeTab === "Downtime" ? <DowntimeView /> : activeTab === "Quality" ? <QualityView /> : <InventoryView />}</>;
}

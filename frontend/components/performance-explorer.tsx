"use client";

import type { EChartsOption } from "echarts";
import { CheckCircle2, Download, FileSearch, Info, Target } from "lucide-react";
import { useEffect, useState } from "react";

import { Chart } from "@/components/charts/chart";
import { CommandFilters } from "@/components/command-filters";
import { downloadBlob } from "@/lib/browser-files";
import { chartPalette } from "@/lib/design-system";
import { formatDuration } from "@/lib/formatters";
import { useFactory } from "@/lib/factory-context";
import { useVariant } from "@/lib/variant";

const mushroomTabs = ["Cultivation", "Harvest", "Room downtime", "Crop quality", "Inventory", "Suppliers"] as const;
const automotiveTabs = ["OEE", "Production", "Steam & Fuel", "Downtime", "Quality", "Inventory", "Suppliers"] as const;
type Tab = (typeof mushroomTabs)[number] | (typeof automotiveTabs)[number];

const colors = {
  green: chartPalette.primary,
  blue: chartPalette.comparative,
  amber: chartPalette.accent,
  red: chartPalette.danger,
  line: chartPalette.grid,
  text: chartPalette.label,
};
const axis = {
  axisLine: { lineStyle: { color: colors.line } },
  axisTick: { show: false },
  axisLabel: { color: colors.text, fontSize: 11 },
};
const tooltip = {
  trigger: "axis" as const,
  backgroundColor: chartPalette.tooltip,
  borderWidth: 0,
  textStyle: { color: chartPalette.tooltipText, fontSize: 11 },
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
    { label: "Biological efficiency", value: mushroom.biologicalEfficiency, target: state.targets.biologicalEfficiency, color: colors.green },
    { label: "Saleable yield", value: mushroom.saleableYield, target: state.targets.saleableYield, color: colors.blue },
    { label: "Climate compliance", value: mushroom.environmentCompliance, target: state.targets.environmentCompliance, color: colors.amber },
    { label: "Plan attainment", value: mushroom.planAttainment, target: state.targets.planAttainment, color: colors.green },
  ];
  const option: EChartsOption = {
    grid: { left: 58, right: 24, top: 38, bottom: 38 },
    tooltip,
    legend: { top: 2, right: 8, textStyle: { color: colors.text, fontSize: 11 } },
    xAxis: { type: "category", data: intelligence.productionTrend.map((point) => point.date.slice(5)), ...axis },
    yAxis: { type: "value", name: "kg", axisLabel: { color: colors.text, fontSize: 11 }, splitLine: { lineStyle: { color: chartPalette.grid, type: "dashed" } } },
    series: [
      { name: "Planned harvest", type: "bar", barWidth: 20, data: intelligence.productionTrend.map((point) => point.planned), itemStyle: { color: chartPalette.planned, borderRadius: [4, 4, 0, 0] } },
      { name: "Harvested", type: "bar", barWidth: 14, data: intelligence.productionTrend.map((point) => point.actual), itemStyle: { color: colors.green, borderRadius: [3, 3, 0, 0] } },
      { name: "Saleable", type: "line", smooth: true, data: intelligence.productionTrend.map((point) => point.good), lineStyle: { color: chartPalette.comparative, width: 2 }, itemStyle: { color: chartPalette.comparative } },
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
          <p>{mushroom.totalHarvestKg.toLocaleString("en-IN")} kg ÷ {mushroom.drySubstrateKg.toLocaleString("en-IN")} kg dry substrate</p>
          <strong>{mushroom.biologicalEfficiency.toFixed(1)}%</strong>
        </div>
      </section>
      <PerformancePanel title="Harvest trend" subtitle="Planned, harvested and saleable mushroom kg by day" option={option} />
    </>
  );
}

function OeeView() {
  const { intelligence, state } = useFactory();
  const components = [
    { label: "Availability", value: intelligence.oee.availability, target: state.targets.availability, color: colors.green },
    { label: "Performance", value: intelligence.oee.performance, target: state.targets.performance, color: colors.blue },
    { label: "Quality", value: intelligence.oee.quality, target: state.targets.quality, color: colors.amber },
    { label: "Plan attainment", value: intelligence.totals.planAttainment, target: state.targets.planAttainment, color: colors.green },
  ];
  const option: EChartsOption = {
    grid: { left: 58, right: 24, top: 38, bottom: 38 },
    tooltip,
    legend: { top: 2, right: 8, textStyle: { color: colors.text, fontSize: 11 } },
    xAxis: { type: "category", data: intelligence.dailyOee.map((point) => point.date.slice(5)), ...axis },
    yAxis: { type: "value", min: 0, max: 100, axisLabel: { color: colors.text, fontSize: 11, formatter: "{value}%" }, splitLine: { lineStyle: { color: chartPalette.grid, type: "dashed" } } },
    series: [{ name: "OEE", type: "line", smooth: true, data: intelligence.dailyOee.map((point) => point.value), lineStyle: { color: colors.green, width: 3 }, itemStyle: { color: colors.green }, areaStyle: { color: chartPalette.primaryArea } }],
  };
  return <>
    <section className="breakdown-grid performance-breakdown">
      {components.map((component) => <div className="breakdown-card" key={component.label}><div><span>{component.label}</span><Info size={14} /></div><strong>{component.value.toFixed(1)}%</strong><p>Target {component.target}%</p><i><b style={{ width: `${Math.min(component.value, 100)}%`, background: component.color }} /></i></div>)}
      <div className="formula-card"><span><Target size={13} /> Overall equipment effectiveness</span><p>{intelligence.oee.availability.toFixed(1)}% × {intelligence.oee.performance.toFixed(1)}% × {intelligence.oee.quality.toFixed(1)}%</p><strong>{intelligence.oee.value.toFixed(1)}%</strong></div>
    </section>
    <PerformancePanel title="OEE trend" subtitle="Daily overall equipment effectiveness from approved production and downtime records" option={option} />
  </>;
}

function ProductionView({ mushroomMode }: { mushroomMode: boolean }) {
  const { intelligence } = useFactory();
  const option: EChartsOption = {
    grid: { left: 58, right: 24, top: 38, bottom: 38 },
    tooltip,
    legend: { top: 2, right: 8, textStyle: { color: colors.text, fontSize: 11 } },
    xAxis: { type: "category", data: intelligence.productionTrend.map((point) => point.date.slice(5)), ...axis },
    yAxis: { type: "value", axisLabel: { color: colors.text, fontSize: 11 }, splitLine: { lineStyle: { color: chartPalette.grid, type: "dashed" } } },
    series: [
      { name: "Planned", type: "bar", barWidth: 20, data: intelligence.productionTrend.map((point) => point.planned), itemStyle: { color: chartPalette.planned, borderRadius: [4, 4, 0, 0] } },
      { name: "Actual", type: "bar", barWidth: 14, data: intelligence.productionTrend.map((point) => point.actual), itemStyle: { color: colors.green, borderRadius: [3, 3, 0, 0] } },
      { name: "Good", type: "line", smooth: true, data: intelligence.productionTrend.map((point) => point.good), lineStyle: { color: chartPalette.comparative, width: 2 }, itemStyle: { color: chartPalette.comparative } },
    ],
  };
  return (
    <>
      <MetricRow metrics={[
        ...(mushroomMode ? [
          { label: "Saleable harvest", value: `${intelligence.mushroom.saleableHarvestKg.toLocaleString("en-IN")} kg`, detail: "accepted mushrooms" },
          { label: "Yield density", value: `${intelligence.mushroom.yieldPerM2.toFixed(1)} kg/m²`, detail: "harvest per growing area" },
          { label: "Average crop age", value: `${intelligence.mushroom.averageCropAgeDays.toFixed(0)} days`, detail: "at harvest" },
        ] : [
          { label: "Planned output", value: intelligence.totals.planned.toLocaleString("en-IN"), detail: "scheduled units" },
          { label: "Actual output", value: intelligence.totals.actual.toLocaleString("en-IN"), detail: `${intelligence.totals.planAttainment.toFixed(1)}% plan attainment` },
          { label: "Accepted output", value: intelligence.totals.good.toLocaleString("en-IN"), detail: `${intelligence.totals.firstPassYield.toFixed(1)}% first-pass yield` },
        ]),
      ]} />
      <PerformancePanel title={mushroomMode ? "Flush harvest trend" : "Production trend"} subtitle={mushroomMode ? "Planned, harvested and saleable mushroom kg by day" : "Planned, actual and accepted units by day"} option={option} />
    </>
  );
}

function DowntimeView({ mushroomMode }: { mushroomMode: boolean }) {
  const { intelligence } = useFactory();
  const reversed = [...intelligence.reasonLoss].slice(0, 8).reverse();
  const showHours = reversed.some((item) => item.minutes >= 60);
  const durationUnit = showHours ? "hr" : "min";
  const chartValue = (minutes: number) => showHours ? Number((minutes / 60).toFixed(1)) : minutes;
  const option: EChartsOption = {
    grid: { left: 150, right: 58, top: 20, bottom: 34 },
    tooltip,
    xAxis: { type: "value", axisLabel: { color: colors.text, fontSize: 11, formatter: `{value} ${durationUnit}` }, splitLine: { lineStyle: { color: chartPalette.grid, type: "dashed" } } },
    yAxis: { type: "category", data: reversed.map((item) => item.reason), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: colors.text, fontSize: 11 } },
    series: [{ type: "bar", barWidth: 17, data: reversed.map((item, index) => ({ value: chartValue(item.minutes), itemStyle: { color: index >= reversed.length - 2 ? colors.red : colors.amber, borderRadius: [0, 5, 5, 0] } })), label: { show: true, position: "right", formatter: `{c} ${durationUnit}`, fontSize: 11, color: colors.text } }],
  };
  const metrics = [
        { label: "Total downtime", value: formatDuration(intelligence.totals.totalDowntime), detail: "selected period" },
        { label: "Stoppages", value: intelligence.totals.downtimeFrequency.toLocaleString("en-IN"), detail: "recorded occurrences" },
        { label: "Average stop", value: formatDuration(intelligence.totals.averageDowntimeDuration), detail: "per occurrence" },
        { label: mushroomMode ? "Estimated harvest lost" : "Estimated output lost", value: `${intelligence.losses.downtimeLostUnits.toFixed(0)}${mushroomMode ? " kg" : " units"}`, detail: `at the configured ${mushroomMode ? "harvest" : "production"} rate` },
      ];
  return (
    <>
      <MetricRow metrics={metrics} />
      {reversed.length > 0 ? <PerformancePanel title={mushroomMode ? "Room downtime reasons" : "Downtime reasons"} subtitle={`Pareto of ${showHours ? "hours" : "minutes"} lost by ${mushroomMode ? "room or farm asset" : "machine or production asset"}`} option={option} /> : <section className="panel contextual-empty-state"><Info size={22} /><div><h2>Downtime total is available</h2><p>Upload the {mushroomMode ? "room " : ""}downtime sheet to add occurrence, {mushroomMode ? "room" : "machine"} and reason analysis.</p></div></section>}
    </>
  );
}

function QualityView({ mushroomMode }: { mushroomMode: boolean }) {
  const { intelligence } = useFactory();
  const reversed = [...intelligence.skuQuality].slice(0, 10).reverse();
  const option: EChartsOption = {
    grid: { left: 120, right: 58, top: 20, bottom: 34 },
    tooltip: { ...tooltip, valueFormatter: (value) => `${Number(value).toFixed(2)}%` },
    xAxis: { type: "value", axisLabel: { color: colors.text, fontSize: 11, formatter: "{value}%" }, splitLine: { lineStyle: { color: chartPalette.grid, type: "dashed" } } },
    yAxis: { type: "category", data: reversed.map((item) => item.sku), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: colors.text, fontSize: 11 } },
    series: [{ type: "bar", barWidth: 17, data: reversed.map((item) => ({ value: item.rejectionRate.toFixed(2), itemStyle: { color: item.rejectionRate > 5 ? colors.red : colors.amber, borderRadius: [0, 5, 5, 0] } })), label: { show: true, position: "right", formatter: "{c}%", fontSize: 10, color: colors.text } }],
  };
  return (
    <>
      <MetricRow metrics={[
        ...(mushroomMode ? [
          { label: "Saleable yield", value: `${intelligence.mushroom.saleableYield.toFixed(1)}%`, detail: "saleable share of harvest" },
          { label: "Contamination", value: `${intelligence.mushroom.contaminationRate.toFixed(1)}%`, detail: `${intelligence.mushroom.contaminatedHarvestKg.toLocaleString("en-IN")} kg` },
          { label: "Quality holds", value: `${intelligence.totals.reworked.toLocaleString("en-IN")} kg`, detail: "trim, grade or rework" },
        ] : [
          { label: "First-pass yield", value: `${intelligence.totals.firstPassYield.toFixed(1)}%`, detail: "accepted without rework" },
          { label: "Rejection rate", value: `${intelligence.totals.rejectionRate.toFixed(1)}%`, detail: `${intelligence.totals.rejected.toLocaleString("en-IN")} rejected units` },
          { label: "Reworked output", value: intelligence.totals.reworked.toLocaleString("en-IN"), detail: `${intelligence.totals.reworkRate.toFixed(1)}% of inspected output` },
        ]),
      ]} />
      <PerformancePanel title={mushroomMode ? "Quality loss by mushroom grade" : "Quality loss by product"} subtitle={mushroomMode ? "Products ordered by contamination or rejection rate" : "Products ordered by rejection rate"} option={option} />
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

function SteamFuelView() {
  const { intelligence } = useFactory();
  const steam = intelligence.steamRecovery;
  const option: EChartsOption = {
    grid: { left: 62, right: 62, top: 42, bottom: 38 },
    tooltip,
    legend: { top: 2, right: 8, textStyle: { color: colors.text, fontSize: 11 } },
    xAxis: { type: "category", data: steam.trend.map((point) => point.date.slice(5)), ...axis },
    yAxis: [
      { type: "value", name: "kg", axisLabel: { color: colors.text, fontSize: 11 }, splitLine: { lineStyle: { color: chartPalette.grid, type: "dashed" } } },
      { type: "value", name: "MJ", axisLabel: { color: colors.text, fontSize: 11 }, splitLine: { show: false } },
    ],
    series: [
      { name: "Steam generated", type: "bar", barWidth: 16, data: steam.trend.map((point) => point.steamGeneratedKg), itemStyle: { color: colors.blue, borderRadius: [4, 4, 0, 0] } },
      { name: "Briquettes used", type: "bar", barWidth: 12, data: steam.trend.map((point) => point.briquetteUsedKg), itemStyle: { color: colors.amber, borderRadius: [3, 3, 0, 0] } },
      { name: "Heat recovered", type: "line", yAxisIndex: 1, smooth: true, data: steam.trend.map((point) => point.heatRecoveredMj), lineStyle: { color: colors.green, width: 3 }, itemStyle: { color: colors.green } },
    ],
  };
  return <>
    <MetricRow metrics={[
      { label: "Heat recovered", value: `${steam.heatRecoveredGj.toFixed(2)} GJ`, detail: `${steam.temperatureLiftC.toFixed(1)}°C measured feedwater lift` },
      { label: "Briquettes avoided", value: `${steam.equivalentBriquetteSavedKg.toLocaleString("en-IN", { maximumFractionDigits: 0 })} kg`, detail: `${steam.briquetteAvoidancePercent.toFixed(1)}% of fuel without recovery` },
      { label: "Specific steam", value: `${steam.specificSteamKgPerUnit.toFixed(2)} kg/unit`, detail: "steam generated per actual output" },
      { label: "Fuel intensity", value: `${steam.specificBriquetteKgPerTonneSteam.toFixed(1)} kg/t`, detail: "briquettes per tonne of steam" },
    ]} />
    <PerformancePanel title="Steam, fuel and recovered heat" subtitle="Daily boiler-house pattern from approved utility logs" option={option} />
    <section className="panel contextual-empty-state"><Info size={22} /><div><h2>Recovery calculation is auditable</h2><p>Recovered heat = feedwater kg × 4.186 kJ/kg·K × measured tank temperature lift. Avoided briquettes use the logged GCV and boiler efficiency. Condensate recovery is {steam.condensateRecoveryPercent.toFixed(1)}%; flash-steam recovery is {steam.flashSteamRecoveryPercent.toFixed(1)}%. Flash steam is not added again, preventing double counting.</p></div></section>
  </>;
}

export function PerformanceExplorer() {
  const { intelligence, filters, state } = useFactory();
  const variant = useVariant();
  const mushroomMode = variant.features.mushroomAnalytics;
  const tabs: readonly Tab[] = mushroomMode ? mushroomTabs : automotiveTabs;
  const [activeTab, setActiveTab] = useState<Tab>(mushroomMode ? "Cultivation" : "OEE");
  const availableTabs = tabs.filter((tab) => {
    if (["Cultivation", "Harvest", "OEE", "Production"].includes(tab)) return intelligence.dataAvailability.production > 0;
    if (tab === "Steam & Fuel") return intelligence.dataAvailability.utilities > 0;
    if (tab === "Room downtime" || tab === "Downtime") return intelligence.dataAvailability.downtime > 0 || intelligence.totals.totalDowntime > 0;
    if (tab === "Crop quality" || tab === "Quality") return intelligence.dataAvailability.quality > 0;
    if (tab === "Inventory") return intelligence.dataAvailability.inventory > 0;
    return intelligence.dataAvailability.supplier > 0;
  });
  const selectedTab = availableTabs.includes(activeTab) ? activeTab : availableTabs[0];

  useEffect(() => {
    const queryTimer = window.setTimeout(() => {
      const requested = new URLSearchParams(window.location.search).get("tab") as Tab | null;
      if (requested && tabs.includes(requested)) setActiveTab(requested);
    }, 0);
    return () => window.clearTimeout(queryTimer);
  }, [tabs]);

  function selectTab(tab: Tab) {
    setActiveTab(tab);
    window.history.replaceState(null, "", `/performance?tab=${tab}`);
  }

  function exportData() {
    downloadBlob(JSON.stringify({ factory: state.activeFactoryId, filters, module: selectedTab, intelligence }, null, 2), `${variant.id}-${selectedTab?.toLowerCase().replaceAll(" ", "-") ?? "performance"}-${filters.to}.json`, "application/json");
  }

  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">{mushroomMode ? "Cultivation" : "Manufacturing"} · validated data</p><h1>{mushroomMode ? "Understand every crop." : "Understand every operation."} <span>{mushroomMode ? "Improve every flush." : "Improve every shift."}</span></h1><p className="page-subtitle">{mushroomMode ? "Harvest, climate, crop quality, rooms and supply intelligence from approved farm records." : "Production, OEE, downtime, quality and supply intelligence from approved factory records."}</p></div>
        {selectedTab && <button className="button button-secondary" onClick={exportData}><Download size={14} /> Export {selectedTab}</button>}
      </header>
      <CommandFilters />
      {availableTabs.length > 0 ? (
        <>
          <nav className="performance-tabs" aria-label="Available performance analysis">
            {availableTabs.map((tab) => <button className={selectedTab === tab ? "active" : ""} key={tab} onClick={() => selectTab(tab)}>{tab}</button>)}
          </nav>
          {selectedTab === "Cultivation" ? <CultivationView /> : selectedTab === "OEE" ? <OeeView /> : selectedTab === "Steam & Fuel" ? <SteamFuelView /> : selectedTab === "Harvest" || selectedTab === "Production" ? <ProductionView mushroomMode={mushroomMode} /> : selectedTab === "Room downtime" || selectedTab === "Downtime" ? <DowntimeView mushroomMode={mushroomMode} /> : selectedTab === "Crop quality" || selectedTab === "Quality" ? <QualityView mushroomMode={mushroomMode} /> : selectedTab === "Inventory" ? <InventoryView /> : <SuppliersView />}
        </>
      ) : (
        <section className="panel performance-no-data"><FileSearch size={28} /><h2>No {mushroomMode ? "cultivation" : "production"} analysis yet</h2><p>Upload a {mushroomMode ? "harvest or room observation" : "production, downtime or quality"} sheet to begin {variant.terminology.siteSingular} intelligence.</p></section>
      )}
    </>
  );
}

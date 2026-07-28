"use client";

import type { EChartsOption } from "echarts";
import { CalendarDays, ChevronDown, Download, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { Chart } from "@/components/charts/chart";
import { downtimeReasons, machines, weeklyTrend } from "@/lib/demo-data";

const tabs = ["OEE", "Production", "Downtime", "Quality", "Inventory"] as const;
type Tab = (typeof tabs)[number];

const colors = {
  green: "#416f57",
  blue: "#577fbc",
  amber: "#e2a040",
  red: "#db6653",
  line: "#e6e9e5",
  text: "#7c8781",
};

const axis = {
  axisLine: { lineStyle: { color: colors.line } },
  axisTick: { show: false },
  axisLabel: { color: colors.text, fontSize: 9 },
};

const tooltip = {
  trigger: "axis" as const,
  backgroundColor: "#17211d",
  borderWidth: 0,
  textStyle: { color: "#fff", fontSize: 9 },
};

function BreakdownCard({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  return (
    <div className="breakdown-card">
      <div><span>{label}</span><Info size={12} /></div>
      <strong>{value}%</strong>
      <p>Target {target}%</p>
      <i><b style={{ width: `${value}%`, background: color }} /></i>
    </div>
  );
}

function OeeView() {
  const trendOption: EChartsOption = {
    grid: { left: 42, right: 20, top: 25, bottom: 32 },
    tooltip: { ...tooltip, valueFormatter: (value: unknown) => `${value}%` },
    legend: { right: 12, top: 0, itemHeight: 7, itemWidth: 7, textStyle: { fontSize: 8, color: colors.text } },
    xAxis: { type: "category", data: weeklyTrend.map((item) => item.label), ...axis },
    yAxis: { type: "value", min: 50, max: 100, axisLabel: { color: colors.text, fontSize: 9, formatter: "{value}%" }, splitLine: { lineStyle: { color: "#edf0ec", type: "dashed" } } },
    series: [
      { name: "OEE", type: "line", smooth: true, symbolSize: 5, data: weeklyTrend.map((item) => item.oee), lineStyle: { color: colors.green, width: 2.5 }, itemStyle: { color: colors.green }, areaStyle: { color: "rgba(65,111,87,.12)" } },
      { name: "Target", type: "line", symbol: "none", data: weeklyTrend.map(() => 78), lineStyle: { color: "#aeb6b1", type: "dashed", width: 1.2 } },
    ],
  };

  const machineOption: EChartsOption = {
    grid: { left: 82, right: 27, top: 10, bottom: 25 },
    tooltip: { ...tooltip, valueFormatter: (value: unknown) => `${value}%` },
    xAxis: { type: "value", min: 0, max: 100, axisLabel: { color: colors.text, fontSize: 8, formatter: "{value}%" }, splitLine: { lineStyle: { color: "#edf0ec", type: "dashed" } } },
    yAxis: { type: "category", data: [...machines].reverse().map((machine) => machine.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: colors.text, fontSize: 9 } },
    series: [{
      type: "bar",
      barWidth: 11,
      data: [...machines].reverse().map((machine) => ({
        value: machine.oee,
        itemStyle: { color: machine.oee >= 78 ? colors.green : machine.oee >= 70 ? colors.amber : colors.red, borderRadius: [0, 5, 5, 0] },
      })),
      label: { show: true, position: "right", formatter: "{c}%", color: colors.text, fontSize: 8 },
    }],
  };

  return (
    <>
      <section className="breakdown-grid">
        <BreakdownCard label="Availability" value={81} target={85} color={colors.amber} />
        <BreakdownCard label="Performance" value={92} target={95} color={colors.blue} />
        <BreakdownCard label="Quality" value={96.3} target={98} color={colors.green} />
        <div className="formula-card">
          <span>OEE formula · v1</span>
          <p><b>81%</b> × <b>92%</b> × <b>96.3%</b></p>
          <strong>= 71.8%</strong>
        </div>
      </section>
      <div className="performance-chart-grid">
        <section className="panel">
          <div className="panel-header"><div><h2 className="panel-title">OEE over time</h2><p className="panel-subtitle">Component result and factory target</p></div></div>
          <div className="chart-wrap"><Chart option={trendOption} height={270} /></div>
        </section>
        <section className="panel">
          <div className="panel-header"><div><h2 className="panel-title">OEE by machine</h2><p className="panel-subtitle">Today · ranked highest to lowest</p></div></div>
          <div className="chart-wrap"><Chart option={machineOption} height={270} /></div>
        </section>
      </div>
      <MachineTable />
    </>
  );
}

function MachineTable() {
  return (
    <section className="panel machine-table-panel">
      <div className="panel-header"><div><h2 className="panel-title">Asset performance</h2><p className="panel-subtitle">Calculation inputs remain available for every result</p></div></div>
      <div className="table-panel">
        <table className="data-table">
          <thead><tr><th>Machine</th><th>Status</th><th>OEE</th><th>Output</th><th>Downtime</th><th>Primary loss</th></tr></thead>
          <tbody>
            {machines.map((machine) => (
              <tr key={machine.name}>
                <td><span className="table-primary">{machine.name}</span><span className="table-secondary">{machine.line}</span></td>
                <td><span className={`machine-status machine-${machine.status}`}><i />{machine.status}</span></td>
                <td><strong className={machine.oee < 70 ? "text-danger" : machine.oee < 78 ? "text-warning" : "text-good"}>{machine.oee}%</strong></td>
                <td className="numeric">{machine.output.toLocaleString("en-IN")} units</td>
                <td className="numeric">{machine.downtime} min</td>
                <td>{machine.name === "Press 04" ? "Equipment failure" : machine.name === "Packaging 02" ? "Changeover" : "Minor stops"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProductionView() {
  const option: EChartsOption = {
    grid: { left: 48, right: 18, top: 34, bottom: 34 },
    tooltip,
    legend: { top: 2, right: 8, textStyle: { color: colors.text, fontSize: 9 } },
    xAxis: { type: "category", data: weeklyTrend.map((point) => point.label), ...axis },
    yAxis: { type: "value", axisLabel: { color: colors.text, fontSize: 9, formatter: (value: number) => `${value / 1000}k` }, splitLine: { lineStyle: { color: "#edf0ec", type: "dashed" } } },
    series: [
      { name: "Planned", type: "bar", barGap: "-100%", barWidth: 20, data: weeklyTrend.map((point) => point.planned), itemStyle: { color: "#e7ebe7", borderRadius: [4, 4, 0, 0] } },
      { name: "Actual", type: "bar", barWidth: 12, data: weeklyTrend.map((point) => point.actual), itemStyle: { color: colors.green, borderRadius: [3, 3, 0, 0] } },
    ],
  };
  return <GenericChart title="Planned versus actual production" subtitle="Daily output · all production lines" option={option} />;
}

function DowntimeView() {
  const option: EChartsOption = {
    grid: { left: 112, right: 30, top: 20, bottom: 30 },
    tooltip,
    xAxis: { type: "value", axisLabel: { color: colors.text, fontSize: 9, formatter: "{value} min" }, splitLine: { lineStyle: { color: "#edf0ec", type: "dashed" } } },
    yAxis: { type: "category", data: [...downtimeReasons].reverse().map((item) => item.reason), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: colors.text, fontSize: 9 } },
    series: [{ type: "bar", barWidth: 14, data: [...downtimeReasons].reverse().map((item, index) => ({ value: item.minutes, itemStyle: { color: index < 3 ? colors.amber : colors.red, borderRadius: [0, 5, 5, 0] } })), label: { show: true, position: "right", formatter: "{c} min", fontSize: 8, color: colors.text } }],
  };
  return <GenericChart title="Downtime Pareto" subtitle="Minutes lost by standard reason code" option={option} />;
}

function QualityView() {
  const option: EChartsOption = {
    grid: { left: 43, right: 20, top: 35, bottom: 30 },
    tooltip: { ...tooltip, valueFormatter: (value: unknown) => `${value}%` },
    xAxis: { type: "category", data: weeklyTrend.map((point) => point.label), ...axis },
    yAxis: { type: "value", min: 90, max: 100, axisLabel: { color: colors.text, fontSize: 9, formatter: "{value}%" }, splitLine: { lineStyle: { color: "#edf0ec", type: "dashed" } } },
    series: [{ name: "First pass yield", type: "line", smooth: true, data: weeklyTrend.map((point) => point.quality), lineStyle: { color: colors.blue, width: 2.5 }, itemStyle: { color: colors.blue }, areaStyle: { color: "rgba(87,127,188,.12)" }, markLine: { silent: true, symbol: "none", lineStyle: { color: colors.amber, type: "dashed" }, data: [{ yAxis: 98 }] } }],
  };
  return <GenericChart title="First pass yield" subtitle="Accepted quantity without rework · target 98%" option={option} />;
}

function InventoryView() {
  const option: EChartsOption = {
    grid: { left: 95, right: 35, top: 20, bottom: 25 },
    tooltip,
    xAxis: { type: "value", max: 10, axisLabel: { color: colors.text, fontSize: 9, formatter: "{value} days" }, splitLine: { lineStyle: { color: "#edf0ec", type: "dashed" } } },
    yAxis: { type: "category", data: ["RM-108", "RM-224", "RM-071", "RM-312", "RM-419"], axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: colors.text, fontSize: 9 } },
    series: [{ type: "bar", barWidth: 15, data: [1.3, 2.1, 3.4, 6.5, 8.2].map((value) => ({ value, itemStyle: { color: value < 2 ? colors.red : value < 4 ? colors.amber : colors.green, borderRadius: [0, 5, 5, 0] } })), label: { show: true, position: "right", formatter: "{c} days", fontSize: 8, color: colors.text } }],
  };
  return <GenericChart title="Material stock cover" subtitle="Days available at current production plan" option={option} />;
}

function GenericChart({ title, subtitle, option }: { title: string; subtitle: string; option: EChartsOption }) {
  return (
    <section className="panel generic-performance-chart">
      <div className="panel-header"><div><h2 className="panel-title">{title}</h2><p className="panel-subtitle">{subtitle}</p></div></div>
      <div className="chart-wrap"><Chart option={option} height={390} /></div>
    </section>
  );
}

export function PerformanceExplorer() {
  const [activeTab, setActiveTab] = useState<Tab>("OEE");
  const view = useMemo(() => {
    if (activeTab === "Production") return <ProductionView />;
    if (activeTab === "Downtime") return <DowntimeView />;
    if (activeTab === "Quality") return <QualityView />;
    if (activeTab === "Inventory") return <InventoryView />;
    return <OeeView />;
  }, [activeTab]);

  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">Performance intelligence</p><h1>Operational <span>performance</span></h1><p className="page-subtitle">Move from the factory score to its calculation inputs and contributing assets.</p></div>
        <div className="page-actions">
          <div className="filter-control"><CalendarDays size={14} /><select defaultValue="week"><option value="today">Today</option><option value="week">Last 7 days</option><option value="month">This month</option></select><ChevronDown size={13} /></div>
          <button className="button button-secondary"><Download size={14} /> Export</button>
        </div>
      </header>
      <nav className="performance-tabs" aria-label="Performance module">
        {tabs.map((tab) => <button className={activeTab === tab ? "active" : ""} key={tab} onClick={() => setActiveTab(tab)}>{tab}</button>)}
      </nav>
      {view}
    </>
  );
}

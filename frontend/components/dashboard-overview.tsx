"use client";

import type { EChartsOption } from "echarts";
import { ArrowRight, CalendarDays, ChevronDown, Download, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Chart } from "@/components/charts/chart";
import { KpiCard } from "@/components/kpi-card";
import type {
  InventoryRisk,
  KpiMetric,
  LossCategory,
  OperationalAlert,
  TrendPoint,
} from "@/lib/types";

interface DashboardOverviewProps {
  kpis: KpiMetric[];
  trend: TrendPoint[];
  losses: LossCategory[];
  inventoryRisks: InventoryRisk[];
  alerts: OperationalAlert[];
}

const chartText = {
  fontFamily: "Inter, ui-sans-serif, sans-serif",
  color: "#7c8781",
  fontSize: 9,
};

function ProductionPanel({ trend }: { trend: TrendPoint[] }) {
  const option: EChartsOption = {
    animationDuration: 650,
    grid: { left: 42, right: 18, top: 28, bottom: 30 },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#17211d",
      borderWidth: 0,
      textStyle: { color: "#fff", fontSize: 10 },
      valueFormatter: (value) => Number(value).toLocaleString("en-IN"),
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: trend.map((point) => point.label),
      axisLine: { lineStyle: { color: "#e3e6e1" } },
      axisTick: { show: false },
      axisLabel: chartText,
    },
    yAxis: {
      type: "value",
      min: 16000,
      max: 22000,
      interval: 2000,
      splitLine: { lineStyle: { color: "#edf0ec", type: "dashed" } },
      axisLabel: {
        ...chartText,
        formatter: (value: number) => `${Math.round(value / 1000)}k`,
      },
    },
    series: [
      {
        name: "Planned",
        type: "line",
        data: trend.map((point) => point.planned),
        symbol: "none",
        lineStyle: { color: "#aeb6b1", type: "dashed", width: 1.5 },
      },
      {
        name: "Actual",
        type: "line",
        smooth: 0.28,
        data: trend.map((point) => point.actual),
        symbol: "circle",
        symbolSize: 5,
        itemStyle: { color: "#315d47", borderColor: "#fff", borderWidth: 2 },
        lineStyle: { color: "#315d47", width: 2.5 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(67, 120, 91, 0.22)" },
              { offset: 1, color: "rgba(67, 120, 91, 0.01)" },
            ],
          },
        },
      },
    ],
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div className="panel-title-group">
          <h2 className="panel-title">Production attainment</h2>
          <p className="panel-subtitle">Daily planned versus actual output</p>
        </div>
        <div className="chart-legend" aria-label="Chart legend">
          <span><i style={{ background: "#aeb6b1" }} /> Planned</span>
          <span><i style={{ background: "#315d47" }} /> Actual</span>
        </div>
      </div>
      <div className="chart-wrap"><Chart option={option} height={236} /></div>
      <div className="chart-summary">
        <div className="chart-summary-item">
          <small>Total output</small><strong>130,670</strong><span>units</span>
        </div>
        <div className="chart-summary-item">
          <small>Plan attainment</small><strong>93.2%</strong><span className="text-good">+2.8%</span>
        </div>
        <div className="chart-summary-item">
          <small>Gap to plan</small><strong>9,230</strong><span>units</span>
        </div>
      </div>
    </section>
  );
}

function OeePanel({ trend }: { trend: TrendPoint[] }) {
  const option: EChartsOption = {
    grid: { left: 34, right: 12, top: 22, bottom: 26 },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#17211d",
      borderWidth: 0,
      textStyle: { color: "#fff", fontSize: 9 },
      valueFormatter: (value) => `${value}%`,
    },
    xAxis: {
      type: "category",
      data: trend.map((point) => point.label.replace(" Jul", "")),
      axisLine: { lineStyle: { color: "#e3e6e1" } },
      axisTick: { show: false },
      axisLabel: chartText,
    },
    yAxis: {
      type: "value",
      min: 55,
      max: 100,
      axisLabel: { ...chartText, formatter: "{value}%" },
      splitLine: { lineStyle: { color: "#edf0ec", type: "dashed" } },
    },
    series: [
      {
        name: "OEE",
        type: "bar",
        barWidth: "47%",
        data: trend.map((point) => ({
          value: point.oee,
          itemStyle: {
            color: point.oee >= 78 ? "#4f8067" : point.oee >= 70 ? "#dca04a" : "#dc6b58",
            borderRadius: [4, 4, 0, 0],
          },
        })),
        markLine: {
          silent: true,
          symbol: "none",
          label: {
            formatter: "78% target",
            position: "insideEndTop",
            color: "#87908b",
            fontSize: 8,
          },
          lineStyle: { color: "#87908b", type: "dashed", width: 1 },
          data: [{ yAxis: 78 }],
        },
      },
    ],
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div className="panel-title-group">
          <h2 className="panel-title">OEE trend</h2>
          <p className="panel-subtitle">Target versus actual · last 7 days</p>
        </div>
        <Link className="panel-action" href="/performance">
          Explore <ArrowRight size={12} />
        </Link>
      </div>
      <div className="chart-wrap"><Chart option={option} height={216} /></div>
    </section>
  );
}

function LossPanel({ losses }: { losses: LossCategory[] }) {
  const option: EChartsOption = {
    tooltip: {
      trigger: "item",
      backgroundColor: "#17211d",
      borderWidth: 0,
      textStyle: { color: "#fff", fontSize: 9 },
      formatter: "{b}: {c}% ({d}%)",
    },
    series: [
      {
        name: "Loss",
        type: "pie",
        radius: ["55%", "76%"],
        center: ["36%", "50%"],
        avoidLabelOverlap: true,
        padAngle: 2,
        itemStyle: { borderRadius: 3 },
        label: { show: false },
        data: losses.map((loss) => ({
          name: loss.category,
          value: loss.value,
          itemStyle: { color: loss.color },
        })),
      },
    ],
    graphic: [
      {
        type: "text",
        left: "28%",
        top: "41%",
        style: { text: "455", fill: "#17211d", font: "700 19px Inter" },
      },
      {
        type: "text",
        left: "25.5%",
        top: "55%",
        style: { text: "min lost", fill: "#87908b", font: "9px Inter" },
      },
    ],
  };

  return (
    <section className="panel loss-panel">
      <div className="panel-header">
        <div className="panel-title-group">
          <h2 className="panel-title">Loss composition</h2>
          <p className="panel-subtitle">Quantified operational loss today</p>
        </div>
      </div>
      <div className="loss-content">
        <div className="loss-chart"><Chart option={option} height={216} /></div>
        <div className="loss-legend">
          {losses.slice(0, 4).map((loss) => (
            <div key={loss.category}>
              <span><i style={{ background: loss.color }} />{loss.category}</span>
              <strong>{loss.value}%</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function DashboardOverview({
  kpis,
  trend,
  losses,
  inventoryRisks,
  alerts,
}: DashboardOverviewProps) {
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Wednesday, 29 July 2026</p>
          <h1>Good afternoon, Harsh. <span>Here’s the pulse.</span></h1>
          <p className="page-subtitle">Pune Plant 01 · Data consolidated through 12:18 IST</p>
        </div>
        <div className="page-actions">
          <div className="filter-control">
            <CalendarDays size={14} />
            <select aria-label="Dashboard period" defaultValue="today">
              <option value="today">Today</option>
              <option value="week">Last 7 days</option>
              <option value="month">This month</option>
            </select>
            <ChevronDown size={13} />
          </div>
          <button className="button button-secondary"><Download size={14} /> Export</button>
        </div>
      </header>

      <section className="kpi-grid" aria-label="Key performance indicators">
        {kpis.map((metric) => <KpiCard metric={metric} key={metric.code} />)}
      </section>

      <div className="dashboard-grid">
        <div className="dashboard-column">
          <ProductionPanel trend={trend} />
          <div className="split-panels">
            <OeePanel trend={trend} />
            <LossPanel losses={losses} />
          </div>
        </div>

        <div className="dashboard-column">
          <section className="panel">
            <div className="panel-header">
              <div className="panel-title-group">
                <h2 className="panel-title">Critical attention</h2>
                <p className="panel-subtitle">Alerts requiring action this shift</p>
              </div>
              <Link className="panel-action" href="/alerts">View all <ArrowRight size={12} /></Link>
            </div>
            <div className="alert-list">
              {alerts.slice(0, 3).map((alert) => (
                <Link href="/alerts" className="alert-row" key={alert.id}>
                  <i className={`alert-indicator ${alert.severity}`} />
                  <div className="alert-copy">
                    <strong>{alert.title}</strong><span>{alert.asset}</span>
                  </div>
                  <time className="alert-time">{alert.relativeTime}</time>
                </Link>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="panel-title-group">
                <h2 className="panel-title">Inventory at risk</h2>
                <p className="panel-subtitle">Materials below target stock cover</p>
              </div>
              <button className="panel-action">Details <ExternalLink size={11} /></button>
            </div>
            <div className="inventory-list">
              {inventoryRisks.map((risk) => (
                <div className="inventory-row" key={risk.code}>
                  <div className="inventory-row-top">
                    <strong>{risk.material}</strong>
                    <span className={`risk-${risk.status}`}>
                      {risk.status === "stockout" ? "Stock-out" : risk.status}
                    </span>
                  </div>
                  <div className="inventory-row-bottom">
                    <span>{risk.code} · required {risk.requiredDate}</span>
                    <span><b>{risk.stockDays}</b> days</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel data-quality-card">
            <div className="data-quality-top">
              <div><h3>Data quality</h3><p>Across today’s approved uploads</p></div>
              <strong className="quality-score">98.7%</strong>
            </div>
            <div className="quality-bar"><span /></div>
            <div className="quality-stats">
              <div><strong>28,546</strong><span>accepted rows</span></div>
              <div><strong>54</strong><span>warnings</span></div>
              <div><strong>23</strong><span>rejected</span></div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

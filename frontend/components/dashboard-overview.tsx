"use client";

import type { EChartsOption } from "echarts";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  ExternalLink,
  FileSearch,
  Lightbulb,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { Chart } from "@/components/charts/chart";
import { CommandFilters } from "@/components/command-filters";
import { downloadBlob } from "@/lib/browser-files";
import { useFactory } from "@/lib/factory-context";

const colors = {
  plan: "#b9c0bc",
  actual: "#416f57",
  good: "#9abb55",
};

function PanelHeader({
  number,
  title,
  subtitle,
  href,
}: {
  number: number;
  title: string;
  subtitle: string;
  href?: string;
}) {
  return (
    <div className="panel-header command-panel-header">
      <div className="widget-number">{number}</div>
      <div className="panel-title-group">
        <h2 className="panel-title">{title}</h2>
        <p className="panel-subtitle">{subtitle}</p>
      </div>
      {href && (
        <Link className="panel-action" href={href}>
          Explore <ArrowRight size={12} />
        </Link>
      )}
    </div>
  );
}

function EmptyData({ type }: { type: string }) {
  return (
    <div className="widget-empty">
      <FileSearch size={18} />
      <span>No {type} data matches these filters.</span>
      <Link href="/uploads">
        Add data <ArrowRight size={11} />
      </Link>
    </div>
  );
}

function ProductionWidget() {
  const { intelligence } = useFactory();
  const option = useMemo<EChartsOption>(
    () => ({
      animationDuration: 500,
      grid: { left: 43, right: 15, top: 24, bottom: 30 },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#17211d",
        borderWidth: 0,
        textStyle: { color: "#fff", fontSize: 10 },
      },
      legend: {
        top: 0,
        right: 5,
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: "#7c8781", fontSize: 8 },
      },
      xAxis: {
        type: "category",
        data: intelligence.productionTrend.map((row) => row.date.slice(5)),
        axisLine: { lineStyle: { color: "#e3e6e1" } },
        axisTick: { show: false },
        axisLabel: { color: "#7c8781", fontSize: 8 },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: "#7c8781",
          fontSize: 8,
          formatter: (value: number) => `${Math.round(value / 1000)}k`,
        },
        splitLine: { lineStyle: { color: "#edf0ec", type: "dashed" } },
      },
      series: [
        {
          name: "Planned",
          type: "line",
          symbol: "none",
          lineStyle: { color: colors.plan, type: "dashed", width: 1.5 },
          data: intelligence.productionTrend.map((row) => row.planned),
        },
        {
          name: "Actual",
          type: "line",
          smooth: true,
          symbolSize: 5,
          lineStyle: { color: colors.actual, width: 2.5 },
          itemStyle: { color: colors.actual },
          areaStyle: { color: "rgba(65,111,87,.09)" },
          data: intelligence.productionTrend.map((row) => row.actual),
        },
        {
          name: "Good",
          type: "line",
          smooth: true,
          symbol: "none",
          lineStyle: { color: colors.good, width: 2 },
          data: intelligence.productionTrend.map((row) => row.good),
        },
      ],
    }),
    [intelligence.productionTrend],
  );

  return (
    <section className="panel command-widget production-widget home-production-widget">
      <PanelHeader
        number={1}
        title="Output against plan"
        subtitle="Daily planned, actual and good production"
        href="/performance?tab=Production"
      />
      <div className="command-metric-row">
        <div><span>Plan</span><strong>{intelligence.totals.planned.toLocaleString("en-IN")}</strong></div>
        <div><span>Actual</span><strong>{intelligence.totals.actual.toLocaleString("en-IN")}</strong></div>
        <div><span>Good</span><strong>{intelligence.totals.good.toLocaleString("en-IN")}</strong></div>
        <div><span>Attainment</span><strong>{intelligence.totals.planAttainment.toFixed(1)}%</strong></div>
      </div>
      {intelligence.productionTrend.length ? <Chart option={option} height={250} /> : <EmptyData type="production" />}
    </section>
  );
}

function MajorLossesWidget() {
  const { intelligence } = useFactory();
  const maxDowntime = intelligence.machineLoss[0]?.minutes || 1;
  const maxDefect = intelligence.defectLoss[0]?.rejected || 1;

  return (
    <section className="panel command-widget home-loss-widget">
      <PanelHeader
        number={2}
        title="Major operational losses"
        subtitle="The largest quantified losses in the selected period"
        href="/performance?tab=Downtime"
      />
      <div className="loss-kpi-row">
        <div><span>Output below plan</span><strong>{intelligence.totals.estimatedProductionLost.toLocaleString("en-IN")} units</strong></div>
        <div><span>Total downtime</span><strong>{intelligence.totals.totalDowntime.toLocaleString("en-IN")} min</strong></div>
        <div><span>Rejected</span><strong>{intelligence.totals.rejected.toLocaleString("en-IN")} units</strong></div>
      </div>
      <div className="home-loss-columns">
        <div>
          <h3>Top affected machines</h3>
          <div className="ranked-bars">
            {intelligence.machineLoss.slice(0, 3).map((item, index) => (
              <div key={item.machine}>
                <span className="rank-number">{index + 1}</span>
                <div>
                  <span><strong>{item.machine}</strong><small>{item.occurrences} stops</small></span>
                  <i><b style={{ width: `${(item.minutes / maxDowntime) * 100}%` }} /></i>
                </div>
                <strong>{item.minutes} min</strong>
              </div>
            ))}
            {!intelligence.machineLoss.length && <EmptyData type="downtime" />}
          </div>
        </div>
        <div>
          <h3>Top quality-loss reasons</h3>
          <div className="defect-bars">
            {intelligence.defectLoss.slice(0, 3).map((item) => (
              <div key={item.reason}>
                <span><b>{item.reason}</b><strong>{item.rejected} rejected</strong></span>
                <i><b style={{ width: `${(item.rejected / maxDefect) * 100}%` }} /></i>
              </div>
            ))}
            {!intelligence.defectLoss.length && <EmptyData type="quality" />}
          </div>
        </div>
      </div>
      <div className="widget-insight">
        <Lightbulb size={14} />
        <span>
          <b>Most repeated issue:</b>{" "}
          {intelligence.machineLoss[0]
            ? `${intelligence.machineLoss[0].machine} · ${intelligence.machineLoss[0].occurrences} stops`
            : "No recurring downtime in this selection"}
        </span>
      </div>
    </section>
  );
}

function PriorityExceptionsWidget() {
  const { intelligence } = useFactory();
  const alerts = intelligence.alerts.filter((alert) => alert.status !== "resolved").slice(0, 3);

  return (
    <section className="panel command-widget home-alert-widget">
      <PanelHeader
        number={4}
        title="Priority exceptions"
        subtitle="Only issues that need attention now"
        href="/alerts"
      />
      <div className="priority-alerts">
        {alerts.map((alert) => (
          <article key={alert.id}>
            <i className={`alert-indicator ${alert.severity}`} />
            <div>
              <span><b>{alert.title}</b><small>{alert.asset} · {alert.observed}</small></span>
              <p>{alert.recommendation}</p>
              <div><Link href="/alerts">Review evidence <ArrowRight size={11} /></Link></div>
            </div>
          </article>
        ))}
        {!alerts.length && (
          <div className="all-clear">
            <CheckCircle2 size={24} />
            <strong>No priority exceptions</strong>
            <span>All configured rules are within range.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function SupplierPerformanceWidget() {
  const { intelligence } = useFactory();

  return (
    <section className="panel command-widget supplier-summary-widget">
      <PanelHeader
        number={3}
        title="Supplier delivery performance"
        subtitle="On-time delivery, quantity, accepted quality and agreed terms"
        href="/performance?tab=Suppliers"
      />
      <div className="supplier-overall-score">
        <span>Overall supplier score</span>
        <strong>{intelligence.supplierScore.toFixed(1)}<small>/100</small></strong>
      </div>
      <div className="supplier-score-list">
        {intelligence.supplierScores.slice(0, 4).map((supplier) => (
          <article key={supplier.supplier}>
            <div>
              <strong>{supplier.supplier}</strong>
              <span>{supplier.deliveries} deliveries · {supplier.lateDeliveries} late</span>
            </div>
            <i><b style={{ width: `${supplier.score}%` }} /></i>
            <strong>{supplier.score.toFixed(1)}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

export function DashboardOverview() {
  const { state, filters, intelligence } = useFactory();
  const activeFactory = state.factories.find((factory) => factory.id === state.activeFactoryId);
  const latestUpload = state.uploads[0];
  const available = intelligence.dataAvailability;
  const hasProduction = available.production > 0;
  const hasLosses = hasProduction || available.downtime > 0 || available.quality > 0;
  const hasSupplier = available.supplier > 0;
  const summaryMetrics = [
    hasProduction && { label: "Plan attainment", value: `${intelligence.totals.planAttainment.toFixed(1)}%`, detail: `${intelligence.totals.actual.toLocaleString("en-IN")} actual` },
    hasProduction && { label: "OEE", value: `${intelligence.oee.value.toFixed(1)}%`, detail: `A ${intelligence.oee.availability.toFixed(1)} · P ${intelligence.oee.performance.toFixed(1)} · Q ${intelligence.oee.quality.toFixed(1)}` },
    (hasProduction || available.downtime > 0) && { label: "Total downtime", value: `${intelligence.totals.totalDowntime.toLocaleString("en-IN")} min`, detail: `${intelligence.totals.downtimeFrequency} stops` },
    (hasProduction || available.quality > 0) && { label: "Rejection", value: `${intelligence.totals.rejectionRate.toFixed(1)}%`, detail: `${intelligence.totals.rejected.toLocaleString("en-IN")} units` },
    available.inventory > 0 && { label: "Material risks", value: intelligence.inventoryRisks.length.toString(), detail: "requiring review" },
    hasSupplier && { label: "Supplier score", value: intelligence.supplierScore.toFixed(1), detail: "out of 100" },
    state.uploads.length > 0 && { label: "Data quality", value: `${intelligence.dataQuality.toFixed(1)}%`, detail: `${state.uploads.length} source sheets` },
  ].filter((item): item is { label: string; value: string; detail: string } => Boolean(item));

  function exportSnapshot() {
    downloadBlob(
      JSON.stringify({ generatedAt: new Date().toISOString(), factory: activeFactory, filters, intelligence }, null, 2),
      `vulcan-command-centre-${filters.to}.json`,
      "application/json",
    );
  }

  return (
    <>
      <header className="page-header command-centre-header">
        <div>
          <p className="eyebrow">
            Factory command centre · {new Date(`${filters.to}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
          </p>
          <h1>See the loss. <span>Change the outcome.</span></h1>
          <p className="page-subtitle">
            {activeFactory?.name} · latest upload: {latestUpload ? `${latestUpload.filename} · ${latestUpload.status.toLowerCase().replaceAll("_", " ")}` : "no sheets uploaded"}
          </p>
        </div>
        <div className="page-actions">
          <Link href="/uploads" className="button button-accent">Add factory data <ArrowRight size={14} /></Link>
          <button className="button button-secondary" onClick={exportSnapshot}><Download size={14} /> Export snapshot</button>
        </div>
      </header>
      <CommandFilters />
      {summaryMetrics.length > 0 && <div className="answer-summary-strip home-summary-strip" style={{ gridTemplateColumns: `repeat(${Math.min(summaryMetrics.length, 6)}, 1fr)` }}>{summaryMetrics.map((metric) => <div key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></div>)}</div>}
      <div className="home-decision-grid">
        {hasProduction && <ProductionWidget />}
        {hasLosses && <MajorLossesWidget />}
        {hasSupplier && <SupplierPerformanceWidget />}
        {intelligence.alerts.length > 0 && <PriorityExceptionsWidget />}
        {!hasProduction && !hasLosses && !hasSupplier && intelligence.alerts.length === 0 && <section className="panel dashboard-start-state"><FileSearch size={24} /><div><h2>Add the first operational sheet</h2><p>Upload production, downtime, quality, inventory or supplier deliveries. V2 will show only analysis supported by that data.</p></div><Link className="button button-primary" href="/uploads">Upload sheets <ArrowRight size={12} /></Link></section>}
      </div>
      <div className="traceability-footer">
        <ShieldAlert size={14} />
        <span>Only approved mapped records are used. Raw inputs remain preserved.</span>
        <Link href="/uploads">Inspect data lineage <ExternalLink size={11} /></Link>
      </div>
    </>
  );
}

"use client";

import type { EChartsOption } from "echarts";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Download,
  ExternalLink,
  FileSearch,
  FolderKanban,
  Gauge,
  Lightbulb,
  ShieldAlert,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { Chart } from "@/components/charts/chart";
import { CommandFilters } from "@/components/command-filters";
import { downloadBlob } from "@/lib/browser-files";
import { formatDuration } from "@/lib/formatters";
import { useFactory } from "@/lib/factory-context";
import { datasetLabels, type DatasetType } from "@/lib/factory-domain";
import { useProjects } from "@/lib/project-context";

const colors = {
  plan: "#b9c0bc",
  actual: "#416f57",
  good: "#9abb55",
};

function HomeModuleGrid() {
  const { projects } = useProjects();
  const { intelligence } = useFactory();
  const delayed = projects.filter((project) => project.status === "Delayed" || project.deliveryPrediction.state !== "On track").length;
  const activeAlerts = intelligence.alerts.filter((alert) => alert.status !== "resolved");
  const criticalAlerts = activeAlerts.filter((alert) => alert.severity === "critical").length;
  const twin = intelligence.digitalTwin.summary;
  const hasProduction = intelligence.dataAvailability.production > 0;
  const modules = [
    { href: "/projects", label: "Crop cycles", description: "Track every batch from compost preparation to cold room.", value: projects.filter((project) => project.status !== "Completed").length.toString(), status: "active crop cycles", meta: `${delayed} at risk`, icon: FolderKanban },
    { href: "/digital-twin", label: "Farm twin", description: "See crop stages, growing rooms and current conditions.", value: twin.running.toString(), status: `of ${twin.machines} rooms/assets healthy`, meta: `${twin.attention} need attention`, icon: Workflow },
    { href: "/performance", label: "Cultivation", description: "Understand harvest, conversion, climate and crop loss.", value: `${intelligence.mushroom.biologicalEfficiency.toFixed(1)}%`, status: "biological efficiency", meta: hasProduction ? `${intelligence.mushroom.planAttainment.toFixed(1)}% harvest attainment` : "Awaiting harvest data", icon: Gauge },
    { href: "/alerts", label: "Alerts", description: "Review priority exceptions and actions.", value: activeAlerts.length.toString(), status: "open alerts", meta: `${criticalAlerts} critical`, icon: ShieldAlert },
  ];
  return <section className="home-module-section"><header><div><div><h2>Move through your farm</h2><p>Open a workspace directly and see the current crop state.</p></div></div><small>4 cultivation modules</small></header><div className="home-module-grid">{modules.map((module) => { const Icon = module.icon; return <Link className="home-module-card" href={module.href} key={module.href}><span><Icon size={18} /></span><div><b>{module.label}</b><p>{module.description}</p><div className="home-module-status"><strong>{module.value}</strong><span>{module.status}</span></div><small>{module.meta}</small></div><ArrowRight size={15} /></Link>; })}</div></section>;
}

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

const coreMonitoredDatasets = ["production", "downtime", "quality", "inventory", "supplier"] as const;

function DataHealthNotice({ intelligence }: { intelligence: ReturnType<typeof useFactory>["intelligence"] }) {
  const monitoredDatasets: DatasetType[] = intelligence.digitalTwin.summary.processes
    ? ["process", ...coreMonitoredDatasets]
    : [...coreMonitoredDatasets];
  const issues = monitoredDatasets.flatMap((datasetType) => {
    const health = intelligence.dataHealth[datasetType];
    return health && health.status !== "current" ? [{ datasetType, ...health }] : [];
  });
  if (!issues.length) return null;
  return (
    <section className="panel data-health-notice">
      <div className="data-health-notice-heading"><CircleAlert size={20} /><div><h2>Data needs attention</h2><p>Refresh these sheets so crop decisions use current farm facts.</p></div></div>
      <div className="data-health-notice-list">
        {issues.map((issue) => {
          const label = datasetLabels[issue.datasetType as DatasetType];
          const detail = issue.status === "absent"
            ? `No ${label.toLowerCase()} sheet has been approved.`
            : issue.ageDays === null
              ? `${label} has no approved record on or before the selected end date.`
              : `${label} is ${issue.ageDays} days old${issue.latestDate ? ` · latest ${new Date(`${issue.latestDate}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}.`;
          return <article key={issue.datasetType}><div><strong>{label}</strong><span>{detail}</span></div><Link className="button button-secondary" href={`/uploads?add=${issue.datasetType}`}>{issue.status === "absent" ? "Add" : "Refresh"} {label.toLowerCase()} <ArrowRight size={12} /></Link></article>;
        })}
      </div>
    </section>
  );
}

function ProductionWidget({ number }: { number: number }) {
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
        number={number}
        title="Harvest against plan"
        subtitle="Daily planned, total and saleable mushroom kg"
        href="/performance?tab=Harvest"
      />
      <div className="command-metric-row">
        <div><span>Plan</span><strong>{intelligence.totals.planned.toLocaleString("en-IN")} kg</strong></div>
        <div><span>Harvested</span><strong>{intelligence.totals.actual.toLocaleString("en-IN")} kg</strong></div>
        <div><span>Saleable</span><strong>{intelligence.totals.good.toLocaleString("en-IN")} kg</strong></div>
      </div>
      {intelligence.productionTrend.length ? <Chart option={option} height={250} /> : <EmptyData type="harvest" />}
    </section>
  );
}

function MajorLossesWidget({ number }: { number: number }) {
  const { intelligence } = useFactory();
  const maxDowntime = intelligence.machineLoss[0]?.minutes || 1;
  const maxDefect = intelligence.defectLoss[0]?.rejected || 1;

  return (
    <section className="panel command-widget home-loss-widget">
      <PanelHeader
        number={number}
        title="Crop loss and room interruptions"
        subtitle="The largest quantified harvest and environment losses"
        href="/performance?tab=Room%20downtime"
      />
      <div className="loss-kpi-row">
        <div><span>Harvest below plan</span><strong>{intelligence.totals.estimatedProductionLost.toLocaleString("en-IN")} kg</strong></div>
        <div><span>Room downtime</span><strong>{formatDuration(intelligence.totals.totalDowntime)}</strong></div>
        <div><span>Contaminated / discarded</span><strong>{intelligence.totals.rejected.toLocaleString("en-IN")} kg</strong></div>
      </div>
      <div className="home-loss-columns">
        <div>
          <h3>Top affected rooms and assets</h3>
          <div className="ranked-bars">
            {intelligence.machineLoss.slice(0, 3).map((item, index) => (
              <div key={item.machine}>
                <span className="rank-number">{index + 1}</span>
                <div>
                  <span><strong>{item.machine}</strong><small>{item.occurrences} stops</small></span>
                  <i><b style={{ width: `${(item.minutes / maxDowntime) * 100}%` }} /></i>
                </div>
                <strong>{formatDuration(item.minutes)}</strong>
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
                <span><b>{item.reason}</b><strong>{item.rejected} kg affected</strong></span>
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

function RoomConditionsWidget({ number }: { number: number }) {
  const { intelligence } = useFactory();
  return <section className="panel command-widget room-conditions-widget">
    <PanelHeader number={number} title="Growing-room conditions" subtitle="Latest temperature, humidity and CO2 by room" href="/digital-twin" />
    <div className="room-condition-list">
      {intelligence.roomConditions.filter((item) => item.temperatureC !== null || item.humidityPct !== null || item.co2Ppm !== null).slice(0, 6).map((item) => <article key={item.room} className={item.compliant === false ? "room-condition-warning" : ""}>
        <div><strong>{item.room}</strong><small>{item.batchId || item.process}</small></div>
        <span><small>Temp</small><b>{item.temperatureC === null ? "—" : `${item.temperatureC.toFixed(1)}°C`}</b></span>
        <span><small>RH</small><b>{item.humidityPct === null ? "—" : `${item.humidityPct.toFixed(1)}%`}</b></span>
        <span><small>CO2</small><b>{item.co2Ppm === null ? "—" : `${item.co2Ppm.toFixed(0)} ppm`}</b></span>
        <em>{item.compliant === false ? "Out of range" : "In range"}</em>
      </article>)}
    </div>
  </section>;
}

function PriorityExceptionsWidget({ number }: { number: number }) {
  const { intelligence } = useFactory();
  const alerts = intelligence.alerts.filter((alert) => alert.status !== "resolved").slice(0, 3);

  return (
    <section className="panel command-widget home-alert-widget">
      <PanelHeader
        number={number}
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

function SupplierPerformanceWidget({ number }: { number: number }) {
  const { intelligence } = useFactory();

  return (
    <section className="panel command-widget supplier-summary-widget">
      <PanelHeader
        number={number}
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
  const hasEnvironment = available.process > 0;
  const hasAlerts = intelligence.alerts.length > 0;
  const visibleCardKeys = [
    hasProduction && "production",
    hasEnvironment && "environment",
    hasLosses && "losses",
    hasSupplier && "supplier",
    hasAlerts && "alerts",
  ].filter((key): key is string => Boolean(key));
  const cardNumber = (key: string) => visibleCardKeys.indexOf(key) + 1;
  const summaryMetrics = [
    hasProduction && { label: "Biological efficiency", value: `${intelligence.mushroom.biologicalEfficiency.toFixed(1)}%`, detail: `${intelligence.mushroom.saleableHarvestKg.toLocaleString("en-IN")} kg from ${intelligence.mushroom.drySubstrateKg.toLocaleString("en-IN")} kg dry substrate` },
    hasProduction && { label: "Saleable yield", value: `${intelligence.mushroom.saleableYield.toFixed(1)}%`, detail: `${intelligence.mushroom.yieldPerM2.toFixed(1)} kg/m²` },
    hasEnvironment && { label: "Climate compliance", value: `${intelligence.mushroom.environmentCompliance.toFixed(1)}%`, detail: `${intelligence.mushroom.environmentReadings} room readings` },
    hasEnvironment && { label: "Water productivity", value: `${intelligence.mushroom.waterProductivityKgPerKl.toFixed(0)} kg/kl`, detail: `${intelligence.mushroom.waterLitres.toLocaleString("en-IN")} litres applied` },
    (hasProduction || available.quality > 0) && { label: "Contamination", value: `${intelligence.mushroom.contaminationRate.toFixed(1)}%`, detail: `${intelligence.mushroom.contaminatedHarvestKg.toLocaleString("en-IN")} kg affected` },
    available.inventory > 0 && { label: "Material risks", value: intelligence.inventoryRisks.length.toString(), detail: "requiring review" },
    hasSupplier && { label: "Supplier score", value: intelligence.supplierScore.toFixed(1), detail: "out of 100" },
    ...intelligence.customKpis.filter((item) => item.pinnedToHome).map((item) => ({ label: item.name, value: item.value === null ? "—" : `${item.value.toLocaleString("en-IN", { minimumFractionDigits: item.decimals, maximumFractionDigits: item.decimals })}${item.unit ? ` ${item.unit}` : ""}`, detail: "Custom KPI" })),
    state.uploads.length > 0 && { label: "Data quality", value: `${intelligence.dataQuality.toFixed(1)}%`, detail: `${state.uploads.length} source sheets` },
  ].filter((item): item is { label: string; value: string; detail: string } => Boolean(item));

  function exportSnapshot() {
    downloadBlob(
      JSON.stringify({ generatedAt: new Date().toISOString(), factory: activeFactory, filters, intelligence }, null, 2),
      `musroom-command-centre-${filters.to}.json`,
      "application/json",
    );
  }

  return (
    <>
      <header className="page-header command-centre-header">
        <div>
          <p className="eyebrow">
            Musroom crop command centre · {new Date(`${filters.to}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
          </p>
          <h1>See every crop. <span>Improve every flush.</span></h1>
          <p className="page-subtitle">
            {activeFactory?.name} · latest upload: {latestUpload ? `${latestUpload.filename} · ${latestUpload.status.toLowerCase().replaceAll("_", " ")}` : "no sheets uploaded"}
          </p>
        </div>
        <div className="page-actions">
          <Link href="/uploads" className="button button-accent">Add farm data <ArrowRight size={14} /></Link>
          <button className="button button-secondary" onClick={exportSnapshot}><Download size={14} /> Export snapshot</button>
        </div>
      </header>
      <HomeModuleGrid />
      <CommandFilters />
      <DataHealthNotice intelligence={intelligence} />
      {summaryMetrics.length > 0 && <div className="answer-summary-strip home-summary-strip" style={{ gridTemplateColumns: `repeat(${Math.min(summaryMetrics.length, 6)}, 1fr)` }}>{summaryMetrics.map((metric) => <div key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></div>)}</div>}
      <div className="home-decision-grid">
        {hasProduction && <ProductionWidget number={cardNumber("production")} />}
        {hasEnvironment && <RoomConditionsWidget number={cardNumber("environment")} />}
        {hasLosses && <MajorLossesWidget number={cardNumber("losses")} />}
        {hasSupplier && <SupplierPerformanceWidget number={cardNumber("supplier")} />}
        {hasAlerts && <PriorityExceptionsWidget number={cardNumber("alerts")} />}
      </div>
      <div className="traceability-footer">
        <ShieldAlert size={14} />
        <span>Only approved mapped records are used. Raw inputs remain preserved.</span>
        <Link href="/uploads">Inspect data lineage <ExternalLink size={11} /></Link>
      </div>
    </>
  );
}

"use client";

import { Activity, AlertTriangle, ArrowRight, BrainCircuit, CheckCircle2, Clock3, Factory, Gauge, MapPinOff, Radio, RefreshCw, Settings2, ShieldAlert, Target, TrendingDown, Unplug, Workflow, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { Chart } from "@/components/charts/chart";
import type { EChartsOption } from "echarts";
import type { LiveDashboardPayload, LiveMachineState, LiveVariable, MachineHistory } from "@/lib/factory-domain";
import { useFactory } from "@/lib/factory-context";

const labels: Record<LiveMachineState, string> = { down: "Down", warning: "Needs attention", degraded: "Stream degraded", stale: "Data stale", running: "Running", idle: "Idle", no_data: "No data" };

function relativeTime(value: string | null) {
  if (!value) return "Never";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function displayValue(variable: LiveVariable) {
  if (variable.value === null || variable.value === undefined || variable.value === "") return "—";
  return typeof variable.value === "number" ? variable.value.toLocaleString("en-IN", { maximumFractionDigits: 3 }) : String(variable.value);
}

function activitySentence(current: LiveDashboardPayload["current"]) {
  if (!current?.observedAt) return "Waiting for this machine's first observation.";
  const parts: string[] = [];
  if (current.activity.phase) parts.push(`is in ${current.activity.phase.replaceAll("_", " ")}`);
  if (current.activity.cycleNumber !== null) parts.push(`on cycle ${current.activity.cycleNumber}`);
  else if (current.activity.cycleId) parts.push(`on cycle ${current.activity.cycleId}`);
  if (current.activity.recipeId) parts.push(`using ${current.activity.recipeId}`);
  return parts.length ? `${current.name} ${parts.join(" ")}.` : `${current.name} is sending current operating data.`;
}

function EmptyDashboard({ layoutExists }: { layoutExists: boolean }) {
  return <section className="panel live-empty-state"><Factory size={34} /><h2>{layoutExists ? "No active machines yet" : "Build this factory in Lexicon"}</h2><p>{layoutExists ? "Add or reactivate a machine in Lexicon to begin monitoring live operations." : "Lexicon is now the source of truth for machines, processes, streams and the factory floor."}</p><Link className="button button-primary" href="/digital-twin">Open Lexicon <ArrowRight size={13} /></Link></section>;
}

type HistoryRangeKey = "24h" | "7d" | "30d" | "90d" | "custom";

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-IN", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function HistoricalPerformance({ history, rangeKey, onRangeKey, customFrom, customTo, onCustomFrom, onCustomTo }: {
  history: MachineHistory;
  rangeKey: HistoryRangeKey;
  onRangeKey: (value: HistoryRangeKey) => void;
  customFrom: string;
  customTo: string;
  onCustomFrom: (value: string) => void;
  onCustomTo: (value: string) => void;
}) {
  const { summary, confusionMatrix: matrix } = history;
  const accuracyTone = summary.accuracy === null ? "neutral" : summary.accuracy >= 90 ? "good" : summary.accuracy >= 80 ? "warn" : "bad";
  const dates = history.timeline.map((item) => new Date(item.at).toLocaleString("en-IN", history.timeline.length > 36 ? { day: "numeric", month: "short" } : { hour: "numeric", day: "numeric" }));
  const chartText = { color: "#66736e", fontFamily: "inherit", fontSize: 10 };
  const axis = { axisLine: { lineStyle: { color: "#dde4e0" } }, axisTick: { show: false }, axisLabel: chartText, splitLine: { lineStyle: { color: "#edf1ef" } } };
  const productionOption: EChartsOption = {
    color: ["#147a4b", "#d94d3f"], tooltip: { trigger: "axis" }, legend: { bottom: 0, textStyle: chartText },
    grid: { left: 42, right: 12, top: 18, bottom: 44 }, xAxis: { type: "category", data: dates, ...axis }, yAxis: { type: "value", minInterval: 1, ...axis },
    series: [
      { name: "Tubes produced", type: "bar", data: history.timeline.map((item) => item.produced), barMaxWidth: 22, itemStyle: { borderRadius: [4, 4, 0, 0] } },
      { name: "Actual rejects", type: "line", smooth: true, symbolSize: 6, data: history.timeline.map((item) => item.rejected) },
    ],
  };
  const predictionOption: EChartsOption = {
    color: ["#8459c8", "#d94d3f"], tooltip: { trigger: "axis" }, legend: { bottom: 0, textStyle: chartText },
    grid: { left: 42, right: 12, top: 18, bottom: 44 }, xAxis: { type: "category", data: dates, ...axis }, yAxis: { type: "value", minInterval: 1, ...axis },
    series: [
      { name: "Predicted failures", type: "line", smooth: true, areaStyle: { opacity: .1 }, data: history.timeline.map((item) => item.predictedFailures) },
      { name: "Actual failures", type: "line", smooth: true, data: history.timeline.map((item) => item.rejected) },
    ],
  };
  const accuracyOption: EChartsOption = {
    color: ["#147a4b"], tooltip: { trigger: "axis", valueFormatter: (value: unknown) => `${Number(value).toFixed(1)}%` },
    grid: { left: 42, right: 12, top: 20, bottom: 28 }, xAxis: { type: "category", data: dates, ...axis }, yAxis: { type: "value", min: 0, max: 100, axisLabel: { ...chartText, formatter: "{value}%" }, splitLine: axis.splitLine },
    series: [{ name: "Accuracy", type: "line", connectNulls: true, smooth: true, symbolSize: 6, areaStyle: { opacity: .09 }, markLine: { silent: true, symbol: "none", data: [{ yAxis: 80, name: "Retrain threshold" }], label: { formatter: "80% threshold" }, lineStyle: { color: "#d99a25", type: "dashed" } }, data: history.timeline.map((item) => item.accuracy) }],
  };
  const failureModeOption: EChartsOption = {
    color: ["#cf5f4f"], tooltip: { trigger: "axis" }, grid: { left: 90, right: 20, top: 10, bottom: 24 },
    xAxis: { type: "value", minInterval: 1, ...axis }, yAxis: { type: "category", data: history.failureModes.slice(0, 6).map((item) => item.label), axisLabel: { ...chartText, width: 78, overflow: "truncate" }, axisLine: { show: false }, axisTick: { show: false } },
    series: [{ type: "bar", data: history.failureModes.slice(0, 6).map((item) => item.count), barMaxWidth: 18, itemStyle: { borderRadius: [0, 4, 4, 0] } }],
  };
  const topTrend = history.parameterTrends.slice(0, 4);
  const parameterOption: EChartsOption = {
    tooltip: { trigger: "axis" }, legend: { bottom: 0, type: "scroll", textStyle: chartText },
    grid: { left: 45, right: 16, top: 20, bottom: 48 }, xAxis: { type: "time", ...axis }, yAxis: { type: "value", scale: true, ...axis },
    series: topTrend.map((trend) => ({ name: `${trend.label}${trend.unit ? ` (${trend.unit})` : ""}`, type: "line", showSymbol: false, smooth: true, data: trend.points.map((point) => [point.at, point.value]), markArea: trend.min != null && trend.max != null ? { silent: true, itemStyle: { color: "rgba(35, 155, 91, .06)" }, data: [[{ yAxis: trend.min }, { yAxis: trend.max }]] } : undefined })),
  };

  return <section className="live-history">
    <header className="live-history-header"><div><p>Production & model history</p><h2>Is the splicing process staying healthy?</h2><span>Verified outcomes are compared against the model checkpoint prediction.</span></div><div className="live-range-control" aria-label="Historical time range">{(["24h", "7d", "30d", "90d"] as HistoryRangeKey[]).map((value) => <button type="button" key={value} className={rangeKey === value ? "active" : ""} onClick={() => onRangeKey(value)}>{value}</button>)}<button type="button" className={rangeKey === "custom" ? "active" : ""} onClick={() => onRangeKey("custom")}>Custom</button></div></header>
    {rangeKey === "custom" && <div className="live-custom-range"><label>From<input type="date" value={customFrom} max={customTo} onChange={(event) => onCustomFrom(event.target.value)} /></label><span>to</span><label>To<input type="date" value={customTo} min={customFrom} onChange={(event) => onCustomTo(event.target.value)} /></label></div>}
    {history.modelAlert.active && <div className="live-model-alert" role="alert"><ShieldAlert size={22} /><div><strong>{history.modelAlert.title}</strong><p>{history.modelAlert.message} Observed accuracy is {summary.accuracy?.toFixed(1)}%{summary.accuracyDrop != null ? `, down ${summary.accuracyDrop.toFixed(1)} points from baseline` : ""}.</p></div><Link href="/digital-twin">Review model</Link></div>}
    <div className="live-kpi-strip">
      <article><span>Total tubes</span><strong>{compactNumber(summary.totalTubes)}</strong><small>completed cycles</small></article>
      <article className={summary.rejectionRate > 5 ? "bad" : ""}><span>Rejection rate</span><strong>{summary.rejectionRate.toFixed(1)}%</strong><small>{summary.rejectedTubes} rejected</small></article>
      <article className={summary.outsideRange ? "warn" : ""}><span>Outside range</span><strong>{compactNumber(summary.outsideRange)}</strong><small>cycles with violations</small></article>
      <article><span>ML predicted fail</span><strong>{compactNumber(summary.predictedFailures)}</strong><small>checkpoint predictions</small></article>
      <article className={accuracyTone}><span>Current accuracy</span><strong>{summary.accuracy == null ? "—" : `${summary.accuracy.toFixed(1)}%`}</strong><small>{summary.labelledPredictions} verified predictions</small></article>
      <article className={summary.pendingOutcomes ? "neutral" : "good"}><span>Awaiting outcome</span><strong>{compactNumber(summary.pendingOutcomes)}</strong><small>tubes to verify</small></article>
    </div>
    {!summary.totalTubes ? <div className="panel live-history-empty"><Activity size={25} /><strong>No production cycles in this range</strong><span>Choose a wider time range or confirm that this machine is sending cycle identifiers.</span></div> : <>
      <div className="live-chart-grid"><article className="panel live-chart-card wide"><header><div><p>Production & quality</p><h3>Output against actual rejects</h3></div><span>{summary.acceptedTubes} accepted</span></header><Chart option={productionOption} height={270} /></article>
      <article className="panel live-chart-card"><header><div><p>Prediction alignment</p><h3>Predicted vs actual failures</h3></div><Target size={18} /></header><Chart option={predictionOption} height={270} /></article></div>
      <div className="live-diagnostic-grid"><article className="panel live-matrix-card"><header><div><p>Prediction outcomes</p><h3>Where the model gets it right—and wrong</h3></div></header><div className="live-confusion-matrix"><div className="correct"><CheckCircle2 size={15} /><span>True positive<strong>{matrix.truePositive}</strong><small>fail predicted · failed</small></span></div><div className="false"><AlertTriangle size={15} /><span>False positive<strong>{matrix.falsePositive}</strong><small>fail predicted · good</small></span></div><div className="false"><XCircle size={15} /><span>False negative<strong>{matrix.falseNegative}</strong><small>good predicted · failed</small></span></div><div className="correct"><CheckCircle2 size={15} /><span>True negative<strong>{matrix.trueNegative}</strong><small>good predicted · good</small></span></div></div></article>
      <article className="panel live-chart-card"><header><div><p>Model stability</p><h3>Accuracy over time</h3></div><TrendingDown size={18} /></header><Chart option={accuracyOption} height={250} /></article>
      <article className="panel live-chart-card"><header><div><p>Failure diagnosis</p><h3>Top recorded failure modes</h3></div></header>{history.failureModes.length ? <Chart option={failureModeOption} height={250} /> : <div className="live-mini-empty">No failure modes recorded</div>}</article></div>
      <article className="panel live-chart-card live-parameter-card"><header><div><p>Process signals</p><h3>Parameter trends & operating bands</h3></div><span>{topTrend.length} signals shown</span></header>{topTrend.length ? <Chart option={parameterOption} height={310} /> : <div className="live-mini-empty">No numeric telemetry was recorded in this range.</div>}</article>
    </>}
  </section>;
}

export function DashboardOverview() {
  const { state, filters } = useFactory();
  const factoryId = filters.factoryId || state.activeFactoryId;
  const factory = state.factories.find((item) => item.id === factoryId);
  const [payload, setPayload] = useState<LiveDashboardPayload | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const selected = selections[factoryId] ?? null;
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(true);
  const [lastSuccess, setLastSuccess] = useState<Date | null>(null);
  const [rangeKey, setRangeKey] = useState<HistoryRangeKey>("7d");
  const today = new Date().toISOString().slice(0, 10);
  const [customFrom, setCustomFrom] = useState(() => { const date = new Date(); date.setDate(date.getDate() - 6); return date.toISOString().slice(0, 10); });
  const [customTo, setCustomTo] = useState(today);
  const historyRange = useCallback(() => {
    const end = new Date();
    if (rangeKey === "custom") {
      const from = new Date(`${customFrom}T00:00:00`);
      const to = new Date(`${customTo}T23:59:59.999`);
      if (!customFrom || !customTo || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) return null;
      return { from: from.toISOString(), to: to.toISOString() };
    }
    const durations: Record<Exclude<HistoryRangeKey, "custom">, number> = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 };
    const start = new Date(end.getTime() - durations[rangeKey] * 86_400_000);
    return { from: start.toISOString(), to: end.toISOString() };
  }, [customFrom, customTo, rangeKey]);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!factoryId) return false;
    setRefreshing(true);
    try {
      let next: LiveDashboardPayload;
      const preferred = selected || window.localStorage.getItem(`vulcan:dashboard-machine:${factoryId}`);
      try { next = await api.liveDashboard(factoryId, preferred, signal, historyRange() ?? undefined); }
      catch (cause) {
        // Retry without the selected machine only when that selection is stale.
        // Retrying every server failure doubles backend load during an outage.
        if (preferred && cause instanceof ApiError && cause.status === 404) next = await api.liveDashboard(factoryId, null, signal, historyRange() ?? undefined);
        else throw cause;
      }
      setPayload(next);
      if (next.selectedMachineId) setSelections((current) => ({ ...current, [factoryId]: next.selectedMachineId as string }));
      if (next.selectedMachineId) window.localStorage.setItem(`vulcan:dashboard-machine:${factoryId}`, next.selectedMachineId);
      setError(""); setLastSuccess(new Date()); return true;
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "Live machine data is unavailable.");
      return false;
    } finally { if (!signal?.aborted) setRefreshing(false); }
  }, [factoryId, historyRange, selected]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | null = null;
    let failures = 0;
    const poll = async () => {
      const succeeded = await load(controller.signal);
      if (controller.signal.aborted) return;
      failures = succeeded ? 0 : failures + 1;
      timer = window.setTimeout(poll, Math.min(60_000, 5_000 * 2 ** Math.min(failures, 4)));
    };
    timer = window.setTimeout(() => void poll(), 0);
    return () => { controller.abort(); if (timer !== null) window.clearTimeout(timer); };
  }, [load]);

  const unplaced = useMemo(() => payload?.machines.filter((machine) => !machine.placed).length ?? 0, [payload]);
  const current = payload?.current ?? null;
  const prediction = current?.ml.prediction;
  const abnormalCount = current?.variables.filter((item) => item.abnormal).length ?? 0;
  function chooseMachine(machineId: string) { setSelections((current) => ({ ...current, [factoryId]: machineId })); if (factoryId) window.localStorage.setItem(`vulcan:dashboard-machine:${factoryId}`, machineId); }

  return <>
    <header className="page-header live-dashboard-header"><div><p className="eyebrow"><Radio size={13} /> Live factory</p><h1>What is happening <span>right now.</span></h1><p className="page-subtitle">{factory?.name ?? "Factory"} · machine state comes directly from Lexicon inputs</p></div><div className="page-actions"><span className={`live-refresh ${error ? "has-error" : ""}`}><i />{error ? `Last good update ${relativeTime(lastSuccess?.toISOString() ?? null)}` : `Updated ${relativeTime(payload?.generatedAt ?? null)}`}</span><button className="button button-secondary" disabled={refreshing} onClick={() => void load()}><RefreshCw className={refreshing ? "spin" : ""} size={14} /> Refresh</button><Link href="/digital-twin" className="button button-primary"><Workflow size={14} /> Open Lexicon</Link></div></header>
    {error && <div className="live-error" role="alert"><Unplug size={15} /><span>{error} The last successful machine state remains visible.</span></div>}
    {!payload && <section className="panel live-empty-state"><RefreshCw className="spin" size={30} /><h2>Connecting to live machines</h2></section>}
    {payload && !payload.machines.length && <EmptyDashboard layoutExists={payload.layoutExists} />}
    {payload && payload.machines.length > 0 && <div className="live-dashboard-layout">
      <aside className="panel live-machine-rail"><header><div><span>Machines</span><strong>{payload.machines.length}</strong></div><small>Attention first</small></header><div className="live-machine-list">{payload.machines.map((machine) => <button key={machine.id} className={machine.id === selected ? "active" : ""} onClick={() => chooseMachine(machine.id)}><i className={`live-state-dot state-${machine.state}`} /><span><strong>{machine.name}</strong><small>{machine.process?.name ?? "Process not assigned"} · {machine.code}</small></span><em>{relativeTime(machine.lastObservedAt)}</em></button>)}</div>{unplaced > 0 && <Link className="live-unplaced" href="/digital-twin"><MapPinOff size={15} /><span><strong>{unplaced} unplaced</strong><small>Position in Lexicon</small></span><ArrowRight size={13} /></Link>}</aside>
      {current && <main className="live-machine-workspace">
        <section className={`panel live-machine-hero state-border-${current.state}`}><div className="live-machine-title"><div><span className={`live-state-pill state-${current.state}`}><i />{labels[current.state]}</span><p>{[current.line?.name, current.process?.name, current.code].filter(Boolean).join(" · ")}</p><h2>{current.name}</h2></div><Link href="/digital-twin" className="button button-secondary"><Settings2 size={13} /> Configure</Link></div><p className="live-activity-sentence">{activitySentence(current)}</p><div className="live-context-grid"><div><Clock3 size={16} /><span>Last observation<strong>{relativeTime(current.observedAt)}</strong></span></div><div><Activity size={16} /><span>Cycle<strong>{current.activity.cycleNumber ?? (current.activity.cycleId || "Not reported")}</strong></span></div><div><Workflow size={16} /><span>Phase<strong>{current.activity.phase?.replaceAll("_", " ") || "Not reported"}</strong></span></div><div><Radio size={16} /><span>Source<strong>{current.stream ? `${current.stream.name} · ${current.stream.channel}` : current.source === "manual" ? "Manual / QR entry" : "Not connected"}</strong></span></div></div></section>
        {!current.stream && <div className="live-callout"><Unplug size={17} /><div><strong>No live stream is connected</strong><p>Current values can still come from QR observations. Connect a channel in Lexicon for continuous monitoring.</p></div><Link href="/digital-twin">Connect stream</Link></div>}
        <div className="live-overview-grid"><section className="panel live-values-panel"><header><div><p>Current readings</p><h3>{abnormalCount ? `${abnormalCount} variable${abnormalCount === 1 ? "" : "s"} need attention` : "Key operating variables"}</h3></div><Gauge size={19} /></header>{current.highlightedVariables.length ? <div className="live-variable-grid">{current.highlightedVariables.map((variable) => <article className={variable.abnormal ? "abnormal" : ""} key={variable.key}><span>{variable.abnormal && <AlertTriangle size={13} />}{variable.label}</span><strong>{displayValue(variable)} {variable.unit && <small>{variable.unit}</small>}</strong><em>{variable.semantic.replaceAll("_", " ")}</em></article>)}</div> : <div className="live-inline-empty">Waiting for parameter values from this machine.</div>}{current.variables.length > current.highlightedVariables.length && <details className="live-all-readings"><summary>All readings ({current.variables.length})</summary><div>{current.variables.map((variable) => <p key={variable.key}><span>{variable.label}</span><strong>{displayValue(variable)} {variable.unit}</strong></p>)}</div></details>}</section>
          <section className="panel live-ml-panel"><header><div><p>Machine intelligence</p><h3>{!current.ml.enabled ? "ML observation is off" : current.ml.active ? "Active model" : "Waiting for an external model"}</h3></div><BrainCircuit size={20} /></header>{!current.ml.enabled ? <div className="live-inline-empty">Enable observation for this machine to score completed cycles.</div> : <><div className={`live-prediction ${prediction?.label === "failure" ? "failure" : ""}`}><span>Latest prediction</span><strong>{prediction?.label ? prediction.label.replaceAll("_", " ") : "Waiting for prediction"}</strong>{prediction?.failureProbability !== null && prediction?.failureProbability !== undefined && <small>{(prediction.failureProbability * 100).toFixed(1)}% failure probability</small>}</div><div className="live-ml-facts"><p><span>Cycle health</span><strong>{current.ml.health === null ? "—" : `${current.ml.health.toFixed(1)}%`}</strong></p><p><span>Range checks</span><strong>{abnormalCount ? `${abnormalCount} outside range` : "All okay"}</strong></p></div></>}<Link className="button button-secondary" href={`/digital-twin/ml/${current.id}`}>Open ML workspace <ArrowRight size={12} /></Link></section>
        </div>
        <HistoricalPerformance history={current.history} rangeKey={rangeKey} onRangeKey={setRangeKey} customFrom={customFrom} customTo={customTo} onCustomFrom={setCustomFrom} onCustomTo={setCustomTo} />
      </main>}
    </div>}
  </>;
}

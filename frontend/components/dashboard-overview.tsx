"use client";

import { Activity, AlertTriangle, ArrowRight, BrainCircuit, Clock3, Factory, Gauge, MapPinOff, Radio, RefreshCw, Settings2, Unplug, Workflow } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import type { LiveDashboardPayload, LiveMachineState, LiveVariable } from "@/lib/factory-domain";
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

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!factoryId) return;
    setRefreshing(true);
    try {
      let next: LiveDashboardPayload;
      const preferred = selected || window.localStorage.getItem(`vulcan:dashboard-machine:${factoryId}`);
      try { next = await api.liveDashboard(factoryId, preferred, signal); }
      catch (cause) { if (preferred) next = await api.liveDashboard(factoryId, null, signal); else throw cause; }
      setPayload(next);
      if (next.selectedMachineId) setSelections((current) => ({ ...current, [factoryId]: next.selectedMachineId as string }));
      if (next.selectedMachineId) window.localStorage.setItem(`vulcan:dashboard-machine:${factoryId}`, next.selectedMachineId);
      setError(""); setLastSuccess(new Date());
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "Live machine data is unavailable.");
    } finally { if (!signal?.aborted) setRefreshing(false); }
  }, [factoryId, selected]);

  useEffect(() => {
    const controller = new AbortController();
    const initial = window.setTimeout(() => void load(controller.signal), 0);
    const poller = window.setInterval(() => void load(controller.signal), 5000);
    return () => { controller.abort(); window.clearTimeout(initial); window.clearInterval(poller); };
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
      </main>}
    </div>}
  </>;
}

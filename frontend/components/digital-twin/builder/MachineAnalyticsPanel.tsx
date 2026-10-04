"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { X, Activity, BarChart3, BrainCircuit, ChevronDown, Clock, ImagePlus, LayoutDashboard, Maximize2, Radio, SlidersHorizontal } from "lucide-react";
import { api, getCsrfToken } from "@/lib/api-client";
import type { MachineCycleHistory, MachineCycleOutcome } from "@/lib/data-stream-types";
import type { MachineImageAsset, MachineNode, MachineStatus } from "@/lib/spatial-types";
import type { IntelligenceAlert, LiveMachineCurrent, LiveMachineSummary } from "@/lib/factory-domain";
import { machinePredictionPresentation } from "@/lib/machine-card";
import { QrCodePreview } from "./QrCodePreview";
import { MachineHealthyRanges, MachineML } from "@/components/machine-ml";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MachineAnalyticsPanelProps {
  machineId: string;
  machines: MachineNode[];
  onClose: () => void;
  liveMachine?: LiveMachineSummary;
  liveCurrent?: LiveMachineCurrent | null;
}

type DetailTab = "overview" | "telemetry" | "ranges" | "ml";

interface ObservationRow {
  values: Record<string, unknown>;
  submitted_at: string;
  observed_at?: string;
  submitted_by?: string | null;
  run_id?: string;
  cycle_id?: string;
  outcome?: MachineCycleOutcome | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<MachineStatus, { bg: string; text: string; label: string }> = {
  running: { bg: "bg-green-100", text: "text-green-800", label: "Running" },
  warning: { bg: "bg-amber-100", text: "text-amber-800", label: "Warning" },
  down: { bg: "bg-red-100", text: "text-red-800", label: "Down" },
  idle: { bg: "bg-gray-100", text: "text-gray-700", label: "Idle" },
  no_data: { bg: "bg-gray-50", text: "text-gray-500", label: "No Data" },
};

const API_SPATIAL = "/api/backend/api/spatial";

// ---------------------------------------------------------------------------
// MachineAnalyticsPanel
// ---------------------------------------------------------------------------

/**
 * Analytics slide-over panel for a selected machine in view mode.
 *
 * Displays:
 * - Machine header (name, status, position, size)
 * - Parameters summary
 * - Custom KPIs with latest computed values
 * - Recent observation history (fetched from API)
 *
 * This is a standalone component designed to be extended with charts,
 * trend graphs, and additional analytics in the future.
 */
export function MachineAnalyticsPanel({
  machineId,
  machines,
  onClose,
  liveMachine,
  liveCurrent,
}: MachineAnalyticsPanelProps) {
  const machine = machines.find((m) => m.id === machineId);
  const [observations, setObservations] = useState<ObservationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [savingOutcome, setSavingOutcome] = useState("");
  const [outcomeError, setOutcomeError] = useState("");
  const [alerts, setAlerts] = useState<IntelligenceAlert[]>([]);
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [rangesLoaded, setRangesLoaded] = useState(false);
  const [imageAsset, setImageAsset] = useState<MachineImageAsset | null>(machine?.imageAsset ?? null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const telemetryLoadedRef = useRef(false);

  async function updateOutcome(
    outcome: MachineCycleOutcome,
    label: "good" | "failure",
  ): Promise<MachineCycleOutcome | null> {
    setSavingOutcome(outcome.id);
    setOutcomeError("");
    try {
      const updated = await api.updateMachineCycleOutcome(machineId, outcome.id, label);
      setObservations((current) =>
        current.map((row) =>
          row.run_id === updated.run_id && row.cycle_id === updated.cycle_id
            ? { ...row, outcome: updated }
            : row,
        ),
      );
      return updated;
    } catch (cause) {
      setOutcomeError(cause instanceof Error ? cause.message : "Could not update the result.");
      return null;
    } finally {
      setSavingOutcome("");
    }
  }

  // Fetch recent observations for this machine
  useEffect(() => {
    if (activeTab !== "telemetry" || telemetryLoadedRef.current) return;
    telemetryLoadedRef.current = true;
    let cancelled = false;

    async function fetchObservations() {
      setLoading(true);
      try {
        let response = await fetch(
          `/api/backend/api/data-streams/machines/${machineId}/telemetry/?limit=50`,
          {
            headers: { Accept: "application/json" },
            credentials: "same-origin",
          }
        );
        if (!response.ok) {
          setObservations([]);
          return;
        }
        let data = await response.json();
        let results = Array.isArray(data) ? data : data.results ?? [];
        if (results.length === 0) {
          response = await fetch(`${API_SPATIAL}/machines/${machineId}/observations/?limit=10`, { headers: { Accept: "application/json" }, credentials: "same-origin" });
          if (!response.ok) { setObservations([]); return; }
          data = await response.json();
          results = Array.isArray(data) ? data : data.results ?? [];
        }
        if (!cancelled) {
          setObservations(results.map((row: ObservationRow) => ({ ...row, submitted_at: row.observed_at ?? row.submitted_at })));
        }
      } catch {
        if (!cancelled) setObservations([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchObservations();
    return () => { cancelled = true; };
  }, [activeTab, machineId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/backend/api/alerts/?machine=${machineId}`, { headers: { Accept: "application/json" }, credentials: "same-origin" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload) => { if (!cancelled) setAlerts((Array.isArray(payload) ? payload : payload.results ?? []).filter((alert: IntelligenceAlert) => alert.status === "new" || alert.status === "acknowledged")); })
      .catch(() => { if (!cancelled) setAlerts([]); });
    return () => { cancelled = true; };
  }, [machineId]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); if (showFullHistory) setShowFullHistory(false); else onClose(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("keydown", handleKeyDown); previous?.focus(); };
  }, [onClose, showFullHistory]);

  async function uploadImage(file?: File) {
    if (!file) return;
    setImageUploading(true); setImageError("");
    try {
      const data = new FormData(); data.append("file", file);
      const response = await fetch(`/api/backend/api/spatial/machines/${machineId}/image/`, { method: "POST", headers: { "X-CSRFToken": await getCsrfToken() }, credentials: "same-origin", body: data });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.file ?? body.detail ?? "Image upload failed.");
      setImageAsset({ id: body.id, filename: body.filename, contentType: body.content_type, sizeBytes: body.size_bytes, checksumSha256: body.checksum_sha256, downloadUrl: body.download_url });
    } catch (cause) { setImageError(cause instanceof Error ? cause.message : "Image upload failed."); }
    finally { setImageUploading(false); }
  }

  if (!machine) {
    return null;
  }

  const status: MachineStatus = (liveMachine?.state === "degraded" || liveMachine?.state === "stale" ? "warning" : liveMachine?.state) ?? machine.status ?? "no_data";
  const badge = STATUS_BADGE[status];
  const latestObs = observations.length > 0 ? observations[0] : null;
  const prediction = machinePredictionPresentation(liveMachine?.currentCyclePrediction);
  const detailedPrediction = liveCurrent?.ml.prediction;

  // Evaluate custom KPIs against latest observation
  const kpiValues: Array<{ name: string; unit: string; value: string }> = [];
  const latestValues = latestObs?.values ?? Object.fromEntries((liveCurrent?.variables ?? []).map((item) => [item.key, item.value]));
  if (machine.customKpis && Object.keys(latestValues).length) {
    for (const kpi of machine.customKpis) {
      const value = evaluateSimpleKpi(kpi.formula, latestValues);
      kpiValues.push({ name: kpi.name, unit: kpi.displayUnit, value });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-3 backdrop-blur-[1px] sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="flex h-[min(760px,88vh)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label={`Details for ${machine.name}`}>
      <div className="flex items-start justify-between border-b border-gray-200 bg-white px-5 py-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-gray-900 truncate">
            {machine.name}
          </h2>
          <div className="flex items-center gap-2 mt-1.5">
            <span
              className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${badge.bg} ${badge.text}`}
            >
              {badge.label}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${prediction.tone === "defect" ? "bg-red-100 text-red-700" : prediction.tone === "good" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{prediction.label}</span>
          </div>
        </div>
        <div className="ml-3 flex items-center gap-2"><a className="button button-secondary inline-flex" href={`/data?tab=streams&machine=${encodeURIComponent(machine.id)}`}>Data entry</a><button
          ref={closeRef}
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close machine details"
        >
          <X size={18} />
        </button></div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 p-2 sm:w-48 sm:flex-col sm:border-b-0 sm:border-r" aria-label="Machine detail sections">
          {([["overview", LayoutDashboard, "Overview"], ["telemetry", Radio, "Telemetry"], ["ranges", SlidersHorizontal, "Healthy ranges"], ["ml", BrainCircuit, "Machine Learning"]] as const).map(([tab, Icon, label]) => <button key={tab} type="button" onClick={() => { setActiveTab(tab); if (tab === "ranges") setRangesLoaded(true); }} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${activeTab === tab ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:bg-white/70"}`}><Icon size={16} />{label}</button>)}
        </nav>
        <div className="min-w-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {activeTab === "overview" && <>
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Current state</p><p className="mt-1 text-sm font-semibold text-slate-900">{badge.label}</p></div>
            <div className={`rounded-xl border p-3 ${prediction.tone === "defect" ? "border-red-200 bg-red-50" : prediction.tone === "good" ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Current cycle prediction</p><p className="mt-1 text-sm font-semibold text-slate-900">{prediction.label}{detailedPrediction?.failureProbability != null ? ` · ${(detailedPrediction.failureProbability * 100).toFixed(1)}% risk` : ""}</p></div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Production</p><p className="mt-1 truncate text-sm font-semibold text-slate-900">{liveMachine?.process?.name ?? "Not assigned"}</p><p className="text-xs text-slate-500">{liveMachine?.line?.name ?? "No line"}</p></div>
          </section>
          {liveCurrent?.activity.cycleId && <section className="rounded-xl border border-slate-200 p-3"><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current cycle</h3><p className="mt-1 text-sm text-slate-800">{liveCurrent.activity.cycleNumber != null ? `Cycle #${liveCurrent.activity.cycleNumber}` : liveCurrent.activity.cycleId} · <span className="capitalize">{liveCurrent.activity.phase || "In progress"}</span></p></section>}
        {!!liveMachine?.attentionReasons.length && <section className="rounded-xl border border-amber-200 bg-amber-50 p-3"><h3 className="text-xs font-semibold uppercase tracking-wide text-amber-900">Needs attention</h3>{liveMachine.attentionReasons.map((reason) => <p key={reason} className="mt-1 text-sm text-amber-800">{reason}</p>)}</section>}
        {alerts.length > 0 && <section><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Active alerts ({alerts.length})</h3><div className="space-y-2">{alerts.map((alert) => <article key={alert.id} className="rounded-xl border border-red-100 bg-red-50/60 p-3"><div className="flex items-center justify-between gap-3"><strong className="text-sm text-slate-900">{alert.title}</strong><span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-red-700">{alert.severity}</span></div><p className="mt-1 text-xs text-slate-600">{alert.description}</p><p className="mt-2 text-xs font-medium text-slate-800">{alert.observed} · threshold {alert.threshold}</p></article>)}</div></section>}
          {imageAsset && <div role="img" aria-label={machine.name} className="h-36 w-full rounded-xl border border-slate-200 bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(imageAsset.downloadUrl)})` }} />}
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900"><ImagePlus size={14} />{imageUploading ? "Uploading…" : imageAsset ? "Replace machine image" : "Attach machine image"}<input className="hidden" type="file" accept="image/png,image/jpeg,image/webp" disabled={imageUploading} onChange={(event) => void uploadImage(event.target.files?.[0])} /></label>
          {imageError && <p className="text-xs text-red-600">{imageError}</p>}
        </>}
        {activeTab === "ml" && <>
          <section className={`rounded-2xl border p-5 ${prediction.tone === "defect" ? "border-red-200 bg-red-50" : prediction.tone === "good" ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Current cycle prediction</p><div className="mt-2 flex flex-wrap items-end justify-between gap-3"><strong className="text-3xl text-slate-950">{prediction.label}</strong>{detailedPrediction?.failureProbability != null && <span className="text-sm font-semibold text-slate-700">{(detailedPrediction.failureProbability * 100).toFixed(1)}% defect risk</span>}</div>{detailedPrediction && <p className="mt-2 text-xs text-slate-500">Threshold {detailedPrediction.threshold == null ? "—" : `${(detailedPrediction.threshold * 100).toFixed(1)}%`} · predicted {new Date(detailedPrediction.observedAt).toLocaleString()}</p>}</section>
          <MachineML machineId={machineId} embedded />
        </>}
        {rangesLoaded && <div className={activeTab === "ranges" ? "block" : "hidden"}><MachineHealthyRanges machineId={machineId} /></div>}
        {activeTab === "telemetry" && <>
        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Telemetry source</p><p className="mt-1 text-sm font-semibold text-slate-900">{liveCurrent?.stream?.name ?? (liveCurrent?.source === "manual" ? "Manual observation" : "No stream connected")}</p>{liveCurrent?.stream && <p className="text-xs text-slate-500">{liveCurrent.stream.channel} · {liveCurrent.stream.status}</p>}</div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Latest reading</p><p className="mt-1 text-sm font-semibold text-slate-900">{liveCurrent?.observedAt ? new Date(liveCurrent.observedAt).toLocaleString() : "No readings received"}</p></div>
        </section>
        {!!liveCurrent?.variables.length && <section><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Live parameters</h3><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{liveCurrent.variables.map((item) => <div key={item.key} className={`rounded-lg border px-3 py-2 ${item.abnormal ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}><p className="truncate text-xs text-slate-500">{item.label}</p><p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{item.value == null || item.value === "" ? "—" : String(item.value)}{item.unit ? ` ${item.unit}` : ""}</p></div>)}</div></section>}
        {/* Parameters with last 3 history entries */}
        {machine.parameters.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <BarChart3 size={14} className="text-gray-400" />
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Parameters ({machine.parameters.length})
                </h3>
              </div>
              {observations.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowFullHistory(true)}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                >
                  <Maximize2 size={12} />
                  Full History
                </button>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-4">
                <span className="text-xs text-gray-400">Loading...</span>
              </div>
            ) : observations.length === 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {machine.parameters.map((param) => (
                  <div
                    key={param.id}
                    className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2"
                  >
                    <p className="text-xs text-gray-500 truncate">{param.key}</p>
                    <p className="text-sm font-medium text-gray-900 mt-0.5">{"\u2014"}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border border-gray-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-2 py-1.5 font-semibold text-gray-600 sticky left-0 bg-gray-50 min-w-[100px]">
                        Parameter
                      </th>
                      {observations.slice(0, 3).map((obs, idx) => (
                        <th key={idx} className="text-center px-2 py-1.5 font-medium text-gray-400 whitespace-nowrap min-w-[70px]">
                          {obs.submitted_at
                            ? new Date(obs.submitted_at).toLocaleString(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : `#${idx + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {machine.parameters.map((param, pIdx) => (
                      <tr
                        key={param.id}
                        className={pIdx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
                      >
                        <td className="px-2 py-1.5 font-medium text-gray-700 truncate max-w-[120px] sticky left-0 bg-inherit border-r border-gray-100">
                          {param.key}
                        </td>
                        {observations.slice(0, 3).map((obs, oIdx) => {
                          const val = obs.values[param.key];
                          return (
                            <td
                              key={oIdx}
                              className={`text-center px-2 py-1.5 font-mono ${
                                oIdx === 0
                                  ? "text-gray-900 font-semibold"
                                  : "text-gray-600"
                              }`}
                            >
                              {val !== undefined && val !== null
                                ? String(val)
                                : "\u2014"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Full History button when no parameters but inputs/outputs exist */}
        {machine.parameters.length === 0 && (machine.inputs.length > 0 || machine.outputs.length > 0) && observations.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Clock size={14} className="text-gray-400" />
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  I/O History
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFullHistory(true)}
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                <Maximize2 size={12} />
                Full History
              </button>
            </div>
            <p className="text-xs text-gray-400">
              {machine.inputs.length} input{machine.inputs.length !== 1 ? "s" : ""}
              {" \u00b7 "}
              {machine.outputs.length} output{machine.outputs.length !== 1 ? "s" : ""}
              {" \u00b7 "}
              {observations.length} observation{observations.length !== 1 ? "s" : ""} recorded
            </p>
          </section>
        )}
        </>}

        {/* Custom KPIs */}
        {activeTab === "overview" && kpiValues.length > 0 && (
          <section>
            <div className="flex items-center gap-1.5 mb-2">
              <Activity size={14} className="text-gray-400" />
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                KPIs
              </h3>
            </div>
            <div className="space-y-2">
              {kpiValues.map((kpi) => (
                <div
                  key={kpi.name}
                  className="flex items-center justify-between rounded-md border border-gray-100 bg-gray-50 px-3 py-2"
                >
                  <span className="text-xs text-gray-600">{kpi.name}</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {kpi.value} <span className="text-xs font-normal text-gray-400">{kpi.unit}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Machine QR Code – Download & Print */}
        {activeTab === "overview" && <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Machine QR Code
          </h3>
          <QrCodePreview
            machineId={machine.id}
            machineName={machine.name}
          />
        </section>}

      </div>
      </div>

      {/* Full History Sheet (overlay) */}
      {showFullHistory && (
        <FullHistorySheet
          machine={machine}
          savingOutcome={savingOutcome}
          outcomeError={outcomeError}
          onUpdateOutcome={updateOutcome}
          onClose={() => setShowFullHistory(false)}
        />
      )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full History Sheet – snapshot view with parameters + inputs/outputs
// ---------------------------------------------------------------------------

interface FullHistorySheetProps {
  machine: MachineNode;
  savingOutcome: string;
  outcomeError: string;
  onUpdateOutcome: (
    outcome: MachineCycleOutcome,
    label: "good" | "failure",
  ) => Promise<MachineCycleOutcome | null>;
  onClose: () => void;
}

function FullHistorySheet({
  machine,
  savingOutcome,
  outcomeError,
  onUpdateOutcome,
  onClose,
}: FullHistorySheetProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  const [cycles, setCycles] = useState<MachineCycleHistory[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [expandedCycles, setExpandedCycles] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    api.listMachineCycles(machine.id)
      .then((page) => {
        if (cancelled) return;
        setCycles(page.results);
        setNextCursor(page.next_cursor);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setHistoryError(cause instanceof Error ? cause.message : "Could not load cycle history.");
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => { cancelled = true; };
  }, [machine.id]);

  async function loadOlderCycles() {
    if (!nextCursor || historyLoading) return;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const page = await api.listMachineCycles(machine.id, nextCursor);
      setCycles((current) => {
        const existing = new Set(current.map((cycle) => `${cycle.run_id}:${cycle.cycle_id}`));
        return [
          ...current,
          ...page.results.filter((cycle) => !existing.has(`${cycle.run_id}:${cycle.cycle_id}`)),
        ];
      });
      setNextCursor(page.next_cursor);
    } catch (cause) {
      setHistoryError(cause instanceof Error ? cause.message : "Could not load older cycles.");
    } finally {
      setHistoryLoading(false);
    }
  }

  function toggleCycle(key: string) {
    setExpandedCycles((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function changeCycleOutcome(
    cycle: MachineCycleHistory,
    label: "good" | "failure",
  ) {
    if (!cycle.outcome) return;
    const updated = await onUpdateOutcome(cycle.outcome, label);
    if (!updated) return;
    setCycles((current) =>
      current.map((item) =>
        item.run_id === cycle.run_id && item.cycle_id === cycle.cycle_id
          ? { ...item, outcome: updated }
          : item,
      ),
    );
  }

  // Build columns: parameters + inputs + outputs
  const paramCols = machine.parameters.map((p) => ({ key: p.key, label: p.key, type: "Parameter" as const }));
  const inputCols = machine.inputs.map((io) => ({ key: `input_${io.id}`, label: `${io.label} (${io.unitType})`, type: "Input" as const }));
  const outputCols = machine.outputs.map((io) => ({ key: `output_${io.id}`, label: `${io.label} (${io.unitType})`, type: "Output" as const }));
  const allCols = [...paramCols, ...inputCols, ...outputCols];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={`Full history for ${machine.name}`}
    >
      <div
        className="relative w-[95vw] max-w-6xl h-[85vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sheet Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              {machine.name} — Full History
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {cycles.length} cycle{cycles.length !== 1 ? "s" : ""} loaded · {paramCols.length} parameters · expand a cycle for its samples
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors"
            aria-label="Close history sheet"
          >
            <X size={18} />
          </button>
        </div>

        {/* Cycle rows with complete, expandable sample details */}
        <div className="flex-1 overflow-auto">
          {historyLoading && cycles.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">
              Loading cycle history…
            </div>
          ) : cycles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center h-full">
              <p className="text-sm text-gray-400">No machine cycles recorded yet.</p>
            </div>
          ) : (
            <table className="text-xs border-collapse min-w-full">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-100 border-b border-gray-200">
                  <th className="w-10 px-3 py-2" />
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Cycle</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Time</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Recipe</th>
                  <th className="px-3 py-2 text-center font-semibold text-gray-700">Samples</th>
                  <th className="min-w-[130px] px-3 py-2 text-center font-semibold text-gray-700">Splice result</th>
                </tr>
              </thead>
              <tbody>
                {cycles.map((cycle, rowIdx) => {
                  const key = `${cycle.run_id}:${cycle.cycle_id}`;
                  const expanded = expandedCycles.has(key);
                  return (
                    <Fragment key={key}>
                      <tr className={`${rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50/60"} hover:bg-blue-50/40`}>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            className="rounded p-1 text-gray-500 hover:bg-gray-200"
                            aria-label={`${expanded ? "Collapse" : "Expand"} cycle ${cycle.cycle_number ?? cycle.cycle_id}`}
                            aria-expanded={expanded}
                            onClick={() => toggleCycle(key)}
                          >
                            <ChevronDown size={14} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
                          </button>
                        </td>
                        <td className="px-3 py-2 font-semibold text-gray-800">#{cycle.cycle_number ?? "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-gray-600">{new Date(cycle.started_at).toLocaleString()}</td>
                        <td className="px-3 py-2 text-gray-600">{cycle.ml?.profile?.sku_name ?? cycle.recipe_id ?? "—"}
                          {cycle.ml?.health != null && <small className={`block ${cycle.ml.health >= 90 ? "text-green-700" : cycle.ml.health >= 70 ? "text-amber-700" : "text-red-700"}`}>Health {cycle.ml.health.toFixed(1)}%</small>}
                          {cycle.ml?.checkpoint_prediction && <small className="block">Predicted {cycle.ml.checkpoint_prediction.label} · {(100 * cycle.ml.checkpoint_prediction.failure_probability).toFixed(1)}% failure {cycle.ml.correct == null ? "" : cycle.ml.correct ? "· Correct" : "· Incorrect"}</small>}
                        </td>
                        <td className="px-3 py-2 text-center font-mono text-gray-700">{cycle.sample_count}</td>
                        <td className="px-3 py-2 text-center">
                          {cycle.outcome ? (
                            <div>
                            <select
                              aria-label={`Splice result for cycle ${cycle.cycle_number ?? cycle.cycle_id}`}
                              className={`rounded border px-2 py-1 text-xs font-semibold ${cycle.outcome.effective_label === "failure" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
                              disabled={savingOutcome === cycle.outcome.id}
                              title={cycle.outcome.overridden_at ? `Human verified by ${cycle.outcome.overridden_by_name ?? "operator"}` : `Source label: ${cycle.outcome.source_label}`}
                              value={cycle.outcome.effective_label}
                              onChange={(event) => void changeCycleOutcome(cycle, event.target.value as "good" | "failure")}
                            >
                              <option value="good">Good</option>
                              <option value="failure">Failure</option>
                            </select>
                            <small className="mt-1 block text-gray-500">
                              {cycle.outcome.overridden_at
                                ? `Human verified · ${cycle.outcome.overridden_by_name ?? "operator"}`
                                : `Source label · ${cycle.outcome.source_label}`}
                            </small>
                            </div>
                          ) : (
                            <span className="text-gray-400">Pending</span>
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={6} className="border-y border-blue-100 bg-blue-50/30 p-3">
                            <div className="overflow-x-auto rounded border border-gray-200 bg-white">
                              <table className="min-w-full border-collapse text-[11px]">
                                <thead><tr className="bg-gray-50">
                                  <th className="whitespace-nowrap px-2 py-1.5 text-left">Timestamp</th>
                                  <th className="px-2 py-1.5 text-left">Phase</th>
                                  <th className="px-2 py-1.5">Failure probability</th>
                                  {allCols.map((col) => <th key={col.key} className="whitespace-nowrap px-2 py-1.5 text-center">{col.label}</th>)}
                                </tr></thead>
                                <tbody>
                                  {cycle.samples.map((sample) => <tr key={sample.id} className="border-t border-gray-100">
                                    <td className="whitespace-nowrap px-2 py-1.5 text-gray-600">{new Date(sample.observed_at).toLocaleString()}</td>
                                    <td className="px-2 py-1.5 font-medium text-gray-700">{sample.cycle_phase}</td>
                                    <td className="px-2 py-1.5">{sample.ml?.prediction ? `${(100 * sample.ml.prediction.failure_probability).toFixed(1)}%` : "—"}</td>
                                    {allCols.map((col) => <td key={col.key} className={`px-2 py-1.5 text-center font-mono ${sample.ml?.violations[col.key] ? "bg-red-100 text-red-800" : "text-gray-800"}`}>{sample.values[col.key] == null ? "—" : String(sample.values[col.key])}</td>)}
                                  </tr>)}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
          {nextCursor && (
            <div className="flex justify-center border-t border-gray-100 p-4">
              <button type="button" className="button button-secondary" disabled={historyLoading} onClick={() => void loadOlderCycles()}>
                {historyLoading ? "Loading…" : "Load older cycles"}
              </button>
            </div>
          )}
        </div>

        {/* Sheet Footer */}
        <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-6 py-3 flex items-center justify-end">
          {(outcomeError || historyError) && <p className="mr-auto text-xs text-red-600">{outcomeError || historyError}</p>}
          <button
            onClick={onClose}
            className="rounded-md bg-gray-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-gray-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Simple KPI evaluator (reused logic from MachineDetailPanel)
// ---------------------------------------------------------------------------

function evaluateSimpleKpi(
  formula: { operations: Array<{ operator: string; parameterKey: string }> },
  values: Record<string, unknown>
): string {
  const { operations } = formula;
  if (!operations || operations.length === 0) return "N/A";

  const firstVal = values[operations[0].parameterKey];
  if (firstVal === undefined || firstVal === null) return "N/A";
  const firstNum = Number(firstVal);
  if (!Number.isFinite(firstNum)) return "N/A";

  if (operations.length === 1) return firstNum.toFixed(2);

  let result = firstNum;
  for (let i = 1; i < operations.length; i++) {
    const op = operations[i];
    const val = values[op.parameterKey];
    if (val === undefined || val === null) return "N/A";
    const num = Number(val);
    if (!Number.isFinite(num)) return "N/A";

    switch (op.operator) {
      case "add": result += num; break;
      case "subtract": result -= num; break;
      case "multiply": result *= num; break;
      case "divide":
        if (num === 0) return "N/A";
        result /= num;
        break;
      default: return "N/A";
    }
  }

  return Number.isFinite(result) ? result.toFixed(2) : "N/A";
}

export default MachineAnalyticsPanel;

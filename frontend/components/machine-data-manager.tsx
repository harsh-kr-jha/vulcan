"use client";

import {
  CalendarRange,
  CheckSquare2,
  CircleAlert,
  Database,
  Download,
  Eye,
  LoaderCircle,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api-client";
import type {
  MachineDataPreview,
  MachineDataScope,
  MachineDataSummary,
  ManagedCycle,
} from "@/lib/data-management-types";
import { useFactory } from "@/lib/factory-context";

type Granularity = "cycle" | "run" | "date_range" | "machine";

function cycleKey(cycle: ManagedCycle) {
  return `${cycle.run_id}\u0000${cycle.cycle_id}`;
}

function localToIso(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}

function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

export function MachineDataManager() {
  const { state } = useFactory();
  const factoryId = state.activeFactoryId;
  const [summary, setSummary] = useState<MachineDataSummary | null>(null);
  const [machineId, setMachineId] = useState("");
  const [granularity, setGranularity] = useState<Granularity>("cycle");
  const [runId, setRunId] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedCycles, setSelectedCycles] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<MachineDataPreview | null>(null);
  const [confirmScope, setConfirmScope] = useState<MachineDataScope | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (requestedMachine = machineId) => {
    if (!factoryId) return;
    setBusy("load");
    setError("");
    try {
      const result = await api.machineDataSummary(factoryId, requestedMachine || undefined);
      setSummary(result);
      const selected = result.selectedMachineId ?? "";
      setMachineId(selected);
      setSelectedCycles(new Set());
      const firstCycle = result.cycles[0];
      setRunId(firstCycle?.run_id ?? "");
      setCycleId(firstCycle?.cycle_id ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Machine data could not be loaded.");
    } finally {
      setBusy("");
    }
  }, [factoryId, machineId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(""), 0);
    return () => window.clearTimeout(timer);
    // Loading is intentionally reset only when the factory changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factoryId]);

  const runs = useMemo(
    () => Array.from(new Set((summary?.cycles ?? []).map((cycle) => cycle.run_id))).filter(Boolean),
    [summary],
  );
  const visibleCycles = useMemo(
    () => (runId ? summary?.cycles.filter((cycle) => cycle.run_id === runId) ?? [] : summary?.cycles ?? []),
    [runId, summary],
  );
  const selectedMachine = summary?.machines.find((machine) => machine.id === machineId);

  function currentScope(): MachineDataScope | null {
    if (granularity === "machine") return { scope: "machine" };
    if (granularity === "date_range") {
      if (!from && !to) return null;
      return { scope: "date_range", from: localToIso(from), to: localToIso(to) };
    }
    if (granularity === "run") return runId ? { scope: "run", run_id: runId } : null;
    if (!runId || !cycleId) return null;
    return { scope: "cycle", run_id: runId, cycle_id: cycleId };
  }

  function selectedCycleScope(): MachineDataScope | null {
    const cycles = (summary?.cycles ?? [])
      .filter((cycle) => selectedCycles.has(cycleKey(cycle)))
      .map((cycle) => ({ run_id: cycle.run_id, cycle_id: cycle.cycle_id }));
    return cycles.length ? { scope: "cycles", cycles } : null;
  }

  async function openPreview(scope = currentScope()) {
    if (!factoryId || !machineId || !scope) return;
    setBusy("preview");
    setError("");
    try {
      setPreview(await api.previewMachineData(factoryId, machineId, scope));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The selected data could not be previewed.");
    } finally {
      setBusy("");
    }
  }

  async function exportData() {
    const scope = currentScope();
    if (!factoryId || !machineId || !scope) return;
    setBusy("export");
    setError("");
    try {
      const result = await api.exportMachineData(factoryId, machineId, scope);
      downloadBlob(result.blob, result.filename);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The Excel export could not be created.");
    } finally {
      setBusy("");
    }
  }

  async function deleteData() {
    if (!factoryId || !machineId || !confirmScope) return;
    setBusy("delete");
    setError("");
    try {
      await api.deleteMachineData(factoryId, machineId, confirmScope);
      setConfirmScope(null);
      setPreview(null);
      await load(machineId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The selected machine data could not be deleted.");
    } finally {
      setBusy("");
    }
  }

  function toggleCycle(cycle: ManagedCycle) {
    const key = cycleKey(cycle);
    setSelectedCycles((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <section className="space-y-4">
      {error && <div className="wizard-error" role="alert"><CircleAlert size={16} /><span>{error}</span><button className="icon-button" onClick={() => setError("")} aria-label="Dismiss"><X size={13} /></button></div>}

      <div className="data-foundation-strip">
        <div><span>Machines with history</span><strong>{summary?.totals.machines ?? 0}</strong></div>
        <div><span>Telemetry readings</span><strong>{(summary?.totals.samples ?? 0).toLocaleString("en-IN")}</strong></div>
        <div><span>Recorded cycles</span><strong>{(summary?.totals.cycles ?? 0).toLocaleString("en-IN")}</strong></div>
        <div><span>Retention</span><strong>Factory scoped</strong></div>
      </div>

      <section className="panel p-5">
        <div className="uploads-toolbar">
          <div><h2 className="panel-title">Machine data management</h2><p className="panel-subtitle">Preview, export, or remove telemetry at cycle, run, date-range, or whole-machine level.</p></div>
          <button className="button button-secondary" disabled={busy === "load"} onClick={() => void load(machineId)}><RefreshCw className={busy === "load" ? "animate-spin" : ""} size={13} /> Refresh</button>
        </div>

        {!summary?.machines.length ? <div className="empty-state">No Lexicon machines are available for this factory.</div> : <>
          <div className="grid gap-3 border-t border-gray-200 py-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs font-medium text-gray-600">Machine<select className="builder-dialog-input mt-1" value={machineId} onChange={(event) => void load(event.target.value)}>{summary.machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name} · {machine.code || "No code"} · {machine.sampleCount} readings</option>)}</select></label>
            <label className="text-xs font-medium text-gray-600">Management level<select className="builder-dialog-input mt-1" value={granularity} onChange={(event) => setGranularity(event.target.value as Granularity)}><option value="cycle">Single cycle</option><option value="run">Production run</option><option value="date_range">Date range</option><option value="machine">All machine data</option></select></label>
            {(granularity === "cycle" || granularity === "run") && <label className="text-xs font-medium text-gray-600">Run<select className="builder-dialog-input mt-1" value={runId} onChange={(event) => { setRunId(event.target.value); setCycleId(summary.cycles.find((cycle) => cycle.run_id === event.target.value)?.cycle_id ?? ""); }}><option value="">Choose run</option>{runs.map((run) => <option key={run} value={run}>{run}</option>)}</select></label>}
            {granularity === "cycle" && <label className="text-xs font-medium text-gray-600">Cycle<select className="builder-dialog-input mt-1" value={cycleId} onChange={(event) => setCycleId(event.target.value)}><option value="">Choose cycle</option>{visibleCycles.map((cycle) => <option key={cycleKey(cycle)} value={cycle.cycle_id}>{cycle.cycle_number ?? cycle.cycle_id} · {cycle.sampleCount} readings</option>)}</select></label>}
            {granularity === "date_range" && <><label className="text-xs font-medium text-gray-600">From<input className="builder-dialog-input mt-1" type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="text-xs font-medium text-gray-600">To<input className="builder-dialog-input mt-1" type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} /></label></>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gray-50 p-3">
            <div className="flex items-center gap-2 text-sm text-gray-600"><Database size={16} /><span><strong>{selectedMachine?.name}</strong> · Data outside the chosen scope is untouched.</span></div>
            <div className="flex flex-wrap gap-2"><button className="button button-secondary" disabled={!currentScope() || busy === "preview"} onClick={() => void openPreview()}>{busy === "preview" ? <LoaderCircle className="animate-spin" size={13} /> : <Eye size={13} />} Preview</button><button className="button button-secondary" disabled={!currentScope() || busy === "export"} onClick={() => void exportData()}><Download size={13} /> {busy === "export" ? "Exporting…" : "Export Excel"}</button><button className="button button-danger" disabled={!currentScope()} onClick={() => setConfirmScope(currentScope())}><Trash2 size={13} /> Delete scope</button></div>
          </div>
        </>}
      </section>

      {!!summary?.cycles.length && <section className="panel uploads-panel"><div className="uploads-toolbar"><div><h2 className="panel-title">Cycle inventory</h2><p className="panel-subtitle">Select multiple cycles for one reviewed batch deletion.</p></div><button className="button button-danger" disabled={!selectedCycles.size} onClick={() => setConfirmScope(selectedCycleScope())}><Trash2 size={13} /> Delete selected ({selectedCycles.size})</button></div><div className="table-panel"><table className="data-table"><thead><tr><th><CheckSquare2 size={14} /></th><th>Run</th><th>Cycle</th><th>Recipe</th><th>Started</th><th>Readings</th><th>Preview</th></tr></thead><tbody>{summary.cycles.map((cycle) => <tr key={cycleKey(cycle)}><td><input type="checkbox" checked={selectedCycles.has(cycleKey(cycle))} onChange={() => toggleCycle(cycle)} aria-label={`Select cycle ${cycle.cycle_id}`} /></td><td>{cycle.run_id || "—"}</td><td><strong>{cycle.cycle_number ?? cycle.cycle_id}</strong><small className="table-secondary">{cycle.cycle_id}</small></td><td>{cycle.recipe_id || "—"}</td><td>{new Date(cycle.startedAt).toLocaleString("en-IN")}</td><td>{cycle.sampleCount.toLocaleString("en-IN")}</td><td><button className="square-table-action" onClick={() => void openPreview({ scope: "cycle", run_id: cycle.run_id, cycle_id: cycle.cycle_id })} aria-label={`Preview cycle ${cycle.cycle_id}`}><Eye size={14} /></button></td></tr>)}</tbody></table></div></section>}

      {preview && <div className="modal-backdrop"><div className="upload-modal source-preview-modal"><div className="modal-header"><div><span className="modal-step">Machine data preview</span><h2>{preview.machine.name}</h2><p>Showing {preview.rows.length} of {preview.totalRows.toLocaleString("en-IN")} readings in the selected scope.</p></div><button className="icon-button" onClick={() => setPreview(null)} aria-label="Close preview"><X size={17} /></button></div><div className="modal-body"><div className="source-preview-table"><table><thead><tr><th>Observed</th><th>Run</th><th>Cycle</th><th>Phase</th><th>Recipe</th><th>Values</th></tr></thead><tbody>{preview.rows.map((row) => <tr key={row.id}><td>{new Date(row.observedAt).toLocaleString("en-IN")}</td><td>{row.runId || "—"}</td><td>{row.cycleNumber ?? (row.cycleId || "—")}</td><td>{row.phase || "—"}</td><td>{row.recipe || "—"}</td><td><code className="text-xs">{JSON.stringify(row.values)}</code></td></tr>)}</tbody></table></div></div></div></div>}

      {confirmScope && <div className="modal-backdrop"><div className="upload-modal compact-dialog delete-source-dialog"><div className="modal-header"><div><span className="modal-step">Permanent data deletion</span><h2>Delete selected machine data?</h2><p>This removes raw readings and corresponding outcomes and derived ML cycles. Existing trained model artifacts remain available for audit.</p></div><button className="icon-button" disabled={busy === "delete"} onClick={() => setConfirmScope(null)} aria-label="Close"><X size={17} /></button></div><div className="modal-body"><div className="flex gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><CalendarRange size={18} /><span>Scope: <strong>{confirmScope.scope.replace("_", " ")}</strong> · Machine: <strong>{selectedMachine?.name}</strong></span></div></div><div className="modal-footer"><button className="button button-secondary" disabled={busy === "delete"} onClick={() => setConfirmScope(null)}>Keep data</button><button className="button button-danger" disabled={busy === "delete"} onClick={() => void deleteData()}>{busy === "delete" ? <LoaderCircle className="animate-spin" size={13} /> : <Trash2 size={13} />} {busy === "delete" ? "Deleting…" : "Permanently delete"}</button></div></div></div>}
    </section>
  );
}

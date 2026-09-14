"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Activity, BarChart3, Clock, Maximize2, ArrowDownRight, ArrowUpRight, Sliders, Layers } from "lucide-react";
import type { MachineNode, MachineStatus } from "@/lib/spatial-types";
import { QrCodePreview } from "./QrCodePreview";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MachineAnalyticsPanelProps {
  machineId: string;
  machines: MachineNode[];
  onClose: () => void;
}

interface ObservationRow {
  values: Record<string, unknown>;
  submitted_at: string;
  submitted_by?: string | null;
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
}: MachineAnalyticsPanelProps) {
  const machine = machines.find((m) => m.id === machineId);
  const [observations, setObservations] = useState<ObservationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFullHistory, setShowFullHistory] = useState(false);

  // Fetch recent observations for this machine
  useEffect(() => {
    let cancelled = false;

    async function fetchObservations() {
      setLoading(true);
      try {
        const response = await fetch(
          `${API_SPATIAL}/machines/${machineId}/observations/?limit=10`,
          {
            headers: { Accept: "application/json" },
            credentials: "same-origin",
          }
        );
        if (!response.ok) {
          setObservations([]);
          return;
        }
        const data = await response.json();
        if (!cancelled) {
          // Handle paginated or array response
          const results = Array.isArray(data)
            ? data
            : data.results ?? [];
          setObservations(results);
        }
      } catch {
        if (!cancelled) setObservations([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchObservations();
    return () => { cancelled = true; };
  }, [machineId]);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  if (!machine) {
    return null;
  }

  const status: MachineStatus = machine.status ?? "no_data";
  const badge = STATUS_BADGE[status];
  const latestObs = observations.length > 0 ? observations[0] : null;

  // Evaluate custom KPIs against latest observation
  const kpiValues: Array<{ name: string; unit: string; value: string }> = [];
  if (machine.customKpis && latestObs) {
    for (const kpi of machine.customKpis) {
      const value = evaluateSimpleKpi(kpi.formula, latestObs.values);
      kpiValues.push({ name: kpi.name, unit: kpi.displayUnit, value });
    }
  }

  return (
    <div
      className="absolute right-0 top-0 bottom-0 w-96 max-w-[calc(100%-3rem)] bg-white shadow-2xl border-l border-gray-200 z-30 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
      role="dialog"
      aria-label={`Analytics for ${machine.name}`}
      aria-modal="false"
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200 bg-gradient-to-r from-slate-50 to-white">
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
            <span className="text-xs text-gray-400">
              Position ({machine.position.x}, {machine.position.y})
              {machine.size && (machine.size.width > 1 || machine.size.height > 1)
                ? ` \u00b7 ${machine.size.width}\u00d7${machine.size.height}`
                : ""}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="ml-3 p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close analytics panel"
        >
          <X size={18} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Inputs & Outputs (I/O Specifications) */}
        <section className="space-y-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Layers size={14} className="text-gray-400" />
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Inputs & Outputs ({machine.inputs.length + machine.outputs.length})
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {/* Inputs Block */}
            <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-2">
                <ArrowDownRight size={14} className="text-emerald-600" />
                <span>Inputs ({machine.inputs.length})</span>
              </div>
              {machine.inputs.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No input streams configured</p>
              ) : (
                <div className="space-y-1.5">
                  {machine.inputs.map((io) => {
                    const measuredVal = latestObs?.values[`input_${io.id}`] ?? latestObs?.values[io.label];
                    return (
                      <div
                        key={io.id}
                        className="flex items-center justify-between rounded bg-white px-2.5 py-1.5 border border-gray-200/70 text-xs shadow-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <span className="font-medium text-gray-800 truncate">{io.label}</span>
                          <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                            {io.unitType || "units"}
                          </span>
                        </div>
                        <span className="font-mono text-gray-900 font-semibold ml-2 shrink-0">
                          {measuredVal !== undefined && measuredVal !== null
                            ? `${measuredVal} ${io.unitType}`
                            : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Outputs Block */}
            <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-2">
                <ArrowUpRight size={14} className="text-blue-600" />
                <span>Outputs ({machine.outputs.length})</span>
              </div>
              {machine.outputs.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No output streams configured</p>
              ) : (
                <div className="space-y-1.5">
                  {machine.outputs.map((io) => {
                    const measuredVal = latestObs?.values[`output_${io.id}`] ?? latestObs?.values[io.label];
                    return (
                      <div
                        key={io.id}
                        className="flex items-center justify-between rounded bg-white px-2.5 py-1.5 border border-gray-200/70 text-xs shadow-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                          <span className="font-medium text-gray-800 truncate">{io.label}</span>
                          <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                            {io.unitType || "units"}
                          </span>
                        </div>
                        <span className="font-mono text-gray-900 font-semibold ml-2 shrink-0">
                          {measuredVal !== undefined && measuredVal !== null
                            ? `${measuredVal} ${io.unitType}`
                            : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Parameters Section */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Sliders size={14} className="text-gray-400" />
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

          {machine.parameters.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-4 text-center">
              <p className="text-xs text-gray-500">No custom parameters configured</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Parameters can be added when editing the factory twin layout.
              </p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-4">
              <span className="text-xs text-gray-400">Loading observations...</span>
            </div>
          ) : (
            <div className="space-y-2.5">
              {/* Parameter cards showing key, type, and latest value */}
              <div className="grid grid-cols-2 gap-2">
                {machine.parameters.map((param) => {
                  const val = latestObs?.values[param.key];
                  return (
                    <div
                      key={param.id}
                      className="rounded-md border border-gray-200 bg-white p-2.5 shadow-xs"
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-[11px] font-semibold text-gray-700 truncate" title={param.key}>
                          {param.key}
                        </span>
                        <span className="text-[9px] px-1 py-0.2 rounded bg-gray-100 text-gray-500 uppercase font-mono">
                          {param.dataType}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-gray-900 font-mono">
                        {val !== undefined && val !== null ? String(val) : "—"}
                      </p>
                      {param.required && (
                        <span className="text-[9px] text-amber-600 font-medium">Required</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Multi-snapshot table if observations exist */}
              {observations.length > 0 && (
                <div className="overflow-x-auto rounded-md border border-gray-200 mt-2">
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
                                  : "—"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Custom KPIs */}
        {kpiValues.length > 0 && (
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
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Machine QR Code
          </h3>
          <QrCodePreview
            machineId={machine.id}
            machineName={machine.name}
          />
        </section>

      </div>

      {/* Full History Sheet (overlay) */}
      {showFullHistory && (
        <FullHistorySheet
          machine={machine}
          observations={observations}
          onClose={() => setShowFullHistory(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full History Sheet – snapshot view with parameters + inputs/outputs
// ---------------------------------------------------------------------------

interface FullHistorySheetProps {
  machine: MachineNode;
  observations: ObservationRow[];
  onClose: () => void;
}

function FullHistorySheet({ machine, observations, onClose }: FullHistorySheetProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

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
              {observations.length} snapshot{observations.length !== 1 ? "s" : ""} · {paramCols.length} parameters · {inputCols.length} inputs · {outputCols.length} outputs
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

        {/* Sheet Body – spreadsheet table, scrollable both ways */}
        <div className="flex-1 overflow-auto">
          {observations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center h-full">
              <p className="text-sm text-gray-400">No observations recorded yet.</p>
            </div>
          ) : (
            <table className="text-xs border-collapse min-w-full">
              <thead className="sticky top-0 z-10">
                {/* Column type row */}
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="sticky left-0 z-20 bg-gray-50 px-3 py-1 border-r border-gray-200" />
                  <th className="sticky left-[50px] z-20 bg-gray-50 px-3 py-1 border-r border-gray-200" />
                  {allCols.map((col, cIdx) => (
                    <th key={cIdx} className="px-3 py-1 text-center">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium ${
                          col.type === "Parameter"
                            ? "bg-blue-50 text-blue-700"
                            : col.type === "Input"
                            ? "bg-green-50 text-green-700"
                            : "bg-orange-50 text-orange-700"
                        }`}
                      >
                        {col.type}
                      </span>
                    </th>
                  ))}
                </tr>
                {/* Column name row */}
                <tr className="bg-gray-100 border-b border-gray-200">
                  <th className="sticky left-0 z-20 bg-gray-100 text-left px-3 py-2 font-semibold text-gray-600 min-w-[50px] border-r border-gray-200">
                    #
                  </th>
                  <th className="sticky left-[50px] z-20 bg-gray-100 text-left px-3 py-2 font-semibold text-gray-600 min-w-[140px] border-r border-gray-200">
                    Timestamp
                  </th>
                  {allCols.map((col, cIdx) => (
                    <th
                      key={cIdx}
                      className="text-center px-3 py-2 font-semibold text-gray-700 whitespace-nowrap min-w-[90px]"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {observations.map((obs, rowIdx) => (
                  <tr
                    key={rowIdx}
                    className={`${rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50/60"} hover:bg-blue-50/30 transition-colors`}
                  >
                    <td className="sticky left-0 bg-inherit px-3 py-2 text-center font-bold text-gray-500 border-r border-gray-100">
                      {rowIdx + 1}
                    </td>
                    <td className="sticky left-[50px] bg-inherit px-3 py-2 text-xs text-gray-700 font-medium whitespace-nowrap border-r border-gray-100">
                      {obs.submitted_at
                        ? new Date(obs.submitted_at).toLocaleString()
                        : "—"}
                    </td>
                    {allCols.map((col, cIdx) => {
                      const val = obs.values[col.key];
                      return (
                        <td
                          key={cIdx}
                          className="text-center px-3 py-2 font-mono text-gray-900"
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
          )}
        </div>

        {/* Sheet Footer */}
        <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-6 py-3 flex items-center justify-end">
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

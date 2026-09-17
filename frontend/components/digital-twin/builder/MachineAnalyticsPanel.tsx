"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Activity, ArrowDownRight, ArrowUpRight, Sliders, Layers, FileSpreadsheet, ChevronDown, ChevronRight } from "lucide-react";
import type { MachineNode, MachineStatus } from "@/lib/spatial-types";
import { PortalOverlay } from "@/components/ui/portal-overlay";
import { QrCodePreview } from "./QrCodePreview";
import { MachineHistorySheetModal } from "./MachineHistorySheetModal";

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
 * Portaled to document.body with 520px width, quiet-by-default accordions, and 44px tap envelope.
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
  const [ioExpanded, setIoExpanded] = useState(false);
  const [paramsExpanded, setParamsExpanded] = useState(false);

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
    <PortalOverlay
      isOpen={true}
      onClose={onClose}
      ariaLabel={`Analytics for ${machine.name}`}
      backdropClassName="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex justify-end"
    >
      <div
        className="relative w-[520px] max-w-[calc(100%-2rem)] h-full bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
        role="dialog"
        aria-label={`Analytics for ${machine.name}`}
        aria-modal="true"
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
                className={`inline-block px-2.5 py-0.5 text-xs font-semibold rounded-full ${badge.bg} ${badge.text}`}
              >
                {badge.label}
              </span>
              <span className="text-xs text-gray-500 font-mono tnum">
                Position ({machine.position.x}, {machine.position.y})
                {machine.size && (machine.size.width > 1 || machine.size.height > 1)
                  ? ` · ${machine.size.width}×${machine.size.height}`
                  : ""}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] ml-2 inline-flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close analytics panel"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Full History Sheet Hero Action Banner */}
          <div className="rounded-lg bg-gradient-to-br from-emerald-50 via-teal-50/50 to-emerald-50 border border-emerald-200/80 p-3.5 shadow-xs">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <FileSpreadsheet size={16} className="text-emerald-700" />
                <span className="text-xs font-bold text-emerald-950">Historical Telemetry</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800">
                Excel Sheet View
              </span>
            </div>
            <p className="text-xs text-emerald-800 leading-snug mb-3">
              Complete historical observation timeline in spreadsheet format with live search, CSV export, and Excel clipboard copy.
            </p>
            <button
              type="button"
              onClick={() => setShowFullHistory(true)}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-md text-xs font-semibold shadow-xs hover:shadow transition-all cursor-pointer min-h-[44px]"
            >
              <FileSpreadsheet size={15} />
              View Full History (Sheet Preview)
            </button>
          </div>

          {/* Custom KPIs (Surfaced first for immediate visibility) */}
          {kpiValues.length > 0 && (
            <section>
              <div className="flex items-center gap-1.5 mb-2">
                <Activity size={15} className="text-gray-400" />
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
                    <span className="text-sm font-semibold text-gray-900 tnum">
                      {kpi.value} <span className="text-xs font-normal text-gray-400">{kpi.unit}</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Inputs & Outputs (I/O Specifications) - Quiet by Default */}
          <section className="space-y-2.5 rounded-lg border border-gray-200/80 bg-gray-50/50 p-3">
            <button
              type="button"
              onClick={() => setIoExpanded(!ioExpanded)}
              className="w-full flex items-center justify-between text-left cursor-pointer min-h-[36px]"
            >
              <div className="flex items-center gap-2">
                <Layers size={15} className="text-gray-400" />
                <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  Inputs &amp; Outputs ({machine.inputs.length + machine.outputs.length})
                </h3>
              </div>
              <span className="text-xs text-gray-400 flex items-center gap-1">
                {ioExpanded ? "Hide" : "Show"} details
                {ioExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            </button>

            {ioExpanded && (
              <div className="grid grid-cols-1 gap-2 pt-2 border-t border-gray-200">
                {/* Inputs Block */}
                <div className="rounded-lg border border-gray-200 bg-white p-3">
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
                            className="flex items-center justify-between rounded bg-gray-50/80 px-2.5 py-1.5 border border-gray-200/70 text-xs shadow-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                              <span className="font-medium text-gray-800 truncate">{io.label}</span>
                              <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                                {io.unitType || "units"}
                              </span>
                            </div>
                            <span className="font-mono text-gray-900 font-semibold ml-2 shrink-0 tnum">
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
                <div className="rounded-lg border border-gray-200 bg-white p-3">
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
                            className="flex items-center justify-between rounded bg-gray-50/80 px-2.5 py-1.5 border border-gray-200/70 text-xs shadow-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                              <span className="font-medium text-gray-800 truncate">{io.label}</span>
                              <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                                {io.unitType || "units"}
                              </span>
                            </div>
                            <span className="font-mono text-gray-900 font-semibold ml-2 shrink-0 tnum">
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
            )}
          </section>

          {/* Parameters Section - Quiet by Default */}
          <section className="space-y-2.5 rounded-lg border border-gray-200/80 bg-gray-50/50 p-3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setParamsExpanded(!paramsExpanded)}
                className="flex items-center gap-2 text-left cursor-pointer min-h-[36px]"
              >
                <Sliders size={15} className="text-gray-400" />
                <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  Parameters ({machine.parameters.length})
                </h3>
                <span className="text-xs text-gray-400 flex items-center gap-1 ml-1">
                  {paramsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setShowFullHistory(true)}
                className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 font-medium transition-colors bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded border border-emerald-200 cursor-pointer"
              >
                <FileSpreadsheet size={13} />
                Full History Sheet
              </button>
            </div>

            {paramsExpanded && (
              <div className="pt-2 border-t border-gray-200">
                {machine.parameters.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-200 bg-white p-4 text-center">
                    <p className="text-xs text-gray-500">No custom parameters configured</p>
                    <p className="text-xs text-gray-400 mt-0.5">
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
                              <span className="text-xs font-semibold text-gray-700 truncate" title={param.key}>
                                {param.key}
                              </span>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 uppercase font-mono">
                                {param.dataType}
                              </span>
                            </div>
                            <p className="text-sm font-bold text-gray-900 font-mono tnum">
                              {val !== undefined && val !== null ? String(val) : "—"}
                            </p>
                            {param.required && (
                              <span className="text-xs text-amber-600 font-medium">Required</span>
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
                                <th key={idx} className="text-center px-2 py-1.5 font-medium text-gray-400 whitespace-nowrap min-w-[70px] tnum">
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
                                      className={`text-center px-2 py-1.5 font-mono tnum ${
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
              </div>
            )}
          </section>

          {/* Machine QR Code – Download & Print */}
          <section className="rounded-lg border border-gray-200 bg-gray-50/40 p-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Machine QR Code
            </h3>
            <QrCodePreview
              machineId={machine.id}
              machineName={machine.name}
            />
          </section>

        </div>

        {/* Full History Sheet Modal (Excel preview) */}
        {showFullHistory && (
          <MachineHistorySheetModal
            machineId={machine.id}
            machineName={machine.name}
            parameters={machine.parameters}
            inputs={machine.inputs}
            outputs={machine.outputs}
            onClose={() => setShowFullHistory(false)}
          />
        )}
      </div>
    </PortalOverlay>
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

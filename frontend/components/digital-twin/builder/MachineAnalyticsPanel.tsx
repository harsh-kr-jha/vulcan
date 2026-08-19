"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Activity, BarChart3, Clock } from "lucide-react";
import type { MachineNode, MachineStatus } from "@/lib/spatial-types";

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
      className="absolute right-0 top-0 h-full w-96 bg-white shadow-2xl border-l border-gray-200 z-30 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
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
        {/* Parameters summary */}
        {machine.parameters.length > 0 && (
          <section>
            <div className="flex items-center gap-1.5 mb-2">
              <BarChart3 size={14} className="text-gray-400" />
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Parameters ({machine.parameters.length})
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {machine.parameters.map((param) => {
                const latestValue = latestObs?.values[param.key];
                return (
                  <div
                    key={param.id}
                    className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2"
                  >
                    <p className="text-xs text-gray-500 truncate">{param.key}</p>
                    <p className="text-sm font-medium text-gray-900 mt-0.5">
                      {latestValue !== undefined && latestValue !== null
                        ? String(latestValue)
                        : "\u2014"}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

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

        {/* Recent observations */}
        <section>
          <div className="flex items-center gap-1.5 mb-2">
            <Clock size={14} className="text-gray-400" />
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Recent Observations
            </h3>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <span className="text-xs text-gray-400">Loading...</span>
            </div>
          ) : observations.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <p className="text-sm text-gray-400">No observations recorded yet.</p>
              <p className="text-xs text-gray-300 mt-1">
                Scan the machine QR code to submit data.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {observations.map((obs, idx) => (
                <div
                  key={idx}
                  className="rounded-md border border-gray-100 bg-white px-3 py-2"
                >
                  <p className="text-xs text-gray-400 mb-1">
                    {obs.submitted_at
                      ? new Date(obs.submitted_at).toLocaleString()
                      : "Unknown time"}
                  </p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                    {Object.entries(obs.values).slice(0, 8).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-xs">
                        <span className="text-gray-500 truncate">{key}</span>
                        <span className="text-gray-800 font-medium ml-1">
                          {String(value ?? "-")}
                        </span>
                      </div>
                    ))}
                  </div>
                  {Object.keys(obs.values).length > 8 && (
                    <p className="text-xs text-gray-300 mt-1">
                      +{Object.keys(obs.values).length - 8} more fields
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Placeholder for future analytics (charts, trends) */}
        <section className="rounded-md border border-dashed border-gray-200 bg-gray-50/50 px-4 py-6 text-center">
          <p className="text-xs text-gray-400">
            Charts and trend analysis will appear here.
          </p>
        </section>
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

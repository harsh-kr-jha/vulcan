"use client";

import { useCallback } from "react";
import type {
  MachineNode,
  CustomKpi,
  KpiFormula,
  MachineStatus,
} from "@/lib/spatial-types";
import { QrCodePreview } from "./QrCodePreview";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Observation data: key-value pairs of the latest submitted row */
export interface ObservationData {
  values: Record<string, unknown>;
  submittedAt?: string;
}

interface MachineDetailPanelProps {
  machine: MachineNode;
  observation: ObservationData | null;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// KPI Evaluation
// Requirements: 5.5, 5.6, 5.7
// ---------------------------------------------------------------------------

/**
 * Evaluates a Custom KPI formula against the latest observation values.
 *
 * Returns the computed numeric result as a string, or "Unavailable" when:
 * - Any referenced parameter has no submitted data (requirement 5.6)
 * - Division by zero occurs (requirement 5.7)
 */
export function evaluateKpiFormula(
  formula: KpiFormula,
  values: Record<string, unknown>
): string {
  const { operations } = formula;

  if (!operations || operations.length === 0) {
    return "Unavailable";
  }

  // The first operation's parameterKey is the initial accumulator value
  const firstParamValue = values[operations[0].parameterKey];
  if (firstParamValue === undefined || firstParamValue === null) {
    return "Unavailable";
  }

  const firstNum = Number(firstParamValue);
  if (!Number.isFinite(firstNum)) {
    return "Unavailable";
  }

  // If there's only one operation, return that parameter's value directly
  if (operations.length === 1) {
    return firstNum.toFixed(2);
  }

  // Process remaining operations sequentially
  let result = firstNum;

  for (let i = 1; i < operations.length; i++) {
    const op = operations[i];
    const paramValue = values[op.parameterKey];

    if (paramValue === undefined || paramValue === null) {
      return "Unavailable";
    }

    const num = Number(paramValue);
    if (!Number.isFinite(num)) {
      return "Unavailable";
    }

    switch (op.operator) {
      case "add":
        result += num;
        break;
      case "subtract":
        result -= num;
        break;
      case "multiply":
        result *= num;
        break;
      case "divide":
        if (num === 0) {
          return "Unavailable";
        }
        result /= num;
        break;
      default:
        return "Unavailable";
    }
  }

  if (!Number.isFinite(result)) {
    return "Unavailable";
  }

  return result.toFixed(2);
}

// ---------------------------------------------------------------------------
// Status badge colors
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<MachineStatus, { bg: string; text: string; label: string }> = {
  running: { bg: "bg-green-100", text: "text-green-800", label: "Running" },
  warning: { bg: "bg-amber-100", text: "text-amber-800", label: "Warning" },
  down: { bg: "bg-red-100", text: "text-red-800", label: "Down" },
  idle: { bg: "bg-gray-100", text: "text-gray-700", label: "Idle" },
  no_data: { bg: "bg-gray-50", text: "text-gray-500", label: "No Data" },
};

// ---------------------------------------------------------------------------
// MachineDetailPanel
// Requirements: 10.4, 10.6, 5.5, 5.6, 5.7
// ---------------------------------------------------------------------------

/**
 * Detail panel displayed when a user clicks/taps a machine in the
 * Factory Visualization. Shows latest submitted data values and computed
 * Custom KPIs. Displays "Unavailable" for KPIs when parameter data is
 * missing or division by zero occurs. Shows an empty-state message when
 * no data has been submitted.
 */
export function MachineDetailPanel({
  machine,
  observation,
  onClose,
}: MachineDetailPanelProps) {
  const status = machine.status ?? "no_data";
  const badge = STATUS_BADGE[status];

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <div
      className="absolute right-0 top-0 bottom-0 w-80 max-w-[calc(100%-3rem)] bg-white shadow-xl border-l border-gray-200 z-20 flex flex-col overflow-hidden"
      role="dialog"
      aria-label={`Details for ${machine.name}`}
      aria-modal="false"
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-gray-900 truncate">
            {machine.name}
          </h2>
          <span
            className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full ${badge.bg} ${badge.text}`}
          >
            {badge.label}
          </span>
        </div>
        <button
          onClick={onClose}
          className="ml-2 p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
          aria-label="Close detail panel"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Notice when no telemetry data submitted yet */}
        {!observation && (
          <div className="flex flex-col items-center justify-center py-3 text-center bg-gray-50 rounded-lg p-3 border border-dashed border-gray-200">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-gray-300 mb-1.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-xs font-medium text-gray-500">
              No telemetry received yet
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Showing configured specifications. Scan QR to submit.
            </p>
          </div>
        )}

        {/* Inputs & Outputs */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Inputs & Outputs
          </h3>
          <div className="space-y-2">
            {/* Inputs */}
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 mb-1">
                <span>Inputs ({machine.inputs.length})</span>
              </div>
              {machine.inputs.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No input streams configured</p>
              ) : (
                <div className="space-y-1">
                  {machine.inputs.map((io) => {
                    const val = observation?.values[`input_${io.id}`] ?? observation?.values[io.label];
                    return (
                      <div
                        key={io.id}
                        className="flex items-center justify-between py-1.5 px-2 rounded bg-gray-50 text-xs border border-gray-100"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <span className="font-medium text-gray-700 truncate">{io.label}</span>
                          <span className="text-xs text-gray-500 font-mono">({io.unitType || "units"})</span>
                        </div>
                        <span className="font-mono text-gray-900 font-medium ml-2 shrink-0 tnum">
                          {val !== undefined && val !== null ? `${val} ${io.unitType}` : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Outputs */}
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-blue-700 mb-1">
                <span>Outputs ({machine.outputs.length})</span>
              </div>
              {machine.outputs.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No output streams configured</p>
              ) : (
                <div className="space-y-1">
                  {machine.outputs.map((io) => {
                    const val = observation?.values[`output_${io.id}`] ?? observation?.values[io.label];
                    return (
                      <div
                        key={io.id}
                        className="flex items-center justify-between py-1.5 px-2 rounded bg-gray-50 text-xs border border-gray-100"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                          <span className="font-medium text-gray-700 truncate">{io.label}</span>
                          <span className="text-xs text-gray-500 font-mono">({io.unitType || "units"})</span>
                        </div>
                        <span className="font-mono text-gray-900 font-medium ml-2 shrink-0 tnum">
                          {val !== undefined && val !== null ? `${val} ${io.unitType}` : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Machine Parameters */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Parameters ({machine.parameters.length})
          </h3>
          {machine.parameters.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No parameters configured</p>
          ) : (
            <div className="grid grid-cols-1 gap-1.5">
              {machine.parameters.map((param) => {
                const val = observation?.values[param.key];
                return (
                  <div
                    key={param.id}
                    className="flex items-center justify-between py-1.5 px-2 rounded bg-gray-50 text-xs border border-gray-100"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-medium text-gray-700 truncate max-w-[120px]" title={param.key}>
                        {param.key}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 uppercase font-mono">
                        {param.dataType}
                      </span>
                      {param.required && (
                        <span className="text-xs text-amber-600 font-medium" title="Required">*</span>
                      )}
                    </div>
                    <span className="font-mono text-gray-900 font-semibold tnum">
                      {val !== undefined && val !== null ? String(val) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Additional Raw Telemetry Values if present */}
        {observation && Object.keys(observation.values).length > 0 && (() => {
          const handledKeys = new Set([
            ...machine.parameters.map((p) => p.key),
            ...machine.inputs.map((io) => `input_${io.id}`),
            ...machine.inputs.map((io) => io.label),
            ...machine.outputs.map((io) => `output_${io.id}`),
            ...machine.outputs.map((io) => io.label),
          ]);
          const extraEntries = Object.entries(observation.values).filter(
            ([k]) => !handledKeys.has(k)
          );

          if (extraEntries.length === 0) return null;

          return (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Additional Telemetry
              </h3>
              {observation.submittedAt && (
                <p className="text-xs text-gray-400 mb-1.5">
                  Submitted: {new Date(observation.submittedAt).toLocaleString()}
                </p>
              )}
              <div className="space-y-1.5">
                {extraEntries.map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between py-1.5 px-2 rounded bg-gray-50 text-xs"
                  >
                    <span className="font-medium text-gray-600 truncate max-w-[140px]">
                      {key}
                    </span>
                    <span className="text-gray-900 font-mono">
                      {value === null || value === undefined ? "—" : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          );
        })()}

        {/* Custom KPIs */}
        {machine.customKpis.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Custom KPIs
            </h3>
            <div className="space-y-1.5">
              {machine.customKpis.map((kpi) => {
                const computed = observation
                  ? evaluateKpiFormula(kpi.formula, observation.values)
                  : "Unavailable";
                const isUnavailable = computed === "Unavailable";

                return (
                  <div
                    key={kpi.id}
                    className="flex items-center justify-between py-1.5 px-2 rounded bg-gray-50 text-xs"
                  >
                    <span className="font-medium text-gray-600 truncate max-w-[140px]">
                      {kpi.name}
                    </span>
                    <span
                      className={`font-mono ${
                        isUnavailable ? "text-amber-600 italic" : "text-gray-900"
                      }`}
                    >
                      {computed}
                      {!isUnavailable && (
                        <span className="text-gray-400 ml-1">{kpi.displayUnit}</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Machine QR Code */}
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
    </div>
  );
}

export default MachineDetailPanel;

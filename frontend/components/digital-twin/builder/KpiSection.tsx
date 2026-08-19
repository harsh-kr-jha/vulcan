"use client";

import { Plus, Trash2 } from "lucide-react";
import { useCallback, useMemo } from "react";
import type {
  CustomKpi,
  KpiFormula,
  KpiOperation,
  MachineParameter,
} from "@/lib/spatial-types";
import { validateKpiFormula, validateKpiName } from "@/lib/spatial-validators";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface KpiSectionProps {
  /** Current list of custom KPIs on this machine */
  kpis: CustomKpi[];
  /** All parameters defined on the machine (used to filter numeric ones) */
  parameters: MachineParameter[];
  /** Callback when the KPI list changes */
  onChange: (kpis: CustomKpi[]) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_KPIS = 20;
const MAX_OPERATIONS = 10;
const MAX_KPI_NAME_LENGTH = 50;
const MAX_DISPLAY_UNIT_LENGTH = 20;

const OPERATORS: KpiOperation["operator"][] = [
  "add",
  "subtract",
  "multiply",
  "divide",
];

const OPERATOR_LABELS: Record<KpiOperation["operator"], string> = {
  add: "+",
  subtract: "−",
  multiply: "×",
  divide: "÷",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * KpiSection allows users to create and manage Custom KPIs for a machine.
 * Each KPI has a name, display unit, and a formula built from numeric parameters
 * with arithmetic operators.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */
export function KpiSection({ kpis, parameters, onChange }: KpiSectionProps) {
  // Filter to only numeric parameters for the formula builder
  const numericParameters = useMemo(
    () => parameters.filter((p) => p.dataType === "number"),
    [parameters]
  );

  const numericParameterKeys = useMemo(
    () => new Set(numericParameters.map((p) => p.key)),
    [numericParameters]
  );

  // Existing KPI names for uniqueness validation
  const existingNames = useMemo(() => kpis.map((k) => k.name), [kpis]);

  // --- Handlers ---

  const handleAddKpi = useCallback(() => {
    if (kpis.length >= MAX_KPIS) return;
    const newKpi: CustomKpi = {
      id: crypto.randomUUID(),
      name: "",
      displayUnit: "",
      formula: { operations: [] },
    };
    onChange([...kpis, newKpi]);
  }, [kpis, onChange]);

  const handleRemoveKpi = useCallback(
    (kpiId: string) => {
      onChange(kpis.filter((k) => k.id !== kpiId));
    },
    [kpis, onChange]
  );

  const handleUpdateKpi = useCallback(
    (kpiId: string, updates: Partial<CustomKpi>) => {
      onChange(
        kpis.map((k) => (k.id === kpiId ? { ...k, ...updates } : k))
      );
    },
    [kpis, onChange]
  );

  const handleAddOperation = useCallback(
    (kpiId: string) => {
      const kpi = kpis.find((k) => k.id === kpiId);
      if (!kpi || kpi.formula.operations.length >= MAX_OPERATIONS) return;

      const defaultKey = numericParameters[0]?.key ?? "";
      const newOp: KpiOperation = { operator: "add", parameterKey: defaultKey };
      const updatedFormula: KpiFormula = {
        operations: [...kpi.formula.operations, newOp],
      };
      handleUpdateKpi(kpiId, { formula: updatedFormula });
    },
    [kpis, numericParameters, handleUpdateKpi]
  );

  const handleRemoveOperation = useCallback(
    (kpiId: string, opIndex: number) => {
      const kpi = kpis.find((k) => k.id === kpiId);
      if (!kpi) return;

      const updatedFormula: KpiFormula = {
        operations: kpi.formula.operations.filter((_, i) => i !== opIndex),
      };
      handleUpdateKpi(kpiId, { formula: updatedFormula });
    },
    [kpis, handleUpdateKpi]
  );

  const handleUpdateOperation = useCallback(
    (kpiId: string, opIndex: number, updates: Partial<KpiOperation>) => {
      const kpi = kpis.find((k) => k.id === kpiId);
      if (!kpi) return;

      const updatedOps = kpi.formula.operations.map((op, i) =>
        i === opIndex ? { ...op, ...updates } : op
      );
      handleUpdateKpi(kpiId, { formula: { operations: updatedOps } });
    },
    [kpis, handleUpdateKpi]
  );

  // --- Validation helpers ---

  const getNameError = useCallback(
    (kpi: CustomKpi): string | null => {
      if (kpi.name.length === 0) return null; // Don't show error on empty (not yet typed)
      const otherNames = existingNames.filter(
        (n) => n.toLowerCase() !== kpi.name.toLowerCase() || n === ""
      );
      // Get names of all OTHER KPIs (exclude current one by id)
      const siblingNames = kpis
        .filter((k) => k.id !== kpi.id && k.name.length > 0)
        .map((k) => k.name);
      const result = validateKpiName(kpi.name, siblingNames);
      return result.valid ? null : result.error;
    },
    [kpis, existingNames]
  );

  const getDisplayUnitError = useCallback((kpi: CustomKpi): string | null => {
    if (kpi.displayUnit.length === 0) return null;
    if (kpi.displayUnit.length > MAX_DISPLAY_UNIT_LENGTH) {
      return `Display unit must be at most ${MAX_DISPLAY_UNIT_LENGTH} characters.`;
    }
    return null;
  }, []);

  const getFormulaError = useCallback(
    (kpi: CustomKpi): string | null => {
      if (kpi.formula.operations.length === 0) return null;
      const result = validateKpiFormula(kpi.formula, numericParameterKeys);
      return result.valid ? null : result.error;
    },
    [numericParameterKeys]
  );

  // --- Render ---

  return (
    <div className="flex flex-col gap-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          Custom KPIs
          <span className="ml-2 text-xs font-normal text-gray-500">
            ({kpis.length}/{MAX_KPIS})
          </span>
        </h3>
        <button
          type="button"
          onClick={handleAddKpi}
          disabled={kpis.length >= MAX_KPIS || numericParameters.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
          title={
            numericParameters.length === 0
              ? "Add numeric parameters first"
              : kpis.length >= MAX_KPIS
                ? `Maximum of ${MAX_KPIS} KPIs reached`
                : "Add KPI"
          }
        >
          <Plus size={14} />
          Add KPI
        </button>
      </div>

      {/* Empty state */}
      {kpis.length === 0 && (
        <p className="text-xs text-gray-400 italic">
          {numericParameters.length === 0
            ? "Define numeric parameters to create KPIs."
            : "No custom KPIs defined. Click \"Add KPI\" to create one."}
        </p>
      )}

      {/* KPI list */}
      <div className="flex flex-col gap-4">
        {kpis.map((kpi, kpiIndex) => {
          const nameError = getNameError(kpi);
          const unitError = getDisplayUnitError(kpi);
          const formulaError = getFormulaError(kpi);

          return (
            <div
              key={kpi.id}
              className="rounded-lg border border-gray-200 bg-gray-50 p-4"
            >
              {/* KPI header with remove button */}
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600">
                  KPI {kpiIndex + 1}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveKpi(kpi.id)}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 transition hover:bg-red-50 hover:text-red-600"
                  aria-label={`Remove KPI ${kpiIndex + 1}`}
                >
                  <Trash2 size={12} />
                  Remove
                </button>
              </div>

              {/* Name and Display Unit */}
              <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Name */}
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`kpi-name-${kpi.id}`}
                    className="text-xs font-medium text-gray-600"
                  >
                    Name <span className="text-red-600">*</span>
                  </label>
                  <input
                    id={`kpi-name-${kpi.id}`}
                    type="text"
                    value={kpi.name}
                    onChange={(e) =>
                      handleUpdateKpi(kpi.id, {
                        name: e.target.value.slice(0, MAX_KPI_NAME_LENGTH),
                      })
                    }
                    maxLength={MAX_KPI_NAME_LENGTH}
                    placeholder="e.g. Throughput Rate"
                    className={`rounded-md border bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 ${
                      nameError
                        ? "border-red-400 focus:ring-red-200"
                        : "border-gray-300 focus:ring-blue-200"
                    }`}
                  />
                  {nameError && (
                    <span className="text-xs text-red-600" role="alert">
                      {nameError}
                    </span>
                  )}
                </div>

                {/* Display Unit */}
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`kpi-unit-${kpi.id}`}
                    className="text-xs font-medium text-gray-600"
                  >
                    Display Unit <span className="text-red-600">*</span>
                  </label>
                  <input
                    id={`kpi-unit-${kpi.id}`}
                    type="text"
                    value={kpi.displayUnit}
                    onChange={(e) =>
                      handleUpdateKpi(kpi.id, {
                        displayUnit: e.target.value.slice(
                          0,
                          MAX_DISPLAY_UNIT_LENGTH
                        ),
                      })
                    }
                    maxLength={MAX_DISPLAY_UNIT_LENGTH}
                    placeholder="e.g. units/hr"
                    className={`rounded-md border bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 ${
                      unitError
                        ? "border-red-400 focus:ring-red-200"
                        : "border-gray-300 focus:ring-blue-200"
                    }`}
                  />
                  {unitError && (
                    <span className="text-xs text-red-600" role="alert">
                      {unitError}
                    </span>
                  )}
                </div>
              </div>

              {/* Formula builder */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-600">
                    Formula
                    <span className="ml-1 text-gray-400">
                      ({kpi.formula.operations.length}/{MAX_OPERATIONS} operations)
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleAddOperation(kpi.id)}
                    disabled={
                      kpi.formula.operations.length >= MAX_OPERATIONS ||
                      numericParameters.length === 0
                    }
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                    title={
                      kpi.formula.operations.length >= MAX_OPERATIONS
                        ? "Maximum 10 operations reached"
                        : "Add operation"
                    }
                  >
                    <Plus size={12} />
                    Add Operation
                  </button>
                </div>

                {/* Operations list */}
                {kpi.formula.operations.length === 0 && (
                  <p className="text-xs text-gray-400 italic">
                    No operations. Add operations to build a formula.
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  {kpi.formula.operations.map((op, opIndex) => (
                    <div
                      key={opIndex}
                      className="flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50 px-3 py-2"
                    >
                      {/* Operator dropdown */}
                      <select
                        value={op.operator}
                        onChange={(e) =>
                          handleUpdateOperation(kpi.id, opIndex, {
                            operator: e.target.value as KpiOperation["operator"],
                          })
                        }
                        className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-200"
                        aria-label={`Operation ${opIndex + 1} operator`}
                      >
                        {OPERATORS.map((o) => (
                          <option key={o} value={o}>
                            {OPERATOR_LABELS[o]} {o}
                          </option>
                        ))}
                      </select>

                      {/* Parameter dropdown (numeric only) */}
                      <select
                        value={op.parameterKey}
                        onChange={(e) =>
                          handleUpdateOperation(kpi.id, opIndex, {
                            parameterKey: e.target.value,
                          })
                        }
                        className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-200"
                        aria-label={`Operation ${opIndex + 1} parameter`}
                      >
                        {numericParameters.length === 0 && (
                          <option value="">No numeric parameters</option>
                        )}
                        {numericParameters.map((p) => (
                          <option key={p.id} value={p.key}>
                            {p.key}
                          </option>
                        ))}
                      </select>

                      {/* Remove operation */}
                      <button
                        type="button"
                        onClick={() => handleRemoveOperation(kpi.id, opIndex)}
                        className="rounded p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                        aria-label={`Remove operation ${opIndex + 1}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Formula validation error */}
                {formulaError && (
                  <span className="text-xs text-red-600" role="alert">
                    {formulaError}
                  </span>
                )}
              </div>

              {/* Formula summary */}
              {kpi.formula.operations.length > 0 && !formulaError && (
                <div className="mt-2 rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
                  <span className="text-xs text-gray-500">Preview: </span>
                  <span className="text-xs font-mono text-gray-700">
                    {kpi.formula.operations
                      .map(
                        (op, i) =>
                          `${i > 0 ? ` ${OPERATOR_LABELS[op.operator]} ` : ""}${op.parameterKey}`
                      )
                      .join("")}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

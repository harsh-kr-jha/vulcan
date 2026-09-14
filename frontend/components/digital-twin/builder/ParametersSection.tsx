"use client";

import { useCallback, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
import type { MachineParameter, ParamDataType } from "@/lib/spatial-types";
import { validateParameterKey } from "@/lib/spatial-validators";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_PARAMETERS = 50;
const MAX_OPTIONS = 20;
const MAX_OPTION_LENGTH = 100;
const DATA_TYPES: { value: ParamDataType; label: string }[] = [
  { value: "number", label: "Number" },
  { value: "text", label: "Text" },
  { value: "boolean", label: "Boolean" },
  { value: "date", label: "Date" },
  { value: "selection", label: "Selection" },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ParametersSectionProps {
  parameters: MachineParameter[];
  onChange: (parameters: MachineParameter[]) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ParametersSection manages up to 50 machine parameters with:
 * - Key name validation (1-64 alphanumeric/underscore, case-insensitive uniqueness)
 * - Data type selection (number, text, boolean, date, selection)
 * - Selection type options (up to 20 options, each 1-100 chars)
 * - Required toggle, remove, and reorder operations
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */
export function ParametersSection({ parameters, onChange }: ParametersSectionProps) {
  // Track which parameter row is expanded for editing options (selection type)
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // --- Add new parameter ---
  const handleAdd = useCallback(() => {
    if (parameters.length >= MAX_PARAMETERS) return;

    const newParam: MachineParameter = {
      id: crypto.randomUUID(),
      key: "",
      dataType: "number",
      options: undefined,
      required: false,
      order: parameters.length,
    };
    onChange([...parameters, newParam]);
    setExpandedId(newParam.id);
  }, [parameters, onChange]);

  // --- Remove parameter ---
  const handleRemove = useCallback(
    (id: string) => {
      const updated = parameters
        .filter((p) => p.id !== id)
        .map((p, idx) => ({ ...p, order: idx }));
      onChange(updated);
      if (expandedId === id) setExpandedId(null);
    },
    [parameters, onChange, expandedId]
  );

  // --- Move parameter up ---
  const handleMoveUp = useCallback(
    (index: number) => {
      if (index <= 0) return;
      const updated = [...parameters];
      [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
      onChange(updated.map((p, idx) => ({ ...p, order: idx })));
    },
    [parameters, onChange]
  );

  // --- Move parameter down ---
  const handleMoveDown = useCallback(
    (index: number) => {
      if (index >= parameters.length - 1) return;
      const updated = [...parameters];
      [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
      onChange(updated.map((p, idx) => ({ ...p, order: idx })));
    },
    [parameters, onChange]
  );

  // --- Update parameter key ---
  const handleKeyChange = useCallback(
    (id: string, newKey: string) => {
      onChange(
        parameters.map((p) => (p.id === id ? { ...p, key: newKey } : p))
      );
    },
    [parameters, onChange]
  );

  // --- Update data type ---
  const handleTypeChange = useCallback(
    (id: string, dataType: ParamDataType) => {
      onChange(
        parameters.map((p) =>
          p.id === id
            ? {
                ...p,
                dataType,
                options: dataType === "selection" ? p.options ?? [] : undefined,
              }
            : p
        )
      );
    },
    [parameters, onChange]
  );

  // --- Toggle required ---
  const handleRequiredToggle = useCallback(
    (id: string) => {
      onChange(
        parameters.map((p) =>
          p.id === id ? { ...p, required: !p.required } : p
        )
      );
    },
    [parameters, onChange]
  );

  // --- Selection options management ---
  const handleAddOption = useCallback(
    (id: string) => {
      onChange(
        parameters.map((p) => {
          if (p.id !== id) return p;
          const options = p.options ?? [];
          if (options.length >= MAX_OPTIONS) return p;
          return { ...p, options: [...options, ""] };
        })
      );
    },
    [parameters, onChange]
  );

  const handleOptionChange = useCallback(
    (id: string, optionIndex: number, value: string) => {
      // Enforce max length
      const trimmed = value.slice(0, MAX_OPTION_LENGTH);
      onChange(
        parameters.map((p) => {
          if (p.id !== id) return p;
          const options = [...(p.options ?? [])];
          options[optionIndex] = trimmed;
          return { ...p, options };
        })
      );
    },
    [parameters, onChange]
  );

  const handleRemoveOption = useCallback(
    (id: string, optionIndex: number) => {
      onChange(
        parameters.map((p) => {
          if (p.id !== id) return p;
          const options = (p.options ?? []).filter((_, i) => i !== optionIndex);
          return { ...p, options };
        })
      );
    },
    [parameters, onChange]
  );

  // --- Validation helper ---
  const getKeyError = (param: MachineParameter): string | null => {
    if (param.key.length === 0) return null; // don't show error for empty (user hasn't typed yet)
    const existingKeys = parameters
      .filter((p) => p.id !== param.id)
      .map((p) => p.key);
    const result = validateParameterKey(param.key, existingKeys);
    return result.valid ? null : result.error;
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">
          Parameters{" "}
          <span className="text-xs font-normal text-gray-400">
            ({parameters.length}/{MAX_PARAMETERS})
          </span>
        </h4>
        <button
          type="button"
          onClick={handleAdd}
          disabled={parameters.length >= MAX_PARAMETERS}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Add parameter"
        >
          <Plus size={14} />
          Add Parameter
        </button>
      </div>

      {/* Parameter list */}
      {parameters.length === 0 && (
        <p className="text-xs text-gray-400 italic">
          No parameters defined. Click &quot;Add Parameter&quot; to create one.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {parameters.map((param, index) => {
          const keyError = getKeyError(param);
          const sourceManaged = param.origin === "stream";

          return (
            <div
              key={param.id}
              className="border border-gray-200 rounded-lg p-3 bg-white"
            >
              {/* Main row */}
              <div className="flex items-start gap-2">
                {/* Reorder buttons */}
                <div className="flex flex-col gap-0.5 pt-1">
                  <button
                    type="button"
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0 || sourceManaged}
                    className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label={`Move parameter ${param.key || "unnamed"} up`}
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveDown(index)}
                    disabled={index === parameters.length - 1 || sourceManaged}
                    className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label={`Move parameter ${param.key || "unnamed"} down`}
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>

                {/* Key input */}
                <div className="flex flex-col flex-1 min-w-0">
                  <input
                    type="text"
                    value={param.key}
                    onChange={(e) => handleKeyChange(param.id, e.target.value)}
                    disabled={sourceManaged}
                    placeholder="parameter_key"
                    maxLength={64}
                    className={`w-full px-2.5 py-1.5 text-sm border rounded-md outline-none transition-colors ${
                      keyError
                        ? "border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-200"
                        : "border-gray-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                    }`}
                    aria-label={`Key for parameter ${index + 1}`}
                    aria-invalid={!!keyError}
                    aria-describedby={keyError ? `param-error-${param.id}` : undefined}
                  />
                  {keyError && (
                    <span
                      id={`param-error-${param.id}`}
                      className="text-xs text-red-500 mt-0.5"
                      role="alert"
                    >
                      {keyError}
                    </span>
                  )}
                </div>

                {/* Data type selector */}
                <select
                  value={param.dataType}
                  onChange={(e) =>
                    handleTypeChange(param.id, e.target.value as ParamDataType)
                  }
                  disabled={sourceManaged}
                  className="px-2 py-1.5 text-sm border border-gray-200 rounded-md bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none"
                  aria-label={`Data type for parameter ${param.key || index + 1}`}
                >
                  {DATA_TYPES.map((dt) => (
                    <option key={dt.value} value={dt.value}>
                      {dt.label}
                    </option>
                  ))}
                </select>

                {/* Required toggle */}
                <label className="flex items-center gap-1 cursor-pointer select-none pt-1">
                  <input
                    type="checkbox"
                    checked={param.required}
                    onChange={() => handleRequiredToggle(param.id)}
                    disabled={sourceManaged}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs text-gray-500">Req</span>
                </label>

                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => handleRemove(param.id)}
                  disabled={sourceManaged}
                  className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                  aria-label={`Remove parameter ${param.key || "unnamed"}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {sourceManaged && (
                <p className="mt-1 ml-7 text-[11px] text-blue-600">
                  Managed by data stream · {param.label || param.key} · {param.unit || "unitless"}
                </p>
              )}

              {/* Selection options sub-form */}
              {param.dataType === "selection" && (
                <div className="mt-2 ml-7 pl-2 border-l-2 border-blue-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-gray-500">
                      Options ({(param.options ?? []).length}/{MAX_OPTIONS})
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAddOption(param.id)}
                      disabled={sourceManaged || (param.options ?? []).length >= MAX_OPTIONS}
                      className="inline-flex items-center gap-0.5 px-2 py-0.5 text-xs text-blue-600 hover:text-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label={`Add option to parameter ${param.key || "unnamed"}`}
                    >
                      <Plus size={12} />
                      Add
                    </button>
                  </div>

                  {(param.options ?? []).length === 0 && (
                    <p className="text-xs text-gray-400 italic">
                      No options defined. Add at least one option for selection type.
                    </p>
                  )}

                  <div className="flex flex-col gap-1">
                    {(param.options ?? []).map((option, optIdx) => (
                      <div key={optIdx} className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={option}
                          onChange={(e) =>
                            handleOptionChange(param.id, optIdx, e.target.value)
                          }
                          placeholder={`Option ${optIdx + 1}`}
                          maxLength={MAX_OPTION_LENGTH}
                          disabled={sourceManaged}
                          className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-md focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none"
                          aria-label={`Option ${optIdx + 1} for parameter ${param.key || "unnamed"}`}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(param.id, optIdx)}
                          disabled={sourceManaged}
                          className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
                          aria-label={`Remove option ${optIdx + 1}`}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

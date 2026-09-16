"use client";

import { Plus, Trash2, X, FileSpreadsheet } from "lucide-react";
import { useCallback, useState } from "react";
import { useFactoryBuilder } from "@/lib/factory-builder-context";
import { validateMachineName, validateIOSpec } from "@/lib/spatial-validators";
import type { IOSpec, MachineParameter, CustomKpi } from "@/lib/spatial-types";
import { ParametersSection } from "./ParametersSection";
import { KpiSection } from "./KpiSection";
import { QrCodePreview } from "./QrCodePreview";
import { MachineHistorySheetModal } from "./MachineHistorySheetModal";

export interface MachineConfigPanelProps {
  machineId: string;
  isNew: boolean; // true if just placed, false if editing existing
  onClose: () => void;
}

interface IOSpecDraft {
  id: string;
  label: string;
  unitType: string;
}

function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Slide-over panel for configuring a machine node.
 * Collects machine name and I/O specifications (inputs/outputs).
 * On confirm: calls configureMachine to persist config.
 * On cancel: removes machine if new, or simply closes if editing.
 *
 * Requirements: 3.3, 3.4, 3.5, 3.7
 */
export function MachineConfigPanel({
  machineId,
  isNew,
  onClose,
}: MachineConfigPanelProps) {
  const { state, configureMachine, removeMachine } = useFactoryBuilder();

  // Load existing machine data if editing
  const existingMachine = state.layout.machines.find((m) => m.id === machineId);

  const [name, setName] = useState(existingMachine?.name ?? "");
  const [inputs, setInputs] = useState<IOSpecDraft[]>(
    existingMachine?.inputs.map((io) => ({ id: io.id, label: io.label, unitType: io.unitType })) ?? []
  );
  const [outputs, setOutputs] = useState<IOSpecDraft[]>(
    existingMachine?.outputs.map((io) => ({ id: io.id, label: io.label, unitType: io.unitType })) ?? []
  );
  const [parameters, setParameters] = useState<MachineParameter[]>(
    existingMachine?.parameters ?? []
  );
  const [customKpis, setCustomKpis] = useState<CustomKpi[]>(
    existingMachine?.customKpis ?? []
  );
  const [showHistorySheet, setShowHistorySheet] = useState(false);

  // Validation
  const nameValidation = name.trim().length === 0 ? null : validateMachineName(name.trim());
  const nameError = nameValidation && !nameValidation.valid ? nameValidation.error : null;

  const isNameValid = name.trim().length > 0 && (!nameValidation || nameValidation.valid);

  // Validate all I/O specs
  function validateIOSpecs(specs: IOSpecDraft[]): boolean {
    for (const spec of specs) {
      if (spec.label.trim().length === 0) return false;
      const result = validateIOSpec(spec.label.trim());
      if (!result.valid) return false;
      if (spec.unitType.trim().length === 0) return false;
    }
    return true;
  }

  const inputsValid = validateIOSpecs(inputs);
  const outputsValid = validateIOSpecs(outputs);
  const isFormValid = isNameValid && inputsValid && outputsValid;

  // Actions
  const handleConfirm = useCallback(() => {
    if (!isFormValid) return;

    const configuredInputs: IOSpec[] = inputs.map((io) => ({
      id: io.id,
      label: io.label.trim(),
      unitType: io.unitType.trim(),
    }));

    const configuredOutputs: IOSpec[] = outputs.map((io) => ({
      id: io.id,
      label: io.label.trim(),
      unitType: io.unitType.trim(),
    }));

    configureMachine(machineId, {
      name: name.trim(),
      inputs: configuredInputs,
      outputs: configuredOutputs,
      parameters,
      customKpis,
    });

    onClose();
  }, [isFormValid, inputs, outputs, name, machineId, configureMachine, onClose]);

  const handleCancel = useCallback(() => {
    if (isNew) {
      removeMachine(machineId);
    }
    onClose();
  }, [isNew, removeMachine, machineId, onClose]);

  // Delete machine with double confirmation
  const [deleteStep, setDeleteStep] = useState<"idle" | "confirming">("idle");

  // I/O management
  const addInput = useCallback(() => {
    if (inputs.length >= 10) return;
    setInputs((prev) => [...prev, { id: generateId(), label: "", unitType: "" }]);
  }, [inputs.length]);

  const removeInput = useCallback((id: string) => {
    setInputs((prev) => prev.filter((io) => io.id !== id));
  }, []);

  const updateInput = useCallback((id: string, field: "label" | "unitType", value: string) => {
    setInputs((prev) =>
      prev.map((io) => (io.id === id ? { ...io, [field]: value } : io))
    );
  }, []);

  const addOutput = useCallback(() => {
    if (outputs.length >= 10) return;
    setOutputs((prev) => [...prev, { id: generateId(), label: "", unitType: "" }]);
  }, [outputs.length]);

  const removeOutput = useCallback((id: string) => {
    setOutputs((prev) => prev.filter((io) => io.id !== id));
  }, []);

  const updateOutput = useCallback((id: string, field: "label" | "unitType", value: string) => {
    setOutputs((prev) =>
      prev.map((io) => (io.id === id ? { ...io, [field]: value } : io))
    );
  }, []);

  return (
    <div className="machine-config-backdrop" onClick={handleCancel}>
      <aside
        className="machine-config-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="machine-config-title"
      >
        {/* Header */}
        <div className="machine-config-header">
          <h2 id="machine-config-title">Configure Machine</h2>
          <button
            className="machine-config-close"
            onClick={handleCancel}
            aria-label="Close panel"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="machine-config-body">
          {/* Machine Name */}
          <div className="builder-dialog-field">
            <label className="builder-dialog-label" htmlFor="machine-name">
              Machine Name <span className="machine-config-required">*</span>
            </label>
            <input
              id="machine-name"
              type="text"
              className={`builder-dialog-input ${nameError ? "builder-dialog-input-error" : ""}`}
              placeholder="e.g. CNC Mill A"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              autoFocus
            />
            {nameError && (
              <span className="builder-dialog-error" role="alert">
                {nameError}
              </span>
            )}
            <span className="machine-config-hint">
              {name.trim().length}/50 characters
            </span>
          </div>

          {/* Inputs Section */}
          <fieldset className="machine-config-io-section">
            <legend className="builder-dialog-label">
              Inputs ({inputs.length}/10)
            </legend>
            {inputs.map((io) => (
              <IOSpecRow
                key={io.id}
                spec={io}
                onUpdate={(field, value) => updateInput(io.id, field, value)}
                onRemove={() => removeInput(io.id)}
              />
            ))}
            {inputs.length < 10 && (
              <button
                type="button"
                className="machine-config-add-btn"
                onClick={addInput}
              >
                <Plus size={14} />
                Add Input
              </button>
            )}
          </fieldset>

          {/* Outputs Section */}
          <fieldset className="machine-config-io-section">
            <legend className="builder-dialog-label">
              Outputs ({outputs.length}/10)
            </legend>
            {outputs.map((io) => (
              <IOSpecRow
                key={io.id}
                spec={io}
                onUpdate={(field, value) => updateOutput(io.id, field, value)}
                onRemove={() => removeOutput(io.id)}
              />
            ))}
            {outputs.length < 10 && (
              <button
                type="button"
                className="machine-config-add-btn"
                onClick={addOutput}
              >
                <Plus size={14} />
                Add Output
              </button>
            )}
          </fieldset>

          {/* Parameters Section */}
          <ParametersSection parameters={parameters} onChange={setParameters} />

          {/* Custom KPIs Section */}
          <KpiSection kpis={customKpis} parameters={parameters} onChange={setCustomKpis} />
        </div>

        {/* Footer */}
        <div className="machine-config-footer">
          {/* Delete button (only for existing machines, with double confirmation) */}
          {!isNew && (
            <div className="flex items-center">
              {deleteStep === "idle" && (
                <button
                  className="button button-danger"
                  onClick={() => setDeleteStep("confirming")}
                  type="button"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              )}
              {deleteStep === "confirming" && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600 font-medium">Sure?</span>
                  <button
                    className="button button-danger"
                    onClick={() => { removeMachine(machineId); onClose(); }}
                    type="button"
                  >
                    Yes, Delete
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={() => setDeleteStep("idle")}
                    type="button"
                  >
                    No
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              className="button button-secondary"
              onClick={handleCancel}
              type="button"
            >
              Cancel
            </button>
            <button
              className="button button-primary"
              onClick={handleConfirm}
              disabled={!isFormValid}
              type="button"
            >
              Confirm
            </button>
          </div>
        </div>

        {/* QR Code Preview & History Sheet for existing (saved) machines */}
        {!isNew && existingMachine && (
          <div className="px-4 pb-4 space-y-2">
            <button
              type="button"
              onClick={() => setShowHistorySheet(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <FileSpreadsheet size={15} className="text-emerald-700" />
              View Full History (Sheet Preview)
            </button>
            <QrCodePreview machineId={machineId} machineName={name || existingMachine.name} />
          </div>
        )}
      </aside>

      {/* Full History Sheet Modal */}
      {showHistorySheet && existingMachine && (
        <MachineHistorySheetModal
          machineId={machineId}
          machineName={name || existingMachine.name}
          parameters={parameters}
          inputs={inputs}
          outputs={outputs}
          onClose={() => setShowHistorySheet(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// IOSpecRow sub-component
// ---------------------------------------------------------------------------

const UNIT_TYPE_OPTIONS = [
  // Mass / Weight
  { value: "kilograms", label: "Kilograms (kg)", group: "Mass" },
  { value: "grams", label: "Grams (g)", group: "Mass" },
  { value: "milligrams", label: "Milligrams (mg)", group: "Mass" },
  { value: "tonnes", label: "Tonnes (t)", group: "Mass" },
  { value: "pounds", label: "Pounds (lb)", group: "Mass" },
  { value: "ounces", label: "Ounces (oz)", group: "Mass" },
  // Volume
  { value: "litres", label: "Litres (L)", group: "Volume" },
  { value: "millilitres", label: "Millilitres (mL)", group: "Volume" },
  { value: "cubic_meters", label: "Cubic meters (m³)", group: "Volume" },
  { value: "gallons", label: "Gallons (gal)", group: "Volume" },
  { value: "barrels", label: "Barrels (bbl)", group: "Volume" },
  // Length / Distance
  { value: "meters", label: "Meters (m)", group: "Length" },
  { value: "centimeters", label: "Centimeters (cm)", group: "Length" },
  { value: "millimeters", label: "Millimeters (mm)", group: "Length" },
  { value: "kilometers", label: "Kilometers (km)", group: "Length" },
  { value: "inches", label: "Inches (in)", group: "Length" },
  { value: "feet", label: "Feet (ft)", group: "Length" },
  { value: "yards", label: "Yards (yd)", group: "Length" },
  // Area
  { value: "square_meters", label: "Square meters (m²)", group: "Area" },
  { value: "square_feet", label: "Square feet (ft²)", group: "Area" },
  { value: "square_centimeters", label: "Square centimeters (cm²)", group: "Area" },
  // Count / Quantity
  { value: "units", label: "Units", group: "Count" },
  { value: "pieces", label: "Pieces (pcs)", group: "Count" },
  { value: "dozen", label: "Dozen", group: "Count" },
  { value: "pairs", label: "Pairs", group: "Count" },
  { value: "batches", label: "Batches", group: "Count" },
  // Packaging
  { value: "bags", label: "Bags", group: "Packaging" },
  { value: "boxes", label: "Boxes", group: "Packaging" },
  { value: "cartons", label: "Cartons", group: "Packaging" },
  { value: "crates", label: "Crates", group: "Packaging" },
  { value: "pallets", label: "Pallets", group: "Packaging" },
  { value: "rolls", label: "Rolls", group: "Packaging" },
  { value: "sheets", label: "Sheets", group: "Packaging" },
  { value: "bottles", label: "Bottles", group: "Packaging" },
  { value: "cans", label: "Cans", group: "Packaging" },
  { value: "packets", label: "Packets", group: "Packaging" },
  { value: "drums", label: "Drums", group: "Packaging" },
  { value: "containers", label: "Containers", group: "Packaging" },
  { value: "bundles", label: "Bundles", group: "Packaging" },
  { value: "sacks", label: "Sacks", group: "Packaging" },
  // Time
  { value: "seconds", label: "Seconds (s)", group: "Time" },
  { value: "minutes", label: "Minutes (min)", group: "Time" },
  { value: "hours", label: "Hours (hr)", group: "Time" },
  { value: "days", label: "Days", group: "Time" },
  // Temperature
  { value: "celsius", label: "Celsius (°C)", group: "Temperature" },
  { value: "fahrenheit", label: "Fahrenheit (°F)", group: "Temperature" },
  { value: "kelvin", label: "Kelvin (K)", group: "Temperature" },
  // Pressure
  { value: "pascal", label: "Pascal (Pa)", group: "Pressure" },
  { value: "bar", label: "Bar", group: "Pressure" },
  { value: "psi", label: "PSI", group: "Pressure" },
  // Energy / Power
  { value: "joules", label: "Joules (J)", group: "Energy" },
  { value: "kilowatt_hours", label: "Kilowatt-hours (kWh)", group: "Energy" },
  { value: "watts", label: "Watts (W)", group: "Energy" },
  { value: "kilowatts", label: "Kilowatts (kW)", group: "Energy" },
  // Speed / Flow
  { value: "meters_per_second", label: "Meters/sec (m/s)", group: "Speed" },
  { value: "litres_per_minute", label: "Litres/min (L/min)", group: "Speed" },
  { value: "cubic_meters_per_hour", label: "m³/hour", group: "Speed" },
  { value: "rpm", label: "RPM", group: "Speed" },
  // Electrical
  { value: "volts", label: "Volts (V)", group: "Electrical" },
  { value: "amperes", label: "Amperes (A)", group: "Electrical" },
  { value: "ohms", label: "Ohms (Ω)", group: "Electrical" },
  // Concentration
  { value: "percent", label: "Percent (%)", group: "Concentration" },
  { value: "ppm", label: "Parts per million (ppm)", group: "Concentration" },
  { value: "ph", label: "pH", group: "Concentration" },
] as const;

/** Group unit options by category for the <optgroup> rendering */
const UNIT_TYPE_GROUPS = UNIT_TYPE_OPTIONS.reduce<Record<string, typeof UNIT_TYPE_OPTIONS[number][]>>(
  (acc, opt) => {
    if (!acc[opt.group]) acc[opt.group] = [];
    acc[opt.group].push(opt);
    return acc;
  },
  {}
);

interface IOSpecRowProps {
  spec: IOSpecDraft;
  onUpdate: (field: "label" | "unitType", value: string) => void;
  onRemove: () => void;
}

function IOSpecRow({ spec, onUpdate, onRemove }: IOSpecRowProps) {
  const labelValidation =
    spec.label.trim().length === 0 ? null : validateIOSpec(spec.label.trim());
  const labelError = labelValidation && !labelValidation.valid ? labelValidation.error : null;

  return (
    <div className="machine-config-io-row">
      <div className="machine-config-io-field">
        <label className="builder-dialog-label text-xs text-gray-500 mb-1 block">
          Label <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          className={`builder-dialog-input ${labelError ? "builder-dialog-input-error" : ""}`}
          placeholder="e.g. Raw material feed"
          value={spec.label}
          onChange={(e) => onUpdate("label", e.target.value)}
          maxLength={30}
          aria-label="I/O label"
        />
        {labelError && (
          <span className="builder-dialog-error" role="alert">
            {labelError}
          </span>
        )}
      </div>
      <div className="machine-config-io-field">
        <label className="builder-dialog-label text-xs text-gray-500 mb-1 block">
          Unit Type <span className="text-red-400">*</span>
        </label>
        <select
          className="builder-dialog-input"
          value={spec.unitType}
          onChange={(e) => onUpdate("unitType", e.target.value)}
          aria-label="Unit type"
        >
          <option value="" disabled>Select unit type</option>
          {Object.entries(UNIT_TYPE_GROUPS).map(([group, options]) => (
            <optgroup key={group} label={group}>
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <button
        type="button"
        className="machine-config-remove-btn"
        onClick={onRemove}
        aria-label="Remove specification"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

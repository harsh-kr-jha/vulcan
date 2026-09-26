"use client";

import { Box, Copy, Cuboid, Move, Plus, Trash2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useFactoryBuilder } from "@/lib/factory-builder-context";
import { useFactory } from "@/lib/factory-context";
import { api, getCsrfToken } from "@/lib/api-client";
import type { DataInputStream } from "@/lib/data-stream-types";
import { validateMachineName, validateIOSpec } from "@/lib/spatial-validators";
import type { IOSpec, MachineParameter, CustomKpi, FactoryModelAsset, MachineModelTransform } from "@/lib/spatial-types";
import { ParametersSection } from "./ParametersSection";
import { KpiSection } from "./KpiSection";
import { QrCodePreview } from "./QrCodePreview";

export interface MachineConfigPanelProps {
  machineId: string;
  isNew: boolean; // true if just placed, false if editing existing
  onClose: () => void;
  onMove: (machineId: string) => void;
  onDuplicate: (machineId: string) => void;
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
  onMove,
  onDuplicate,
}: MachineConfigPanelProps) {
  const { state, configureMachine, removeMachine } = useFactoryBuilder();
  const { state: factoryState } = useFactory();

  // Load existing machine data if editing
  const existingMachine = state.layout.machines.find((m) => m.id === machineId);
  const [name, setName] = useState(existingMachine?.name ?? "");
  const [code, setCode] = useState(existingMachine?.code ?? "");
  const [processId, setProcessId] = useState(existingMachine?.processId ?? "");
  const [visualHeight, setVisualHeight] = useState(existingMachine?.visualHeight ?? 1);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(existingMachine?.rotation ?? 0);
  const [representation, setRepresentation] = useState<"block" | "glb">(existingMachine?.representation ?? "block");
  const [blockColor, setBlockColor] = useState(existingMachine?.blockColor ?? "#DBEAFE");
  const [modelAsset, setModelAsset] = useState<FactoryModelAsset | null>(existingMachine?.modelAsset ?? null);
  const [modelTransform, setModelTransform] = useState<MachineModelTransform>(existingMachine?.modelTransform ?? { elevation: 0, scale: 1, rotationY: 0 });
  const [modelUploading, setModelUploading] = useState(false);
  const [modelDeleting, setModelDeleting] = useState(false);
  const [modelDeleteConfirm, setModelDeleteConfirm] = useState(false);
  const [modelError, setModelError] = useState("");
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
  const [streams, setStreams] = useState<DataInputStream[]>([]);
  const [dataStreamId, setDataStreamId] = useState(existingMachine?.dataStreamId ?? existingMachine?.streamBinding?.streamId ?? "");
  const [channelId, setChannelId] = useState(existingMachine?.dataStreamChannelId ?? existingMachine?.streamBinding?.channelId ?? "");

  useEffect(() => {
    let cancelled = false;
    api.listDataStreams(factoryState.activeFactoryId).then((items) => { if (!cancelled) setStreams(items); }).catch(() => { if (!cancelled) setStreams([]); });
    return () => { cancelled = true; };
  }, [factoryState.activeFactoryId]);

  const selectedStream = streams.find((stream) => stream.id === dataStreamId);
  const selectedChannel = selectedStream?.channels.find((channel) => channel.id === channelId);
  const incomingFields = selectedChannel?.schema.fields ?? [];
  const replacementKeys = parameters
    .filter(
      (parameter) =>
        parameter.origin !== "stream" &&
        incomingFields.some((field) => field.key.toLowerCase() === parameter.key.toLowerCase())
    )
    .map((parameter) => parameter.key);
  const typeChangedKeys = parameters
    .filter((parameter) => {
      const field = incomingFields.find(
        (candidate) => candidate.key.toLowerCase() === parameter.key.toLowerCase()
      );
      return field && field.data_type !== parameter.dataType;
    })
    .map((parameter) => parameter.key);
  const affectedKpis = customKpis
    .filter((kpi) =>
      kpi.formula.operations.some((operation) => typeChangedKeys.includes(operation.parameterKey))
    )
    .map((kpi) => kpi.name);

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
  const isFormValid = isNameValid && inputsValid && outputsValid && (!dataStreamId || !!channelId);

  // Actions
  const saveConfiguration = useCallback(() => {
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
      code: code.trim().toUpperCase(),
      processId: processId || null,
      visualHeight,
      rotation,
      representation,
      blockColor,
      modelAsset,
      modelTransform,
      inputs: configuredInputs,
      outputs: configuredOutputs,
      parameters,
      customKpis,
      dataStreamId: dataStreamId || null,
      dataStreamChannelId: channelId || null,
    });
  }, [isFormValid, inputs, outputs, name, code, processId, visualHeight, rotation, representation, blockColor, modelAsset, modelTransform, parameters, customKpis, dataStreamId, channelId, machineId, configureMachine]);

  const handleConfirm = useCallback(() => {
    if (!isFormValid) return;
    saveConfiguration();

    onClose();
  }, [isFormValid, saveConfiguration, onClose]);

  const handlePlacementAction = useCallback((action: "move" | "duplicate") => {
    if (!isFormValid) return;
    saveConfiguration();
    if (action === "move") onMove(machineId);
    else onDuplicate(machineId);
  }, [isFormValid, saveConfiguration, onMove, onDuplicate, machineId]);

  function updateModelTransform(key: keyof MachineModelTransform, value: number) {
    setModelTransform((current) => ({ ...current, [key]: Number.isFinite(value) ? value : 0 }));
  }

  async function uploadMachineModel(file?: File) {
    if (!file || isNew) return;
    setModelUploading(true);
    setModelError("");
    try {
      const data = new FormData();
      data.append("file", file);
      const response = await fetch(`/api/backend/api/spatial/machines/${machineId}/model/`, {
        method: "POST",
        headers: { "X-CSRFToken": await getCsrfToken() },
        credentials: "same-origin",
        body: data,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.file ?? body.detail ?? "Upload failed.");
      const asset = { id: body.id, filename: body.filename, sizeBytes: body.size_bytes, checksumSha256: body.checksum_sha256, downloadUrl: body.download_url } as FactoryModelAsset;
      setModelAsset(asset);
      setRepresentation("glb");
      setModelDeleteConfirm(false);
    } catch (cause) {
      setModelError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setModelUploading(false);
    }
  }

  async function deleteMachineModel() {
    if (isNew || !modelAsset) return;
    setModelDeleting(true);
    setModelError("");
    try {
      const response = await fetch(`/api/backend/api/spatial/machines/${machineId}/model/`, {
        method: "DELETE",
        headers: { "X-CSRFToken": await getCsrfToken() },
        credentials: "same-origin",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail ?? "Delete failed.");
      setModelAsset(null);
      setRepresentation("block");
      setModelDeleteConfirm(false);
      configureMachine(machineId, { modelAsset: null, representation: "block" });
    } catch (cause) {
      setModelError(cause instanceof Error ? cause.message : "Delete failed.");
    } finally {
      setModelDeleting(false);
    }
  }

  const handleCancel = useCallback(() => {
    if (isNew) {
      removeMachine(machineId);
    }
    onClose();
  }, [isNew, removeMachine, machineId, onClose]);

  // Delete machine with double confirmation
  const [deleteStep, setDeleteStep] = useState<"idle" | "confirming">("idle");

  // I/O management
  function addInput() {
    if (inputs.length >= 10) return;
    setInputs((prev) => [...prev, { id: generateId(), label: "", unitType: "" }]);
  }

  function removeInput(id: string) {
    setInputs((prev) => prev.filter((io) => io.id !== id));
  }

  function updateInput(id: string, field: "label" | "unitType", value: string) {
    setInputs((prev) =>
      prev.map((io) => (io.id === id ? { ...io, [field]: value } : io))
    );
  }

  function addOutput() {
    if (outputs.length >= 10) return;
    setOutputs((prev) => [...prev, { id: generateId(), label: "", unitType: "" }]);
  }

  function removeOutput(id: string) {
    setOutputs((prev) => prev.filter((io) => io.id !== id));
  }

  function updateOutput(id: string, field: "label" | "unitType", value: string) {
    setOutputs((prev) =>
      prev.map((io) => (io.id === id ? { ...io, [field]: value } : io))
    );
  }

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
          {!isNew && <a className="button button-secondary" href={`/digital-twin/ml/${machineId}`}>ML Observation</a>}
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
          <div className="grid grid-cols-2 gap-3">
            <div className="builder-dialog-field"><label className="builder-dialog-label" htmlFor="machine-height">Visual height</label><input id="machine-height" type="number" min="0.25" max="100" step="0.25" className="builder-dialog-input" value={visualHeight} onChange={(event) => setVisualHeight(Math.max(0.25, Number(event.target.value)))} /></div>
            <div className="builder-dialog-field"><label className="builder-dialog-label" htmlFor="machine-rotation">Rotation</label><select id="machine-rotation" className="builder-dialog-input" value={rotation} onChange={(event) => setRotation(Number(event.target.value) as 0 | 90 | 180 | 270)}><option value={0}>0°</option><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270°</option></select></div>
          </div>

          <fieldset className="machine-config-io-section">
            <legend className="builder-dialog-label">Machine appearance</legend>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={`button ${representation === "block" ? "button-primary" : "button-secondary"}`} onClick={() => setRepresentation("block")}><Box size={14} /> Block</button>
              <button type="button" className={`button ${representation === "glb" ? "button-primary" : "button-secondary"}`} disabled={!modelAsset} onClick={() => setRepresentation("glb")}><Cuboid size={14} /> GLB model</button>
            </div>
            {representation === "block" ? (
              <label className="builder-dialog-label mt-3 flex items-center justify-between">Block color<input type="color" value={blockColor} onChange={(event) => setBlockColor(event.target.value.toUpperCase())} className="h-9 w-14 rounded border border-slate-200 bg-white p-1" /></label>
            ) : null}
            <div className="mt-3 rounded-lg border border-slate-200 p-3">
              {modelAsset && <div className="mb-3 text-xs text-slate-600"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><strong className="block truncate text-slate-900">{modelAsset.filename}</strong>{(modelAsset.sizeBytes / 1024 / 1024).toFixed(1)} MB</div>{!modelDeleteConfirm && <button type="button" className="inline-flex shrink-0 items-center gap-1 font-semibold text-red-600 hover:text-red-700" onClick={() => setModelDeleteConfirm(true)} disabled={modelDeleting}><Trash2 size={13} /> Delete GLB</button>}</div>{modelDeleteConfirm && <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-200 pt-3"><span className="mr-auto text-slate-600">Remove this model?</span><button type="button" className="button button-secondary" onClick={() => setModelDeleteConfirm(false)} disabled={modelDeleting}>Cancel</button><button type="button" className="button button-danger" onClick={() => void deleteMachineModel()} disabled={modelDeleting}><Trash2 size={13} />{modelDeleting ? "Deleting…" : "Delete"}</button></div>}</div>}
              <label className={`button button-secondary inline-flex cursor-pointer ${isNew || modelUploading || modelDeleting ? "pointer-events-none opacity-50" : ""}`}><Upload size={13} />{modelUploading ? "Uploading…" : modelAsset ? "Replace GLB" : "Attach GLB"}<input className="hidden" type="file" accept=".glb,model/gltf-binary" onChange={(event) => void uploadMachineModel(event.target.files?.[0])} /></label>
              {isNew && <p className="mt-2 text-xs text-amber-700">Save the layout once, then edit this machine to attach its GLB.</p>}
              {modelError && <p className="mt-2 text-xs text-red-600">{modelError}</p>}
              {modelAsset && <div className="mt-3 grid grid-cols-3 gap-2">{([['scale','Scale',0.01,0.05],['rotationY','Model rotation',undefined,5],['elevation','Elevation',undefined,0.1]] as const).map(([key,label,min,step]) => <label key={key} className="text-[11px] text-slate-600">{label}<input className="builder-dialog-input mt-1" type="number" min={min} step={step} value={modelTransform[key]} onChange={(event) => updateModelTransform(key, Number(event.target.value))} /></label>)}</div>}
              <p className="mt-2 text-[11px] text-slate-500">GLBs render only in 3D. The block footprint remains in 2D and is always used for selection and live status.</p>
            </div>
          </fieldset>

          <div className="builder-dialog-field">
            <label className="builder-dialog-label" htmlFor="machine-code">Machine code</label>
            <input id="machine-code" className="builder-dialog-input" placeholder="Generated from name when blank" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={60} />
          </div>
          <div className="builder-dialog-field">
            <label className="builder-dialog-label" htmlFor="machine-process">Production process</label>
            <select id="machine-process" className="builder-dialog-input" value={processId} onChange={(event) => setProcessId(event.target.value)}>
              <option value="">Not assigned</option>
              {factoryState.masters.processes.filter((item) => item.active && item.factoryId === factoryState.activeFactoryId).map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}
            </select>
          </div>

          <fieldset className="machine-config-io-section">
            <legend className="builder-dialog-label">Data input stream</legend>
            <label className="block text-xs text-gray-500 mb-2">Source
              <select className="builder-dialog-input mt-1" value={dataStreamId} onChange={(event) => {
                const nextId = event.target.value;
                const next = streams.find((stream) => stream.id === nextId);
                setDataStreamId(nextId);
                setChannelId(next?.channels.find((channel) => !channel.assigned_machine_id || channel.assigned_machine_id === machineId)?.id ?? "");
              }}>
                <option value="">No live stream</option>
                {streams.filter((stream) => stream.enabled && stream.status === "connected").map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}
              </select>
            </label>
            {dataStreamId && <label className="block text-xs text-gray-500">Channel
              <select className="builder-dialog-input mt-1" value={channelId} onChange={(event) => setChannelId(event.target.value)}>
                <option value="">Choose an available channel</option>
                {selectedStream?.channels.filter((channel) => channel.active && (!channel.assigned_machine_id || channel.assigned_machine_id === machineId)).map((channel) => <option key={channel.id} value={channel.id}>{channel.name} · {channel.schema.fields?.length ?? 0} parameters</option>)}
              </select>
            </label>}
            {selectedChannel && <div className="mt-2 rounded-md bg-blue-50 p-2 text-xs text-blue-800"><strong>{selectedChannel.schema.fields?.length ?? 0} source parameters will be initialized.</strong>{replacementKeys.length > 0 && <p className="mt-1">Source definitions will replace: {replacementKeys.join(", ")}.</p>}{affectedKpis.length > 0 && <p className="mt-1 text-amber-800">Type changes will disable these KPIs for review: {affectedKpis.join(", ")}.</p>}</div>}
          </fieldset>

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
            <div className="flex items-center gap-2">
              <button
                className="button button-secondary"
                onClick={() => handlePlacementAction("move")}
                disabled={!isFormValid}
                type="button"
              >
                <Move size={14} />
                Move
              </button>
              <button
                className="button button-secondary"
                onClick={() => handlePlacementAction("duplicate")}
                disabled={!isFormValid}
                type="button"
              >
                <Copy size={14} />
                Duplicate
              </button>
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

        {/* QR Code Preview for existing (saved) machines */}
        {!isNew && existingMachine && (
          <div className="px-4 pb-4">
            <QrCodePreview machineId={machineId} machineName={name || existingMachine.name} />
          </div>
        )}
      </aside>
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

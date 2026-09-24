"use client";

import { X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { CONNECTOR_PRESETS, resolveConnectorConfig } from "@/lib/connector-geometry";
import { useFactoryBuilder } from "@/lib/factory-builder-context";
import type { ConnectorDirection, ConnectorGeometry, ConnectorType, ConnectorVisual } from "@/lib/spatial-types";
import { validateConnectionQuantity } from "@/lib/spatial-validators";

export interface ConnectionConfigPanelProps { connectionId: string; onClose: () => void }

const connectorTypes = Object.keys(CONNECTOR_PRESETS) as ConnectorType[];

export function ConnectionConfigPanel({ connectionId, onClose }: ConnectionConfigPanelProps) {
  const { state, configureConnection } = useFactoryBuilder();
  const existing = state.layout.connections.find((connection) => connection.id === connectionId);
  const resolved = existing ? resolveConnectorConfig(existing) : resolveConnectorConfig({ id: "", sourceId: "", targetId: "" });
  const [type, setType] = useState<ConnectorType>(resolved.type);
  const [sourceId, setSourceId] = useState(existing?.sourceId ?? "");
  const [targetId, setTargetId] = useState(existing?.targetId ?? "");
  const [direction, setDirection] = useState<ConnectorDirection>(existing?.direction ?? "forward");
  const [geometry, setGeometry] = useState<ConnectorGeometry>(resolved.geometry);
  const [visual, setVisual] = useState<ConnectorVisual>(resolved.visual);
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [materialType, setMaterialType] = useState(existing?.materialType ?? "");
  const [quantityStr, setQuantityStr] = useState(existing?.quantityPerCycle != null ? String(existing.quantityPerCycle) : "");
  const [inputSpec, setInputSpec] = useState(existing?.inputSpec ?? "");
  const [outputSpec, setOutputSpec] = useState(existing?.outputSpec ?? "");

  const errors = useMemo(() => {
    const next: string[] = [];
    if (!sourceId || !targetId || sourceId === targetId) next.push("Choose two different endpoint machines.");
    if (name.length > 50) next.push("Name must be at most 50 characters.");
    if (description.length > 200) next.push("Description must be at most 200 characters.");
    if (materialType.length > 100) next.push("Material type must be at most 100 characters.");
    if (geometry.elevation < 0 || geometry.elevation > 100) next.push("Elevation must be between 0 and 100.");
    if (geometry.diameter < 0.01 || geometry.diameter > 10) next.push("Diameter must be between 0.01 and 10.");
    if (visual.opacity < 0.1 || visual.opacity > 1) next.push("Opacity must be between 0.1 and 1.");
    if (quantityStr.trim()) {
      const parsed = Number(quantityStr);
      const result = Number.isNaN(parsed) ? { valid: false, error: "Quantity must be a valid number." } : validateConnectionQuantity(parsed);
      if (!result.valid) next.push(result.error ?? "Quantity is invalid.");
    }
    return next;
  }, [description, geometry, materialType, name, quantityStr, sourceId, targetId, visual.opacity]);

  const numberField = (key: keyof ConnectorGeometry, value: string) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) setGeometry((current) => ({ ...current, [key]: parsed }));
  };

  const chooseType = (nextType: ConnectorType) => {
    const preset = CONNECTOR_PRESETS[nextType];
    setType(nextType);
    setGeometry({ ...preset.geometry });
    setVisual({ ...preset.visual });
  };

  const handleConfirm = useCallback(() => {
    if (errors.length) return;
    configureConnection(connectionId, {
      sourceId, targetId, type, direction, geometry, visual,
      name: name.trim(), description: description.trim(), materialType: materialType.trim(),
      quantityPerCycle: quantityStr.trim() ? Number(quantityStr) : undefined,
      inputSpec: inputSpec.trim(), outputSpec: outputSpec.trim(),
    });
    onClose();
  }, [configureConnection, connectionId, description, direction, errors.length, geometry, inputSpec, materialType, name, onClose, outputSpec, quantityStr, sourceId, targetId, type, visual]);

  if (!existing) return null;
  const unit = state.layout.floor.unit === "feet" ? "ft" : "m";

  return (
    <div className="machine-config-backdrop" onClick={onClose}>
      <aside className="machine-config-panel connector-config-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="connection-config-title">
        <div className="machine-config-header">
          <div><h2 id="connection-config-title">Connector</h2><p className="machine-config-hint">Choose a flow, then tune its anchored 3D route.</p></div>
          <button className="machine-config-close" onClick={onClose} aria-label="Close panel" type="button"><X size={18} /></button>
        </div>
        <div className="machine-config-body">
          <fieldset className="builder-dialog-field">
            <legend className="builder-dialog-label">Connector type</legend>
            <div className="connector-type-grid">
              {connectorTypes.map((value) => { const preset = CONNECTOR_PRESETS[value]; return <button key={value} type="button" className={`connector-type-option${type === value ? " is-selected" : ""}`} onClick={() => chooseType(value)}><i style={{ backgroundColor: preset.visual.color }} /><span><strong>{preset.label}</strong><small>{preset.description}</small></span></button>; })}
            </div>
          </fieldset>

          <div className="connector-field-grid">
            <label className="builder-dialog-field"><span className="builder-dialog-label">From machine</span><select className="builder-dialog-input" value={sourceId} onChange={(event) => setSourceId(event.target.value)}>{state.layout.machines.map((machine) => <option key={machine.id} value={machine.id} disabled={machine.id === targetId}>{machine.name}</option>)}</select></label>
            <label className="builder-dialog-field"><span className="builder-dialog-label">To machine</span><select className="builder-dialog-input" value={targetId} onChange={(event) => setTargetId(event.target.value)}>{state.layout.machines.map((machine) => <option key={machine.id} value={machine.id} disabled={machine.id === sourceId}>{machine.name}</option>)}</select></label>
            <label className="builder-dialog-field"><span className="builder-dialog-label">Direction</span><select className="builder-dialog-input" value={direction} onChange={(event) => setDirection(event.target.value as ConnectorDirection)}><option value="forward">From → to</option><option value="reverse">To → from</option><option value="bidirectional">Bidirectional</option><option value="none">No direction</option></select></label>
            <label className="builder-dialog-field"><span className="builder-dialog-label">Elevation ({unit})</span><input className="builder-dialog-input" type="number" min="0" max="100" step="0.01" value={geometry.elevation} onChange={(event) => numberField("elevation", event.target.value)} /></label>
            <label className="builder-dialog-field"><span className="builder-dialog-label">Diameter / width ({unit})</span><input className="builder-dialog-input" type="number" min="0.01" max="10" step="0.01" value={geometry.diameter} onChange={(event) => numberField("diameter", event.target.value)} /></label>
            <label className="builder-dialog-field"><span className="builder-dialog-label">Ground-plane curve ({unit})</span><input className="builder-dialog-input" type="number" min="-100" max="100" step="0.1" value={geometry.curvature} onChange={(event) => numberField("curvature", event.target.value)} /></label>
          </div>

          <details className="connector-details">
            <summary>Endpoint position offsets</summary>
            <p className="machine-config-hint">Offsets move each edge anchor on the floor plane; elevation stays uniform across the entire route.</p>
            <div className="connector-field-grid">
              {(["sourceOffsetX", "sourceOffsetY", "targetOffsetX", "targetOffsetY"] as const).map((key) => <label key={key} className="builder-dialog-field"><span className="builder-dialog-label">{{ sourceOffsetX: "Start X", sourceOffsetY: "Start Y", targetOffsetX: "End X", targetOffsetY: "End Y" }[key]} ({unit})</span><input className="builder-dialog-input" type="number" step="0.1" value={geometry[key]} onChange={(event) => numberField(key, event.target.value)} /></label>)}
            </div>
          </details>

          <div className="connector-field-grid">
            <label className="builder-dialog-field"><span className="builder-dialog-label">Color</span><input className="builder-dialog-input connector-color-input" type="color" value={visual.color} onChange={(event) => setVisual({ ...visual, color: event.target.value.toUpperCase() })} /></label>
            <label className="builder-dialog-field"><span className="builder-dialog-label">Opacity</span><input className="builder-dialog-input" type="number" min="0.1" max="1" step="0.05" value={visual.opacity} onChange={(event) => setVisual({ ...visual, opacity: Number(event.target.value) })} /></label>
            <label className="connector-checkbox"><input type="checkbox" checked={visual.dashed} onChange={(event) => setVisual({ ...visual, dashed: event.target.checked })} /> Dashed in plan view</label>
          </div>

          <label className="builder-dialog-field"><span className="builder-dialog-label">Name</span><input className="builder-dialog-input" value={name} maxLength={50} onChange={(event) => setName(event.target.value)} placeholder="Assembly to paint" /></label>
          <label className="builder-dialog-field"><span className="builder-dialog-label">Description</span><textarea className="builder-dialog-input" value={description} maxLength={200} rows={2} onChange={(event) => setDescription(event.target.value)} placeholder="Describe this machine-to-machine flow" /></label>
          <div className="connector-field-grid">
            <label className="builder-dialog-field"><span className="builder-dialog-label">Material</span><input className="builder-dialog-input" value={materialType} maxLength={100} onChange={(event) => setMaterialType(event.target.value)} /></label>
            <label className="builder-dialog-field"><span className="builder-dialog-label">Quantity / cycle</span><input className="builder-dialog-input" type="number" min="0.01" step="any" value={quantityStr} onChange={(event) => setQuantityStr(event.target.value)} /></label>
            <label className="builder-dialog-field"><span className="builder-dialog-label">Source output</span><input className="builder-dialog-input" value={inputSpec} maxLength={200} onChange={(event) => setInputSpec(event.target.value)} /></label>
            <label className="builder-dialog-field"><span className="builder-dialog-label">Target input</span><input className="builder-dialog-input" value={outputSpec} maxLength={200} onChange={(event) => setOutputSpec(event.target.value)} /></label>
          </div>
          {errors.length > 0 && <div className="builder-dialog-error" role="alert">{errors[0]}</div>}
        </div>
        <div className="machine-config-footer"><button className="button button-secondary" onClick={onClose} type="button">Cancel</button><button className="button button-primary" onClick={handleConfirm} disabled={errors.length > 0} type="button">Save connector</button></div>
      </aside>
    </div>
  );
}

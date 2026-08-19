"use client";

import { X } from "lucide-react";
import { useCallback, useState } from "react";
import { useFactoryBuilder } from "@/lib/factory-builder-context";
import { validateConnectionQuantity } from "@/lib/spatial-validators";

export interface ConnectionConfigPanelProps {
  connectionId: string;
  onClose: () => void;
}

/**
 * Slide-over panel for configuring a connection line between two machines.
 * Collects name, description, material type, quantity per cycle, and I/O specifications.
 * On confirm: calls configureConnection to persist config.
 * On cancel: just closes (connection already exists at this point).
 *
 * Requirements: 8.4, 8.5
 */
export function ConnectionConfigPanel({
  connectionId,
  onClose,
}: ConnectionConfigPanelProps) {
  const { state, configureConnection } = useFactoryBuilder();

  // Load existing connection data
  const existingConnection = state.layout.connections.find(
    (c) => c.id === connectionId
  );

  const [name, setName] = useState(existingConnection?.name ?? "");
  const [description, setDescription] = useState(
    existingConnection?.description ?? ""
  );
  const [materialType, setMaterialType] = useState(
    existingConnection?.materialType ?? ""
  );
  const [quantityStr, setQuantityStr] = useState(
    existingConnection?.quantityPerCycle != null
      ? String(existingConnection.quantityPerCycle)
      : ""
  );
  const [inputSpec, setInputSpec] = useState(
    existingConnection?.inputSpec ?? ""
  );
  const [outputSpec, setOutputSpec] = useState(
    existingConnection?.outputSpec ?? ""
  );

  // Validation
  const nameError =
    name.length > 50 ? "Name must be at most 50 characters." : null;
  const descriptionError =
    description.length > 200
      ? "Description must be at most 200 characters."
      : null;
  const materialTypeError =
    materialType.length > 100
      ? "Material type must be at most 100 characters."
      : null;

  // Quantity validation - only validate when user has entered a value
  let quantityError: string | null = null;
  if (quantityStr.trim().length > 0) {
    const parsed = Number(quantityStr);
    if (Number.isNaN(parsed)) {
      quantityError = "Quantity must be a valid number.";
    } else {
      const result = validateConnectionQuantity(parsed);
      if (!result.valid) {
        quantityError = result.error;
      }
    }
  }

  const isFormValid =
    !nameError && !descriptionError && !materialTypeError && !quantityError;

  const handleConfirm = useCallback(() => {
    if (!isFormValid) return;

    const config: Record<string, unknown> = {};

    if (name.trim().length > 0) {
      config.name = name.trim();
    }
    if (description.trim().length > 0) {
      config.description = description.trim();
    }
    if (materialType.trim().length > 0) {
      config.materialType = materialType.trim();
    }
    if (quantityStr.trim().length > 0) {
      const parsed = Number(quantityStr);
      if (!Number.isNaN(parsed)) {
        config.quantityPerCycle = parsed;
      }
    }
    if (inputSpec.trim().length > 0) {
      config.inputSpec = inputSpec.trim();
    }
    if (outputSpec.trim().length > 0) {
      config.outputSpec = outputSpec.trim();
    }

    configureConnection(connectionId, config);
    onClose();
  }, [
    isFormValid,
    name,
    description,
    materialType,
    quantityStr,
    inputSpec,
    outputSpec,
    connectionId,
    configureConnection,
    onClose,
  ]);

  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <div className="machine-config-backdrop" onClick={handleCancel}>
      <aside
        className="machine-config-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="connection-config-title"
      >
        {/* Header */}
        <div className="machine-config-header">
          <h2 id="connection-config-title">Configure Connection</h2>
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
          {/* Connection Name */}
          <div className="builder-dialog-field">
            <label className="builder-dialog-label" htmlFor="connection-name">
              Name
            </label>
            <input
              id="connection-name"
              type="text"
              className={`builder-dialog-input ${nameError ? "builder-dialog-input-error" : ""}`}
              placeholder="e.g. Assembly to Paint"
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
              {name.length}/50 characters
            </span>
          </div>

          {/* Description */}
          <div className="builder-dialog-field">
            <label
              className="builder-dialog-label"
              htmlFor="connection-description"
            >
              Description
            </label>
            <textarea
              id="connection-description"
              className={`builder-dialog-input ${descriptionError ? "builder-dialog-input-error" : ""}`}
              placeholder="Describe the material flow between these machines"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              rows={3}
            />
            {descriptionError && (
              <span className="builder-dialog-error" role="alert">
                {descriptionError}
              </span>
            )}
            <span className="machine-config-hint">
              {description.length}/200 characters
            </span>
          </div>

          {/* Material Type */}
          <div className="builder-dialog-field">
            <label
              className="builder-dialog-label"
              htmlFor="connection-material-type"
            >
              Material Type
            </label>
            <input
              id="connection-material-type"
              type="text"
              className={`builder-dialog-input ${materialTypeError ? "builder-dialog-input-error" : ""}`}
              placeholder="e.g. Steel sheets, Polymer resin"
              value={materialType}
              onChange={(e) => setMaterialType(e.target.value)}
              maxLength={100}
            />
            {materialTypeError && (
              <span className="builder-dialog-error" role="alert">
                {materialTypeError}
              </span>
            )}
            <span className="machine-config-hint">
              {materialType.length}/100 characters
            </span>
          </div>

          {/* Quantity Per Cycle */}
          <div className="builder-dialog-field">
            <label
              className="builder-dialog-label"
              htmlFor="connection-quantity"
            >
              Quantity per Cycle
            </label>
            <input
              id="connection-quantity"
              type="number"
              className={`builder-dialog-input ${quantityError ? "builder-dialog-input-error" : ""}`}
              placeholder="0.01 – 999,999,999.99"
              value={quantityStr}
              onChange={(e) => setQuantityStr(e.target.value)}
              min={0.01}
              max={999999999.99}
              step="any"
            />
            {quantityError && (
              <span className="builder-dialog-error" role="alert">
                {quantityError}
              </span>
            )}
          </div>

          {/* Input Specification */}
          <div className="builder-dialog-field">
            <label
              className="builder-dialog-label"
              htmlFor="connection-input-spec"
            >
              Input Specification
            </label>
            <input
              id="connection-input-spec"
              type="text"
              className="builder-dialog-input"
              placeholder="What the source machine produces"
              value={inputSpec}
              onChange={(e) => setInputSpec(e.target.value)}
            />
          </div>

          {/* Output Specification */}
          <div className="builder-dialog-field">
            <label
              className="builder-dialog-label"
              htmlFor="connection-output-spec"
            >
              Output Specification
            </label>
            <input
              id="connection-output-spec"
              type="text"
              className="builder-dialog-input"
              placeholder="What the target machine receives"
              value={outputSpec}
              onChange={(e) => setOutputSpec(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="machine-config-footer">
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
      </aside>
    </div>
  );
}

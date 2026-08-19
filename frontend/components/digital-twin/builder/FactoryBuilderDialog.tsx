"use client";

import { Ruler, X } from "lucide-react";
import { useCallback, useState } from "react";
import { useFactoryBuilder } from "@/lib/factory-builder-context";
import { validateFloorDimensionValue } from "@/lib/spatial-validators";
import type { UnitSystem } from "@/lib/spatial-types";

interface FactoryBuilderDialogProps {
  factoryId: string;
  onClose: () => void;
}

/**
 * Modal dialog for initiating factory layout setup.
 * Collects floor dimensions (width × height) and unit system,
 * validates in real-time, and calls initFloor on confirm.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8
 */
export function FactoryBuilderDialog({ factoryId, onClose }: FactoryBuilderDialogProps) {
  const { initFloor } = useFactoryBuilder();

  const [widthInput, setWidthInput] = useState("");
  const [heightInput, setHeightInput] = useState("");
  const [unit, setUnit] = useState<UnitSystem>("meters");

  // Parse raw input into a number (or NaN if non-numeric)
  const parsedWidth = widthInput.trim() === "" ? NaN : Number(widthInput);
  const parsedHeight = heightInput.trim() === "" ? NaN : Number(heightInput);

  // Validate each dimension
  const widthValidation = widthInput.trim() === "" ? null : validateFloorDimensionValue(parsedWidth);
  const heightValidation = heightInput.trim() === "" ? null : validateFloorDimensionValue(parsedHeight);

  const widthError = widthValidation && !widthValidation.valid ? widthValidation.error : null;
  const heightError = heightValidation && !heightValidation.valid ? heightValidation.error : null;

  const isValid =
    widthValidation !== null &&
    widthValidation.valid &&
    heightValidation !== null &&
    heightValidation.valid;

  const handleConfirm = useCallback(() => {
    if (!isValid) return;
    initFloor({ width: parsedWidth, height: parsedHeight, unit }, factoryId);
    onClose();
  }, [isValid, initFloor, parsedWidth, parsedHeight, unit, factoryId, onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick} role="dialog" aria-modal="true" aria-labelledby="builder-dialog-title">
      <div className="upload-modal" style={{ maxWidth: 460 }}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <span className="modal-step">Factory Setup</span>
            <h2 id="builder-dialog-title">Build Factory</h2>
            <p>Define the floor dimensions and unit system for your factory layout.</p>
          </div>
          <button
            className="button button-secondary"
            onClick={onClose}
            aria-label="Close dialog"
            style={{ padding: "6px 8px", minHeight: "unset" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          <div className="builder-dialog-form">
            {/* Unit system selector */}
            <fieldset className="builder-dialog-field">
              <legend className="builder-dialog-label">Unit System</legend>
              <div className="builder-unit-toggle">
                <button
                  type="button"
                  className={`builder-unit-option ${unit === "meters" ? "builder-unit-active" : ""}`}
                  onClick={() => setUnit("meters")}
                  aria-pressed={unit === "meters"}
                >
                  <Ruler size={14} />
                  Meters
                </button>
                <button
                  type="button"
                  className={`builder-unit-option ${unit === "feet" ? "builder-unit-active" : ""}`}
                  onClick={() => setUnit("feet")}
                  aria-pressed={unit === "feet"}
                >
                  <Ruler size={14} />
                  Feet
                </button>
              </div>
            </fieldset>

            {/* Width */}
            <div className="builder-dialog-field">
              <label className="builder-dialog-label" htmlFor="floor-width">
                Width ({unit})
              </label>
              <input
                id="floor-width"
                type="number"
                className={`builder-dialog-input ${widthError ? "builder-dialog-input-error" : ""}`}
                placeholder={`e.g. 100`}
                value={widthInput}
                onChange={(e) => setWidthInput(e.target.value)}
                min={1}
                max={10000}
                step="any"
                autoFocus
              />
              {widthError && (
                <span className="builder-dialog-error" role="alert">
                  {widthError}
                </span>
              )}
            </div>

            {/* Height */}
            <div className="builder-dialog-field">
              <label className="builder-dialog-label" htmlFor="floor-height">
                Height ({unit})
              </label>
              <input
                id="floor-height"
                type="number"
                className={`builder-dialog-input ${heightError ? "builder-dialog-input-error" : ""}`}
                placeholder={`e.g. 80`}
                value={heightInput}
                onChange={(e) => setHeightInput(e.target.value)}
                min={1}
                max={10000}
                step="any"
              />
              {heightError && (
                <span className="builder-dialog-error" role="alert">
                  {heightError}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="button button-secondary" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="button button-primary"
            onClick={handleConfirm}
            disabled={!isValid}
            type="button"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

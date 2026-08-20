"use client";

import { useCallback, useState } from "react";
import type { GridPosition } from "@/lib/spatial-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MachineSizeDialogProps {
  position: GridPosition;
  onConfirm: (width: number, height: number) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_SIZE = 1;
const MAX_SIZE = 10;
const DEFAULT_SIZE = 2;

// ---------------------------------------------------------------------------
// MachineSizeDialog Component
// ---------------------------------------------------------------------------

/**
 * A small modal that appears after clicking a cell, prompting the user
 * to select the machine's size in tiles (width x height) before
 * proceeding to the MachineConfigPanel.
 */
export function MachineSizeDialog({ position, onConfirm, onCancel }: MachineSizeDialogProps) {
  const [width, setWidth] = useState(DEFAULT_SIZE);
  const [height, setHeight] = useState(DEFAULT_SIZE);

  const handleWidthChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) {
      setWidth(Math.max(MIN_SIZE, Math.min(MAX_SIZE, val)));
    }
  }, []);

  const handleHeightChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) {
      setHeight(Math.max(MIN_SIZE, Math.min(MAX_SIZE, val)));
    }
  }, []);

  const handleConfirm = useCallback(() => {
    onConfirm(width, height);
  }, [width, height, onConfirm]);

  // Generate preview grid cells
  const previewCells: React.ReactNode[] = [];
  for (let row = 0; row < Math.min(height, MAX_SIZE); row++) {
    for (let col = 0; col < Math.min(width, MAX_SIZE); col++) {
      previewCells.push(
        <div
          key={`${col}-${row}`}
          className="w-5 h-5 rounded-sm bg-[var(--green-soft)] border border-[var(--green)]"
        />
      );
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        className="relative bg-white rounded-lg shadow-xl border border-gray-200 p-5 w-80 max-w-[90vw]"
        role="dialog"
        aria-labelledby="size-dialog-title"
        aria-modal="true"
      >
        <h3
          id="size-dialog-title"
          className="text-sm font-semibold text-gray-900 mb-1"
        >
          Machine Size (tiles)
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Position: ({position.x}, {position.y})
        </p>

        {/* Size inputs */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1">
            <label
              htmlFor="machine-width"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              Width (columns)
            </label>
            <input
              id="machine-width"
              type="number"
              min={MIN_SIZE}
              max={MAX_SIZE}
              value={width}
              onChange={handleWidthChange}
              className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-[var(--green)] focus:ring-1 focus:ring-[var(--green)] outline-none"
            />
          </div>
        </div>

        {/* Visual preview */}
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-2">Preview ({width} &times; {height} tiles)</p>
          <div
            className="inline-grid gap-0.5 p-2 bg-gray-50 rounded border border-gray-200"
            style={{
              gridTemplateColumns: `repeat(${width}, 1.25rem)`,
              gridTemplateRows: `repeat(${height}, 1.25rem)`,
            }}
          >
            {previewCells}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="button button-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="button button-primary"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export default MachineSizeDialog;

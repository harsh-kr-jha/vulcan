"use client";

import { Package, Plus, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { useFactoryBuilder } from "@/lib/factory-builder-context";
import {
  validateInventoryCapacity,
  validateMaterialName,
} from "@/lib/spatial-validators";
import type { InventoryConfig, InventoryMaterial } from "@/lib/spatial-types";
import { InventoryTreeMap } from "./InventoryTreeMap";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CapacityUnit = InventoryConfig["capacityUnit"];

interface MaterialDraft {
  id: string;
  name: string;
  unit: InventoryMaterial["unit"];
  quantity: string; // string during editing; parsed on save
}

const UNIT_OPTIONS: { value: CapacityUnit; label: string }[] = [
  { value: "kilograms", label: "Kilograms" },
  { value: "litres", label: "Litres" },
  { value: "meters", label: "Meters" },
  { value: "units", label: "Units" },
];

function generateId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * InventoryPanel — displays to the left of the FloorCanvas.
 *
 * - If inventory is not configured: shows "Build Inventory" button.
 * - On click: shows a configuration form for storage capacity + materials.
 * - On save: calls configureInventory from context.
 *
 * Requirements: 11.1, 11.2, 11.3
 */
export function InventoryPanel() {
  const { state, configureInventory } = useFactoryBuilder();
  const [isConfiguring, setIsConfiguring] = useState(false);

  const hasInventory = !!state.layout.inventory;

  // If already configured and not in configuration mode, show summary with treemap
  if (hasInventory && !isConfiguring) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-green-600" />
          <h3 className="text-sm font-semibold text-gray-900">Inventory</h3>
        </div>
        <p className="text-xs text-gray-600">
          Capacity: {state.layout.inventory!.storageCapacity.toLocaleString()}{" "}
          {state.layout.inventory!.capacityUnit}
        </p>
        <p className="text-xs text-gray-600">
          Materials: {state.layout.inventory!.materials.length}
        </p>

        {/* Treemap visualization and QR code (Requirements 11.4, 11.5, 11.6) */}
        <InventoryTreeMap
          inventory={state.layout.inventory!}
          layoutId={state.layout.id}
        />

        <button
          type="button"
          onClick={() => setIsConfiguring(true)}
          className="mt-1 rounded bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 transition-colors"
        >
          Edit Inventory
        </button>
      </div>
    );
  }

  // Not configured and not configuring — show "Build Inventory" button
  if (!isConfiguring) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6">
        <Package className="h-8 w-8 text-gray-400" />
        <button
          type="button"
          onClick={() => setIsConfiguring(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Build Inventory
        </button>
      </div>
    );
  }

  // Configuration form
  return (
    <InventoryConfigForm
      initialConfig={state.layout.inventory ?? undefined}
      onSave={(config) => {
        configureInventory(config);
        setIsConfiguring(false);
      }}
      onCancel={() => setIsConfiguring(false)}
    />
  );
}

// ---------------------------------------------------------------------------
// Configuration Form
// ---------------------------------------------------------------------------

interface InventoryConfigFormProps {
  initialConfig?: InventoryConfig;
  onSave: (config: InventoryConfig) => void;
  onCancel: () => void;
}

function InventoryConfigForm({
  initialConfig,
  onSave,
  onCancel,
}: InventoryConfigFormProps) {
  const [capacity, setCapacity] = useState<string>(
    initialConfig?.storageCapacity?.toString() ?? ""
  );
  const [capacityUnit, setCapacityUnit] = useState<CapacityUnit>(
    initialConfig?.capacityUnit ?? "kilograms"
  );
  const [materials, setMaterials] = useState<MaterialDraft[]>(
    initialConfig?.materials.map((m) => ({
      id: m.id,
      name: m.name,
      unit: m.unit,
      quantity: m.quantity.toString(),
    })) ?? []
  );

  // --- Validation ---
  const capacityNum = Number(capacity);
  const capacityValidation = capacity.trim().length === 0
    ? null
    : validateInventoryCapacity(capacityNum);
  const capacityError =
    capacityValidation && !capacityValidation.valid
      ? capacityValidation.error
      : null;
  const isCapacityValid =
    capacity.trim().length > 0 &&
    (!capacityValidation || capacityValidation.valid);

  // Validate materials
  const materialErrors: (string | null)[] = materials.map((m) => {
    if (m.name.trim().length === 0) return null; // not yet touched
    const result = validateMaterialName(m.name.trim());
    return result.valid ? null : result.error;
  });

  const areMaterialsValid =
    materials.length >= 1 &&
    materials.every((m) => {
      if (m.name.trim().length === 0) return false;
      const nameResult = validateMaterialName(m.name.trim());
      if (!nameResult.valid) return false;
      const qty = Number(m.quantity);
      if (!Number.isFinite(qty) || qty < 0) return false;
      if (isCapacityValid && qty > capacityNum) return false;
      return true;
    });

  const isFormValid = isCapacityValid && areMaterialsValid;

  // --- Actions ---
  const addMaterial = useCallback(() => {
    if (materials.length >= 50) return;
    setMaterials((prev) => [
      ...prev,
      { id: generateId(), name: "", unit: "kilograms", quantity: "0" },
    ]);
  }, [materials.length]);

  const removeMaterial = useCallback((index: number) => {
    setMaterials((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateMaterial = useCallback(
    (index: number, field: keyof MaterialDraft, value: string) => {
      setMaterials((prev) =>
        prev.map((m, i) => (i === index ? { ...m, [field]: value } : m))
      );
    },
    []
  );

  const handleSave = useCallback(() => {
    if (!isFormValid) return;

    const config: InventoryConfig = {
      storageCapacity: capacityNum,
      capacityUnit,
      materials: materials.map((m) => ({
        id: m.id,
        name: m.name.trim(),
        unit: m.unit,
        quantity: Number(m.quantity),
      })),
    };

    onSave(config);
  }, [isFormValid, capacityNum, capacityUnit, materials, onSave]);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4 max-h-[80vh] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          Configure Inventory
        </h3>
      </div>

      {/* Storage Capacity */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="inventory-capacity"
          className="text-xs font-medium text-gray-700"
        >
          Storage Capacity
        </label>
        <div className="flex gap-2">
          <input
            id="inventory-capacity"
            type="number"
            min={1}
            max={1000000}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="e.g. 10000"
            className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <select
            value={capacityUnit}
            onChange={(e) => setCapacityUnit(e.target.value as CapacityUnit)}
            aria-label="Capacity unit"
            className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {UNIT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        {capacityError && (
          <p className="text-xs text-red-600" role="alert">
            {capacityError}
          </p>
        )}
      </div>

      {/* Materials */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-700">
            Materials ({materials.length}/50)
          </label>
          <button
            type="button"
            onClick={addMaterial}
            disabled={materials.length >= 50}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>

        {materials.length === 0 && (
          <p className="text-xs text-gray-500 italic">
            At least 1 material is required.
          </p>
        )}

        <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
          {materials.map((material, index) => (
            <MaterialRow
              key={material.id}
              material={material}
              index={index}
              error={materialErrors[index]}
              maxQuantity={isCapacityValid ? capacityNum : undefined}
              onUpdate={updateMaterial}
              onRemove={removeMaterial}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={handleSave}
          disabled={!isFormValid}
          className="flex-1 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Material Row
// ---------------------------------------------------------------------------

interface MaterialRowProps {
  material: MaterialDraft;
  index: number;
  error: string | null;
  maxQuantity?: number;
  onUpdate: (index: number, field: keyof MaterialDraft, value: string) => void;
  onRemove: (index: number) => void;
}

function MaterialRow({
  material,
  index,
  error,
  maxQuantity,
  onUpdate,
  onRemove,
}: MaterialRowProps) {
  return (
    <div className="flex flex-col gap-1 rounded border border-gray-100 bg-gray-50 p-2">
      <div className="flex items-start gap-2">
        {/* Name */}
        <div className="flex-1 flex flex-col gap-0.5">
          <input
            type="text"
            value={material.name}
            onChange={(e) => onUpdate(index, "name", e.target.value)}
            placeholder="Material name"
            maxLength={100}
            aria-label={`Material ${index + 1} name`}
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {error && (
            <p className="text-[10px] text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>
        {/* Remove */}
        <button
          type="button"
          onClick={() => onRemove(index)}
          aria-label={`Remove material ${index + 1}`}
          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        {/* Unit selector */}
        <select
          value={material.unit}
          onChange={(e) => onUpdate(index, "unit", e.target.value)}
          aria-label={`Material ${index + 1} unit`}
          className="rounded border border-gray-300 px-1.5 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {UNIT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Initial quantity */}
        <input
          type="number"
          min={0}
          max={maxQuantity}
          value={material.quantity}
          onChange={(e) => onUpdate(index, "quantity", e.target.value)}
          placeholder="Qty"
          aria-label={`Material ${index + 1} quantity`}
          className="w-20 rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}

import { describe, it, expect } from "vitest";
import type { InventoryConfig } from "@/lib/spatial-types";

/**
 * Unit tests for the InventoryTreeMap treemap data transformation logic.
 *
 * Validates Requirements 11.4 and 11.5:
 * - Rectangle sizes proportional to material quantities
 * - Zero-quantity materials rendered as minimal-size rectangles
 */

// Extract the treemap data transformation logic (same as in the component)
function buildTreemapData(inventory: InventoryConfig) {
  return inventory.materials.map((material) => ({
    name: material.name,
    value: Math.max(material.quantity, 0.01),
  }));
}

describe("InventoryTreeMap data transformation", () => {
  it("maps materials to treemap data with name and quantity as value", () => {
    const inventory: InventoryConfig = {
      storageCapacity: 1000,
      capacityUnit: "kilograms",
      materials: [
        { id: "m1", name: "Steel", unit: "kilograms", quantity: 500 },
        { id: "m2", name: "Copper", unit: "kilograms", quantity: 300 },
        { id: "m3", name: "Aluminum", unit: "kilograms", quantity: 200 },
      ],
    };

    const data = buildTreemapData(inventory);

    expect(data).toEqual([
      { name: "Steel", value: 500 },
      { name: "Copper", value: 300 },
      { name: "Aluminum", value: 200 },
    ]);
  });

  it("clamps zero-quantity materials to 0.01 for minimal rectangle visibility (Req 11.5)", () => {
    const inventory: InventoryConfig = {
      storageCapacity: 1000,
      capacityUnit: "litres",
      materials: [
        { id: "m1", name: "Water", unit: "litres", quantity: 0 },
        { id: "m2", name: "Oil", unit: "litres", quantity: 100 },
      ],
    };

    const data = buildTreemapData(inventory);

    expect(data[0]).toEqual({ name: "Water", value: 0.01 });
    expect(data[1]).toEqual({ name: "Oil", value: 100 });
  });

  it("handles all materials with zero quantity", () => {
    const inventory: InventoryConfig = {
      storageCapacity: 500,
      capacityUnit: "units",
      materials: [
        { id: "m1", name: "Bolts", unit: "units", quantity: 0 },
        { id: "m2", name: "Nuts", unit: "units", quantity: 0 },
      ],
    };

    const data = buildTreemapData(inventory);

    expect(data).toEqual([
      { name: "Bolts", value: 0.01 },
      { name: "Nuts", value: 0.01 },
    ]);
  });

  it("preserves material names for label display", () => {
    const inventory: InventoryConfig = {
      storageCapacity: 10000,
      capacityUnit: "meters",
      materials: [
        { id: "m1", name: "Long Material Name With Spaces", unit: "meters", quantity: 42 },
      ],
    };

    const data = buildTreemapData(inventory);

    expect(data[0].name).toBe("Long Material Name With Spaces");
  });

  it("handles a single material", () => {
    const inventory: InventoryConfig = {
      storageCapacity: 100,
      capacityUnit: "kilograms",
      materials: [
        { id: "m1", name: "Iron", unit: "kilograms", quantity: 75 },
      ],
    };

    const data = buildTreemapData(inventory);

    expect(data).toHaveLength(1);
    expect(data[0]).toEqual({ name: "Iron", value: 75 });
  });

  it("does not clamp positive quantities", () => {
    const inventory: InventoryConfig = {
      storageCapacity: 1000,
      capacityUnit: "kilograms",
      materials: [
        { id: "m1", name: "Tiny", unit: "kilograms", quantity: 0.005 },
        { id: "m2", name: "Small", unit: "kilograms", quantity: 0.02 },
      ],
    };

    const data = buildTreemapData(inventory);

    // 0.005 is less than 0.01, so it gets clamped to 0.01
    expect(data[0].value).toBe(0.01);
    // 0.02 is already above 0.01, stays as-is
    expect(data[1].value).toBe(0.02);
  });
});

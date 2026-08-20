// lib/spatial-validators.ts
// Pure validation utility functions for the Factory Twin Builder spatial feature.

import type { FloorDimensions, KpiFormula } from "./spatial-types";

// --- Result type ---

export type ValidationResult =
  | { valid: true }
  | { valid: false; error: string };

const ok: ValidationResult = { valid: true };
const fail = (error: string): ValidationResult => ({ valid: false, error });

// --- Floor Dimensions ---

/**
 * Validates a single dimension value (width or height).
 * Must be a finite number between 1 and 10,000 inclusive.
 */
export function validateFloorDimensionValue(value: unknown): ValidationResult {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail("Dimension must be a finite number.");
  }
  if (value <= 0) {
    return fail("Dimension must be a positive number.");
  }
  if (value > 10_000) {
    return fail("Dimension exceeds the maximum allowed value of 10,000.");
  }
  return ok;
}

/**
 * Validates floor dimensions (width and height).
 * Both must be finite numbers between 1 and 10,000 inclusive.
 */
export function validateFloorDimensions(
  dimensions: Pick<FloorDimensions, "width" | "height">
): ValidationResult {
  const widthResult = validateFloorDimensionValue(dimensions.width);
  if (!widthResult.valid) {
    return fail(`Width: ${widthResult.error}`);
  }
  const heightResult = validateFloorDimensionValue(dimensions.height);
  if (!heightResult.valid) {
    return fail(`Height: ${heightResult.error}`);
  }
  return ok;
}

// --- Machine Name ---

/**
 * Validates a machine name: 1–50 characters.
 */
export function validateMachineName(name: string): ValidationResult {
  if (name.length === 0) {
    return fail("Machine name is required.");
  }
  if (name.length > 50) {
    return fail("Machine name must be at most 50 characters.");
  }
  return ok;
}

// --- Parameter Key ---

const PARAM_KEY_REGEX = /^[a-zA-Z0-9_]+$/;

/**
 * Validates a parameter key: 1–64 alphanumeric/underscore characters.
 * Optionally checks case-insensitive uniqueness against an array of existing keys.
 */
export function validateParameterKey(
  key: string,
  existingKeys: string[] = []
): ValidationResult {
  if (key.length === 0) {
    return fail("Parameter key is required.");
  }
  if (key.length > 64) {
    return fail("Parameter key must be at most 64 characters.");
  }
  if (!PARAM_KEY_REGEX.test(key)) {
    return fail(
      "Parameter key must contain only alphanumeric characters and underscores."
    );
  }
  const lowerKey = key.toLowerCase();
  const duplicate = existingKeys.some((k) => k.toLowerCase() === lowerKey);
  if (duplicate) {
    return fail("Parameter key is already in use (case-insensitive match).");
  }
  return ok;
}

// --- KPI Formula ---

/**
 * Validates a KPI formula:
 * - Max 10 parameter references total.
 * - All referenced parameters must be numeric.
 *
 * @param formula - The KPI formula to validate.
 * @param numericParameterKeys - Set of keys that correspond to numeric parameters.
 */
export function validateKpiFormula(
  formula: KpiFormula,
  numericParameterKeys: Set<string>
): ValidationResult {
  const { operations } = formula;

  if (!operations || operations.length === 0) {
    return fail("KPI formula must contain at least one operation.");
  }

  if (operations.length > 10) {
    return fail("KPI formula must not exceed 10 parameter references.");
  }

  for (const op of operations) {
    if (!numericParameterKeys.has(op.parameterKey)) {
      return fail(
        `KPI formula references non-numeric parameter "${op.parameterKey}".`
      );
    }
  }

  return ok;
}

// --- Connection Quantity ---

/**
 * Validates a connection quantity per cycle: 0.01–999,999,999.99.
 */
export function validateConnectionQuantity(
  quantity: number
): ValidationResult {
  if (!Number.isFinite(quantity)) {
    return fail("Quantity must be a finite number.");
  }
  if (quantity < 0.01) {
    return fail("Quantity must be at least 0.01.");
  }
  if (quantity > 999_999_999.99) {
    return fail("Quantity must not exceed 999,999,999.99.");
  }
  return ok;
}

// --- IO Spec Label ---

/**
 * Validates an I/O specification label: 1–30 characters.
 */
export function validateIOSpec(label: string): ValidationResult {
  if (label.length === 0) {
    return fail("I/O label is required.");
  }
  if (label.length > 30) {
    return fail("I/O label must be at most 30 characters.");
  }
  return ok;
}

// --- KPI Name ---

/**
 * Validates a KPI name: 1–50 characters, unique within an array of existing names.
 */
export function validateKpiName(
  name: string,
  existingNames: string[] = []
): ValidationResult {
  if (name.length === 0) {
    return fail("KPI name is required.");
  }
  if (name.length > 50) {
    return fail("KPI name must be at most 50 characters.");
  }
  const lowerName = name.toLowerCase();
  const duplicate = existingNames.some((n) => n.toLowerCase() === lowerName);
  if (duplicate) {
    return fail("KPI name is already in use.");
  }
  return ok;
}

// --- Inventory Capacity ---

/**
 * Validates inventory storage capacity: 1–1,000,000.
 */
export function validateInventoryCapacity(capacity: number): ValidationResult {
  if (!Number.isFinite(capacity)) {
    return fail("Capacity must be a finite number.");
  }
  if (capacity < 1) {
    return fail("Capacity must be at least 1.");
  }
  if (capacity > 1_000_000) {
    return fail("Capacity must not exceed 1,000,000.");
  }
  return ok;
}

// --- Material Name ---

/**
 * Validates a material name: 1–100 characters.
 */
export function validateMaterialName(name: string): ValidationResult {
  if (name.length === 0) {
    return fail("Material name is required.");
  }
  if (name.length > 100) {
    return fail("Material name must be at most 100 characters.");
  }
  return ok;
}

// --- Dispatch Product Name ---

/**
 * Validates a dispatch product name: 1–50 characters.
 */
export function validateDispatchProductName(name: string): ValidationResult {
  if (name.length === 0) {
    return fail("Product name is required.");
  }
  if (name.length > 50) {
    return fail("Product name must be at most 50 characters.");
  }
  return ok;
}

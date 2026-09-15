// lib/spatial-types.ts
// TypeScript type definitions for the Factory Twin Builder spatial feature.

export type UnitSystem = "feet" | "meters";
export type MachineStatus = "running" | "warning" | "down" | "idle" | "no_data";
export type ParamDataType = "number" | "text" | "boolean" | "date" | "selection";

export interface FloorDimensions {
  width: number; // 1–10,000
  height: number; // 1–10,000
  unit: UnitSystem;
}

export interface GridPosition {
  x: number; // column index (0-based)
  y: number; // row index (0-based)
}

export interface MachineParameter {
  id: string;
  key: string; // 1–64 chars, alphanumeric + underscore
  dataType: ParamDataType;
  options?: string[]; // for "selection" type, up to 20 items
  required: boolean;
  order: number;
  label?: string;
  unit?: string;
  semantic?: string;
  origin?: "manual" | "stream";
  sourceFieldId?: string;
  sourceSchemaVersion?: string;
  active?: boolean;
}

export interface IOSpec {
  id: string;
  label: string; // 1–30 chars
  unitType: string;
}

export interface KpiOperation {
  operator: "add" | "subtract" | "multiply" | "divide";
  parameterKey: string; // references a numeric MachineParameter
}

export interface KpiFormula {
  operations: KpiOperation[]; // max 10 parameter references total
}

export interface CustomKpi {
  id: string;
  name: string; // 1–50 chars, unique per machine
  displayUnit: string; // 1–20 chars
  formula: KpiFormula;
  isEnabled?: boolean;
  disabledReason?: string;
}

export interface StreamBindingSummary {
  id: string;
  streamId: string;
  channelId: string;
  channelName: string;
  status: string;
  lastReceivedAt?: string | null;
  lastError?: string;
}

export interface MachineNode {
  id: string;
  code?: string;
  processId?: string | null;
  name: string; // 1–50 chars
  position: GridPosition;
  size?: { width: number; height: number }; // tiles occupied (e.g. 2×3)
  inputs: IOSpec[]; // 0–10
  outputs: IOSpec[]; // 0–10
  parameters: MachineParameter[]; // 0–50
  customKpis: CustomKpi[]; // 0–20
  status?: MachineStatus;
  dataStreamId?: string | null;
  dataStreamChannelId?: string | null;
  streamBinding?: StreamBindingSummary | null;
}

export interface ConnectionLine {
  id: string;
  sourceId: string; // Machine_Node id
  targetId: string; // Machine_Node id
  name?: string; // max 50 chars
  description?: string; // max 200 chars
  materialType?: string; // max 100 chars
  quantityPerCycle?: number; // 0.01–999,999,999.99
  inputSpec?: string;
  outputSpec?: string;
  distance?: number; // computed from grid positions
}

export interface InventoryMaterial {
  id: string;
  name: string; // max 100 chars
  unit: "kilograms" | "litres" | "meters" | "units";
  quantity: number; // 0 to storageCapacity
}

export interface InventoryConfig {
  storageCapacity: number; // 1–1,000,000
  capacityUnit: "kilograms" | "litres" | "meters" | "units";
  materials: InventoryMaterial[]; // 1–50
}

export interface DispatchProduct {
  id: string;
  name: string; // 1–50 chars
  unit: "meters" | "litres" | "units" | "kilograms";
  awaitingQuantity: number;
}

export interface DispatchConfig {
  products: DispatchProduct[]; // 1–50
}

export interface FactoryLayout {
  id: string;
  factoryId: string;
  floor: FloorDimensions;
  machines: MachineNode[];
  connections: ConnectionLine[];
  inventory?: InventoryConfig;
  dispatch?: DispatchConfig;
  savedAt?: string;
}

// Builder state
export type BuilderMode = "idle" | "placing" | "connecting" | "configuring";

export interface BuilderState {
  layout: FactoryLayout;
  mode: BuilderMode;
  selectedMachineId: string | null;
  selectedConnectionId: string | null;
  isDirty: boolean;
  isEditingExisting: boolean;
}

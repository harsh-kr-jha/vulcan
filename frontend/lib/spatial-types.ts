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

export interface EntitySummary {
  id: string;
  name: string;
  code: string;
}

export interface FactoryZone {
  id: string;
  name: string;
  type: string;
  color: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  displayOrder: number;
  lineId?: string | null;
  line?: EntitySummary | null;
}

export interface FactoryModelAsset {
  id: string;
  filename: string;
  sizeBytes: number;
  checksumSha256: string;
  downloadUrl: string;
}

export interface MachineImageAsset extends FactoryModelAsset {
  contentType: "image/png" | "image/jpeg" | "image/webp";
}

export interface ModelTransform {
  offsetX: number;
  offsetY: number;
  elevation: number;
  scale: number;
  rotationY: number;
}

export interface MachineModelTransform {
  elevation: number;
  scale: number;
  rotationY: number;
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
  process?: EntitySummary | null;
  line?: EntitySummary | null;
  name: string; // 1–50 chars
  position: GridPosition;
  size?: { width: number; height: number }; // tiles occupied (e.g. 2×3)
  visualHeight?: number;
  rotation?: 0 | 90 | 180 | 270;
  representation?: "block" | "glb";
  blockColor?: string;
  modelAsset?: FactoryModelAsset | null;
  imageAsset?: MachineImageAsset | null;
  modelTransform?: MachineModelTransform;
  inputs: IOSpec[]; // 0–10
  outputs: IOSpec[]; // 0–10
  parameters: MachineParameter[]; // 0–50
  customKpis: CustomKpi[]; // 0–20
  status?: MachineStatus;
  dataStreamId?: string | null;
  dataStreamChannelId?: string | null;
  streamBinding?: StreamBindingSummary | null;
}

export interface StatusVisualizationConfig {
  recentMinutes: number;
  persistentMinutes: number;
  outOfRangeConfirmationSeconds: number;
  rejectWindowCycles: number;
  rejectMinimumCycles: number;
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
  type?: ConnectorType;
  direction?: ConnectorDirection;
  geometry?: ConnectorGeometry;
  visual?: ConnectorVisual;
}

export type ConnectorType =
  | "conveyor"
  | "assembly_line"
  | "pipe"
  | "pickup_drop"
  | "material_transfer"
  | "inspection_transfer"
  | "forklift_route"
  | "utility_line";

export type ConnectorDirection = "forward" | "reverse" | "bidirectional" | "none";

export interface ConnectorGeometry {
  /** Ground-plane offsets from the automatically resolved machine-edge anchors. */
  sourceOffsetX: number;
  sourceOffsetY: number;
  targetOffsetX: number;
  targetOffsetY: number;
  elevation: number;
  diameter: number;
  /** Signed ground-plane bow. Zero is a straight route. */
  curvature: number;
}

export interface ConnectorVisual {
  color: string;
  opacity: number;
  dashed: boolean;
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
  zones: FactoryZone[];
  modelAsset?: FactoryModelAsset | null;
  modelTransform?: ModelTransform;
  statusVisualization?: StatusVisualizationConfig;
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

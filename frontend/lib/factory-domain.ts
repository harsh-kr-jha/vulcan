export type DatasetType = "production" | "downtime" | "quality" | "inventory" | "orders";
export type DataSource = "csv" | "excel" | "google_sheets" | "manual" | "template";

export interface Company {
  id: string;
  name: string;
  industry: string;
}

export interface FactoryConfig {
  id: string;
  companyId: string;
  name: string;
  code: string;
  location: string;
  timezone: string;
  currency: string;
}

export interface MasterItem {
  id: string;
  name: string;
  code: string;
  factoryId: string;
  parentId?: string;
  metadata?: Record<string, string | number | boolean>;
  active: boolean;
}

export interface FactoryMasters {
  lines: MasterItem[];
  machines: MasterItem[];
  skus: MasterItem[];
  materials: MasterItem[];
  suppliers: MasterItem[];
  shifts: MasterItem[];
  reasonCodes: MasterItem[];
}

export interface ProductionRecord {
  id: string;
  factoryId: string;
  sourceUploadId: string;
  sourceRow: number;
  date: string;
  line: string;
  machine: string;
  sku: string;
  shift: string;
  orderId?: string;
  plannedQuantity: number;
  actualQuantity: number;
  goodQuantity: number;
  rejectedQuantity: number;
  reworkedQuantity: number;
  plannedMinutes: number;
  downtimeMinutes: number;
  idealCycleMinutes: number;
}

export interface DowntimeRecord {
  id: string;
  factoryId: string;
  sourceUploadId: string;
  sourceRow: number;
  date: string;
  line: string;
  machine: string;
  shift: string;
  reason: string;
  minutes: number;
  occurrences: number;
}

export interface QualityRecord {
  id: string;
  factoryId: string;
  sourceUploadId: string;
  sourceRow: number;
  date: string;
  line: string;
  machine: string;
  sku: string;
  shift: string;
  inspectedQuantity: number;
  rejectedQuantity: number;
  reworkedQuantity: number;
  defectReason: string;
}

export interface InventoryRecord {
  id: string;
  factoryId: string;
  sourceUploadId: string;
  sourceRow: number;
  date: string;
  material: string;
  supplier: string;
  availableQuantity: number;
  dailyConsumption: number;
  safetyStock: number;
  expectedReceiptDate?: string;
  requiredDate?: string;
  receiptStatus: "on_time" | "delayed" | "unknown";
}

export interface OrderRecord {
  id: string;
  factoryId: string;
  sourceUploadId: string;
  sourceRow: number;
  orderId: string;
  sku: string;
  line: string;
  requiredQuantity: number;
  producedQuantity: number;
  dueDate: string;
  priority: "high" | "medium" | "normal";
  status: "open" | "completed" | "hold";
}

export interface ValidationIssueData {
  row: number;
  field: string;
  severity: "warning" | "rejection";
  ruleCode: string;
  explanation: string;
  enteredValue?: string;
}

export interface UploadDataset {
  id: string;
  factoryId: string;
  filename: string;
  datasetType: DatasetType;
  source: DataSource;
  importedAt: string;
  headers: string[];
  rawRows: Record<string, string>[];
  mapping: Record<string, string>;
  status: "mapped" | "needs_mapping" | "validated" | "completed" | "failed";
  acceptedRows: number;
  warningRows: number;
  rejectedRows: number;
  dataQualityScore: number;
  issues: ValidationIssueData[];
}

export interface OperationalData {
  production: ProductionRecord[];
  downtime: DowntimeRecord[];
  quality: QualityRecord[];
  inventory: InventoryRecord[];
  orders: OrderRecord[];
}

export interface ActionItem {
  id: string;
  alertId: string;
  title: string;
  owner: string;
  dueDate: string;
  status: "open" | "done";
  createdAt: string;
}

export interface FactoryUser {
  id: string;
  name: string;
  email: string;
  role: "Factory administrator" | "Factory manager" | "Production supervisor" | "Quality reviewer" | "Inventory reviewer" | "Read-only executive";
  factoryId: string;
  active: boolean;
}

export interface FactoryTargets {
  oee: number;
  availability: number;
  performance: number;
  quality: number;
  stockCoverDays: number;
  downtimeMinutes: number;
}

export interface FactoryState {
  company: Company;
  factories: FactoryConfig[];
  activeFactoryId: string;
  masters: FactoryMasters;
  data: OperationalData;
  uploads: UploadDataset[];
  mappingProfiles: Record<string, Record<string, string>>;
  alertStatuses: Record<string, "new" | "acknowledged" | "resolved" | "dismissed">;
  actions: ActionItem[];
  users: FactoryUser[];
  targets: FactoryTargets;
}

export interface DashboardFilters {
  from: string;
  to: string;
  factoryId: string;
  line: string;
  machine: string;
  sku: string;
  shift: string;
}

export const datasetLabels: Record<DatasetType, string> = {
  production: "Production",
  downtime: "Downtime",
  quality: "Quality",
  inventory: "Inventory",
  orders: "Orders",
};

const factoryId = "factory-pune-01";

function id(prefix: string, suffix: string | number) {
  return `${prefix}-${suffix}`;
}

const daily = [
  ["2026-07-25", 20000, 18120, 79, 92, 96],
  ["2026-07-26", 19500, 19080, 86, 94, 98],
  ["2026-07-27", 20500, 19620, 84, 95, 97],
  ["2026-07-28", 20100, 18780, 80, 94, 96],
  ["2026-07-29", 20000, 18420, 81, 92, 96.3],
  ["2026-07-30", 20400, 19220, 83, 93, 97.1],
  ["2026-07-31", 20000, 18360, 78, 92, 96.2],
] as const;

const production: ProductionRecord[] = daily.flatMap((day, dayIndex) => {
  const [date, planned, actual, availability, performance, quality] = day;
  const machines = ["Press 01", "Press 02", "Press 04"];
  const weights = [0.38, 0.34, 0.28];
  return machines.map((machine, machineIndex) => {
    const actualQuantity = Math.round(actual * weights[machineIndex]);
    const plannedQuantity = Math.round(planned * weights[machineIndex]);
    const goodQuantity = Math.round(actualQuantity * (quality / 100));
    const downtimeMinutes = Math.round(480 * (1 - availability / 100) * (machineIndex === 2 ? 1.35 : 0.82));
    return {
      id: id("prod", `${dayIndex}-${machineIndex}`),
      factoryId,
      sourceUploadId: "UPL-2048",
      sourceRow: dayIndex * 3 + machineIndex + 2,
      date,
      line: "Press Line 02",
      machine,
      sku: machineIndex === 0 ? "AX-440" : machineIndex === 1 ? "BX-210" : "CX-120",
      shift: dayIndex % 2 ? "Shift B" : "Shift A",
      orderId: machineIndex === 0 ? "ORD-1082" : machineIndex === 1 ? "ORD-1086" : "ORD-1091",
      plannedQuantity,
      actualQuantity,
      goodQuantity,
      rejectedQuantity: Math.max(0, actualQuantity - goodQuantity - Math.round(actualQuantity * 0.006)),
      reworkedQuantity: Math.round(actualQuantity * 0.006),
      plannedMinutes: 480,
      downtimeMinutes,
      idealCycleMinutes: (480 * availability / 100 * performance / 100) / Math.max(actualQuantity, 1),
    };
  });
});

export function createDemoState(): FactoryState {
  return {
    company: { id: "company-vulcan", name: "Vulcan Manufacturing India Pvt. Ltd.", industry: "Industrial equipment" },
    factories: [
      { id: factoryId, companyId: "company-vulcan", name: "Pune Plant 01", code: "PNQ-01", location: "Chakan, Pune, Maharashtra", timezone: "Asia/Kolkata", currency: "INR" },
    ],
    activeFactoryId: factoryId,
    masters: {
      lines: [
        { id: "line-1", factoryId, name: "Assembly Line 01", code: "LN-01", active: true },
        { id: "line-2", factoryId, name: "Press Line 02", code: "LN-02", active: true },
        { id: "line-3", factoryId, name: "Packaging Line 03", code: "LN-03", active: true },
      ],
      machines: ["Press 01", "Press 02", "Press 04", "Assembly 01", "Packaging 02"].map((name, index) => ({ id: id("machine", index), factoryId, name, code: `MC-${String(index + 1).padStart(2, "0")}`, parentId: index < 3 ? "line-2" : index === 3 ? "line-1" : "line-3", active: true })),
      skus: ["AX-440", "BX-210", "CX-120", "DX-510"].map((name, index) => ({ id: id("sku", index), factoryId, name, code: name, active: true })),
      materials: ["Steel coil 1.2mm", "Connector housing", "Powder coat – grey", "Fastener M8"].map((name, index) => ({ id: id("material", index), factoryId, name, code: `RM-${[108, 224, 71, 312][index]}`, active: true })),
      suppliers: ["Tata Steel", "Nova Components", "Akzo Industrial"].map((name, index) => ({ id: id("supplier", index), factoryId, name, code: `SUP-${index + 1}`, active: true })),
      shifts: ["Shift A", "Shift B", "Shift C"].map((name, index) => ({ id: id("shift", index), factoryId, name, code: `S${index + 1}`, metadata: { start: ["06:00", "14:00", "22:00"][index], durationMinutes: 480 }, active: true })),
      reasonCodes: ["Hydraulic failure", "Changeover overrun", "Material waiting", "Sensor fault", "Quality inspection"].map((name, index) => ({ id: id("reason", index), factoryId, name, code: `DT-${index + 1}`, active: true })),
    },
    data: {
      production,
      downtime: [
        ["Press 04", "Hydraulic failure", 187, 8], ["Press 02", "Changeover overrun", 109, 14], ["Press 01", "Material waiting", 76, 9], ["Press 04", "Sensor fault", 54, 12], ["Assembly 01", "Quality inspection", 41, 7],
      ].map((row, index) => ({ id: id("down", index), factoryId, sourceUploadId: "UPL-2046", sourceRow: index + 2, date: index < 2 ? "2026-07-31" : "2026-07-30", line: String(row[0]).startsWith("Press") ? "Press Line 02" : "Assembly Line 01", machine: String(row[0]), shift: index % 2 ? "Shift B" : "Shift A", reason: String(row[1]), minutes: Number(row[2]), occurrences: Number(row[3]) })),
      quality: [
        ["AX-440", "Connector misalignment", 218, 62], ["BX-210", "Surface scratch", 164, 41], ["CX-120", "Dimension out of tolerance", 126, 33], ["AX-440", "Torque failure", 94, 28],
      ].map((row, index) => ({ id: id("quality", index), factoryId, sourceUploadId: "UPL-2047", sourceRow: index + 2, date: index < 2 ? "2026-07-31" : "2026-07-30", line: "Press Line 02", machine: index % 2 ? "Press 02" : "Press 04", sku: String(row[0]), shift: index % 2 ? "Shift B" : "Shift A", inspectedQuantity: 4600, rejectedQuantity: Number(row[2]), reworkedQuantity: Number(row[3]), defectReason: String(row[1]) })),
      inventory: [
        ["Steel coil 1.2mm", "Tata Steel", 1300, 1000, 1800, "2026-08-02", "2026-08-01", "delayed"],
        ["Connector housing", "Nova Components", 4200, 2000, 3500, "2026-08-01", "2026-08-01", "on_time"],
        ["Powder coat – grey", "Akzo Industrial", 1020, 300, 800, "2026-08-04", "2026-08-03", "delayed"],
        ["Fastener M8", "Nova Components", 16400, 2500, 5000, "2026-08-02", "2026-08-02", "on_time"],
      ].map((row, index) => ({ id: id("inv", index), factoryId, sourceUploadId: "UPL-2041", sourceRow: index + 2, date: "2026-07-31", material: String(row[0]), supplier: String(row[1]), availableQuantity: Number(row[2]), dailyConsumption: Number(row[3]), safetyStock: Number(row[4]), expectedReceiptDate: String(row[5]), requiredDate: String(row[6]), receiptStatus: row[7] as InventoryRecord["receiptStatus"] })),
      orders: [
        ["ORD-1082", "AX-440", 12000, 9100, "2026-08-01", "high", "open"],
        ["ORD-1086", "BX-210", 9000, 7600, "2026-08-02", "medium", "open"],
        ["ORD-1091", "CX-120", 7500, 3900, "2026-08-01", "high", "open"],
        ["ORD-1078", "DX-510", 4200, 4200, "2026-07-31", "normal", "completed"],
      ].map((row, index) => ({ id: id("order", index), factoryId, sourceUploadId: "UPL-2038", sourceRow: index + 2, orderId: String(row[0]), sku: String(row[1]), line: index === 3 ? "Assembly Line 01" : "Press Line 02", requiredQuantity: Number(row[2]), producedQuantity: Number(row[3]), dueDate: String(row[4]), priority: row[5] as OrderRecord["priority"], status: row[6] as OrderRecord["status"] })),
    },
    uploads: [
      { id: "UPL-2048", factoryId, filename: "production_31_jul.xlsx", datasetType: "production", source: "excel", importedAt: "2026-07-31T09:42:00+05:30", headers: [], rawRows: [], mapping: {}, status: "completed", acceptedRows: production.length, warningRows: 2, rejectedRows: 0, dataQualityScore: 99.8, issues: [] },
      { id: "UPL-2047", factoryId, filename: "quality_shift_b.csv", datasetType: "quality", source: "csv", importedAt: "2026-07-31T08:16:00+05:30", headers: [], rawRows: [], mapping: {}, status: "completed", acceptedRows: 4, warningRows: 1, rejectedRows: 0, dataQualityScore: 97.7, issues: [] },
    ],
    mappingProfiles: {},
    alertStatuses: {},
    actions: [],
    users: [
      { id: "user-harsh", name: "Harsh Kumar", email: "harsh@example.com", role: "Factory manager", factoryId, active: true },
      { id: "user-neha", name: "Neha Shah", email: "neha@example.com", role: "Quality reviewer", factoryId, active: true },
      { id: "user-ravi", name: "Ravi Kumar", email: "ravi@example.com", role: "Production supervisor", factoryId, active: true },
    ],
    targets: { oee: 78, availability: 85, performance: 95, quality: 98, stockCoverDays: 3, downtimeMinutes: 30 },
  };
}

export const defaultFilters: DashboardFilters = {
  from: "2026-07-25",
  to: "2026-07-31",
  factoryId,
  line: "all",
  machine: "all",
  sku: "all",
  shift: "all",
};

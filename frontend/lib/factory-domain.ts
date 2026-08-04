export type DatasetType = "process" | "production" | "downtime" | "quality" | "inventory" | "supplier" | "orders";
export type DataSource = "file" | "template" | "showcase";

export interface Company { id: string; name: string; industry: string }
export interface FactoryDetails {
  factoryType?: string;
  facilityAreaM2?: number;
  ratedCapacityPerDay?: number;
  productionUnit?: string;
  operatingHoursPerDay?: number;
  shiftsPerDay?: number;
  powerCapacityKva?: number;
  energyUnit?: string;
  weightUnit?: string;
  temperatureUnit?: string;
  pressureUnit?: string;
  commissionedYear?: number;
}
export interface FactoryConfig { id: string; companyId: string; name: string; code: string; location: string; timezone: string; currency: string; details?: FactoryDetails }
export interface MasterItem { id: string; name: string; code: string; factoryId: string; kind?: keyof FactoryMasters; parentId?: string | null; metadata?: Record<string, unknown>; active: boolean }
export interface FactoryMasters { lines: MasterItem[]; processes: MasterItem[]; machines: MasterItem[]; skus: MasterItem[]; materials: MasterItem[]; suppliers: MasterItem[]; shifts: MasterItem[]; reasonCodes: MasterItem[] }
export interface FactoryTargets { oee: number; availability: number; performance: number; quality: number; planAttainment: number; rejectionRate: number; supplierScore: number; stockCoverDays: number; downtimeMinutes: number; downtimeUnit: "minutes" | "hours" }
export interface ActionItem { id: string; alertId: string; title: string; owner: string; dueDate: string; status: "open" | "done"; createdAt: string }
export interface UploadDataset { id: string; factoryId: string; filename: string; datasetType: DatasetType; source: DataSource; importedAt: string; status: string; acceptedRows: number; warningRows: number; rejectedRows: number; dataQualityScore: number; omittedFields: string[] }
export interface FactoryState { company: Company; factories: FactoryConfig[]; activeFactoryId: string; masters: FactoryMasters; uploads: UploadDataset[]; actions: ActionItem[]; targets: FactoryTargets }
export interface DashboardFilters { from: string; to: string; factoryId: string; line: string; machine: string; sku: string; shift: string }
export interface IntelligenceAlert { id: string; title: string; description: string; asset: string; severity: "critical" | "high" | "medium" | "low"; status: "new" | "acknowledged" | "resolved" | "dismissed"; occurredAt: string; relativeTime: string; recommendation: string; threshold: string; observed: string; ruleVersion: string; evidence: string[] }
export interface CustomKpiVariable { key: string; label: string; dataset: string; sourceUnit: string; value: number }
export interface CustomKpiDefinition { id: string; name: string; variableA: string; operation: "add" | "subtract" | "multiply" | "divide"; variableB: string; scale: 1 | 100; decimals: 0 | 1 | 2 | 3; unit: string; pinnedToHome: boolean }
export interface CustomKpiResult extends CustomKpiDefinition { value: number | null; status: "ready" | "unavailable"; formulaLabel: string; datasets: string[] }
export type TwinStatus = "running" | "warning" | "down" | "idle" | "no_data";
export interface TwinMetrics { input: number; output: number; rejected: number | null; yieldRate: number | null; throughputPerHour: number | null; cycleMinutes: number | null; temperatureC: number | null; pressureBar: number | null; energyKwh: number | null; downtimeMinutes: number | null }
export interface TwinMachine { id: string; name: string; code: string; status: TwinStatus; manufacturer: string; model: string; powerKw: number; capacityPerHour: number; metrics: TwinMetrics }
export interface TwinProcess { id: string; name: string; code: string; sequence: number; description: string; processType: string; inputUnit: string; outputUnit: string; targetCycleMinutes: number | null; targetTemperatureC: number | null; targetPressureBar: number | null; capacityPerHour: number | null; status: TwinStatus; latestDate: string; dataAgeDays: number | null; dataStatus: "current" | "stale" | "absent"; hasData: boolean; metrics: TwinMetrics; machines: TwinMachine[] }
export interface TwinLine { id: string; name: string; code: string; status: TwinStatus; processes: TwinProcess[] }
export interface DigitalTwinPayload { factory: { id: string; name: string; code: string; location: string; details: FactoryDetails }; summary: { lines: number; processes: number; machines: number; running: number; attention: number; withoutData: number }; lines: TwinLine[] }
export interface Intelligence {
  totals: { planned: number; actual: number; good: number; rejected: number; reworked: number; planAttainment: number; firstPassYield: number; totalDowntime: number; downtimeFrequency: number; averageDowntimeDuration: number; rejectionRate: number; reworkRate: number; estimatedProductionLost: number; throughputRate: number; idealCycleMinutes: number; actualCycleMinutes: number; cycleTimeVariance: number };
  oee: { availability: number; performance: number; quality: number; value: number; plannedMinutes: number; runMinutes: number; idealMinutes: number };
  dailyOee: { date: string; value: number }[];
  productionTrend: { date: string; planned: number; actual: number; good: number }[];
  machineLoss: { machine: string; line: string; minutes: number; occurrences: number }[];
  reasonLoss: { reason: string; minutes: number; occurrences: number }[];
  defectLoss: { reason: string; rejected: number; reworked: number }[];
  skuQuality: { sku: string; inspected: number; rejected: number; rejectionRate: number }[];
  inventoryRisks: { id: string; material: string; supplier: string; availableQuantity: number; unit: string; dailyConsumption: number; stockDays: number; projectedStockout: string; receiptStatus: string; expectedReceiptDate?: string }[];
  orderRisks: { orderId: string; sku: string; dueDate: string; completion: number; remaining: number; risk: "critical" | "high" | "watch"; reason: string }[];
  supplierScores: { supplier: string; score: number; status: "preferred" | "stable" | "watch" | "critical"; deliveries: number; onTimeRate: number; quantityFulfillment: number; acceptanceRate: number; termsFulfillment: number; lateDeliveries: number; averageDelayDays: number; materials: string[] }[];
  supplierScore: number;
  customKpiVariables: CustomKpiVariable[];
  customKpis: CustomKpiResult[];
  digitalTwin: DigitalTwinPayload;
  losses: { productionGapUnits: number; downtimeLostUnits: number; speedLostUnits: number; rejectedUnits: number; reworkUnits: number };
  dataAvailability: Record<DatasetType, number>;
  dataHealth: Partial<Record<DatasetType, { status: "current" | "stale" | "absent"; latestDate: string | null; ageDays: number | null; staleAfterDays: number }>>;
  alerts: IntelligenceAlert[];
  dataQuality: number;
}

export interface StandardFieldDefinition { key: string; label: string; type: "text" | "string" | "number" | "date"; required: boolean; aliases: string[] }
export interface ImportInspection { upload: UploadDataset; headers: string[]; samples: Record<string, string>[]; fields: StandardFieldDefinition[]; mapping: Record<string, string>; suggestions: { source: string; target: string; confidence: string; reason: string }[] }
export interface ValidationIssueData { row: number; field: string; severity: "warning" | "rejection"; ruleCode: string; explanation: string; suggestedCorrection: string; enteredValue?: string }
export interface ImportValidation { upload: UploadDataset; issues: ValidationIssueData[]; directions: string[]; canImport: boolean }
export interface ImportPreview { upload: UploadDataset; headers: string[]; rows: Record<string, string | number | null>[]; totalRows: number; mapping: Record<string, string>; omittedFields: string[] }
export interface WorkspacePayload { state: FactoryState; intelligence: Intelligence }

export const datasetLabels: Record<DatasetType, string> = { process: "Process sheets", production: "Production", downtime: "Downtime", quality: "Quality", inventory: "Inventory", supplier: "Supplier deliveries", orders: "Orders" };

const today = new Date();
const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 6);
export const defaultFilters: DashboardFilters = { from: weekAgo.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10), factoryId: "", line: "all", machine: "all", sku: "all", shift: "all" };
export const emptyIntelligence: Intelligence = { totals: { planned: 0, actual: 0, good: 0, rejected: 0, reworked: 0, planAttainment: 0, firstPassYield: 0, totalDowntime: 0, downtimeFrequency: 0, averageDowntimeDuration: 0, rejectionRate: 0, reworkRate: 0, estimatedProductionLost: 0, throughputRate: 0, idealCycleMinutes: 0, actualCycleMinutes: 0, cycleTimeVariance: 0 }, oee: { availability: 0, performance: 0, quality: 0, value: 0, plannedMinutes: 0, runMinutes: 0, idealMinutes: 0 }, dailyOee: [], productionTrend: [], machineLoss: [], reasonLoss: [], defectLoss: [], skuQuality: [], inventoryRisks: [], orderRisks: [], supplierScores: [], supplierScore: 0, customKpiVariables: [], customKpis: [], digitalTwin: { factory: { id: "", name: "", code: "", location: "", details: {} }, summary: { lines: 0, processes: 0, machines: 0, running: 0, attention: 0, withoutData: 0 }, lines: [] }, losses: { productionGapUnits: 0, downtimeLostUnits: 0, speedLostUnits: 0, rejectedUnits: 0, reworkUnits: 0 }, dataAvailability: { process: 0, production: 0, downtime: 0, quality: 0, inventory: 0, supplier: 0, orders: 0 }, dataHealth: {}, alerts: [], dataQuality: 100 };

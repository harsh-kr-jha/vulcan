import type {
  InventoryRisk,
  KpiMetric,
  LossCategory,
  MachinePerformance,
  OperationalAlert,
  TrendPoint,
  UploadRecord,
} from "./types";

export const kpis: KpiMetric[] = [
  {
    code: "oee",
    label: "Overall equipment efficiency",
    value: 0.718,
    formattedValue: "71.8%",
    target: "Target 78%",
    delta: 3.2,
    direction: "up",
    status: "warning",
  },
  {
    code: "output",
    label: "Production output",
    value: 18420,
    formattedValue: "18,420",
    target: "of 20,000 units",
    delta: 5.4,
    direction: "up",
    status: "good",
    unit: "units",
  },
  {
    code: "quality",
    label: "First pass yield",
    value: 0.963,
    formattedValue: "96.3%",
    target: "Target 98%",
    delta: 0.8,
    direction: "down",
    status: "warning",
  },
  {
    code: "downtime",
    label: "Unplanned downtime",
    value: 188,
    formattedValue: "3h 08m",
    target: "Target < 2h 30m",
    delta: 12.6,
    direction: "down",
    status: "critical",
  },
];

export const weeklyTrend: TrendPoint[] = [
  { label: "23 Jul", planned: 19800, actual: 17700, availability: 77, performance: 91, quality: 96, oee: 67.3 },
  { label: "24 Jul", planned: 20200, actual: 18950, availability: 82, performance: 93, quality: 97, oee: 74.0 },
  { label: "25 Jul", planned: 20000, actual: 18120, availability: 79, performance: 92, quality: 96, oee: 69.8 },
  { label: "26 Jul", planned: 19500, actual: 19080, availability: 86, performance: 94, quality: 98, oee: 79.2 },
  { label: "27 Jul", planned: 20500, actual: 19620, availability: 84, performance: 95, quality: 97, oee: 77.4 },
  { label: "28 Jul", planned: 20100, actual: 18780, availability: 80, performance: 94, quality: 96, oee: 72.2 },
  { label: "29 Jul", planned: 20000, actual: 18420, availability: 81, performance: 92, quality: 96.3, oee: 71.8 },
];

export const losses: LossCategory[] = [
  { category: "Equipment failure", value: 41, minutes: 187, color: "#e65f48" },
  { category: "Changeover", value: 24, minutes: 109, color: "#f1a73c" },
  { category: "Minor stops", value: 18, minutes: 82, color: "#577fbc" },
  { category: "Quality loss", value: 11, minutes: 50, color: "#8a68b8" },
  { category: "Other", value: 6, minutes: 27, color: "#a8aeaa" },
];

export const alerts: OperationalAlert[] = [
  {
    id: "ALT-1048",
    title: "Repeated stoppages on Press 04",
    description: "Four unplanned stops exceeded the shift threshold in the last 6 hours.",
    asset: "Press 04 · Line 2",
    severity: "critical",
    status: "new",
    occurredAt: "2026-07-29T11:42:00+05:30",
    relativeTime: "18 min ago",
    recommendation: "Inspect the hydraulic pressure valve before the next changeover.",
    threshold: "> 3 stops / shift",
    observed: "4 stops · 52 min",
    ruleVersion: "downtime-frequency-v2",
  },
  {
    id: "ALT-1047",
    title: "FPY below target for SKU AX-440",
    description: "First pass yield has remained below 94% for two consecutive shifts.",
    asset: "Assembly 01 · Line 1",
    severity: "high",
    status: "new",
    occurredAt: "2026-07-29T10:55:00+05:30",
    relativeTime: "1 hr ago",
    recommendation: "Review torque calibration and the connector rejection cluster.",
    threshold: "< 94% for 2 shifts",
    observed: "92.7%",
    ruleVersion: "quality-fpy-v3",
  },
  {
    id: "ALT-1044",
    title: "Material stock-out projected",
    description: "RM-108 inventory will fall below safety stock before the next confirmed receipt.",
    asset: "Central Stores",
    severity: "high",
    status: "acknowledged",
    occurredAt: "2026-07-29T08:08:00+05:30",
    relativeTime: "4 hrs ago",
    recommendation: "Expedite PO-8817 by 2 days or re-sequence Line 3 production.",
    threshold: "< 2.0 days cover",
    observed: "1.3 days cover",
    ruleVersion: "inventory-cover-v1",
  },
  {
    id: "ALT-1039",
    title: "Changeover duration increasing",
    description: "Average changeover time is 14% above the rolling four-week baseline.",
    asset: "Packaging · Line 3",
    severity: "medium",
    status: "acknowledged",
    occurredAt: "2026-07-28T16:24:00+05:30",
    relativeTime: "Yesterday",
    recommendation: "Compare the last three setup checklists for repeated waiting steps.",
    threshold: "> 10% vs baseline",
    observed: "+14.2%",
    ruleVersion: "changeover-drift-v1",
  },
  {
    id: "ALT-1028",
    title: "Downtime reason missing",
    description: "Six downtime records were approved without a reason code.",
    asset: "Data quality",
    severity: "low",
    status: "resolved",
    occurredAt: "2026-07-27T14:10:00+05:30",
    relativeTime: "2 days ago",
    recommendation: "Assign reason codes to preserve loss analysis accuracy.",
    threshold: "> 0 approved blanks",
    observed: "6 records",
    ruleVersion: "data-completeness-v2",
  },
];

export const inventoryRisks: InventoryRisk[] = [
  { material: "Steel coil 1.2mm", code: "RM-108", stockDays: 1.3, requiredDate: "30 Jul", incomingDate: "01 Aug", status: "stockout" },
  { material: "Connector housing", code: "RM-224", stockDays: 2.1, requiredDate: "31 Jul", incomingDate: "31 Jul", status: "critical" },
  { material: "Powder coat – grey", code: "RM-071", stockDays: 3.4, requiredDate: "02 Aug", status: "watch" },
];

export const uploads: UploadRecord[] = [
  { id: "UPL-2048", filename: "production_29_jul.xlsx", template: "Production v3", status: "COMPLETED", rows: 18420, acceptedRows: 18388, warningRows: 32, rejectedRows: 0, dataQualityScore: 99.8, uploadedBy: "Ravi Kumar", uploadedAt: "29 Jul · 09:42", size: "4.8 MB" },
  { id: "UPL-2047", filename: "quality_shift_B.csv", template: "Quality v2", status: "VALIDATION_REVIEW", rows: 2840, acceptedRows: 2775, warningRows: 42, rejectedRows: 23, dataQualityScore: 97.7, uploadedBy: "Neha Shah", uploadedAt: "29 Jul · 08:16", size: "1.2 MB" },
  { id: "UPL-2046", filename: "downtime_line_2.xlsx", template: "Downtime v4", status: "MAPPING_REQUIRED", rows: 412, acceptedRows: 0, warningRows: 0, rejectedRows: 0, dataQualityScore: 0, uploadedBy: "Ravi Kumar", uploadedAt: "29 Jul · 07:58", size: "860 KB" },
  { id: "UPL-2041", filename: "inventory_week_30.csv", template: "Inventory v2", status: "COMPLETED", rows: 7340, acceptedRows: 7318, warningRows: 22, rejectedRows: 0, dataQualityScore: 99.7, uploadedBy: "Anita Desai", uploadedAt: "28 Jul · 17:05", size: "2.9 MB" },
  { id: "UPL-2039", filename: "supplier_receipts.xlsx", template: "Receipts v1", status: "FAILED", rows: 0, acceptedRows: 0, warningRows: 0, rejectedRows: 0, dataQualityScore: 0, uploadedBy: "Anita Desai", uploadedAt: "28 Jul · 14:28", size: "1.1 MB" },
];

export const machines: MachinePerformance[] = [
  { name: "Press 01", line: "Line 2", oee: 84.2, downtime: 21, output: 3480, status: "running" },
  { name: "Press 02", line: "Line 2", oee: 78.7, downtime: 38, output: 3140, status: "running" },
  { name: "Assembly 01", line: "Line 1", oee: 76.4, downtime: 26, output: 2930, status: "running" },
  { name: "Packaging 02", line: "Line 3", oee: 72.1, downtime: 49, output: 2650, status: "idle" },
  { name: "Press 04", line: "Line 2", oee: 58.9, downtime: 96, output: 1970, status: "down" },
];

export const downtimeReasons = [
  { reason: "Hydraulic failure", minutes: 187, events: 8 },
  { reason: "Changeover overrun", minutes: 109, events: 14 },
  { reason: "Material waiting", minutes: 76, events: 9 },
  { reason: "Sensor fault", minutes: 54, events: 12 },
  { reason: "Quality inspection", minutes: 41, events: 7 },
  { reason: "Operator unavailable", minutes: 28, events: 5 },
];

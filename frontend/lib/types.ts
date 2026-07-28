export type TrendDirection = "up" | "down" | "flat";

export interface KpiMetric {
  code: string;
  label: string;
  value: number;
  formattedValue: string;
  target: string;
  delta: number;
  direction: TrendDirection;
  status: "good" | "warning" | "critical";
  unit?: string;
}

export interface TrendPoint {
  label: string;
  planned: number;
  actual: number;
  availability: number;
  performance: number;
  quality: number;
  oee: number;
}

export interface LossCategory {
  category: string;
  value: number;
  minutes: number;
  color: string;
}

export interface OperationalAlert {
  id: string;
  title: string;
  description: string;
  asset: string;
  severity: "critical" | "high" | "medium" | "low";
  status: "new" | "acknowledged" | "resolved" | "dismissed";
  occurredAt: string;
  relativeTime: string;
  recommendation: string;
  threshold: string;
  observed: string;
  ruleVersion: string;
}

export interface InventoryRisk {
  material: string;
  code: string;
  stockDays: number;
  requiredDate: string;
  incomingDate?: string;
  status: "stockout" | "critical" | "watch";
}

export type UploadStatus =
  | "COMPLETED"
  | "VALIDATION_REVIEW"
  | "VALIDATING"
  | "MAPPING_REQUIRED"
  | "INSPECTING"
  | "FAILED";

export interface UploadRecord {
  id: string;
  filename: string;
  template: string;
  status: UploadStatus;
  rows: number;
  acceptedRows: number;
  warningRows: number;
  rejectedRows: number;
  dataQualityScore: number;
  uploadedBy: string;
  uploadedAt: string;
  size: string | number;
}

export interface MachinePerformance {
  name: string;
  line: string;
  oee: number;
  downtime: number;
  output: number;
  status: "running" | "idle" | "down";
}

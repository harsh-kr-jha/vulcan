import type { DatasetType } from "./factory-domain";

const templates: Record<DatasetType, { headers: string[]; example: string[] }> = {
  production: { headers: ["date", "line", "machine", "sku", "shift", "order_id", "planned_quantity", "actual_quantity", "good_quantity", "rejected_quantity", "reworked_quantity", "planned_minutes", "downtime_minutes", "ideal_cycle_minutes"], example: ["2026-07-31", "Line 01", "Machine 01", "SKU-01", "Shift A", "ORD-01", "1200", "1120", "1085", "25", "10", "480", "42", "0.32"] },
  downtime: { headers: ["date", "line", "machine", "shift", "reason", "minutes", "occurrences"], example: ["2026-07-31", "Line 01", "Machine 01", "Shift A", "Hydraulic failure", "52", "4"] },
  quality: { headers: ["date", "line", "machine", "sku", "shift", "inspected_quantity", "rejected_quantity", "reworked_quantity", "defect_reason"], example: ["2026-07-31", "Line 01", "Machine 01", "SKU-01", "Shift A", "1200", "35", "10", "Misalignment"] },
  inventory: { headers: ["date", "material", "supplier", "available_quantity", "daily_consumption", "safety_stock", "expected_receipt_date", "required_date", "receipt_status"], example: ["2026-07-31", "Material 01", "Supplier 01", "1300", "1000", "1800", "2026-08-02", "2026-08-01", "delayed"] },
  orders: { headers: ["order_id", "sku", "line", "required_quantity", "produced_quantity", "due_date", "priority", "status"], example: ["ORD-01", "SKU-01", "Line 01", "12000", "9100", "2026-08-01", "high", "open"] },
};

export function downloadTemplate(type: DatasetType) {
  const template = templates[type];
  downloadBlob([template.headers, template.example].map((row) => row.join(",")).join("\n"), `vulcan_${type}_template.csv`, "text/csv");
}

export function downloadBlob(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

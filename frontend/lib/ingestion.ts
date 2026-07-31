import { strFromU8, unzipSync } from "fflate";
import type { DatasetType, FactoryMasters, ValidationIssueData } from "./factory-domain";

export interface StandardFieldDefinition {
  key: string;
  label: string;
  type: "text" | "number" | "date";
  required: boolean;
  aliases: string[];
}

export interface ValidationReferences {
  line: string[];
  machine: string[];
  sku: string[];
  shift: string[];
  material: string[];
  supplier: string[];
  reason: string[];
  machineLines: Record<string, string>;
}

export function buildValidationReferences(masters: FactoryMasters, factoryId: string): ValidationReferences {
  const active = <T extends keyof FactoryMasters>(collection: T) => masters[collection].filter((item) => item.factoryId === factoryId && item.active);
  const values = <T extends keyof FactoryMasters>(collection: T) => active(collection).flatMap((item) => [item.name, item.code]);
  const lines = active("lines");
  const lineNames = new Map(lines.map((line) => [line.id, line.name]));
  return {
    line: values("lines"),
    machine: values("machines"),
    sku: values("skus"),
    shift: values("shifts"),
    material: values("materials"),
    supplier: values("suppliers"),
    reason: values("reasonCodes"),
    machineLines: Object.fromEntries(active("machines").flatMap((machine) => {
      const line = machine.parentId ? lineNames.get(machine.parentId) : undefined;
      return line ? [[normalizeReference(machine.name), line], [normalizeReference(machine.code), line]] : [];
    })),
  };
}

export const standardFields: Record<DatasetType, StandardFieldDefinition[]> = {
  production: [
    ["date", "Production date", "date", true, ["date", "production date", "operational date"]],
    ["line", "Production line", "text", true, ["line", "line name", "production line"]],
    ["machine", "Machine", "text", true, ["machine", "machine name", "equipment"]],
    ["sku", "Product / SKU", "text", true, ["sku", "product", "item code"]],
    ["shift", "Shift", "text", true, ["shift", "shift name"]],
    ["order_id", "Order ID", "text", false, ["order", "order id", "production order"]],
    ["planned_quantity", "Planned quantity", "number", true, ["planned qty", "plan", "target output", "planned quantity"]],
    ["actual_quantity", "Actual quantity", "number", true, ["actual output", "produced qty", "actual quantity", "output"]],
    ["good_quantity", "Good quantity", "number", true, ["accepted qty", "good output", "good quantity"]],
    ["rejected_quantity", "Rejected quantity", "number", false, ["reject qty", "scrap", "rejected quantity"]],
    ["reworked_quantity", "Reworked quantity", "number", false, ["rework", "reworked quantity"]],
    ["planned_minutes", "Planned minutes", "number", false, ["planned time", "planned minutes"]],
    ["downtime_minutes", "Downtime minutes", "number", false, ["downtime", "stop minutes", "downtime minutes"]],
    ["ideal_cycle_minutes", "Ideal cycle minutes", "number", false, ["ideal cycle", "cycle time"]],
  ].map(toField),
  downtime: [
    ["date", "Date", "date", true, ["date", "downtime date"]], ["line", "Production line", "text", true, ["line", "production line"]], ["machine", "Machine", "text", true, ["machine", "equipment"]], ["shift", "Shift", "text", true, ["shift"]], ["reason", "Downtime reason", "text", true, ["reason", "reason code", "downtime reason"]], ["minutes", "Minutes lost", "number", true, ["duration", "minutes", "downtime minutes"]], ["occurrences", "Occurrences", "number", false, ["count", "occurrences", "stops"]],
  ].map(toField),
  quality: [
    ["date", "Date", "date", true, ["date", "quality date"]], ["line", "Production line", "text", true, ["line"]], ["machine", "Machine", "text", false, ["machine"]], ["sku", "Product / SKU", "text", true, ["sku", "product", "item"]], ["shift", "Shift", "text", true, ["shift"]], ["inspected_quantity", "Inspected quantity", "number", true, ["inspected", "total inspected"]], ["rejected_quantity", "Rejected quantity", "number", true, ["rejected", "reject qty", "scrap"]], ["reworked_quantity", "Reworked quantity", "number", false, ["rework", "reworked"]], ["defect_reason", "Defect reason", "text", true, ["defect", "rejection reason", "defect reason"]],
  ].map(toField),
  inventory: [
    ["date", "Snapshot date", "date", true, ["date", "snapshot date"]], ["material", "Material", "text", true, ["material", "material name", "item"]], ["supplier", "Supplier", "text", false, ["supplier", "vendor"]], ["available_quantity", "Available quantity", "number", true, ["stock", "available", "on hand", "available quantity"]], ["daily_consumption", "Daily consumption", "number", true, ["daily usage", "consumption", "daily consumption"]], ["safety_stock", "Safety stock", "number", false, ["safety stock", "minimum stock"]], ["expected_receipt_date", "Expected receipt date", "date", false, ["expected delivery", "receipt date", "eta"]], ["required_date", "Required date", "date", false, ["required date", "need by"]], ["receipt_status", "Receipt status", "text", false, ["receipt status", "delivery status"]],
  ].map(toField),
  orders: [
    ["order_id", "Order ID", "text", true, ["order", "order id", "production order"]], ["sku", "Product / SKU", "text", true, ["sku", "product", "item"]], ["line", "Production line", "text", true, ["line"]], ["required_quantity", "Required quantity", "number", true, ["required qty", "order qty", "quantity"]], ["produced_quantity", "Produced quantity", "number", true, ["produced qty", "completed qty", "actual"]], ["due_date", "Due date", "date", true, ["due", "delivery date", "due date"]], ["priority", "Priority", "text", false, ["priority"]], ["status", "Status", "text", false, ["status", "order status"]],
  ].map(toField),
};

function toField(tuple: (string | boolean | string[])[]): StandardFieldDefinition {
  return { key: tuple[0] as string, label: tuple[1] as string, type: tuple[2] as StandardFieldDefinition["type"], required: tuple[3] as boolean, aliases: tuple[4] as string[] };
}

export function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[^a-z0-9]+/g, " ").trim();
}

function similarity(a: string, b: string) {
  if (a === b) return 1;
  const aTokens = new Set(a.split(" "));
  const bTokens = new Set(b.split(" "));
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  return union ? intersection / union : 0;
}

export function suggestMapping(headers: string[], datasetType: DatasetType, saved?: Record<string, string>) {
  const fields = standardFields[datasetType];
  const used = new Set<string>();
  return Object.fromEntries(headers.map((header) => {
    if (saved?.[header] && !used.has(saved[header])) { used.add(saved[header]); return [header, saved[header]]; }
    const normalized = normalizeHeader(header);
    const candidates = fields.map((field) => ({ field, score: Math.max(...field.aliases.concat(field.label, field.key).map((alias) => similarity(normalized, normalizeHeader(alias)))) })).sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (best && best.score >= 0.45 && !used.has(best.field.key)) { used.add(best.field.key); return [header, best.field.key]; }
    return [header, ""];
  }));
}

export async function parseTabularFile(file: File) {
  if (file.name.toLowerCase().endsWith(".csv")) return parseCSV(await file.text());
  if (file.name.toLowerCase().endsWith(".xlsx")) return parseXLSX(new Uint8Array(await file.arrayBuffer()));
  throw new Error("Use a .csv or .xlsx file.");
}

export function parseCSV(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && next === "\n") index += 1; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); }
  const headers = (rows.shift() ?? []).map((header, index) => header || `Column ${index + 1}`);
  return { headers, rows: rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))) };
}

function parseXLSX(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  const decoder = (path: string) => files[path] ? strFromU8(files[path]) : "";
  const sharedXml = decoder("xl/sharedStrings.xml");
  const shared = sharedXml ? [...new DOMParser().parseFromString(sharedXml, "text/xml").querySelectorAll("si")].map((node) => [...node.querySelectorAll("t")].map((item) => item.textContent ?? "").join("")) : [];
  const workbookXml = decoder("xl/workbook.xml");
  const relationshipsXml = decoder("xl/_rels/workbook.xml.rels");
  const workbook = new DOMParser().parseFromString(workbookXml, "text/xml");
  const relationships = new DOMParser().parseFromString(relationshipsXml, "text/xml");
  const firstSheet = workbook.querySelector("sheet");
  const relationshipId = firstSheet?.getAttribute("r:id") ?? firstSheet?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
  const relationship = [...relationships.querySelectorAll("Relationship")].find((node) => node.getAttribute("Id") === relationshipId);
  const target = relationship?.getAttribute("Target")?.replace(/^\//, "") ?? "worksheets/sheet1.xml";
  const sheetPath = target.startsWith("xl/") ? target : `xl/${target}`;
  const sheet = new DOMParser().parseFromString(decoder(sheetPath), "text/xml");
  const matrix = [...sheet.querySelectorAll("sheetData row")].map((rowNode) => {
    const values: string[] = [];
    rowNode.querySelectorAll("c").forEach((cell) => {
      const ref = cell.getAttribute("r") ?? "A1";
      const letters = ref.replace(/[0-9]/g, "");
      let column = 0;
      for (const letter of letters) column = column * 26 + letter.charCodeAt(0) - 64;
      const type = cell.getAttribute("t");
      const raw = cell.querySelector("v")?.textContent ?? cell.querySelector("is t")?.textContent ?? "";
      values[column - 1] = type === "s" ? shared[Number(raw)] ?? "" : raw;
    });
    return values;
  });
  const headers = (matrix.shift() ?? []).map((header, index) => header || `Column ${index + 1}`);
  if (!headers.length) throw new Error("The first worksheet has no header row.");
  return { headers, rows: matrix.filter((row) => row.some((cell) => cell !== "")).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))) };
}

export function validateRows(rows: Record<string, string>[], mapping: Record<string, string>, datasetType: DatasetType, references?: ValidationReferences) {
  const fields = standardFields[datasetType];
  const mappedTargets = new Set(Object.values(mapping));
  const issues: ValidationIssueData[] = [];
  fields.filter((field) => field.required && !mappedTargets.has(field.key)).forEach((field) => issues.push({ row: 0, field: field.key, severity: "rejection", ruleCode: "missing_mapping", explanation: `${field.label} must be mapped.` }));
  const mappedRows = rows.map((row) => Object.fromEntries(Object.entries(mapping).filter(([, target]) => target).map(([source, target]) => [target, row[source] ?? ""])));
  const fingerprints = new Set<string>();
  mappedRows.forEach((row, index) => {
    fields.forEach((field) => {
      const value = row[field.key];
      if (field.required && !value) issues.push({ row: index + 2, field: field.key, severity: "rejection", ruleCode: "required_value", explanation: `${field.label} is required.`, enteredValue: value });
      if (value && field.type === "number" && (!Number.isFinite(Number(String(value).replace(/,/g, ""))) || Number(String(value).replace(/,/g, "")) < 0)) issues.push({ row: index + 2, field: field.key, severity: "rejection", ruleCode: "valid_non_negative_number", explanation: `${field.label} must be a non-negative number.`, enteredValue: value });
      if (value && field.type === "date" && !isValidDateValue(value)) issues.push({ row: index + 2, field: field.key, severity: "rejection", ruleCode: "valid_date", explanation: `${field.label} must be a valid date.`, enteredValue: value });
    });
    if (references) {
      (["line", "machine", "sku", "shift", "material", "supplier", "reason"] as const).forEach((field) => {
        const value = row[field];
        if (value && references[field].length && !references[field].some((candidate) => normalizeReference(candidate) === normalizeReference(value))) {
          issues.push({ row: index + 2, field, severity: "warning", ruleCode: "unknown_master_reference", explanation: `${value} is not in the active ${field} master. Review or add it during factory setup.`, enteredValue: value });
        }
      });
      const expectedLine = row.machine ? references.machineLines[normalizeReference(row.machine)] : undefined;
      if (expectedLine && row.line && normalizeReference(expectedLine) !== normalizeReference(row.line)) {
        issues.push({ row: index + 2, field: "machine", severity: "warning", ruleCode: "machine_line_mismatch", explanation: `${row.machine} belongs to ${expectedLine}, not ${row.line}.`, enteredValue: row.machine });
      }
    }
    const fingerprint = JSON.stringify(row);
    if (fingerprints.has(fingerprint)) issues.push({ row: index + 2, field: "record", severity: "warning", ruleCode: "duplicate_record", explanation: "This row duplicates an earlier row." });
    fingerprints.add(fingerprint);
    if (datasetType === "production") {
      const actual = numeric(row.actual_quantity); const good = numeric(row.good_quantity); const rejected = numeric(row.rejected_quantity); const reworked = numeric(row.reworked_quantity);
      if (good > actual) issues.push({ row: index + 2, field: "good_quantity", severity: "rejection", ruleCode: "good_above_actual", explanation: "Good quantity cannot exceed actual quantity." });
      if (actual && Math.abs(good + rejected + reworked - actual) > 0.01) issues.push({ row: index + 2, field: "actual_quantity", severity: "warning", ruleCode: "quantity_reconciliation", explanation: "Good + rejected + reworked does not equal actual quantity." });
    }
  });
  return { mappedRows, issues };
}

function normalizeReference(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ""); }

function isValidDateValue(value: string) {
  const trimmed = value.trim();
  if (/^\d{5}(\.\d+)?$/.test(trimmed)) return Number(trimmed) > 0;
  return !Number.isNaN(new Date(trimmed).getTime());
}

export function numeric(value: unknown, fallback = 0) { const number = Number(String(value ?? "").replace(/,/g, "")); return Number.isFinite(number) ? number : fallback; }

export function downloadTemplate(datasetType: DatasetType) {
  const headers = standardFields[datasetType].map((field) => field.label);
  const examples: Record<DatasetType, string[]> = {
    production: ["2026-07-31", "Press Line 02", "Press 01", "AX-440", "Shift A", "ORD-1082", "1200", "1120", "1085", "25", "10", "480", "42", "0.32"],
    downtime: ["2026-07-31", "Press Line 02", "Press 04", "Shift A", "Hydraulic failure", "52", "4"],
    quality: ["2026-07-31", "Press Line 02", "Press 04", "AX-440", "Shift A", "1200", "35", "10", "Connector misalignment"],
    inventory: ["2026-07-31", "Steel coil 1.2mm", "Tata Steel", "1300", "1000", "1800", "2026-08-02", "2026-08-01", "delayed"],
    orders: ["ORD-1082", "AX-440", "Press Line 02", "12000", "9100", "2026-08-01", "high", "open"],
  };
  const csv = [headers, examples[datasetType]].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
  downloadBlob(csv, `vulcan_${datasetType}_template.csv`, "text/csv;charset=utf-8");
}

export function downloadBlob(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

export function googleSheetCsvUrl(input: string) {
  const match = input.match(/\/spreadsheets\/d\/([^/]+)/);
  if (!match) return input;
  const gid = input.match(/[?&#]gid=(\d+)/)?.[1] ?? "0";
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`;
}

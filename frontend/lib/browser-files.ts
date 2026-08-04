import type { DatasetType } from "./factory-domain";

export function downloadTemplate(type: DatasetType) {
  const anchor = document.createElement("a");
  anchor.href = `/api/backend/api/imports/template/${type}/`;
  anchor.download = `vulcan_${type}_template.xlsx`;
  anchor.click();
}

export function downloadBlob(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

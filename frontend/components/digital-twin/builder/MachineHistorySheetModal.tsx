"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, FileSpreadsheet, Loader2, Search, X } from "lucide-react";
import type { MachineParameter } from "@/lib/spatial-types";
import { exportToCsv } from "@/lib/browser-files";
import { PortalOverlay } from "@/components/ui/portal-overlay";

export interface MachineHistorySheetModalProps {
  machineId: string;
  machineName: string;
  parameters?: MachineParameter[];
  inputs?: Array<{ id: string; label: string; unitType: string }>;
  outputs?: Array<{ id: string; label: string; unitType: string }>;
  onClose: () => void;
}

interface ObservationRecord {
  id: string;
  values: Record<string, unknown>;
  submitted_at: string;
  submitted_by?: string | null;
}

const API_SPATIAL = "/api/backend/api/spatial";

export function MachineHistorySheetModal({
  machineId,
  machineName,
  parameters = [],
  inputs = [],
  outputs = [],
  onClose,
}: MachineHistorySheetModalProps) {
  const [observations, setObservations] = useState<ObservationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);

  // Fetch full observation history
  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      setLoading(true);
      try {
        const response = await fetch(
          `${API_SPATIAL}/machines/${machineId}/observations/?limit=500`,
          {
            headers: { Accept: "application/json" },
            credentials: "same-origin",
          }
        );
        if (!response.ok) {
          if (!cancelled) setObservations([]);
          return;
        }
        const data = await response.json();
        if (!cancelled) {
          const results = Array.isArray(data) ? data : data.results ?? [];
          setObservations(results);
        }
      } catch {
        if (!cancelled) setObservations([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [machineId]);

  // Dynamically collect column keys from parameters, IO fields, and any unexpected observation keys
  const columns = useMemo(() => {
    const cols: Array<{ key: string; label: string; type: "core" | "parameter" | "input" | "output" }> = [];

    // Core columns
    cols.push({ key: "__timestamp", label: "Date / Time", type: "core" });
    cols.push({ key: "__operator", label: "Recorded By", type: "core" });
    cols.push({ key: "active", label: "Status", type: "core" });

    // Known parameters
    for (const p of parameters) {
      if (p.key !== "active") {
        cols.push({ key: p.key, label: p.key, type: "parameter" });
      }
    }

    // Input fields
    for (const io of inputs) {
      cols.push({ key: `input_${io.id}`, label: `In: ${io.label} (${io.unitType})`, type: "input" });
    }

    // Output fields
    for (const io of outputs) {
      cols.push({ key: `output_${io.id}`, label: `Out: ${io.label} (${io.unitType})`, type: "output" });
    }

    // Include any observation keys not yet covered
    const existingKeys = new Set(cols.map((c) => c.key));
    for (const obs of observations) {
      for (const k of Object.keys(obs.values || {})) {
        if (!existingKeys.has(k)) {
          existingKeys.add(k);
          cols.push({ key: k, label: k, type: "parameter" });
        }
      }
    }

    return cols;
  }, [parameters, inputs, outputs, observations]);

type SheetCellValue = string | number | boolean | null | undefined;

  // Build spreadsheet rows
  const rawRows: SheetCellValue[][] = useMemo(() => {
    return observations.map((obs) => {
      return columns.map((col): SheetCellValue => {
        if (col.key === "__timestamp") {
          return obs.submitted_at
            ? new Date(obs.submitted_at).toLocaleString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })
            : "—";
        }
        if (col.key === "__operator") {
          return obs.submitted_by || "QR Scan";
        }
        if (col.key === "active") {
          const val = obs.values["active"];
          if (val === true || val === "true") return "Running";
          if (val === false || val === "false") return "Down";
          return "—";
        }
        const val = obs.values[col.key];
        if (val === undefined || val === null) return "—";
        if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
          return val;
        }
        return String(val);
      });
    });
  }, [observations, columns]);

  // Filter rows based on search
  const filteredRows: SheetCellValue[][] = useMemo(() => {
    if (!searchQuery.trim()) return rawRows;
    const q = searchQuery.toLowerCase();
    return rawRows.filter((row) =>
      row.some((cell) => cell !== null && cell !== undefined && String(cell).toLowerCase().includes(q))
    );
  }, [rawRows, searchQuery]);

  // Copy table to TSV for Excel pasting
  const handleCopyTsv = useCallback(() => {
    const headersText = columns.map((c) => c.label).join("\t");
    const rowsText = filteredRows
      .map((row) => row.map((cell) => (cell === "—" || cell === null ? "" : String(cell))).join("\t"))
      .join("\n");
    const tsv = `${headersText}\n${rowsText}`;
    navigator.clipboard.writeText(tsv).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [columns, filteredRows]);

  // Export to CSV file
  const handleExportCsv = useCallback(() => {
    const filename = `${machineName.toLowerCase().replace(/[^a-z0-9]/g, "-")}-history`;
    const headerLabels = columns.map((c) => c.label);
    exportToCsv(filename, headerLabels, filteredRows);
  }, [machineName, columns, filteredRows]);

  const getColLetter = (index: number) => {
    let letter = "";
    let temp = index;
    while (temp >= 0) {
      letter = String.fromCharCode((temp % 26) + 65) + letter;
      temp = Math.floor(temp / 26) - 1;
    }
    return letter;
  };

  return (
    <PortalOverlay
      isOpen={true}
      onClose={onClose}
      ariaLabel={`Full history for ${machineName}`}
      backdropClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div
        className="relative w-full max-w-6xl h-[88vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden border border-gray-200"
        role="dialog"
        aria-modal="true"
        aria-label={`Full history for ${machineName}`}
      >
        {/* Modal Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 border-b border-gray-200 bg-gray-50 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 shrink-0">
              <FileSpreadsheet size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-gray-900 truncate">
                  {machineName} · Historical Data Preview Sheet
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800 tnum">
                  {observations.length} Records
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Full telemetry timeline · {columns.length} columns · Single Source of Truth
              </p>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search history..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 w-48 text-gray-800 placeholder-gray-400 min-h-[36px]"
              />
            </div>

            {/* Copy Table TSV */}
            <button
              type="button"
              onClick={handleCopyTsv}
              disabled={filteredRows.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-md transition-colors shadow-xs min-h-[36px]"
              title="Copy rows as TSV for direct paste into Excel (Ctrl+V)"
            >
              {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              {copied ? "Copied to Clipboard!" : "Copy Table (TSV)"}
            </button>

            {/* Export CSV */}
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredRows.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-emerald-700 hover:bg-emerald-800 text-white rounded-md transition-colors shadow-xs min-h-[36px]"
            >
              <Download size={14} />
              Export CSV
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-md hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors ml-1"
              aria-label="Close modal"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Spreadsheet Body */}
        <div className="flex-1 overflow-auto bg-white p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-2 text-gray-400">
              <Loader2 size={24} className="animate-spin text-emerald-600" />
              <p className="text-xs">Loading complete observation history...</p>
            </div>
          ) : observations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-2 text-gray-400">
              <FileSpreadsheet size={32} className="text-gray-300" />
              <p className="text-sm font-medium text-gray-600">No observations logged yet</p>
              <p className="text-xs text-gray-400">
                Scan this room&apos;s QR sticker or enter telemetry via the mobile entry portal to record data.
              </p>
            </div>
          ) : (
            <div
              style={{
                border: "1px solid #d4d4d4",
                borderRadius: "6px",
                overflow: "hidden",
                background: "#ffffff",
              }}
            >
              <div style={{ overflowX: "auto", maxHeight: "calc(88vh - 170px)" }}>
                <table
                  style={{
                    borderCollapse: "collapse",
                    width: "100%",
                    fontSize: "12px",
                    fontFamily: "Segoe UI, -apple-system, BlinkMacSystemFont, sans-serif",
                  }}
                >
                  <thead className="sticky top-0 z-10 shadow-xs">
                    {/* Excel Column Letters Row */}
                    <tr
                      style={{
                        background: "#f3f3f3",
                        borderBottom: "1px solid #d4d4d4",
                        textAlign: "center",
                        color: "#666",
                        fontSize: "12px",
                      }}
                    >
                      <th
                        style={{
                          width: "45px",
                          padding: "4px 8px",
                          borderRight: "1px solid #d4d4d4",
                          fontWeight: 600,
                        }}
                      >
                        #
                      </th>
                      {columns.map((_, i) => (
                        <th
                          key={i}
                          style={{
                            padding: "4px 10px",
                            borderRight: "1px solid #d4d4d4",
                            fontWeight: 600,
                            minWidth: "100px",
                          }}
                        >
                          {getColLetter(i)}
                        </th>
                      ))}
                    </tr>

                    {/* Header Titles Row (Excel Green) */}
                    <tr
                      style={{
                        background: "#107c41",
                        color: "#ffffff",
                        borderBottom: "1px solid #0d5e31",
                        textAlign: "left",
                      }}
                    >
                      <th
                        style={{
                          padding: "8px 10px",
                          borderRight: "1px solid rgba(255,255,255,0.2)",
                          textAlign: "center",
                        }}
                      >
                        №
                      </th>
                      {columns.map((col, i) => (
                        <th
                          key={i}
                          style={{
                            padding: "8px 12px",
                            borderRight: "1px solid rgba(255,255,255,0.2)",
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {filteredRows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        style={{
                          background: rIdx % 2 === 0 ? "#ffffff" : "#fbfcfe",
                          borderBottom: "1px solid #e9ecef",
                        }}
                        className="hover:bg-blue-50/40 transition-colors"
                      >
                        {/* Row Index */}
                        <td
                          style={{
                            padding: "6px 8px",
                            borderRight: "1px solid #e2e8f0",
                            background: "#f8f9fa",
                            textAlign: "center",
                            color: "#718096",
                            fontSize: "12px",
                            fontWeight: 500,
                          }}
                          className="tnum"
                        >
                          {rIdx + 1}
                        </td>
                        {/* Cells */}
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            style={{
                              padding: "6px 12px",
                              borderRight: "1px solid #edf2f7",
                              whiteSpace: "nowrap",
                              color: cell === "—" || cell === null ? "#a0aec0" : "#2d3748",
                            }}
                            className={typeof cell === "number" ? "tnum" : undefined}
                          >
                            {typeof cell === "number" ? cell.toLocaleString("en-IN") : String(cell ?? "—")}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {filteredRows.length === 0 && (
                      <tr>
                        <td
                          colSpan={columns.length + 1}
                          style={{ textAlign: "center", padding: "32px", color: "#a0aec0" }}
                        >
                          No matching records found for &quot;{searchQuery}&quot;.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Bar */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-500 shrink-0">
          <span>
            Showing {filteredRows.length} of {observations.length} records · Microsoft Excel Compatible
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium transition-colors min-h-[36px]"
          >
            Close
          </button>
        </div>
      </div>
    </PortalOverlay>
  );
}

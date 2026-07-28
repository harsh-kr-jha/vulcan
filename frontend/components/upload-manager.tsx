"use client";

import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  FileSpreadsheet,
  Filter,
  Plus,
  Search,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { UploadStatusPill } from "@/components/ui/status-pill";
import type { UploadRecord } from "@/lib/types";

const mappings = [
  { source: "Production Date", target: "operational_date", confidence: "High", sample: "29/07/2026" },
  { source: "Line Name", target: "production_line", confidence: "High", sample: "Line 02" },
  { source: "Actual Output", target: "actual_quantity", confidence: "High", sample: "1,240" },
  { source: "Accepted Qty", target: "good_quantity", confidence: "Medium", sample: "1,198" },
  { source: "Scrap", target: "rejected_quantity", confidence: "Medium", sample: "42" },
];

function SummaryCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "green" | "amber" | "blue";
}) {
  return (
    <article className={`upload-summary-card summary-${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function UploadDialog({ onClose }: { onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<"select" | "mapping" | "queued">("select");

  if (step === "queued") {
    return (
      <div className="modal-backdrop" role="presentation">
        <div className="upload-modal upload-success-modal" role="dialog" aria-modal="true" aria-label="Upload queued">
          <span className="success-mark"><Check size={28} /></span>
          <h2>Upload queued</h2>
          <p>
            <strong>{file?.name}</strong> is ready for server-side validation. You can
            safely leave this page while the job runs.
          </p>
          <button className="button button-primary" onClick={onClose}>View upload status</button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="upload-modal" role="dialog" aria-modal="true" aria-labelledby="upload-title">
        <div className="modal-header">
          <div>
            <span className="modal-step">New data upload · {step === "select" ? "Step 1 of 2" : "Step 2 of 2"}</span>
            <h2 id="upload-title">{step === "select" ? "Choose your factory data" : "Confirm column mapping"}</h2>
            <p>
              {step === "select"
                ? "Files are stored unchanged, then processed securely in the background."
                : "We matched your headers against Production template v3."}
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close upload">
            <X size={18} />
          </button>
        </div>

        {step === "select" ? (
          <div className="modal-body">
            <div className="upload-form-grid">
              <label>
                Factory
                <span className="select-field">Pune Plant 01 <ChevronDown size={14} /></span>
              </label>
              <label>
                Data template
                <span className="select-field">Production v3 <ChevronDown size={14} /></span>
              </label>
            </div>
            <button className={`drop-zone ${file ? "drop-zone-selected" : ""}`} onClick={() => inputRef.current?.click()}>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx"
                hidden
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              {file ? (
                <>
                  <span className="file-mark"><FileSpreadsheet size={24} /></span>
                  <strong>{file.name}</strong>
                  <small>{(file.size / 1024 / 1024).toFixed(1)} MB · Ready to inspect</small>
                </>
              ) : (
                <>
                  <span className="drop-icon"><UploadCloud size={24} /></span>
                  <strong>Drop a CSV or Excel file here</strong>
                  <small>or click to browse · XLSX up to 50 MB, CSV up to 500 MB</small>
                </>
              )}
            </button>
            <div className="security-note">
              <ShieldCheck size={17} />
              <span><strong>Secure direct upload</strong>Your file never passes through the web server.</span>
            </div>
          </div>
        ) : (
          <div className="modal-body">
            <div className="mapping-summary">
              <span><Check size={14} /> 5 of 5 required fields mapped</span>
              <strong>Header signature matched at 96%</strong>
            </div>
            <div className="mapping-table-wrap">
              <table className="data-table mapping-table">
                <thead><tr><th>Source column</th><th>Maps to</th><th>Confidence</th><th>Sample</th></tr></thead>
                <tbody>
                  {mappings.map((mapping) => (
                    <tr key={mapping.source}>
                      <td><strong>{mapping.source}</strong></td>
                      <td><span className="mapping-target">{mapping.target}<ChevronDown size={12} /></span></td>
                      <td><span className={`mapping-confidence confidence-${mapping.confidence.toLowerCase()}`}>{mapping.confidence}</span></td>
                      <td className="numeric">{mapping.sample}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mapping-info">
              This mapping will be saved for future files with the same header signature.
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button className="button button-secondary" onClick={step === "mapping" ? () => setStep("select") : onClose}>
            {step === "mapping" ? "Back" : "Cancel"}
          </button>
          <button
            className="button button-primary"
            disabled={!file}
            onClick={() => setStep(step === "select" ? "mapping" : "queued")}
          >
            {step === "select" ? "Inspect & continue" : "Confirm & validate"}
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function UploadManager({ initialUploads }: { initialUploads: UploadRecord[] }) {
  const [showUpload, setShowUpload] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const filteredUploads = useMemo(
    () =>
      initialUploads.filter(
        (upload) =>
          (status === "all" || upload.status === status) &&
          upload.filename.toLowerCase().includes(query.toLowerCase()),
      ),
    [initialUploads, query, status],
  );

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Data operations</p>
          <h1>Uploads <span>& processing</span></h1>
          <p className="page-subtitle">Trace every source file from ingestion to approved operational records.</p>
        </div>
        <div className="page-actions">
          <button className="button button-accent" onClick={() => setShowUpload(true)}>
            <Plus size={15} /> Upload factory data
          </button>
        </div>
      </header>

      <section className="upload-summary-grid">
        <SummaryCard label="Processed this month" value="48" detail="1.24M standardised rows" tone="green" />
        <SummaryCard label="Awaiting review" value="2" detail="65 rows need attention" tone="amber" />
        <SummaryCard label="Average data quality" value="98.7%" detail="+1.4% from last month" tone="blue" />
      </section>

      <section className="panel uploads-panel">
        <div className="uploads-toolbar">
          <div>
            <h2 className="panel-title">Upload history</h2>
            <p className="panel-subtitle">Original files are immutable and retained with complete lineage.</p>
          </div>
          <div className="table-filters">
            <label className="search-field">
              <Search size={14} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files…" />
            </label>
            <label className="filter-control">
              <Filter size={13} />
              <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter upload status">
                <option value="all">All statuses</option>
                <option value="COMPLETED">Completed</option>
                <option value="VALIDATION_REVIEW">Needs review</option>
                <option value="MAPPING_REQUIRED">Map columns</option>
                <option value="FAILED">Failed</option>
              </select>
              <ChevronDown size={12} />
            </label>
          </div>
        </div>
        <div className="table-panel">
          <table className="data-table uploads-table">
            <thead>
              <tr>
                <th>File</th><th>Template</th><th>Status</th><th>Rows</th>
                <th>Data quality</th><th>Uploaded by</th><th><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {filteredUploads.map((upload) => (
                <tr key={upload.id}>
                  <td>
                    <span className="file-cell">
                      <i><FileSpreadsheet size={16} /></i>
                      <span><b>{upload.filename}</b><small>{upload.id} · {upload.size}</small></span>
                    </span>
                  </td>
                  <td>{upload.template}</td>
                  <td><UploadStatusPill status={upload.status} /></td>
                  <td className="numeric">
                    <span className="table-primary">{upload.rows ? upload.rows.toLocaleString("en-IN") : "—"}</span>
                    {upload.warningRows > 0 && <span className="table-secondary text-warning">{upload.warningRows} warnings</span>}
                  </td>
                  <td>
                    {upload.dataQualityScore > 0 ? (
                      <span className="score-cell"><i><b style={{ width: `${upload.dataQualityScore}%` }} /></i><strong>{upload.dataQualityScore}%</strong></span>
                    ) : "—"}
                  </td>
                  <td><span className="table-primary">{upload.uploadedBy}</span><span className="table-secondary">{upload.uploadedAt}</span></td>
                  <td>
                    {upload.status === "VALIDATION_REVIEW" || upload.status === "MAPPING_REQUIRED" ? (
                      <button className="button button-secondary table-action">Review <ArrowRight size={12} /></button>
                    ) : upload.status === "FAILED" ? (
                      <button className="button button-secondary table-action"><CircleAlert size={12} /> Inspect</button>
                    ) : (
                      <button className="row-menu" aria-label={`Open ${upload.filename}`}><ArrowRight size={14} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredUploads.length === 0 && <div className="empty-state">No uploads match these filters.</div>}
        </div>
      </section>

      {showUpload && <UploadDialog onClose={() => setShowUpload(false)} />}
    </>
  );
}

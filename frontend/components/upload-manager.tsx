"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  ClipboardPen,
  Cloud,
  DatabaseZap,
  Download,
  FileCheck2,
  FileSpreadsheet,
  Filter,
  Link2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Table2,
  UploadCloud,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { UploadStatusPill } from "@/components/ui/status-pill";
import { useFactory } from "@/lib/factory-context";
import type { DataSource, DatasetType, UploadDataset } from "@/lib/factory-domain";
import { datasetLabels } from "@/lib/factory-domain";
import {
  downloadBlob,
  downloadTemplate,
  buildValidationReferences,
  parseCSV,
  parseTabularFile,
  standardFields,
  suggestMapping,
  validateRows,
} from "@/lib/ingestion";

type InputMode = "file" | "sheets" | "manual" | "templates" | "integrations";
type WizardStep = "input" | "mapping" | "validation" | "complete";

const modes: { id: InputMode; label: string; icon: typeof UploadCloud; description: string }[] = [
  { id: "file", label: "Excel / CSV", icon: UploadCloud, description: "Upload an existing operational file" },
  { id: "sheets", label: "Google Sheets", icon: Link2, description: "Connect a public sheet by URL" },
  { id: "manual", label: "Manual entry", icon: ClipboardPen, description: "Enter a record directly" },
  { id: "templates", label: "Templates", icon: Download, description: "Download standard starter files" },
  { id: "integrations", label: "Integrations", icon: DatabaseZap, description: "ERP, Tally and IoT readiness" },
];

function toUploadStatus(upload: UploadDataset) {
  if (upload.status === "completed") return "COMPLETED" as const;
  if (upload.status === "needs_mapping") return "MAPPING_REQUIRED" as const;
  if (upload.status === "failed") return "FAILED" as const;
  return "VALIDATION_REVIEW" as const;
}

function MappingEditor({ headers, rows, datasetType, mapping, setMapping }: { headers: string[]; rows: Record<string, string>[]; datasetType: DatasetType; mapping: Record<string, string>; setMapping: (mapping: Record<string, string>) => void }) {
  const fields = standardFields[datasetType];
  const mapped = new Set(Object.values(mapping));
  return <div className="mapping-editor"><div className="mapping-editor-head"><div><strong>Map source columns</strong><span>Suggested using saved profiles, aliases and header similarity.</span></div><b>{mapped.size} fields mapped</b></div><div className="mapping-grid-table"><div className="mapping-grid-row mapping-grid-header"><span>Source column</span><span>Sample values</span><span>Standard field</span><span>Match</span></div>{headers.map((header) => { const target = mapping[header] ?? ""; const field = fields.find((item) => item.key === target); const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, ""); const exact = field?.aliases.some((alias) => alias.toLowerCase().replace(/[^a-z0-9]/g, "") === normalized); return <div className="mapping-grid-row" key={header}><strong>{header}</strong><span className="sample-values">{rows.slice(0, 2).map((row) => row[header]).filter(Boolean).join(" · ") || "—"}</span><label><select value={target} onChange={(event) => setMapping({ ...mapping, [header]: event.target.value })}><option value="">Do not import</option>{fields.map((item) => <option value={item.key} key={item.key} disabled={mapped.has(item.key) && item.key !== target}>{item.label}{item.required ? " *" : ""}</option>)}</select><ChevronDown size={12} /></label><span className={`mapping-confidence ${!target ? "confidence-low" : exact ? "confidence-high" : "confidence-medium"}`}>{!target ? "Unmapped" : exact ? "High" : "Suggested"}</span></div>; })}</div><p className="mapping-footnote"><ShieldCheck size={13} /> Required fields are marked *. Approved mappings are saved for this factory and dataset type.</p></div>;
}

function DataWizard({ initialMode, onClose }: { initialMode: InputMode; onClose: () => void }) {
  const { state, importDataset } = useFactory();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<InputMode>(initialMode);
  const [step, setStep] = useState<WizardStep>("input");
  const [datasetType, setDatasetType] = useState<DatasetType>("production");
  const [filename, setFilename] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [sheetUrl, setSheetUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<UploadDataset | null>(null);
  const [integrationRequests, setIntegrationRequests] = useState<string[]>([]);
  const references = useMemo(() => buildValidationReferences(state.masters, state.activeFactoryId), [state.masters, state.activeFactoryId]);
  const validation = useMemo(() => validateRows(rows, mapping, datasetType, references), [rows, mapping, datasetType, references]);
  const requiredMissing = validation.issues.filter((issue) => issue.row === 0 && issue.severity === "rejection").length;

  function prepareData(nextHeaders: string[], nextRows: Record<string, string>[], name: string, source: DataSource) {
    if (!nextHeaders.length || !nextRows.length) throw new Error("No data rows were found in the first sheet.");
    const saved = state.mappingProfiles[`${state.activeFactoryId}:${datasetType}`];
    setHeaders(nextHeaders); setRows(nextRows); setFilename(name);
    setMapping(suggestMapping(nextHeaders, datasetType, saved));
    setStep("mapping"); setError("");
    if (source === "google_sheets") setMode("sheets");
  }

  async function chooseFile(file?: File) {
    if (!file) return;
    setLoading(true); setError("");
    try { const parsed = await parseTabularFile(file); prepareData(parsed.headers, parsed.rows, file.name, file.name.toLowerCase().endsWith("xlsx") ? "excel" : "csv"); }
    catch (fileError) { setError(fileError instanceof Error ? fileError.message : "Unable to read this file."); }
    finally { setLoading(false); }
  }

  async function connectSheet() {
    setLoading(true); setError("");
    try { const response = await fetch(`/api/google-sheet?url=${encodeURIComponent(sheetUrl)}`); if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; throw new Error(body.error ?? "The sheet could not be read. Set sharing to ‘Anyone with the link can view’. "); } const parsed = parseCSV(await response.text()); prepareData(parsed.headers, parsed.rows, "Google Sheet", "google_sheets"); }
    catch (sheetError) { setError(sheetError instanceof Error ? sheetError.message : "Unable to connect the sheet."); }
    finally { setLoading(false); }
  }

  function importRows(source: DataSource) {
    const upload = importDataset({ filename: filename || `${datasetLabels[datasetType]} manual entry`, datasetType, source, headers, rows, mapping });
    setResult(upload); setStep("complete");
  }

  function updateManual(field: string, value: string) {
    const nextHeaders = headers.includes(field) ? headers : [...headers, field];
    setHeaders(nextHeaders); setRows([{ ...(rows[0] ?? {}), [field]: value }]); setMapping(Object.fromEntries(nextHeaders.map((key) => [key, key])));
  }

  if (step === "complete" && result) return <div className="modal-backdrop"><div className="upload-modal completion-dialog"><span className="completion-icon"><Check size={26} /></span><p className="eyebrow">Intelligence refreshed</p><h2>{result.acceptedRows} rows added</h2><p>The original source and approved mapping are preserved. Command-centre answers now include this dataset.</p><div className="completion-stats"><div><strong>{result.dataQualityScore}%</strong><span>Data quality</span></div><div><strong>{result.warningRows}</strong><span>Warnings</span></div><div><strong>{result.rejectedRows}</strong><span>Rejected</span></div></div><div><button className="button button-secondary" onClick={() => { setStep("input"); setRows([]); setHeaders([]); setResult(null); }}>Add more data</button><button className="button button-primary" onClick={() => { onClose(); window.location.assign("/"); }}>View command centre <ArrowRight size={13} /></button></div></div></div>;

  return <div className="modal-backdrop"><div className="upload-modal data-workbench-modal" role="dialog" aria-modal="true"><div className="modal-header"><div><span className="modal-step">Data workbench · {step === "input" ? "Choose source" : step === "mapping" ? "Map fields" : "Validate records"}</span><h2>{step === "input" ? "Bring factory data into Vulcan" : step === "mapping" ? `Map ${datasetLabels[datasetType].toLowerCase()} data` : "Review data quality"}</h2><p>Raw data is retained separately from approved operational records.</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
    {step === "input" && <div className="modal-body workbench-body"><div className="source-mode-tabs">{modes.map((item) => { const Icon = item.icon; return <button key={item.id} className={mode === item.id ? "active" : ""} onClick={() => { setMode(item.id); setError(""); }}><Icon size={16} /><span>{item.label}</span></button>; })}</div>
      <div className="dataset-selector"><label>What data are you adding?<select value={datasetType} onChange={(event) => { setDatasetType(event.target.value as DatasetType); setRows([]); setHeaders([]); }}><option value="production">Production plan & actual</option><option value="downtime">Machine downtime</option><option value="quality">Quality & rejections</option><option value="inventory">Inventory & receipts</option><option value="orders">Production orders</option></select><ChevronDown size={13} /></label><div><span>Destination</span><strong>{state.factories.find((factory) => factory.id === state.activeFactoryId)?.name}</strong></div></div>
      {mode === "file" && <button className="drop-zone workbench-drop" onClick={() => inputRef.current?.click()}><input ref={inputRef} hidden type="file" accept=".csv,.xlsx" onChange={(event) => chooseFile(event.target.files?.[0])} /><span className="drop-icon">{loading ? <RefreshCw className="spin" size={23} /> : <UploadCloud size={23} />}</span><strong>{loading ? "Reading file…" : "Drop an Excel or CSV file here"}</strong><small>XLSX and CSV are read locally for this MVP; the original rows are never overwritten.</small></button>}
      {mode === "sheets" && <div className="connector-form"><span className="connector-logo"><Table2 size={22} /></span><div><strong>Connect a Google Sheet</strong><p>Paste a public sharing URL. Vulcan reads the selected tab as CSV.</p></div><label>Google Sheets URL<input value={sheetUrl} onChange={(event) => setSheetUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" /></label><button className="button button-primary" disabled={!sheetUrl || loading} onClick={connectSheet}>{loading ? <RefreshCw className="spin" size={13} /> : <Link2 size={13} />} Connect sheet</button></div>}
      {mode === "manual" && <div className="manual-entry-form"><div><strong>Enter one {datasetLabels[datasetType].toLowerCase()} record</strong><span>Useful for corrections, small factories and data not held in a sheet.</span></div><div className="manual-fields">{standardFields[datasetType].map((field) => <label key={field.key}>{field.label}{field.required && <b>*</b>}<input type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"} min={field.type === "number" ? 0 : undefined} value={rows[0]?.[field.key] ?? ""} onChange={(event) => updateManual(field.key, event.target.value)} /></label>)}</div><button className="button button-primary" disabled={!rows.length || requiredMissing > 0} onClick={() => importRows("manual")}><Check size={13} /> Validate & save entry</button></div>}
      {mode === "templates" && <div className="template-grid">{(Object.keys(datasetLabels) as DatasetType[]).map((type) => <article key={type}><span><FileSpreadsheet size={20} /></span><div><strong>{datasetLabels[type]} template</strong><p>{standardFields[type].filter((field) => field.required).length} required fields · sample row included</p></div><button className="button button-secondary" onClick={() => downloadTemplate(type)}><Download size={12} /> Download CSV</button></article>)}</div>}
      {mode === "integrations" && <div className="integrations-grid">{[{ name: "ERP / SAP", copy: "Production orders and material movements", icon: DatabaseZap }, { name: "Tally", copy: "Purchase and supplier transactions", icon: FileCheck2 }, { name: "IoT / machines", copy: "High-frequency run and stop events", icon: Cloud }].map((item) => { const Icon = item.icon; const requested = integrationRequests.includes(item.name); return <article key={item.name}><span><Icon size={20} /></span><strong>{item.name}</strong><p>{item.copy}</p><button className={`button ${requested ? "button-secondary" : "button-primary"}`} onClick={() => setIntegrationRequests((current) => requested ? current.filter((name) => name !== item.name) : [...current, item.name])}>{requested ? <><Check size={12} /> Requested</> : "Request integration"}</button></article>; })}</div>}
      {error && <div className="workbench-error"><CircleAlert size={14} />{error}</div>}
    </div>}
    {step === "mapping" && <div className="modal-body"><MappingEditor headers={headers} rows={rows} datasetType={datasetType} mapping={mapping} setMapping={setMapping} /></div>}
    {step === "validation" && <div className="modal-body validation-review"><div className="validation-summary-cards"><article className="valid"><span><Check size={16} /></span><div><strong>{Math.max(rows.length - new Set(validation.issues.filter((issue) => issue.severity === "rejection" && issue.row > 0).map((issue) => issue.row)).size, 0)}</strong><small>Accepted rows</small></div></article><article className="warning"><span>!</span><div><strong>{validation.issues.filter((issue) => issue.severity === "warning").length}</strong><small>Warnings</small></div></article><article className="rejected"><span>×</span><div><strong>{validation.issues.filter((issue) => issue.severity === "rejection").length}</strong><small>Validation issues</small></div></article></div><div className="validation-issues"><div><strong>Validation results</strong><button onClick={() => downloadBlob(["Row,Field,Severity,Rule,Explanation", ...validation.issues.map((issue) => `${issue.row},${issue.field},${issue.severity},${issue.ruleCode},\"${issue.explanation}\"`)].join("\n"), "validation_issues.csv", "text/csv")}><Download size={12} /> Download issues</button></div>{validation.issues.slice(0, 8).map((issue, index) => <article key={`${issue.row}-${issue.field}-${index}`}><span className={issue.severity}>{issue.severity === "rejection" ? "×" : "!"}</span><div><strong>{issue.explanation}</strong><small>{issue.row ? `Row ${issue.row}` : "Mapping"} · {issue.field} · {issue.ruleCode}</small></div></article>)}{!validation.issues.length && <div className="validation-clean"><ShieldCheck size={20} /><strong>All checks passed</strong><span>Required values, data types, duplicates and quantity reconciliation are valid.</span></div>}</div><div className="raw-preserved-note"><ShieldCheck size={14} /><span><b>Raw source preserved:</b> corrections affect only standardised records; the imported rows remain unchanged.</span></div></div>}
    {(step === "mapping" || step === "validation") && <div className="modal-footer"><button className="button button-secondary" onClick={() => setStep(step === "mapping" ? "input" : "mapping")}><ArrowLeft size={13} /> Back</button>{step === "mapping" ? <button className="button button-primary" disabled={requiredMissing > 0} onClick={() => setStep("validation")}>Run validation <ArrowRight size={13} /></button> : <button className="button button-primary" disabled={validation.issues.some((issue) => issue.row === 0 && issue.severity === "rejection")} onClick={() => importRows(mode === "sheets" ? "google_sheets" : filename.toLowerCase().endsWith("xlsx") ? "excel" : "csv")}><Check size={13} /> Approve accepted rows</button>}</div>}
  </div></div>;
}

function UploadDetail({ upload, onClose }: { upload: UploadDataset; onClose: () => void }) {
  return <div className="modal-backdrop"><div className="upload-modal upload-detail-modal"><div className="modal-header"><div><span className="modal-step">Immutable source · {upload.id}</span><h2>{upload.filename}</h2><p>{datasetLabels[upload.datasetType]} · {upload.source.replace("_", " ")} · imported {new Date(upload.importedAt).toLocaleString("en-IN")}</p></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div><div className="modal-body"><div className="lineage-steps"><div className="done"><span>1</span><strong>Raw</strong><small>{upload.rawRows.length || upload.acceptedRows} rows preserved</small></div><i /><div className="done"><span>2</span><strong>Mapped</strong><small>{Object.keys(upload.mapping).length || "Saved"} column rules</small></div><i /><div className="done"><span>3</span><strong>Standardised</strong><small>{upload.acceptedRows} approved rows</small></div><i /><div className="done"><span>4</span><strong>Intelligence</strong><small>Command centre refreshed</small></div></div><div className="upload-detail-stats"><div><span>Data quality</span><strong>{upload.dataQualityScore}%</strong></div><div><span>Accepted</span><strong>{upload.acceptedRows}</strong></div><div><span>Warnings</span><strong>{upload.warningRows}</strong></div><div><span>Rejected</span><strong>{upload.rejectedRows}</strong></div></div>{upload.issues.length > 0 && <div className="validation-issues compact"><div><strong>Issues</strong><button onClick={() => downloadBlob(JSON.stringify(upload.issues, null, 2), `${upload.id}-issues.json`, "application/json")}><Download size={12} /> Export</button></div>{upload.issues.slice(0, 5).map((issue, index) => <article key={index}><span className={issue.severity}>{issue.severity === "rejection" ? "×" : "!"}</span><div><strong>{issue.explanation}</strong><small>Row {issue.row} · {issue.field}</small></div></article>)}</div>}<div className="mapping-snapshot"><strong>Approved mapping</strong>{Object.entries(upload.mapping).length ? Object.entries(upload.mapping).map(([source, target]) => <span key={source}><b>{source}</b><ArrowRight size={11} /><code>{target}</code></span>) : <p>Legacy demo dataset · mapping lineage available from the source upload.</p>}</div></div><div className="modal-footer"><button className="button button-secondary" onClick={() => downloadBlob(JSON.stringify(upload.rawRows, null, 2), `${upload.id}-raw.json`, "application/json")}><Download size={12} /> Export preserved raw rows</button><button className="button button-primary" onClick={onClose}>Done</button></div></div></div>;
}

export function UploadManager() {
  const { state, intelligence } = useFactory();
  const [wizardMode, setWizardMode] = useState<InputMode | null>(null);
  const [selected, setSelected] = useState<UploadDataset | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const uploads = state.uploads.filter((upload) => upload.factoryId === state.activeFactoryId && upload.filename.toLowerCase().includes(query.toLowerCase()) && (filter === "all" || upload.datasetType === filter));
  const totalRows = state.uploads.reduce((total, upload) => total + upload.acceptedRows, 0);

  return <><header className="page-header"><div><p className="eyebrow">Layer 1 + 2 · data foundation</p><h1>Bring your data. <span>Map it once.</span></h1><p className="page-subtitle">Preserve every source, standardise factory fields and surface data-quality issues.</p></div><button className="button button-accent" onClick={() => setWizardMode("file")}><Plus size={14} /> Add factory data</button></header>
    <div className="data-source-launcher">{modes.map((mode) => { const Icon = mode.icon; return <button key={mode.id} onClick={() => setWizardMode(mode.id)}><span><Icon size={18} /></span><div><strong>{mode.label}</strong><small>{mode.description}</small></div><ArrowRight size={13} /></button>; })}</div>
    <div className="data-foundation-strip"><div><span>Preserved sources</span><strong>{state.uploads.length}</strong></div><div><span>Approved records</span><strong>{totalRows.toLocaleString("en-IN")}</strong></div><div><span>Saved mappings</span><strong>{Object.keys(state.mappingProfiles).filter((key) => key.split(":").length === 2).length}</strong></div><div><span>Data quality</span><strong>{intelligence.dataQuality.toFixed(1)}%</strong></div></div>
    <section className="panel uploads-panel"><div className="uploads-toolbar"><div><h2 className="panel-title">Source and processing history</h2><p className="panel-subtitle">Open any dataset to trace raw → mapped → standardised → intelligence.</p></div><div className="table-filters"><label className="search-field"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sources…" /></label><label className="filter-control"><Filter size={13} /><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All data</option>{Object.entries(datasetLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><ChevronDown size={12} /></label></div></div><div className="table-panel"><table className="data-table uploads-table"><thead><tr><th>Original source</th><th>Data type</th><th>Status</th><th>Approved rows</th><th>Data quality</th><th>Imported</th><th>Lineage</th></tr></thead><tbody>{uploads.map((upload) => <tr key={upload.id}><td><span className="file-cell"><i><FileSpreadsheet size={16} /></i><span><b>{upload.filename}</b><small>{upload.id} · {upload.source.replace("_", " ")}</small></span></span></td><td>{datasetLabels[upload.datasetType]}</td><td><UploadStatusPill status={toUploadStatus(upload)} /></td><td><span className="table-primary numeric">{upload.acceptedRows.toLocaleString("en-IN")}</span>{upload.rejectedRows > 0 && <span className="table-secondary text-danger">{upload.rejectedRows} rejected</span>}</td><td><span className="score-cell"><i><b style={{ width: `${upload.dataQualityScore}%` }} /></i><strong>{upload.dataQualityScore}%</strong></span></td><td><span className="table-primary">{new Date(upload.importedAt).toLocaleDateString("en-IN")}</span><span className="table-secondary">{new Date(upload.importedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span></td><td><button className="button button-secondary table-action" onClick={() => setSelected(upload)}>Inspect <ArrowRight size={12} /></button></td></tr>)}</tbody></table>{!uploads.length && <div className="empty-state">No source matches these filters.</div>}</div></section>
    {wizardMode && <DataWizard initialMode={wizardMode} onClose={() => setWizardMode(null)} />}{selected && <UploadDetail upload={selected} onClose={() => setSelected(null)} />}
  </>;
}

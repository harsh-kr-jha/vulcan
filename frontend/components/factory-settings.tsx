"use client";

import {
  Boxes,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Factory,
  FileSpreadsheet,
  Gauge,
  MapPin,
  Package,
  Plus,
  Trash2,
  UploadCloud,
  Workflow,
  Wrench,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api-client";
import { useFactory } from "@/lib/factory-context";
import type { FactoryConfig, FactoryDetails, FactoryMasterImportInspection, MasterItem } from "@/lib/factory-domain";
import { usePlatform } from "@/lib/variant";

const baseSections = [
  { id: "profile", label: "Company & farm", icon: Building2 },
  { id: "assets", label: "Cultivation flow", icon: Workflow },
  { id: "catalogue", label: "Mushrooms & materials", icon: Package },
  { id: "calendar", label: "Shifts & calendar", icon: CalendarClock },
  { id: "reasons", label: "Reason codes", icon: ClipboardCheck },
] as const;

type Section = (typeof baseSections)[number]["id"];
type BasicMasterCollection =
  | "lines"
  | "skus"
  | "materials"
  | "suppliers"
  | "shifts"
  | "reasonCodes";

type ProcessForm = {
  name: string;
  code: string;
  parentId: string;
  sequence: string;
  processType: string;
  description: string;
  inputUnit: string;
  outputUnit: string;
  targetCycleMinutes: string;
  targetTemperatureC: string;
  targetPressureBar: string;
  capacityPerHour: string;
};

type MachineForm = {
  name: string;
  code: string;
  parentId: string;
  processCode: string;
  manufacturer: string;
  model: string;
  commissionedYear: string;
  powerKw: string;
  capacityPerHour: string;
};

const defaultFactoryDetails: FactoryDetails = {
  factoryType: "Controlled-environment mushroom farm",
  facilityAreaM2: 0,
  ratedCapacityPerDay: 0,
  productionUnit: "kg mushrooms",
  operatingHoursPerDay: 24,
  shiftsPerDay: 3,
  powerCapacityKva: 0,
  energyUnit: "kWh",
  weightUnit: "kg",
  temperatureUnit: "°C",
  pressureUnit: "bar",
  commissionedYear: undefined,
};

function metadataText(item: MasterItem | undefined, key: string, fallback = "") {
  const value = item?.metadata?.[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function metadataNumber(item: MasterItem, key: string, fallback: number) {
  const value = Number(item.metadata?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

function optionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function compactMetadata(entries: [string, unknown][]) {
  return Object.fromEntries(
    entries.filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

function activeFactoryItems(items: MasterItem[], factoryId: string) {
  return items.filter((item) => item.factoryId === factoryId && item.active);
}

function SettingsHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="settings-section-header">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function MasterManager({
  collection,
  title,
  subtitle,
}: {
  collection: BasicMasterCollection;
  title: string;
  subtitle: string;
}) {
  const { state, upsertMaster, removeMaster } = useFactory();
  const [editing, setEditing] = useState<MasterItem | null | "new">(null);
  const [form, setForm] = useState({ name: "", code: "" });
  const items = activeFactoryItems(state.masters[collection], state.activeFactoryId);

  function open(item?: MasterItem) {
    setEditing(item ?? "new");
    setForm({ name: item?.name ?? "", code: item?.code ?? "" });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    await upsertMaster(collection, {
      id: editing === "new" ? undefined : editing?.id,
      name: form.name,
      code: form.code,
    });
    setEditing(null);
  }

  return (
    <section className="panel master-manager">
      <SettingsHeader
        title={title}
        subtitle={subtitle}
        action={
          <button className="button button-secondary" onClick={() => open()}>
            <Plus size={13} /> Add
          </button>
        }
      />
      <div className="master-list">
        {items.map((item) => (
          <button key={item.id} onClick={() => open(item)}>
            <span className="master-icon">
              {collection === "materials" ? <Boxes size={15} /> : <Package size={15} />}
            </span>
            <div>
              <strong>{item.name}</strong>
              <small>{item.code}</small>
            </div>
            <ChevronRight size={13} />
          </button>
        ))}
        {!items.length && <div className="empty-state">No active {title.toLowerCase()} yet.</div>}
      </div>
      {editing && (
        <div className="nested-editor">
          <form onSubmit={save}>
            <div>
              <strong>{editing === "new" ? `Add ${title.toLowerCase()}` : `Edit ${editing.name}`}</strong>
              <button type="button" onClick={() => setEditing(null)} aria-label="Close editor">
                <X size={14} />
              </button>
            </div>
            <label>
              Name
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
            </label>
            <label>
              Code
              <input
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
                required
              />
            </label>
            <div>
              {editing !== "new" && (
                <button
                  type="button"
                  className="button button-danger"
                  onClick={() => {
                    void removeMaster(collection, editing.id);
                    setEditing(null);
                  }}
                >
                  <Trash2 size={12} /> Deactivate
                </button>
              )}
              <button className="button button-primary">
                <Check size={12} /> Save
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function ProcessManager() {
  const { state, upsertMaster, removeMaster } = useFactory();
  const mushroomMode = false;
  const [editing, setEditing] = useState<MasterItem | null | "new">(null);
  const lines = activeFactoryItems(state.masters.lines, state.activeFactoryId);
  const processes = activeFactoryItems(state.masters.processes, state.activeFactoryId).sort(
    (left, right) =>
      (left.parentId ?? "").localeCompare(right.parentId ?? "") ||
      metadataNumber(left, "sequence", 999) - metadataNumber(right, "sequence", 999) ||
      left.name.localeCompare(right.name),
  );
  const [form, setForm] = useState<ProcessForm>({
    name: "",
    code: "",
    parentId: "",
    sequence: "1",
    processType: "manufacturing",
    description: "",
    inputUnit: "units",
    outputUnit: "units",
    targetCycleMinutes: "",
    targetTemperatureC: "",
    targetPressureBar: "",
    capacityPerHour: "",
  });

  function nextSequence(lineId: string) {
    return (
      Math.max(
        0,
        ...processes
          .filter((item) => item.parentId === lineId)
          .map((item) => metadataNumber(item, "sequence", 0)),
      ) + 1
    );
  }

  function open(item?: MasterItem) {
    const parentId = item?.parentId ?? lines[0]?.id ?? "";
    setEditing(item ?? "new");
    setForm({
      name: item?.name ?? "",
      code: item?.code ?? "",
      parentId,
      sequence: metadataText(item, "sequence", String(nextSequence(parentId))),
      processType: metadataText(item, "processType", "manufacturing"),
      description: metadataText(item, "description"),
      inputUnit: metadataText(item, "inputUnit", "units"),
      outputUnit: metadataText(item, "outputUnit", "units"),
      targetCycleMinutes: metadataText(item, "targetCycleMinutes"),
      targetTemperatureC: metadataText(item, "targetTemperatureC"),
      targetPressureBar: metadataText(item, "targetPressureBar"),
      capacityPerHour: metadataText(item, "capacityPerHour"),
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    await upsertMaster("processes", {
      id: editing === "new" ? undefined : editing?.id,
      name: form.name,
      code: form.code,
      parentId: form.parentId,
      metadata: compactMetadata([
        ["sequence", Math.max(1, optionalNumber(form.sequence) ?? 1)],
        ["processType", form.processType.trim()],
        ["description", form.description.trim()],
        ["inputUnit", form.inputUnit.trim()],
        ["outputUnit", form.outputUnit.trim()],
        ["targetCycleMinutes", optionalNumber(form.targetCycleMinutes)],
        ["targetTemperatureC", optionalNumber(form.targetTemperatureC)],
        ["targetPressureBar", optionalNumber(form.targetPressureBar)],
        ["capacityPerHour", optionalNumber(form.capacityPerHour)],
      ]),
    });
    setEditing(null);
  }

  return (
    <section className="panel master-manager">
      <SettingsHeader
        title="Processes"
        subtitle={`Ordered ${mushroomMode ? "cultivation stages" : "manufacturing processes"} used to draw and calculate the ${mushroomMode ? "Farm" : "Factory"} Twin`}
        action={
          <button className="button button-secondary" disabled={!lines.length} onClick={() => open()}>
            <Plus size={13} /> Add process
          </button>
        }
      />
      <div className="master-list">
        {processes.map((process) => {
          const line = lines.find((item) => item.id === process.parentId);
          return (
            <button key={process.id} onClick={() => open(process)}>
              <span className="master-icon"><Workflow size={15} /></span>
              <div>
                <strong>{metadataNumber(process, "sequence", 0)} · {process.name}</strong>
                <small>
                  {process.code} · {line?.name ?? "Unassigned line"} · {metadataText(process, "inputUnit", "units")} → {metadataText(process, "outputUnit", "units")}
                </small>
              </div>
              <ChevronRight size={13} />
            </button>
          );
        })}
        {!processes.length && (
          <div className="empty-state">
            Add a {mushroomMode ? "farm wing" : "production line"} first, then describe each {mushroomMode ? "cultivation stage" : "manufacturing process"} in flow order.
          </div>
        )}
      </div>
      {editing && (
        <div className="nested-editor">
          <form onSubmit={save}>
            <div>
              <strong>{editing === "new" ? "Add process" : `Edit ${editing.name}`}</strong>
              <button type="button" onClick={() => setEditing(null)} aria-label="Close editor">
                <X size={14} />
              </button>
            </div>
            <label>
              Process name
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </label>
            <label>
              Process code
              <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} required />
            </label>
            <label>
              {mushroomMode ? "Farm wing" : "Production line"}
              <select
                value={form.parentId}
                onChange={(event) => {
                  const parentId = event.target.value;
                  setForm({ ...form, parentId, sequence: String(nextSequence(parentId)) });
                }}
                required
              >
                {lines.map((line) => <option value={line.id} key={line.id}>{line.name}</option>)}
              </select>
            </label>
            <label>
              Flow sequence
              <input type="number" min="1" step="1" value={form.sequence} onChange={(event) => setForm({ ...form, sequence: event.target.value })} required />
            </label>
            <label>
              Process type
              <input value={form.processType} onChange={(event) => setForm({ ...form, processType: event.target.value })} placeholder="mixing, curing, inspection…" required />
            </label>
            <label>
              Description
              <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="What this stage does" />
            </label>
            <label>
              Input unit
              <input value={form.inputUnit} onChange={(event) => setForm({ ...form, inputUnit: event.target.value })} placeholder="kg, pieces, metres…" required />
            </label>
            <label>
              Output unit
              <input value={form.outputUnit} onChange={(event) => setForm({ ...form, outputUnit: event.target.value })} placeholder="kg, pieces, tubes…" required />
            </label>
            <label>
              Target cycle time (min/cycle)
              <input type="number" min="0" step="any" value={form.targetCycleMinutes} onChange={(event) => setForm({ ...form, targetCycleMinutes: event.target.value })} />
            </label>
            <label>
              Rated throughput ({form.outputUnit || "units"}/hour)
              <input type="number" min="0" step="any" value={form.capacityPerHour} onChange={(event) => setForm({ ...form, capacityPerHour: event.target.value })} />
            </label>
            <label>
              Target temperature (°C)
              <input type="number" min="-100" step="any" value={form.targetTemperatureC} onChange={(event) => setForm({ ...form, targetTemperatureC: event.target.value })} />
            </label>
            <label>
              Target pressure (bar)
              <input type="number" min="0" step="any" value={form.targetPressureBar} onChange={(event) => setForm({ ...form, targetPressureBar: event.target.value })} />
            </label>
            <div>
              {editing !== "new" && (
                <button
                  type="button"
                  className="button button-danger"
                  onClick={() => {
                    void removeMaster("processes", editing.id);
                    setEditing(null);
                  }}
                >
                  <Trash2 size={12} /> Deactivate
                </button>
              )}
              <button className="button button-primary">
                <Check size={12} /> Save process
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function MachineManager() {
  const { state, upsertMaster, removeMaster } = useFactory();
  const mushroomMode = false;
  const [editing, setEditing] = useState<MasterItem | null | "new">(null);
  const lines = activeFactoryItems(state.masters.lines, state.activeFactoryId);
  const processes = activeFactoryItems(state.masters.processes, state.activeFactoryId);
  const machines = activeFactoryItems(state.masters.machines, state.activeFactoryId);
  const [form, setForm] = useState<MachineForm>({
    name: "",
    code: "",
    parentId: "",
    processCode: "",
    manufacturer: "",
    model: "",
    commissionedYear: "",
    powerKw: "",
    capacityPerHour: "",
  });
  const availableProcesses = processes
    .filter((process) => process.parentId === form.parentId)
    .sort((left, right) => metadataNumber(left, "sequence", 999) - metadataNumber(right, "sequence", 999));
  const assignedProcess = processes.find((process) => process.code === form.processCode);

  function open(item?: MasterItem) {
    const parentId = item?.parentId ?? lines[0]?.id ?? "";
    const lineProcesses = processes
      .filter((process) => process.parentId === parentId)
      .sort((left, right) => metadataNumber(left, "sequence", 999) - metadataNumber(right, "sequence", 999));
    setEditing(item ?? "new");
    setForm({
      name: item?.name ?? "",
      code: item?.code ?? "",
      parentId,
      processCode: metadataText(item, "processCode", lineProcesses[0]?.code ?? ""),
      manufacturer: metadataText(item, "manufacturer"),
      model: metadataText(item, "model"),
      commissionedYear: metadataText(item, "commissionedYear"),
      powerKw: metadataText(item, "powerKw"),
      capacityPerHour: metadataText(item, "capacityPerHour"),
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    await upsertMaster("machines", {
      id: editing === "new" ? undefined : editing?.id,
      name: form.name,
      code: form.code,
      parentId: form.parentId,
      metadata: compactMetadata([
        ["processCode", form.processCode],
        ["manufacturer", form.manufacturer.trim()],
        ["model", form.model.trim()],
        ["commissionedYear", optionalNumber(form.commissionedYear)],
        ["powerKw", optionalNumber(form.powerKw)],
        ["capacityPerHour", optionalNumber(form.capacityPerHour)],
      ]),
    });
    setEditing(null);
  }

  return (
    <section className="panel master-manager">
      <SettingsHeader
        title={mushroomMode ? "Growing rooms & assets" : "Machines & assets"}
        subtitle="Line-owned assets associated with the process they perform"
        action={
          <button className="button button-secondary" disabled={!lines.length} onClick={() => open()}>
            <Plus size={13} /> Add machine
          </button>
        }
      />
      <div className="master-list">
        {machines.map((machine) => {
          const line = lines.find((item) => item.id === machine.parentId);
          const processCode = metadataText(machine, "processCode");
          const process = processes.find((item) => item.code === processCode);
          return (
            <button key={machine.id} onClick={() => open(machine)}>
              <span className="master-icon"><Wrench size={15} /></span>
              <div>
                <strong>{machine.name}</strong>
                <small>{machine.code} · {line?.name ?? "Unassigned line"} · {process?.name ?? "No process assigned"}</small>
              </div>
              <ChevronRight size={13} />
            </button>
          );
        })}
        {!machines.length && <div className="empty-state">No active {mushroomMode ? "rooms or farm" : "machines or production"} assets yet.</div>}
      </div>
      {editing && (
        <div className="nested-editor">
          <form onSubmit={save}>
            <div>
              <strong>{editing === "new" ? "Add machine" : `Edit ${editing.name}`}</strong>
              <button type="button" onClick={() => setEditing(null)} aria-label="Close editor">
                <X size={14} />
              </button>
            </div>
            <label>
              {mushroomMode ? "Room or asset name" : "Machine or asset name"}
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </label>
            <label>
              {mushroomMode ? "Room or asset code" : "Machine or asset code"}
              <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} required />
            </label>
            <label>
              {mushroomMode ? "Farm wing" : "Production line"}
              <select
                value={form.parentId}
                onChange={(event) => {
                  const parentId = event.target.value;
                  const firstProcess = processes
                    .filter((process) => process.parentId === parentId)
                    .sort((left, right) => metadataNumber(left, "sequence", 999) - metadataNumber(right, "sequence", 999))[0];
                  setForm({ ...form, parentId, processCode: firstProcess?.code ?? "" });
                }}
                required
              >
                {lines.map((line) => <option value={line.id} key={line.id}>{line.name}</option>)}
              </select>
            </label>
            <label>
              Process association
              <select value={form.processCode} onChange={(event) => setForm({ ...form, processCode: event.target.value })}>
                <option value="">Not assigned</option>
                {availableProcesses.map((process) => (
                  <option value={process.code} key={process.id}>
                    {metadataNumber(process, "sequence", 0)} · {process.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Manufacturer
              <input value={form.manufacturer} onChange={(event) => setForm({ ...form, manufacturer: event.target.value })} />
            </label>
            <label>
              Model
              <input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} />
            </label>
            <label>
              Commissioned year
              <input type="number" min="1800" max={new Date().getFullYear()} step="1" value={form.commissionedYear} onChange={(event) => setForm({ ...form, commissionedYear: event.target.value })} />
            </label>
            <label>
              Rated power (kW)
              <input type="number" min="0" step="any" value={form.powerKw} onChange={(event) => setForm({ ...form, powerKw: event.target.value })} />
            </label>
            <label>
              Rated throughput ({metadataText(assignedProcess, "outputUnit", "units")}/hour)
              <input type="number" min="0" step="any" value={form.capacityPerHour} onChange={(event) => setForm({ ...form, capacityPerHour: event.target.value })} />
            </label>
            <div>
              {editing !== "new" && (
                <button
                  type="button"
                  className="button button-danger"
                  onClick={() => {
                    void removeMaster("machines", editing.id);
                    setEditing(null);
                  }}
                >
                  <Trash2 size={12} /> Deactivate
                </button>
              )}
              <button className="button button-primary">
                <Check size={12} /> Save machine
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

const masterKindLabels: Record<string, string> = {
  lines: "Lines",
  processes: "Processes",
  machines: "Machines",
  skus: "SKUs",
  materials: "Materials",
  suppliers: "Suppliers",
  shifts: "Shifts",
  reasonCodes: "Reason codes",
};

function FactoryMasterImportDialog({
  factoryId,
  factoryName,
  onClose,
}: {
  factoryId: string;
  factoryName: string;
  onClose: () => void;
}) {
  const { refresh } = useFactory();
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<FactoryMasterImportInspection | null>(null);
  const [result, setResult] = useState<FactoryMasterImportInspection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function inspect() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      setInspection(await api.inspectFactoryMasters(factoryId, file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The CSV could not be inspected.");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!file || !inspection?.canApply) return;
    setBusy(true);
    setError("");
    try {
      const applied = await api.applyFactoryMasters(factoryId, file, inspection.checksum);
      setResult(applied);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The factory masters could not be applied.");
    } finally {
      setBusy(false);
    }
  }

  const issues = inspection?.issues ?? [];
  const errors = issues.filter((item) => item.severity === "error");
  const warnings = issues.filter((item) => item.severity === "warning");

  return (
    <div className="modal-backdrop">
      <div className="upload-modal master-import-dialog">
        <div className="modal-header">
          <div>
            <span className="modal-step">Factory setup · controlled CSV import</span>
            <h2>{result ? "Factory masters applied" : inspection ? "Review master changes" : "Import factory masters"}</h2>
            <p>
              {result
                ? `${result.appliedTotal ?? 0} master rows were safely applied to ${factoryName}.`
                : `Validate and populate the selected factory, ${factoryName}. Existing codes are updated; omitted masters are left untouched.`}
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close master import">
            <X size={17} />
          </button>
        </div>

        {error && (
          <div className="wizard-error" role="alert">
            <CircleAlert size={16} />
            <span>{error}</span>
          </div>
        )}

        {!inspection && !result && (
          <div className="modal-body">
            <label className={`drop-zone${file ? " drop-zone-selected" : ""}`}>
              <span className="drop-zone-icon"><UploadCloud size={25} /></span>
              <strong>{file?.name ?? "Choose factory_master_reference.csv"}</strong>
              <span>{file ? `${(file.size / 1024).toFixed(1)} KB · ready to inspect` : "Drop the factory master CSV here or click to browse"}</span>
              <small>CSV · UTF-8 · up to 2 MB · maximum 2,000 data rows</small>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setError("");
                }}
              />
            </label>
            <div className="master-import-note">
              <FileSpreadsheet size={17} />
              <div>
                <strong>Expected columns</strong>
                <span>entity_type, code, name, parent_code, uom, metadata_json, notes</span>
              </div>
            </div>
            <p className="master-import-explainer">
              The company and factory rows provide context only. Lines are created first, followed by processes, machines, products, materials, suppliers, shifts and reason codes. No operational records are changed.
            </p>
          </div>
        )}

        {inspection && !result && (
          <div className="modal-body master-import-review">
            <div className="master-import-summary">
              {(["create", "update", "reactivate", "unchanged"] as const).map((action) => (
                <article key={action}>
                  <strong>{inspection.actions[action].toLocaleString("en-IN")}</strong>
                  <span>{action}</span>
                </article>
              ))}
            </div>
            <div className="master-kind-breakdown">
              {Object.entries(inspection.counts).map(([kind, count]) => (
                <span key={kind}><b>{count}</b> {masterKindLabels[kind] ?? kind}</span>
              ))}
            </div>
            <div className={`master-import-readiness ${inspection.canApply ? "ready" : "blocked"}`}>
              {inspection.canApply ? <CheckCircle2 size={17} /> : <CircleAlert size={17} />}
              <div>
                <strong>{inspection.canApply ? "Ready to apply atomically" : `${errors.length} error${errors.length === 1 ? "" : "s"} must be fixed`}</strong>
                <span>{warnings.length} warning{warnings.length === 1 ? "" : "s"} · {inspection.importableRows} master rows · {inspection.contextRows.length} context rows</span>
              </div>
            </div>
            {issues.length > 0 && (
              <div className="master-import-issues">
                {issues.slice(0, 20).map((item, index) => (
                  <div className={item.severity} key={`${item.row}-${item.field}-${index}`}>
                    <b>{item.severity}</b>
                    <span>{item.row ? `Row ${item.row} · ` : ""}{item.message}</span>
                  </div>
                ))}
                {issues.length > 20 && <small>Showing 20 of {issues.length} issues.</small>}
              </div>
            )}
            <div className="source-preview-table master-import-table">
              <table>
                <thead><tr><th>Row</th><th>Type</th><th>Code</th><th>Name</th><th>Parent</th><th>Action</th></tr></thead>
                <tbody>
                  {inspection.rows.slice(0, 50).map((row) => (
                    <tr key={`${row.kind}-${row.code}`}>
                      <td>{row.sourceRow}</td><td>{masterKindLabels[row.kind] ?? row.entityType}</td>
                      <td>{row.code}</td><td>{row.name}</td><td>{row.parentCode || "—"}</td>
                      <td><span className={`master-action master-action-${row.action}`}>{row.action}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {inspection.rows.length > 50 && <small className="master-import-table-note">Showing 50 of {inspection.rows.length} master rows.</small>}
            </div>
          </div>
        )}

        {result && (
          <div className="modal-body upload-complete master-import-complete">
            <span><CheckCircle2 size={27} /></span>
            <h3>Factory setup refreshed</h3>
            <p>{result.applied?.create ?? 0} created · {result.applied?.update ?? 0} updated · {result.applied?.reactivate ?? 0} reactivated · {result.applied?.unchanged ?? 0} unchanged</p>
            <small>The import is recorded in the audit log with its filename and SHA-256 checksum.</small>
          </div>
        )}

        <div className="modal-footer">
          {!result && inspection && (
            <button className="button button-secondary" disabled={busy} onClick={() => { setInspection(null); setError(""); }}>
              Choose another file
            </button>
          )}
          {!inspection && !result && (
            <button className="button button-secondary" onClick={onClose}>Cancel</button>
          )}
          {!inspection && !result && (
            <button className="button button-primary" disabled={!file || busy} onClick={() => void inspect()}>
              {busy ? "Inspecting…" : "Inspect CSV"} <ChevronRight size={13} />
            </button>
          )}
          {inspection && !result && (
            <button className="button button-primary" disabled={!inspection.canApply || busy} onClick={() => void apply()}>
              {busy ? "Applying…" : `Apply ${inspection.importableRows} masters`} <Check size={13} />
            </button>
          )}
          {result && <button className="button button-primary" onClick={onClose}>Done</button>}
        </div>
      </div>
    </div>
  );
}

function FactoryDialog({ onClose }: { onClose: () => void }) {
  const { createFactory } = useFactory();
  const variant = usePlatform();
  const mushroom = false;
  const siteSingular = variant.terminology.siteSingular;
  const variantDetails = mushroom ? defaultFactoryDetails : {
    ...defaultFactoryDetails,
    factoryType: "Automotive manufacturing plant",
    productionUnit: "units",
  };
  const [form, setForm] = useState<Omit<FactoryConfig, "id" | "companyId">>({
    name: "",
    code: "",
    location: "",
    timezone: "Asia/Kolkata",
    currency: "INR",
    details: { ...variantDetails },
  });
  const details = { ...variantDetails, ...form.details };

  function updateDetail<Key extends keyof FactoryDetails>(key: Key, value: FactoryDetails[Key]) {
    setForm((current) => ({
      ...current,
      details: { ...variantDetails, ...current.details, [key]: value },
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await createFactory(form);
    onClose();
  }

  return (
    <div className="modal-backdrop">
      <form className="upload-modal compact-dialog" onSubmit={submit}>
        <div className="modal-header">
          <div>
            <span className="modal-step">New operating location</span>
            <h2>Create a {siteSingular}</h2>
            <p>Master data and operational records remain isolated by {siteSingular}.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={17} />
          </button>
        </div>
        <div className="modal-body profile-form">
          <label>
            {mushroom ? "Farm" : "Factory"} name
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ahmedabad Plant 02" required />
          </label>
          <label>
            {mushroom ? "Farm" : "Factory"} code
            <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="AMD-02" required />
          </label>
          <label>
            {mushroom ? "Farm" : "Factory"} type
            <input value={details.factoryType ?? ""} onChange={(event) => updateDetail("factoryType", event.target.value)} placeholder={mushroom ? "Button mushroom, oyster mushroom…" : "Assembly, machining, components…"} required />
          </label>
          <label>
            Facility area (m²)
            <input type="number" min="0" step="any" value={details.facilityAreaM2 ?? ""} onChange={(event) => updateDetail("facilityAreaM2", optionalNumber(event.target.value))} />
          </label>
          <label className="full-field">
            Location
            <input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Sanand, Gujarat" required />
          </label>
          <label>
            {mushroom ? "Harvest" : "Production"} unit
            <input value={details.productionUnit ?? ""} onChange={(event) => updateDetail("productionUnit", event.target.value)} placeholder="pieces, kg, tubes…" required />
          </label>
          <label>
            Rated capacity ({details.productionUnit || "units"}/day)
            <input type="number" min="0" step="any" value={details.ratedCapacityPerDay ?? ""} onChange={(event) => updateDetail("ratedCapacityPerDay", optionalNumber(event.target.value))} required />
          </label>
          <label>
            Operating time (hours/day)
            <input type="number" min="0" max="24" step="0.5" value={details.operatingHoursPerDay ?? ""} onChange={(event) => updateDetail("operatingHoursPerDay", optionalNumber(event.target.value))} required />
          </label>
          <label>
            Scheduled shifts (per day)
            <input type="number" min="1" max="24" step="1" value={details.shiftsPerDay ?? ""} onChange={(event) => updateDetail("shiftsPerDay", optionalNumber(event.target.value))} required />
          </label>
          <label>
            Electrical capacity (kVA)
            <input type="number" min="0" step="any" value={details.powerCapacityKva ?? ""} onChange={(event) => updateDetail("powerCapacityKva", optionalNumber(event.target.value))} />
          </label>
          <label>
            Commissioned year
            <input type="number" min="1800" max={new Date().getFullYear()} value={details.commissionedYear ?? ""} onChange={(event) => updateDetail("commissionedYear", optionalNumber(event.target.value))} />
          </label>
          <label>
            Time zone
            <select value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })}>
              <option>Asia/Kolkata</option>
              <option>Asia/Dubai</option>
              <option>Europe/London</option>
            </select>
          </label>
          <label>
            Currency
            <select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}>
              <option>INR</option>
              <option>USD</option>
              <option>EUR</option>
            </select>
          </label>
        </div>
        <div className="modal-footer">
          <button type="button" className="button button-secondary" onClick={onClose}>Cancel</button>
          <button className="button button-primary">Create {siteSingular} <ChevronRight size={13} /></button>
        </div>
      </form>
    </div>
  );
}

function ProfileSection() {
  const { state, updateCompany, updateFactory } = useFactory();
  const variant = usePlatform();
  const mushroom = false;
  const variantDetails = mushroom ? defaultFactoryDetails : {
    ...defaultFactoryDetails,
    factoryType: "Automotive manufacturing plant",
    productionUnit: "units",
  };
  const active = state.factories.find((factory) => factory.id === state.activeFactoryId)!;
  const [company, setCompany] = useState(state.company);
  const [factory, setFactory] = useState<FactoryConfig>({
    ...active,
    details: { ...variantDetails, ...active.details },
  });
  const [saved, setSaved] = useState(false);
  const details = { ...variantDetails, ...factory.details };

  function updateDetail<Key extends keyof FactoryDetails>(key: Key, value: FactoryDetails[Key]) {
    setFactory((current) => ({
      ...current,
      details: { ...variantDetails, ...current.details, [key]: value },
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    await updateCompany({ name: company.name, industry: variant.industry });
    await updateFactory(factory.id, factory);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  return (
    <form className="panel factory-profile-card" onSubmit={save}>
      <SettingsHeader
        title={`Company and ${variant.terminology.siteSingular} profile`}
        subtitle={mushroom ? "Identity, growing area, harvest capacity and operating units used across farm analysis" : "Identity, facility area, production capacity and operating units used across factory analysis"}
        action={<span className="configuration-state">Reviewable</span>}
      />
      <div className="profile-form">
        <label>
          Company name
          <input value={company.name} onChange={(event) => setCompany({ ...company, name: event.target.value })} required />
        </label>
        <label>
          Industry
          <input value={variant.industry} readOnly aria-readonly="true" />
        </label>
        <label>
          {mushroom ? "Farm" : "Factory"} name
          <input value={factory.name} onChange={(event) => setFactory({ ...factory, name: event.target.value })} required />
        </label>
        <label>
          {mushroom ? "Farm" : "Factory"} code
          <input value={factory.code} onChange={(event) => setFactory({ ...factory, code: event.target.value.toUpperCase() })} required />
        </label>
        <label>
          {mushroom ? "Farm" : "Factory"} type
          <input value={details.factoryType ?? ""} onChange={(event) => updateDetail("factoryType", event.target.value)} placeholder={mushroom ? "Button mushroom, oyster mushroom…" : "Assembly, machining, components…"} required />
        </label>
        <label>
          Commissioned year
          <input type="number" min="1800" max={new Date().getFullYear()} value={details.commissionedYear ?? ""} onChange={(event) => updateDetail("commissionedYear", optionalNumber(event.target.value))} />
        </label>
        <label>
          Time zone
          <select value={factory.timezone} onChange={(event) => setFactory({ ...factory, timezone: event.target.value })}>
            <option>Asia/Kolkata</option>
            <option>Asia/Dubai</option>
            <option>Europe/London</option>
          </select>
        </label>
        <label>
          Currency
          <select value={factory.currency} onChange={(event) => setFactory({ ...factory, currency: event.target.value })}>
            <option>INR</option>
            <option>USD</option>
            <option>EUR</option>
          </select>
        </label>
        <label className="full-field">
          Location
          <span className="input-with-icon">
            <MapPin size={14} />
            <input value={factory.location} onChange={(event) => setFactory({ ...factory, location: event.target.value })} required />
          </span>
        </label>
        <label>
          Facility area (m²)
          <input type="number" min="0" step="any" value={details.facilityAreaM2 ?? ""} onChange={(event) => updateDetail("facilityAreaM2", optionalNumber(event.target.value))} />
        </label>
        <label>
          Default {mushroom ? "harvest" : "production"} unit
          <input value={details.productionUnit ?? ""} onChange={(event) => updateDetail("productionUnit", event.target.value)} placeholder="units, pieces, tubes…" required />
        </label>
        <label>
          Rated daily capacity ({details.productionUnit || "units"}/day)
          <input type="number" min="0" step="any" value={details.ratedCapacityPerDay ?? ""} onChange={(event) => updateDetail("ratedCapacityPerDay", optionalNumber(event.target.value))} />
        </label>
        <label>
          Operating time (hours/day)
          <input type="number" min="0" max="24" step="0.5" value={details.operatingHoursPerDay ?? ""} onChange={(event) => updateDetail("operatingHoursPerDay", optionalNumber(event.target.value))} />
        </label>
        <label>
          Scheduled shifts (shifts/day)
          <input type="number" min="1" max="24" step="1" value={details.shiftsPerDay ?? ""} onChange={(event) => updateDetail("shiftsPerDay", optionalNumber(event.target.value))} />
        </label>
        <label>
          Electrical capacity (kVA)
          <input type="number" min="0" step="any" value={details.powerCapacityKva ?? ""} onChange={(event) => updateDetail("powerCapacityKva", optionalNumber(event.target.value))} />
        </label>
        <label>
          Energy unit
          <select value={details.energyUnit ?? "kWh"} onChange={(event) => updateDetail("energyUnit", event.target.value)}>
            <option>kWh</option>
            <option>MWh</option>
          </select>
        </label>
        <label>
          Weight unit
          <select value={details.weightUnit ?? "kg"} onChange={(event) => updateDetail("weightUnit", event.target.value)}>
            <option>g</option>
            <option>kg</option>
            <option>tonne</option>
            <option>tonnes</option>
            <option>lb</option>
          </select>
        </label>
        <label>
          Temperature unit
          <select value={details.temperatureUnit ?? "°C"} onChange={(event) => updateDetail("temperatureUnit", event.target.value)}>
            <option>°C</option>
            <option>°F</option>
          </select>
        </label>
        <label>
          Pressure unit
          <select value={details.pressureUnit ?? "bar"} onChange={(event) => updateDetail("pressureUnit", event.target.value)}>
            <option>bar</option>
            <option>kPa</option>
            <option>MPa</option>
            <option>psi</option>
          </select>
        </label>
      </div>
      <div className="settings-form-actions">
        <span>{saved && <><Check size={12} /> Changes saved</>}</span>
        <button className="button button-primary">Save profile</button>
      </div>
    </form>
  );
}

export function FactorySettings() {
  const variant = usePlatform();
  const mushroom = false;
  const sections = baseSections.map((section) => ({
    ...section,
    label: !mushroom && section.id === "profile"
      ? "Company & factory"
      : !mushroom && section.id === "assets"
        ? "Production flow"
        : !mushroom && section.id === "catalogue"
          ? "Products & materials"
          : section.label,
  }));
  const { state } = useFactory();
  const [section, setSection] = useState<Section>("profile");
  const [createOpen, setCreateOpen] = useState(false);
  const [masterImportOpen, setMasterImportOpen] = useState(false);

  useEffect(() => {
    const queryTimer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const requested = params.get("tab");
      if (requested === "processes") setSection("assets");
      else if (requested && baseSections.some((item) => item.id === requested)) {
        setSection(requested as Section);
      }
      if (params.get("create") === "factory") setCreateOpen(true);
    }, 0);
    return () => window.clearTimeout(queryTimer);
  }, []);

  function select(next: Section) {
    setSection(next);
    window.history.replaceState(null, "", `/settings?tab=${next}`);
  }

  const activeCount = useMemo(() => {
    const count = (items: MasterItem[]) => activeFactoryItems(items, state.activeFactoryId).length;
    return {
      lines: count(state.masters.lines),
      processes: count(state.masters.processes),
      machines: count(state.masters.machines),
      skus: count(state.masters.skus),
    };
  }, [state]);
  const activeFactory = state.factories.find((factory) => factory.id === state.activeFactoryId);
  const activeMachines = activeFactoryItems(state.masters.machines, state.activeFactoryId);
  const setupChecks = [
    Boolean(activeFactory?.name && activeFactory.code && activeFactory.location),
    Boolean(activeFactory?.details?.factoryType && activeFactory.details.productionUnit),
    Boolean(activeFactory?.details?.ratedCapacityPerDay && activeFactory.details.operatingHoursPerDay),
    activeCount.lines > 0,
    activeCount.processes > 0,
    activeCount.machines > 0 && activeMachines.every((machine) => metadataText(machine, "processCode")),
  ];
  const setupHealth = Math.round(
    (setupChecks.filter(Boolean).length / setupChecks.length) * 100,
  );

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">{mushroom ? "Mushroom farm" : "Automotive factory"} configuration</p>
          <h1>Define <span>{mushroom ? "how the crop flows." : "how production flows."}</span></h1>
          <p className="page-subtitle">{mushroom ? "Farm context, cultivation stages, rooms, assets and harvest units" : "Factory context, production processes, lines, machines and output units"}—stored in Django for the selected {variant.terminology.siteSingular}.</p>
        </div>
        <div className="page-header-actions">
          <button className="button button-secondary" disabled={!activeFactory} onClick={() => setMasterImportOpen(true)}>
            <UploadCloud size={13} /> Import master CSV
          </button>
          <button className="button button-accent" onClick={() => setCreateOpen(true)}>
            <Plus size={13} /> Create {variant.terminology.siteSingular}
          </button>
        </div>
      </header>
      <div className="setup-stat-grid">
        <article className="panel"><span><Factory size={16} /></span><div><strong>{activeCount.lines}</strong><small>{mushroom ? "Farm wings" : "Production lines"}</small></div></article>
        <article className="panel"><span><Workflow size={16} /></span><div><strong>{activeCount.processes}</strong><small>Ordered processes</small></div></article>
        <article className="panel"><span><Wrench size={16} /></span><div><strong>{activeCount.machines}</strong><small>{mushroom ? "Rooms & assets" : "Machines & assets"}</small></div></article>
        <article className="panel"><span><Gauge size={16} /></span><div><strong>{activeCount.skus}</strong><small>Active SKUs</small></div></article>
      </div>
      <div className="settings-layout">
        <aside className="panel settings-nav">
          <div className="settings-completion">
            <div><span>Setup health</span><strong>{setupHealth}%</strong></div>
            <i><b style={{ width: `${setupHealth}%` }} /></i>
            <p>{setupHealth === 100 ? `${mushroom ? "Cultivation" : "Production"} flow is ready` : `Complete ${mushroom ? "farm" : "factory"} details and stage links`}</p>
          </div>
          <nav>
            {sections.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => select(item.id)}>
                  <Icon size={16} /><span>{item.label}</span><ChevronRight size={13} />
                </button>
              );
            })}
          </nav>
        </aside>
        <div className="settings-content">
          {section === "profile" && <ProfileSection key={state.activeFactoryId} />}
          {section === "assets" && (
            <>
              <MasterManager collection="lines" title={mushroom ? "Farm wings" : "Production lines"} subtitle={`Independent ${mushroom ? "cultivation" : "production"} flows and KPI groupings`} />
              <ProcessManager />
              <MachineManager />
            </>
          )}
          {section === "catalogue" && (
            <>
              <MasterManager collection="skus" title={mushroom ? "Mushroom grades and SKUs" : "Products and SKUs"} subtitle={mushroom ? "Fresh grades and packed mushroom products" : "Finished products, variants and customer part numbers"} />
              <MasterManager collection="materials" title="Materials" subtitle="Consumed inventory and safety stock" />
              <MasterManager collection="suppliers" title="Suppliers" subtitle="Approved material sources" />
            </>
          )}
          {section === "calendar" && <MasterManager collection="shifts" title={mushroom ? "Observation rounds" : "Production shifts"} subtitle={mushroom ? "Farm calendar, crop checks and operating windows" : "Factory calendar, shifts and operating windows"} />}
          {section === "reasons" && <MasterManager collection="reasonCodes" title="Reason codes" subtitle="Standard loss and exception classification" />}
        </div>
      </div>
      {createOpen && <FactoryDialog onClose={() => setCreateOpen(false)} />}
      {masterImportOpen && activeFactory && (
        <FactoryMasterImportDialog
          factoryId={activeFactory.id}
          factoryName={activeFactory.name}
          onClose={() => setMasterImportOpen(false)}
        />
      )}
    </>
  );
}

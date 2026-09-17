"use client";

import {
  Boxes,
  Building2,
  CalendarClock,
  Check,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  Factory,
  Gauge,
  Layers,
  MapPin,
  Package,
  Plus,
  QrCode,
  Trash2,
  Truck,
  Workflow,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { QrCodePreview } from "@/components/digital-twin/builder/QrCodePreview";
import { useFactory } from "@/lib/factory-context";
import type { FactoryConfig, FactoryDetails, MasterItem, TwinFeedMachine } from "@/lib/factory-domain";

const sections = [
  { id: "profile", label: "Company & farm", icon: Building2 },
  { id: "assets", label: "Cultivation flow", icon: Workflow },
  { id: "catalogue", label: "Mushrooms & materials", icon: Package },
  { id: "calendar", label: "Shifts & calendar", icon: CalendarClock },
  { id: "reasons", label: "Reason codes", icon: ClipboardCheck },
] as const;

type Section = (typeof sections)[number]["id"];
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
        subtitle="Ordered cultivation stages used to draw and calculate the Farm Twin"
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
            Add a farm wing first, then describe each cultivation stage in flow order.
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
              Farm wing
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
        title="Growing rooms & assets"
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
        {!machines.length && <div className="empty-state">No active rooms or farm assets yet.</div>}
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
              Room or asset name
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </label>
            <label>
              Room or asset code
              <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} required />
            </label>
            <label>
              Farm wing
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

function FactoryDialog({ onClose }: { onClose: () => void }) {
  const { createFactory } = useFactory();
  const [form, setForm] = useState<Omit<FactoryConfig, "id" | "companyId">>({
    name: "",
    code: "",
    location: "",
    timezone: "Asia/Kolkata",
    currency: "INR",
    details: { ...defaultFactoryDetails },
  });
  const details = { ...defaultFactoryDetails, ...form.details };

  function updateDetail<Key extends keyof FactoryDetails>(key: Key, value: FactoryDetails[Key]) {
    setForm((current) => ({
      ...current,
      details: { ...defaultFactoryDetails, ...current.details, [key]: value },
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
            <h2>Create a mushroom farm</h2>
            <p>Master data and crop records remain isolated by farm.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={17} />
          </button>
        </div>
        <div className="modal-body profile-form">
          <label>
            Farm name
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ahmedabad Plant 02" required />
          </label>
          <label>
            Farm code
            <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="AMD-02" required />
          </label>
          <label>
            Farm type
            <input value={details.factoryType ?? ""} onChange={(event) => updateDetail("factoryType", event.target.value)} placeholder="Button mushroom, oyster mushroom…" required />
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
            Harvest unit
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
          <button className="button button-primary">Create farm <ChevronRight size={13} /></button>
        </div>
      </form>
    </div>
  );
}

function ProfileSection() {
  const { state, updateCompany, updateFactory } = useFactory();
  const active = state.factories.find((factory) => factory.id === state.activeFactoryId)!;
  const [company, setCompany] = useState(state.company);
  const [factory, setFactory] = useState<FactoryConfig>({
    ...active,
    details: { ...defaultFactoryDetails, ...active.details },
  });
  const [saved, setSaved] = useState(false);
  const details = { ...defaultFactoryDetails, ...factory.details };

  function updateDetail<Key extends keyof FactoryDetails>(key: Key, value: FactoryDetails[Key]) {
    setFactory((current) => ({
      ...current,
      details: { ...defaultFactoryDetails, ...current.details, [key]: value },
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    await Promise.all([
      updateCompany(company),
      updateFactory(factory.id, factory),
    ]);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  return (
    <form className="panel factory-profile-card" onSubmit={save}>
      <SettingsHeader
        title="Company and mushroom-farm profile"
        subtitle="Identity, growing area, harvest capacity and operating units used across farm analysis"
        action={<span className="configuration-state">Reviewable</span>}
      />
      <div className="profile-form">
        <label>
          Company name
          <input value={company.name} onChange={(event) => setCompany({ ...company, name: event.target.value })} required />
        </label>
        <label>
          Industry
          <input value={company.industry} onChange={(event) => setCompany({ ...company, industry: event.target.value })} required />
        </label>
        <label>
          Farm name
          <input value={factory.name} onChange={(event) => setFactory({ ...factory, name: event.target.value })} required />
        </label>
        <label>
          Farm code
          <input value={factory.code} onChange={(event) => setFactory({ ...factory, code: event.target.value.toUpperCase() })} required />
        </label>
        <label>
          Farm type
          <input value={details.factoryType ?? ""} onChange={(event) => updateDetail("factoryType", event.target.value)} placeholder="Button mushroom, oyster mushroom…" required />
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
          Default harvest unit
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

function TwinAssetsSynchronizer() {
  const { twinFeed } = useFactory();
  const [selectedQrMachine, setSelectedQrMachine] = useState<TwinFeedMachine | null>(null);

  return (
    <section className="panel" style={{ border: "1px solid var(--color-primary, #00A06C)", background: "rgba(0, 160, 108, 0.05)", marginBottom: "20px", padding: "18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "24px", height: "24px", borderRadius: "50%", background: "var(--color-primary, #00A06C)", color: "#fff" }}>
              <Layers size={13} />
            </span>
            <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 700 }}>Mushroom Factory Twin (Live Source of Truth)</h2>
          </div>
          <p style={{ margin: "4px 0 0 32px", fontSize: "12px", color: "var(--color-text-muted)" }}>
            Physical rooms, growing tunnels, and assets registered on the spatial twin floor plan. Each asset generates a unique QR code for farm-floor scanning.
          </p>
        </div>
        <Link href="/digital-twin" className="button button-accent" style={{ fontSize: "12px" }}>
          Open Twin 2D/3D Builder <ExternalLink size={12} />
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px", marginBottom: "14px" }}>
        <div style={{ padding: "10px 12px", background: "var(--color-card-bg, #fff)", borderRadius: "6px", border: "1px solid var(--color-border, #e2e8f0)" }}>
          <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Configured Assets</span>
          <p style={{ fontSize: "18px", fontWeight: 700, margin: "2px 0 0 0" }} className="tnum">{twinFeed.machines.length}</p>
        </div>
        <div style={{ padding: "10px 12px", background: "var(--color-card-bg, #fff)", borderRadius: "6px", border: "1px solid var(--color-border, #e2e8f0)" }}>
          <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Reporting Telemetry</span>
          <p style={{ fontSize: "18px", fontWeight: 700, margin: "2px 0 0 0", color: "#2b6cb0" }} className="tnum">
            {twinFeed.machines.filter((m) => m.status === "reporting").length}
          </p>
        </div>
        <div style={{ padding: "10px 12px", background: "var(--color-card-bg, #fff)", borderRadius: "6px", border: "1px solid var(--color-border, #e2e8f0)" }}>
          <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Data Ingestion</span>
          <p style={{ fontSize: "12px", fontWeight: 600, margin: "5px 0 0 0", display: "flex", alignItems: "center", gap: "4px" }}>
            <QrCode size={13} /> Attached QR Codes
          </p>
        </div>
      </div>

      {twinFeed.machines.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "260px", overflowY: "auto" }}>
          {twinFeed.machines.map((machine) => (
            <div
              key={machine.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 12px",
                background: "var(--color-card-bg, #fff)",
                border: "1px solid var(--color-border, #e2e8f0)",
                borderRadius: "6px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <strong style={{ fontSize: "12px" }}>{machine.name}</strong>
                <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }} className="tnum">
                  {machine.observation_count} scans · {machine.parameters.length} parameters
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    padding: "2px 7px",
                    borderRadius: "10px",
                    background: machine.status === "reporting" ? "#e6fffa" : "#edf2f7",
                    color: machine.status === "reporting" ? "#234e52" : "#718096",
                  }}
                >
                  {machine.status}
                </span>
                <button
                  type="button"
                  className="button button-secondary"
                  style={{ fontSize: "12px", padding: "4px 8px" }}
                  onClick={() => setSelectedQrMachine(machine)}
                >
                  <QrCode size={12} /> View QR
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: "14px", textAlign: "center", fontSize: "12px", color: "var(--color-text-muted)" }}>
          No assets registered yet in Mushroom Factory Twin. Click &quot;Open Twin 2D/3D Builder&quot; to lay out your rooms and equipment.
        </div>
      )}

      {selectedQrMachine && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "16px",
          }}
          onClick={() => setSelectedQrMachine(null)}
        >
          <div
            style={{
              background: "#fff",
              padding: "24px",
              borderRadius: "12px",
              maxWidth: "400px",
              width: "100%",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "15px" }}>Asset QR Sticker</h3>
              <button
                type="button"
                onClick={() => setSelectedQrMachine(null)}
                style={{ border: "none", background: "none", cursor: "pointer" }}
              >
                <X size={16} />
              </button>
            </div>
            <QrCodePreview
              machineId={selectedQrMachine.id}
              machineName={selectedQrMachine.name}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function TwinMaterialsSynchronizer() {
  const { twinFeed } = useFactory();
  const materials = twinFeed.inventory?.materials ?? [];
  const stock = twinFeed.inventory?.stock ?? {};
  const products = twinFeed.dispatch?.products ?? [];
  const awaiting = twinFeed.dispatch?.awaiting ?? {};

  return (
    <section className="panel" style={{ border: "1px solid var(--color-primary, #00A06C)", background: "rgba(0, 160, 108, 0.05)", marginBottom: "20px", padding: "18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "24px", height: "24px", borderRadius: "50%", background: "var(--color-primary, #00A06C)", color: "#fff" }}>
              <Boxes size={13} />
            </span>
            <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 700 }}>Mushroom Factory Twin Materials &amp; Dispatch</h2>
          </div>
          <p style={{ margin: "4px 0 0 32px", fontSize: "12px", color: "var(--color-text-muted)" }}>
            Inventory items and dispatch products registered directly with the Factory Twin. Updated via farm floor QR scans.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <Link href="/data" className="button button-secondary" style={{ fontSize: "12px" }}>
            Open Live Data Stream
          </Link>
          <Link href="/digital-twin" className="button button-accent" style={{ fontSize: "12px" }}>
            Twin Builder <ExternalLink size={12} />
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
        {/* Tracked Materials */}
        <div style={{ background: "var(--color-card-bg, #fff)", border: "1px solid var(--color-border, #e2e8f0)", borderRadius: "8px", padding: "12px" }}>
          <h3 style={{ margin: "0 0 8px 0", fontSize: "13px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
            <Boxes size={14} style={{ color: "#c05621" }} />
            Twin Tracked Materials ({materials.length})
          </h3>
          {materials.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {materials.map((mat) => {
                const currentStock = stock[mat.id] !== undefined ? stock[mat.id] : mat.quantity;
                return (
                  <div key={mat.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "5px 0", borderBottom: "1px solid #edf2f7" }}>
                    <div>
                      <strong>{mat.name}</strong>
                    </div>
                    <span className="tnum">
                      <b>{currentStock.toLocaleString("en-IN")}</b> {mat.unit}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ fontSize: "12px", color: "var(--color-text-muted)", margin: 0 }}>
              No inventory configured on the twin layout yet.
            </p>
          )}
        </div>

        {/* Dispatch Products */}
        <div style={{ background: "var(--color-card-bg, #fff)", border: "1px solid var(--color-border, #e2e8f0)", borderRadius: "8px", padding: "12px" }}>
          <h3 style={{ margin: "0 0 8px 0", fontSize: "13px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
            <Truck size={14} style={{ color: "#2b6cb0" }} />
            Twin Dispatch Products ({products.length})
          </h3>
          {products.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {products.map((prod) => {
                const awaitingQty = awaiting[prod.id] ?? 0;
                return (
                  <div key={prod.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "5px 0", borderBottom: "1px solid #edf2f7" }}>
                    <div>
                      <strong>{prod.name}</strong>
                    </div>
                    <span className="tnum">
                      <b>{awaitingQty.toLocaleString("en-IN")}</b> {prod.unit} awaiting
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ fontSize: "12px", color: "var(--color-text-muted)", margin: 0 }}>
              No dispatch products configured on the twin layout yet.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export function FactorySettings() {
  const { state, twinFeed } = useFactory();
  const [section, setSection] = useState<Section>("profile");
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const queryTimer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const requested = params.get("tab");
      if (requested === "processes") setSection("assets");
      else if (requested && sections.some((item) => item.id === requested)) {
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
  const setupChecks = [
    Boolean(activeFactory?.name && activeFactory.code && activeFactory.location),
    Boolean(activeFactory?.details?.factoryType && activeFactory.details.productionUnit),
    Boolean(activeFactory?.details?.ratedCapacityPerDay && activeFactory.details.operatingHoursPerDay),
    activeCount.lines > 0 || twinFeed.machines.length > 0,
    activeCount.processes > 0 || twinFeed.machines.length > 0,
    activeCount.machines > 0 || twinFeed.machines.length > 0,
  ];
  const setupHealth = Math.round(
    (setupChecks.filter(Boolean).length / setupChecks.length) * 100,
  );

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="typography-display">Define <span>how the crop flows.</span></h1>
          <p className="page-subtitle typography-body">Farm context, cultivation stages, rooms, assets and harvest units—synchronized with Mushroom Factory Twin.</p>
        </div>
        <button className="button button-accent" onClick={() => setCreateOpen(true)}>
          <Plus size={13} /> Create farm
        </button>
      </header>
      <div className="setup-stat-grid">
        <article className="panel"><span><Factory size={16} /></span><div><strong>{activeCount.lines || 1}</strong><small>Farm wings</small></div></article>
        <article className="panel"><span><Workflow size={16} /></span><div><strong>{twinFeed.machines.length || activeCount.processes}</strong><small>Twin assets / stages</small></div></article>
        <article className="panel"><span><Wrench size={16} /></span><div><strong>{twinFeed.machines.filter((m) => m.status === "reporting").length}</strong><small>Active QR sensors</small></div></article>
        <article className="panel"><span><Gauge size={16} /></span><div><strong>{(twinFeed.dispatch?.products.length ?? 0) || activeCount.skus}</strong><small>Twin SKUs</small></div></article>
      </div>
      <div className="settings-layout">
        <aside className="panel settings-nav">
          <div className="settings-completion">
            <div><span>Setup health</span><strong>{setupHealth}%</strong></div>
            <i><b style={{ width: `${setupHealth}%` }} /></i>
            <p>{setupHealth === 100 ? "Cultivation flow is ready" : "Complete farm details and stage links"}</p>
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
              <TwinAssetsSynchronizer />
              <MasterManager collection="lines" title="Farm wings" subtitle="Independent cultivation flows and KPI groupings" />
              <ProcessManager />
              <MachineManager />
            </>
          )}
          {section === "catalogue" && (
            <>
              <TwinMaterialsSynchronizer />
              <MasterManager collection="skus" title="Mushroom grades and SKUs" subtitle="Fresh grades and packed mushroom products" />
              <MasterManager collection="materials" title="Materials" subtitle="Consumed inventory and safety stock" />
              <MasterManager collection="suppliers" title="Suppliers" subtitle="Approved material sources" />
            </>
          )}
          {section === "calendar" && <MasterManager collection="shifts" title="Observation rounds" subtitle="Farm calendar, crop checks and operating windows" />}
          {section === "reasons" && <MasterManager collection="reasonCodes" title="Reason codes" subtitle="Standard loss and exception classification" />}
        </div>
      </div>
      {createOpen && <FactoryDialog onClose={() => setCreateOpen(false)} />}
    </>
  );
}

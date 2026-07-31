"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type {
  ActionItem,
  DashboardFilters,
  DataSource,
  DatasetType,
  FactoryConfig,
  FactoryState,
  MasterItem,
  FactoryTargets,
  FactoryUser,
  UploadDataset,
} from "./factory-domain";
import { createDemoState, defaultFilters } from "./factory-domain";
import { buildValidationReferences, numeric, validateRows } from "./ingestion";
import { buildIntelligence } from "./intelligence";

const STORAGE_KEY = "vulcan-factory-state-v2";

type MasterCollection = keyof FactoryState["masters"];

interface ImportInput {
  filename: string;
  datasetType: DatasetType;
  source: DataSource;
  headers: string[];
  rows: Record<string, string>[];
  mapping: Record<string, string>;
}

interface FactoryContextValue {
  state: FactoryState;
  filters: DashboardFilters;
  intelligence: ReturnType<typeof buildIntelligence>;
  hydrated: boolean;
  setFilters: (filters: DashboardFilters | ((current: DashboardFilters) => DashboardFilters)) => void;
  setActiveFactory: (factoryId: string) => void;
  updateCompany: (updates: Partial<FactoryState["company"]>) => void;
  createFactory: (factory: Omit<FactoryConfig, "id" | "companyId">) => FactoryConfig;
  updateFactory: (factoryId: string, updates: Partial<FactoryConfig>) => void;
  upsertMaster: (collection: MasterCollection, item: Partial<MasterItem> & Pick<MasterItem, "name" | "code">) => void;
  removeMaster: (collection: MasterCollection, id: string) => void;
  importDataset: (input: ImportInput) => UploadDataset;
  updateAlertStatus: (alertId: string, status: "new" | "acknowledged" | "resolved" | "dismissed") => void;
  createAction: (alertId: string, title: string, owner?: string) => ActionItem;
  toggleAction: (actionId: string) => void;
  updateTargets: (targets: Partial<FactoryTargets>) => void;
  upsertUser: (user: Omit<FactoryUser, "id" | "active"> & { id?: string; active?: boolean }) => void;
  resetDemo: () => void;
}

const FactoryContext = createContext<FactoryContextValue | null>(null);

function uid(prefix: string) {
  return `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now().toString(36)}`;
}

function dateValue(value: unknown) {
  const raw = String(value ?? "").trim();
  if (/^\d{5}(\.\d+)?$/.test(raw)) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + Number(raw));
    return epoch.toISOString().slice(0, 10);
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
}

export function FactoryProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FactoryState>(() => createDemoState());
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as FactoryState;
          if (parsed?.company && parsed?.factories?.length) {
            const demo = createDemoState();
            setState({ ...parsed, users: parsed.users ?? demo.users, targets: parsed.targets ?? demo.targets });
            setFilters((current) => ({ ...current, factoryId: parsed.activeFactoryId }));
          }
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  const setActiveFactory = useCallback((factoryId: string) => {
    setState((current) => ({ ...current, activeFactoryId: factoryId }));
    setFilters((current) => ({ ...current, factoryId, line: "all", machine: "all", sku: "all", shift: "all" }));
  }, []);

  const updateCompany = useCallback((updates: Partial<FactoryState["company"]>) => {
    setState((current) => ({ ...current, company: { ...current.company, ...updates } }));
  }, []);

  const createFactory = useCallback((input: Omit<FactoryConfig, "id" | "companyId">) => {
    const factory: FactoryConfig = { ...input, id: uid("factory"), companyId: state.company.id };
    setState((current) => ({ ...current, factories: [...current.factories, factory], activeFactoryId: factory.id }));
    setFilters((current) => ({ ...current, factoryId: factory.id, line: "all", machine: "all", sku: "all", shift: "all" }));
    return factory;
  }, [state.company.id]);

  const updateFactory = useCallback((factoryId: string, updates: Partial<FactoryConfig>) => {
    setState((current) => ({ ...current, factories: current.factories.map((factory) => factory.id === factoryId ? { ...factory, ...updates } : factory) }));
  }, []);

  const upsertMaster = useCallback((collection: MasterCollection, input: Partial<MasterItem> & Pick<MasterItem, "name" | "code">) => {
    setState((current) => {
      const item: MasterItem = { id: input.id ?? uid(collection), factoryId: input.factoryId ?? current.activeFactoryId, name: input.name, code: input.code, parentId: input.parentId, metadata: input.metadata, active: input.active ?? true };
      const exists = current.masters[collection].some((existing) => existing.id === item.id);
      return { ...current, masters: { ...current.masters, [collection]: exists ? current.masters[collection].map((existing) => existing.id === item.id ? item : existing) : [...current.masters[collection], item] } };
    });
  }, []);

  const removeMaster = useCallback((collection: MasterCollection, id: string) => {
    setState((current) => ({ ...current, masters: { ...current.masters, [collection]: current.masters[collection].map((item) => item.id === id ? { ...item, active: false } : item) } }));
  }, []);

  const importDataset = useCallback((input: ImportInput) => {
    const uploadId = `UPL-${String(Date.now()).slice(-7)}`;
    const references = buildValidationReferences(state.masters, state.activeFactoryId);
    const { mappedRows, issues } = validateRows(input.rows, input.mapping, input.datasetType, references);
    const rejectedRowNumbers = new Set(issues.filter((issue) => issue.severity === "rejection" && issue.row > 0).map((issue) => issue.row));
    const globalRejection = issues.some((issue) => issue.severity === "rejection" && issue.row === 0);
    const accepted = globalRejection ? [] : mappedRows.map((row, index) => ({ row, sourceRow: index + 2 })).filter((item) => !rejectedRowNumbers.has(item.sourceRow));
    const warningRows = new Set(issues.filter((issue) => issue.severity === "warning" && issue.row > 0).map((issue) => issue.row)).size;
    const quality = input.rows.length ? Math.max(0, ((input.rows.length - rejectedRowNumbers.size - warningRows * 0.25) / input.rows.length) * 100) : 0;
    const upload: UploadDataset = { id: uploadId, factoryId: state.activeFactoryId, filename: input.filename, datasetType: input.datasetType, source: input.source, importedAt: new Date().toISOString(), headers: input.headers, rawRows: input.rows, mapping: input.mapping, status: globalRejection ? "needs_mapping" : rejectedRowNumbers.size ? "validated" : "completed", acceptedRows: accepted.length, warningRows, rejectedRows: globalRejection ? input.rows.length : rejectedRowNumbers.size, dataQualityScore: Number(quality.toFixed(1)), issues };

    setState((current) => {
      const factoryId = current.activeFactoryId;
      const base = { ...current.data };
      if (input.datasetType === "production") base.production = [...base.production, ...accepted.map(({ row, sourceRow }) => ({ id: uid("prod"), factoryId, sourceUploadId: uploadId, sourceRow, date: dateValue(row.date), line: row.line || "Unassigned", machine: row.machine || "Unassigned", sku: row.sku || "Unassigned", shift: row.shift || "Unassigned", orderId: row.order_id || undefined, plannedQuantity: numeric(row.planned_quantity), actualQuantity: numeric(row.actual_quantity), goodQuantity: numeric(row.good_quantity), rejectedQuantity: numeric(row.rejected_quantity), reworkedQuantity: numeric(row.reworked_quantity), plannedMinutes: numeric(row.planned_minutes, 480), downtimeMinutes: numeric(row.downtime_minutes), idealCycleMinutes: numeric(row.ideal_cycle_minutes, 0.25) }))];
      if (input.datasetType === "downtime") base.downtime = [...base.downtime, ...accepted.map(({ row, sourceRow }) => ({ id: uid("down"), factoryId, sourceUploadId: uploadId, sourceRow, date: dateValue(row.date), line: row.line || "Unassigned", machine: row.machine || "Unassigned", shift: row.shift || "Unassigned", reason: row.reason || "Unclassified", minutes: numeric(row.minutes), occurrences: numeric(row.occurrences, 1) }))];
      if (input.datasetType === "quality") base.quality = [...base.quality, ...accepted.map(({ row, sourceRow }) => ({ id: uid("quality"), factoryId, sourceUploadId: uploadId, sourceRow, date: dateValue(row.date), line: row.line || "Unassigned", machine: row.machine || "Unassigned", sku: row.sku || "Unassigned", shift: row.shift || "Unassigned", inspectedQuantity: numeric(row.inspected_quantity), rejectedQuantity: numeric(row.rejected_quantity), reworkedQuantity: numeric(row.reworked_quantity), defectReason: row.defect_reason || "Unclassified" }))];
      if (input.datasetType === "inventory") base.inventory = [...base.inventory, ...accepted.map(({ row, sourceRow }) => ({ id: uid("inv"), factoryId, sourceUploadId: uploadId, sourceRow, date: dateValue(row.date), material: row.material || "Unassigned", supplier: row.supplier || "Unknown supplier", availableQuantity: numeric(row.available_quantity), dailyConsumption: numeric(row.daily_consumption), safetyStock: numeric(row.safety_stock), expectedReceiptDate: row.expected_receipt_date ? dateValue(row.expected_receipt_date) : undefined, requiredDate: row.required_date ? dateValue(row.required_date) : undefined, receiptStatus: row.receipt_status?.toLowerCase().includes("delay") ? "delayed" as const : row.receipt_status ? "on_time" as const : "unknown" as const }))];
      if (input.datasetType === "orders") base.orders = [...base.orders, ...accepted.map(({ row, sourceRow }) => ({ id: uid("order"), factoryId, sourceUploadId: uploadId, sourceRow, orderId: row.order_id || uid("ORD"), sku: row.sku || "Unassigned", line: row.line || "Unassigned", requiredQuantity: numeric(row.required_quantity), producedQuantity: numeric(row.produced_quantity), dueDate: dateValue(row.due_date), priority: (["high", "medium", "normal"].includes(row.priority?.toLowerCase()) ? row.priority.toLowerCase() : "normal") as "high" | "medium" | "normal", status: (["open", "completed", "hold"].includes(row.status?.toLowerCase()) ? row.status.toLowerCase() : "open") as "open" | "completed" | "hold" }))];
      const signature = `${factoryId}:${input.datasetType}:${input.headers.map((header) => header.toLowerCase().trim()).join("|")}`;
      return { ...current, data: base, uploads: [upload, ...current.uploads], mappingProfiles: { ...current.mappingProfiles, [signature]: input.mapping, [`${factoryId}:${input.datasetType}`]: input.mapping } };
    });
    return upload;
  }, [state.activeFactoryId, state.masters]);

  const updateAlertStatus = useCallback((alertId: string, status: "new" | "acknowledged" | "resolved" | "dismissed") => {
    setState((current) => ({ ...current, alertStatuses: { ...current.alertStatuses, [alertId]: status } }));
  }, []);

  const createAction = useCallback((alertId: string, title: string, owner = "Harsh Kumar") => {
    const action: ActionItem = { id: uid("action"), alertId, title, owner, dueDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), status: "open", createdAt: new Date().toISOString() };
    setState((current) => ({ ...current, actions: [action, ...current.actions], alertStatuses: { ...current.alertStatuses, [alertId]: "acknowledged" } }));
    return action;
  }, []);

  const toggleAction = useCallback((actionId: string) => setState((current) => ({ ...current, actions: current.actions.map((action) => action.id === actionId ? { ...action, status: action.status === "open" ? "done" : "open" } : action) })), []);
  const updateTargets = useCallback((updates: Partial<FactoryTargets>) => setState((current) => ({ ...current, targets: { ...current.targets, ...updates } })), []);
  const upsertUser = useCallback((input: Omit<FactoryUser, "id" | "active"> & { id?: string; active?: boolean }) => setState((current) => { const user: FactoryUser = { ...input, id: input.id ?? uid("user"), active: input.active ?? true }; return { ...current, users: current.users.some((item) => item.id === user.id) ? current.users.map((item) => item.id === user.id ? user : item) : [...current.users, user] }; }), []);
  const resetDemo = useCallback(() => { const demo = createDemoState(); setState(demo); setFilters(defaultFilters); localStorage.setItem(STORAGE_KEY, JSON.stringify(demo)); }, []);
  const intelligence = useMemo(() => buildIntelligence(state, filters), [state, filters]);

  const value = useMemo<FactoryContextValue>(() => ({ state, filters, intelligence, hydrated, setFilters, setActiveFactory, updateCompany, createFactory, updateFactory, upsertMaster, removeMaster, importDataset, updateAlertStatus, createAction, toggleAction, updateTargets, upsertUser, resetDemo }), [state, filters, intelligence, hydrated, setActiveFactory, updateCompany, createFactory, updateFactory, upsertMaster, removeMaster, importDataset, updateAlertStatus, createAction, toggleAction, updateTargets, upsertUser, resetDemo]);
  return <FactoryContext.Provider value={value}>{children}</FactoryContext.Provider>;
}

export function useFactory() {
  const context = useContext(FactoryContext);
  if (!context) throw new Error("useFactory must be used inside FactoryProvider.");
  return context;
}

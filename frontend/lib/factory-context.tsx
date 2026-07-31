"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api-client";
import type { CustomKpiDefinition, DashboardFilters, FactoryConfig, FactoryMasters, FactoryState, FactoryTargets, Intelligence, MasterItem } from "./factory-domain";
import { defaultFilters, emptyIntelligence } from "./factory-domain";

type MasterCollection = keyof FactoryMasters;
interface FactoryContextValue {
  state: FactoryState; intelligence: Intelligence; filters: DashboardFilters; hydrated: boolean; loading: boolean; error: string;
  setFilters: React.Dispatch<React.SetStateAction<DashboardFilters>>; setActiveFactory: (id: string) => void; refresh: () => Promise<void>;
  updateCompany: (updates: Partial<FactoryState["company"]>) => Promise<void>; createFactory: (factory: Omit<FactoryConfig, "id" | "companyId">) => Promise<void>; updateFactory: (id: string, updates: Partial<FactoryConfig>) => Promise<void>;
  upsertMaster: (collection: MasterCollection, item: Partial<MasterItem> & Pick<MasterItem, "name" | "code">) => Promise<void>; removeMaster: (collection: MasterCollection, id: string) => Promise<void>;
  updateAlertStatus: (id: string, status: "new" | "acknowledged" | "resolved" | "dismissed") => Promise<void>; createAction: (alertId: string, title: string, owner?: string) => Promise<void>; toggleAction: (id: string) => Promise<void>; updateTargets: (targets: Partial<FactoryTargets>) => Promise<void>;
  updateCustomKpis: (items: CustomKpiDefinition[]) => Promise<void>;
  askQuestion: (question: string) => Promise<{ answer: string; reasoning: string; evidence: string[] }>;
}

const emptyState: FactoryState = { company: { id: "", name: "", industry: "Manufacturing" }, factories: [], activeFactoryId: "", masters: { lines: [], machines: [], skus: [], materials: [], suppliers: [], shifts: [], reasonCodes: [] }, uploads: [], actions: [], targets: { oee: 78, availability: 85, performance: 95, quality: 98, planAttainment: 90, rejectionRate: 5, supplierScore: 85, stockCoverDays: 3, downtimeMinutes: 30 } };
const emptyMasters: FactoryMasters = { lines: [], machines: [], skus: [], materials: [], suppliers: [], shifts: [], reasonCodes: [] };
const defaultTargets: FactoryTargets = { oee: 78, availability: 85, performance: 95, quality: 98, planAttainment: 90, rejectionRate: 5, supplierScore: 85, stockCoverDays: 3, downtimeMinutes: 30 };
const FactoryContext = createContext<FactoryContextValue | null>(null);

export function FactoryProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(emptyState); const [intelligence, setIntelligence] = useState<Intelligence>(emptyIntelligence); const [filters, setFilters] = useState(defaultFilters); const [hydrated, setHydrated] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const requestSequence = useRef(0);
  const refresh = useCallback(async () => { const requestId = ++requestSequence.current; setLoading(true); setError(""); try { const payload = await api.workspace(filters); if (requestId !== requestSequence.current) return; setState(payload.state); setIntelligence(payload.intelligence); if (!filters.factoryId && payload.state.activeFactoryId) setFilters((current) => ({ ...current, factoryId: payload.state.activeFactoryId })); } catch (cause) { if (requestId === requestSequence.current) setError(cause instanceof Error ? cause.message : "Django API is unavailable."); } finally { if (requestId === requestSequence.current) { setLoading(false); setHydrated(true); } } }, [filters]);
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timer); }, [refresh]);
  const mutate = useCallback(async (operation: () => Promise<unknown>) => { setError(""); try { await operation(); await refresh(); } catch (cause) { const message = cause instanceof Error ? cause.message : "The change could not be saved."; setError(message); throw cause; } }, [refresh]);
  const setActiveFactory = useCallback((factoryId: string) => { if (!factoryId || factoryId === filters.factoryId) return; requestSequence.current += 1; setLoading(true); setError(""); setState((current) => ({ ...current, activeFactoryId: factoryId, masters: emptyMasters, uploads: [], actions: [], targets: defaultTargets })); setIntelligence(emptyIntelligence); setFilters((current) => ({ ...current, factoryId, line: "all", machine: "all", sku: "all", shift: "all" })); }, [filters.factoryId]);
  const createFactory = useCallback(async (factory: Omit<FactoryConfig, "id" | "companyId">) => { const created = await api.createFactory(factory) as FactoryConfig; setFilters((current) => ({ ...current, factoryId: created.id, line: "all", machine: "all", sku: "all", shift: "all" })); }, []);
  const updateFactory = useCallback((id: string, updates: Partial<FactoryConfig>) => mutate(() => api.updateFactory(id, updates)), [mutate]);
  const activeFactoryId = filters.factoryId || state.activeFactoryId;
  const updateCompany = useCallback((updates: Partial<FactoryState["company"]>) => mutate(() => api.updateConfiguration(activeFactoryId, updates)), [mutate, activeFactoryId]);
  const upsertMaster = useCallback((collection: MasterCollection, item: Partial<MasterItem> & Pick<MasterItem, "name" | "code">) => mutate(() => item.id ? api.updateMaster(activeFactoryId, item.id, { ...item, kind: collection }) : api.createMaster(activeFactoryId, { ...item, kind: collection })), [mutate, activeFactoryId]);
  const removeMaster = useCallback((_: MasterCollection, id: string) => mutate(() => api.removeMaster(activeFactoryId, id)), [mutate, activeFactoryId]);
  const updateTargets = useCallback((targets: Partial<FactoryTargets>) => mutate(() => api.updateConfiguration(activeFactoryId, { targets })), [mutate, activeFactoryId]);
  const updateCustomKpis = useCallback((items: CustomKpiDefinition[]) => mutate(() => api.updateConfiguration(activeFactoryId, { customKpis: items })), [mutate, activeFactoryId]);
  const updateAlertStatus = useCallback((id: string, status: "new" | "acknowledged" | "resolved" | "dismissed") => mutate(() => api.setAlertStatus(activeFactoryId, id, status)), [mutate, activeFactoryId]);
  const createAction = useCallback((alertId: string, title: string, owner?: string) => mutate(() => api.createAction(activeFactoryId, alertId, title, owner)), [mutate, activeFactoryId]);
  const toggleAction = useCallback((id: string) => mutate(() => api.toggleAction(activeFactoryId, id)), [mutate, activeFactoryId]);
  const askQuestion = useCallback((question: string) => api.ask(activeFactoryId, filters, question), [activeFactoryId, filters]);
  const value = useMemo(() => ({ state, intelligence, filters, hydrated, loading, error, setFilters, setActiveFactory, refresh, updateCompany, createFactory, updateFactory, upsertMaster, removeMaster, updateAlertStatus, createAction, toggleAction, updateTargets, updateCustomKpis, askQuestion }), [state, intelligence, filters, hydrated, loading, error, refresh, updateCompany, createFactory, updateFactory, upsertMaster, removeMaster, updateAlertStatus, createAction, toggleAction, updateTargets, updateCustomKpis, askQuestion, setActiveFactory]);
  if (!hydrated) return <div className="application-loading" role="status"><span /><strong>Connecting to factory database…</strong></div>;
  return <FactoryContext.Provider value={value}>{error && <div className="api-error-banner" role="alert">{error}</div>}{children}</FactoryContext.Provider>;
}

export function useFactory() { const context = useContext(FactoryContext); if (!context) throw new Error("useFactory must be used within FactoryProvider."); return context; }

"use client";

import dynamic from "next/dynamic";
import { AlertTriangle, Box, Cuboid, Map as MapIcon, Route, Shapes } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useEffect, useRef } from "react";
import type { FactoryLayout } from "@/lib/spatial-types";
import type { LiveMachineSummary } from "@/lib/factory-domain";
import {
  machineCardParameterStorageKey,
  machineCardStorageKey,
  parseMachineCardParameters,
  parsePinnedMachineCards,
} from "@/lib/machine-card";
import type { ScreenAnchor } from "@/lib/spatial-overlay";
import type { SpatialView } from "@/lib/spatial-scene";
import { FactoryVisualization, type ObservationData } from "./FactoryVisualization";
import { IsometricFactoryView } from "./IsometricFactoryView";
import { MachineMapPopup, type MachineMapPopupHandle } from "./MachineMapPopup";
import { SpatialLoadingSkeleton } from "./SpatialLoadingSkeleton";

const ThreeFactoryView = dynamic(() => import("./ThreeFactoryView"), { ssr: false, loading: () => <SpatialLoadingSkeleton /> });
const VIEW_OPTIONS = [["3d", Cuboid, "3D"], ["2d", MapIcon, "2D"], ["isometric", Box, "Isometric"]] as const;

export function SpatialVisualization({ layout, observations, liveMachines, selectedMachineId, onMachineClick, onOpenDetails }: { layout: FactoryLayout; observations: Record<string, ObservationData>; liveMachines: LiveMachineSummary[]; selectedMachineId: string | null; onMachineClick: (id: string) => void; onOpenDetails: () => void }) {
  const [view, setView] = useState<SpatialView>("3d"); const [showZones, setShowZones] = useState(true); const [showConnections, setShowConnections] = useState(true);
  const handleThreeUnavailable = useCallback(() => setView("isometric"), []);
  const [lineFilter, setLineFilter] = useState("all"); const [statusFilter, setStatusFilter] = useState("all"); const [alertsOnly, setAlertsOnly] = useState(false);
  const [pinState, setPinState] = useState<{ factoryId: string; ids: Set<string> }>(() => {
    const validIds = layout.machines.map((machine) => machine.id);
    if (typeof window === "undefined") return { factoryId: layout.factoryId, ids: new Set() };
    try { return { factoryId: layout.factoryId, ids: parsePinnedMachineCards(localStorage.getItem(machineCardStorageKey(layout.factoryId)), validIds) }; }
    catch { return { factoryId: layout.factoryId, ids: new Set() }; }
  });
  const [parameterState, setParameterState] = useState<{ factoryId: string; selections: Record<string, string[]> }>(() => {
    const validParameters = new Map(layout.machines.map((machine) => [
      machine.id,
      new Set(machine.parameters.filter((parameter) => parameter.active !== false).map((parameter) => parameter.key)),
    ]));
    if (typeof window === "undefined") return { factoryId: layout.factoryId, selections: {} };
    try { return { factoryId: layout.factoryId, selections: parseMachineCardParameters(localStorage.getItem(machineCardParameterStorageKey(layout.factoryId)), validParameters) }; }
    catch { return { factoryId: layout.factoryId, selections: {} }; }
  });
  const [cardMenu, setCardMenu] = useState<{ machineId: string; x: number; y: number } | null>(null);
  const cardMenuRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<MachineMapPopupHandle | null>(null);
  const lastAnchorRef = useRef<ScreenAnchor>({ x: 0, y: 0, visible: false });
  const setPopupRef = useCallback((handle: MachineMapPopupHandle | null) => { popupRef.current = handle; if (handle) handle.setAnchor(lastAnchorRef.current); }, []);
  const handleAnchorChange = useCallback((anchor: ScreenAnchor) => { lastAnchorRef.current = anchor; popupRef.current?.setAnchor(anchor); }, []);
  useEffect(() => { if (!selectedMachineId || view === "3d") handleAnchorChange({ x: 0, y: 0, visible: false }); }, [handleAnchorChange, selectedMachineId, view]);
  const validMachineIds = useMemo(() => new Set(layout.machines.map((machine) => machine.id)), [layout.machines]);
  const pinnedMachineIds = useMemo(() => pinState.factoryId === layout.factoryId ? [...pinState.ids].filter((id) => validMachineIds.has(id)) : [], [layout.factoryId, pinState, validMachineIds]);
  const cardParameterKeys = useMemo(() => parameterState.factoryId === layout.factoryId ? parameterState.selections : {}, [layout.factoryId, parameterState]);
  useEffect(() => {
    if (pinState.factoryId !== layout.factoryId) return;
    try { localStorage.setItem(machineCardStorageKey(layout.factoryId), JSON.stringify(pinnedMachineIds)); } catch { /* Persistence is best effort. */ }
  }, [layout.factoryId, pinState.factoryId, pinnedMachineIds]);
  useEffect(() => {
    if (parameterState.factoryId !== layout.factoryId) return;
    try { localStorage.setItem(machineCardParameterStorageKey(layout.factoryId), JSON.stringify(cardParameterKeys)); } catch { /* Persistence is best effort. */ }
  }, [cardParameterKeys, layout.factoryId, parameterState.factoryId]);
  useEffect(() => {
    if (!cardMenu) return;
    const close = (event: PointerEvent) => {
      if (!cardMenuRef.current?.contains(event.target as Node)) setCardMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setCardMenu(null); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", closeOnEscape); };
  }, [cardMenu]);
  const togglePinnedCard = useCallback((machineId: string) => {
    setPinState((current) => {
      const ids = new Set(current.factoryId === layout.factoryId ? current.ids : []);
      if (ids.has(machineId)) ids.delete(machineId); else ids.add(machineId);
      return { factoryId: layout.factoryId, ids };
    });
  }, [layout.factoryId]);
  const toggleCardParameter = useCallback((machineId: string, parameterKey: string) => {
    setParameterState((current) => {
      const selections = { ...(current.factoryId === layout.factoryId ? current.selections : {}) };
      const selected = selections[machineId] ?? [];
      if (selected.includes(parameterKey)) {
        const next = selected.filter((key) => key !== parameterKey);
        if (next.length) selections[machineId] = next;
        else delete selections[machineId];
      } else if (selected.length < 4) {
        selections[machineId] = [...selected, parameterKey];
      }
      return { factoryId: layout.factoryId, selections };
    });
  }, [layout.factoryId]);
  const handleOpenMachineDetails = useCallback((machineId: string) => { onMachineClick(machineId); onOpenDetails(); }, [onMachineClick, onOpenDetails]);
  const lines = useMemo(() => { const items = new Map<string, string>(); liveMachines.forEach((machine) => { if (machine.line) items.set(machine.line.id, machine.line.name); }); layout.machines.forEach((machine) => { if (machine.line) items.set(machine.line.id, machine.line.name); }); return [...items.entries()]; }, [layout.machines, liveMachines]);
  const visibleLayout = useMemo(() => { const live = new Map(liveMachines.map((machine) => [machine.id, machine])); const machines = layout.machines.filter((machine) => { const state = live.get(machine.id); const lineId = state?.line?.id ?? machine.line?.id; const status = state?.state ?? machine.status ?? "no_data"; return (lineFilter === "all" || lineId === lineFilter) && (statusFilter === "all" || status === statusFilter) && (!alertsOnly || !!state?.alertCount); }); const ids = new Set(machines.map((machine) => machine.id)); return { ...layout, machines, zones: layout.zones.filter((zone) => lineFilter === "all" || !zone.lineId || zone.lineId === lineFilter), connections: layout.connections.filter((connection) => ids.has(connection.sourceId) && ids.has(connection.targetId)) }; }, [layout, liveMachines, lineFilter, statusFilter, alertsOnly]);
  const toggledLayout = useMemo(() => ({ ...visibleLayout, zones: showZones ? visibleLayout.zones : [], connections: showConnections ? visibleLayout.connections : [] }), [visibleLayout, showZones, showConnections]);
  return <div className="relative h-full min-h-0">
    <div className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-sm backdrop-blur">
      {VIEW_OPTIONS.map(([key, Icon, label]) => <button key={key} type="button" onClick={() => setView(key)} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${view === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><Icon size={13} />{label}</button>)}
      <span className="mx-1 h-5 w-px bg-slate-200" />
      <button type="button" onClick={() => setShowZones((value) => !value)} className={`icon-button ${showZones ? '' : 'opacity-40'}`} title="Toggle zones"><Shapes size={14} /></button>
      <button type="button" onClick={() => setShowConnections((value) => !value)} className={`icon-button ${showConnections ? '' : 'opacity-40'}`} title="Toggle flows"><Route size={14} /></button>
      <select aria-label="Filter production line" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700" value={lineFilter} onChange={(event) => setLineFilter(event.target.value)}><option value="all">All lines</option>{lines.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      <select aria-label="Filter machine status" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{["running", "warning", "down", "degraded", "stale", "idle", "no_data"].map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}</select>
      <button type="button" onClick={() => setAlertsOnly((value) => !value)} className={`icon-button ${alertsOnly ? 'bg-red-50 text-red-700' : ''}`} title="Show machines with active alerts"><AlertTriangle size={14} /></button>
    </div>
    <div className="absolute bottom-3 left-3 z-20 flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-[10px] font-semibold text-slate-600 shadow-sm">{[['#22c55e','Running'],['#f97316','Out of range'],['#ef4444','Failure / rejects'],['#171717','Inactive'],['#94a3b8','Unknown']].map(([color,label]) => <span key={label} className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full" style={{ background: color }} />{label}</span>)}<span className="text-slate-400">Light → dark = longer duration</span><span className="inline-flex items-center gap-1"><i className="flex h-3 w-3 items-center justify-center rounded-full bg-red-600 text-[8px] text-white">!</i>Alert</span></div>
    {view === "2d" && <FactoryVisualization layout={toggledLayout} observations={observations} liveMachines={liveMachines} selectedMachineId={selectedMachineId} onMachineClick={onMachineClick} onSelectedAnchorChange={handleAnchorChange} />}
    {view === "isometric" && <IsometricFactoryView layout={toggledLayout} liveMachines={liveMachines} selectedMachineId={selectedMachineId} onMachineClick={onMachineClick} showZones={showZones} showConnections={showConnections} onSelectedAnchorChange={handleAnchorChange} />}
    {view === "3d" && <ThreeFactoryView layout={visibleLayout} liveMachines={liveMachines} selectedMachineId={selectedMachineId} pinnedMachineIds={pinnedMachineIds} cardParameterKeys={cardParameterKeys} onMachineClick={onMachineClick} onMachineCardClick={handleOpenMachineDetails} onMachineContextMenu={(machineId, point) => setCardMenu({ machineId, ...point })} onUnavailable={handleThreeUnavailable} showZones={showZones} showConnections={showConnections} />}
    {selectedMachineId && view !== "3d" && (() => { const machine = layout.machines.find((item) => item.id === selectedMachineId); if (!machine) return null; return <MachineMapPopup ref={setPopupRef} machine={machine} liveMachine={liveMachines.find((item) => item.id === selectedMachineId)} onOpenDetails={onOpenDetails} />; })()}
    {cardMenu && (() => {
      const machine = layout.machines.find((item) => item.id === cardMenu.machineId);
      const liveMachine = liveMachines.find((item) => item.id === cardMenu.machineId);
      const checked = pinnedMachineIds.includes(cardMenu.machineId);
      if (!machine) return null;
      const variables = [...(liveMachine?.variables ?? [])];
      machine.parameters.filter((parameter) => parameter.active !== false).forEach((parameter) => {
        if (!variables.some((variable) => variable.key === parameter.key)) variables.push({ key: parameter.key, label: parameter.label || parameter.key, value: null, unit: parameter.unit ?? "", semantic: parameter.semantic ?? "measurement", abnormal: false, order: parameter.order });
      });
      variables.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
      const selectedParameters = cardParameterKeys[machine.id] ?? [];
      return <div ref={cardMenuRef} className="absolute z-40 flex max-h-[calc(100%-1rem)] w-64 max-w-[calc(100%-1rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-xl" style={{ left: cardMenu.x, top: cardMenu.y }}>
        <button type="button" role="switch" aria-checked={checked} onClick={() => togglePinnedCard(cardMenu.machineId)} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50"><span className="min-w-0"><strong className="block truncate text-xs text-slate-900">{machine.name}</strong><span className="text-[11px] text-slate-500">Show floating card</span></span><span className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-slate-900" : "bg-slate-300"}`}><i className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${checked ? "left-[18px]" : "left-0.5"}`} /></span></button>
        <div className="mt-1 min-h-0 border-t border-slate-100 px-2 pt-2">
          <div className="flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-600"><span className="truncate">Telemetry parameters</span><span className="shrink-0 font-normal tabular-nums text-slate-400">{selectedParameters.length}/4</span></div>
          <div className="mt-1 max-h-48 space-y-0.5 overflow-y-auto overscroll-contain pr-1">
            {variables.map((variable) => { const selected = selectedParameters.includes(variable.key); const disabled = !selected && selectedParameters.length >= 4; return <label key={variable.key} className={`flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 text-xs ${disabled ? "cursor-not-allowed text-slate-300" : "cursor-pointer text-slate-700 hover:bg-slate-50"}`}><input className="h-3.5 w-3.5 shrink-0 accent-slate-900" type="checkbox" checked={selected} disabled={disabled} onChange={() => toggleCardParameter(machine.id, variable.key)} /><span className="min-w-0 flex-1 truncate">{variable.label}</span>{variable.unit && <span className="max-w-16 shrink-0 truncate text-[10px] text-slate-400">{variable.unit}</span>}</label>; })}
          </div>
          {!!variables.length && <p className="mt-1 text-[10px] text-slate-400">Select up to four readings.</p>}
        </div>
        {!variables.length && <p className="px-2 pb-1 pt-1 text-[10px] text-slate-400">No telemetry parameters are configured.</p>}
      </div>;
    })()}
  </div>;
}

"use client";

import dynamic from "next/dynamic";
import { AlertTriangle, Box, Cuboid, Map as MapIcon, Route, Shapes } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useEffect, useRef } from "react";
import type { FactoryLayout } from "@/lib/spatial-types";
import type { MachineImageAsset } from "@/lib/spatial-types";
import type { LiveMachineCurrent, LiveMachineSummary } from "@/lib/factory-domain";
import type { ScreenAnchor } from "@/lib/spatial-overlay";
import type { SpatialView } from "@/lib/spatial-scene";
import { FactoryVisualization, type ObservationData } from "./FactoryVisualization";
import { IsometricFactoryView } from "./IsometricFactoryView";
import { MachineMapPopup, type MachineMapPopupHandle } from "./MachineMapPopup";

const ThreeFactoryView = dynamic(() => import("./ThreeFactoryView"), { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading lightweight 3D view…</div> });

export function SpatialVisualization({ layout, observations, liveMachines, liveCurrent, selectedMachineId, onMachineClick, onOpenDetails }: { layout: FactoryLayout; observations: Record<string, ObservationData>; liveMachines: LiveMachineSummary[]; liveCurrent: LiveMachineCurrent | null; selectedMachineId: string | null; onMachineClick: (id: string) => void; onOpenDetails: () => void }) {
  const [view, setView] = useState<SpatialView>("2d"); const [showZones, setShowZones] = useState(true); const [showConnections, setShowConnections] = useState(true);
  const handleThreeUnavailable = useCallback(() => setView("isometric"), []);
  const [lineFilter, setLineFilter] = useState("all"); const [statusFilter, setStatusFilter] = useState("all"); const [alertsOnly, setAlertsOnly] = useState(false);
  const popupRef = useRef<MachineMapPopupHandle | null>(null);
  const lastAnchorRef = useRef<ScreenAnchor>({ x: 0, y: 0, visible: false });
  const [imageOverrides, setImageOverrides] = useState<Record<string, MachineImageAsset>>({});
  const setPopupRef = useCallback((handle: MachineMapPopupHandle | null) => { popupRef.current = handle; if (handle) handle.setAnchor(lastAnchorRef.current); }, []);
  const handleAnchorChange = useCallback((anchor: ScreenAnchor) => { lastAnchorRef.current = anchor; popupRef.current?.setAnchor(anchor); }, []);
  useEffect(() => { if (!selectedMachineId || view === "isometric") handleAnchorChange({ x: 0, y: 0, visible: false }); }, [handleAnchorChange, selectedMachineId, view]);
  const lines = useMemo(() => { const items = new Map<string, string>(); liveMachines.forEach((machine) => { if (machine.line) items.set(machine.line.id, machine.line.name); }); layout.machines.forEach((machine) => { if (machine.line) items.set(machine.line.id, machine.line.name); }); return [...items.entries()]; }, [layout.machines, liveMachines]);
  const visibleLayout = useMemo(() => { const live = new Map(liveMachines.map((machine) => [machine.id, machine])); const machines = layout.machines.filter((machine) => { const state = live.get(machine.id); const lineId = state?.line?.id ?? machine.line?.id; const status = state?.state ?? machine.status ?? "no_data"; return (lineFilter === "all" || lineId === lineFilter) && (statusFilter === "all" || status === statusFilter) && (!alertsOnly || !!state?.alertCount); }); const ids = new Set(machines.map((machine) => machine.id)); return { ...layout, machines, zones: layout.zones.filter((zone) => lineFilter === "all" || !zone.lineId || zone.lineId === lineFilter), connections: layout.connections.filter((connection) => ids.has(connection.sourceId) && ids.has(connection.targetId)) }; }, [layout, liveMachines, lineFilter, statusFilter, alertsOnly]);
  const toggledLayout = useMemo(() => ({ ...visibleLayout, zones: showZones ? visibleLayout.zones : [], connections: showConnections ? visibleLayout.connections : [] }), [visibleLayout, showZones, showConnections]);
  return <div className="relative h-full min-h-0">
    <div className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-sm backdrop-blur">
      {([['2d', MapIcon, '2D'], ['isometric', Box, 'Isometric'], ['3d', Cuboid, '3D']] as const).map(([key, Icon, label]) => <button key={key} type="button" onClick={() => setView(key)} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${view === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><Icon size={13} />{label}</button>)}
      <span className="mx-1 h-5 w-px bg-slate-200" />
      <button type="button" onClick={() => setShowZones((value) => !value)} className={`icon-button ${showZones ? '' : 'opacity-40'}`} title="Toggle zones"><Shapes size={14} /></button>
      <button type="button" onClick={() => setShowConnections((value) => !value)} className={`icon-button ${showConnections ? '' : 'opacity-40'}`} title="Toggle flows"><Route size={14} /></button>
      <select aria-label="Filter production line" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700" value={lineFilter} onChange={(event) => setLineFilter(event.target.value)}><option value="all">All lines</option>{lines.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      <select aria-label="Filter machine status" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{["running", "warning", "down", "degraded", "stale", "idle", "no_data"].map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}</select>
      <button type="button" onClick={() => setAlertsOnly((value) => !value)} className={`icon-button ${alertsOnly ? 'bg-red-50 text-red-700' : ''}`} title="Show machines with active alerts"><AlertTriangle size={14} /></button>
    </div>
    <div className="absolute bottom-3 left-3 z-20 flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-[10px] font-semibold text-slate-600 shadow-sm">{[['#22c55e','Running'],['#f97316','Out of range'],['#ef4444','Failure / rejects'],['#171717','Inactive'],['#94a3b8','Unknown']].map(([color,label]) => <span key={label} className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full" style={{ background: color }} />{label}</span>)}<span className="text-slate-400">Light → dark = longer duration</span><span className="inline-flex items-center gap-1"><i className="flex h-3 w-3 items-center justify-center rounded-full bg-red-600 text-[8px] text-white">!</i>Alert</span></div>
    {view === "2d" && <FactoryVisualization layout={toggledLayout} observations={observations} liveMachines={liveMachines} selectedMachineId={selectedMachineId} onMachineClick={onMachineClick} onSelectedAnchorChange={handleAnchorChange} />}
    {view === "isometric" && <IsometricFactoryView layout={toggledLayout} liveMachines={liveMachines} selectedMachineId={selectedMachineId} onMachineClick={onMachineClick} showZones={showZones} showConnections={showConnections} />}
    {view === "3d" && <ThreeFactoryView layout={visibleLayout} liveMachines={liveMachines} selectedMachineId={selectedMachineId} onMachineClick={onMachineClick} onUnavailable={handleThreeUnavailable} showZones={showZones} showConnections={showConnections} onSelectedAnchorChange={handleAnchorChange} />}
    {selectedMachineId && view !== "isometric" && (() => { const machine = layout.machines.find((item) => item.id === selectedMachineId); if (!machine) return null; return <MachineMapPopup ref={setPopupRef} machine={machine} liveMachine={liveMachines.find((item) => item.id === selectedMachineId)} current={liveCurrent?.id === selectedMachineId ? liveCurrent : null} imageAsset={imageOverrides[selectedMachineId] ?? machine.imageAsset} onImageChange={(asset) => setImageOverrides((current) => ({ ...current, [selectedMachineId]: asset }))} onClose={() => onMachineClick("")} onOpenDetails={onOpenDetails} statusVisualization={layout.statusVisualization} />; })()}
  </div>;
}

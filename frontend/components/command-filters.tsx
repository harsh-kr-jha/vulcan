"use client";

import { CalendarDays, RotateCcw } from "lucide-react";
import { useFactory } from "@/lib/factory-context";

export function CommandFilters({ compact = false }: { compact?: boolean }) {
  const { state, filters, setFilters, setActiveFactory } = useFactory();
  const lines = state.masters.lines.filter((item) => item.factoryId === filters.factoryId && item.active);
  const selectedLineId = lines.find((line) => line.name === filters.line)?.id;
  const machines = state.masters.machines.filter((item) => item.factoryId === filters.factoryId && item.active && (!selectedLineId || item.parentId === selectedLineId));
  const skus = state.masters.skus.filter((item) => item.factoryId === filters.factoryId && item.active);
  const shifts = state.masters.shifts.filter((item) => item.factoryId === filters.factoryId && item.active);
  const update = (key: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [key]: value, ...(key === "line" ? { machine: "all" } : {}) }));

  return <div className={`command-filters ${compact ? "compact" : ""}`}>
    <div className="date-range-filter"><CalendarDays size={14} /><input aria-label="From date" type="date" value={filters.from} max={filters.to} onChange={(event) => update("from", event.target.value)} /><span>to</span><input aria-label="To date" type="date" value={filters.to} min={filters.from} onChange={(event) => update("to", event.target.value)} /></div>
    <label><span>Factory</span><select value={filters.factoryId} onChange={(event) => setActiveFactory(event.target.value)}>{state.factories.map((factory) => <option key={factory.id} value={factory.id}>{factory.name}</option>)}</select></label>
    <label><span>Line</span><select value={filters.line} onChange={(event) => update("line", event.target.value)}><option value="all">All lines</option>{lines.map((line) => <option key={line.id} value={line.name}>{line.name}</option>)}</select></label>
    <label><span>Room / asset</span><select value={filters.machine} onChange={(event) => update("machine", event.target.value)}><option value="all">All rooms & assets</option>{machines.map((machine) => <option key={machine.id} value={machine.name}>{machine.name}</option>)}</select></label>
    <label><span>Product / SKU</span><select value={filters.sku} onChange={(event) => update("sku", event.target.value)}><option value="all">All products</option>{skus.map((sku) => <option key={sku.id} value={sku.name}>{sku.name}</option>)}</select></label>
    <label><span>Shift</span><select value={filters.shift} onChange={(event) => update("shift", event.target.value)}><option value="all">All shifts</option>{shifts.map((shift) => <option key={shift.id} value={shift.name}>{shift.name}</option>)}</select></label>
    <button className="reset-filter" onClick={() => setFilters((current) => ({ ...current, line: "all", machine: "all", sku: "all", shift: "all" }))} title="Reset dimensions"><RotateCcw size={13} /></button>
  </div>;
}

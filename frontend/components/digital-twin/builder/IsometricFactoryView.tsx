"use client";

import { useMemo } from "react";
import { normalizeFactoryScene, projectIsometric } from "@/lib/spatial-scene";
import type { FactoryLayout } from "@/lib/spatial-types";
import type { LiveMachineSummary } from "@/lib/factory-domain";
import { resolveMachineVisualStatus } from "@/lib/machine-visual-status";
import { connectorCurve, resolveConnectorConfig } from "@/lib/connector-geometry";

function points(items: Array<{ x: number; y: number }>) {
  return items.map((p) => `${p.x},${p.y}`).join(" ");
}

export function IsometricFactoryView({ layout, liveMachines, selectedMachineId, onMachineClick, showZones, showConnections }: { layout: FactoryLayout; liveMachines: LiveMachineSummary[]; selectedMachineId: string | null; onMachineClick: (id: string) => void; showZones: boolean; showConnections: boolean }) {
  const scene = useMemo(() => normalizeFactoryScene(layout, liveMachines), [layout, liveMachines]);
  const floorCorners = [projectIsometric(0, 0), projectIsometric(scene.width, 0), projectIsometric(scene.width, scene.height), projectIsometric(0, scene.height)];
  const xs = floorCorners.map((p) => p.x); const ys = floorCorners.map((p) => p.y);
  const minX = Math.min(...xs) - 4; const minY = Math.min(...ys) - Math.max(6, scene.height * 0.25);
  const viewWidth = Math.max(...xs) - minX + 4; const viewHeight = Math.max(...ys) - minY + 6;
  const machines = new Map(scene.machines.map((m) => [m.id, m]));

  return <div className="h-full w-full overflow-hidden bg-slate-50">
    <svg className="h-full w-full" viewBox={`${minX} ${minY} ${viewWidth} ${viewHeight}`} role="img" aria-label="Isometric factory map">
      <defs><marker id="isometric-connector-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="context-stroke" /></marker></defs>
      <polygon points={points(floorCorners)} fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.12" />
      {showZones && scene.zones.map((zone) => {
        const p = [projectIsometric(zone.position.x, zone.position.y), projectIsometric(zone.position.x + zone.size.width, zone.position.y), projectIsometric(zone.position.x + zone.size.width, zone.position.y + zone.size.height), projectIsometric(zone.position.x, zone.position.y + zone.size.height)];
        const label = projectIsometric(zone.position.x + zone.size.width / 2, zone.position.y + zone.size.height / 2);
        return <g key={zone.id}><polygon points={points(p)} fill={zone.color} fillOpacity="0.3" stroke={zone.color} strokeWidth="0.1" /><text x={label.x} y={label.y} textAnchor="middle" fontSize="0.65" fontWeight="700" fill="#334155">{zone.name}</text></g>;
      })}
      {showConnections && scene.connections.map((connection) => {
        const source = machines.get(connection.sourceId); const target = machines.get(connection.targetId);
        if (!source || !target) return null;
        const curve = connectorCurve(connection, source, target);
        const config = resolveConnectorConfig(connection);
        const route = curve.getPoints(28).map((point) => projectIsometric(point.x, point.z, point.y));
        const markerStart = connection.direction === "reverse" || connection.direction === "bidirectional" ? "url(#isometric-connector-arrow)" : undefined;
        const markerEnd = !connection.direction || connection.direction === "forward" || connection.direction === "bidirectional" ? "url(#isometric-connector-arrow)" : undefined;
        return <polyline key={connection.id} points={points(route)} fill="none" stroke={config.visual.color} strokeOpacity={config.visual.opacity} strokeWidth={Math.max(0.1, config.geometry.diameter * 0.7)} strokeLinecap="round" strokeDasharray={config.visual.dashed ? "0.35 0.22" : undefined} markerStart={markerStart} markerEnd={markerEnd} />;
      })}
      {[...scene.machines].sort((a, b) => (a.x + a.y) - (b.x + b.y)).map((machine) => {
        const a = projectIsometric(machine.x, machine.y); const b = projectIsometric(machine.x + machine.width, machine.y); const c = projectIsometric(machine.x + machine.width, machine.y + machine.depth);
        const at = projectIsometric(machine.x, machine.y, machine.height); const bt = projectIsometric(machine.x + machine.width, machine.y, machine.height); const ct = projectIsometric(machine.x + machine.width, machine.y + machine.depth, machine.height); const dt = projectIsometric(machine.x, machine.y + machine.depth, machine.height);
        const visual = resolveMachineVisualStatus(machine.live, layout.statusVisualization); const color = visual.bodyColor; const statusColor = visual.bodyColor; const selected = selectedMachineId === machine.id;
        return <g key={machine.id} role="button" tabIndex={0} aria-label={`${machine.name}, ${visual.label}`} className="cursor-pointer" onClick={() => onMachineClick(machine.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onMachineClick(machine.id); }}>
          <polygon points={points([a, b, bt, at])} fill={color} fillOpacity="0.62" stroke="#334155" strokeWidth="0.08" />
          <polygon points={points([b, c, ct, bt])} fill={color} fillOpacity="0.45" stroke="#334155" strokeWidth="0.08" />
          <polygon points={points([at, bt, ct, dt])} fill={color} stroke={selected ? "#2563eb" : statusColor} strokeWidth={selected ? "0.24" : "0.14"} />
          <text x={(at.x + ct.x) / 2} y={(at.y + ct.y) / 2} textAnchor="middle" dominantBaseline="middle" fontSize="0.58" fontWeight="700" fill={visual.textColor}>{machine.name.slice(0, 18)}</text>
          {visual.segments.map((segment, index) => <circle key={segment.type} cx={at.x + 0.28 + index * 0.32} cy={at.y - 0.28} r="0.13" fill={segment.color} stroke="white" strokeWidth="0.035" />)}
          {machine.alertCount > 0 && <><circle cx={at.x + 0.3} cy={at.y - 0.3} r="0.38" fill="#dc2626" /><text x={at.x + 0.3} y={at.y - 0.3} textAnchor="middle" dominantBaseline="middle" fontSize="0.38" fill="white" fontWeight="800">{Math.min(machine.alertCount, 9)}</text></>}
        </g>;
      })}
    </svg>
  </div>;
}

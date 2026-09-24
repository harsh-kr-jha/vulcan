"use client";

import { useRef } from "react";
import { useFactoryBuilder } from "@/lib/factory-builder-context";
import type { FactoryZone } from "@/lib/spatial-types";

export function ZoneLayer() {
  const { state, configureZones } = useFactoryBuilder();
  const drag = useRef<{ id: string; mode: "move" | "resize"; start: { x: number; y: number }; zone: FactoryZone } | null>(null);
  const point = (event: React.PointerEvent<SVGElement>) => { const svg = event.currentTarget.ownerSVGElement; const transform = svg?.getScreenCTM(); if (!transform) return null; return new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse()); };
  const start = (event: React.PointerEvent<SVGElement>, zone: FactoryZone, mode: "move" | "resize") => { const p = point(event); if (!p) return; event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: zone.id, mode, start: p, zone }; };
  const move = (event: React.PointerEvent<SVGElement>) => { if (!drag.current) return; const p = point(event); if (!p) return; event.stopPropagation(); const dx = Math.round((p.x - drag.current.start.x) * 2) / 2; const dy = Math.round((p.y - drag.current.start.y) * 2) / 2; const original = drag.current.zone; configureZones(state.layout.zones.map((zone) => { if (zone.id !== drag.current?.id) return zone; if (drag.current.mode === "move") return { ...zone, position: { x: Math.max(0, Math.min(state.layout.floor.width - original.size.width, original.position.x + dx)), y: Math.max(0, Math.min(state.layout.floor.height - original.size.height, original.position.y + dy)) } }; return { ...zone, size: { width: Math.max(0.5, Math.min(state.layout.floor.width - original.position.x, original.size.width + dx)), height: Math.max(0.5, Math.min(state.layout.floor.height - original.position.y, original.size.height + dy)) } }; })); };
  const end = (event: React.PointerEvent<SVGElement>) => { event.stopPropagation(); drag.current = null; };
  return <g aria-label="Factory zones">{(state.layout.zones ?? []).map((zone) => <g key={zone.id} className="cursor-move" onPointerDown={(event) => start(event, zone, "move")} onPointerMove={move} onPointerUp={end}>
    <rect x={zone.position.x} y={zone.position.y} width={zone.size.width} height={zone.size.height} rx={0.15} fill={zone.color} fillOpacity={0.28} stroke={zone.color} strokeWidth={0.08} strokeDasharray="0.22 0.12" />
    <text x={zone.position.x + 0.2} y={zone.position.y + 0.48} fontSize={0.34} fontWeight={700} fill="#334155">{zone.name}</text>
    <rect x={zone.position.x + zone.size.width - 0.28} y={zone.position.y + zone.size.height - 0.28} width={0.28} height={0.28} fill={zone.color} stroke="#334155" strokeWidth={0.04} className="cursor-se-resize" onPointerDown={(event) => start(event, zone, "resize")} />
  </g>)}</g>;
}

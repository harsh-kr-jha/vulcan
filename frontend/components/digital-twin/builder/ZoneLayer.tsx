"use client";

import { useRef } from "react";
import { useFactoryBuilder } from "@/lib/factory-builder-context";
import type { FactoryZone } from "@/lib/spatial-types";

type DragState = {
  id: string;
  mode: "move" | "resize";
  start: { x: number; y: number };
  zone: FactoryZone;
};

function svgPoint(event: React.PointerEvent<SVGElement>) {
  const transform = event.currentTarget.ownerSVGElement?.getScreenCTM();
  if (!transform) return null;
  return new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
}

export function ZoneLayer() {
  const { state, configureZones } = useFactoryBuilder();
  const drag = useRef<DragState | null>(null);

  function startDrag(
    event: React.PointerEvent<SVGElement>,
    zone: FactoryZone,
    mode: DragState["mode"]
  ) {
    if (event.button !== 0) return;
    const start = svgPoint(event);
    if (!start) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: zone.id, mode, start, zone };
  }

  function handleDrag(event: React.PointerEvent<SVGGElement>) {
    const activeDrag = drag.current;
    if (!activeDrag) return;
    const current = svgPoint(event);
    if (!current) return;

    event.stopPropagation();
    const dx = Math.round((current.x - activeDrag.start.x) * 2) / 2;
    const dy = Math.round((current.y - activeDrag.start.y) * 2) / 2;
    const original = activeDrag.zone;

    configureZones(state.layout.zones.map((zone) => {
      if (zone.id !== activeDrag.id) return zone;
      if (activeDrag.mode === "move") {
        return {
          ...zone,
          position: {
            x: Math.max(0, Math.min(state.layout.floor.width - original.size.width, original.position.x + dx)),
            y: Math.max(0, Math.min(state.layout.floor.height - original.size.height, original.position.y + dy)),
          },
        };
      }
      return {
        ...zone,
        size: {
          width: Math.max(0.5, Math.min(state.layout.floor.width - original.position.x, original.size.width + dx)),
          height: Math.max(0.5, Math.min(state.layout.floor.height - original.position.y, original.size.height + dy)),
        },
      };
    }));
  }

  function endDrag(event: React.PointerEvent<SVGGElement>) {
    if (!drag.current) return;
    event.stopPropagation();
    drag.current = null;
  }

  return (
    <g aria-label="Factory zones">
      {(state.layout.zones ?? []).map((zone) => {
        const titleWidth = Math.min(zone.size.width, Math.max(0.9, Math.min(3, zone.name.length * 0.2 + 0.45)));
        return (
          <g
            key={zone.id}
            onPointerMove={handleDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {/* Keep the zone body visual-only so its interior remains a placement surface. */}
            <rect
              x={zone.position.x}
              y={zone.position.y}
              width={zone.size.width}
              height={zone.size.height}
              rx={0.15}
              fill={zone.color}
              fillOpacity={0.28}
              stroke={zone.color}
              strokeWidth={0.08}
              strokeDasharray="0.22 0.12"
              pointerEvents="none"
            />
            <rect
              x={zone.position.x + 0.1}
              y={zone.position.y + 0.1}
              width={Math.max(0.25, titleWidth - 0.2)}
              height={0.5}
              rx={0.12}
              fill={zone.color}
              fillOpacity={0.72}
              className="cursor-move"
              aria-label={`Move ${zone.name} zone`}
              onPointerDown={(event) => startDrag(event, zone, "move")}
            />
            <text
              x={zone.position.x + 0.2}
              y={zone.position.y + 0.46}
              fontSize={0.32}
              fontWeight={700}
              fill="#334155"
              pointerEvents="none"
            >
              {zone.name}
            </text>
            <rect
              x={zone.position.x + zone.size.width - 0.28}
              y={zone.position.y + zone.size.height - 0.28}
              width={0.28}
              height={0.28}
              fill={zone.color}
              stroke="#334155"
              strokeWidth={0.04}
              className="cursor-se-resize"
              aria-label={`Resize ${zone.name} zone`}
              onPointerDown={(event) => startDrag(event, zone, "resize")}
            />
          </g>
        );
      })}
    </g>
  );
}

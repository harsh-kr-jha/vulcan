"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  FactoryLayout,
  MachineNode,
} from "@/lib/spatial-types";
import type { LiveMachineSummary } from "@/lib/factory-domain";
import type { ScreenAnchor } from "@/lib/spatial-overlay";
import { resolveMachineVisualStatus } from "@/lib/machine-visual-status";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FactoryVisualizationProps {
  layout: FactoryLayout;
  /** Map of machineId -> latest observation values */
  observations?: Record<string, ObservationData>;
  onMachineHover?: (machineId: string | null) => void;
  onMachineClick?: (machineId: string) => void;
  liveMachines?: LiveMachineSummary[];
  selectedMachineId?: string | null;
  onSelectedAnchorChange?: (anchor: ScreenAnchor) => void;
}

export interface ObservationData {
  values: Record<string, unknown>;
  submittedAt?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  running: "Running",
  warning: "Warning",
  down: "Down",
  idle: "Idle",
  no_data: "No Data",
  degraded: "Degraded",
  stale: "Stale",
};

// ---------------------------------------------------------------------------
// Helper: compute edge-to-edge connection endpoints
// ---------------------------------------------------------------------------

function computeEdgePoint(
  center: { x: number; y: number },
  halfW: number,
  halfH: number,
  targetCenter: { x: number; y: number }
): { x: number; y: number } {
  const dx = targetCenter.x - center.x;
  const dy = targetCenter.y - center.y;
  if (dx === 0 && dy === 0) return center;

  // Find intersection of ray from center to target with the rectangle edge
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  let t: number;
  if (absDx * halfH > absDy * halfW) {
    // Hits left or right edge
    t = halfW / absDx;
  } else {
    // Hits top or bottom edge
    t = halfH / absDy;
  }

  return { x: center.x + dx * t, y: center.y + dy * t };
}

// ---------------------------------------------------------------------------
// FactoryVisualization – SVG top-view grid layout
// ---------------------------------------------------------------------------

/**
 * Renders the factory layout as a flat top-view SVG grid.
 * Machines are status-colored rectangles with labels.
 * Hover shows parameter tooltip; click opens the analytics panel.
 */
export function FactoryVisualization({
  layout,
  observations,
  onMachineHover,
  onMachineClick,
  liveMachines = [],
  selectedMachineId,
  onSelectedAnchorChange,
}: FactoryVisualizationProps) {
  const [hoveredMachineId, setHoveredMachineId] = useState<string | null>(null);
  const [focusedMachineId, setFocusedMachineId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const { floor, machines, connections } = layout;
  const liveMap = useMemo(() => new Map(liveMachines.map((machine) => [machine.id, machine])), [liveMachines]);

  // SVG viewBox is derived directly from the saved floor dimensions.
  const viewBoxWidth = floor.width;
  const viewBoxHeight = floor.height;
  const minimumViewportSize = viewBoxWidth > 0 && viewBoxHeight > 0
    ? Math.min(viewBoxWidth, viewBoxHeight) / Math.max(viewBoxWidth, viewBoxHeight)
    : Number.MIN_VALUE;
  const [viewBoxState, setViewBoxState] = useState({
    viewBox: { x: 0, y: 0, width: viewBoxWidth, height: viewBoxHeight },
    floorWidth: floor.width,
    floorHeight: floor.height,
  });
  const viewBox = useMemo(
    () => {
      const candidate = viewBoxState.floorWidth === floor.width && viewBoxState.floorHeight === floor.height
        ? viewBoxState.viewBox
        : { x: 0, y: 0, width: viewBoxWidth, height: viewBoxHeight };
      const width = Math.max(
        minimumViewportSize,
        Math.min(Number.isFinite(candidate.width) ? candidate.width : viewBoxWidth, viewBoxWidth)
      );
      const height = Math.max(
        minimumViewportSize,
        Math.min(Number.isFinite(candidate.height) ? candidate.height : viewBoxHeight, viewBoxHeight)
      );
      const x = Number.isFinite(candidate.x) ? candidate.x : 0;
      const y = Number.isFinite(candidate.y) ? candidate.y : 0;
      return {
        x: Math.max(0, Math.min(x, floor.width - width)),
        y: Math.max(0, Math.min(y, floor.height - height)),
        width,
        height,
      };
    },
    [floor.height, floor.width, minimumViewportSize, viewBoxHeight, viewBoxState, viewBoxWidth]
  );
  const svgRef = useRef<SVGSVGElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewBoxRef = useRef(viewBox);
  const panStart = useRef<{ x: number; y: number; vbX: number; vbY: number } | null>(null);
  const didPanRef = useRef(false);
  const [isPanning, setIsPanning] = useState(false);

  useEffect(() => {
    viewBoxRef.current = viewBox;
  }, [viewBox]);

  const screenToSvg = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const transform = svg?.getScreenCTM();
    if (!transform) return null;
    const point = new DOMPoint(clientX, clientY).matrixTransform(transform.inverse());
    return Number.isFinite(point.x) && Number.isFinite(point.y)
      ? { x: point.x, y: point.y }
      : null;
  }, []);

  const clampViewBox = useCallback(
    (next: typeof viewBox) => {
      const width = Math.max(
        minimumViewportSize,
        Math.min(Number.isFinite(next.width) ? next.width : viewBoxWidth, viewBoxWidth)
      );
      const height = Math.max(
        minimumViewportSize,
        Math.min(Number.isFinite(next.height) ? next.height : viewBoxHeight, viewBoxHeight)
      );
      const x = Number.isFinite(next.x) ? next.x : 0;
      const y = Number.isFinite(next.y) ? next.y : 0;
      return {
        x: Math.max(0, Math.min(x, floor.width - width)),
        y: Math.max(0, Math.min(y, floor.height - height)),
        width,
        height,
      };
    },
    [floor.height, floor.width, minimumViewportSize, viewBoxHeight, viewBoxWidth]
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const current = viewBoxRef.current;
      const zoomFactor = event.ctrlKey
        ? (event.deltaY > 0 ? 1.05 : 0.95)
        : (event.deltaY > 0 ? 1.1 : 0.9);
      const cursor = screenToSvg(event.clientX, event.clientY);
      if (!cursor || !Number.isFinite(event.deltaY)) return;

      setViewBoxState({
        viewBox: clampViewBox({
          x: cursor.x - (cursor.x - current.x) * zoomFactor,
          y: cursor.y - (cursor.y - current.y) * zoomFactor,
          width: current.width * zoomFactor,
          height: current.height * zoomFactor,
        }),
        floorWidth: floor.width,
        floorHeight: floor.height,
      });
    };

    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [clampViewBox, floor.height, floor.width, screenToSvg]);

  const handlePointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    const current = viewBoxRef.current;
    panStart.current = { x: event.clientX, y: event.clientY, vbX: current.x, vbY: current.y };
    didPanRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!panStart.current || !svgRef.current) return;
      const current = viewBoxRef.current;
      const clientDeltaX = event.clientX - panStart.current.x;
      const clientDeltaY = event.clientY - panStart.current.y;
      if (Math.abs(clientDeltaX) <= 3 && Math.abs(clientDeltaY) <= 3) return;

      didPanRef.current = true;
      setIsPanning(true);
      const currentPoint = screenToSvg(event.clientX, event.clientY);
      const startPoint = screenToSvg(panStart.current.x, panStart.current.y);
      if (!currentPoint || !startPoint) return;
      const dx = currentPoint.x - startPoint.x;
      const dy = currentPoint.y - startPoint.y;
      setViewBoxState({
        viewBox: clampViewBox({
          ...current,
          x: panStart.current.vbX - dx,
          y: panStart.current.vbY - dy,
        }),
        floorWidth: floor.width,
        floorHeight: floor.height,
      });
    },
    [clampViewBox, floor.height, floor.width, screenToSvg]
  );

  const handlePointerUp = useCallback(() => {
    panStart.current = null;
    setIsPanning(false);
  }, []);

  const handleClickCapture = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    if (!didPanRef.current) return;
    event.stopPropagation();
    didPanRef.current = false;
  }, []);

  const viewBoxString = `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;

  const updateSelectedAnchor = useCallback(() => {
    const svg = svgRef.current;
    const host = hostRef.current;
    const machine = machines.find((item) => item.id === selectedMachineId);
    const matrix = svg?.getScreenCTM();
    if (!svg || !host || !machine || !matrix || !onSelectedAnchorChange) {
      onSelectedAnchorChange?.({ x: 0, y: 0, visible: false });
      return;
    }
    const rotated = machine.rotation === 90 || machine.rotation === 270;
    const width = rotated ? (machine.size?.height ?? 1) : (machine.size?.width ?? 1);
    const point = new DOMPoint(machine.position.x + width / 2, machine.position.y)
      .matrixTransform(matrix);
    const bounds = host.getBoundingClientRect();
    const x = point.x - bounds.left;
    const y = point.y - bounds.top;
    onSelectedAnchorChange({
      x,
      y,
      visible: x >= 0 && y >= 0 && x <= bounds.width && y <= bounds.height,
    });
  }, [machines, onSelectedAnchorChange, selectedMachineId]);

  useEffect(() => {
    const frame = requestAnimationFrame(updateSelectedAnchor);
    const observer = new ResizeObserver(updateSelectedAnchor);
    if (hostRef.current) observer.observe(hostRef.current);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [onSelectedAnchorChange, updateSelectedAnchor, viewBoxString]);

  // Machine lookup map
  const machineMap = useMemo(() => {
    const map = new Map<string, MachineNode>();
    for (const m of machines) map.set(m.id, m);
    return map;
  }, [machines]);

  // Hovered machine data for tooltip
  const hoveredMachine = hoveredMachineId ? machineMap.get(hoveredMachineId) : null;
  const hoveredObservation = hoveredMachineId && observations ? observations[hoveredMachineId] : null;

  const handleMachineEnter = useCallback(
    (machineId: string, event: React.MouseEvent) => {
      setHoveredMachineId(machineId);
      setTooltipPos({ x: event.clientX, y: event.clientY });
      onMachineHover?.(machineId);
    },
    [onMachineHover]
  );

  const handleMachineMove = useCallback((event: React.MouseEvent) => {
    setTooltipPos({ x: event.clientX, y: event.clientY });
  }, []);

  const handleMachineLeave = useCallback(() => {
    setHoveredMachineId(null);
    setTooltipPos(null);
    onMachineHover?.(null);
  }, [onMachineHover]);

  const handleMachineClick = useCallback(
    (machineId: string) => {
      onMachineClick?.(machineId);
    },
    [onMachineClick]
  );

  return (
    <div ref={hostRef} className="relative w-full h-full overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <svg
        ref={svgRef}
        className="absolute inset-4 w-[calc(100%-2rem)] h-[calc(100%-2rem)] select-none"
        viewBox={viewBoxString}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onClickCapture={handleClickCapture}
        onContextMenu={(event) => event.preventDefault()}
        style={{ cursor: isPanning ? "grabbing" : "grab", touchAction: "none" }}
      >
          {/* Defs: arrow markers, shadows */}
          <defs>
            <pattern id="floor-grid" width="1" height="1" patternUnits="userSpaceOnUse">
              <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#e2e8f0" strokeWidth="0.03" />
            </pattern>
            <marker
              id="viz-arrow"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 Z" fill="#64748b" />
            </marker>
            <filter id="machine-shadow" x="-10%" y="-10%" width="120%" height="130%">
              <feDropShadow dx="0.05" dy="0.08" stdDeviation="0.12" floodOpacity="0.15" />
            </filter>
          </defs>

          {/* Floor grid */}
          <rect
            x={0}
            y={0}
            width={floor.width}
            height={floor.height}
            fill="url(#floor-grid)"
            stroke="#cbd5e1"
            strokeWidth={0.06}
            rx={0.15}
          />
          {(layout.zones ?? []).map((zone) => (
            <g key={zone.id} pointerEvents="none">
              <rect x={zone.position.x} y={zone.position.y} width={zone.size.width} height={zone.size.height} rx={0.18} fill={zone.color} fillOpacity={0.28} stroke={zone.color} strokeWidth={0.08} strokeDasharray="0.25 0.12" />
              <text x={zone.position.x + 0.25} y={zone.position.y + 0.5} fontSize={0.34} fontWeight={700} fill="#334155">{zone.name}{zone.line?.name ? ` · ${zone.line.name}` : ""}</text>
            </g>
          ))}

          {/* Connection lines (rendered behind machines) */}
          {connections.map((conn) => {
            const src = machineMap.get(conn.sourceId);
            const tgt = machineMap.get(conn.targetId);
            if (!src || !tgt) return null;

            const srcRotated = src.rotation === 90 || src.rotation === 270;
            const tgtRotated = tgt.rotation === 90 || tgt.rotation === 270;
            const srcW = srcRotated ? (src.size?.height ?? 1) : (src.size?.width ?? 1);
            const srcH = srcRotated ? (src.size?.width ?? 1) : (src.size?.height ?? 1);
            const tgtW = tgtRotated ? (tgt.size?.height ?? 1) : (tgt.size?.width ?? 1);
            const tgtH = tgtRotated ? (tgt.size?.width ?? 1) : (tgt.size?.height ?? 1);

            const srcCenter = { x: src.position.x + srcW / 2, y: src.position.y + srcH / 2 };
            const tgtCenter = { x: tgt.position.x + tgtW / 2, y: tgt.position.y + tgtH / 2 };

            // Edge-to-edge endpoints
            const from = computeEdgePoint(srcCenter, srcW / 2, srcH / 2, tgtCenter);
            const to = computeEdgePoint(tgtCenter, tgtW / 2, tgtH / 2, srcCenter);

            // Subtle curve
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const ctrlX = midX - dy * 0.1;
            const ctrlY = midY + dx * 0.1;

            return (
              <g key={conn.id}>
                <path
                  d={`M ${from.x} ${from.y} Q ${ctrlX} ${ctrlY} ${to.x} ${to.y}`}
                  fill="none"
                  stroke="#64748b"
                  strokeWidth={0.06}
                  strokeDasharray="0.2 0.1"
                  markerEnd="url(#viz-arrow)"
                  opacity={0.7}
                />
                {conn.name && (
                  <text
                    x={ctrlX}
                    y={ctrlY - 0.2}
                    textAnchor="middle"
                    fontSize={0.28}
                    fill="#475569"
                    style={{ pointerEvents: "none" }}
                  >
                    {conn.name.length > 20 ? conn.name.slice(0, 19) + "\u2026" : conn.name}
                  </text>
                )}
              </g>
            );
          })}

          {/* Machine rectangles */}
          {machines.map((machine) => {
            const live = liveMap.get(machine.id);
            const obsData = observations?.[machine.id];
            const hasData = !!obsData;
            // Derive status from the 'active' boolean parameter in observations
            let status: string = live?.state ?? machine.status ?? "no_data";
            if (hasData) {
              const activeValue = obsData.values["active"];
              if (activeValue === true || activeValue === "true") {
                status = "running";
              } else if (activeValue === false || activeValue === "false") {
                status = "down";
              } else if (!machine.status || machine.status === "no_data") {
                status = "running";
              }
            }
            const visual = resolveMachineVisualStatus(
              live ?? {
                state: status as LiveMachineSummary["state"],
                operatingState: status === "idle" || status === "down" ? "inactive" : "running",
                issues: [],
              },
              layout.statusVisualization,
            );
            const rotated = machine.rotation === 90 || machine.rotation === 270;
            const w = rotated ? (machine.size?.height ?? 1) : (machine.size?.width ?? 1);
            const h = rotated ? (machine.size?.width ?? 1) : (machine.size?.height ?? 1);
            const isHovered = hoveredMachineId === machine.id || focusedMachineId === machine.id;
            const isSelected = selectedMachineId === machine.id;
            const fontSize = Math.min(w, h) * 0.3;

            return (
              <g
                key={machine.id}
                className="cursor-pointer"
                onMouseEnter={(e) => handleMachineEnter(machine.id, e)}
                onMouseMove={handleMachineMove}
                onMouseLeave={handleMachineLeave}
                onFocus={() => setFocusedMachineId(machine.id)}
                onBlur={() => setFocusedMachineId(null)}
                onClick={(event) => {
                  event.stopPropagation();
                  setHoveredMachineId(null);
                  setTooltipPos(null);
                  handleMachineClick(machine.id);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setHoveredMachineId(null);
                  setTooltipPos(null);
                  handleMachineClick(machine.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setHoveredMachineId(null);
                    setTooltipPos(null);
                    handleMachineClick(machine.id);
                  }
                }}
                tabIndex={0}
                role="button"
                style={{ outline: "none" }}
                aria-label={`Machine: ${machine.name}, Status: ${visual.label}${visual.segments.length ? `, ${visual.segments.map((item) => item.label).join(", ")}` : ""}`}
              >
                {/* Clip path to prevent text overflow */}
                <defs>
                  <clipPath id={`viz-clip-${machine.id}`}>
                    <rect
                      x={machine.position.x + 0.05}
                      y={machine.position.y + 0.05}
                      width={w - 0.1}
                      height={h - 0.1}
                    />
                  </clipPath>
                </defs>
                {/* Machine body */}
                <rect
                  x={machine.position.x + 0.05}
                  y={machine.position.y + 0.05}
                  width={w - 0.1}
                  height={h - 0.1}
                  rx={0.12}
                  fill={visual.bodyColor}
                  stroke={isSelected ? "#334155" : isHovered ? "#64748b" : visual.bodyColor}
                  strokeWidth={isSelected ? 0.1 : isHovered ? 0.08 : 0.06}
                  filter="url(#machine-shadow)"
                  style={{ transition: "stroke 0.15s, stroke-width 0.15s" }}
                />
                {/* Status indicator dot */}
                <circle
                  cx={machine.position.x + w - 0.25}
                  cy={machine.position.y + 0.25}
                  r={0.12}
                  fill={visual.bodyColor}
                />
                {visual.segments.map((segment, index) => (
                  <circle key={segment.type} cx={machine.position.x + 0.25 + index * 0.24} cy={machine.position.y + h - 0.23} r={0.09} fill={segment.color} stroke="#fff" strokeWidth={0.025} />
                ))}
                {!!live?.alertCount && (
                  <g style={{ pointerEvents: "none" }}>
                    <circle cx={machine.position.x + 0.28} cy={machine.position.y + 0.28} r={0.2} fill="#dc2626" />
                    <text x={machine.position.x + 0.28} y={machine.position.y + 0.29} textAnchor="middle" dominantBaseline="middle" fontSize={0.22} fontWeight={800} fill="white">{Math.min(live.alertCount, 9)}</text>
                  </g>
                )}
                {/* Data indicator (bottom-left corner) */}
                {hasData && (
                  <g style={{ pointerEvents: "none" }}>
                    <circle
                      cx={machine.position.x + 0.25}
                      cy={machine.position.y + h - 0.25}
                      r={0.12}
                      fill="#2563eb"
                    />
                  </g>
                )}
                {/* Machine name – clipped to box bounds */}
                <text
                  x={machine.position.x + w / 2}
                  y={machine.position.y + h / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={fontSize}
                  fontWeight={600}
                  fill={visual.textColor}
                  clipPath={`url(#viz-clip-${machine.id})`}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {(() => {
                    const availW = (w - 0.1) * 0.85;
                    const avgCharW = fontSize * 0.6;
                    const maxC = Math.max(2, Math.floor(availW / avgCharW));
                    return machine.name.length > maxC
                      ? machine.name.slice(0, maxC - 1) + "\u2026"
                      : machine.name;
                  })()}
                </text>
                {/* Status label below name – also clipped */}
                <text
                  x={machine.position.x + w / 2}
                  y={machine.position.y + h / 2 + fontSize * 1.2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={fontSize * 0.65}
                  fill={visual.textColor}
                  clipPath={`url(#viz-clip-${machine.id})`}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {visual.label}
                </text>
              </g>
            );
          })}
        </svg>

      {/* Floating hover tooltip with latest parameters */}
      {hoveredMachine && tooltipPos && (
        <div
          className="fixed z-50 pointer-events-none bg-white rounded-lg shadow-lg border border-gray-200 px-3 py-2 max-w-xs"
          style={{
            left: tooltipPos.x + 12,
            top: tooltipPos.y + 12,
          }}
        >
          <p className="text-sm font-semibold text-gray-900 mb-1">{hoveredMachine.name}</p>
          <p className="text-xs text-gray-500 mb-1.5">
            {hoveredObservation
              ? (hoveredMachine.status && hoveredMachine.status !== "no_data"
                  ? STATUS_LABELS[hoveredMachine.status]
                  : "Active")
              : STATUS_LABELS[hoveredMachine.status ?? "no_data"]}
          </p>
          {hoveredObservation && Object.keys(hoveredObservation.values).length > 0 ? (
            <div className="space-y-0.5 border-t border-gray-100 pt-1.5">
              {hoveredObservation.submittedAt && (
                <p className="text-xs text-gray-400 mb-1">
                  Last: {new Date(hoveredObservation.submittedAt).toLocaleString()}
                </p>
              )}
              {(() => {
                // Build a key→label map for human-readable display
                const keyLabelMap: Record<string, string> = {};
                for (const p of hoveredMachine.parameters) {
                  keyLabelMap[p.key] = p.key;
                }
                for (const io of hoveredMachine.inputs) {
                  keyLabelMap[`input_${io.id}`] = `${io.label} (in)`;
                }
                for (const io of hoveredMachine.outputs) {
                  keyLabelMap[`output_${io.id}`] = `${io.label} (out)`;
                }

                const entries = Object.entries(hoveredObservation.values);
                return (
                  <>
                    {entries.slice(0, 6).map(([key, value]) => (
                      <div key={key} className="flex justify-between gap-3 text-xs">
                        <span className="text-gray-500 truncate">{keyLabelMap[key] ?? key}</span>
                        <span className="text-gray-900 font-medium">{String(value ?? "-")}</span>
                      </div>
                    ))}
                    {entries.length > 6 && (
                      <p className="text-xs text-gray-400 pt-0.5">
                        +{entries.length - 6} more...
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">No data submitted yet</p>
          )}
          <p className="text-xs text-blue-500 mt-1.5">Click to open analytics</p>
        </div>
      )}
    </div>
  );
}

export default FactoryVisualization;

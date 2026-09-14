"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import type {
  FactoryLayout,
  MachineNode,
  MachineStatus,
  ConnectionLine,
} from "@/lib/spatial-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FactoryVisualizationProps {
  layout: FactoryLayout;
  /** Map of machineId -> latest observation values */
  observations?: Record<string, ObservationData>;
  onMachineHover?: (machineId: string | null) => void;
  onMachineClick?: (machineId: string) => void;
}

export interface ObservationData {
  values: Record<string, unknown>;
  submittedAt?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Status-based fill colors for machine rectangles (top-view) */
const STATUS_FILLS: Record<MachineStatus, string> = {
  running: "#bbf7d0",  // green-200
  warning: "#fde68a",  // amber-200
  down: "#fecaca",     // red-200
  idle: "#e5e7eb",     // gray-200
  no_data: "#f3f4f6",  // gray-100
};

const STATUS_STROKES: Record<MachineStatus, string> = {
  running: "#16a34a",  // green-600
  warning: "#d97706",  // amber-600
  down: "#dc2626",     // red-600
  idle: "#6b7280",     // gray-500
  no_data: "#9ca3af",  // gray-400
};

const STATUS_LABELS: Record<MachineStatus, string> = {
  running: "Running",
  warning: "Warning",
  down: "Down",
  idle: "Idle",
  no_data: "No Data",
};

// Padding around the floor in SVG units
const PADDING = 1.5;

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
}: FactoryVisualizationProps) {
  const [hoveredMachineId, setHoveredMachineId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const { floor, machines, connections } = layout;

  const svgRef = useRef<SVGSVGElement>(null);

  // SVG base viewBox: floor dimensions + padding
  const baseViewBox = useMemo<ViewBox>(() => {
    return {
      x: -PADDING,
      y: -PADDING,
      width: floor.width + PADDING * 2,
      height: floor.height + PADDING * 2,
    };
  }, [floor.width, floor.height]);

  const [viewBox, setViewBox] = useState<ViewBox>(baseViewBox);
  const viewBoxRef = useRef(viewBox);
  viewBoxRef.current = viewBox;

  // Sync viewBox when floor dimensions change
  useEffect(() => {
    setViewBox(baseViewBox);
  }, [baseViewBox]);

  // Zoom bounds
  const minViewBoxWidth = Math.max(1.5, Math.min(floor.width, floor.height) * 0.08);
  const maxViewBoxWidth = Math.max(floor.width, floor.height) * 3 + PADDING * 2;

  const clampViewBox = useCallback(
    (vb: ViewBox): ViewBox => {
      const aspectRatio = baseViewBox.height / baseViewBox.width;
      const width = Math.max(minViewBoxWidth, Math.min(vb.width, maxViewBoxWidth));
      const height = width * aspectRatio;

      const marginX = floor.width * 0.5;
      const marginY = floor.height * 0.5;
      const minX = -PADDING - marginX;
      const maxX = floor.width + PADDING + marginX - width;
      const minY = -PADDING - marginY;
      const maxY = floor.height + PADDING + marginY - height;

      const x = Math.max(Math.min(minX, maxX), Math.min(Math.max(minX, maxX), vb.x));
      const y = Math.max(Math.min(minY, maxY), Math.min(Math.max(minY, maxY), vb.y));
      return { x, y, width, height };
    },
    [baseViewBox.width, baseViewBox.height, floor.width, floor.height, minViewBoxWidth, maxViewBoxWidth]
  );

  const clampViewBoxRef = useRef(clampViewBox);
  clampViewBoxRef.current = clampViewBox;

  // Zoom to point (focal point = cursor if provided, otherwise center of viewBox)
  const zoomAtPoint = useCallback(
    (factor: number, clientX?: number, clientY?: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const vb = viewBoxRef.current;
      const rect = svg.getBoundingClientRect();

      let cursorX: number;
      let cursorY: number;
      if (clientX !== undefined && clientY !== undefined) {
        cursorX = ((clientX - rect.left) / rect.width) * vb.width + vb.x;
        cursorY = ((clientY - rect.top) / rect.height) * vb.height + vb.y;
      } else {
        cursorX = vb.x + vb.width / 2;
        cursorY = vb.y + vb.height / 2;
      }

      const newWidth = Math.min(maxViewBoxWidth, Math.max(minViewBoxWidth, vb.width * factor));
      const actualFactor = newWidth / vb.width;
      const newHeight = vb.height * actualFactor;

      const newX = cursorX - (cursorX - vb.x) * actualFactor;
      const newY = cursorY - (cursorY - vb.y) * actualFactor;

      setViewBox(clampViewBoxRef.current({ x: newX, y: newY, width: newWidth, height: newHeight }));
    },
    [minViewBoxWidth, maxViewBoxWidth]
  );

  // Wheel zoom listener (non-passive to prevent page scroll)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const isPinch = e.ctrlKey;
      const factor = isPinch
        ? (e.deltaY > 0 ? 1.05 : 0.95)
        : (e.deltaY > 0 ? 1.15 : 0.87);

      zoomAtPoint(factor, e.clientX, e.clientY);
    };

    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [zoomAtPoint]);

  // Pointer drag to pan
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, vbX: 0, vbY: 0 });
  const hasDraggedRef = useRef(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.button === 0 || e.button === 1) {
        setIsPanning(true);
        hasDraggedRef.current = false;
        panStartRef.current = { x: e.clientX, y: e.clientY, vbX: viewBox.x, vbY: viewBox.y };
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    },
    [viewBox.x, viewBox.y]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!isPanning) return;
      const svg = svgRef.current;
      if (!svg) return;

      const dxPixels = e.clientX - panStartRef.current.x;
      const dyPixels = e.clientY - panStartRef.current.y;
      if (Math.hypot(dxPixels, dyPixels) > 4) {
        hasDraggedRef.current = true;
      }

      const rect = svg.getBoundingClientRect();
      const dx = (dxPixels / rect.width) * viewBox.width;
      const dy = (dyPixels / rect.height) * viewBox.height;

      setViewBox(
        clampViewBox({
          ...viewBox,
          x: panStartRef.current.vbX - dx,
          y: panStartRef.current.vbY - dy,
        })
      );
    },
    [isPanning, viewBox, clampViewBox]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    setIsPanning(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

  const handleZoomIn = useCallback(() => zoomAtPoint(0.8), [zoomAtPoint]);
  const handleZoomOut = useCallback(() => zoomAtPoint(1.25), [zoomAtPoint]);
  const handleResetZoom = useCallback(() => setViewBox(baseViewBox), [baseViewBox]);

  const zoomPercentage = Math.round((baseViewBox.width / viewBox.width) * 100);
  const viewBoxString = `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;

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
      if (hasDraggedRef.current) return;
      onMachineClick?.(machineId);
    },
    [onMachineClick]
  );

  return (
    <div className="relative w-full h-full overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <svg
        ref={svgRef}
        className="absolute inset-4 w-[calc(100%-2rem)] h-[calc(100%-2rem)] select-none"
        viewBox={viewBoxString}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ cursor: isPanning ? "grabbing" : "grab", touchAction: "none" }}
      >
          {/* Defs: arrow markers, shadows */}
          <defs>
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
            fill="#f8fafc"
            stroke="#cbd5e1"
            strokeWidth={0.06}
            rx={0.15}
          />
          {/* Grid lines */}
          {Array.from({ length: floor.width + 1 }, (_, i) => (
            <line
              key={`v-${i}`}
              x1={i}
              y1={0}
              x2={i}
              y2={floor.height}
              stroke="#e2e8f0"
              strokeWidth={0.03}
            />
          ))}
          {Array.from({ length: floor.height + 1 }, (_, i) => (
            <line
              key={`h-${i}`}
              x1={0}
              y1={i}
              x2={floor.width}
              y2={i}
              stroke="#e2e8f0"
              strokeWidth={0.03}
            />
          ))}

          {/* Connection lines (rendered behind machines) */}
          {connections.map((conn) => {
            const src = machineMap.get(conn.sourceId);
            const tgt = machineMap.get(conn.targetId);
            if (!src || !tgt) return null;

            const srcW = src.size?.width ?? 1;
            const srcH = src.size?.height ?? 1;
            const tgtW = tgt.size?.width ?? 1;
            const tgtH = tgt.size?.height ?? 1;

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
            const obsData = observations?.[machine.id];
            const hasData = !!obsData;
            // Derive status from the 'active' boolean parameter in observations
            let status: MachineStatus = machine.status ?? "no_data";
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
            const w = machine.size?.width ?? 1;
            const h = machine.size?.height ?? 1;
            const isHovered = hoveredMachineId === machine.id;
            const fontSize = Math.min(w, h) * 0.3;

            return (
              <g
                key={machine.id}
                className="cursor-pointer"
                onMouseEnter={(e) => handleMachineEnter(machine.id, e)}
                onMouseMove={handleMachineMove}
                onMouseLeave={handleMachineLeave}
                onClick={() => handleMachineClick(machine.id)}
                role="button"
                aria-label={`Machine: ${machine.name}, Status: ${STATUS_LABELS[status]}`}
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
                  fill={STATUS_FILLS[status]}
                  stroke={isHovered ? "#2563eb" : STATUS_STROKES[status]}
                  strokeWidth={isHovered ? 0.1 : 0.06}
                  filter="url(#machine-shadow)"
                  style={{ transition: "stroke 0.15s, stroke-width 0.15s" }}
                />
                {/* Status indicator dot */}
                <circle
                  cx={machine.position.x + w - 0.25}
                  cy={machine.position.y + 0.25}
                  r={0.12}
                  fill={STATUS_STROKES[status]}
                />
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
                {(() => {
                  const nameLen = Math.max(machine.name.length, 1);
                  const maxFontSize = Math.min(w, h) * 0.28;
                  const fitFontSize = Math.min(maxFontSize, ((w - 0.2) * 0.95) / (nameLen * 0.58));
                  const dynamicFontSize = Math.max(fitFontSize, 0.22);
                  const availW = (w - 0.1) * 0.95;
                  const avgCharW = dynamicFontSize * 0.55;
                  const maxC = Math.max(2, Math.floor(availW / avgCharW));
                  const displayName = machine.name.length > maxC
                    ? machine.name.slice(0, maxC - 1) + "\u2026"
                    : machine.name;
                  return (
                    <>
                      <text
                        x={machine.position.x + w / 2}
                        y={machine.position.y + h / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={dynamicFontSize}
                        fontWeight={600}
                        fill="#1e293b"
                        clipPath={`url(#viz-clip-${machine.id})`}
                        style={{ pointerEvents: "none", userSelect: "none", fontFamily: "var(--font-family), system-ui, sans-serif" }}
                      >
                        {displayName}
                      </text>
                      {/* Status label below name – also clipped */}
                      <text
                        x={machine.position.x + w / 2}
                        y={machine.position.y + h / 2 + dynamicFontSize * 1.25}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={Math.max(dynamicFontSize * 0.7, 0.18)}
                        fontWeight={500}
                        fill={STATUS_STROKES[status]}
                        clipPath={`url(#viz-clip-${machine.id})`}
                        style={{ pointerEvents: "none", userSelect: "none", fontFamily: "var(--font-family), system-ui, sans-serif" }}
                      >
                        {STATUS_LABELS[status]}
                      </text>
                    </>
                  );
                })()}
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
          <p className="text-xs text-blue-500 mt-1.5">Click for analytics</p>
        </div>
      )}

      {/* Floating Zoom Controls */}
      <div className="absolute bottom-4 right-4 flex items-center bg-white/95 backdrop-blur-md shadow-md border border-gray-200 rounded-lg p-1 gap-1 z-20 text-gray-700">
        <button
          type="button"
          onClick={handleZoomOut}
          className="p-1.5 hover:bg-gray-100 rounded text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
          title="Zoom Out (or scroll down)"
          aria-label="Zoom Out"
        >
          <ZoomOut size={16} />
        </button>
        <button
          type="button"
          onClick={handleResetZoom}
          className="px-2 py-1 text-xs font-semibold tabular-nums hover:bg-gray-100 rounded text-gray-700 min-w-[3.2rem] text-center cursor-pointer"
          title="Reset Zoom to 100%"
        >
          {zoomPercentage}%
        </button>
        <button
          type="button"
          onClick={handleZoomIn}
          className="p-1.5 hover:bg-gray-100 rounded text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
          title="Zoom In (or scroll up)"
          aria-label="Zoom In"
        >
          <ZoomIn size={16} />
        </button>
        <div className="h-4 w-px bg-gray-200 mx-0.5" />
        <button
          type="button"
          onClick={handleResetZoom}
          className="p-1.5 hover:bg-gray-100 rounded text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
          title="Fit to Screen"
          aria-label="Fit to Screen"
        >
          <RotateCcw size={15} />
        </button>
      </div>

      {/* Mini Navigation Hint */}
      <div className="absolute bottom-4 left-4 pointer-events-none text-[11px] text-gray-400 bg-white/80 backdrop-blur-sm px-2.5 py-1 rounded border border-gray-100 shadow-xs select-none">
        Scroll to zoom • Drag to pan
      </div>
    </div>
  );
}

export default FactoryVisualization;

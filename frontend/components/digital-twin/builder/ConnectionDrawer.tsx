"use client";

import { useCallback, useEffect, useState } from "react";
import { useFactoryBuilder } from "@/lib/factory-builder-context";
import { calculateConnectionDistance } from "@/lib/factory-builder-context";
import type { GridPosition, ConnectionLine } from "@/lib/spatial-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConnectionDrawerProps {
  /** Reference to the parent SVG element for coordinate transformations */
  svgRef: React.RefObject<SVGSVGElement | null>;
  /** Current viewBox for coordinate calculations */
  viewBox: { x: number; y: number; width: number; height: number };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Arrowhead size relative to viewBox */
const ARROWHEAD_LENGTH = 0.6;
const ARROWHEAD_WIDTH = 0.3;

/** Line styling */
const LINE_COLOR = "#2563eb"; // Blue-600
const LINE_COLOR_INVALID = "#9ca3af"; // Gray-400
const LINE_WIDTH_FACTOR = 0.003; // Relative to viewBox width

/** Label styling */
const LABEL_FONT_SIZE_FACTOR = 0.025;
const LABEL_BG_PADDING = 0.15;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a unique ID for a new connection */
function generateConnectionId(): string {
  return `conn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Computes the arrowhead polygon points for an arrow pointing from (x1,y1) to (x2,y2).
 * Returns the three points of the arrowhead triangle as an SVG points string.
 */
function computeArrowheadPoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  length: number,
  width: number
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist === 0) return "";

  // Unit vector along the line direction
  const ux = dx / dist;
  const uy = dy / dist;

  // Perpendicular unit vector
  const px = -uy;
  const py = ux;

  // Tip of the arrow (at the cursor/target)
  const tipX = x2;
  const tipY = y2;

  // Base of the arrowhead (offset back from tip)
  const baseX = x2 - ux * length;
  const baseY = y2 - uy * length;

  // Left and right corners of the arrowhead
  const leftX = baseX + px * width;
  const leftY = baseY + py * width;
  const rightX = baseX - px * width;
  const rightY = baseY - py * width;

  return `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`;
}

// ---------------------------------------------------------------------------
// ConnectionDrawer Component
// ---------------------------------------------------------------------------

/**
 * ConnectionDrawer renders a provisional SVG connection line from a source machine
 * to the current cursor position while the builder is in "connecting" mode.
 *
 * It activates when `state.mode === "connecting"` (initiated via startConnection).
 * - Renders a line from source machine center to cursor with an arrowhead
 * - Displays connection distance at the midpoint
 * - Completes connection on drop on a different machine
 * - Cancels on drop on empty space or the same machine
 *
 * Requirements: 8.1, 8.2, 8.3, 8.6, 8.7
 */
export function ConnectionDrawer({ svgRef, viewBox }: ConnectionDrawerProps) {
  const {
    state,
    completeConnection,
    cancelConnection,
  } = useFactoryBuilder();

  const [cursorPosition, setCursorPosition] = useState<GridPosition | null>(null);
  const [hoverTargetId, setHoverTargetId] = useState<string | null>(null);
  const isActive = state.mode === "connecting" && state.selectedMachineId !== null;

  // Find the source machine from state
  const sourceMachine = isActive
    ? state.layout.machines.find((m) => m.id === state.selectedMachineId)
    : null;

  /**
   * Convert client coordinates to SVG user-space coordinates.
   * Uses SVG's native getScreenCTM() to correctly handle preserveAspectRatio letterboxing.
   */
  const clientToSvg = useCallback(
    (clientX: number, clientY: number): GridPosition | null => {
      const svg = svgRef.current;
      if (!svg) return null;

      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      const inverseCTM = ctm.inverse();
      const svgX = inverseCTM.a * clientX + inverseCTM.c * clientY + inverseCTM.e;
      const svgY = inverseCTM.b * clientX + inverseCTM.d * clientY + inverseCTM.f;

      return { x: svgX, y: svgY };
    },
    [svgRef]
  );

  /**
   * Determine which machine (if any) is at a given SVG position.
   * Respects machine size (multi-tile machines).
   */
  const getMachineAtPosition = useCallback(
    (svgPos: GridPosition): string | null => {
      for (const machine of state.layout.machines) {
        const mx = machine.position.x;
        const my = machine.position.y;
        const mw = machine.size?.width ?? 1;
        const mh = machine.size?.height ?? 1;
        // Check if position is within the machine's full bounds
        if (
          svgPos.x >= mx &&
          svgPos.x <= mx + mw &&
          svgPos.y >= my &&
          svgPos.y <= my + mh
        ) {
          return machine.id;
        }
      }
      return null;
    },
    [state.layout.machines]
  );

  // Pointer move handler to track cursor
  useEffect(() => {
    if (!isActive) return;

    const handlePointerMove = (e: PointerEvent) => {
      const pos = clientToSvg(e.clientX, e.clientY);
      if (pos) {
        setCursorPosition(pos);
        setHoverTargetId(getMachineAtPosition(pos));
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      const pos = clientToSvg(e.clientX, e.clientY);
      if (!pos) {
        cancelConnection();
        return;
      }

      const targetId = getMachineAtPosition(pos);

      if (targetId && targetId !== state.selectedMachineId) {
        // Valid target: create connection (Req 8.3)
        const newConnection: ConnectionLine = {
          id: generateConnectionId(),
          sourceId: state.selectedMachineId!,
          targetId: targetId,
          direction: "forward",
          distance: sourceMachine
            ? calculateConnectionDistance(
                sourceMachine.position,
                state.layout.machines.find((m) => m.id === targetId)!.position
              )
            : undefined,
        };
        completeConnection(newConnection);
      } else {
        // Drop on empty space (Req 8.6) or same machine (Req 8.7)
        cancelConnection();
      }
    };

    // Handle Escape key to cancel
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelConnection();
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("keydown", handleKeyDown);
      setCursorPosition(null);
      setHoverTargetId(null);
    };
  }, [
    isActive,
    clientToSvg,
    getMachineAtPosition,
    state.selectedMachineId,
    sourceMachine,
    state.layout.machines,
    completeConnection,
    cancelConnection,
  ]);

  // Don't render if not in connecting mode or no source machine
  if (!isActive || !sourceMachine || !cursorPosition) {
    return null;
  }

  // Source position: center of the machine (accounting for size)
  const sourceW = sourceMachine.size?.width ?? 1;
  const sourceH = sourceMachine.size?.height ?? 1;
  const sourceX = sourceMachine.position.x + sourceW / 2;
  const sourceY = sourceMachine.position.y + sourceH / 2;

  // Target position: current cursor position
  const targetX = cursorPosition.x;
  const targetY = cursorPosition.y;

  // Distance calculation (Req 8.2)
  const distance = calculateConnectionDistance(
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY }
  );

  // Midpoint for label
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;

  // Determine if cursor is over a valid target
  const isOverValidTarget =
    hoverTargetId !== null && hoverTargetId !== state.selectedMachineId;

  // Styling
  const lineColor = isOverValidTarget ? LINE_COLOR : LINE_COLOR_INVALID;
  const lineWidth = viewBox.width * LINE_WIDTH_FACTOR;

  // Arrowhead
  const arrowPoints = computeArrowheadPoints(
    sourceX,
    sourceY,
    targetX,
    targetY,
    ARROWHEAD_LENGTH,
    ARROWHEAD_WIDTH
  );

  // Label sizing
  const fontSize = Math.max(0.4, viewBox.width * LABEL_FONT_SIZE_FACTOR);
  const unit = state.layout.floor.unit === "feet" ? "ft" : "m";
  const distanceLabel = `${distance} ${unit}`;

  // Approximate label background dimensions
  const labelWidth = distanceLabel.length * fontSize * 0.55;
  const labelHeight = fontSize * 1.4;

  return (
    <g className="connection-drawer" style={{ pointerEvents: "none" }}>
      {/* Provisional connection line */}
      <line
        x1={sourceX}
        y1={sourceY}
        x2={targetX}
        y2={targetY}
        stroke={lineColor}
        strokeWidth={lineWidth}
        strokeDasharray={`${lineWidth * 4} ${lineWidth * 2}`}
        opacity={0.8}
      />

      {/* Arrowhead at cursor end */}
      {arrowPoints && (
        <polygon
          points={arrowPoints}
          fill={lineColor}
          opacity={0.9}
        />
      )}

      {/* Distance label at midpoint (Req 8.2) */}
      {distance > 0 && (
        <g>
          {/* Label background */}
          <rect
            x={midX - labelWidth / 2 - LABEL_BG_PADDING}
            y={midY - labelHeight / 2 - LABEL_BG_PADDING}
            width={labelWidth + LABEL_BG_PADDING * 2}
            height={labelHeight + LABEL_BG_PADDING * 2}
            fill="white"
            stroke={lineColor}
            strokeWidth={lineWidth * 0.5}
            rx={LABEL_BG_PADDING}
            opacity={0.9}
          />
          {/* Label text */}
          <text
            x={midX}
            y={midY}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={fontSize}
            fill={lineColor}
            fontWeight="500"
          >
            {distanceLabel}
          </text>
        </g>
      )}

      {/* Visual indicator when hovering over a valid target machine */}
      {isOverValidTarget && hoverTargetId && (() => {
        const targetMachine = state.layout.machines.find((m) => m.id === hoverTargetId);
        if (!targetMachine) return null;
        return (
          <rect
            x={targetMachine.position.x}
            y={targetMachine.position.y}
            width={1}
            height={1}
            fill="rgba(34, 197, 94, 0.2)"
            stroke="#22c55e"
            strokeWidth={lineWidth}
            rx={viewBox.width / 2000}
          />
        );
      })()}
    </g>
  );
}

export default ConnectionDrawer;

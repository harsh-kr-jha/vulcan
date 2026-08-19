"use client";

import { useCallback } from "react";
import { useFactoryBuilder } from "@/lib/factory-builder-context";
import type { ConnectionLine, GridPosition, MachineNode } from "@/lib/spatial-types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ARROW_MARKER_ID = "connection-arrowhead";
const ARROW_MARKER_SELECTED_ID = "connection-arrowhead-selected";

/** Default connection stroke color */
const CONNECTION_COLOR = "#6366f1"; // Indigo-500

/** Selected connection stroke color */
const CONNECTION_SELECTED_COLOR = "#4f46e5"; // Indigo-600

/** Connection stroke width (in SVG user units) */
const CONNECTION_STROKE_WIDTH = 0.08;

/** Selected connection stroke width */
const CONNECTION_SELECTED_STROKE_WIDTH = 0.12;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the center of a grid cell (offset by 0.5 in both axes).
 */
function getMachineCenter(position: GridPosition, size?: { width: number; height: number }): { cx: number; cy: number } {
  const w = size?.width ?? 1;
  const h = size?.height ?? 1;
  return { cx: position.x + w / 2, cy: position.y + h / 2 };
}

/**
 * Builds a lookup map from machine ID to MachineNode for fast access.
 */
function buildMachineMap(machines: MachineNode[]): Map<string, MachineNode> {
  const map = new Map<string, MachineNode>();
  for (const machine of machines) {
    map.set(machine.id, machine);
  }
  return map;
}

/**
 * Computes the point along the line from source to target
 * that is `offset` units before the target center.
 * This allows the arrowhead to appear at the edge of the target cell.
 */
function computeArrowEnd(
  source: { cx: number; cy: number },
  target: { cx: number; cy: number },
  offset: number
): { x: number; y: number } {
  const dx = target.cx - source.cx;
  const dy = target.cy - source.cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return { x: target.cx, y: target.cy };
  const ratio = (dist - offset) / dist;
  return {
    x: source.cx + dx * ratio,
    y: source.cy + dy * ratio,
  };
}

// ---------------------------------------------------------------------------
// ArrowMarkerDefs – SVG marker definitions for arrowheads
// ---------------------------------------------------------------------------

function ArrowMarkerDefs() {
  return (
    <defs>
      {/* Default arrowhead */}
      <marker
        id={ARROW_MARKER_ID}
        viewBox="0 0 10 10"
        refX="10"
        refY="5"
        markerWidth="4"
        markerHeight="4"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 Z" fill={CONNECTION_COLOR} />
      </marker>
      {/* Selected arrowhead */}
      <marker
        id={ARROW_MARKER_SELECTED_ID}
        viewBox="0 0 10 10"
        refX="10"
        refY="5"
        markerWidth="4"
        markerHeight="4"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 Z" fill={CONNECTION_SELECTED_COLOR} />
      </marker>
    </defs>
  );
}

// ---------------------------------------------------------------------------
// ConnectionPath – renders a single connection line with arrowhead
// ---------------------------------------------------------------------------

interface ConnectionPathProps {
  connection: ConnectionLine;
  sourceMachine: MachineNode;
  targetMachine: MachineNode;
  isSelected: boolean;
  isEditMode: boolean;
  onSelect: (id: string) => void;
}

function ConnectionPath({
  connection,
  sourceMachine,
  targetMachine,
  isSelected,
  isEditMode,
  onSelect,
}: ConnectionPathProps) {
  const source = getMachineCenter(sourceMachine.position, sourceMachine.size);
  const target = getMachineCenter(targetMachine.position, targetMachine.size);

  // Offset the endpoint slightly so the arrowhead appears before the target center
  const arrowEnd = computeArrowEnd(source, target, 0.35);

  const strokeColor = isSelected ? CONNECTION_SELECTED_COLOR : CONNECTION_COLOR;
  const strokeWidth = isSelected ? CONNECTION_SELECTED_STROKE_WIDTH : CONNECTION_STROKE_WIDTH;
  const markerId = isSelected ? ARROW_MARKER_SELECTED_ID : ARROW_MARKER_ID;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isEditMode) return;
      e.stopPropagation();
      onSelect(connection.id);
    },
    [isEditMode, onSelect, connection.id]
  );

  // Build tooltip text
  const tooltipText = connection.name
    ? `${connection.name}${connection.materialType ? ` — ${connection.materialType}` : ""}`
    : connection.materialType || "Connection";

  return (
    <g className="connection-path" data-connection-id={connection.id}>
      {/* Invisible wider path for easier click/hover targeting */}
      {isEditMode && (
        <line
          x1={source.cx}
          y1={source.cy}
          x2={arrowEnd.x}
          y2={arrowEnd.y}
          stroke="transparent"
          strokeWidth={strokeWidth * 5}
          style={{ cursor: "pointer", pointerEvents: "stroke" }}
          onClick={handleClick}
        />
      )}
      {/* Visible connection line */}
      <line
        x1={source.cx}
        y1={source.cy}
        x2={arrowEnd.x}
        y2={arrowEnd.y}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        markerEnd={`url(#${markerId})`}
        style={{
          cursor: isEditMode ? "pointer" : "default",
          pointerEvents: isEditMode ? "stroke" : "none",
          transition: "stroke 0.15s ease, stroke-width 0.15s ease",
        }}
        onClick={handleClick}
      >
        <title>{tooltipText}</title>
      </line>
      {/* Selection highlight ring around midpoint */}
      {isSelected && (
        <circle
          cx={(source.cx + arrowEnd.x) / 2}
          cy={(source.cy + arrowEnd.y) / 2}
          r={0.2}
          fill="none"
          stroke={CONNECTION_SELECTED_COLOR}
          strokeWidth={0.04}
          strokeDasharray="0.08 0.06"
          style={{ pointerEvents: "none" }}
        />
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// ConnectionLineLayer – main exported component
// ---------------------------------------------------------------------------

interface ConnectionLineLayerProps {
  /** Callback fired when a connection is clicked in edit mode */
  onSelectConnection?: (connectionId: string) => void;
}

export function ConnectionLineLayer({ onSelectConnection }: ConnectionLineLayerProps) {
  const { state } = useFactoryBuilder();
  const { connections, machines } = state.layout;
  const { selectedConnectionId, mode, isEditingExisting, isDirty } = state;

  // Build a fast lookup for machines by ID
  const machineMap = buildMachineMap(machines);

  // Edit mode: layout is being edited and mode is idle
  const isEditMode = mode === "idle" && (isEditingExisting || isDirty);

  const handleSelectConnection = useCallback(
    (id: string) => {
      onSelectConnection?.(id);
    },
    [onSelectConnection]
  );

  // Don't render anything if there are no connections
  if (connections.length === 0) {
    return <ArrowMarkerDefs />;
  }

  return (
    <g className="connection-line-layer">
      <ArrowMarkerDefs />
      {connections.map((connection) => {
        const sourceMachine = machineMap.get(connection.sourceId);
        const targetMachine = machineMap.get(connection.targetId);

        // Skip connections with missing source/target (shouldn't happen, but defensive)
        if (!sourceMachine || !targetMachine) return null;

        return (
          <ConnectionPath
            key={connection.id}
            connection={connection}
            sourceMachine={sourceMachine}
            targetMachine={targetMachine}
            isSelected={selectedConnectionId === connection.id}
            isEditMode={isEditMode}
            onSelect={handleSelectConnection}
          />
        );
      })}
    </g>
  );
}

export default ConnectionLineLayer;

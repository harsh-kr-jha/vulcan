"use client";

import { useCallback, useState } from "react";
import { useFactoryBuilder } from "@/lib/factory-builder-context";
import type { ConnectionLine, MachineNode } from "@/lib/spatial-types";
import { connectorCurve, resolveConnectorConfig } from "@/lib/connector-geometry";
import type { SceneMachine } from "@/lib/spatial-scene";

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
  const [isHovered, setIsHovered] = useState(false);
  const toSceneMachine = (machine: MachineNode): SceneMachine => {
    const rotated = machine.rotation === 90 || machine.rotation === 270;
    const rawWidth = machine.size?.width ?? 1;
    const rawDepth = machine.size?.height ?? 1;
    return {
      id: machine.id, name: machine.name, x: machine.position.x, y: machine.position.y,
      width: rotated ? rawDepth : rawWidth, depth: rotated ? rawWidth : rawDepth,
      height: machine.visualHeight ?? 1, rotation: machine.rotation ?? 0,
      representation: machine.representation ?? "block", blockColor: machine.blockColor ?? "#DBEAFE",
      modelAsset: machine.modelAsset, modelTransform: machine.modelTransform ?? { elevation: 0, scale: 1, rotationY: 0 },
      status: machine.status ?? "no_data", alertCount: 0, alertSeverity: null, attentionReasons: [],
    };
  };
  const curve = connectorCurve(connection, toSceneMachine(sourceMachine), toSceneMachine(targetMachine));
  const pathPoints = curve.getPoints(24);
  const pathData = pathPoints.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.z}`).join(" ");
  const resolved = resolveConnectorConfig(connection);

  const strokeColor = isSelected
    ? CONNECTION_SELECTED_COLOR
    : isHovered
      ? CONNECTION_SELECTED_COLOR
      : resolved.visual.color;
  const strokeWidth = isSelected || isHovered
    ? CONNECTION_SELECTED_STROKE_WIDTH
    : CONNECTION_STROKE_WIDTH;
  const markerId = isSelected ? ARROW_MARKER_SELECTED_ID : ARROW_MARKER_ID;

  // Midpoint for the edit icon
  const midpoint = curve.getPointAt(0.5);
  const midX = midpoint.x;
  const midY = midpoint.z;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isEditMode) return;
      e.preventDefault();
      e.stopPropagation();
      onSelect(connection.id);
    },
    [isEditMode, onSelect, connection.id]
  );

  const handleMouseEnter = useCallback(() => {
    if (isEditMode) setIsHovered(true);
  }, [isEditMode]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  // Build tooltip text
  const tooltipText = connection.name
    ? `${connection.name}${connection.materialType ? ` — ${connection.materialType}` : ""}`
    : connection.materialType || "Connection";

  return (
    <g
      className="connection-path"
      data-connection-id={connection.id}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Invisible wider path for easier click/hover targeting */}
      {isEditMode && (
        <path
          d={pathData}
          fill="none"
          stroke="transparent"
          strokeWidth={strokeWidth * 8}
          style={{ cursor: "pointer", pointerEvents: "stroke" }}
          onContextMenu={handleClick}
        />
      )}
      {/* Visible connection line */}
      <path
        d={pathData}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={resolved.visual.dashed ? `${strokeWidth * 4} ${strokeWidth * 3}` : undefined}
        opacity={resolved.visual.opacity}
        markerStart={connection.direction === "reverse" || connection.direction === "bidirectional" ? `url(#${markerId})` : undefined}
        markerEnd={!connection.direction || connection.direction === "forward" || connection.direction === "bidirectional" ? `url(#${markerId})` : undefined}
        style={{
          cursor: isEditMode ? "pointer" : "default",
          pointerEvents: isEditMode ? "stroke" : "none",
          transition: "stroke 0.15s ease, stroke-width 0.15s ease",
        }}
        onContextMenu={handleClick}
      >
        <title>{tooltipText}</title>
      </path>
      {/* Edit icon on hover (pencil icon at midpoint) — left-click opens config */}
      {isEditMode && (isHovered || isSelected) && (
        <g
          transform={`translate(${midX - 0.25}, ${midY - 0.25})`}
          style={{ cursor: "pointer", pointerEvents: "all" }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSelect(connection.id); }}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onSelect(connection.id); }}
        >
          <circle
            cx={0.25}
            cy={0.25}
            r={0.32}
            fill="white"
            stroke={CONNECTION_SELECTED_COLOR}
            strokeWidth={0.04}
          />
          {/* Pencil icon path scaled to fit 0.5x0.5 viewBox */}
          <path
            d="M0.12 0.35 L0.32 0.15 L0.38 0.21 L0.18 0.41 L0.1 0.43 Z M0.33 0.14 L0.37 0.1 L0.43 0.16 L0.39 0.2 Z"
            fill={CONNECTION_SELECTED_COLOR}
          />
        </g>
      )}
      {/* Selection highlight ring around midpoint */}
      {isSelected && !isHovered && (
        <circle
          cx={midX}
          cy={midY}
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

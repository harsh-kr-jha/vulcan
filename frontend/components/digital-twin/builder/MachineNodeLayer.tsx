"use client";

import { useCallback, useState } from "react";
import { useFactoryBuilder } from "@/lib/factory-builder-context";
import type { MachineNode } from "@/lib/spatial-types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default fill color for machine nodes */
const MACHINE_FILL = "#dbeafe"; // Tailwind blue-100
/** Selected fill color */
const MACHINE_FILL_SELECTED = "#93c5fd"; // Tailwind blue-300
/** Stroke color */
const MACHINE_STROKE = "#2563eb"; // Tailwind blue-600
/** Selected stroke color */
const MACHINE_STROKE_SELECTED = "#1d4ed8"; // Tailwind blue-700
/** Text color */
const TEXT_COLOR = "#1e3a5f";
/** Anchor color */
const ANCHOR_COLOR = "#f97316"; // Tailwind orange-500
/** Anchor hover color */
const ANCHOR_HOVER_COLOR = "#ea580c"; // Tailwind orange-600

// ---------------------------------------------------------------------------
// SingleMachineNode – renders one machine on the grid
// ---------------------------------------------------------------------------

interface SingleMachineNodeProps {
  machine: MachineNode;
  isSelected: boolean;
  isEditMode: boolean;
  onSelect: (id: string) => void;
  onAnchorDragStart?: (sourceId: string) => void;
}

function SingleMachineNode({
  machine,
  isSelected,
  isEditMode,
  onSelect,
  onAnchorDragStart,
}: SingleMachineNodeProps) {
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Left click does nothing on machines (left is for pan)
      e.stopPropagation();
    },
    []
  );

  const handleRightClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect(machine.id);
    },
    [machine.id, onSelect]
  );

  const handleAnchorPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      if (onAnchorDragStart) {
        onAnchorDragStart(machine.id);
      }
    },
    [machine.id, onAnchorDragStart]
  );

  const { x, y } = machine.position;
  const machineWidth = machine.size?.width ?? 1;
  const machineHeight = machine.size?.height ?? 1;
  const fill = isSelected ? MACHINE_FILL_SELECTED : MACHINE_FILL;
  const stroke = isSelected ? MACHINE_STROKE_SELECTED : MACHINE_STROKE;

  // Font size dynamically fits machine name
  const nameLen = Math.max(machine.name.length, 1);
  const maxFontSize = Math.min(machineWidth, machineHeight) * 0.35;
  const fitFontSize = Math.min(maxFontSize, ((machineWidth - 0.2) * 0.95) / (nameLen * 0.58));
  const fontSize = Math.max(fitFontSize, 0.22);

  // Truncate name based on available width (with padding)
  const availableWidth = (machineWidth - 0.1) * 0.95;
  const avgCharWidth = fontSize * 0.55;
  const maxChars = Math.max(2, Math.floor(availableWidth / avgCharWidth));
  const displayName =
    machine.name.length > maxChars
      ? machine.name.slice(0, maxChars - 1) + "…"
      : machine.name;

  const clipId = `machine-clip-${machine.id}`;

  return (
    <g
      className="machine-node cursor-pointer"
      onClick={handleClick}
      onContextMenu={handleRightClick}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      data-machine-id={machine.id}
      role="button"
      aria-label={`Machine: ${machine.name}`}
    >
      {/* Clip path to prevent text from ever spilling outside the box */}
      <defs>
        <clipPath id={clipId}>
          <rect x={x} y={y} width={machineWidth} height={machineHeight} />
        </clipPath>
      </defs>

      {/* Machine body – uses machine.size for dimensions, positioned at (x, y) */}
      <rect
        x={x}
        y={y}
        width={machineWidth}
        height={machineHeight}
        rx={0.2}
        ry={0.2}
        fill={fill}
        stroke={stroke}
        strokeWidth={isSelected ? 0.12 : 0.08}
        style={{
          transition: "fill 0.15s ease, stroke-width 0.15s ease",
          filter: isHovered ? "brightness(0.95)" : undefined,
        }}
      />

      {/* Machine name label – centered inside the rect, clipped to bounds */}
      <text
        x={x + machineWidth / 2}
        y={y + machineHeight / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize}
        fontWeight={500}
        fill={TEXT_COLOR}
        clipPath={`url(#${clipId})`}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {displayName}
      </text>

      {/* Hover tooltip – shows full machine name above the machine */}
      {isHovered && machine.name && (
        <g style={{ pointerEvents: "none" }}>
          <rect
            x={x + machineWidth / 2 - (machine.name.length * fontSize * 0.3)}
            y={y - fontSize * 1.8}
            width={machine.name.length * fontSize * 0.6}
            height={fontSize * 1.4}
            rx={0.1}
            fill="rgba(17, 24, 39, 0.85)"
          />
          <text
            x={x + machineWidth / 2}
            y={y - fontSize * 1.1}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={fontSize * 0.7}
            fill="white"
            fontWeight={500}
          >
            {machine.name}
          </text>
        </g>
      )}

      {/* Connection anchor points – visible on all 4 sides on hover in edit mode */}
      {isEditMode && (isHovered || isSelected) && (
        <>
          {/* Right anchor */}
          <circle
            cx={x + machineWidth}
            cy={y + machineHeight / 2}
            r={0.2}
            fill={isHovered ? ANCHOR_HOVER_COLOR : ANCHOR_COLOR}
            stroke="#fff"
            strokeWidth={0.05}
            className="connection-anchor"
            style={{ cursor: "crosshair", transition: "fill 0.1s ease" }}
            onPointerDown={handleAnchorPointerDown}
            aria-label={`Connection anchor right for ${machine.name}`}
          />
          {/* Left anchor */}
          <circle
            cx={x}
            cy={y + machineHeight / 2}
            r={0.2}
            fill={isHovered ? ANCHOR_HOVER_COLOR : ANCHOR_COLOR}
            stroke="#fff"
            strokeWidth={0.05}
            className="connection-anchor"
            style={{ cursor: "crosshair", transition: "fill 0.1s ease" }}
            onPointerDown={handleAnchorPointerDown}
            aria-label={`Connection anchor left for ${machine.name}`}
          />
          {/* Top anchor */}
          <circle
            cx={x + machineWidth / 2}
            cy={y}
            r={0.2}
            fill={isHovered ? ANCHOR_HOVER_COLOR : ANCHOR_COLOR}
            stroke="#fff"
            strokeWidth={0.05}
            className="connection-anchor"
            style={{ cursor: "crosshair", transition: "fill 0.1s ease" }}
            onPointerDown={handleAnchorPointerDown}
            aria-label={`Connection anchor top for ${machine.name}`}
          />
          {/* Bottom anchor */}
          <circle
            cx={x + machineWidth / 2}
            cy={y + machineHeight}
            r={0.2}
            fill={isHovered ? ANCHOR_HOVER_COLOR : ANCHOR_COLOR}
            stroke="#fff"
            strokeWidth={0.05}
            className="connection-anchor"
            style={{ cursor: "crosshair", transition: "fill 0.1s ease" }}
            onPointerDown={handleAnchorPointerDown}
            aria-label={`Connection anchor bottom for ${machine.name}`}
          />
        </>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// MachineNodeLayer – renders all placed machines
// ---------------------------------------------------------------------------

export interface MachineNodeLayerProps {
  /** Called when the user right-clicks a machine node (for selection/config panel) */
  onSelectMachine?: (machineId: string) => void;
  /** Called when the user starts dragging from an anchor to create a connection */
  onStartConnection?: (sourceId: string) => void;
}

/**
 * Renders all placed Machine_Node elements on the FloorCanvas SVG.
 * - Shows each machine as a labeled rect at its grid position.
 * - In edit mode: shows circular anchor points for drag-to-connect on hover.
 * - Right-click to select (opens config panel).
 * - Hover shows machine name tooltip.
 *
 * Requirements: 3.5, 13.2, 13.5
 */
export function MachineNodeLayer({
  onSelectMachine,
  onStartConnection,
}: MachineNodeLayerProps) {
  const { state, startConnection } = useFactoryBuilder();
  const { machines } = state.layout;
  const selectedMachineId = state.selectedMachineId;

  // Edit mode: layout is being edited (new or existing)
  const isEditMode = state.isEditingExisting || state.isDirty;

  const handleSelect = useCallback(
    (id: string) => {
      if (onSelectMachine) {
        onSelectMachine(id);
      }
    },
    [onSelectMachine]
  );

  const handleAnchorDragStart = useCallback(
    (sourceId: string) => {
      startConnection(sourceId);
      if (onStartConnection) {
        onStartConnection(sourceId);
      }
    },
    [startConnection, onStartConnection]
  );

  if (machines.length === 0) return null;

  return (
    <g className="machine-node-layer">
      {machines.map((machine) => (
        <SingleMachineNode
          key={machine.id}
          machine={machine}
          isSelected={selectedMachineId === machine.id}
          isEditMode={isEditMode}
          onSelect={handleSelect}
          onAnchorDragStart={isEditMode ? handleAnchorDragStart : undefined}
        />
      ))}
    </g>
  );
}

export default MachineNodeLayer;

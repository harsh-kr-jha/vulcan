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

  const nameLower = machine.name.toLowerCase();
  const isPlatform = nameLower.includes("platform");
  const isPath = nameLower.includes("path") || nameLower.includes("corridor");
  const isStrawManure = nameLower.includes("straw") && nameLower.includes("manure");

  let fill = isSelected ? MACHINE_FILL_SELECTED : MACHINE_FILL;
  let stroke = isSelected ? MACHINE_STROKE_SELECTED : MACHINE_STROKE;
  let textColor = TEXT_COLOR;

  if (isPlatform) {
    fill = isSelected ? "#b45309" : "#8c4314";
    stroke = isSelected ? "#f59e0b" : "#6d3410";
    textColor = "#ffffff";
  } else if (isPath) {
    fill = isSelected ? "#7c3aed" : "#5820b8";
    stroke = isSelected ? "#c084fc" : "#431499";
    textColor = "#ffffff";
  } else {
    fill = isSelected ? "#bfdbfe" : "#cce2fe";
    stroke = isSelected ? "#1d4ed8" : "#93c5fd";
  }

  // Font size dynamically fits machine name
  const nameLen = Math.max(machine.name.length, 1);
  const maxFontSize = isPlatform ? Math.min(machineWidth, machineHeight) * 0.32 : Math.min(machineWidth, machineHeight) * 0.35;
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
          transition: "fill 0.15s ease, stroke 0.15s ease",
          filter: isHovered ? "brightness(0.95)" : undefined,
        }}
      />

      {/* Path decoration in edit mode */}
      {isPath && (
        <g style={{ pointerEvents: "none" }}>
          <polygon
            points={`${x + machineWidth - 0.15},${y + machineHeight / 2} ${x + machineWidth - 0.9},${y + 0.5} ${x + machineWidth - 0.9},${y + machineHeight - 0.5}`}
            fill="#86efac"
            opacity={0.95}
          />
          {Array.from({ length: 9 }).map((_, arrIdx) => {
            const arrX = x + 1.8 + arrIdx * 3.2;
            if (arrX > x + machineWidth - 2.5) return null;
            if (arrIdx === 4) return null;
            const arrY = y + machineHeight / 2;
            return (
              <g key={`edit-arr-${arrIdx}`} fill="#86efac" opacity={0.95}>
                <polygon points={`${arrX - 0.75},${arrY} ${arrX - 0.35},${arrY - 0.35} ${arrX - 0.35},${arrY + 0.35}`} />
                <rect x={arrX - 0.35} y={arrY - 0.1} width={0.7} height={0.2} rx={0.05} />
                <polygon points={`${arrX + 0.75},${arrY} ${arrX + 0.35},${arrY - 0.35} ${arrX + 0.35},${arrY + 0.35}`} />
              </g>
            );
          })}
        </g>
      )}

      {/* Machine name label – centered inside the rect, clipped to bounds */}
      {isStrawManure ? (
        <g clipPath={`url(#${clipId})`} style={{ pointerEvents: "none", userSelect: "none" }}>
          <text x={x + machineWidth / 2} y={y + machineHeight * 0.26} textAnchor="middle" fontSize={0.34} fontWeight={600} fill={textColor}>
            Straw
          </text>
          <text x={x + machineWidth / 2} y={y + machineHeight * 0.44} textAnchor="middle" fontSize={0.32} fontWeight={600} fill={textColor}>
            +
          </text>
          <text x={x + machineWidth / 2} y={y + machineHeight * 0.62} textAnchor="middle" fontSize={0.30} fontWeight={600} fill={textColor}>
            Chicken manure
          </text>
          <text x={x + machineWidth / 2} y={y + machineHeight * 0.80} textAnchor="middle" fontSize={0.30} fontWeight={600} fill={textColor}>
            Inventory
          </text>
        </g>
      ) : isPath ? (
        <g clipPath={`url(#${clipId})`} style={{ pointerEvents: "none", userSelect: "none" }}>
          <rect
            x={x + machineWidth / 2 - 1.2}
            y={y + machineHeight / 2 - 0.45}
            width={2.4}
            height={0.9}
            rx={0.2}
            fill="#86efac"
          />
          <text
            x={x + machineWidth / 2}
            y={y + machineHeight / 2 + 0.08}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={0.42}
            fontWeight={700}
            fill="#064e3b"
          >
            Path
          </text>
        </g>
      ) : (
        <text
          x={x + machineWidth / 2}
          y={y + machineHeight / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={fontSize}
          fontWeight={600}
          fill={textColor}
          clipPath={`url(#${clipId})`}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {displayName}
        </text>
      )}

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

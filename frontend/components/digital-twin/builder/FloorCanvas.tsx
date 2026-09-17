"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useFactoryBuilder } from "@/lib/factory-builder-context";
import { ConnectionDrawer } from "./ConnectionDrawer";
import type { FloorDimensions, GridPosition, UnitSystem } from "@/lib/spatial-types";


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FloorCanvasProps {
  children?: ReactNode;
  /** Callback fired when user drag-selects an area for a machine in edit mode */
  onAreaSelected?: (position: GridPosition, size: { width: number; height: number }) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Padding (in grid units) around the floor for axis labels */
const AXIS_PADDING = 3;

/** Stroke color for grid lines */
const GRID_LINE_COLOR = "#d1d5db"; // Tailwind gray-300

/** Stroke color for axis labels */
const AXIS_LABEL_COLOR = "#6b7280"; // Tailwind gray-500

/** Font size for axis labels (in SVG user units) */
const AXIS_FONT_SIZE = 0.8;

/** Minimum viewBox size (zoom in limit: 1 cell visible) */
const MIN_VIEWPORT_CELLS = 1;

/** Colors for cell hover highlighting */
const HOVER_COLOR_UNOCCUPIED = "rgba(59, 130, 246, 0.25)"; // Blue
const HOVER_COLOR_OCCUPIED = "rgba(239, 68, 68, 0.35)"; // Red
const FLASH_COLOR_OCCUPIED = "rgba(239, 68, 68, 0.6)"; // Brighter red for flash

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Computes the axis label interval based on the current viewport width.
 * Labels appear at intervals of no more than 10 cells.
 * As the user zooms in, labels become more frequent (down to every 1 cell).
 */
function computeLabelInterval(viewportWidth: number): number {
  if (viewportWidth <= 10) return 1;
  if (viewportWidth <= 20) return 2;
  if (viewportWidth <= 50) return 5;
  return 10;
}

/**
 * Returns the unit abbreviation for display.
 */
function unitAbbreviation(unit: UnitSystem): string {
  return unit === "feet" ? "ft" : "m";
}

// ---------------------------------------------------------------------------
// GridLayer – renders virtual grid lines within the visible viewport
// ---------------------------------------------------------------------------

interface GridLayerProps {
  floor: FloorDimensions;
  viewBox: ViewBox;
}

function GridLayer({ floor, viewBox }: GridLayerProps) {
  // Compute visible range (clamped to floor bounds)
  const startX = Math.max(0, Math.floor(viewBox.x));
  const endX = Math.min(floor.width, Math.ceil(viewBox.x + viewBox.width));
  const startY = Math.max(0, Math.floor(viewBox.y));
  const endY = Math.min(floor.height, Math.ceil(viewBox.y + viewBox.height));

  const labelInterval = computeLabelInterval(viewBox.width);

  // Generate vertical grid lines within visible range
  const verticalLines: ReactNode[] = [];
  for (let x = startX; x <= endX; x++) {
    verticalLines.push(
      <line
        key={`v-${x}`}
        x1={x}
        y1={startY}
        x2={x}
        y2={endY}
        stroke={GRID_LINE_COLOR}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  // Generate horizontal grid lines within visible range
  const horizontalLines: ReactNode[] = [];
  for (let y = startY; y <= endY; y++) {
    horizontalLines.push(
      <line
        key={`h-${y}`}
        x1={startX}
        y1={y}
        x2={endX}
        y2={y}
        stroke={GRID_LINE_COLOR}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  // Generate X-axis labels (along the top)
  const xLabels: ReactNode[] = [];
  for (let x = startX; x <= endX; x++) {
    if (x % labelInterval === 0) {
      xLabels.push(
        <text
          key={`xl-${x}`}
          x={x + 0.5}
          y={-0.5}
          textAnchor="middle"
          fontSize={AXIS_FONT_SIZE * (viewBox.width / 50 + 0.3)}
          fill={AXIS_LABEL_COLOR}
          dominantBaseline="auto"
        >
          {x}
        </text>
      );
    }
  }

  // Generate Y-axis labels (along the left)
  const yLabels: ReactNode[] = [];
  for (let y = startY; y <= endY; y++) {
    if (y % labelInterval === 0) {
      yLabels.push(
        <text
          key={`yl-${y}`}
          x={-0.5}
          y={y + 0.5}
          textAnchor="end"
          fontSize={AXIS_FONT_SIZE * (viewBox.width / 50 + 0.3)}
          fill={AXIS_LABEL_COLOR}
          dominantBaseline="middle"
        >
          {y}
        </text>
      );
    }
  }

  return (
    <g className="grid-layer">
      {/* Floor boundary background */}
      <rect
        x={0}
        y={0}
        width={floor.width}
        height={floor.height}
        fill="#ffffff"
        stroke="#94a3b8"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
      {/* Grid lines */}
      <g className="grid-lines">
        {verticalLines}
        {horizontalLines}
      </g>
      {/* Axis labels */}
      <g className="axis-labels">
        {xLabels}
        {yLabels}
      </g>
    </g>
  );
}

// ---------------------------------------------------------------------------
// InteractionLayer – cursor cell highlighting and click interaction
// ---------------------------------------------------------------------------

interface InteractionLayerProps {
  floor: FloorDimensions;
  viewBox: ViewBox;
  svgRef: React.RefObject<SVGSVGElement | null>;
  isEditMode: boolean;
  /** Called with position and size when user finishes drag-selecting cells */
  onAreaSelected?: (position: GridPosition, size: { width: number; height: number }) => void;
}

function InteractionLayer({ floor, viewBox, svgRef, isEditMode, onAreaSelected }: InteractionLayerProps) {
  const { isPositionOccupied } = useFactoryBuilder();
  const [hoveredCell, setHoveredCell] = useState<GridPosition | null>(null);
  const [flashCell, setFlashCell] = useState<GridPosition | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Right-click drag selection state
  const [dragStart, setDragStart] = useState<GridPosition | null>(null);
  const [dragEnd, setDragEnd] = useState<GridPosition | null>(null);
  const isDraggingRight = useRef(false);

  /**
   * Convert a pointer event's client coordinates to grid cell position.
   * Uses SVG's native getScreenCTM() to correctly handle preserveAspectRatio letterboxing.
   */
  const pointerToGrid = useCallback(
    (clientX: number, clientY: number): GridPosition | null => {
      const svg = svgRef.current;
      if (!svg) return null;

      const ctm = svg.getScreenCTM();
      if (!ctm) return null;

      const inverseCTM = ctm.inverse();
      const svgX = inverseCTM.a * clientX + inverseCTM.c * clientY + inverseCTM.e;
      const svgY = inverseCTM.b * clientX + inverseCTM.d * clientY + inverseCTM.f;

      const cellX = Math.floor(svgX);
      const cellY = Math.floor(svgY);

      // Clamp to floor bounds
      const clampedX = Math.max(0, Math.min(cellX, floor.width - 1));
      const clampedY = Math.max(0, Math.min(cellY, floor.height - 1));

      return { x: clampedX, y: clampedY };
    },
    [svgRef, floor.width, floor.height]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isEditMode) {
        setHoveredCell(null);
        return;
      }
      const cell = pointerToGrid(e.clientX, e.clientY);
      setHoveredCell(cell);

      // Update drag selection end while right-dragging
      if (isDraggingRight.current && cell) {
        setDragEnd(cell);
      }
    },
    [isEditMode, pointerToGrid]
  );

  const handlePointerLeave = useCallback(() => {
    setHoveredCell(null);
  }, []);

  // Right-button down: start drag selection
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isEditMode) return;
      if (e.button !== 2) return; // Only right button

      const cell = pointerToGrid(e.clientX, e.clientY);
      if (!cell) return;

      // Check if clicking on an occupied cell (for edit — single right-click on machine)
      if (isPositionOccupied(cell)) {
        // Don't start drag on occupied cells — let machine node handle it
        return;
      }

      e.preventDefault();
      isDraggingRight.current = true;
      setDragStart(cell);
      setDragEnd(cell);
    },
    [isEditMode, pointerToGrid, isPositionOccupied]
  );

  // Right-button up: finish selection
  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRight.current) return;
      if (e.button !== 2) return;

      isDraggingRight.current = false;

      if (dragStart && dragEnd && onAreaSelected) {
        // Compute top-left corner and size from start/end
        const minX = Math.min(dragStart.x, dragEnd.x);
        const minY = Math.min(dragStart.y, dragEnd.y);
        const maxX = Math.max(dragStart.x, dragEnd.x);
        const maxY = Math.max(dragStart.y, dragEnd.y);
        const width = maxX - minX + 1;
        const height = maxY - minY + 1;

        onAreaSelected({ x: minX, y: minY }, { width, height });
      }

      setDragStart(null);
      setDragEnd(null);
    },
    [dragStart, dragEnd, onAreaSelected]
  );

  // Prevent default context menu on right-click in the interaction layer
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
    },
    []
  );

  if (!isEditMode) return null;

  // Compute selection rectangle from drag
  let selectionRect: { x: number; y: number; width: number; height: number } | null = null;
  if (dragStart && dragEnd) {
    const minX = Math.min(dragStart.x, dragEnd.x);
    const minY = Math.min(dragStart.y, dragEnd.y);
    const maxX = Math.max(dragStart.x, dragEnd.x);
    const maxY = Math.max(dragStart.y, dragEnd.y);
    selectionRect = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  }

  // Determine highlight color for hovered cell
  let hoverFill: string | null = null;
  if (hoveredCell && !isDraggingRight.current) {
    hoverFill = isPositionOccupied(hoveredCell) ? HOVER_COLOR_OCCUPIED : HOVER_COLOR_UNOCCUPIED;
  }

  return (
    <g
      className="interaction-layer"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onContextMenu={handleContextMenu}
      style={{ pointerEvents: "all" }}
    >
      {/* Transparent overlay to capture pointer events across the floor */}
      <rect
        x={0}
        y={0}
        width={floor.width}
        height={floor.height}
        fill="transparent"
      />

      {/* Hover highlight (single cell, only when not dragging) */}
      {hoveredCell && hoverFill && !isDraggingRight.current && (
        <rect
          x={hoveredCell.x}
          y={hoveredCell.y}
          width={1}
          height={1}
          fill={hoverFill}
          stroke={isPositionOccupied(hoveredCell) ? "#ef4444" : "#3b82f6"}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          rx={0.05}
          style={{ pointerEvents: "none", transition: "fill 0.1s ease" }}
        />
      )}

      {/* Drag selection rectangle */}
      {selectionRect && (
        <rect
          x={selectionRect.x}
          y={selectionRect.y}
          width={selectionRect.width}
          height={selectionRect.height}
          fill="rgba(59, 130, 246, 0.2)"
          stroke="#2563eb"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeDasharray="4 2"
          rx={0.1}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Flash indicator for occupied cell click */}
      {flashCell && (
        <rect
          x={flashCell.x}
          y={flashCell.y}
          width={1}
          height={1}
          fill={FLASH_COLOR_OCCUPIED}
          stroke="#dc2626"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          rx={0.05}
          style={{ pointerEvents: "none" }}
        >
          <animate
            attributeName="opacity"
            values="1;0"
            dur="0.4s"
            fill="freeze"
          />
        </rect>
      )}
    </g>
  );
}

/**
 * Convert screen client coordinates to exact SVG user-space coordinates
 * using the SVG element's current transformation matrix (CTM).
 * Accurately accounts for preserveAspectRatio letterboxing and scaling.
 */
function screenToSvgCoords(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  fallbackVb?: ViewBox
): { x: number; y: number } {
  try {
    const ctm = svg.getScreenCTM();
    if (ctm) {
      const inv = ctm.inverse();
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const transformed = pt.matrixTransform(inv);
      if (Number.isFinite(transformed.x) && Number.isFinite(transformed.y)) {
        return { x: transformed.x, y: transformed.y };
      }
    }
  } catch {
    // Fallback below
  }
  if (fallbackVb) {
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / (rect.width || 1)) * fallbackVb.width + fallbackVb.x,
      y: ((clientY - rect.top) / (rect.height || 1)) * fallbackVb.height + fallbackVb.y,
    };
  }
  return { x: 0, y: 0 };
}

// ---------------------------------------------------------------------------
// FloorCanvas – main SVG component
// ---------------------------------------------------------------------------

export function FloorCanvas({ children, onAreaSelected }: FloorCanvasProps) {
  const { state } = useFactoryBuilder();
  const { floor } = state.layout;

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Viewbox state – initialized to show the full floor.
  // We track the floor dimensions the viewBox was computed from so we can
  // reset when they change without needing a ref or effect.
  const [viewBoxState, setViewBoxState] = useState<{
    viewBox: ViewBox;
    forFloor: { w: number; h: number };
  }>(() => ({
    viewBox: {
      x: -AXIS_PADDING,
      y: -AXIS_PADDING,
      width: floor.width + AXIS_PADDING * 2,
      height: floor.height + AXIS_PADDING * 2,
    },
    forFloor: { w: floor.width, h: floor.height },
  }));

  // Derive viewBox – if floor dimensions changed, reset to full-floor view.
  let viewBox: ViewBox;
  if (
    floor.width > 0 &&
    floor.height > 0 &&
    (viewBoxState.forFloor.w !== floor.width || viewBoxState.forFloor.h !== floor.height)
  ) {
    viewBox = {
      x: -AXIS_PADDING,
      y: -AXIS_PADDING,
      width: floor.width + AXIS_PADDING * 2,
      height: floor.height + AXIS_PADDING * 2,
    };
    // This is a conditional setState during render — React handles it correctly
    // by scheduling a re-render before committing.
    setViewBoxState({ viewBox, forFloor: { w: floor.width, h: floor.height } });
  } else {
    viewBox = viewBoxState.viewBox;
  }

  const setViewBox = useCallback(
    (vb: ViewBox) => {
      setViewBoxState((prev) => ({ ...prev, viewBox: vb }));
    },
    []
  );

  // Track pointer state for panning
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ screenX: number; screenY: number; vbX: number; vbY: number }>({
    screenX: 0,
    screenY: 0,
    vbX: 0,
    vbY: 0,
  });

  // Clamp viewBox to floor boundaries (symmetric center-based allowance prevents corner sticking)
  const clampViewBox = useCallback(
    (vb: ViewBox): ViewBox => {
      const baseWidth = floor.width + AXIS_PADDING * 2;
      const baseHeight = floor.height + AXIS_PADDING * 2;
      const minWidth = MIN_VIEWPORT_CELLS;
      const maxWidth = baseWidth * 3.5;

      const width = Math.max(minWidth, Math.min(vb.width, maxWidth));
      const aspectRatio = baseHeight / baseWidth;
      const height = width * aspectRatio;

      const centerX = floor.width / 2;
      const centerY = floor.height / 2;

      // Allowance ensures user can navigate across all sides of the floor without inverting bounds
      const allowanceX = Math.max(floor.width * 1.2, width * 0.85);
      const allowanceY = Math.max(floor.height * 1.2, height * 0.85);

      const minX = centerX - allowanceX - width / 2;
      const maxX = centerX + allowanceX - width / 2;
      const minY = centerY - allowanceY - height / 2;
      const maxY = centerY + allowanceY - height / 2;

      const x = Math.max(minX, Math.min(maxX, vb.x));
      const y = Math.max(minY, Math.min(maxY, vb.y));

      return { x, y, width, height };
    },
    [floor.width, floor.height]
  );

  // Zoom handler — attached as native event to bypass React's passive wheel listener
  const viewBoxRef = useRef(viewBox);
  viewBoxRef.current = viewBox;
  const clampViewBoxRef = useRef(clampViewBox);
  clampViewBoxRef.current = clampViewBox;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault(); // Actually prevents page scroll (non-passive)
      e.stopPropagation();

      const vb = viewBoxRef.current;

      // Pinch-to-zoom on trackpad sends ctrlKey + small deltaY
      const isPinch = e.ctrlKey;
      const zoomFactor = isPinch
        ? (e.deltaY > 0 ? 1.05 : 0.95)
        : (e.deltaY > 0 ? 1.15 : 0.87);

      // Get exact cursor position in SVG coordinates via CTM
      const coords = screenToSvgCoords(svg, e.clientX, e.clientY, vb);
      const cursorX = coords.x;
      const cursorY = coords.y;

      const baseWidth = floor.width + AXIS_PADDING * 2;
      const minWidth = MIN_VIEWPORT_CELLS;
      const maxWidth = baseWidth * 3.5;

      const targetWidth = vb.width * zoomFactor;
      const newWidth = Math.max(minWidth, Math.min(targetWidth, maxWidth));
      const actualFactor = newWidth / vb.width;
      const newHeight = vb.height * actualFactor;

      const newX = cursorX - (cursorX - vb.x) * actualFactor;
      const newY = cursorY - (cursorY - vb.y) * actualFactor;

      setViewBox(
        clampViewBoxRef.current({
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight,
        })
      );
    };

    // { passive: false } is critical — allows preventDefault() to stop page scroll
    svg.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleNativeWheel);
  }, [setViewBox, floor.width]);

  // Pan handlers — LEFT click or MIDDLE click drag to pan
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.button === 0 || e.button === 1) {
        setIsPanning(true);
        panStart.current = {
          screenX: e.clientX,
          screenY: e.clientY,
          vbX: viewBoxRef.current.x,
          vbY: viewBoxRef.current.y,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!isPanning) return;
      const svg = svgRef.current;
      if (!svg) return;

      const dxPixels = e.clientX - panStart.current.screenX;
      const dyPixels = e.clientY - panStart.current.screenY;

      // 1:1 pixel tracking using SVG CTM scale
      const ctm = svg.getScreenCTM();
      let scaleX = viewBoxRef.current.width / (svg.clientWidth || 1);
      let scaleY = viewBoxRef.current.height / (svg.clientHeight || 1);

      if (ctm && ctm.a !== 0 && ctm.d !== 0) {
        scaleX = 1 / Math.abs(ctm.a);
        scaleY = 1 / Math.abs(ctm.d);
      }

      const dxSvg = dxPixels * scaleX;
      const dySvg = dyPixels * scaleY;

      setViewBox(
        clampViewBoxRef.current({
          ...viewBoxRef.current,
          x: panStart.current.vbX - dxSvg,
          y: panStart.current.vbY - dySvg,
        })
      );
    },
    [isPanning, setViewBox]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    setIsPanning(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

  // Fullscreen toggle
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Zoom controls for on-screen toolbar
  const handleZoomIn = useCallback(() => {
    const vb = viewBoxRef.current;
    const factor = 0.8;
    const centerX = vb.x + vb.width / 2;
    const centerY = vb.y + vb.height / 2;
    const baseWidth = floor.width + AXIS_PADDING * 2;
    const newWidth = Math.max(MIN_VIEWPORT_CELLS, Math.min(vb.width * factor, baseWidth * 3.5));
    const actualFactor = newWidth / vb.width;
    const newHeight = vb.height * actualFactor;
    setViewBox(
      clampViewBoxRef.current({
        x: centerX - newWidth / 2,
        y: centerY - newHeight / 2,
        width: newWidth,
        height: newHeight,
      })
    );
  }, [floor.width, setViewBox]);

  const handleZoomOut = useCallback(() => {
    const vb = viewBoxRef.current;
    const factor = 1.25;
    const centerX = vb.x + vb.width / 2;
    const centerY = vb.y + vb.height / 2;
    const baseWidth = floor.width + AXIS_PADDING * 2;
    const newWidth = Math.max(MIN_VIEWPORT_CELLS, Math.min(vb.width * factor, baseWidth * 3.5));
    const actualFactor = newWidth / vb.width;
    const newHeight = vb.height * actualFactor;
    setViewBox(
      clampViewBoxRef.current({
        x: centerX - newWidth / 2,
        y: centerY - newHeight / 2,
        width: newWidth,
        height: newHeight,
      })
    );
  }, [floor.width, setViewBox]);

  const handleResetZoom = useCallback(() => {
    const baseWidth = floor.width + AXIS_PADDING * 2;
    const baseHeight = floor.height + AXIS_PADDING * 2;
    setViewBox({
      x: -AXIS_PADDING,
      y: -AXIS_PADDING,
      width: baseWidth,
      height: baseHeight,
    });
  }, [floor.width, floor.height, setViewBox]);

  const baseFloorWidth = floor.width + AXIS_PADDING * 2;
  const zoomPercentage = Math.round((baseFloorWidth / viewBox.width) * 100);

  // Computed values
  const viewBoxString = `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;
  const unitLabel = unitAbbreviation(floor.unit);

  // Edit mode is active when: the layout is being edited (existing or new/dirty)
  // and the builder mode is idle (i.e., not mid-connection or mid-configuration)
  const isEditMode =
    state.mode === "idle" && (state.isEditingExisting || state.isDirty);

  // Don't render if floor isn't set up
  if (floor.width === 0 || floor.height === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className="flex flex-col h-full w-full bg-white">
      {/* Header: total floor dimensions */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white">
        <span className="text-sm font-medium text-gray-700">
          Floor: {floor.width} × {floor.height} {unitLabel}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleFullscreen}
            className="icon-button"
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <span className="text-xs text-gray-500">
            {floor.unit === "meters" ? "Metric" : "Imperial"}
          </span>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="flex-1 relative overflow-hidden bg-gray-50">
        <svg
          ref={svgRef}
          className="absolute inset-0 w-full h-full select-none"
          viewBox={viewBoxString}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onContextMenu={(e) => {
            e.preventDefault();
          }}
          style={{ cursor: isPanning ? "grabbing" : "grab", touchAction: "none" }}
        >
          {/* Grid layer (virtualized – only renders visible cells) */}
          <GridLayer floor={floor} viewBox={viewBox} />

          {/* Interaction layer: cursor highlighting and drag-select (edit mode) */}
          <InteractionLayer
            floor={floor}
            viewBox={viewBox}
            svgRef={svgRef}
            isEditMode={isEditMode}
            onAreaSelected={onAreaSelected}
          />

          {/* Connection drawer: provisional line during connection drag (Req 8.1, 8.2) */}
          <ConnectionDrawer svgRef={svgRef} viewBox={viewBox} />

          {/* Child layers: machine nodes, connections, etc. */}
          {children}
        </svg>

        {/* Floating Zoom Controls */}
        <div className="absolute bottom-4 right-4 flex items-center bg-white/95 backdrop-blur-md shadow-md border border-gray-200 rounded-lg p-1 gap-1 z-20 text-gray-700">
          <button
            type="button"
            onClick={handleZoomOut}
            className="p-2 sm:p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center hover:bg-gray-100 rounded text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
            title="Zoom Out (or scroll down)"
            aria-label="Zoom Out"
          >
            <ZoomOut size={16} />
          </button>
          <button
            type="button"
            onClick={handleResetZoom}
            className="px-2.5 py-1.5 sm:py-1 min-h-[36px] flex items-center justify-center text-xs font-semibold tabular-nums hover:bg-gray-100 rounded text-gray-700 min-w-[3.2rem] text-center cursor-pointer"
            title="Reset Zoom to 100%"
          >
            {zoomPercentage}%
          </button>
          <button
            type="button"
            onClick={handleZoomIn}
            className="p-2 sm:p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center hover:bg-gray-100 rounded text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
            title="Zoom In (or scroll up)"
            aria-label="Zoom In"
          >
            <ZoomIn size={16} />
          </button>
          <div className="h-4 w-px bg-gray-200 mx-0.5" />
          <button
            type="button"
            onClick={handleResetZoom}
            className="p-2 sm:p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center hover:bg-gray-100 rounded text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
            title="Fit to Screen"
            aria-label="Fit to Screen"
          >
            <RotateCcw size={15} />
          </button>
        </div>

        {/* Mini Navigation Hint */}
        <div className="hidden sm:block absolute bottom-4 left-4 pointer-events-none text-xs text-gray-500 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded border border-gray-200 shadow-xs select-none">
          Click machine for details • Scroll to zoom • Drag to pan • Right-click drag to place
        </div>
      </div>
    </div>
  );
}

export default FloorCanvas;

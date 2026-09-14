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
      {/* Grid lines */}
      <g className="grid-lines">
        {verticalLines}
        {horizontalLines}
      </g>
      {/* Floor boundary */}
      <rect
        x={0}
        y={0}
        width={floor.width}
        height={floor.height}
        fill="none"
        stroke="#9ca3af"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
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
  const panStart = useRef<{ x: number; y: number; vbX: number; vbY: number }>({
    x: 0,
    y: 0,
    vbX: 0,
    vbY: 0,
  });

  // Clamp viewBox to floor boundaries (with axis padding allowance and zoom-out margin)
  const clampViewBox = useCallback(
    (vb: ViewBox): ViewBox => {
      const baseWidth = floor.width + AXIS_PADDING * 2;
      const baseHeight = floor.height + AXIS_PADDING * 2;
      const maxWidth = baseWidth * 2.5;
      const maxHeight = baseHeight * 2.5;

      const width = Math.max(MIN_VIEWPORT_CELLS, Math.min(vb.width, maxWidth));
      const height = Math.max(MIN_VIEWPORT_CELLS, Math.min(vb.height, maxHeight));

      const marginX = floor.width * 0.5;
      const marginY = floor.height * 0.5;
      const minX = -AXIS_PADDING - marginX;
      const minY = -AXIS_PADDING - marginY;
      const maxX = floor.width + AXIS_PADDING + marginX - width;
      const maxY = floor.height + AXIS_PADDING + marginY - height;

      const x = Math.max(Math.min(minX, maxX), Math.min(Math.max(minX, maxX), vb.x));
      const y = Math.max(Math.min(minY, maxY), Math.min(Math.max(minY, maxY), vb.y));

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
        ? (e.deltaY > 0 ? 1.05 : 0.95) // Finer zoom for pinch
        : (e.deltaY > 0 ? 1.1 : 0.9);

      // Get cursor position in SVG coordinates
      const rect = svg.getBoundingClientRect();
      const cursorX = ((e.clientX - rect.left) / rect.width) * vb.width + vb.x;
      const cursorY = ((e.clientY - rect.top) / rect.height) * vb.height + vb.y;

      const newWidth = vb.width * zoomFactor;
      const newHeight = vb.height * zoomFactor;

      const newX = cursorX - (cursorX - vb.x) * zoomFactor;
      const newY = cursorY - (cursorY - vb.y) * zoomFactor;

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
  }, [setViewBox]);

  // Pan handlers — LEFT click drag to pan (no threshold needed since placement uses right click)
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      // Middle mouse button: always pan
      if (e.button === 1) {
        e.preventDefault();
        setIsPanning(true);
        panStart.current = { x: e.clientX, y: e.clientY, vbX: viewBox.x, vbY: viewBox.y };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
      // Left click: always pan (placement is on right click now)
      if (e.button === 0) {
        setIsPanning(true);
        panStart.current = { x: e.clientX, y: e.clientY, vbX: viewBox.x, vbY: viewBox.y };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    },
    [viewBox.x, viewBox.y]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!isPanning) return;
      const svg = svgRef.current;
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      const dx = ((e.clientX - panStart.current.x) / rect.width) * viewBox.width;
      const dy = ((e.clientY - panStart.current.y) / rect.height) * viewBox.height;

      setViewBox(
        clampViewBox({
          ...viewBox,
          x: panStart.current.vbX - dx,
          y: panStart.current.vbY - dy,
        })
      );
    },
    [isPanning, viewBox, clampViewBox, setViewBox]
  );

  const handlePointerUp = useCallback(() => {
    setIsPanning(false);
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
    const newWidth = vb.width * factor;
    const newHeight = vb.height * factor;
    setViewBox(
      clampViewBoxRef.current({
        x: centerX - newWidth / 2,
        y: centerY - newHeight / 2,
        width: newWidth,
        height: newHeight,
      })
    );
  }, [setViewBox]);

  const handleZoomOut = useCallback(() => {
    const vb = viewBoxRef.current;
    const factor = 1.25;
    const centerX = vb.x + vb.width / 2;
    const centerY = vb.y + vb.height / 2;
    const newWidth = vb.width * factor;
    const newHeight = vb.height * factor;
    setViewBox(
      clampViewBoxRef.current({
        x: centerX - newWidth / 2,
        y: centerY - newHeight / 2,
        width: newWidth,
        height: newHeight,
      })
    );
  }, [setViewBox]);

  const handleResetZoom = useCallback(() => {
    setViewBox({
      x: -AXIS_PADDING,
      y: -AXIS_PADDING,
      width: floor.width + AXIS_PADDING * 2,
      height: floor.height + AXIS_PADDING * 2,
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
          onContextMenu={(e) => { /* Let child handlers (interaction layer, machines) handle right-click */ }}
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
          Scroll to zoom • Drag to pan • Right-click drag to place machine
        </div>
      </div>
    </div>
  );
}

export default FloorCanvas;

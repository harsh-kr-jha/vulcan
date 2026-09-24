"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Factory, Layers3, Loader2, MapPinOff, Maximize2, Minimize2, Pencil, Save, Workflow, X } from "lucide-react";
import { useFactory } from "@/lib/factory-context";
import { useFactoryBuilder } from "@/lib/factory-builder-context";
import type {
  FactoryLayout,
  GridPosition,
  MachineNode,
} from "@/lib/spatial-types";
import { deserializeLayout, type LayoutApiPayload } from "@/lib/spatial-api";
import { api } from "@/lib/api-client";
import type { LiveMachineCurrent, LiveMachineSummary } from "@/lib/factory-domain";

import { FloorCanvas } from "./FloorCanvas";
import { MachineNodeLayer } from "./MachineNodeLayer";
import { ConnectionLineLayer } from "./ConnectionLineLayer";
import { FactoryBuilderDialog } from "./FactoryBuilderDialog";
import { SpatialVisualization } from "./SpatialVisualization";
import { InventoryPanel } from "./InventoryPanel";
import { DispatchPanel } from "./DispatchPanel";
import { MachineConfigPanel } from "./MachineConfigPanel";
import { ConnectionConfigPanel } from "./ConnectionConfigPanel";
import { MachineAnalyticsPanel } from "./MachineAnalyticsPanel";
import { ProductionStructureManager } from "@/components/factory-settings";
import { ZoneLayer } from "./ZoneLayer";
import { SpatialSettingsPanel } from "./SpatialSettingsPanel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PageMode = "loading" | "empty" | "viewing" | "editing";

interface LegacyLayoutApiPayload {
  id: string;
  factory: string;
  floor_width: number;
  floor_height: number;
  unit_system: string;
  machines: Array<{
    id: string;
    code?: string;
    process_id?: string | null;
    name: string;
    position_x: number;
    position_y: number;
    size_width?: number;
    size_height?: number;
    inputs: Array<{ id: string; label: string; unitType: string }>;
    outputs: Array<{ id: string; label: string; unitType: string }>;
    parameters: Array<{
      id: string;
      key: string;
      data_type: string;
      options: string[];
      required: boolean;
      order: number;
      label?: string; unit?: string; semantic?: string; origin?: "manual" | "stream";
      source_field_id?: string; source_schema_version?: string; is_active?: boolean;
    }>;
    custom_kpis: Array<{
      id: string;
      name: string;
      display_unit: string;
      formula: { operations: Array<{ operator: string; parameterKey: string }> };
      is_enabled?: boolean; disabled_reason?: string;
    }>;
    stream_binding?: {
      id: string; stream_id: string; channel_id: string; channel_name: string;
      status: string; last_received_at?: string | null; last_error?: string;
    } | null;
    status?: string;
  }>;
  unplaced_machines?: LayoutApiPayload["machines"];
  connections: Array<{
    id: string;
    source: string;
    target: string;
    name?: string;
    description?: string;
    material_type?: string;
    quantity_per_cycle?: number;
    input_spec?: string;
    output_spec?: string;
  }>;
  inventory_config?: {
    storage_capacity: number;
    capacity_unit: string;
    materials: Array<{ id: string; name: string; unit: string; quantity: number }>;
  };
  dispatch_config?: {
    products: Array<{ id: string; name: string; unit: string }>;
  };
  saved_at?: string;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const API_SPATIAL = "/api/backend/api/spatial";

function legacyDeserializeLayout(payload: LegacyLayoutApiPayload): FactoryLayout {
  return {
    id: payload.id,
    factoryId: payload.factory,
    floor: {
      width: payload.floor_width,
      height: payload.floor_height,
      unit: payload.unit_system as "feet" | "meters",
    },
    zones: [],
    machines: payload.machines.map((m) => ({
      id: m.id,
      code: m.code,
      processId: m.process_id,
      name: m.name,
      position: { x: m.position_x, y: m.position_y },
      size: (m.size_width && m.size_height && (m.size_width > 1 || m.size_height > 1))
        ? { width: m.size_width, height: m.size_height }
        : undefined,
      inputs: m.inputs,
      outputs: m.outputs,
      parameters: m.parameters.map((p) => ({
        id: p.id,
        key: p.key,
        dataType: p.data_type as "number" | "text" | "boolean" | "date" | "selection",
        options: p.options,
        required: p.required,
        order: p.order,
        label: p.label, unit: p.unit, semantic: p.semantic, origin: p.origin,
        sourceFieldId: p.source_field_id, sourceSchemaVersion: p.source_schema_version,
        active: p.is_active,
      })),
      customKpis: m.custom_kpis.map((k) => ({
        id: k.id,
        name: k.name,
        displayUnit: k.display_unit,
        formula: k.formula as {
          operations: Array<{
            operator: "add" | "subtract" | "multiply" | "divide";
            parameterKey: string;
          }>;
        },
        isEnabled: k.is_enabled,
        disabledReason: k.disabled_reason,
      })),
      dataStreamId: m.stream_binding?.stream_id,
      dataStreamChannelId: m.stream_binding?.channel_id,
      streamBinding: m.stream_binding ? {
        id: m.stream_binding.id, streamId: m.stream_binding.stream_id,
        channelId: m.stream_binding.channel_id, channelName: m.stream_binding.channel_name,
        status: m.stream_binding.status, lastReceivedAt: m.stream_binding.last_received_at,
        lastError: m.stream_binding.last_error,
      } : null,
      status: m.status as
        | "running"
        | "warning"
        | "down"
        | "idle"
        | "no_data"
        | undefined,
    })),
    connections: payload.connections.map((c) => ({
      id: c.id,
      sourceId: c.source,
      targetId: c.target,
      name: c.name,
      description: c.description,
      materialType: c.material_type,
      quantityPerCycle: c.quantity_per_cycle,
      inputSpec: c.input_spec,
      outputSpec: c.output_spec,
    })),
    inventory: payload.inventory_config
      ? {
          storageCapacity: payload.inventory_config.storage_capacity,
          capacityUnit: payload.inventory_config.capacity_unit as
            | "kilograms"
            | "litres"
            | "meters"
            | "units",
          materials: payload.inventory_config.materials.map((m) => ({
            id: m.id,
            name: m.name,
            unit: m.unit as "kilograms" | "litres" | "meters" | "units",
            quantity: m.quantity,
          })),
        }
      : undefined,
    dispatch: payload.dispatch_config
      ? {
          products: payload.dispatch_config.products.map((p) => ({
            id: p.id,
            name: p.name,
            unit: p.unit as "meters" | "litres" | "units" | "kilograms",
            awaitingQuantity: 0,
          })),
        }
      : undefined,
    savedAt: payload.saved_at,
  };
}

// ---------------------------------------------------------------------------
// FactoryTwinPage – Top-level orchestrator component
// ---------------------------------------------------------------------------

/**
 * Top-level orchestrator for the Digital Twin page.
 *
 * State logic:
 * - loading: Fetching layout from API on mount
 * - empty: No saved layout exists -> show "Build Factory" button
 * - viewing: Saved layout loaded -> show FactoryVisualization
 * - editing: Builder mode (new or re-entry) -> show FloorCanvas + layers
 *
 * Requirements: 1.1, 1.4, 6.1, 9.3, 9.5, 11.1, 12.1, 13.1, 13.2, 13.3, 13.4, 13.7
 */
export function FactoryTwinPage() {
  const { state: factoryState, filters, hydrated } = useFactory();
  const {
    state: builderState,
    loadLayout,
    saveLayout,
    cancelEdit,
    enterEditMode,
    placeMachine,
    configureZones,
    restoreDraft,
    saving,
    saveError,
  } = useFactoryBuilder();

  // Page-level state
  const [pageMode, setPageMode] = useState<PageMode>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showBuilderDialog, setShowBuilderDialog] = useState(false);
  const [isImmersive, setIsImmersive] = useState(false);
  const [showStructure, setShowStructure] = useState(false);
  const [showSpatialSettings, setShowSpatialSettings] = useState(false);
  const [placementTarget, setPlacementTarget] = useState<"machine" | "zone">("machine");
  const [unplacedMachines, setUnplacedMachines] = useState<LayoutApiPayload["machines"]>([]);

  // Panel state
  const [configMachineId, setConfigMachineId] = useState<string | null>(null);
  const [configMachineIsNew, setConfigMachineIsNew] = useState(false);
  const [configConnectionId, setConfigConnectionId] = useState<string | null>(
    null
  );
  const [analyticsMachineId, setAnalyticsMachineId] = useState<string | null>(null);
  const [analyticsDetailsOpen, setAnalyticsDetailsOpen] = useState(false);


  // Statuses poll as one factory summary; detailed observations load on selection.
  const machineObservations: Record<string, { values: Record<string, unknown>; submittedAt?: string }> = {};
  const [liveMachines, setLiveMachines] = useState<LiveMachineSummary[]>([]);
  const [liveCurrent, setLiveCurrent] = useState<LiveMachineCurrent | null>(null);

  // Get the active factory ID
  const factoryId =
    filters.factoryId || factoryState.activeFactoryId;

  // -------------------------------------------------------------------------
  // Load layout on mount (Task 13.2)
  // -------------------------------------------------------------------------

  // Use a ref for loadLayout to avoid it being a dependency that causes re-fetches
  const loadLayoutRef = useRef(loadLayout);
  useEffect(() => { loadLayoutRef.current = loadLayout; }, [loadLayout]);

  // Use a ref for restoreDraft to avoid re-fetch dependency
  const restoreDraftRef = useRef(restoreDraft);
  useEffect(() => { restoreDraftRef.current = restoreDraft; }, [restoreDraft]);

  // Track whether we've already fetched to prevent infinite re-triggers
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    // Don't fetch until the factory context has hydrated
    if (!hydrated) return;

    // Already fetched successfully — don't refetch
    if (hasFetchedRef.current) return;

    if (!factoryId) {
      const timer = window.setTimeout(() => setPageMode("empty"), 0);
      return () => window.clearTimeout(timer);
    }

    let cancelled = false;

    async function fetchLayout() {
      setPageMode("loading");
      setLoadError(null);

      try {
        const response = await fetch(
          `${API_SPATIAL}/layouts/?factory=${factoryId}`,
          {
            headers: { Accept: "application/json" },
            credentials: "same-origin",
          }
        );

        if (cancelled) return;

        if (response.status === 404) {
          hasFetchedRef.current = true;
          // Try restoring an unsaved draft from localStorage
          if (restoreDraftRef.current()) {
            setPageMode("editing");
          } else {
            setPageMode("empty");
          }
          return;
        }

        if (!response.ok) {
          throw new Error(`Failed to load layout (${response.status})`);
        }

        const data = await response.json();

        if (cancelled) return;

        // Handle DRF paginated response {count, results: [...]}
        // Also handle: plain array [...] or single object {id, ...}
        let payload: LayoutApiPayload | null = null;

        if (data && typeof data === "object" && "results" in data && Array.isArray(data.results)) {
          payload = data.results.length > 0 ? data.results[0] : null;
        } else if (Array.isArray(data)) {
          payload = data.length > 0 ? data[0] : null;
        } else if (data && data.id) {
          payload = data;
        } else {
          payload = null;
        }

        if (!payload || !payload.id) {
          hasFetchedRef.current = true;
          // Try restoring an unsaved draft from localStorage
          if (restoreDraftRef.current()) {
            setPageMode("editing");
          } else {
            setPageMode("empty");
          }
          return;
        }

        const layout = deserializeLayout(payload);
        setUnplacedMachines(payload.unplaced_machines ?? []);
        loadLayoutRef.current(layout);
        hasFetchedRef.current = true;
        setPageMode("viewing");
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load layout."
        );
        hasFetchedRef.current = true;
        setPageMode("empty");
      }
    }

    void fetchLayout();

    return () => {
      cancelled = true;
    };
  }, [hydrated, factoryId]);

  // -------------------------------------------------------------------------
  // Transition to editing when builder initializes floor (after dialog confirm)
  // -------------------------------------------------------------------------

  useEffect(() => {
    // When builder state gets a floor setup and we're in "empty" mode, go to editing
    if (
      pageMode === "empty" &&
      builderState.layout.floor.width > 0 &&
      builderState.layout.floor.height > 0 &&
      builderState.isDirty
    ) {
      const timer = window.setTimeout(() => setPageMode("editing"), 0);
      return () => window.clearTimeout(timer);
    }
  }, [
    pageMode,
    builderState.layout.floor.width,
    builderState.layout.floor.height,
    builderState.isDirty,
  ]);

  // -------------------------------------------------------------------------
  // Fetch the shared live summary once for the factory; details load on selection.
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (pageMode !== "viewing") return;
    if (!factoryId) return;

    let cancelled = false;

    let timer: number | null = null;
    let consecutiveFailures = 0;

    async function fetchLiveMachines() {
      try {
        const payload = await api.liveDashboard(factoryId, analyticsMachineId);
        if (!cancelled) {
          consecutiveFailures = 0;
          setLiveMachines(payload.machines);
          setLiveCurrent(
            analyticsMachineId && payload.current?.id === analyticsMachineId
              ? payload.current
              : null,
          );
        }
      } catch {
        // Keep the last good state visible during transient failures.
        consecutiveFailures += 1;
      } finally {
        if (!cancelled) {
          // Avoid overlapping requests and back off while the backend is unavailable.
          const delay = Math.min(60_000, 5_000 * 2 ** Math.min(consecutiveFailures, 4));
          timer = window.setTimeout(() => void fetchLiveMachines(), delay);
        }
      }
    }

    void fetchLiveMachines();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [pageMode, factoryId, analyticsMachineId]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  // "Build Factory" button -> open dialog (Req 1.1)
  const handleBuildFactory = useCallback(() => {
    setShowBuilderDialog(true);
  }, []);

  // Dialog close
  const handleDialogClose = useCallback(() => {
    setShowBuilderDialog(false);
  }, []);

  // "Edit Layout" button -> enter edit mode (Req 13.1, 13.3)
  const handleEditLayout = useCallback(() => {
    enterEditMode();
    setPageMode("editing");
  }, [enterEditMode]);

  // Save layout (Task 13.1)
  const handleSave = useCallback(async () => {
    try {
      await saveLayout();
      setPageMode("viewing");
    } catch {
      // Error is managed by builderState.saveError / saveError
    }
  }, [saveLayout]);

  // Cancel edit (Req 13.7)
  const handleCancel = useCallback(() => {
    cancelEdit();
    // If we had a saved layout, go back to viewing; otherwise go to empty
    if (builderState.isEditingExisting) {
      setPageMode("viewing");
    } else {
      setPageMode("empty");
    }
  }, [cancelEdit, builderState.isEditingExisting]);

  // Area selected via right-click drag -> create machine and open config panel
  const handleAreaSelected = useCallback(
    (position: GridPosition, size: { width: number; height: number }) => {
      if (placementTarget === "zone") {
        const nextIndex = builderState.layout.zones.length + 1;
        configureZones([...builderState.layout.zones, { id: crypto.randomUUID(), name: `Zone ${nextIndex}`, type: "operational", color: "#DBEAFE", position, size, displayOrder: nextIndex }]);
        setPlacementTarget("machine");
        setShowSpatialSettings(true);
        return;
      }
      const id = crypto.randomUUID();
      const newMachine: MachineNode = {
        id,
        name: "",
        position,
        size,
        inputs: [],
        outputs: [],
        parameters: [
          {
            id: crypto.randomUUID(),
            key: "active",
            dataType: "boolean",
            required: true,
            order: 0,
          },
        ],
        customKpis: [],
        representation: "block",
        blockColor: "#DBEAFE",
        modelTransform: { elevation: 0, scale: 1, rotationY: 0 },
      };
      placeMachine(newMachine);
      setConfigMachineId(id);
      setConfigMachineIsNew(true);
    },
    [placeMachine, placementTarget, builderState.layout.zones, configureZones]
  );

  // Tap existing machine -> open config panel in edit mode
  const handleMachineSelect = useCallback((machineId: string) => {
    setConfigMachineId(machineId);
    setConfigMachineIsNew(false);
  }, []);

  const handlePlaceUnplaced = useCallback((raw: LayoutApiPayload["machines"][number]) => {
    const occupied = new Set(builderState.layout.machines.map((machine) => `${machine.position.x}:${machine.position.y}`));
    let position = { x: 0, y: 0 };
    outer: for (let y = 0; y < builderState.layout.floor.height; y += 1) {
      for (let x = 0; x < builderState.layout.floor.width; x += 1) {
        if (!occupied.has(`${x}:${y}`)) { position = { x, y }; break outer; }
      }
    }
    const staged = deserializeLayout({
      id: builderState.layout.id,
      factory: builderState.layout.factoryId,
      floor_width: builderState.layout.floor.width,
      floor_height: builderState.layout.floor.height,
      unit_system: builderState.layout.floor.unit,
      machines: [{ ...raw, position_x: position.x, position_y: position.y }],
      connections: [],
    }).machines[0];
    enterEditMode();
    placeMachine(staged);
    setUnplacedMachines((items) => items.filter((item) => item.id !== raw.id));
    setPageMode("editing");
    setConfigMachineId(raw.id);
    setConfigMachineIsNew(false);
  }, [builderState.layout, enterEditMode, placeMachine]);

  // Delete a machine from the grid (handled inside MachineConfigPanel now)

  // Connection completed -> open config panel
  const handleConnectionCompleted = useCallback((connectionId: string) => {
    setConfigConnectionId(connectionId);
  }, []);

  // Machine click in visualization -> open analytics panel
  const handleVisualizationMachineClick = useCallback((machineId: string) => {
    setAnalyticsMachineId(machineId || null);
    setAnalyticsDetailsOpen(false);
  }, []);

  const handleCloseAnalytics = useCallback(() => {
    setAnalyticsMachineId(null);
    setAnalyticsDetailsOpen(false);
  }, []);

  const handleOpenAnalyticsDetails = useCallback(() => {
    setAnalyticsDetailsOpen(true);
  }, []);

  // Close config panels
  const handleCloseMachineConfig = useCallback(() => {
    setConfigMachineId(null);
    setConfigMachineIsNew(false);
  }, []);

  // Auto-save when machine config panel closes on an existing (saved) layout
  const prevConfigMachineIdRef = useRef<string | null>(null);
  useEffect(() => {
    const wasConfigure = prevConfigMachineIdRef.current !== null;
    prevConfigMachineIdRef.current = configMachineId;

    // Panel just closed AND layout is dirty AND it's an existing layout AND not already saving
    if (wasConfigure && configMachineId === null && builderState.isDirty && builderState.layout.id && !saving) {
      saveLayout().catch(() => {
        // Error surfaced via builder context saveError
      });
    }
  }, [configMachineId, builderState.isDirty, builderState.layout.id, saving, saveLayout]);

  const handleCloseConnectionConfig = useCallback(() => {
    setConfigConnectionId(null);
  }, []);

  // Toggle immersive (fullscreen) mode using native Fullscreen API
  const immersiveRef = useRef<HTMLDivElement>(null);

  const toggleImmersive = useCallback(() => {
    if (!document.fullscreenElement) {
      // Enter fullscreen on the container element
      const el = immersiveRef.current;
      if (el) {
        el.requestFullscreen().then(() => setIsImmersive(true)).catch(() => {
          // Fallback: just do CSS fullscreen if API fails
          setIsImmersive(true);
        });
      } else {
        document.documentElement.requestFullscreen().then(() => setIsImmersive(true)).catch(() => {
          setIsImmersive(true);
        });
      }
    } else {
      document.exitFullscreen().then(() => setIsImmersive(false)).catch(() => {
        setIsImmersive(false);
      });
    }
  }, []);

  // Sync state when user exits fullscreen via Escape or browser controls
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsImmersive(false);
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Listen for new connections completed via builder state
  useEffect(() => {
    if (
      builderState.selectedConnectionId &&
      pageMode === "editing" &&
      !configConnectionId
    ) {
      const timer = window.setTimeout(
        () => setConfigConnectionId(builderState.selectedConnectionId),
        0,
      );
      return () => window.clearTimeout(timer);
    }
  }, [builderState.selectedConnectionId, pageMode, configConnectionId]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // Loading state
  if (pageMode === "loading") {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-sm text-gray-500">Loading Lexicon™ layout...</p>
      </div>
    );
  }

  // Empty state: no layout exists (Req 1.1, 13.2)
  if (pageMode === "empty" && builderState.layout.floor.width === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
          <Factory className="h-8 w-8 text-blue-500" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900">
            No Lexicon™ Layout
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Build your Lexicon™ factory map to start placing machines and tracking
            operations.
          </p>
        </div>

        {loadError && (
          <div
            className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
            role="alert"
          >
            {loadError}
          </div>
        )}

        <button
          type="button"
          onClick={handleBuildFactory}
          disabled={!factoryId}
          className="button button-primary"
        >
          Build Lexicon™
        </button>

        {!factoryId && (
          <p className="text-xs text-amber-600">
            Select a factory to get started.
          </p>
        )}

        {showBuilderDialog && (
          <FactoryBuilderDialog
            factoryId={factoryId}
            onClose={handleDialogClose}
          />
        )}
      </div>
    );
  }

  // Visualization mode (Req 9.5, 13.2)
  if (pageMode === "viewing") {
    const viewContent = (
      <div className={`flex flex-col ${isImmersive ? "h-screen" : "h-[calc(100vh-64px)]"}`}>
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
          <h1 className="text-base font-semibold text-gray-900">
            Lexicon™
          </h1>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowStructure(true)} className="button button-secondary"><Workflow className="h-4 w-4" /> Structure</button>
            <button
              type="button"
              onClick={handleEditLayout}
              title="Edit Layout"
              className="icon-button"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={toggleImmersive}
              title={isImmersive ? "Exit Immersive Mode" : "Immersive Edit Mode"}
              className="icon-button"
            >
              {isImmersive ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {unplacedMachines.length > 0 && <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900"><MapPinOff size={15} /><strong>{unplacedMachines.length} imported machine{unplacedMachines.length === 1 ? " is" : "s are"} waiting for placement.</strong>{unplacedMachines.map((machine) => <button key={machine.id} className="rounded-md border border-amber-300 bg-white px-2 py-1 font-semibold" onClick={() => handlePlaceUnplaced(machine)}>Place {machine.name}</button>)}</div>}

        {/* Three-column layout: Inventory | Visualization | Dispatch */}
        <div className="relative flex flex-1 overflow-hidden min-h-0">
          {/* Inventory Panel (left) */}
          <aside className="w-72 shrink-0 border-r border-gray-200 bg-white overflow-y-auto p-3">
            <InventoryPanel readOnly />
          </aside>

          {/* Main visualization area */}
          <main className="flex-1 overflow-hidden min-h-0 min-w-0">
            <SpatialVisualization
              layout={builderState.layout}
              observations={machineObservations}
              liveMachines={liveMachines}
              liveCurrent={liveCurrent}
              selectedMachineId={analyticsDetailsOpen ? null : analyticsMachineId}
              onMachineClick={handleVisualizationMachineClick}
              onOpenDetails={handleOpenAnalyticsDetails}
            />
          </main>

          {/* Dispatch Panel (right) */}
          <aside className="w-72 shrink-0 border-l border-gray-200 bg-white overflow-y-auto p-3">
            <DispatchPanel readOnly />
          </aside>

          {/* Machine Analytics Panel (slide-over, view mode) */}
          {analyticsMachineId && analyticsDetailsOpen && (
            <MachineAnalyticsPanel
              machineId={analyticsMachineId}
              machines={builderState.layout.machines}
              liveMachine={liveMachines.find((machine) => machine.id === analyticsMachineId)}
              onClose={handleCloseAnalytics}
            />
          )}
          {showStructure && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/30 p-6" onClick={() => setShowStructure(false)}><div className="mx-auto max-w-4xl space-y-4 rounded-2xl bg-gray-50 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><div><h2 className="font-semibold text-gray-900">Lexicon production structure</h2><p className="text-sm text-gray-500">Lines and ordered processes used by every machine.</p></div><button className="icon-button" onClick={() => setShowStructure(false)}><X size={18} /></button></div><ProductionStructureManager /></div></div>}
        </div>
      </div>
    );

    if (isImmersive) {
      return (
        <div ref={immersiveRef} className="w-full h-full bg-white">
          {viewContent}
        </div>
      );
    }

    return <div ref={immersiveRef}>{viewContent}</div>;
  }

  // Editing mode (new build or edit existing) (Req 13.1, 13.3, 13.7)
  const editContent = (
    <div className={`flex flex-col ${isImmersive ? "h-screen" : "h-[calc(100vh-64px)]"}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <h1 className="text-base font-semibold text-gray-900">
          {builderState.isEditingExisting
            ? "Edit Lexicon™ Layout"
            : "Build Lexicon™ Layout"}
        </h1>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowStructure(true)} className="button button-secondary"><Workflow className="h-4 w-4" /> Structure</button>
          <button type="button" onClick={() => setShowSpatialSettings(true)} className="button button-secondary"><Layers3 className="h-4 w-4" /> Spatial</button>
          {/* Save error banner */}
          {saveError && (
            <span className="text-xs text-red-600 mr-2" role="alert">
              {saveError}
            </span>
          )}

          {/* Cancel button */}
          <button
            type="button"
            onClick={handleCancel}
            disabled={saving}
            className="button button-secondary"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>

          {/* Save button (Req 9.1, 9.6) */}
          <button
            type="button"
            onClick={handleSave}
            disabled={
              saving || builderState.layout.machines.length === 0
            }
            className="button button-primary"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saving ? "Saving..." : "Save Lexicon™"}
          </button>

          {/* Immersive mode toggle */}
          <button
            type="button"
            onClick={toggleImmersive}
            title={isImmersive ? "Exit Immersive Mode" : "Immersive Edit Mode"}
            className="icon-button"
          >
            {isImmersive ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Three-column layout: Inventory | FloorCanvas | Dispatch */}
      <div className="relative flex flex-1 overflow-hidden min-h-0">
        {/* Inventory Panel (left) */}
        <aside className="w-72 shrink-0 border-r border-gray-200 bg-white overflow-y-auto p-3">
          <InventoryPanel />
        </aside>

        {/* Main canvas area */}
        <main className="flex-1 overflow-hidden min-h-0 min-w-0">
          <FloorCanvas onAreaSelected={handleAreaSelected}>
            <ZoneLayer />
            <ConnectionLineLayer
              onSelectConnection={handleConnectionCompleted}
            />
            <MachineNodeLayer onSelectMachine={handleMachineSelect} />
          </FloorCanvas>
        </main>

        {/* Dispatch Panel (right) */}
        <aside className="w-72 shrink-0 border-l border-gray-200 bg-white overflow-y-auto p-3">
          <DispatchPanel />
        </aside>
      </div>

      {/* Builder dialog (for new factory setup) */}
      {showBuilderDialog && (
        <FactoryBuilderDialog
          factoryId={factoryId}
          onClose={handleDialogClose}
        />
      )}

      {/* Machine Configuration Panel (slide-over) */}
      {configMachineId && (
        <MachineConfigPanel
          machineId={configMachineId}
          isNew={configMachineIsNew}
          onClose={handleCloseMachineConfig}
        />
      )}

      {/* Connection Configuration Panel (slide-over) */}
      {configConnectionId && (
        <ConnectionConfigPanel
          connectionId={configConnectionId}
          onClose={handleCloseConnectionConfig}
        />
      )}
      {placementTarget === "zone" && <div className="absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-lg">Right-drag an empty floor area to create a zone · <button className="underline" onClick={() => setPlacementTarget("machine")}>Cancel</button></div>}
      {showSpatialSettings && <SpatialSettingsPanel onClose={() => setShowSpatialSettings(false)} onStartZone={() => { setPlacementTarget("zone"); setShowSpatialSettings(false); }} />}
      {showStructure && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/30 p-6" onClick={() => setShowStructure(false)}><div className="mx-auto max-w-4xl space-y-4 rounded-2xl bg-gray-50 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><div><h2 className="font-semibold text-gray-900">Lexicon production structure</h2><p className="text-sm text-gray-500">Lines and ordered processes used by every machine.</p></div><button className="icon-button" onClick={() => setShowStructure(false)}><X size={18} /></button></div><ProductionStructureManager /></div></div>}
    </div>
  );

  if (isImmersive) {
    return (
      <div ref={immersiveRef} className="w-full h-full bg-white">
        {editContent}
      </div>
    );
  }

  return <div ref={immersiveRef}>{editContent}</div>;
}

export default FactoryTwinPage;

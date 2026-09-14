"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Factory, Loader2, Maximize2, Minimize2, Pencil, Save, Trash2, X } from "lucide-react";
import { useFactory } from "@/lib/factory-context";
import { useFactoryBuilder } from "@/lib/factory-builder-context";
import { getCsrfToken } from "@/lib/api-client";
import type {
  ConnectionLine,
  FactoryLayout,
  GridPosition,
  MachineNode,
} from "@/lib/spatial-types";

import { FloorCanvas } from "./FloorCanvas";
import { MachineNodeLayer } from "./MachineNodeLayer";
import { ConnectionLineLayer } from "./ConnectionLineLayer";
import { FactoryBuilderDialog } from "./FactoryBuilderDialog";
import { FactoryVisualization } from "./FactoryVisualization";
import { InventoryPanel } from "./InventoryPanel";
import { DispatchPanel } from "./DispatchPanel";
import { MachineConfigPanel } from "./MachineConfigPanel";
import { ConnectionConfigPanel } from "./ConnectionConfigPanel";
import { MachineAnalyticsPanel } from "./MachineAnalyticsPanel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PageMode = "loading" | "empty" | "viewing" | "editing";

interface LayoutApiPayload {
  id: string;
  factory: string;
  floor_width: number;
  floor_height: number;
  unit_system: string;
  machines: Array<{
    id: string;
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
    }>;
    custom_kpis: Array<{
      id: string;
      name: string;
      display_unit: string;
      formula: { operations: Array<{ operator: string; parameterKey: string }> };
    }>;
    status?: string;
  }>;
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

function deserializeLayout(payload: LayoutApiPayload): FactoryLayout {
  return {
    id: payload.id,
    factoryId: payload.factory,
    floor: {
      width: payload.floor_width,
      height: payload.floor_height,
      unit: payload.unit_system as "feet" | "meters",
    },
    machines: payload.machines.map((m) => ({
      id: m.id,
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
      })),
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
    removeMachine,
    completeConnection,
    resetLayout,
    restoreDraft,
    saving,
    saveError,
  } = useFactoryBuilder();

  // Page-level state
  const [pageMode, setPageMode] = useState<PageMode>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showBuilderDialog, setShowBuilderDialog] = useState(false);
  const [isImmersive, setIsImmersive] = useState(false);

  // Panel state
  const [configMachineId, setConfigMachineId] = useState<string | null>(null);
  const [configMachineIsNew, setConfigMachineIsNew] = useState(false);
  const [configConnectionId, setConfigConnectionId] = useState<string | null>(
    null
  );

  // Delete confirmation state
  const [deleteStep, setDeleteStep] = useState<"idle" | "confirming" | "deleting">("idle");

  // Live data for view mode (observations per machine)
  const [machineObservations, setMachineObservations] = useState<
    Record<string, { values: Record<string, unknown>; submittedAt?: string }>
  >({});

  // Get the active factory ID
  const factoryId =
    filters.factoryId || factoryState.activeFactoryId;

  // -------------------------------------------------------------------------
  // Load layout on mount (Task 13.2)
  // -------------------------------------------------------------------------

  // Use a ref for loadLayout to avoid it being a dependency that causes re-fetches
  const loadLayoutRef = useRef(loadLayout);
  loadLayoutRef.current = loadLayout;

  // Use a ref for restoreDraft to avoid re-fetch dependency
  const restoreDraftRef = useRef(restoreDraft);
  restoreDraftRef.current = restoreDraft;

  // Track whether we've already fetched to prevent infinite re-triggers
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    // Don't fetch until the factory context has hydrated
    if (!hydrated) return;

    // Already fetched successfully — don't refetch
    if (hasFetchedRef.current) return;

    if (!factoryId) {
      setPageMode("empty");
      return;
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
      setPageMode("editing");
    }
  }, [
    pageMode,
    builderState.layout.floor.width,
    builderState.layout.floor.height,
    builderState.isDirty,
  ]);

  // -------------------------------------------------------------------------
  // Fetch live observation data when in viewing mode (polls every 10s)
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (pageMode !== "viewing") return;
    if (builderState.layout.machines.length === 0) return;

    let cancelled = false;

    async function fetchObservations() {
      const obsMap: Record<string, { values: Record<string, unknown>; submittedAt?: string }> = {};

      // Fetch latest observation for each machine in parallel
      const fetches = builderState.layout.machines.map(async (machine) => {
        try {
          const response = await fetch(
            `${API_SPATIAL}/machines/${machine.id}/observations/?limit=1`,
            { headers: { Accept: "application/json" }, credentials: "same-origin" }
          );
          if (!response.ok) return;
          const data = await response.json();
          const results = Array.isArray(data) ? data : data.results ?? [];
          if (results.length > 0) {
            obsMap[machine.id] = {
              values: results[0].values ?? {},
              submittedAt: results[0].submitted_at,
            };
          }
        } catch {
          // ignore per-machine fetch errors
        }
      });

      await Promise.all(fetches);
      if (!cancelled) {
        setMachineObservations(obsMap);
      }
    }

    fetchObservations();
    const interval = setInterval(fetchObservations, 10_000);

    return () => { cancelled = true; clearInterval(interval); };
  }, [pageMode, builderState.layout.machines]);

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

  // Delete layout - double confirmation flow
  const handleDeleteRequest = useCallback(() => {
    setDeleteStep("confirming");
  }, []);

  const handleDeleteCancel = useCallback(() => {
    setDeleteStep("idle");
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    setDeleteStep("deleting");
    try {
      const csrfToken = await getCsrfToken();
      const response = await fetch(
        `${API_SPATIAL}/layouts/${builderState.layout.id}/`,
        {
          method: "DELETE",
          headers: { "X-CSRFToken": csrfToken },
          credentials: "same-origin",
        }
      );
      if (!response.ok && response.status !== 204) {
        throw new Error("Failed to delete layout");
      }
      resetLayout();
      hasFetchedRef.current = false;
      setPageMode("empty");
      setDeleteStep("idle");
    } catch {
      setDeleteStep("idle");
    }
  }, [builderState.layout.id, resetLayout]);

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
      };
      placeMachine(newMachine);
      setConfigMachineId(id);
      setConfigMachineIsNew(true);
    },
    [placeMachine]
  );

  // Tap existing machine -> open config panel in edit mode
  const handleMachineSelect = useCallback((machineId: string) => {
    setConfigMachineId(machineId);
    setConfigMachineIsNew(false);
  }, []);

  // Delete a machine from the grid (handled inside MachineConfigPanel now)

  // Connection completed -> open config panel
  const handleConnectionCompleted = useCallback((connectionId: string) => {
    setConfigConnectionId(connectionId);
  }, []);

  // Machine click in visualization -> open analytics panel
  const [analyticsMachineId, setAnalyticsMachineId] = useState<string | null>(null);

  const handleVisualizationMachineClick = useCallback((machineId: string) => {
    setAnalyticsMachineId(machineId);
  }, []);

  const handleCloseAnalytics = useCallback(() => {
    setAnalyticsMachineId(null);
  }, []);

  // Close config panels
  const handleCloseMachineConfig = useCallback(() => {
    setConfigMachineId(null);
    setConfigMachineIsNew(false);
  }, []);

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
      setConfigConnectionId(builderState.selectedConnectionId);
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
            Build your Lexicon™ mushroom factory map to start placing machines and tracking
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
            Select a mushroom factory to get started.
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
            {deleteStep === "idle" && (
              <button
                type="button"
                onClick={handleDeleteRequest}
                title="Delete Layout"
                className="icon-button"
                style={{ color: "var(--red)" }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            {deleteStep === "confirming" && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-600 font-medium">Are you sure?</span>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  className="button button-danger"
                >
                  Yes, Delete
                </button>
                <button
                  type="button"
                  onClick={handleDeleteCancel}
                  className="button button-secondary"
                >
                  No
                </button>
              </div>
            )}
            {deleteStep === "deleting" && (
              <span className="text-sm text-gray-500">Deleting...</span>
            )}
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

        {/* Three-column layout: Inventory | Visualization | Dispatch */}
        <div className="relative flex flex-1 overflow-hidden min-h-0">
          {/* Inventory Panel (left) */}
          <aside className="w-72 shrink-0 border-r border-gray-200 bg-white overflow-y-auto p-3">
            <InventoryPanel isEditMode={false} />
          </aside>

          {/* Main visualization area */}
          <main className="flex-1 overflow-hidden min-h-0 min-w-0">
            <FactoryVisualization
              layout={builderState.layout}
              observations={machineObservations}
              onMachineClick={handleVisualizationMachineClick}
            />
          </main>

          {/* Dispatch Panel (right) */}
          <aside className="w-72 shrink-0 border-l border-gray-200 bg-white overflow-y-auto p-3">
            <DispatchPanel isEditMode={false} />
          </aside>

          {/* Machine Analytics Panel (slide-over, view mode) */}
          {analyticsMachineId && (
            <MachineAnalyticsPanel
              machineId={analyticsMachineId}
              machines={builderState.layout.machines}
              onClose={handleCloseAnalytics}
            />
          )}
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
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Inventory Panel (left) */}
        <aside className="w-72 shrink-0 border-r border-gray-200 bg-white overflow-y-auto p-3">
          <InventoryPanel isEditMode={true} />
        </aside>

        {/* Main canvas area */}
        <main className="flex-1 overflow-hidden min-h-0 min-w-0">
          <FloorCanvas onAreaSelected={handleAreaSelected}>
            <ConnectionLineLayer
              onSelectConnection={handleConnectionCompleted}
            />
            <MachineNodeLayer onSelectMachine={handleMachineSelect} />
          </FloorCanvas>
        </main>

        {/* Dispatch Panel (right) */}
        <aside className="w-72 shrink-0 border-l border-gray-200 bg-white overflow-y-auto p-3">
          <DispatchPanel isEditMode={true} />
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

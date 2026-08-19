"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { getCsrfToken } from "@/lib/api-client";
import type {
  BuilderMode,
  BuilderState,
  ConnectionLine,
  DispatchConfig,
  FactoryLayout,
  FloorDimensions,
  GridPosition,
  InventoryConfig,
  MachineNode,
} from "./spatial-types";

// ---------------------------------------------------------------------------
// Action types for the builder reducer
// ---------------------------------------------------------------------------

type BuilderAction =
  | { type: "INIT_FLOOR"; dimensions: FloorDimensions; factoryId: string }
  | { type: "LOAD_LAYOUT"; layout: FactoryLayout }
  | { type: "PLACE_MACHINE"; machine: MachineNode }
  | { type: "CONFIGURE_MACHINE"; id: string; config: Partial<MachineNode> }
  | { type: "REMOVE_MACHINE"; id: string }
  | { type: "MOVE_MACHINE"; id: string; newPosition: GridPosition }
  | { type: "START_CONNECTION"; sourceId: string }
  | { type: "COMPLETE_CONNECTION"; connection: ConnectionLine }
  | { type: "CANCEL_CONNECTION" }
  | { type: "CONFIGURE_CONNECTION"; id: string; config: Partial<ConnectionLine> }
  | { type: "REMOVE_CONNECTION"; id: string }
  | { type: "CONFIGURE_INVENTORY"; config: InventoryConfig }
  | { type: "CONFIGURE_DISPATCH"; config: DispatchConfig }
  | { type: "SET_MODE"; mode: BuilderMode }
  | { type: "ENTER_EDIT_MODE" }
  | { type: "SAVE_SUCCESS"; layout: FactoryLayout }
  | { type: "CANCEL_EDIT"; savedLayout: FactoryLayout }
  | { type: "RESET" };

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

function createInitialState(): BuilderState {
  return {
    layout: {
      id: "",
      factoryId: "",
      floor: { width: 0, height: 0, unit: "meters" },
      machines: [],
      connections: [],
    },
    mode: "idle",
    selectedMachineId: null,
    selectedConnectionId: null,
    isDirty: false,
    isEditingExisting: false,
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case "INIT_FLOOR":
      return {
        ...state,
        layout: {
          ...state.layout,
          factoryId: action.factoryId,
          floor: action.dimensions,
          machines: [],
          connections: [],
          inventory: undefined,
          dispatch: undefined,
        },
        mode: "idle",
        isDirty: true,
        isEditingExisting: false,
        selectedMachineId: null,
        selectedConnectionId: null,
      };

    case "LOAD_LAYOUT":
      return {
        ...state,
        layout: action.layout,
        mode: "idle",
        isDirty: false,
        isEditingExisting: true,
        selectedMachineId: null,
        selectedConnectionId: null,
      };

    case "PLACE_MACHINE":
      return {
        ...state,
        layout: {
          ...state.layout,
          machines: [...state.layout.machines, action.machine],
        },
        mode: "configuring",
        selectedMachineId: action.machine.id,
        isDirty: true,
      };

    case "CONFIGURE_MACHINE":
      return {
        ...state,
        layout: {
          ...state.layout,
          machines: state.layout.machines.map((m) =>
            m.id === action.id ? { ...m, ...action.config } : m
          ),
        },
        mode: "idle",
        selectedMachineId: null,
        isDirty: true,
      };

    case "REMOVE_MACHINE": {
      // Cascade: remove all connections referencing this machine (Req 13.5)
      const filteredConnections = state.layout.connections.filter(
        (c) => c.sourceId !== action.id && c.targetId !== action.id
      );
      return {
        ...state,
        layout: {
          ...state.layout,
          machines: state.layout.machines.filter((m) => m.id !== action.id),
          connections: filteredConnections,
        },
        mode: "idle",
        selectedMachineId: null,
        isDirty: true,
      };
    }

    case "MOVE_MACHINE":
      return {
        ...state,
        layout: {
          ...state.layout,
          machines: state.layout.machines.map((m) =>
            m.id === action.id ? { ...m, position: action.newPosition } : m
          ),
        },
        isDirty: true,
      };

    case "START_CONNECTION":
      return {
        ...state,
        mode: "connecting",
        selectedMachineId: action.sourceId,
        selectedConnectionId: null,
      };

    case "COMPLETE_CONNECTION":
      return {
        ...state,
        layout: {
          ...state.layout,
          connections: [...state.layout.connections, action.connection],
        },
        mode: "idle",
        selectedMachineId: null,
        selectedConnectionId: action.connection.id,
        isDirty: true,
      };

    case "CANCEL_CONNECTION":
      return {
        ...state,
        mode: "idle",
        selectedMachineId: null,
      };

    case "CONFIGURE_CONNECTION":
      return {
        ...state,
        layout: {
          ...state.layout,
          connections: state.layout.connections.map((c) =>
            c.id === action.id ? { ...c, ...action.config } : c
          ),
        },
        mode: "idle",
        selectedConnectionId: null,
        isDirty: true,
      };

    case "REMOVE_CONNECTION":
      return {
        ...state,
        layout: {
          ...state.layout,
          connections: state.layout.connections.filter((c) => c.id !== action.id),
        },
        mode: "idle",
        selectedConnectionId: null,
        isDirty: true,
      };

    case "CONFIGURE_INVENTORY":
      return {
        ...state,
        layout: {
          ...state.layout,
          inventory: action.config,
        },
        isDirty: true,
      };

    case "CONFIGURE_DISPATCH":
      return {
        ...state,
        layout: {
          ...state.layout,
          dispatch: action.config,
        },
        isDirty: true,
      };

    case "SET_MODE":
      return {
        ...state,
        mode: action.mode,
      };

    case "ENTER_EDIT_MODE":
      return {
        ...state,
        mode: "idle",
        isEditingExisting: true,
        isDirty: false,
        selectedMachineId: null,
        selectedConnectionId: null,
      };

    case "SAVE_SUCCESS":
      return {
        ...state,
        layout: action.layout,
        mode: "idle",
        isDirty: false,
        isEditingExisting: true,
        selectedMachineId: null,
        selectedConnectionId: null,
      };

    case "CANCEL_EDIT":
      return {
        ...state,
        layout: action.savedLayout,
        mode: "idle",
        isDirty: false,
        selectedMachineId: null,
        selectedConnectionId: null,
      };

    case "RESET":
      return createInitialState();

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context value interface
// ---------------------------------------------------------------------------

export interface FactoryBuilderContextValue {
  state: BuilderState;
  saving: boolean;
  saveError: string | null;
  // Floor setup
  initFloor: (dimensions: FloorDimensions, factoryId: string) => void;
  loadLayout: (layout: FactoryLayout) => void;
  // Machine operations
  placeMachine: (machine: MachineNode) => void;
  configureMachine: (id: string, config: Partial<MachineNode>) => void;
  removeMachine: (id: string) => void;
  moveMachine: (id: string, newPosition: GridPosition) => void;
  // Connection operations
  startConnection: (sourceId: string) => void;
  completeConnection: (connection: ConnectionLine) => void;
  cancelConnection: () => void;
  configureConnection: (id: string, config: Partial<ConnectionLine>) => void;
  removeConnection: (id: string) => void;
  // Inventory/Dispatch
  configureInventory: (config: InventoryConfig) => void;
  configureDispatch: (config: DispatchConfig) => void;
  // Persistence
  saveLayout: () => Promise<void>;
  cancelEdit: () => void;
  enterEditMode: () => void;
  resetLayout: () => void;
  restoreDraft: () => boolean;
  // Computed helpers
  isPositionOccupied: (position: GridPosition) => boolean;
  getConnectionDistance: (sourceId: string, targetPosition: GridPosition) => number;
}

// ---------------------------------------------------------------------------
// Context creation
// ---------------------------------------------------------------------------

const FactoryBuilderContext = createContext<FactoryBuilderContextValue | null>(null);

// ---------------------------------------------------------------------------
// API helpers (spatial endpoints)
// ---------------------------------------------------------------------------

const API_SPATIAL = "/api/backend/api/spatial";

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

function serializeLayout(layout: FactoryLayout): object {
  return {
    factory: layout.factoryId,
    floor_width: layout.floor.width,
    floor_height: layout.floor.height,
    unit_system: layout.floor.unit,
    machines: layout.machines.map((m) => ({
      id: m.id,
      name: m.name,
      position_x: m.position.x,
      position_y: m.position.y,
      size_width: m.size?.width ?? 1,
      size_height: m.size?.height ?? 1,
      inputs: m.inputs,
      outputs: m.outputs,
      parameters: m.parameters.map((p) => ({
        id: p.id,
        key: p.key,
        data_type: p.dataType,
        options: p.options ?? [],
        required: p.required,
        order: p.order,
      })),
      custom_kpis: m.customKpis.map((k) => ({
        id: k.id,
        name: k.name,
        display_unit: k.displayUnit,
        formula: k.formula,
      })),
      status: m.status,
    })),
    connections: layout.connections.map((c) => ({
      id: c.id,
      source: c.sourceId,
      target: c.targetId,
      name: c.name,
      description: c.description,
      material_type: c.materialType,
      quantity_per_cycle: c.quantityPerCycle,
      input_spec: c.inputSpec,
      output_spec: c.outputSpec,
    })),
    ...(layout.inventory && {
      inventory_config: {
        storage_capacity: layout.inventory.storageCapacity,
        capacity_unit: layout.inventory.capacityUnit,
        materials: layout.inventory.materials.map((m) => ({
          id: m.id,
          name: m.name,
          unit: m.unit,
          quantity: m.quantity,
        })),
      },
    }),
    ...(layout.dispatch && {
      dispatch_config: {
        products: layout.dispatch.products.map((p) => ({
          id: p.id,
          name: p.name,
          unit: p.unit,
        })),
      },
    }),
  };
}

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
        formula: k.formula as { operations: Array<{ operator: "add" | "subtract" | "multiply" | "divide"; parameterKey: string }> },
      })),
      status: m.status as "running" | "warning" | "down" | "idle" | "no_data" | undefined,
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
          capacityUnit: payload.inventory_config.capacity_unit as "kilograms" | "litres" | "meters" | "units",
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
// Helper: Euclidean distance calculation
// ---------------------------------------------------------------------------

/**
 * Calculates the Euclidean distance between two grid positions, rounded to 1 decimal place.
 * Each grid cell represents one unit in the selected unit system (feet or meters).
 */
export function calculateConnectionDistance(
  source: GridPosition,
  target: GridPosition
): number {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return Math.round(distance * 10) / 10;
}

// ---------------------------------------------------------------------------
// localStorage draft persistence
// ---------------------------------------------------------------------------

const LS_DRAFT_KEY = "vulcan:builder-draft";

/** Persist builder layout draft to localStorage. */
function saveDraftToLocalStorage(state: BuilderState): void {
  try {
    const payload = JSON.stringify({
      layout: state.layout,
      isEditingExisting: state.isEditingExisting,
      savedAt: Date.now(),
    });
    localStorage.setItem(LS_DRAFT_KEY, payload);
  } catch {
    // localStorage quota exceeded or unavailable — silently ignore
  }
}

/** Load builder draft from localStorage, if present and less than 24h old. */
function loadDraftFromLocalStorage(): { layout: FactoryLayout; isEditingExisting: boolean } | null {
  try {
    const raw = localStorage.getItem(LS_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      layout: FactoryLayout;
      isEditingExisting: boolean;
      savedAt: number;
    };
    // Expire drafts older than 24 hours
    if (Date.now() - parsed.savedAt > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(LS_DRAFT_KEY);
      return null;
    }
    // Basic sanity check
    if (!parsed.layout || !parsed.layout.floor || parsed.layout.floor.width === 0) {
      localStorage.removeItem(LS_DRAFT_KEY);
      return null;
    }
    return { layout: parsed.layout, isEditingExisting: parsed.isEditingExisting };
  } catch {
    localStorage.removeItem(LS_DRAFT_KEY);
    return null;
  }
}

/** Remove saved draft from localStorage. */
function clearDraftFromLocalStorage(): void {
  try {
    localStorage.removeItem(LS_DRAFT_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Provider component
// ---------------------------------------------------------------------------

export function FactoryBuilderProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(builderReducer, undefined, createInitialState);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Keep a ref to the last saved layout for cancel support
  const savedLayoutRef = useRef<FactoryLayout>(state.layout);

  // ---------------------------------------------------------------------------
  // localStorage: auto-save draft when dirty, restore on mount
  // ---------------------------------------------------------------------------

  // Auto-save to localStorage whenever builder state becomes dirty
  useEffect(() => {
    if (state.isDirty && state.layout.floor.width > 0) {
      saveDraftToLocalStorage(state);
    }
  }, [state]);

  // Clear draft from localStorage after successful save, cancel, or reset
  const clearDraft = useCallback(() => {
    clearDraftFromLocalStorage();
  }, []);

  // Restore a previously saved draft from localStorage (called by page on mount)
  const restoreDraft = useCallback((): boolean => {
    const draft = loadDraftFromLocalStorage();
    if (!draft) return false;
    dispatch({ type: "LOAD_LAYOUT", layout: draft.layout });
    // Mark as dirty since it hasn't been saved to the backend yet
    dispatch({ type: "ENTER_EDIT_MODE" });
    return true;
  }, []);

  // Floor setup
  const initFloor = useCallback((dimensions: FloorDimensions, factoryId: string) => {
    dispatch({ type: "INIT_FLOOR", dimensions, factoryId });
  }, []);

  const loadLayout = useCallback((layout: FactoryLayout) => {
    savedLayoutRef.current = layout;
    dispatch({ type: "LOAD_LAYOUT", layout });
    clearDraft();
  }, [clearDraft]);

  // Machine operations
  const placeMachine = useCallback((machine: MachineNode) => {
    dispatch({ type: "PLACE_MACHINE", machine });
  }, []);

  const configureMachine = useCallback((id: string, config: Partial<MachineNode>) => {
    dispatch({ type: "CONFIGURE_MACHINE", id, config });
  }, []);

  const removeMachine = useCallback((id: string) => {
    dispatch({ type: "REMOVE_MACHINE", id });
  }, []);

  const moveMachine = useCallback((id: string, newPosition: GridPosition) => {
    dispatch({ type: "MOVE_MACHINE", id, newPosition });
  }, []);

  // Connection operations
  const startConnection = useCallback((sourceId: string) => {
    dispatch({ type: "START_CONNECTION", sourceId });
  }, []);

  const completeConnection = useCallback((connection: ConnectionLine) => {
    dispatch({ type: "COMPLETE_CONNECTION", connection });
  }, []);

  const cancelConnection = useCallback(() => {
    dispatch({ type: "CANCEL_CONNECTION" });
  }, []);

  const configureConnection = useCallback((id: string, config: Partial<ConnectionLine>) => {
    dispatch({ type: "CONFIGURE_CONNECTION", id, config });
  }, []);

  const removeConnection = useCallback((id: string) => {
    dispatch({ type: "REMOVE_CONNECTION", id });
  }, []);

  // Inventory/Dispatch
  const configureInventory = useCallback((config: InventoryConfig) => {
    dispatch({ type: "CONFIGURE_INVENTORY", config });
  }, []);

  const configureDispatch = useCallback((config: DispatchConfig) => {
    dispatch({ type: "CONFIGURE_DISPATCH", config });
  }, []);

  // Persistence: save layout to backend API
  const saveLayout = useCallback(async () => {
    // Guard: factoryId must be a valid UUID for new layouts
    if (!state.layout.id && !state.layout.factoryId) {
      const message = "Cannot save: no factory selected. Please select a factory first.";
      setSaveError(message);
      throw new Error(message);
    }

    setSaving(true);
    setSaveError(null);
    try {
      const payload = serializeLayout(state.layout);
      const csrfToken = await getCsrfToken();
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-CSRFToken": csrfToken,
      };

      let response: Response;
      if (state.layout.id) {
        // Update existing layout (PATCH) — omit factory field (immutable relationship)
        const { factory: _factory, ...patchPayload } = payload as Record<string, unknown>;
        response = await fetch(`${API_SPATIAL}/layouts/${state.layout.id}/`, {
          method: "PATCH",
          headers,
          credentials: "same-origin",
          body: JSON.stringify(patchPayload),
        });
      } else {
        // Create new layout (POST)
        response = await fetch(`${API_SPATIAL}/layouts/`, {
          method: "POST",
          headers,
          credentials: "same-origin",
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const message =
          (errorData && typeof errorData === "object" && "detail" in errorData
            ? (errorData as { detail: string }).detail
            : null) ?? `Save failed (${response.status})`;
        throw new Error(message);
      }

      const responseData = (await response.json()) as LayoutApiPayload;
      const savedLayout = deserializeLayout(responseData);
      savedLayoutRef.current = savedLayout;
      dispatch({ type: "SAVE_SUCCESS", layout: savedLayout });
      clearDraft();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save factory layout.";
      setSaveError(message);
      throw error;
    } finally {
      setSaving(false);
    }
  }, [state.layout, clearDraft]);

  // Cancel edit: revert to last saved state (Req 13.7)
  const cancelEdit = useCallback(() => {
    dispatch({ type: "CANCEL_EDIT", savedLayout: savedLayoutRef.current });
    setSaveError(null);
    clearDraft();
  }, [clearDraft]);

  // Enter edit mode (Req 13.1)
  const enterEditMode = useCallback(() => {
    savedLayoutRef.current = state.layout;
    dispatch({ type: "ENTER_EDIT_MODE" });
  }, [state.layout]);

  // Reset layout to initial state (for delete flow)
  const resetLayout = useCallback(() => {
    dispatch({ type: "RESET" });
    savedLayoutRef.current = createInitialState().layout;
    clearDraft();
  }, [clearDraft]);

  // Computed helpers
  const isPositionOccupied = useCallback(
    (position: GridPosition): boolean => {
      return state.layout.machines.some((m) => {
        const w = m.size?.width ?? 1;
        const h = m.size?.height ?? 1;
        return (
          position.x >= m.position.x &&
          position.x < m.position.x + w &&
          position.y >= m.position.y &&
          position.y < m.position.y + h
        );
      });
    },
    [state.layout.machines]
  );

  const getConnectionDistance = useCallback(
    (sourceId: string, targetPosition: GridPosition): number => {
      const sourceMachine = state.layout.machines.find((m) => m.id === sourceId);
      if (!sourceMachine) return 0;
      return calculateConnectionDistance(sourceMachine.position, targetPosition);
    },
    [state.layout.machines]
  );

  const value: FactoryBuilderContextValue = useMemo(
    () => ({
      state,
      saving,
      saveError,
      initFloor,
      loadLayout,
      placeMachine,
      configureMachine,
      removeMachine,
      moveMachine,
      startConnection,
      completeConnection,
      cancelConnection,
      configureConnection,
      removeConnection,
      configureInventory,
      configureDispatch,
      saveLayout,
      cancelEdit,
      enterEditMode,
      resetLayout,
      restoreDraft,
      isPositionOccupied,
      getConnectionDistance,
    }),
    [
      state,
      saving,
      saveError,
      initFloor,
      loadLayout,
      placeMachine,
      configureMachine,
      removeMachine,
      moveMachine,
      startConnection,
      completeConnection,
      cancelConnection,
      configureConnection,
      removeConnection,
      configureInventory,
      configureDispatch,
      saveLayout,
      cancelEdit,
      enterEditMode,
      resetLayout,
      restoreDraft,
      isPositionOccupied,
      getConnectionDistance,
    ]
  );

  return (
    <FactoryBuilderContext.Provider value={value}>
      {children}
    </FactoryBuilderContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFactoryBuilder(): FactoryBuilderContextValue {
  const context = useContext(FactoryBuilderContext);
  if (!context) {
    throw new Error("useFactoryBuilder must be used within a FactoryBuilderProvider.");
  }
  return context;
}

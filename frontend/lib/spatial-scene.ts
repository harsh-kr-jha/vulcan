import type { FactoryLayout, MachineStatus } from "./spatial-types";
import type { LiveMachineSummary, LiveMachineState } from "./factory-domain";

export type SpatialView = "2d" | "isometric" | "3d";

export interface SceneMachine {
  id: string;
  name: string;
  code?: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  representation: "block" | "glb";
  blockColor: string;
  modelAsset: FactoryLayout["machines"][number]["modelAsset"];
  modelTransform: NonNullable<FactoryLayout["machines"][number]["modelTransform"]>;
  status: LiveMachineState | MachineStatus;
  lineName?: string;
  lineId?: string;
  alertCount: number;
  alertSeverity: LiveMachineSummary["highestAlertSeverity"];
  attentionReasons: string[];
  live?: LiveMachineSummary;
}

export interface FactoryScene {
  width: number;
  height: number;
  unit: string;
  machines: SceneMachine[];
  zones: FactoryLayout["zones"];
  connections: FactoryLayout["connections"];
  modelAsset: FactoryLayout["modelAsset"];
  modelTransform: FactoryLayout["modelTransform"];
}

export function normalizeFactoryScene(
  layout: FactoryLayout,
  liveMachines: LiveMachineSummary[] = [],
): FactoryScene {
  const live = new Map(liveMachines.map((machine) => [machine.id, machine]));
  return {
    width: layout.floor.width,
    height: layout.floor.height,
    unit: layout.floor.unit,
    zones: [...(layout.zones ?? [])].sort((a, b) => a.displayOrder - b.displayOrder),
    connections: layout.connections,
    modelAsset: layout.modelAsset,
    modelTransform: layout.modelTransform,
    machines: layout.machines.map((machine) => {
      const state = live.get(machine.id);
      const rotated = machine.rotation === 90 || machine.rotation === 270;
      const width = machine.size?.width ?? 1;
      const depth = machine.size?.height ?? 1;
      return {
        id: machine.id,
        name: machine.name,
        code: machine.code,
        x: machine.position.x,
        y: machine.position.y,
        width: rotated ? depth : width,
        depth: rotated ? width : depth,
        height: Math.max(0.25, machine.visualHeight ?? 1),
        rotation: machine.rotation ?? 0,
        representation: machine.representation ?? "block",
        blockColor: machine.blockColor ?? "#DBEAFE",
        modelAsset: machine.modelAsset,
        modelTransform: machine.modelTransform ?? { elevation: 0, scale: 1, rotationY: 0 },
        status: state?.state ?? machine.status ?? "no_data",
        lineName: state?.line?.name ?? machine.line?.name,
        lineId: state?.line?.id ?? machine.line?.id,
        alertCount: state?.alertCount ?? 0,
        alertSeverity: state?.highestAlertSeverity ?? null,
        attentionReasons: state?.attentionReasons ?? [],
        live: state,
      };
    }),
  };
}

export function projectIsometric(x: number, y: number, z = 0) {
  return { x: (x - y) * 0.866, y: (x + y) * 0.5 - z };
}

/**
 * The one canonical world transform used by the 3D renderer.
 * Layout X maps to world X, layout Y maps to world Z, and elevation maps to
 * world Y. No camera state participates in object positioning.
 */
export function canonicalToThree(x: number, y: number, elevation = 0) {
  return { x, y: elevation, z: y };
}

/** glTF linear units are metres; convert them into the layout's world unit. */
export function gltfToLayoutScale(unit: FactoryLayout["floor"]["unit"]) {
  return unit === "feet" ? 3.280839895 : 1;
}

export const STATUS_COLORS: Record<string, string> = {
  running: "#22c55e",
  warning: "#f59e0b",
  down: "#ef4444",
  degraded: "#f97316",
  stale: "#a855f7",
  idle: "#64748b",
  no_data: "#94a3b8",
};

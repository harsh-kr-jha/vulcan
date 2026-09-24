import { describe, expect, it } from "vitest";
import { CONNECTOR_PRESETS, buildConnectorObject, connectorCurve } from "./connector-geometry";
import type { ConnectionLine } from "./spatial-types";
import type { SceneMachine } from "./spatial-scene";

function machine(id: string, x: number, y: number, width = 2, depth = 2): SceneMachine {
  return {
    id, name: id, x, y, width, depth, height: 3, rotation: 0,
    representation: "block", blockColor: "#FFFFFF", modelAsset: undefined,
    modelTransform: { elevation: 0, scale: 1, rotationY: 0 }, status: "no_data",
    alertCount: 0, alertSeverity: null, attentionReasons: [],
  };
}

const source = machine("source", 0, 1);
const target = machine("target", 8, 1);

describe("connector geometry", () => {
  it("clips endpoints to machine edges and keeps every curve point level", () => {
    const connection: ConnectionLine = {
      id: "c1", sourceId: source.id, targetId: target.id, type: "pickup_drop",
      geometry: { ...CONNECTOR_PRESETS.pickup_drop.geometry, elevation: 0.7, curvature: 2 },
    };
    const curve = connectorCurve(connection, source, target);
    const points = curve.getPoints(20);
    expect(points[0].x).toBeCloseTo(2);
    expect(points.at(-1)?.x).toBeCloseTo(8);
    expect(points.every((point) => Math.abs(point.y - 0.7) < 1e-9)).toBe(true);
    expect(Math.max(...points.map((point) => point.z))).toBeGreaterThan(2);
  });

  it("applies editable offsets in ground-plane coordinates only", () => {
    const connection: ConnectionLine = {
      id: "c2", sourceId: source.id, targetId: target.id, type: "pipe",
      geometry: { ...CONNECTOR_PRESETS.pipe.geometry, sourceOffsetX: 0.5, sourceOffsetY: -0.25, targetOffsetX: -0.5, targetOffsetY: 0.25 },
    };
    const curve = connectorCurve(connection, source, target);
    expect(curve.getPoint(0).toArray()).toEqual([2.5, 0.3, 1.75]);
    expect(curve.getPoint(1).toArray()).toEqual([7.5, 0.3, 2.25]);
  });

  it("uses 3D meshes for physical routes and dashed lines for non-physical routes", () => {
    const pipe = buildConnectorObject({ id: "p", sourceId: "source", targetId: "target", type: "pipe" }, source, target);
    const pickup = buildConnectorObject({ id: "d", sourceId: "source", targetId: "target", type: "pickup_drop" }, source, target);
    expect(pipe.children.some((child) => child.type === "Mesh")).toBe(true);
    expect(pickup.children.some((child) => child.type === "Line")).toBe(true);
  });

  it("instances conveyor rollers to keep draw calls bounded", () => {
    const conveyor = buildConnectorObject({ id: "c", sourceId: "source", targetId: "target", type: "conveyor" }, source, target);
    const rollers = conveyor.children.find((child) => child.type === "Mesh" && "isInstancedMesh" in child);
    expect(rollers).toBeDefined();
    expect((rollers as { count: number }).count).toBeLessThanOrEqual(25);
  });
});

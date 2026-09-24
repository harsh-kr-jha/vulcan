import { describe, expect, it } from "vitest";
import { canonicalToThree, gltfToLayoutScale, normalizeFactoryScene, projectIsometric } from "./spatial-scene";
import type { FactoryLayout } from "./spatial-types";

const layout: FactoryLayout = {
  id: "layout", factoryId: "factory", floor: { width: 20, height: 10, unit: "meters" },
  zones: [], connections: [],
  machines: [{ id: "m1", name: "Mill", position: { x: 2, y: 3 }, size: { width: 2, height: 4 }, visualHeight: 2, rotation: 90, inputs: [], outputs: [], parameters: [], customKpis: [] }],
};

describe("spatial scene", () => {
  it("uses one canonical geometry for every renderer", () => {
    const scene = normalizeFactoryScene(layout);
    expect(scene.machines[0]).toMatchObject({ x: 2, y: 3, width: 4, depth: 2, height: 2 });
    expect(canonicalToThree(2, 3)).toEqual({ x: 2, y: 0, z: 3 });
    expect(canonicalToThree(2, 3, 1.5)).toEqual({ x: 2, y: 1.5, z: 3 });
    expect(gltfToLayoutScale("meters")).toBe(1);
    expect(gltfToLayoutScale("feet")).toBeCloseTo(3.28084, 5);
  });
  it("projects height vertically in isometric space", () => {
    expect(projectIsometric(2, 2, 1).y).toBe(1);
  });
});

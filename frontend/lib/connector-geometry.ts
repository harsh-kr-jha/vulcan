import * as THREE from "three";
import type { ConnectionLine, ConnectorGeometry, ConnectorType, ConnectorVisual } from "./spatial-types";
import type { SceneMachine } from "./spatial-scene";

export interface ConnectorPreset {
  label: string;
  description: string;
  physical: boolean;
  geometry: ConnectorGeometry;
  visual: ConnectorVisual;
}

const baseGeometry: ConnectorGeometry = {
  sourceOffsetX: 0,
  sourceOffsetY: 0,
  targetOffsetX: 0,
  targetOffsetY: 0,
  elevation: 0.12,
  diameter: 0.14,
  curvature: 0,
};

export const CONNECTOR_PRESETS: Record<ConnectorType, ConnectorPreset> = {
  conveyor: { label: "Conveyor", description: "Roller or belt conveyor", physical: true, geometry: { ...baseGeometry, elevation: 0.22, diameter: 0.14 }, visual: { color: "#475569", opacity: 1, dashed: false } },
  assembly_line: { label: "Assembly line", description: "Fixed production line", physical: true, geometry: { ...baseGeometry, elevation: 0.16, diameter: 0.18 }, visual: { color: "#2563EB", opacity: 1, dashed: false } },
  pipe: { label: "Pipe", description: "Liquid, gas or pneumatic pipe", physical: true, geometry: { ...baseGeometry, elevation: 0.3, diameter: 0.18 }, visual: { color: "#0891B2", opacity: 1, dashed: false } },
  pickup_drop: { label: "Pickup / drop", description: "Operator, robot or crane movement", physical: false, geometry: { ...baseGeometry, elevation: 0.18, diameter: 0.08, curvature: 0.8 }, visual: { color: "#7C3AED", opacity: 0.95, dashed: true } },
  material_transfer: { label: "Material transfer", description: "Physical transfer between machines", physical: true, geometry: { ...baseGeometry, elevation: 0.14, diameter: 0.16 }, visual: { color: "#EA580C", opacity: 1, dashed: false } },
  inspection_transfer: { label: "Inspection / transfer", description: "Quality gate or inspection handoff", physical: false, geometry: { ...baseGeometry, elevation: 0.18, diameter: 0.08, curvature: 0.45 }, visual: { color: "#16A34A", opacity: 0.95, dashed: true } },
  forklift_route: { label: "Forklift route", description: "Vehicle material movement", physical: false, geometry: { ...baseGeometry, elevation: 0.06, diameter: 0.11, curvature: 0.6 }, visual: { color: "#CA8A04", opacity: 0.9, dashed: true } },
  utility_line: { label: "Utility line", description: "Power, air or service connection", physical: true, geometry: { ...baseGeometry, elevation: 0.25, diameter: 0.08 }, visual: { color: "#64748B", opacity: 1, dashed: false } },
};

export function resolveConnectorConfig(connection: ConnectionLine) {
  const type = connection.type ?? "material_transfer";
  const preset = CONNECTOR_PRESETS[type];
  return {
    type,
    physical: preset.physical,
    geometry: { ...preset.geometry, ...(connection.geometry ?? {}) },
    visual: { ...preset.visual, ...(connection.visual ?? {}) },
  };
}

function edgeAnchor(machine: SceneMachine, toward: THREE.Vector2) {
  const center = new THREE.Vector2(machine.x + machine.width / 2, machine.y + machine.depth / 2);
  const direction = toward.clone().sub(center);
  if (direction.lengthSq() < 1e-8) return center;
  const halfWidth = machine.width / 2;
  const halfDepth = machine.depth / 2;
  const scale = Math.min(
    Math.abs(direction.x) < 1e-8 ? Infinity : halfWidth / Math.abs(direction.x),
    Math.abs(direction.y) < 1e-8 ? Infinity : halfDepth / Math.abs(direction.y),
  );
  return center.add(direction.multiplyScalar(scale));
}

/** Resolve edge-to-edge points entirely in canonical layout coordinates. */
export function connectorCurve(connection: ConnectionLine, source: SceneMachine, target: SceneMachine) {
  const { geometry } = resolveConnectorConfig(connection);
  const sourceCenter = new THREE.Vector2(source.x + source.width / 2, source.y + source.depth / 2);
  const targetCenter = new THREE.Vector2(target.x + target.width / 2, target.y + target.depth / 2);
  const start2 = edgeAnchor(source, targetCenter).add(new THREE.Vector2(geometry.sourceOffsetX, geometry.sourceOffsetY));
  const end2 = edgeAnchor(target, sourceCenter).add(new THREE.Vector2(geometry.targetOffsetX, geometry.targetOffsetY));
  const midpoint = start2.clone().add(end2).multiplyScalar(0.5);
  const delta = end2.clone().sub(start2);
  const perpendicular = delta.lengthSq() > 1e-8 ? new THREE.Vector2(-delta.y, delta.x).normalize() : new THREE.Vector2();
  const control2 = midpoint.add(perpendicular.multiplyScalar(geometry.curvature));
  const elevation = Math.max(0, geometry.elevation);
  return new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(start2.x, elevation, start2.y),
    new THREE.Vector3(control2.x, elevation, control2.y),
    new THREE.Vector3(end2.x, elevation, end2.y),
  );
}

function addArrow(group: THREE.Group, curve: THREE.Curve<THREE.Vector3>, at: number, color: THREE.Color, radius: number, reverse = false) {
  const t = reverse ? 1 - at : at;
  const point = curve.getPointAt(t);
  const tangent = curve.getTangentAt(t).normalize().multiplyScalar(reverse ? -1 : 1);
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(radius * 2.2, radius * 4.5, 8),
    new THREE.MeshLambertMaterial({ color }),
  );
  arrow.position.copy(point);
  arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
  group.add(arrow);
}

function addTube(group: THREE.Group, curve: THREE.Curve<THREE.Vector3>, radius: number, color: THREE.Color, opacity: number) {
  const length = curve.getLength();
  const geometry = new THREE.TubeGeometry(curve, Math.min(64, Math.max(8, Math.ceil(length * 4))), radius, 8, false);
  const material = new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity });
  group.add(new THREE.Mesh(geometry, material));
}

/** Lightweight, world-anchored connector object. No camera state is used here. */
export function buildConnectorObject(connection: ConnectionLine, source: SceneMachine, target: SceneMachine) {
  const config = resolveConnectorConfig(connection);
  const curve = connectorCurve(connection, source, target);
  const color = new THREE.Color(config.visual.color);
  const radius = Math.max(0.005, config.geometry.diameter / 2);
  const group = new THREE.Group();
  group.name = `connector-${connection.id}`;

  if (config.physical) {
    if (config.type === "conveyor" || config.type === "assembly_line") {
      const lateral = Math.max(radius * 2.4, config.geometry.diameter);
      const points = curve.getPoints(Math.min(48, Math.max(8, Math.ceil(curve.getLength() * 3))));
      const tangents = points.map((_, index) => curve.getTangent(index / (points.length - 1)));
      for (const sign of [-1, 1]) {
        const railPoints = points.map((point, index) => {
          const tangent = tangents[index];
          const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
          return point.clone().addScaledVector(normal, lateral * sign);
        });
        addTube(group, new THREE.CatmullRomCurve3(railPoints), radius * 0.55, color, config.visual.opacity);
      }
      // A restrained roller count keeps long factory routes inexpensive.
      const rollerCount = Math.min(24, Math.max(3, Math.floor(curve.getLength() / Math.max(0.5, radius * 6))));
      const rollerGeometry = new THREE.CylinderGeometry(radius * 0.42, radius * 0.42, lateral * 2, 6);
      const rollerMaterial = new THREE.MeshLambertMaterial({ color });
      const rollers = new THREE.InstancedMesh(rollerGeometry, rollerMaterial, rollerCount + 1);
      const matrix = new THREE.Matrix4();
      const quaternion = new THREE.Quaternion();
      for (let index = 0; index <= rollerCount; index += 1) {
        const t = index / rollerCount;
        const point = curve.getPointAt(t);
        const tangent = curve.getTangentAt(t).normalize();
        quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-tangent.z, 0, tangent.x).normalize());
        matrix.compose(point, quaternion, new THREE.Vector3(1, 1, 1));
        rollers.setMatrixAt(index, matrix);
      }
      rollers.instanceMatrix.needsUpdate = true;
      group.add(rollers);
    } else {
      addTube(group, curve, radius, color, config.visual.opacity);
    }
  } else {
    const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(Math.min(64, Math.max(12, Math.ceil(curve.getLength() * 4)))));
    const material = new THREE.LineDashedMaterial({ color, transparent: config.visual.opacity < 1, opacity: config.visual.opacity, dashSize: Math.max(0.16, radius * 4), gapSize: Math.max(0.12, radius * 3) });
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    group.add(line);
  }

  if (connection.direction === "forward" || !connection.direction) addArrow(group, curve, 0.72, color, radius);
  if (connection.direction === "reverse") addArrow(group, curve, 0.72, color, radius, true);
  if (connection.direction === "bidirectional") {
    addArrow(group, curve, 0.68, color, radius);
    addArrow(group, curve, 0.32, color, radius, true);
  }
  return group;
}

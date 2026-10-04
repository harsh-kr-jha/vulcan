"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { LiveMachineSummary } from "@/lib/factory-domain";
import {
  canonicalToThree,
  gltfToLayoutScale,
  normalizeFactoryScene,
  STATUS_COLORS,
} from "@/lib/spatial-scene";
import type { FactoryLayout } from "@/lib/spatial-types";
import { resolveMachineVisualStatus } from "@/lib/machine-visual-status";
import type { MachineIssueType } from "@/lib/factory-domain";
import { buildConnectorObject } from "@/lib/connector-geometry";
import {
  formatMachineCardValue,
  machineCardSignature,
  machineCardVariable,
  machinePredictionPresentation,
  machineStatePresentation,
} from "@/lib/machine-card";
import { SpatialLoadingSkeleton } from "./SpatialLoadingSkeleton";

interface Props {
  layout: FactoryLayout;
  liveMachines: LiveMachineSummary[];
  selectedMachineId: string | null;
  pinnedMachineIds: string[];
  cardParameterKeys: Record<string, string[]>;
  onMachineClick: (id: string) => void;
  onMachineCardClick: (id: string) => void;
  onMachineContextMenu: (id: string, point: { x: number; y: number }) => void;
  onUnavailable: () => void;
  showZones: boolean;
  showConnections: boolean;
}

interface Placement {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  anchorY: number;
}

type StatusMaterial = THREE.Material & { color: THREE.Color };

type FitView = (bounds: THREE.Box3) => void;

interface MachineCardObject {
  group: THREE.Group;
  sprite: THREE.Sprite;
  texture: THREE.CanvasTexture;
  signature: string;
}

const MODEL_CONCURRENCY = 3;
const MAX_FACTORY_TRIANGLES = 100_000;
const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function truncateCanvasText(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  if (context.measureText(value).width <= maxWidth) return value;
  let result = value;
  while (result.length > 1 && context.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1);
  return `${result}…`;
}

function createMachineCardTexture(name: string, liveMachine?: LiveMachineSummary, parameterKeys: string[] = []) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = parameterKeys.length > 2 ? 388 : parameterKeys.length ? 306 : 228;
  const context = canvas.getContext("2d")!;
  const state = machineStatePresentation(liveMachine);
  const prediction = machinePredictionPresentation(liveMachine?.currentCyclePrediction);
  const variables = parameterKeys.map((key) => machineCardVariable(liveMachine, key));
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.shadowColor = "rgba(15, 23, 42, 0.2)";
  context.shadowBlur = 20;
  context.shadowOffsetY = 8;
  context.fillStyle = "rgba(255, 255, 255, 0.97)";
  roundedRect(context, 18, 14, 732, canvas.height - 38, 28);
  context.fill();
  context.shadowColor = "transparent";
  context.strokeStyle = "#cbd5e1";
  context.lineWidth = 3;
  roundedRect(context, 18, 14, 732, canvas.height - 38, 28);
  context.stroke();

  // Keep every label and value inside the rounded card, even for unusually
  // long telemetry strings or browser font-metric differences.
  context.save();
  roundedRect(context, 20, 16, 728, canvas.height - 42, 26);
  context.clip();

  context.fillStyle = "#0f172a";
  context.font = "700 50px system-ui, sans-serif";
  context.textBaseline = "middle";
  context.textAlign = "start";
  context.fillText(truncateCanvasText(context, name, 475), 52, 70);

  context.fillStyle = state.color;
  context.beginPath();
  context.arc(58, 145, 11, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#475569";
  context.font = "600 32px system-ui, sans-serif";
  context.textAlign = "start";
  context.fillText(truncateCanvasText(context, state.label, 210), 82, 145);

  if (!parameterKeys.length) {
    const predictionFill = prediction.tone === "defect" ? "#fee2e2" : prediction.tone === "good" ? "#d1fae5" : "#e2e8f0";
    const predictionText = prediction.tone === "defect" ? "#b91c1c" : prediction.tone === "good" ? "#047857" : "#475569";
    context.fillStyle = predictionFill;
    roundedRect(context, 330, 116, 150, 58, 29);
    context.fill();
    context.fillStyle = predictionText;
    context.font = "700 31px system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText(prediction.label, 405, 145);
  }

  context.fillStyle = "#f8fafc";
  context.strokeStyle = "#cbd5e1";
  roundedRect(context, 512, 112, 194, 66, 18);
  context.fill();
  context.stroke();
  context.fillStyle = "#334155";
  context.font = "650 28px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText("Actions  ›", 609, 145);

  parameterKeys.forEach((key, index) => {
    const variable = variables[index];
    const x = index % 2 === 0 ? 52 : 390;
    const y = 194 + Math.floor(index / 2) * 78;
    context.fillStyle = variable?.abnormal ? "#fef2f2" : "#f1f5f9";
    context.strokeStyle = variable?.abnormal ? "#fecaca" : "#e2e8f0";
    roundedRect(context, x, y, 326, 68, 14);
    context.fill();
    context.stroke();
    context.fillStyle = variable?.abnormal ? "#b91c1c" : "#64748b";
    context.font = "600 19px system-ui, sans-serif";
    context.textAlign = "start";
    context.fillText(truncateCanvasText(context, variable?.label ?? key, 294), x + 16, y + 21);
    context.fillStyle = variable?.abnormal ? "#991b1b" : "#0f172a";
    context.font = "700 28px system-ui, sans-serif";
    context.fillText(truncateCanvasText(context, formatMachineCardValue(variable?.value, variable?.unit), 294), x + 16, y + 49);
  });
  context.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function disposeMachineCard(card: MachineCardObject) {
  card.group.removeFromParent();
  card.texture.dispose();
  card.sprite.material.dispose();
  card.group.traverse((object) => {
    if (object instanceof THREE.Line) {
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    }
  });
}

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("The embedded GLB image could not be decoded."));
    reader.onerror = () => reject(reader.error ?? new Error("The embedded GLB image could not be decoded."));
    reader.readAsDataURL(blob);
  });
}

/**
 * GLTFLoader turns embedded GLB images into short-lived blob: URLs. That path is
 * unreliable in some WebKit/browser security configurations. Replace only those
 * image references with data URIs while preserving the binary geometry chunks.
 * FileReader performs the encoding off the hot render path and the work happens
 * once, when a user first opens 3D.
 */
async function stabiliseEmbeddedGlbImages(source: ArrayBuffer) {
  if (source.byteLength < 20) return source;
  const sourceView = new DataView(source);
  if (sourceView.getUint32(0, true) !== GLB_MAGIC) return source;

  const chunks: Array<{ type: number; bytes: Uint8Array }> = [];
  let offset = 12;
  while (offset + 8 <= source.byteLength) {
    const length = sourceView.getUint32(offset, true);
    const type = sourceView.getUint32(offset + 4, true);
    if (offset + 8 + length > source.byteLength) throw new Error("The GLB contains an invalid chunk length.");
    chunks.push({ type, bytes: new Uint8Array(source, offset + 8, length) });
    offset += 8 + length;
  }

  const jsonChunk = chunks.find((chunk) => chunk.type === GLB_JSON_CHUNK);
  const binaryChunk = chunks.find((chunk) => chunk.type === 0x004e4942);
  if (!jsonChunk || !binaryChunk) return source;
  const json = JSON.parse(new TextDecoder().decode(jsonChunk.bytes).replace(/[\u0000\u0020]+$/g, "")) as {
    images?: Array<{ bufferView?: number; mimeType?: string; uri?: string }>;
    bufferViews?: Array<{ buffer?: number; byteOffset?: number; byteLength: number }>;
  };
  const embedded = (json.images ?? []).filter((image) => image.bufferView !== undefined);
  if (!embedded.length) return source;

  for (const image of embedded) {
    const bufferView = json.bufferViews?.[image.bufferView!];
    if (!bufferView || (bufferView.buffer ?? 0) !== 0) continue;
    const start = bufferView.byteOffset ?? 0;
    const end = start + bufferView.byteLength;
    if (start < 0 || end > binaryChunk.bytes.byteLength) throw new Error("An embedded GLB image is outside its binary buffer.");
    const bytes = binaryChunk.bytes.slice(start, end);
    image.uri = await readBlobAsDataUrl(new Blob([bytes], { type: image.mimeType ?? "application/octet-stream" }));
    delete image.bufferView;
    delete image.mimeType;
  }

  const encodedJson = new TextEncoder().encode(JSON.stringify(json));
  const paddedJsonLength = Math.ceil(encodedJson.byteLength / 4) * 4;
  const totalLength = 12 + chunks.reduce(
    (total, chunk) => total + 8 + (chunk === jsonChunk ? paddedJsonLength : chunk.bytes.byteLength),
    0,
  );
  const result = new ArrayBuffer(totalLength);
  const resultBytes = new Uint8Array(result);
  const resultView = new DataView(result);
  resultView.setUint32(0, GLB_MAGIC, true);
  resultView.setUint32(4, sourceView.getUint32(4, true), true);
  resultView.setUint32(8, totalLength, true);
  let resultOffset = 12;
  chunks.forEach((chunk) => {
    const bytes = chunk === jsonChunk ? encodedJson : chunk.bytes;
    const length = chunk === jsonChunk ? paddedJsonLength : bytes.byteLength;
    resultView.setUint32(resultOffset, length, true);
    resultView.setUint32(resultOffset + 4, chunk.type, true);
    if (chunk === jsonChunk) resultBytes.fill(0x20, resultOffset + 8, resultOffset + 8 + length);
    resultBytes.set(bytes, resultOffset + 8);
    resultOffset += 8 + length;
  });
  return result;
}

function disposeMaterial(material: THREE.Material) {
  Object.values(material).forEach((value) => {
    if (value instanceof THREE.Texture) value.dispose();
  });
  material.dispose();
}

function disposeScene(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Line) && !(object instanceof THREE.LineSegments)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(disposeMaterial);
  });
}

function countTriangles(root: THREE.Object3D) {
  let triangles = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const position = object.geometry.attributes.position;
    triangles += object.geometry.index ? object.geometry.index.count / 3 : (position?.count ?? 0) / 3;
  });
  return triangles;
}

function prepareStatusMaterials(root: THREE.Object3D) {
  const clones = new Map<THREE.Material, StatusMaterial>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const source = Array.isArray(object.material) ? object.material : [object.material];
    const replacements = source.map((material) => {
      const existing = clones.get(material);
      if (existing) return existing;
      let replacement: StatusMaterial;
      const colorMaterial = material as THREE.Material & { color?: THREE.Color };
      if (colorMaterial.color) {
        replacement = material.clone() as StatusMaterial;
      } else {
        const textured = material as THREE.Material & { map?: THREE.Texture | null; alphaTest?: number };
        replacement = new THREE.MeshLambertMaterial({
          map: textured.map ?? null,
          transparent: material.transparent,
          opacity: material.opacity,
          alphaTest: textured.alphaTest ?? 0,
          side: material.side,
        }) as StatusMaterial;
      }
      clones.set(material, replacement);
      return replacement;
    });
    object.material = Array.isArray(object.material) ? replacements : replacements[0];
  });
  return [...clones.values()];
}

/**
 * Normalise an uploaded machine around a deterministic bottom-centre pivot.
 * The returned parent is the only object that receives layout TRS transforms.
 */
function createBottomCenterPivot(model: THREE.Group) {
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model, true);
  if (bounds.isEmpty()) throw new Error("The model contains no renderable geometry.");
  const center = bounds.getCenter(new THREE.Vector3());
  const normalizer = new THREE.Group();
  normalizer.position.set(-center.x, -bounds.min.y, -center.z);
  normalizer.add(model);
  const anchor = new THREE.Group();
  anchor.add(normalizer);
  return anchor;
}

function freezeStaticTransforms(root: THREE.Object3D) {
  root.traverse((object) => {
    object.updateMatrix();
    object.matrixAutoUpdate = false;
  });
  root.updateMatrixWorld(true);
}

function createLoadQueue(loader: GLTFLoader, isDisposed: () => boolean) {
  const queue: Array<{
    url: string;
    resolve: (model: THREE.Group) => void;
    reject: (error: unknown) => void;
  }> = [];
  const controllers = new Set<AbortController>();
  let active = 0;
  let stopped = false;

  const parse = (buffer: ArrayBuffer, resourcePath: string) => new Promise<THREE.Group>((resolve, reject) => {
    loader.parse(buffer, resourcePath, (gltf) => resolve(gltf.scene), reject);
  });

  const pump = () => {
    if (stopped || isDisposed()) {
      while (queue.length) queue.shift()!.reject(new Error("The 3D view was closed."));
      return;
    }
    while (active < MODEL_CONCURRENCY && queue.length) {
      const task = queue.shift()!;
      active += 1;
      const controller = new AbortController();
      controllers.add(controller);
      void (async () => {
        const response = await fetch(task.url, {
          cache: "force-cache",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Model request failed (${response.status}).`);
        const buffer = await stabiliseEmbeddedGlbImages(await response.arrayBuffer());
        const resourcePath = new URL(".", new URL(task.url, window.location.href)).href;
        const model = await parse(buffer, resourcePath);
        if (stopped || isDisposed()) {
          disposeScene(model);
          throw new Error("The 3D view was closed.");
        }
        task.resolve(model);
      })().catch(task.reject).finally(() => {
        controllers.delete(controller);
        active -= 1;
        pump();
      });
    }
  };

  return {
    load: (url: string) => new Promise<THREE.Group>((resolve, reject) => {
      queue.push({ url, resolve, reject });
      pump();
    }),
    dispose: () => {
      stopped = true;
      while (queue.length) queue.shift()!.reject(new Error("The 3D view was closed."));
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
    },
  };
}

export default function ThreeFactoryView({
  layout,
  liveMachines,
  selectedMachineId,
  pinnedMachineIds,
  cardParameterKeys,
  onMachineClick,
  onMachineCardClick,
  onMachineContextMenu,
  onUnavailable,
  showZones,
  showConnections,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const clickRef = useRef(onMachineClick);
  const cardClickRef = useRef(onMachineCardClick);
  const contextMenuRef = useRef(onMachineContextMenu);
  const renderRef = useRef<(() => void) | null>(null);
  const statusMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const statusIdsRef = useRef<string[]>([]);
  const blockMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const blockIdsRef = useRef<string[]>([]);
  const modelMaterialsRef = useRef<Map<string, StatusMaterial[]>>(new Map());
  const haloMeshesRef = useRef<Map<MachineIssueType, THREE.InstancedMesh>>(new Map());
  const liveMachinesRef = useRef(liveMachines);
  const selectionRef = useRef<THREE.LineSegments | null>(null);
  const zonesRef = useRef<THREE.Group | null>(null);
  const connectionsRef = useRef<THREE.Group | null>(null);
  const placementsRef = useRef<Map<string, Placement>>(new Map());
  const machineCardsRootRef = useRef<THREE.Group | null>(null);
  const machineCardsRef = useRef<Map<string, MachineCardObject>>(new Map());
  const fitBoundsRef = useRef<FitView | null>(null);
  const fitFloorRef = useRef<(() => void) | null>(null);
  const fitSelectionRef = useRef<(() => void) | null>(null);
  const [error, setError] = useState("");
  const [readyGeometryKey, setReadyGeometryKey] = useState<string | null>(null);

  useEffect(() => { clickRef.current = onMachineClick; }, [onMachineClick]);
  useEffect(() => { cardClickRef.current = onMachineCardClick; }, [onMachineCardClick]);
  useEffect(() => { contextMenuRef.current = onMachineContextMenu; }, [onMachineContextMenu]);
  useEffect(() => { liveMachinesRef.current = liveMachines; }, [liveMachines]);

  // Live polling creates new objects. This signature contains only world geometry,
  // so telemetry updates never rebuild the renderer or reload model resources.
  const geometryKey = useMemo(() => JSON.stringify({
    floor: layout.floor,
    zones: layout.zones,
    connections: layout.connections.map((connection) => [
      connection.id,
      connection.sourceId,
      connection.targetId,
      connection.type,
      connection.direction,
      connection.geometry,
      connection.visual,
    ]),
    shell: layout.modelAsset ? [layout.modelAsset.checksumSha256, layout.modelTransform] : null,
    machines: layout.machines.map((machine) => [
      machine.id,
      machine.position,
      machine.size,
      machine.visualHeight,
      machine.rotation,
      machine.representation,
      machine.blockColor,
      machine.modelAsset?.checksumSha256,
      machine.modelTransform,
    ]),
  }), [layout]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    setError("");
    let disposed = false;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
    } catch {
      queueMicrotask(onUnavailable);
      return;
    }

    const sceneData = normalizeFactoryScene(layout, []);
    const world = new THREE.Group();
    world.name = "factory-world";
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);
    scene.add(world);
    const machineCardsRoot = new THREE.Group();
    machineCardsRoot.name = "machine-cards";
    machineCardsRoot.renderOrder = 4;
    machineCardsRootRef.current = machineCardsRoot;
    world.add(machineCardsRoot);

    const diagonal = Math.max(1, Math.hypot(sceneData.width, sceneData.height));
    const camera = new THREE.PerspectiveCamera(42, 1, Math.max(0.01, diagonal / 2000), diagonal * 20);
    const floorCenter = new THREE.Vector3(sceneData.width / 2, 0, sceneData.height / 2);
    camera.position.copy(floorCenter).add(new THREE.Vector3(diagonal * 0.65, diagonal * 0.8, diagonal * 0.65));
    camera.lookAt(floorCenter);

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute("aria-label", "Interactive 3D factory map");
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 2.2));
    const directional = new THREE.DirectionalLight(0xffffff, 1.1);
    directional.position.set(sceneData.width, diagonal, -sceneData.height * 0.25);
    scene.add(directional);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(sceneData.width, sceneData.height),
      new THREE.MeshBasicMaterial({ color: 0xe2e8f0, side: THREE.DoubleSide }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.copy(floorCenter).setY(-0.02);
    world.add(floor);

    const zoneGroup = new THREE.Group();
    zoneGroup.visible = showZones;
    zonesRef.current = zoneGroup;
    world.add(zoneGroup);
    sceneData.zones.forEach((zone) => {
      const center = canonicalToThree(
        zone.position.x + zone.size.width / 2,
        zone.position.y + zone.size.height / 2,
        0.01,
      );
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(zone.size.width, zone.size.height),
        new THREE.MeshBasicMaterial({
          color: zone.color,
          transparent: true,
          opacity: 0.34,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(center.x, center.y, center.z);
      zoneGroup.add(mesh);
    });

    const placements = new Map<string, Placement>();
    sceneData.machines.forEach((machine) => {
      const center = canonicalToThree(machine.x + machine.width / 2, machine.y + machine.depth / 2);
      placements.set(machine.id, {
        x: center.x,
        y: machine.height / 2,
        z: center.z,
        width: machine.width,
        height: machine.height,
        depth: machine.depth,
        anchorY: machine.height,
      });
    });
    placementsRef.current = placements;
    const matrix = new THREE.Matrix4();

    const blocks = sceneData.machines.filter((machine) => machine.representation === "block" || !machine.modelAsset);
    if (blocks.length) {
      const blockMesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshLambertMaterial({ vertexColors: true }),
        blocks.length,
      );
      blockMesh.name = "machine-blocks";
      blockMesh.userData.machineIds = blocks.map((machine) => machine.id);
      blocks.forEach((machine, index) => {
        const placement = placements.get(machine.id)!;
        matrix.compose(
          new THREE.Vector3(placement.x, placement.y, placement.z),
          new THREE.Quaternion(),
          new THREE.Vector3(placement.width, placement.height, placement.depth),
        );
        blockMesh.setMatrixAt(index, matrix);
        blockMesh.setColorAt(index, new THREE.Color(machine.blockColor));
      });
      blockMesh.instanceMatrix.needsUpdate = true;
      if (blockMesh.instanceColor) blockMesh.instanceColor.needsUpdate = true;
      world.add(blockMesh);
      blockMeshRef.current = blockMesh;
      blockIdsRef.current = blocks.map((machine) => machine.id);
    }

    let hitMesh: THREE.InstancedMesh | null = null;
    if (sceneData.machines.length) {
      // GLB machines communicate status through their model tint and issue halos.
      // Keep the footprint strip only for lightweight block machines so imported
      // models do not appear to sit on an artificial dark platform.
      const statusMachines = sceneData.machines.filter(
        (machine) => machine.representation === "block" || !machine.modelAsset,
      );
      const statusMesh = statusMachines.length
        ? new THREE.InstancedMesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshBasicMaterial({ vertexColors: true }),
          statusMachines.length,
        )
        : null;
      hitMesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
        sceneData.machines.length,
      );
      statusMachines.forEach((machine, index) => {
        const placement = placements.get(machine.id)!;
        matrix.compose(
          new THREE.Vector3(placement.x, 0.035, placement.z),
          new THREE.Quaternion(),
          new THREE.Vector3(placement.width + 0.12, 0.07, placement.depth + 0.12),
        );
        statusMesh!.setMatrixAt(index, matrix);
        statusMesh!.setColorAt(index, new THREE.Color(STATUS_COLORS[machine.status] ?? STATUS_COLORS.no_data));
      });
      sceneData.machines.forEach((machine, index) => {
        const placement = placements.get(machine.id)!;
        matrix.compose(
          new THREE.Vector3(placement.x, Math.max(placement.height / 2, 0.5), placement.z),
          new THREE.Quaternion(),
          new THREE.Vector3(placement.width, Math.max(placement.height, 1), placement.depth),
        );
        hitMesh!.setMatrixAt(index, matrix);
      });
      if (statusMesh) {
        statusMesh.instanceMatrix.needsUpdate = true;
        if (statusMesh.instanceColor) statusMesh.instanceColor.needsUpdate = true;
      }
      hitMesh.instanceMatrix.needsUpdate = true;
      hitMesh.userData.machineIds = sceneData.machines.map((machine) => machine.id);
      statusIdsRef.current = statusMachines.map((machine) => machine.id);
      statusMeshRef.current = statusMesh;
      if (statusMesh) world.add(statusMesh);
      world.add(hitMesh);

      const issueTypes: MachineIssueType[] = ["out_of_range", "predicted_failure", "high_rejects"];
      issueTypes.forEach((issueType, issueIndex) => {
        const halo = new THREE.InstancedMesh(
          new THREE.RingGeometry(0.54, 0.68, 16, 1, issueIndex * (Math.PI * 2 / 3), Math.PI * 2 / 3 - 0.12),
          new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, depthWrite: false }),
          sceneData.machines.length,
        );
        halo.name = `machine-issue-${issueType}`;
        const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
        sceneData.machines.forEach((machine, index) => {
          const placement = placements.get(machine.id)!;
          matrix.compose(new THREE.Vector3(placement.x, 0.09, placement.z), flat, new THREE.Vector3(0, 0, 0));
          halo.setMatrixAt(index, matrix);
          halo.setColorAt(index, new THREE.Color(0xffffff));
        });
        halo.instanceMatrix.needsUpdate = true;
        if (halo.instanceColor) halo.instanceColor.needsUpdate = true;
        haloMeshesRef.current.set(issueType, halo);
        world.add(halo);
      });
    }

    const connectionGroup = new THREE.Group();
    connectionGroup.visible = showConnections;
    connectionsRef.current = connectionGroup;
    world.add(connectionGroup);
    {
      const byId = new Map(sceneData.machines.map((machine) => [machine.id, machine]));
      sceneData.connections.forEach((connection) => {
        const source = byId.get(connection.sourceId);
        const target = byId.get(connection.targetId);
        if (!source || !target) return;
        connectionGroup.add(buildConnectorObject(connection, source, target));
      });
    }

    const selectionGeometry = new THREE.BufferGeometry();
    selectionGeometry.setAttribute("position", new THREE.Float32BufferAttribute([
      -0.5, 0, -0.5, -0.3, 0, -0.5, -0.5, 0, -0.5, -0.5, 0, -0.3,
       0.5, 0, -0.5,  0.3, 0, -0.5,  0.5, 0, -0.5,  0.5, 0, -0.3,
       0.5, 0,  0.5,  0.3, 0,  0.5,  0.5, 0,  0.5,  0.5, 0,  0.3,
      -0.5, 0,  0.5, -0.3, 0,  0.5, -0.5, 0,  0.5, -0.5, 0,  0.3,
    ], 3));
    const selection = new THREE.LineSegments(
      selectionGeometry,
      new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.85 }),
    );
    selection.visible = false;
    selectionRef.current = selection;
    world.add(selection);

    const controls = new MapControls(camera, renderer.domElement);
    controls.target.copy(floorCenter);
    controls.screenSpacePanning = false;
    controls.zoomToCursor = true;
    controls.enableDamping = false;
    controls.minPolarAngle = THREE.MathUtils.degToRad(15);
    controls.maxPolarAngle = THREE.MathUtils.degToRad(80);
    controls.minDistance = Math.max(0.5, diagonal * 0.03);
    controls.maxDistance = diagonal * 4;
    controls.cursor.copy(floorCenter);
    controls.maxTargetRadius = diagonal;
    controls.listenToKeyEvents(renderer.domElement);

    const render = () => {
      if (disposed) return;
      renderer.render(scene, camera);
    };
    renderRef.current = render;
    let constraining = false;
    const handleControlsChange = () => {
      if (!constraining) {
        constraining = true;
        const margin = diagonal * 0.1;
        const nextTarget = controls.target.clone();
        nextTarget.x = THREE.MathUtils.clamp(nextTarget.x, -margin, sceneData.width + margin);
        nextTarget.y = 0;
        nextTarget.z = THREE.MathUtils.clamp(nextTarget.z, -margin, sceneData.height + margin);
        const correction = nextTarget.sub(controls.target);
        if (correction.lengthSq() > 0) {
          controls.target.add(correction);
          camera.position.add(correction);
        }
        constraining = false;
      }
      render();
    };
    controls.addEventListener("change", handleControlsChange);

    const fitBounds: FitView = (bounds) => {
      const center = bounds.getCenter(new THREE.Vector3());
      const sphere = bounds.getBoundingSphere(new THREE.Sphere());
      const verticalFov = THREE.MathUtils.degToRad(camera.fov);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
      const limitingFov = Math.min(verticalFov, horizontalFov);
      const distance = Math.max(
        sphere.radius / Math.sin(limitingFov / 2),
        diagonal * 0.15,
      ) * 1.15;
      const direction = camera.position.clone().sub(controls.target).normalize();
      if (!Number.isFinite(direction.x) || direction.lengthSq() < 0.5) direction.set(0.65, 0.8, 0.65).normalize();
      controls.target.copy(center).setY(0);
      camera.position.copy(direction.multiplyScalar(distance).add(controls.target));
      camera.near = Math.max(0.01, distance / 1000);
      camera.far = Math.max(diagonal * 20, distance + sphere.radius * 10);
      camera.updateProjectionMatrix();
      controls.update();
      render();
    };
    const floorBounds = new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(sceneData.width, Math.max(1, ...sceneData.machines.map((machine) => machine.height)), sceneData.height),
    );
    fitBoundsRef.current = fitBounds;
    fitFloorRef.current = () => fitBounds(floorBounds);

    const resize = () => {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("/vendor/three-draco/");
    dracoLoader.setDecoderConfig({ type: "wasm" });
    dracoLoader.setWorkerLimit(1);
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    const modelQueue = createLoadQueue(loader, () => disposed);
    const loadModel = modelQueue.load;
    const modelLoads: Promise<void>[] = [];
    const unitScale = gltfToLayoutScale(layout.floor.unit);
    const reportModelError = (label: string) => {
      if (!disposed) setError(`${label} could not be loaded; its lightweight block fallback remains available.`);
    };
    const expandClippingToWorld = () => {
      world.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(world, true);
      if (bounds.isEmpty()) return;
      const sphere = bounds.getBoundingSphere(new THREE.Sphere());
      camera.far = Math.max(
        diagonal * 20,
        camera.position.distanceTo(sphere.center) + sphere.radius * 4,
      );
      camera.updateProjectionMatrix();
    };

    if (layout.modelAsset?.downloadUrl) {
      const transform = layout.modelTransform ?? { offsetX: 0, offsetY: 0, elevation: 0, scale: 1, rotationY: 0 };
      modelLoads.push(loadModel(layout.modelAsset.downloadUrl).then((model) => {
        if (disposed) return;
        const triangles = countTriangles(model);
        if (triangles > MAX_FACTORY_TRIANGLES) setError(`Factory shell has ${Math.round(triangles).toLocaleString()} triangles; use fewer than ${MAX_FACTORY_TRIANGLES.toLocaleString()} for low-power devices.`);
        const anchor = new THREE.Group();
        anchor.position.set(transform.offsetX, transform.elevation, transform.offsetY);
        anchor.rotation.y = THREE.MathUtils.degToRad(transform.rotationY);
        anchor.scale.setScalar(transform.scale * unitScale);
        anchor.add(model);
        freezeStaticTransforms(anchor);
        world.add(anchor);
        expandClippingToWorld();
        render();
      }).catch(() => reportModelError("The factory shell")));
    }

    sceneData.machines.forEach((machine) => {
      if (machine.representation !== "glb" || !machine.modelAsset?.downloadUrl) return;
      const placement = placements.get(machine.id)!;
      const fallback = new THREE.Mesh(
        new THREE.BoxGeometry(placement.width, placement.height, placement.depth),
        new THREE.MeshLambertMaterial({ color: machine.blockColor }),
      );
      fallback.position.set(placement.x, placement.y, placement.z);
      world.add(fallback);
      modelLoads.push(loadModel(machine.modelAsset.downloadUrl).then((model) => {
        if (disposed) return;
        let anchor: THREE.Group;
        try { anchor = createBottomCenterPivot(model); }
        catch { reportModelError(machine.name); return; }
        anchor.name = `machine-model-${machine.id}`;
        const statusMaterials = prepareStatusMaterials(anchor);
        modelMaterialsRef.current.set(machine.id, statusMaterials);
        const currentLive = liveMachinesRef.current.find((item) => item.id === machine.id);
        const initialVisual = resolveMachineVisualStatus(currentLive, layout.statusVisualization);
        statusMaterials.forEach((material) => material.color.set(initialVisual.bodyColor));
        anchor.position.set(placement.x, machine.modelTransform.elevation, placement.z);
        anchor.rotation.y = THREE.MathUtils.degToRad(machine.rotation + machine.modelTransform.rotationY);
        anchor.scale.setScalar(machine.modelTransform.scale * unitScale);
        freezeStaticTransforms(anchor);
        world.add(anchor);
        const modelBounds = new THREE.Box3().setFromObject(anchor, true);
        placement.anchorY = Math.max(placement.height, modelBounds.max.y);
        world.remove(fallback);
        disposeScene(fallback);
        expandClippingToWorld();
        render();
      }).catch(() => reportModelError(machine.name)));
    });

    void Promise.allSettled(modelLoads).then(() => {
      if (disposed) return;
      requestAnimationFrame(() => {
        if (disposed) return;
        render();
        setReadyGeometryKey(geometryKey);
      });
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerStart: { x: number; y: number } | null = null;
    let hoverFrame = 0;
    const pointerDown = (event: PointerEvent) => { pointerStart = { x: event.clientX, y: event.clientY }; };
    const machineAt = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const cardHit = raycaster.intersectObjects([...machineCardsRef.current.values()].map((card) => card.sprite), false)[0];
      const cardId = cardHit?.object.userData.machineId;
      if (typeof cardId === "string") return { id: cardId, card: true, rect };
      const hit = hitMesh ? raycaster.intersectObject(hitMesh, false)[0] : undefined;
      const id = hit?.instanceId === undefined
        ? undefined
        : (hitMesh!.userData.machineIds as string[])[hit.instanceId];
      return { id, card: false, rect };
    };
    const click = (event: MouseEvent) => {
      if (!pointerStart || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 4) return;
      const hit = machineAt(event.clientX, event.clientY);
      if (hit.id && hit.card) cardClickRef.current(hit.id);
      else clickRef.current(hit.id ?? "");
    };
    const contextMenu = (event: MouseEvent) => {
      const hit = machineAt(event.clientX, event.clientY);
      if (!hit.id) return;
      event.preventDefault();
      contextMenuRef.current(hit.id, {
        x: Math.min(Math.max(8, event.clientX - hit.rect.left), Math.max(8, hit.rect.width - 272)),
        y: Math.min(Math.max(8, event.clientY - hit.rect.top), Math.max(8, hit.rect.height - 360)),
      });
    };
    const pointerMove = (event: PointerEvent) => {
      if (hoverFrame) return;
      const { clientX, clientY } = event;
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = 0;
        renderer.domElement.style.cursor = machineAt(clientX, clientY).id ? "pointer" : "grab";
      });
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      if (!disposed) onUnavailable();
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("click", click);
    renderer.domElement.addEventListener("contextmenu", contextMenu);
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    resize();
    fitFloorRef.current();

    return () => {
      disposed = true;
      modelQueue.dispose();
      dracoLoader.dispose();
      renderRef.current = null;
      statusMeshRef.current = null;
      blockMeshRef.current = null;
      blockIdsRef.current = [];
      modelMaterialsRef.current = new Map();
      haloMeshesRef.current = new Map();
      machineCardsRef.current.forEach(disposeMachineCard);
      machineCardsRef.current = new Map();
      machineCardsRootRef.current = null;
      selectionRef.current = null;
      zonesRef.current = null;
      connectionsRef.current = null;
      fitBoundsRef.current = null;
      fitFloorRef.current = null;
      fitSelectionRef.current = null;
      observer.disconnect();
      controls.removeEventListener("change", handleControlsChange);
      controls.stopListenToKeyEvents();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("click", click);
      renderer.domElement.removeEventListener("contextmenu", contextMenu);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      if (hoverFrame) cancelAnimationFrame(hoverFrame);
      disposeScene(scene);
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  // geometryKey includes every static input read while constructing the world.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometryKey, onUnavailable]);

  useEffect(() => {
    if (zonesRef.current) zonesRef.current.visible = showZones;
    if (connectionsRef.current) connectionsRef.current.visible = showConnections;
    renderRef.current?.();
  }, [showConnections, showZones]);

  useEffect(() => {
    const statusMesh = statusMeshRef.current;
    const render = renderRef.current;
    if (!render) return;
    if (statusMesh) {
      const live = new Map(liveMachines.map((machine) => [machine.id, machine]));
      statusIdsRef.current.forEach((id, index) => {
        statusMesh.setColorAt(index, new THREE.Color(resolveMachineVisualStatus(live.get(id), layout.statusVisualization).bodyColor));
      });
      if (statusMesh.instanceColor) statusMesh.instanceColor.needsUpdate = true;
    }
    const live = new Map(liveMachines.map((machine) => [machine.id, machine]));
    const blockMesh = blockMeshRef.current;
    if (blockMesh) {
      blockIdsRef.current.forEach((id, index) => blockMesh.setColorAt(index, new THREE.Color(resolveMachineVisualStatus(live.get(id), layout.statusVisualization).bodyColor)));
      if (blockMesh.instanceColor) blockMesh.instanceColor.needsUpdate = true;
    }
    modelMaterialsRef.current.forEach((materials, id) => {
      const color = resolveMachineVisualStatus(live.get(id), layout.statusVisualization).bodyColor;
      materials.forEach((material) => material.color.set(color));
    });
    const haloMatrix = new THREE.Matrix4();
    const haloRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    statusIdsRef.current.forEach((id, index) => {
      const placement = placementsRef.current.get(id);
      if (!placement) return;
      const visual = resolveMachineVisualStatus(live.get(id), layout.statusVisualization);
      haloMeshesRef.current.forEach((mesh, issueType) => {
        const segment = visual.segments.find((item) => item.type === issueType);
        const scale = segment ? Math.max(placement.width, placement.depth) : 0;
        haloMatrix.compose(new THREE.Vector3(placement.x, 0.09, placement.z), haloRotation, new THREE.Vector3(scale, scale, scale));
        mesh.setMatrixAt(index, haloMatrix);
        mesh.setColorAt(index, new THREE.Color(segment?.color ?? 0xffffff));
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      });
    });

    const selection = selectionRef.current;
    const placement = selectedMachineId ? placementsRef.current.get(selectedMachineId) : undefined;
    if (selection && placement) {
      selection.visible = true;
      selection.position.set(placement.x, 0.075, placement.z);
      selection.scale.set(placement.width + 0.08, 1, placement.depth + 0.08);
      fitSelectionRef.current = () => {
        const bounds = new THREE.Box3().setFromCenterAndSize(
          new THREE.Vector3(placement.x, placement.height / 2, placement.z),
          new THREE.Vector3(placement.width, placement.height, placement.depth),
        );
        fitBoundsRef.current?.(bounds);
      };
    } else if (selection) {
      selection.visible = false;
      fitSelectionRef.current = null;
    }
    render();
  }, [layout.machines, layout.statusVisualization, liveMachines, selectedMachineId]);

  useEffect(() => {
    const root = machineCardsRootRef.current;
    if (!root || readyGeometryKey !== geometryKey) return;
    const live = new Map(liveMachines.map((machine) => [machine.id, machine]));
    const machines = new Map(layout.machines.map((machine) => [machine.id, machine]));
    const desired = new Set(pinnedMachineIds);
    if (selectedMachineId) desired.add(selectedMachineId);

    machineCardsRef.current.forEach((card, id) => {
      if (desired.has(id) && machines.has(id)) return;
      disposeMachineCard(card);
      machineCardsRef.current.delete(id);
    });

    desired.forEach((id) => {
      const machine = machines.get(id);
      const placement = placementsRef.current.get(id);
      if (!machine || !placement) return;
      const liveMachine = live.get(id);
      const parameterKeys = cardParameterKeys[id] ?? [];
      const signature = machineCardSignature(liveMachine, machine.name, parameterKeys);
      let card = machineCardsRef.current.get(id);
      if (!card) {
        const texture = createMachineCardTexture(machine.name, liveMachine, parameterKeys);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false });
        const sprite = new THREE.Sprite(material);
        sprite.name = `machine-card-${id}`;
        sprite.userData.machineId = id;
        sprite.center.set(0.5, 0);
        sprite.renderOrder = 5;
        const group = new THREE.Group();
        group.name = `machine-card-anchor-${id}`;
        const stem = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)]),
          new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.8 }),
        );
        group.add(stem, sprite);
        root.add(group);
        card = { group, sprite, texture, signature };
        machineCardsRef.current.set(id, card);
      } else if (card.signature !== signature) {
        const texture = createMachineCardTexture(machine.name, liveMachine, parameterKeys);
        card.texture.dispose();
        card.texture = texture;
        card.signature = signature;
        card.sprite.material.map = texture;
        card.sprite.material.needsUpdate = true;
      }
      const machineScale = Math.max(placement.width, placement.depth, placement.anchorY);
      const maximumCardWidth = Math.max(4, Math.hypot(layout.floor.width, layout.floor.height) * 0.16);
      const width = THREE.MathUtils.clamp(machineScale * 1.8, 2.8, maximumCardWidth);
      const height = width * ((parameterKeys.length > 2 ? 388 : parameterKeys.length ? 306 : 228) / 768);
      const gap = Math.max(0.12, height * 0.18);
      card.group.position.set(placement.x, placement.anchorY, placement.z);
      const stem = card.group.children.find((child) => child instanceof THREE.Line) as THREE.Line | undefined;
      if (stem) stem.scale.y = gap;
      card.sprite.position.set(0, gap, 0);
      card.sprite.scale.set(width, height, 1);
    });
    renderRef.current?.();
  }, [cardParameterKeys, geometryKey, layout.floor.height, layout.floor.width, layout.machines, liveMachines, pinnedMachineIds, readyGeometryKey, selectedMachineId]);

  return (
    <div ref={hostRef} className="relative h-full w-full bg-slate-50" aria-busy={readyGeometryKey !== geometryKey}>
      <div className="absolute right-3 top-3 z-10 flex gap-1 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-sm">
        <button type="button" className="rounded-md px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100" onClick={() => fitFloorRef.current?.()}>Fit factory</button>
        <button type="button" disabled={!selectedMachineId} className="rounded-md px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => fitSelectionRef.current?.()}>Fit machine</button>
      </div>
      {error && <div className="absolute left-3 top-16 z-10 max-w-sm rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{error}</div>}
      {readyGeometryKey !== geometryKey && <div className="absolute inset-0 z-10"><SpatialLoadingSkeleton /></div>}
    </div>
  );
}

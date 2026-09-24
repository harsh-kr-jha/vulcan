import type { ConnectorDirection, ConnectorGeometry, ConnectorType, ConnectorVisual, FactoryLayout } from "./spatial-types";

export interface LayoutApiPayload {
  id: string;
  factory: string;
  floor_width: number;
  floor_height: number;
  unit_system: string;
  model_transform?: Partial<{ offsetX: number; offsetY: number; elevation: number; scale: number; rotationY: number }>;
  status_visualization?: Partial<{ recentMinutes: number; persistentMinutes: number; outOfRangeConfirmationSeconds: number; rejectWindowCycles: number; rejectMinimumCycles: number }>;
  model_asset?: { id: string; filename: string; size_bytes: number; checksum_sha256: string; download_url: string } | null;
  zones?: Array<{ id: string; name: string; zone_type: string; color: string; position_x: number; position_y: number; width: number; height: number; display_order: number; line_id?: string | null; line?: { id: string; name: string; code: string } | null }>;
  machines: Array<{
    id: string; code?: string; name: string; process_id?: string | null;
    process?: { id: string; name: string; code: string } | null;
    line?: { id: string; name: string; code: string } | null;
    position_x: number; position_y: number; size_width?: number; size_height?: number;
    visual_height?: number; rotation_degrees?: number;
    representation?: "block" | "glb"; block_color?: string;
    model_transform?: Partial<{ elevation: number; scale: number; rotationY: number }>;
    model_asset?: { id: string; filename: string; size_bytes: number; checksum_sha256: string; download_url: string } | null;
    image_asset?: { id: string; filename: string; content_type: "image/png" | "image/jpeg" | "image/webp"; size_bytes: number; checksum_sha256: string; download_url: string } | null;
    inputs: Array<{ id: string; label: string; unitType: string }>;
    outputs: Array<{ id: string; label: string; unitType: string }>;
    parameters: Array<{ id: string; key: string; data_type: string; options: string[]; required: boolean; order: number; label?: string; unit?: string; semantic?: string; origin?: "manual" | "stream"; source_field_id?: string; source_schema_version?: string; is_active?: boolean }>;
    custom_kpis: Array<{ id: string; name: string; display_unit: string; formula: { operations: Array<{ operator: string; parameterKey: string }> }; is_enabled?: boolean; disabled_reason?: string }>;
    stream_binding?: { id: string; stream_id: string; channel_id: string; channel_name: string; status: string; last_received_at?: string | null; last_error?: string } | null;
    status?: string;
  }>;
  unplaced_machines?: LayoutApiPayload["machines"];
  connections: Array<{ id: string; source: string; target: string; name?: string; description?: string; material_type?: string; quantity_per_cycle?: number; input_spec?: string; output_spec?: string; connection_type?: ConnectorType; direction?: ConnectorDirection; geometry?: Partial<ConnectorGeometry>; visual_style?: Partial<ConnectorVisual> }>;
  inventory_config?: { storage_capacity: number; capacity_unit: string; materials: Array<{ id: string; name: string; unit: string; quantity: number }> };
  dispatch_config?: { products: Array<{ id: string; name: string; unit: string }> };
  saved_at?: string;
}

const DEFAULT_TRANSFORM = { offsetX: 0, offsetY: 0, elevation: 0, scale: 1, rotationY: 0 };
const DEFAULT_MACHINE_TRANSFORM = { elevation: 0, scale: 1, rotationY: 0 };
export const DEFAULT_STATUS_VISUALIZATION = { recentMinutes: 5, persistentMinutes: 30, outOfRangeConfirmationSeconds: 60, rejectWindowCycles: 20, rejectMinimumCycles: 10 };

export function deserializeLayout(payload: LayoutApiPayload): FactoryLayout {
  return {
    id: payload.id,
    factoryId: payload.factory,
    floor: { width: Number(payload.floor_width), height: Number(payload.floor_height), unit: payload.unit_system as "feet" | "meters" },
    zones: (payload.zones ?? []).map((z) => ({ id: z.id, name: z.name, type: z.zone_type, color: z.color, position: { x: Number(z.position_x), y: Number(z.position_y) }, size: { width: Number(z.width), height: Number(z.height) }, displayOrder: z.display_order, lineId: z.line_id, line: z.line })),
    modelAsset: payload.model_asset ? { id: payload.model_asset.id, filename: payload.model_asset.filename, sizeBytes: payload.model_asset.size_bytes, checksumSha256: payload.model_asset.checksum_sha256, downloadUrl: payload.model_asset.download_url } : null,
    modelTransform: { ...DEFAULT_TRANSFORM, ...(payload.model_transform ?? {}) },
    statusVisualization: { ...DEFAULT_STATUS_VISUALIZATION, ...(payload.status_visualization ?? {}) },
    machines: payload.machines.map((m) => ({
      id: m.id, code: m.code, name: m.name, processId: m.process_id, process: m.process, line: m.line,
      position: { x: Number(m.position_x), y: Number(m.position_y) },
      size: { width: m.size_width ?? 1, height: m.size_height ?? 1 },
      visualHeight: Number(m.visual_height ?? 1), rotation: (m.rotation_degrees ?? 0) as 0 | 90 | 180 | 270,
      representation: m.representation ?? "block", blockColor: m.block_color ?? "#DBEAFE",
      modelTransform: { ...DEFAULT_MACHINE_TRANSFORM, ...(m.model_transform ?? {}) },
      modelAsset: m.model_asset ? { id: m.model_asset.id, filename: m.model_asset.filename, sizeBytes: m.model_asset.size_bytes, checksumSha256: m.model_asset.checksum_sha256, downloadUrl: m.model_asset.download_url } : null,
      imageAsset: m.image_asset ? { id: m.image_asset.id, filename: m.image_asset.filename, contentType: m.image_asset.content_type, sizeBytes: m.image_asset.size_bytes, checksumSha256: m.image_asset.checksum_sha256, downloadUrl: m.image_asset.download_url } : null,
      inputs: m.inputs, outputs: m.outputs,
      parameters: m.parameters.map((p) => ({ id: p.id, key: p.key, dataType: p.data_type as "number" | "text" | "boolean" | "date" | "selection", options: p.options, required: p.required, order: p.order, label: p.label, unit: p.unit, semantic: p.semantic, origin: p.origin, sourceFieldId: p.source_field_id, sourceSchemaVersion: p.source_schema_version, active: p.is_active })),
      customKpis: m.custom_kpis.map((k) => ({ id: k.id, name: k.name, displayUnit: k.display_unit, formula: k.formula as never, isEnabled: k.is_enabled, disabledReason: k.disabled_reason })),
      dataStreamId: m.stream_binding?.stream_id, dataStreamChannelId: m.stream_binding?.channel_id,
      streamBinding: m.stream_binding ? { id: m.stream_binding.id, streamId: m.stream_binding.stream_id, channelId: m.stream_binding.channel_id, channelName: m.stream_binding.channel_name, status: m.stream_binding.status, lastReceivedAt: m.stream_binding.last_received_at, lastError: m.stream_binding.last_error } : null,
      status: m.status as FactoryLayout["machines"][number]["status"],
    })),
    connections: payload.connections.map((c) => ({ id: c.id, sourceId: c.source, targetId: c.target, name: c.name, description: c.description, materialType: c.material_type, quantityPerCycle: c.quantity_per_cycle, inputSpec: c.input_spec, outputSpec: c.output_spec, type: c.connection_type ?? "material_transfer", direction: c.direction ?? "forward", geometry: c.geometry as ConnectorGeometry | undefined, visual: c.visual_style as ConnectorVisual | undefined })),
    inventory: payload.inventory_config ? { storageCapacity: payload.inventory_config.storage_capacity, capacityUnit: payload.inventory_config.capacity_unit as "kilograms" | "litres" | "meters" | "units", materials: payload.inventory_config.materials.map((m) => ({ ...m, unit: m.unit as "kilograms" | "litres" | "meters" | "units" })) } : undefined,
    dispatch: payload.dispatch_config ? { products: payload.dispatch_config.products.map((p) => ({ ...p, unit: p.unit as "meters" | "litres" | "units" | "kilograms", awaitingQuantity: 0 })) } : undefined,
    savedAt: payload.saved_at,
  };
}

export function serializeLayout(layout: FactoryLayout): object {
  return {
    factory: layout.factoryId, floor_width: layout.floor.width, floor_height: layout.floor.height, unit_system: layout.floor.unit,
    model_transform: layout.modelTransform ?? DEFAULT_TRANSFORM,
    status_visualization: layout.statusVisualization ?? DEFAULT_STATUS_VISUALIZATION,
    zones: layout.zones.map((z) => ({ id: z.id, name: z.name, zone_type: z.type, color: z.color, position_x: z.position.x, position_y: z.position.y, width: z.size.width, height: z.size.height, display_order: z.displayOrder, line_id: z.lineId ?? null })),
    machines: layout.machines.map((m) => ({
      id: m.id, code: m.code, process_id: m.processId, name: m.name, position_x: m.position.x, position_y: m.position.y,
      size_width: m.size?.width ?? 1, size_height: m.size?.height ?? 1, visual_height: m.visualHeight ?? 1, rotation_degrees: m.rotation ?? 0,
      representation: m.representation ?? "block", block_color: m.blockColor ?? "#DBEAFE", model_transform: m.modelTransform ?? DEFAULT_MACHINE_TRANSFORM,
      inputs: m.inputs, outputs: m.outputs,
      parameters: m.parameters.map((p) => ({ id: p.id, key: p.key, data_type: p.dataType, options: p.options ?? [], required: p.required, order: p.order, label: p.label ?? "", unit: p.unit ?? "", semantic: p.semantic ?? "measurement", origin: p.origin ?? "manual", source_field_id: p.sourceFieldId ?? "", source_schema_version: p.sourceSchemaVersion ?? "", is_active: p.active ?? true })),
      custom_kpis: m.customKpis.map((k) => ({ id: k.id, name: k.name, display_unit: k.displayUnit, formula: k.formula, is_enabled: k.isEnabled ?? true, disabled_reason: k.disabledReason ?? "" })),
      data_stream_id: m.dataStreamId !== undefined ? m.dataStreamId : (m.streamBinding?.streamId ?? null), data_stream_channel_id: m.dataStreamChannelId !== undefined ? m.dataStreamChannelId : (m.streamBinding?.channelId ?? null), status: m.status,
    })),
    connections: layout.connections.map((c) => ({ id: c.id, source: c.sourceId, target: c.targetId, name: c.name, description: c.description, material_type: c.materialType, quantity_per_cycle: c.quantityPerCycle, input_spec: c.inputSpec, output_spec: c.outputSpec, connection_type: c.type ?? "material_transfer", direction: c.direction ?? "forward", geometry: c.geometry ?? {}, visual_style: c.visual ?? {} })),
    ...(layout.inventory && { inventory_config: { storage_capacity: layout.inventory.storageCapacity, capacity_unit: layout.inventory.capacityUnit, materials: layout.inventory.materials } }),
    ...(layout.dispatch && { dispatch_config: { products: layout.dispatch.products.map(({ id, name, unit }) => ({ id, name, unit })) } }),
  };
}

export interface DataStreamField {
  id: string;
  key: string;
  label: string;
  data_type: "number" | "text" | "boolean" | "date" | "selection";
  unit: string;
  semantic: string;
  required: boolean;
  order: number;
  options?: string[];
}

export interface DataStreamChannel {
  id: string;
  external_id: string;
  name: string;
  schema_version: string;
  schema: { fields?: DataStreamField[] };
  latest_cursor: string;
  active: boolean;
  assigned_machine_id?: string | null;
  assigned_machine_name?: string | null;
  binding_status?: "active" | "degraded" | "schema_review" | "paused" | null;
  binding_error?: string;
  binding_last_received_at?: string | null;
  schema_review?: {
    version: string;
    changes: Array<{
      key: string;
      old_type: string;
      new_type: string;
      old_unit: string;
      new_unit: string;
    }>;
  } | null;
  control_state?: "running" | "paused" | "stopped" | "unknown" | string;
}

export interface DataInputStream {
  id: string;
  factory: string;
  name: string;
  base_url: string;
  protocol: string;
  enabled: boolean;
  status: "draft" | "connected" | "degraded" | "disabled";
  capabilities: { controls?: Array<{ id: string; label?: string; inputs?: string[] }> };
  source_metadata: Record<string, unknown>;
  poll_interval_seconds: number;
  last_success_at?: string | null;
  last_error: string;
  key_hint: string;
  assigned_machines: number;
  channels: DataStreamChannel[];
}

export interface MachineCycleOutcome {
  id: string;
  run_id: string;
  cycle_id: string;
  cycle_number?: number | null;
  source_label: "good" | "failure";
  effective_label: "good" | "failure";
  quality_score?: number | null;
  failure_mode: string;
  sensor_data_quality: string;
  overridden_at?: string | null;
  overridden_by_name?: string | null;
  override_note?: string;
}

export interface MachineTelemetrySample {
  ml?: { violations: Record<string, boolean>; prediction: { failure_probability: number; label: string } | null } | null;
  id: string;
  observed_at: string;
  received_at: string;
  sequence_no: number;
  run_id: string;
  cycle_id: string;
  cycle_number?: number | null;
  cycle_phase: string;
  recipe_id: string;
  values: Record<string, unknown>;
}

export interface MachineCycleHistory {
  ml?: { profile: { sku_name: string; version: number } | null; health: number | null; correct: boolean | null; checkpoint_prediction: { label: string; failure_probability: number } | null } | null;
  run_id: string;
  cycle_id: string;
  cycle_number?: number | null;
  recipe_id: string;
  started_at: string;
  ended_at: string;
  sample_count: number;
  outcome?: MachineCycleOutcome | null;
  samples: MachineTelemetrySample[];
}

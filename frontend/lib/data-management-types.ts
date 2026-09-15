export interface ManagedMachineData {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  sampleCount: number;
  firstSampleAt: string | null;
  lastSampleAt: string | null;
}

export interface ManagedCycle {
  run_id: string;
  cycle_id: string;
  cycle_number: number | null;
  recipe_id: string;
  sampleCount: number;
  startedAt: string;
  endedAt: string;
}

export interface MachineDataSummary {
  machines: ManagedMachineData[];
  selectedMachineId: string | null;
  cycles: ManagedCycle[];
  totals: { machines: number; samples: number; cycles: number };
}

export interface MachineDataScope {
  scope: "cycle" | "cycles" | "run" | "date_range" | "machine";
  run_id?: string;
  cycle_id?: string;
  from?: string;
  to?: string;
  cycles?: Array<{ run_id: string; cycle_id: string }>;
}

export interface MachineDataPreview {
  machine: { id: string; name: string; code: string };
  scope: MachineDataScope;
  totalRows: number;
  rows: Array<{
    id: string;
    observedAt: string;
    runId: string;
    cycleId: string;
    cycleNumber: number | null;
    phase: string;
    recipe: string;
    schemaVersion: string;
    values: Record<string, unknown>;
  }>;
}

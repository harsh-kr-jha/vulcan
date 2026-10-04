import type { LiveMachineSummary } from "./factory-domain";

export type MachinePredictionPresentation = {
  label: "Good" | "Defect" | "Pending";
  tone: "good" | "defect" | "pending";
};

const STATE_PRESENTATION: Record<string, { label: string; color: string }> = {
  running: { label: "Running", color: "#22c55e" },
  warning: { label: "Warning", color: "#f59e0b" },
  down: { label: "Down", color: "#ef4444" },
  degraded: { label: "Degraded", color: "#f97316" },
  stale: { label: "Stale", color: "#a855f7" },
  idle: { label: "Idle", color: "#64748b" },
  no_data: { label: "No data", color: "#94a3b8" },
};

export function machineStatePresentation(machine: LiveMachineSummary | undefined) {
  return STATE_PRESENTATION[machine?.state ?? "no_data"] ?? STATE_PRESENTATION.no_data;
}

export function machinePredictionPresentation(
  prediction: LiveMachineSummary["currentCyclePrediction"] | null | undefined,
): MachinePredictionPresentation {
  if (prediction?.label === "failure") return { label: "Defect", tone: "defect" };
  if (prediction?.label === "good") return { label: "Good", tone: "good" };
  return { label: "Pending", tone: "pending" };
}

export function machineCardStorageKey(factoryId: string) {
  return `vulcan:lexicon:machine-cards:${factoryId}`;
}

export function machineCardParameterStorageKey(factoryId: string) {
  return `vulcan:lexicon:machine-card-parameters:${factoryId}`;
}

export function parsePinnedMachineCards(raw: string | null, validIds: Iterable<string>) {
  const valid = new Set(validIds);
  if (!raw) return new Set<string>();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && valid.has(id)));
  } catch {
    return new Set<string>();
  }
}

export function parseMachineCardParameters(
  raw: string | null,
  validParameters: ReadonlyMap<string, ReadonlySet<string>>,
) {
  if (!raw) return {} as Record<string, string[]>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const selections: Record<string, string[]> = {};
    Object.entries(parsed).forEach(([machineId, value]) => {
      const valid = validParameters.get(machineId);
      if (!valid) return;
      const keys = (Array.isArray(value) ? value : [value])
        .filter((key): key is string => typeof key === "string" && valid.has(key));
      const unique = [...new Set(keys)].slice(0, 4);
      if (unique.length) selections[machineId] = unique;
    });
    return selections;
  } catch {
    return {};
  }
}

export function machineCardVariable(machine: LiveMachineSummary | undefined, key: string | undefined) {
  return key ? machine?.variables?.find((variable) => variable.key === key) : undefined;
}

export function formatMachineCardValue(value: unknown, unit = "") {
  let text: string;
  if (value === null || value === undefined || value === "") text = "—";
  else if (typeof value === "boolean") text = value ? "On" : "Off";
  else if (typeof value === "number") text = Number.isInteger(value) ? String(value) : value.toLocaleString(undefined, { maximumFractionDigits: 3 });
  else text = String(value);
  return unit && text !== "—" ? `${text} ${unit}` : text;
}

export function machineCardSignature(machine: LiveMachineSummary | undefined, name: string, parameterKeys: string[] = []) {
  const prediction = machinePredictionPresentation(machine?.currentCyclePrediction);
  const variables = parameterKeys.map((key) => {
    const variable = machineCardVariable(machine, key);
    return `${key}\u0000${variable?.label ?? ""}\u0000${String(variable?.value ?? "")}\u0000${variable?.unit ?? ""}\u0000${variable?.abnormal ?? false}`;
  });
  return `${name}\u0000${machine?.state ?? "no_data"}\u0000${prediction.label}\u0000${variables.join("\u0001")}`;
}

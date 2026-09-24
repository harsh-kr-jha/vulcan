import type { LiveMachineIssue, LiveMachineSummary, MachineIssueType } from "./factory-domain";
import { DEFAULT_STATUS_VISUALIZATION } from "./spatial-api";
import type { StatusVisualizationConfig } from "./spatial-types";

export type VisualMachineState = "normal" | "out_of_range" | "critical" | "inactive" | "unknown";
export type IssueIntensity = "recent" | "sustained" | "persistent";

const PALETTES = {
  out_of_range: { recent: "#FDBA74", sustained: "#F97316", persistent: "#C2410C" },
  critical: { recent: "#FCA5A5", sustained: "#EF4444", persistent: "#B91C1C" },
} as const;

const ISSUE_ORDER: MachineIssueType[] = ["out_of_range", "predicted_failure", "high_rejects"];

export interface MachineVisualStatus {
  state: VisualMachineState;
  bodyColor: string;
  textColor: string;
  label: string;
  stale: boolean;
  segments: Array<{ type: MachineIssueType; color: string; label: string; durationMs: number }>;
}

function duration(issue: LiveMachineIssue, now: number) {
  const started = Date.parse(issue.activeSince);
  return Number.isFinite(started) ? Math.max(0, now - started) : 0;
}

export function issueIntensity(durationMs: number, config: StatusVisualizationConfig): IssueIntensity {
  if (durationMs < config.recentMinutes * 60_000) return "recent";
  if (durationMs < config.persistentMinutes * 60_000) return "sustained";
  return "persistent";
}

function issueColor(issue: LiveMachineIssue, now: number, config: StatusVisualizationConfig) {
  const intensity = issueIntensity(duration(issue, now), config);
  return issue.type === "out_of_range" ? PALETTES.out_of_range[intensity] : PALETTES.critical[intensity];
}

export function resolveMachineVisualStatus(
  machine: Pick<LiveMachineSummary, "state" | "operatingState" | "issues"> | undefined,
  configured?: StatusVisualizationConfig,
  now = Date.now(),
): MachineVisualStatus {
  const config = { ...DEFAULT_STATUS_VISUALIZATION, ...(configured ?? {}) };
  const issues = [...(machine?.issues ?? [])].sort((a, b) => ISSUE_ORDER.indexOf(a.type) - ISSUE_ORDER.indexOf(b.type));
  const stale = !machine || machine.state === "stale" || machine.state === "no_data" || machine.state === "degraded";
  const segments = issues.map((issue) => ({
    type: issue.type,
    color: issueColor(issue, now, config),
    label: issue.label,
    durationMs: duration(issue, now),
  }));
  const result = (state: VisualMachineState, bodyColor: string, label: string): MachineVisualStatus => {
    const hex = bodyColor.replace("#", "");
    const red = parseInt(hex.slice(0, 2), 16);
    const green = parseInt(hex.slice(2, 4), 16);
    const blue = parseInt(hex.slice(4, 6), 16);
    const luminance = (red * 299 + green * 587 + blue * 114) / 255000;
    return { state, bodyColor, textColor: luminance < 0.52 ? "#FFFFFF" : "#0F172A", label, stale, segments };
  };
  if (stale) return result("unknown", "#94A3B8", "Unknown / stale");
  const critical = issues.filter((issue) => issue.type !== "out_of_range").sort((a, b) => duration(b, now) - duration(a, now))[0];
  if (critical) return result("critical", issueColor(critical, now, config), "Failure risk / high rejects");
  const outOfRange = issues.filter((issue) => issue.type === "out_of_range").sort((a, b) => duration(b, now) - duration(a, now))[0];
  if (outOfRange) return result("out_of_range", issueColor(outOfRange, now, config), "Out-of-range");
  if (machine.operatingState === "inactive") return result("inactive", "#171717", "Inactive");
  return result("normal", "#22C55E", "Running / normal");
}

export function formatIssueDuration(durationMs: number) {
  const minutes = Math.floor(durationMs / 60_000);
  if (minutes < 1) return "under 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

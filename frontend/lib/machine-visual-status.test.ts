import { describe, expect, it } from "vitest";
import type { LiveMachineSummary } from "./factory-domain";
import { issueIntensity, resolveMachineVisualStatus } from "./machine-visual-status";
import { DEFAULT_STATUS_VISUALIZATION } from "./spatial-api";

const now = Date.parse("2026-09-24T10:00:00Z");

function machine(patch: Partial<LiveMachineSummary> = {}): LiveMachineSummary {
  return {
    id: "m1", name: "Press", code: "P1", state: "running", attention: false,
    attentionReasons: [], alertCount: 0, highestAlertSeverity: null,
    lastObservedAt: new Date(now).toISOString(), placed: true, process: null, line: null,
    operatingState: "running", inactiveSince: null, issues: [], ...patch,
  };
}

describe("machine visual status", () => {
  it("uses configured duration bands", () => {
    expect(issueIntensity(4 * 60_000, DEFAULT_STATUS_VISUALIZATION)).toBe("recent");
    expect(issueIntensity(5 * 60_000, DEFAULT_STATUS_VISUALIZATION)).toBe("sustained");
    expect(issueIntensity(30 * 60_000, DEFAULT_STATUS_VISUALIZATION)).toBe("persistent");
  });

  it("uses red as the body and preserves orange for combined issues", () => {
    const visual = resolveMachineVisualStatus(machine({ issues: [
      { type: "out_of_range", label: "Out-of-range parameters", activeSince: "2026-09-24T09:58:00Z", evidence: {} },
      { type: "predicted_failure", label: "Predicted failure", activeSince: "2026-09-24T09:40:00Z", evidence: {} },
    ] }), DEFAULT_STATUS_VISUALIZATION, now);
    expect(visual.state).toBe("critical");
    expect(visual.bodyColor).toBe("#EF4444");
    expect(visual.segments.map((item) => item.type)).toEqual(["out_of_range", "predicted_failure"]);
  });

  it("shows stale data as grey while retaining last-known issue segments", () => {
    const visual = resolveMachineVisualStatus(machine({ state: "stale", operatingState: "unknown", issues: [
      { type: "high_rejects", label: "High rejects", activeSince: "2026-09-24T09:00:00Z", evidence: {} },
    ] }), DEFAULT_STATUS_VISUALIZATION, now);
    expect(visual.state).toBe("unknown");
    expect(visual.bodyColor).toBe("#94A3B8");
    expect(visual.segments).toHaveLength(1);
  });

  it("reserves black for a confirmed inactive machine", () => {
    expect(resolveMachineVisualStatus(machine({ operatingState: "inactive" }), undefined, now).bodyColor).toBe("#171717");
  });
});

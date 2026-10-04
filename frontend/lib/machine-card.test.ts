import { describe, expect, it } from "vitest";
import {
  formatMachineCardValue,
  machineCardVariable,
  machinePredictionPresentation,
  machineStatePresentation,
  parseMachineCardParameters,
  parsePinnedMachineCards,
} from "./machine-card";

describe("machine card presentation", () => {
  it("maps only explicit cycle labels to Good or Defect", () => {
    expect(machinePredictionPresentation({ cycleId: "1", observedAt: "now", label: "good", failureProbability: 0.1 })).toEqual({ label: "Good", tone: "good" });
    expect(machinePredictionPresentation({ cycleId: "2", observedAt: "now", label: "failure", failureProbability: 0.8 })).toEqual({ label: "Defect", tone: "defect" });
    expect(machinePredictionPresentation({ cycleId: "3", observedAt: "now", label: "unknown", failureProbability: null })).toEqual({ label: "Pending", tone: "pending" });
    expect(machinePredictionPresentation(null)).toEqual({ label: "Pending", tone: "pending" });
  });

  it("keeps only valid persisted machine IDs", () => {
    expect([...parsePinnedMachineCards('["a","deleted",3,"a"]', ["a", "b"])]).toEqual(["a"]);
    expect([...parsePinnedMachineCards("not-json", ["a"])]).toEqual([]);
  });

  it("keeps only valid per-machine telemetry selections", () => {
    const valid = new Map([
      ["a", new Set(["temperature", "pressure"])],
      ["b", new Set(["speed"])],
    ]);
    expect(parseMachineCardParameters('{"a":["temperature","pressure","temperature","missing"],"b":"speed","deleted":["speed"]}', valid)).toEqual({ a: ["temperature", "pressure"], b: ["speed"] });
    expect(parseMachineCardParameters('{"a":"temperature"}', valid)).toEqual({ a: ["temperature"] });
    expect(parseMachineCardParameters("not-json", valid)).toEqual({});
  });

  it("finds and formats the selected live telemetry value", () => {
    const machine = { variables: [{ key: "temperature", label: "Temperature", value: 42.1256, unit: "°C" }] } as never;
    expect(machineCardVariable(machine, "temperature")?.label).toBe("Temperature");
    expect(formatMachineCardValue(42.1256, "°C")).toBe("42.126 °C");
    expect(formatMachineCardValue(false)).toBe("Off");
    expect(formatMachineCardValue(null, "bar")).toBe("—");
  });

  it("uses the machine's operational state on the card", () => {
    expect(machineStatePresentation({ state: "down" } as never)).toEqual({ label: "Down", color: "#ef4444" });
    expect(machineStatePresentation(undefined)).toEqual({ label: "No data", color: "#94a3b8" });
  });
});

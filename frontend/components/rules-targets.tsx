"use client";

import { Activity, Check, PackageSearch, ShieldCheck, Truck, Wrench } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";

import { useFactory } from "@/lib/factory-context";
import type { FactoryTargets } from "@/lib/factory-domain";
import { useVariant } from "@/lib/variant";

type NumericTarget = Exclude<keyof FactoryTargets, "downtimeUnit">;

const mushroomTargetGroups = [
  {
    title: "Crop performance",
    description: "Targets used to judge substrate conversion, harvest and saleability.",
    icon: Activity,
    rules: [
      { key: "biologicalEfficiency", label: "Biological efficiency", help: "Minimum harvest per dry substrate", unit: "%" },
      { key: "planAttainment", label: "Harvest plan attainment", help: "Minimum actual against planned harvest", unit: "%" },
      { key: "saleableYield", label: "Saleable yield", help: "Minimum saleable share of harvest", unit: "%" },
    ],
  },
  {
    title: "Room & crop guardrails",
    description: "Limits that turn climate, contamination and farm losses into exceptions.",
    icon: Wrench,
    rules: [
      { key: "contaminationRate", label: "Maximum contamination", help: "Alert above this contaminated share", unit: "%" },
      { key: "environmentCompliance", label: "Climate compliance", help: "Minimum readings within stage limits", unit: "%" },
      { key: "waterProductivity", label: "Water productivity", help: "Minimum harvest per kilolitre", unit: "kg/kL" },
      { key: "downtimeMinutes", label: "Room downtime alert", help: "Alert above this room or asset loss", unit: "min" },
    ],
  },
  {
    title: "Supply continuity",
    description: "Minimum performance expected from inventory and suppliers.",
    icon: Truck,
    rules: [
      { key: "stockCoverDays", label: "Material risk threshold", help: "Flag material below this cover", unit: "days" },
      { key: "supplierScore", label: "Minimum supplier score", help: "Alert below this delivery score", unit: "/ 100" },
    ],
  },
] as const satisfies ReadonlyArray<{
  title: string;
  description: string;
  icon: typeof Activity;
    rules: ReadonlyArray<{ key: NumericTarget; label: string; help: string; unit: string }>;
}>;

const automotiveTargetGroups = [
  {
    title: "Equipment effectiveness",
    description: "Targets used to judge productive time, speed and accepted output.",
    icon: Activity,
    rules: [
      { key: "oee", label: "Overall equipment effectiveness", help: "Minimum combined availability, performance and quality", unit: "%" },
      { key: "availability", label: "Availability", help: "Minimum runtime against planned production time", unit: "%" },
      { key: "performance", label: "Performance", help: "Minimum ideal output against actual run time", unit: "%" },
      { key: "quality", label: "Quality", help: "Minimum accepted share of total output", unit: "%" },
    ],
  },
  {
    title: "Production guardrails",
    description: "Limits that turn missed plans, rejects and downtime into exceptions.",
    icon: Wrench,
    rules: [
      { key: "planAttainment", label: "Plan attainment", help: "Minimum actual against planned output", unit: "%" },
      { key: "rejectionRate", label: "Maximum rejection", help: "Alert above this rejected share", unit: "%" },
      { key: "downtimeMinutes", label: "Downtime alert", help: "Alert above this machine or line loss", unit: "min" },
    ],
  },
  {
    title: "Supply continuity",
    description: "Minimum performance expected from inventory and suppliers.",
    icon: Truck,
    rules: [
      { key: "stockCoverDays", label: "Material risk threshold", help: "Flag material below this cover", unit: "days" },
      { key: "supplierScore", label: "Minimum supplier score", help: "Alert below this delivery score", unit: "/ 100" },
    ],
  },
] as const satisfies ReadonlyArray<{
  title: string;
  description: string;
  icon: typeof Activity;
  rules: ReadonlyArray<{ key: NumericTarget; label: string; help: string; unit: string }>;
}>;

function RulesEditor() {
  const variant = useVariant();
  const targetGroups = variant.features.mushroomAnalytics ? mushroomTargetGroups : automotiveTargetGroups;
  const { state, updateTargets } = useFactory();
  const [values, setValues] = useState(state.targets);
  const [saved, setSaved] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    await updateTargets(values);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  }

  return (
    <form onSubmit={save}>
      <div className="rules-overview panel">
        <div><ShieldCheck size={19} /><span><strong>{variant.features.mushroomAnalytics ? "Farm" : "Factory"}-level rule set</strong><small>Applied only to the selected {variant.terminology.siteSingular}</small></span></div>
        <div><PackageSearch size={19} /><span><strong>Evidence-backed alerts</strong><small>Every exception retains its threshold and observed value</small></span></div>
        <span className="configuration-state">Rule set v1</span>
      </div>
      <div className="rule-group-grid">
        {targetGroups.map((group) => {
          const Icon = group.icon;
          return (
            <section className="panel rule-group-card" key={group.title}>
              <header><span><Icon size={17} /></span><div><h2>{group.title}</h2><p>{group.description}</p></div></header>
              <div>
                {group.rules.map((rule) => (
                  <label key={rule.key}>
                    <span><strong>{rule.label}</strong><small>{rule.help}</small></span>
                    <span className={`target-input${rule.key === "downtimeMinutes" ? " downtime-target-input" : ""}`}>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={rule.key === "downtimeMinutes" && values.downtimeUnit === "hours" ? Number((values.downtimeMinutes / 60).toFixed(2)) : values[rule.key]}
                        onChange={(event) => {
                          const entered = Number(event.target.value);
                          setValues({ ...values, [rule.key]: rule.key === "downtimeMinutes" && values.downtimeUnit === "hours" ? entered * 60 : entered });
                        }}
                      />
                      {rule.key === "downtimeMinutes" ? (
                        <select aria-label="Downtime target unit" value={values.downtimeUnit} onChange={(event) => setValues({ ...values, downtimeUnit: event.target.value as FactoryTargets["downtimeUnit"] })}>
                          <option value="minutes">Minutes</option>
                          <option value="hours">Hours</option>
                        </select>
                      ) : <b>{rule.unit}</b>}
                    </span>
                  </label>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <div className="rules-save-bar panel"><span>{saved && <><Check size={14} /> Rules saved and applied</>}</span><p>Changes affect alerts and decision thresholds immediately.</p><button className="button button-primary">Save rules & targets</button></div>
    </form>
  );
}

export function RulesTargets() {
  const { state } = useFactory();
  const factory = state.factories.find((item) => item.id === state.activeFactoryId);
  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">Manage · decision rules</p><h1>Set the limits. <span>Keep decisions consistent.</span></h1><p className="page-subtitle">Targets control how {factory?.name ?? "this factory"} is evaluated. Calculations remain unchanged and auditable.</p></div>
      </header>
      <RulesEditor key={state.activeFactoryId} />
    </>
  );
}

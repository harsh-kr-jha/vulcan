import {
  Activity,
  Boxes,
  Clock3,
  MoveDownRight,
  MoveUpRight,
  Sparkles,
} from "lucide-react";
import type { KpiMetric } from "@/lib/types";

const metricIcons = {
  oee: Activity,
  output: Boxes,
  quality: Sparkles,
  downtime: Clock3,
};

export function KpiCard({ metric }: { metric: KpiMetric }) {
  const Icon = metricIcons[metric.code as keyof typeof metricIcons] ?? Activity;
  const DeltaIcon = metric.direction === "down" ? MoveDownRight : MoveUpRight;
  const positive =
    (metric.code === "downtime" && metric.direction === "down") ||
    (metric.code !== "downtime" && metric.direction === "up");

  return (
    <article className={`kpi-card kpi-${metric.status}`}>
      <div className="kpi-card-top">
        <span className="kpi-icon"><Icon size={18} /></span>
        <span className={`delta ${positive ? "delta-positive" : "delta-negative"}`}>
          <DeltaIcon size={14} />
          {metric.delta}%
        </span>
      </div>
      <p>{metric.label}</p>
      <div className="kpi-value-row">
        <strong>{metric.formattedValue}</strong>
      </div>
      <div className="kpi-target-row">
        <span>{metric.target}</span>
        <i>
          <b style={{
            width:
              metric.code === "output"
                ? "92%"
                : metric.code === "downtime"
                  ? "76%"
                  : `${Math.min(metric.value * 100, 100)}%`,
          }} />
        </i>
      </div>
    </article>
  );
}

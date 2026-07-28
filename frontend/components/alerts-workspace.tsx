"use client";

import {
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Filter,
  Lightbulb,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { SeverityPill } from "@/components/ui/status-pill";
import type { OperationalAlert } from "@/lib/types";

const statusLabels: Record<OperationalAlert["status"], string> = {
  new: "New",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

export function AlertsWorkspace({ initialAlerts }: { initialAlerts: OperationalAlert[] }) {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [selectedId, setSelectedId] = useState(initialAlerts[0]?.id);
  const [filter, setFilter] = useState<"open" | "all" | OperationalAlert["severity"]>("open");
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () =>
      alerts.filter((alert) => {
        const matchesFilter =
          filter === "all" ||
          (filter === "open" && alert.status !== "resolved" && alert.status !== "dismissed") ||
          alert.severity === filter;
        const matchesQuery = `${alert.title} ${alert.asset}`.toLowerCase().includes(query.toLowerCase());
        return matchesFilter && matchesQuery;
      }),
    [alerts, filter, query],
  );

  const selected = alerts.find((alert) => alert.id === selectedId) ?? filtered[0];

  function updateStatus(id: string, status: OperationalAlert["status"]) {
    setAlerts((current) => current.map((alert) => alert.id === id ? { ...alert, status } : alert));
  }

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Exception centre</p>
          <h1>Alerts <span>& recommendations</span></h1>
          <p className="page-subtitle">Prioritised, traceable signals from factory rules and approved data.</p>
        </div>
        <div className="page-actions">
          <button className="button button-secondary"><SlidersHorizontal size={14} /> Manage rules</button>
        </div>
      </header>

      <div className="alert-kpi-strip">
        <div><span className="alert-stat-icon stat-critical">!</span><p><strong>1</strong><small>Critical</small></p></div>
        <div><span className="alert-stat-icon stat-new">3</span><p><strong>New</strong><small>Awaiting triage</small></p></div>
        <div><span className="alert-stat-icon stat-time"><Clock3 size={16} /></span><p><strong>38 min</strong><small>Avg. response time</small></p></div>
        <div><span className="alert-stat-icon stat-good"><CheckCircle2 size={16} /></span><p><strong>92%</strong><small>Resolved in shift</small></p></div>
      </div>

      <section className="alerts-workspace panel">
        <div className="alerts-list-pane">
          <div className="alerts-list-toolbar">
            <label className="search-field">
              <Search size={14} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search alerts…" />
            </label>
            <label className="filter-control compact-filter">
              <Filter size={12} />
              <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
                <option value="open">Open</option>
                <option value="all">All alerts</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <ChevronDown size={12} />
            </label>
          </div>

          <div className="alert-cards">
            {filtered.map((alert) => (
              <button
                className={`alert-card ${selected?.id === alert.id ? "selected" : ""}`}
                key={alert.id}
                onClick={() => setSelectedId(alert.id)}
              >
                <div className="alert-card-top">
                  <SeverityPill severity={alert.severity} />
                  <time>{alert.relativeTime}</time>
                </div>
                <strong>{alert.title}</strong>
                <p>{alert.description}</p>
                <div className="alert-card-bottom">
                  <span>{alert.asset}</span>
                  <i>{statusLabels[alert.status]}</i>
                </div>
              </button>
            ))}
            {filtered.length === 0 && <div className="empty-state">No alerts match these filters.</div>}
          </div>
        </div>

        {selected ? (
          <article className="alert-detail-pane">
            <div className="alert-detail-header">
              <div>
                <div className="alert-detail-meta">
                  <SeverityPill severity={selected.severity} />
                  <span>{selected.id}</span>
                  <span>{statusLabels[selected.status]}</span>
                </div>
                <h2>{selected.title}</h2>
                <p>{selected.asset} · {selected.relativeTime}</p>
              </div>
              <div className="alert-actions">
                {selected.status === "new" && (
                  <button className="button button-secondary" onClick={() => updateStatus(selected.id, "acknowledged")}>
                    <Check size={13} /> Acknowledge
                  </button>
                )}
                {selected.status !== "resolved" && (
                  <button className="button button-primary" onClick={() => updateStatus(selected.id, "resolved")}>
                    <CheckCircle2 size={13} /> Resolve
                  </button>
                )}
              </div>
            </div>

            <div className="alert-explanation">
              <span><Sparkles size={15} /></span>
              <div><strong>What happened</strong><p>{selected.description}</p></div>
            </div>

            <div className="alert-evidence-grid">
              <div><small>Observed</small><strong>{selected.observed}</strong></div>
              <div><small>Rule threshold</small><strong>{selected.threshold}</strong></div>
              <div><small>Evaluation</small><strong>Current shift</strong></div>
            </div>

            <div className="recommendation-card">
              <div className="recommendation-heading">
                <span><Lightbulb size={16} /></span>
                <div><strong>Recommended response</strong><small>Approved template · confidence: high</small></div>
              </div>
              <p>{selected.recommendation}</p>
              <div className="recommendation-actions">
                <button className="button button-secondary">Dismiss</button>
                <button className="button button-primary">Create action</button>
              </div>
            </div>

            <div className="traceability-section">
              <h3>Traceability</h3>
              <dl>
                <div><dt>Rule version</dt><dd>{selected.ruleVersion}</dd></div>
                <div><dt>Input records</dt><dd><button>View 4 source records</button></dd></div>
                <div><dt>Generated</dt><dd>29 Jul 2026 · 11:42 IST</dd></div>
                <div><dt>Source upload</dt><dd><button>UPL-2045</button></dd></div>
              </dl>
            </div>
          </article>
        ) : (
          <div className="empty-state alert-detail-empty">Select an alert to inspect its evidence.</div>
        )}
      </section>
    </>
  );
}

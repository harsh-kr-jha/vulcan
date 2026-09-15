"use client";

import {
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileSearch,
  Filter,
  Lightbulb,
  Search,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CommandFilters } from "@/components/command-filters";
import { SeverityPill } from "@/components/ui/status-pill";
import { useFactory } from "@/lib/factory-context";

export function AlertsWorkspace() {
  const { intelligence, updateAlertStatus, createAction, state, toggleAction } = useFactory();
  const [selectedId, setSelectedId] = useState(intelligence.alerts[0]?.id ?? "");
  const [filter, setFilter] = useState("open");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const alerts = useMemo(() => intelligence.alerts.filter((alert) => (filter === "all" || filter === "open" && !["resolved", "dismissed"].includes(alert.status) || alert.severity === filter) && `${alert.title} ${alert.asset}`.toLowerCase().includes(query.toLowerCase())), [intelligence.alerts, filter, query]);
  const selected = intelligence.alerts.find((alert) => alert.id === selectedId) ?? alerts[0];
  const newCount = intelligence.alerts.filter((alert) => alert.status === "new").length;
  const critical = intelligence.alerts.filter((alert) => alert.severity === "critical" && alert.status !== "resolved").length;

  function status(id: string, next: "new" | "acknowledged" | "resolved" | "dismissed", copy: string) { updateAlertStatus(id, next); setMessage(copy); }

  return <><header className="page-header"><div><p className="eyebrow">Exception centre · rule based</p><h1>Alerts <span>& actions</span></h1><p className="page-subtitle">Prioritised issues with source evidence, thresholds and recommended responses.</p></div><Link href="/rules" className="button button-secondary"><Settings2 size={14} /> Manage rules</Link></header><CommandFilters compact />
    <div className="alert-kpi-strip"><div><span className="alert-stat-icon stat-critical">!</span><p><strong>{critical}</strong><small>Critical</small></p></div><div><span className="alert-stat-icon stat-new">{newCount}</span><p><strong>New</strong><small>Awaiting triage</small></p></div><div><span className="alert-stat-icon stat-time"><Clock3 size={16} /></span><p><strong>{state.actions.filter((action) => action.status === "open").length}</strong><small>Open actions</small></p></div><div><span className="alert-stat-icon stat-good"><CheckCircle2 size={16} /></span><p><strong>{state.actions.filter((action) => action.status === "done").length}</strong><small>Completed actions</small></p></div></div>
    {message && <button className="page-toast" onClick={() => setMessage("")}><Check size={13} />{message}<X size={12} /></button>}
    <section className="alerts-workspace panel"><div className="alerts-list-pane"><div className="alerts-list-toolbar"><label className="search-field"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search alerts…" /></label><label className="filter-control compact-filter"><Filter size={12} /><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="open">Open</option><option value="all">All alerts</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select><ChevronDown size={12} /></label></div><div className="alert-cards">{alerts.map((alert) => <button className={`alert-card ${selected?.id === alert.id ? "selected" : ""}`} key={alert.id} onClick={() => setSelectedId(alert.id)}><div className="alert-card-top"><SeverityPill severity={alert.severity} /><time>{alert.relativeTime}</time></div><strong>{alert.title}</strong><p>{alert.description}</p><div className="alert-card-bottom"><span>{alert.asset}</span><i>{alert.status}</i></div></button>)}{!alerts.length && <div className="empty-state">No alerts match these filters.</div>}</div></div>
      {selected ? <article className="alert-detail-pane"><div className="alert-detail-header"><div><div className="alert-detail-meta"><SeverityPill severity={selected.severity} /><span>{selected.id}</span><span>{selected.status}</span></div><h2>{selected.title}</h2><p>{selected.asset} · {selected.relativeTime}</p></div><div className="alert-actions">{selected.status === "new" && <button className="button button-secondary" onClick={() => status(selected.id, "acknowledged", "Alert acknowledged")}><Check size={13} /> Acknowledge</button>}{selected.status !== "resolved" && <button className="button button-primary" onClick={() => status(selected.id, "resolved", "Alert resolved")}><CheckCircle2 size={13} /> Resolve</button>}</div></div>
        <div className="alert-explanation"><span><Sparkles size={15} /></span><div><strong>What happened</strong><p>{selected.description}</p></div></div>
        <div className="alert-evidence-grid"><div><small>Observed</small><strong>{selected.observed}</strong></div><div><small>Rule threshold</small><strong>{selected.threshold}</strong></div><div><small>Evaluation</small><strong>Selected period</strong></div></div>
        <div className="recommendation-card"><div className="recommendation-heading"><span><Lightbulb size={16} /></span><div><strong>Recommended response</strong><small>Approved rule template · explainable</small></div></div><p>{selected.recommendation}</p><div className="recommendation-actions"><button className="button button-secondary" onClick={() => status(selected.id, "dismissed", "Alert dismissed")}>Dismiss</button><button className="button button-primary" onClick={() => { void createAction(selected.id, selected.title); setMessage("Action created for the factory team"); }}><Sparkles size={12} /> Create action</button></div></div>
        <div className="traceability-section"><h3>Evidence and traceability</h3><dl><div><dt>Rule version</dt><dd>{selected.ruleVersion}</dd></div><div><dt>Supporting data</dt><dd>{selected.evidence.join(" · ")}</dd></div><div><dt>Evaluation period</dt><dd>Current command-centre filters</dd></div><div><dt>Source records</dt><dd><Link href="/data"><FileSearch size={11} /> Inspect source lineage</Link></dd></div></dl></div>
        {state.actions.filter((action) => action.alertId === selected.id).length > 0 && <div className="action-register"><h3>Action register</h3>{state.actions.filter((action) => action.alertId === selected.id).map((action) => <button key={action.id} onClick={() => toggleAction(action.id)}><span className={action.status}>{action.status === "done" ? <Check size={12} /> : ""}</span><div><strong>{action.title}</strong><small>{action.owner} · due {action.dueDate}</small></div><b>{action.status}</b></button>)}</div>}
      </article> : <div className="empty-state alert-detail-empty">Select an alert to inspect its evidence.</div>}
    </section>
  </>;
}

"use client";

import type { EChartsOption } from "echarts";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Download,
  ExternalLink,
  FileSearch,
  Lightbulb,
  Send,
  ShieldAlert,
  Sparkles,
  Target,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { Chart } from "@/components/charts/chart";
import { CommandFilters } from "@/components/command-filters";
import { useFactory } from "@/lib/factory-context";
import { downloadBlob } from "@/lib/browser-files";

const questions = [
  "Which orders are at risk?",
  "Why is production below plan?",
  "Which machine is the biggest bottleneck?",
  "Which material may run out soon?",
  "What caused the most loss this week?",
  "Which product has the highest rejection?",
];

const colors = { plan: "#b9c0bc", actual: "#416f57", good: "#9abb55", red: "#d95443", amber: "#d8932e", blue: "#577fbc" };

function PanelHeader({ number, title, subtitle, href }: { number: number; title: string; subtitle: string; href?: string }) {
  return <div className="panel-header command-panel-header"><div className="widget-number">{number}</div><div className="panel-title-group"><h2 className="panel-title">{title}</h2><p className="panel-subtitle">{subtitle}</p></div>{href && <Link className="panel-action" href={href}>Explore <ArrowRight size={12} /></Link>}</div>;
}

function ProductionWidget() {
  const { intelligence } = useFactory();
  const option = useMemo<EChartsOption>(() => ({
    animationDuration: 500,
    grid: { left: 43, right: 15, top: 24, bottom: 30 },
    tooltip: { trigger: "axis", backgroundColor: "#17211d", borderWidth: 0, textStyle: { color: "#fff", fontSize: 10 } },
    legend: { top: 0, right: 5, itemWidth: 8, itemHeight: 8, textStyle: { color: "#7c8781", fontSize: 8 } },
    xAxis: { type: "category", data: intelligence.productionTrend.map((row) => row.date.slice(5)), axisLine: { lineStyle: { color: "#e3e6e1" } }, axisTick: { show: false }, axisLabel: { color: "#7c8781", fontSize: 8 } },
    yAxis: { type: "value", axisLabel: { color: "#7c8781", fontSize: 8, formatter: (value: number) => `${Math.round(value / 1000)}k` }, splitLine: { lineStyle: { color: "#edf0ec", type: "dashed" } } },
    series: [
      { name: "Planned", type: "line", symbol: "none", lineStyle: { color: colors.plan, type: "dashed", width: 1.5 }, data: intelligence.productionTrend.map((row) => row.planned) },
      { name: "Actual", type: "line", smooth: true, symbolSize: 5, lineStyle: { color: colors.actual, width: 2.5 }, itemStyle: { color: colors.actual }, areaStyle: { color: "rgba(65,111,87,.09)" }, data: intelligence.productionTrend.map((row) => row.actual) },
      { name: "Good", type: "line", smooth: true, symbol: "none", lineStyle: { color: colors.good, width: 2 }, data: intelligence.productionTrend.map((row) => row.good) },
    ],
  }), [intelligence.productionTrend]);
  return <section className="panel command-widget production-widget"><PanelHeader number={1} title="Production plan vs actual" subtitle="Planned, produced and good output" href="/performance?tab=Production" /><div className="command-metric-row"><div><span>Plan</span><strong>{intelligence.totals.planned.toLocaleString("en-IN")}</strong></div><div><span>Actual</span><strong>{intelligence.totals.actual.toLocaleString("en-IN")}</strong></div><div><span>Good</span><strong>{intelligence.totals.good.toLocaleString("en-IN")}</strong></div><div><span>Attainment</span><strong className={intelligence.totals.planAttainment < 90 ? "text-danger" : "text-good"}>{intelligence.totals.planAttainment.toFixed(1)}%</strong></div></div>{intelligence.productionTrend.length ? <Chart option={option} height={240} /> : <EmptyData type="production" />}</section>;
}

function OeeWidget() {
  const { intelligence } = useFactory();
  const metrics = [{ label: "Availability", value: intelligence.oee.availability, color: colors.amber }, { label: "Performance", value: intelligence.oee.performance, color: colors.blue }, { label: "Quality", value: intelligence.oee.quality, color: colors.actual }, { label: "OEE", value: intelligence.oee.value, color: intelligence.oee.value < 65 ? colors.red : colors.actual }];
  return <section className="panel command-widget"><PanelHeader number={2} title="OEE & factory performance" subtitle="Explainable operating effectiveness" href="/performance?tab=OEE" /><div className="oee-rings">{metrics.map((metric) => <div key={metric.label}><div className="oee-ring" style={{ background: `conic-gradient(${metric.color} ${Math.min(metric.value, 100)}%, #e9ece8 0)` }}><span><strong>{metric.value.toFixed(1)}%</strong></span></div><b>{metric.label}</b></div>)}</div><div className="formula-trace"><span><Target size={13} /> Formula v1</span><p><b>{intelligence.oee.availability.toFixed(1)}%</b> × <b>{intelligence.oee.performance.toFixed(1)}%</b> × <b>{intelligence.oee.quality.toFixed(1)}%</b> = <strong>{intelligence.oee.value.toFixed(1)}%</strong></p><small>Run {Math.round(intelligence.oee.runMinutes).toLocaleString("en-IN")} of {intelligence.oee.plannedMinutes.toLocaleString("en-IN")} planned minutes</small></div></section>;
}

function OrdersWidget() {
  const { intelligence } = useFactory();
  return <section className="panel command-widget"><PanelHeader number={3} title="Orders at risk" subtitle="Projected delay based on remaining output and constraints" /><div className="risk-table">{intelligence.orderRisks.slice(0, 4).map((order) => <div className="risk-order-row" key={order.orderId}><div><span className={`risk-badge risk-${order.risk}`}>{order.risk}</span><strong>{order.orderId}</strong><small>{order.sku} · due {order.dueDate}</small></div><div className="completion-cell"><span><b style={{ width: `${Math.min(order.completion, 100)}%` }} /></span><strong>{order.completion.toFixed(0)}%</strong></div><p>{order.reason}</p><b>{order.remaining.toLocaleString("en-IN")} units left</b></div>)}{!intelligence.orderRisks.length && <EmptyData type="orders" />}</div></section>;
}

function DowntimeWidget() {
  const { intelligence } = useFactory();
  const max = intelligence.machineLoss[0]?.minutes || 1;
  return <section className="panel command-widget"><PanelHeader number={4} title="Downtime & bottlenecks" subtitle="Assets creating the most production loss" href="/performance?tab=Downtime" /><div className="ranked-bars">{intelligence.machineLoss.slice(0, 5).map((item, index) => <div key={item.machine}><span className="rank-number">{index + 1}</span><div><span><strong>{item.machine}</strong><small>{item.line} · {item.occurrences} stops</small></span><i><b style={{ width: `${item.minutes / max * 100}%` }} /></i></div><strong>{item.minutes} min</strong></div>)}{!intelligence.machineLoss.length && <EmptyData type="downtime" />}</div><div className="widget-insight"><Lightbulb size={14} /><span><b>Largest reason:</b> {intelligence.reasonLoss[0]?.reason ?? "No classified loss"}{intelligence.reasonLoss[0] ? ` · ${intelligence.reasonLoss[0].minutes} min` : ""}</span></div></section>;
}

function QualityWidget() {
  const { intelligence } = useFactory();
  const max = intelligence.defectLoss[0]?.rejected || 1;
  return <section className="panel command-widget"><PanelHeader number={5} title="Quality losses" subtitle="Rejection, rework and first-pass yield" href="/performance?tab=Quality" /><div className="quality-hero"><div><span>First-pass yield</span><strong>{intelligence.totals.firstPassYield.toFixed(1)}%</strong></div><div><span>Rejected</span><strong>{intelligence.totals.rejected.toLocaleString("en-IN")}</strong></div><div><span>Reworked</span><strong>{intelligence.totals.reworked.toLocaleString("en-IN")}</strong></div></div><div className="defect-bars">{intelligence.defectLoss.slice(0, 4).map((defect) => <div key={defect.reason}><span><b>{defect.reason}</b><strong>{defect.rejected}</strong></span><i><b style={{ width: `${defect.rejected / max * 100}%` }} /></i></div>)}{!intelligence.defectLoss.length && <EmptyData type="quality" />}</div></section>;
}

function InventoryWidget() {
  const { intelligence } = useFactory();
  return <section className="panel command-widget"><PanelHeader number={6} title="Inventory & material risk" subtitle="Stock cover, projected stock-outs and receipts" href="/performance?tab=Inventory" /><div className="material-risk-list">{intelligence.inventoryRisks.slice(0, 4).map((item) => <div key={item.id}><span className={`material-state ${item.stockDays < 2 ? "critical" : item.stockDays < 4 ? "high" : "watch"}`}><b>{item.stockDays.toFixed(1)}</b><small>days</small></span><div><strong>{item.material}</strong><span>{item.supplier} · stock-out {item.projectedStockout}</span><small className={item.receiptStatus === "delayed" ? "text-danger" : "text-good"}>{item.receiptStatus === "delayed" ? `Receipt delayed to ${item.expectedReceiptDate}` : `Receipt expected ${item.expectedReceiptDate ?? "unconfirmed"}`}</small></div></div>)}{!intelligence.inventoryRisks.length && <EmptyData type="inventory" />}</div></section>;
}

function AlertsWidget() {
  const { intelligence, updateAlertStatus, createAction, state } = useFactory();
  const [message, setMessage] = useState("");
  const priorityAlerts = intelligence.alerts.filter((alert) => alert.status !== "resolved").slice(0, 3);
  return <section className="panel command-widget alerts-command-widget"><PanelHeader number={7} title="Priority alerts & recommended actions" subtitle="What the factory owner should act on first" href="/alerts" /><div className="priority-alerts">{priorityAlerts.map((alert) => <article key={alert.id}><i className={`alert-indicator ${alert.severity}`} /><div><span><b>{alert.title}</b><small>{alert.asset} · {alert.observed}</small></span><p>{alert.recommendation}</p><div><button onClick={() => { void updateAlertStatus(alert.id, "acknowledged"); setMessage("Alert acknowledged"); }}><CheckCircle2 size={12} /> Acknowledge</button><button onClick={() => { void createAction(alert.id, alert.title); setMessage("Action created for the factory team"); }}><Sparkles size={12} /> Create action</button><Link href="/alerts"><FileSearch size={12} /> Evidence</Link></div></div></article>)}{!priorityAlerts.length && <div className="all-clear"><CheckCircle2 size={24} /><strong>No priority alerts</strong><span>All configured rules are within range.</span></div>}</div>{message && <button className="inline-toast" onClick={() => setMessage("")}>{message} · {state.actions.filter((action) => action.status === "open").length} open action(s) <span>×</span></button>}</section>;
}

function EmptyData({ type }: { type: string }) {
  return <div className="widget-empty"><FileSearch size={18} /><span>No {type} data matches these filters.</span><Link href="/uploads">Add data <ArrowRight size={11} /></Link></div>;
}

function OperationsTerminal() {
  const { askQuestion } = useFactory();
  const [question, setQuestion] = useState("What should the factory owner act on first?");
  const [latest, setLatest] = useState({ question: "Ask a question about the selected factory data.", answer: { answer: "Your answer will be calculated in Django.", reasoning: "Only validated database records are used.", evidence: [] as string[] } });
  const [loading, setLoading] = useState(false);
  async function ask(value = question) { const trimmed = value.trim(); if (!trimmed) return; setLoading(true); try { const answer = await askQuestion(trimmed); setLatest({ question: trimmed, answer }); setQuestion(""); } finally { setLoading(false); } }
  function submit(event: FormEvent) { event.preventDefault(); void ask(); }
  return <section className="operations-terminal"><div className="terminal-heading"><span><Bot size={17} /></span><div><strong>Ask Vulcan</strong><small>Rule-based answer calculated by Django</small></div><i><b /> Live from validated records</i></div><div className="terminal-body"><div className="terminal-question"><span>factory-owner:~$</span> {latest.question}</div><div className="terminal-answer"><strong>{loading ? "Calculating…" : latest.answer.answer}</strong><p>{latest.answer.reasoning}</p><div>{latest.answer.evidence.map((item) => <span key={item}>{item}</span>)}</div></div></div><div className="question-chips">{questions.slice(0, 4).map((item) => <button key={item} onClick={() => void ask(item)}>{item}</button>)}</div><form className="terminal-input" onSubmit={submit}><span>›</span><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask an operational question…" /><button aria-label="Ask question" disabled={loading}><Send size={14} /></button></form></section>;
}

export function DashboardOverview() {
  const { state, filters, intelligence } = useFactory();
  const activeFactory = state.factories.find((factory) => factory.id === state.activeFactoryId);
  function exportSnapshot() { downloadBlob(JSON.stringify({ generatedAt: new Date().toISOString(), factory: activeFactory, filters, intelligence }, null, 2), `vulcan-command-centre-${filters.to}.json`, "application/json"); }
  return <>
    <header className="page-header command-centre-header"><div><p className="eyebrow">Factory command centre · {new Date(`${filters.to}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p><h1>See the loss. <span>Change the outcome.</span></h1><p className="page-subtitle">{activeFactory?.name} · every answer linked to its source records and calculation</p></div><div className="page-actions"><Link href="/uploads" className="button button-accent">Add factory data <ArrowRight size={14} /></Link><button className="button button-secondary" onClick={exportSnapshot}><Download size={14} /> Export snapshot</button></div></header>
    <CommandFilters />
    <div className="answer-summary-strip"><div><span>Production gap</span><strong>{Math.max(intelligence.totals.planned - intelligence.totals.actual, 0).toLocaleString("en-IN")} units</strong></div><div><span>OEE</span><strong>{intelligence.oee.value.toFixed(1)}%</strong></div><div><span>At-risk orders</span><strong>{intelligence.orderRisks.filter((order) => order.risk !== "watch").length}</strong></div><div><span>Top bottleneck</span><strong>{intelligence.machineLoss[0]?.machine ?? "—"}</strong></div><div><span>Materials at risk</span><strong>{intelligence.inventoryRisks.length}</strong></div><div><span>Open actions</span><strong>{state.actions.filter((action) => action.status === "open").length}</strong></div></div>
    <OperationsTerminal />
    <div className="command-centre-grid"><ProductionWidget /><OeeWidget /><OrdersWidget /><DowntimeWidget /><QualityWidget /><InventoryWidget /><AlertsWidget /></div>
    <div className="traceability-footer"><ShieldAlert size={14} /><span>Raw inputs are preserved. Calculations use approved mapped records only.</span><Link href="/uploads">Inspect data lineage <ExternalLink size={11} /></Link></div>
  </>;
}

"use client";

import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  Clock,
  Database,
  Download,
  ExternalLink,
  FileSearch,
  FileSpreadsheet,
  Gauge,
  Layers,
  Lightbulb,
  QrCode,
  ShieldAlert,
  Sliders,
  Sparkles,
  Truck,
  Workflow,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { CommandFilters } from "@/components/command-filters";
import { downloadBlob } from "@/lib/browser-files";
import { useFactory } from "@/lib/factory-context";

function HomeModuleGrid() {
  const { intelligence, twinFeed } = useFactory();
  const twin = intelligence.digitalTwin.summary;
  const hasProduction = intelligence.dataAvailability.production > 0;
  const reportingRooms = twinFeed.freshness.machines.reporting_count;
  const totalRooms = twinFeed.machines.length || twin.machines;
  const modules = [
    { href: "/digital-twin", label: "Mushroom factory twin", description: "See crop stages, growing rooms and layout map.", value: reportingRooms.toString(), status: `of ${totalRooms} rooms reporting live`, meta: `${twinFeed.freshness.machines.status === "fresh" ? "All telemetry live" : "Telemetry standby"}`, icon: Workflow },
    { href: "/data", label: "Live Twin Data", description: "Inspect incoming QR telemetry for rooms, inventory & dispatch.", value: twinFeed.recent_events.length.toString(), status: "QR events captured", meta: `Freshness: ${twinFeed.freshness.machines.status}`, icon: Database },
    { href: "/performance", label: "Cultivation", description: "Understand harvest, conversion, climate and crop loss.", value: `${(intelligence.mushroom?.biologicalEfficiency ?? 0).toFixed(1)}%`, status: "biological efficiency", meta: hasProduction ? `${(intelligence.mushroom?.planAttainment ?? 0).toFixed(1)}% harvest attainment` : "Awaiting harvest data", icon: Gauge },
  ];
  return <section className="home-module-section"><header><div><div><h2>Move through your mushroom factory</h2><p>Open a workspace directly and see the current crop state.</p></div></div><small>3 cultivation modules</small></header><div className="home-module-grid">{modules.map((module) => { const Icon = module.icon; return <Link className="home-module-card" href={module.href} key={module.href}><span><Icon size={18} /></span><div><b>{module.label}</b><p>{module.description}</p><div className="home-module-status"><strong>{module.value}</strong><span>{module.status}</span></div><small>{module.meta}</small></div><ArrowRight size={15} /></Link>; })}</div></section>;
}

function PanelHeader({
  number,
  title,
  subtitle,
  href,
}: {
  number: number;
  title: string;
  subtitle: string;
  href?: string;
}) {
  return (
    <div className="panel-header command-panel-header">
      <div className="widget-number">{number}</div>
      <div className="panel-title-group">
        <h2 className="panel-title">{title}</h2>
        <p className="panel-subtitle">{subtitle}</p>
      </div>
      {href && (
        <Link className="panel-action" href={href}>
          Explore <ArrowRight size={12} />
        </Link>
      )}
    </div>
  );
}

function EmptyData({ type }: { type: string }) {
  return (
    <div className="widget-empty">
      <FileSearch size={18} />
      <span>No {type} data matches these filters.</span>
      <Link href="/data">
        Inspect live data <ArrowRight size={11} />
      </Link>
    </div>
  );
}

function TwinFreshnessDashboard() {
  const { twinFeed } = useFactory();

  const getStatusBadge = (status: "fresh" | "moderate" | "stale" | "no_data") => {
    if (status === "fresh") return <span style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 600, background: "rgba(65,111,87,0.15)", color: "#276749" }}>🟢 Fresh · Live</span>;
    if (status === "moderate") return <span style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 600, background: "rgba(221,107,32,0.15)", color: "#c05621" }}>🟡 &lt;24h ago</span>;
    if (status === "stale") return <span style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 600, background: "rgba(229,62,62,0.15)", color: "#c53030" }}>🔴 Needs update</span>;
    return <span style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 600, background: "rgba(113,128,150,0.15)", color: "#4a5568" }}>⚪ Awaiting scan</span>;
  };

  const formatTime = (ts: string | null) => {
    if (!ts) return "No scans recorded yet";
    const date = new Date(ts);
    const diffMin = Math.round((Date.now() - date.getTime()) / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffMin < 1440) return `${Math.round(diffMin / 60)}h ago`;
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const invMaterialsCount = twinFeed.inventory ? Object.keys(twinFeed.inventory.stock).length : 0;
  const dispatchAwaitingKg = twinFeed.dispatch ? Object.values(twinFeed.dispatch.awaiting).reduce((a, b) => a + b, 0) : 0;

  return (
    <section className="panel" style={{ padding: "20px", marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <h2 style={{ fontSize: "16px", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
            <Activity size={18} style={{ color: "var(--color-primary, #416f57)" }} />
            Mushroom Factory Twin · Live Data Freshness
          </h2>
          <p style={{ fontSize: "12px", color: "var(--color-text-muted)", margin: "4px 0 0 0" }}>
            Tracking live data incoming from QR codes attached to each machine, room, inventory, and dispatch.
          </p>
        </div>
        <Link href="/data" className="button button-secondary" style={{ fontSize: "12px" }}>
          View Data Feed <ArrowRight size={12} />
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
        {/* Element 1: Machines & Rooms */}
        <div style={{ border: "1px solid var(--color-border, #e2e8f0)", borderRadius: "8px", padding: "16px", background: "var(--color-card-bg, #ffffff)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600, fontSize: "13px" }}>
              <Wrench size={16} style={{ color: "#276749" }} />
              1. Machines &amp; Rooms
            </span>
            {getStatusBadge(twinFeed.freshness.machines.status)}
          </div>
          <p style={{ fontSize: "20px", fontWeight: 700, margin: "6px 0", color: "#276749" }}>
            {twinFeed.freshness.machines.reporting_count} / {twinFeed.machines.length || 0} <small style={{ fontSize: "12px", fontWeight: 400 }}>rooms active</small>
          </p>
          <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: "4px 0 10px 0" }}>
            Latest scan: <b>{formatTime(twinFeed.freshness.machines.last_updated)}</b>
          </p>
          <div style={{ borderTop: "1px solid var(--color-border, #edf2f7)", paddingTop: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>Climate &amp; run telemetry</span>
            <Link href="/data" style={{ fontSize: "11px", color: "var(--color-primary, #416f57)", fontWeight: 500 }}>Inspect rooms →</Link>
          </div>
        </div>

        {/* Element 2: Inventory */}
        <div style={{ border: "1px solid var(--color-border, #e2e8f0)", borderRadius: "8px", padding: "16px", background: "var(--color-card-bg, #ffffff)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600, fontSize: "13px" }}>
              <Boxes size={16} style={{ color: "#c05621" }} />
              2. Materials Inventory
            </span>
            {getStatusBadge(twinFeed.freshness.inventory.status)}
          </div>
          <p style={{ fontSize: "20px", fontWeight: 700, margin: "6px 0", color: "#c05621" }}>
            {invMaterialsCount} <small style={{ fontSize: "12px", fontWeight: 400 }}>materials tracked</small>
          </p>
          <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: "4px 0 10px 0" }}>
            Latest change: <b>{formatTime(twinFeed.freshness.inventory.last_updated)}</b>
          </p>
          <div style={{ borderTop: "1px solid var(--color-border, #edf2f7)", paddingTop: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>Substrates, spawn, soil</span>
            <Link href="/data" style={{ fontSize: "11px", color: "var(--color-primary, #416f57)", fontWeight: 500 }}>Inspect stock →</Link>
          </div>
        </div>

        {/* Element 3: Dispatch */}
        <div style={{ border: "1px solid var(--color-border, #e2e8f0)", borderRadius: "8px", padding: "16px", background: "var(--color-card-bg, #ffffff)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600, fontSize: "13px" }}>
              <Truck size={16} style={{ color: "#2b6cb0" }} />
              3. Dispatch &amp; Harvest
            </span>
            {getStatusBadge(twinFeed.freshness.dispatch.status)}
          </div>
          <p style={{ fontSize: "20px", fontWeight: 700, margin: "6px 0", color: "#2b6cb0" }}>
            {dispatchAwaitingKg.toLocaleString("en-IN")} <small style={{ fontSize: "12px", fontWeight: 400 }}>kg awaiting dispatch</small>
          </p>
          <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: "4px 0 10px 0" }}>
            Latest dispatch: <b>{formatTime(twinFeed.freshness.dispatch.last_updated)}</b>
          </p>
          <div style={{ borderTop: "1px solid var(--color-border, #edf2f7)", paddingTop: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>Fresh &amp; packed mushrooms</span>
            <Link href="/data" style={{ fontSize: "11px", color: "var(--color-primary, #416f57)", fontWeight: 500 }}>Inspect dispatch →</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function MachineAtTimeTWidget() {
  const { twinFeed } = useFactory();
  const machines = twinFeed.machines;
  const [selectedMachineId, setSelectedMachineId] = useState<string>("");

  const activeMachine =
    machines.find((m) => m.id === selectedMachineId) ||
    machines.find((m) => m.latest_observation) ||
    machines[0] ||
    null;

  const formatTimestamp = (ts: string | null) => {
    if (!ts) return null;
    const date = new Date(ts);
    const diffMin = Math.round((Date.now() - date.getTime()) / 60000);
    const relative =
      diffMin < 1
        ? "Just now"
        : diffMin < 60
          ? `${diffMin}m ago`
          : diffMin < 1440
            ? `${Math.round(diffMin / 60)}h ago`
            : `${Math.round(diffMin / 1440)}d ago`;
    return {
      formatted: date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      relative,
    };
  };

  const formatParamValue = (key: string, val: unknown) => {
    if (val === null || val === undefined || val === "") return "—";
    if (typeof val === "boolean") return val ? "Yes" : "No";
    if (typeof val === "number") {
      const lower = key.toLowerCase();
      if (lower.includes("temp")) return `${val.toFixed(1)} °C`;
      if (lower.includes("humid") || lower.includes("rh")) return `${val.toFixed(1)} %`;
      if (lower.includes("co2")) return `${val.toFixed(0)} ppm`;
      if (lower.includes("pressure")) return `${val.toFixed(2)} bar`;
      if (lower.includes("weight") || lower.includes("kg") || lower.includes("mass")) return `${val.toLocaleString("en-IN")} kg`;
      if (lower.includes("litre") || lower.includes("water") || lower.includes("vol")) return `${val.toLocaleString("en-IN")} L`;
      if (lower.includes("speed") || lower.includes("rpm")) return `${val.toFixed(0)} rpm`;
      if (lower.includes("power") || lower.includes("kw")) return `${val.toFixed(1)} kW`;
      if (lower.includes("flow") || lower.includes("air")) return `${val.toFixed(1)} m³/h`;
      if (lower.includes("runtime") || lower.includes("hour")) return `${val.toFixed(1)} hrs`;
      return val.toLocaleString("en-IN");
    }
    return String(val);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "reporting":
        return <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: 700, background: "rgba(65,111,87,0.15)", color: "#276749" }}>🟢 Operating · Live Telemetry</span>;
      case "warning":
        return <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: 700, background: "rgba(221,107,32,0.15)", color: "#c05621" }}>🟡 Warning · Needs Attention</span>;
      case "down":
        return <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: 700, background: "rgba(229,62,62,0.15)", color: "#c53030" }}>🔴 Machine Down</span>;
      case "idle":
        return <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: 700, background: "rgba(113,128,150,0.15)", color: "#4a5568" }}>⚪ Standby / Idle</span>;
      default:
        return <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: 700, background: "rgba(113,128,150,0.15)", color: "#718096" }}>⚪ Awaiting Initial Scan</span>;
    }
  };

  if (!activeMachine) {
    return (
      <section className="panel" style={{ padding: "28px", textAlign: "center", marginBottom: "20px" }}>
        <Workflow size={36} style={{ color: "var(--color-primary, #416f57)", margin: "0 auto 12px" }} />
        <h3 style={{ fontSize: "16px", margin: "0 0 6px 0" }}>No Machines or Rooms Configured in Twin</h3>
        <p style={{ fontSize: "13px", color: "var(--color-text-muted)", maxWidth: "520px", margin: "0 auto 16px" }}>
          Configure machines, input streams, and telemetry parameters in Mushroom Factory Twin to start receiving live QR telemetry.
        </p>
        <Link href="/digital-twin" className="button button-accent">
          Open Mushroom Factory Twin <ArrowRight size={14} />
        </Link>
      </section>
    );
  }

  const obs = activeMachine.latest_observation;
  const timeInfo = formatTimestamp(obs?.submitted_at || null);
  const values = obs?.values || {};
  const batchStage = (values.batch as string) || (values.batch_id as string) || (values.stage as string) || (values.crop_stage as string) || (values.phase as string) || null;

  return (
    <section className="panel" style={{ padding: "24px", marginBottom: "20px" }}>
      {/* Header & Title */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span style={{ background: "rgba(65,111,87,0.15)", color: "#276749", padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Live Operational Snapshot
            </span>
            <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
              {activeMachine.observation_count} observation{activeMachine.observation_count === 1 ? "" : "s"} logged
            </span>
          </div>
          <h2 style={{ fontSize: "20px", margin: 0, fontWeight: 700, display: "flex", alignItems: "center", gap: "10px" }}>
            <Workflow size={22} style={{ color: "var(--color-primary, #416f57)" }} />
            {activeMachine.name}
            {getStatusBadge(activeMachine.status)}
          </h2>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Link href="/data?category=machines" className="button button-secondary" style={{ fontSize: "12px" }}>
            <QrCode size={13} /> Record QR Entry
          </Link>
          <Link href="/data?category=machines&view=sheet" className="button button-secondary" style={{ fontSize: "12px" }}>
            <FileSpreadsheet size={13} /> Sheet Format
          </Link>
          <Link href="/digital-twin" className="button button-secondary" style={{ fontSize: "12px" }}>
            <Workflow size={13} /> View in Twin
          </Link>
          <Link href="/data" className="button button-secondary" style={{ fontSize: "12px" }}>
            <Database size={13} /> Data Stream
          </Link>
        </div>
      </div>

      {/* Machine Switcher Bar (if multiple machines) */}
      {machines.length > 1 && (
        <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "10px", marginBottom: "18px", borderBottom: "1px solid var(--color-border, #edf2f7)" }}>
          {machines.map((m) => {
            const isSelected = m.id === activeMachine.id;
            const hasData = Boolean(m.latest_observation);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMachineId(m.id)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "20px",
                  fontSize: "12px",
                  fontWeight: isSelected ? 600 : 500,
                  border: isSelected ? "1px solid var(--color-primary, #416f57)" : "1px solid var(--color-border, #e2e8f0)",
                  background: isSelected ? "rgba(65,111,87,0.12)" : "var(--color-card-bg, #ffffff)",
                  color: isSelected ? "var(--color-primary, #416f57)" : "var(--color-text, #2d3748)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: hasData ? "#38a169" : "#cbd5e0" }} />
                {m.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Time T Callout Strip */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--color-card-bg, #f8faf9)", border: "1px solid var(--color-border, #e2e8f0)", borderRadius: "8px", padding: "12px 16px", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Clock size={18} style={{ color: "var(--color-primary, #416f57)" }} />
          <div>
            <div style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: 700, color: "var(--color-text-muted)", letterSpacing: "0.5px" }}>
              Machine State at Time T
            </div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text, #1a202c)" }}>
              {timeInfo ? `${timeInfo.formatted} (${timeInfo.relative})` : "Awaiting Initial QR Scan"}
            </div>
          </div>
        </div>
        {batchStage && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(65,111,87,0.1)", padding: "4px 10px", borderRadius: "6px" }}>
            <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>Current Batch / Stage:</span>
            <b style={{ fontSize: "12px", color: "#276749" }}>{batchStage}</b>
          </div>
        )}
      </div>

      {/* 3-Column Stream Grid: Inflows (T) -> Telemetry (T) -> Outflows (T) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", marginBottom: "20px" }}>
        {/* Stream 1: Inflow Inputs */}
        <div style={{ border: "1px solid var(--color-border, #e2e8f0)", borderRadius: "8px", padding: "16px", background: "var(--color-card-bg, #ffffff)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", borderBottom: "1px solid var(--color-border, #edf2f7)", paddingBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, fontSize: "13px", color: "#2b6cb0" }}>
              <ArrowDownRight size={16} />
              Inflows at Time T
            </div>
            <small style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>Input Feeds</small>
          </div>

          {activeMachine.inputs && activeMachine.inputs.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {activeMachine.inputs.map((inp) => {
                const valKey = Object.keys(values).find((k) => k.toLowerCase() === inp.id.toLowerCase() || k.toLowerCase() === inp.label.toLowerCase() || k.toLowerCase().includes(inp.label.toLowerCase()));
                const observedVal = valKey ? values[valKey] : null;
                return (
                  <div key={inp.id} style={{ border: "1px solid #edf2f7", borderRadius: "6px", padding: "10px", background: "#fbfcfe" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600, fontSize: "13px" }}>{inp.label}</span>
                      <span style={{ fontSize: "11px", background: "rgba(43,108,176,0.1)", color: "#2b6cb0", padding: "2px 6px", borderRadius: "4px", fontWeight: 500 }}>
                        {inp.unitType}
                      </span>
                    </div>
                    <div style={{ marginTop: "4px", fontSize: "12px", color: observedVal ? "#2b6cb0" : "var(--color-text-muted)", fontWeight: observedVal ? 600 : 400 }}>
                      {observedVal !== null ? `Rate / Amount: ${formatParamValue(inp.label, observedVal)}` : "Nominal inflow feed active"}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: "16px 8px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "12px" }}>
              <Layers size={20} style={{ opacity: 0.5, margin: "0 auto 6px" }} />
              No input feeds configured for this machine.
              <div style={{ marginTop: "6px" }}>
                <Link href="/digital-twin" style={{ color: "var(--color-primary, #416f57)", fontWeight: 500 }}>
                  Configure inputs in Twin →
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Stream 2: Operating Telemetry & Parameters */}
        <div style={{ border: "1px solid var(--color-border, #e2e8f0)", borderRadius: "8px", padding: "16px", background: "var(--color-card-bg, #ffffff)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", borderBottom: "1px solid var(--color-border, #edf2f7)", paddingBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, fontSize: "13px", color: "var(--color-primary, #416f57)" }}>
              <Sliders size={16} />
              Machine Telemetry at Time T
            </div>
            <small style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>Parameters &amp; Sensors</small>
          </div>

          {activeMachine.parameters && activeMachine.parameters.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "10px" }}>
              {activeMachine.parameters.map((param) => {
                const val = values[param.key];
                const lower = param.key.toLowerCase();
                const isTempWarning = lower.includes("temp") && typeof val === "number" && (val > 28 || val < 16);
                const isHumidWarning = (lower.includes("humid") || lower.includes("rh")) && typeof val === "number" && val < 70;
                const isCo2Warning = lower.includes("co2") && typeof val === "number" && val > 1500;
                const hasWarning = isTempWarning || isHumidWarning || isCo2Warning;

                return (
                  <div
                    key={param.id}
                    style={{
                      border: hasWarning ? "1px solid #feb2b2" : "1px solid #edf2f7",
                      borderRadius: "6px",
                      padding: "10px",
                      background: hasWarning ? "#fff5f5" : "#f8faf9",
                    }}
                  >
                    <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "capitalize", marginBottom: "4px" }}>
                      {param.key.replace(/_/g, " ")}
                    </div>
                    <div style={{ fontSize: "16px", fontWeight: 700, color: hasWarning ? "#c53030" : "#276749" }}>
                      {formatParamValue(param.key, val)}
                    </div>
                    {hasWarning && (
                      <span style={{ fontSize: "9px", color: "#c53030", fontWeight: 600 }}>Threshold Alert</span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : Object.keys(values).length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "10px" }}>
              {Object.entries(values).map(([k, v]) => (
                <div key={k} style={{ border: "1px solid #edf2f7", borderRadius: "6px", padding: "10px", background: "#f8faf9" }}>
                  <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "capitalize", marginBottom: "4px" }}>
                    {k.replace(/_/g, " ")}
                  </div>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: "#276749" }}>
                    {formatParamValue(k, v)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: "16px 8px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "12px" }}>
              <Activity size={20} style={{ opacity: 0.5, margin: "0 auto 6px" }} />
              Awaiting telemetry data. Scan machine QR code to submit observation.
            </div>
          )}
        </div>

        {/* Stream 3: Outflow Outputs */}
        <div style={{ border: "1px solid var(--color-border, #e2e8f0)", borderRadius: "8px", padding: "16px", background: "var(--color-card-bg, #ffffff)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", borderBottom: "1px solid var(--color-border, #edf2f7)", paddingBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, fontSize: "13px", color: "#c05621" }}>
              <ArrowUpRight size={16} />
              Outflows at Time T
            </div>
            <small style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>Outputs &amp; Products</small>
          </div>

          {activeMachine.outputs && activeMachine.outputs.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {activeMachine.outputs.map((out) => {
                const valKey = Object.keys(values).find((k) => k.toLowerCase() === out.id.toLowerCase() || k.toLowerCase() === out.label.toLowerCase() || k.toLowerCase().includes(out.label.toLowerCase()));
                const observedVal = valKey ? values[valKey] : null;
                return (
                  <div key={out.id} style={{ border: "1px solid #edf2f7", borderRadius: "6px", padding: "10px", background: "#fbfcfe" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600, fontSize: "13px" }}>{out.label}</span>
                      <span style={{ fontSize: "11px", background: "rgba(192,86,33,0.1)", color: "#c05621", padding: "2px 6px", borderRadius: "4px", fontWeight: 500 }}>
                        {out.unitType}
                      </span>
                    </div>
                    <div style={{ marginTop: "4px", fontSize: "12px", color: observedVal ? "#c05621" : "var(--color-text-muted)", fontWeight: observedVal ? 600 : 400 }}>
                      {observedVal !== null ? `Output Yield: ${formatParamValue(out.label, observedVal)}` : "Nominal outflow stream active"}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: "16px 8px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "12px" }}>
              <Boxes size={20} style={{ opacity: 0.5, margin: "0 auto 6px" }} />
              No output streams configured for this machine.
              <div style={{ marginTop: "6px" }}>
                <Link href="/digital-twin" style={{ color: "var(--color-primary, #416f57)", fontWeight: 500 }}>
                  Configure outputs in Twin →
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* History Trend Mini-Strip (T-1, T-2) */}
      {activeMachine.history && activeMachine.history.length > 1 && (
        <div style={{ borderTop: "1px solid var(--color-border, #edf2f7)", paddingTop: "12px", display: "flex", alignItems: "center", gap: "12px", overflowX: "auto" }}>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
            Prior Scans (T - Δ):
          </span>
          {activeMachine.history.slice(1, 5).map((h) => {
            const hDate = new Date(h.submitted_at);
            const hVals = h.values || {};
            const keyReadings = Object.entries(hVals)
              .slice(0, 3)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ");
            return (
              <div key={h.id} style={{ fontSize: "11px", background: "#f7fafc", border: "1px solid #e2e8f0", padding: "3px 8px", borderRadius: "4px", whiteSpace: "nowrap" }}>
                <b>{hDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</b>
                <span style={{ color: "var(--color-text-muted)", marginLeft: "6px" }}>{keyReadings || "Logged"}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RoomConditionsWidget({ number }: { number: number }) {
  const { intelligence, twinFeed } = useFactory();

  const liveRooms = twinFeed.machines
    .filter((m) => m.latest_observation && Object.keys(m.latest_observation.values).length > 0)
    .map((m) => {
      const vals = m.latest_observation?.values ?? {};
      const temp = typeof vals.temperature === "number" ? vals.temperature : null;
      const hum = typeof vals.humidity === "number" ? vals.humidity : null;
      const co2 = typeof vals.co2 === "number" ? vals.co2 : null;
      return {
        room: m.name,
        sublabel: "Live Twin Telemetry",
        temperatureC: temp,
        humidityPct: hum,
        co2Ppm: co2,
        compliant: true,
        live: true,
      };
    });

  const displayRooms = liveRooms.length > 0
    ? liveRooms.slice(0, 6)
    : intelligence.roomConditions
        .filter((item) => item.temperatureC !== null || item.humidityPct !== null || item.co2Ppm !== null)
        .slice(0, 6)
        .map((item) => ({
          room: item.room,
          sublabel: item.batchId || item.process || "Monitored room",
          temperatureC: item.temperatureC,
          humidityPct: item.humidityPct,
          co2Ppm: item.co2Ppm,
          compliant: item.compliant,
          live: false,
        }));

  return (
    <section className="panel command-widget room-conditions-widget">
      <PanelHeader
        number={number}
        title="Growing-room conditions"
        subtitle="Latest temperature, humidity and CO2 by room (Twin live stream)"
        href="/digital-twin"
      />
      <div className="room-condition-list">
        {displayRooms.map((item) => (
          <article key={item.room} className={item.compliant === false ? "room-condition-warning" : ""}>
            <div>
              <strong>{item.room}</strong>
              <small>{item.sublabel}</small>
            </div>
            <span>
              <small>Temp</small>
              <b>{item.temperatureC === null ? "—" : `${item.temperatureC.toFixed(1)}°C`}</b>
            </span>
            <span>
              <small>RH</small>
              <b>{item.humidityPct === null ? "—" : `${item.humidityPct.toFixed(1)}%`}</b>
            </span>
            <span>
              <small>CO2</small>
              <b>{item.co2Ppm === null ? "—" : `${item.co2Ppm.toFixed(0)} ppm`}</b>
            </span>
            <em>{item.compliant === false ? "Out of range" : item.live ? "Live QR" : "In range"}</em>
          </article>
        ))}
        {!displayRooms.length && (
          <p style={{ fontSize: "12px", color: "var(--color-text-muted)", padding: "12px 0" }}>
            No room telemetry registered. Scan room QR codes or configure Twin assets.
          </p>
        )}
      </div>
    </section>
  );
}

function PriorityExceptionsWidget({ number }: { number: number }) {
  const { intelligence } = useFactory();
  const alerts = intelligence.alerts.filter((alert) => alert.status !== "resolved").slice(0, 3);

  return (
    <section className="panel command-widget home-alert-widget">
      <PanelHeader
        number={number}
        title="Priority exceptions"
        subtitle="Exceptions triageable via top-right Alert Center"
        href="/data"
      />
      <div className="priority-alerts">
        {alerts.map((alert) => (
          <article key={alert.id}>
            <i className={`alert-indicator ${alert.severity}`} />
            <div>
              <span><b>{alert.title}</b><small>{alert.asset} · {alert.observed}</small></span>
              <p>{alert.recommendation}</p>
              <div><Link href="/data">Inspect live data stream <ArrowRight size={11} /></Link></div>
            </div>
          </article>
        ))}
        {!alerts.length && (
          <div className="all-clear">
            <CheckCircle2 size={24} />
            <strong>No priority exceptions</strong>
            <span>All configured rules are within range.</span>
          </div>
        )}
      </div>
    </section>
  );
}

export function DashboardOverview() {
  const { state, filters, intelligence, twinFeed } = useFactory();
  const activeFactory = state.factories.find((factory) => factory.id === state.activeFactoryId);
  const reportingMachinesCount = twinFeed.machines.filter((m) => m.status === "reporting").length;
  const totalMachinesCount = twinFeed.machines.length;
  const invMaterialsCount = twinFeed.inventory ? Object.keys(twinFeed.inventory.stock).length : 0;
  const dispatchAwaitingKg = twinFeed.dispatch ? Object.values(twinFeed.dispatch.awaiting).reduce((a, b) => a + b, 0) : 0;
  const activeAlerts = intelligence.alerts.filter((alert) => alert.status !== "resolved");

  const summaryMetrics = [
    {
      label: "Active Twin Assets",
      value: `${reportingMachinesCount} / ${totalMachinesCount}`,
      detail: `${reportingMachinesCount} reporting telemetry live`,
    },
    {
      label: "QR Telemetry Scans",
      value: twinFeed.recent_events.length.toString(),
      detail: twinFeed.freshness.machines.last_updated
        ? `Latest: ${new Date(twinFeed.freshness.machines.last_updated).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
        : "Standby for scans",
    },
    {
      label: "Materials Tracked",
      value: invMaterialsCount.toString(),
      detail: `Freshness: ${twinFeed.freshness.inventory.status}`,
    },
    {
      label: "Awaiting Dispatch",
      value: `${dispatchAwaitingKg.toLocaleString("en-IN")} kg`,
      detail: `Freshness: ${twinFeed.freshness.dispatch.status}`,
    },
    {
      label: "Climate Compliance",
      value: `${(intelligence.mushroom?.environmentCompliance ?? 100).toFixed(0)}%`,
      detail: `${twinFeed.machines.filter((m) => m.latest_observation).length} monitored rooms`,
    },
    {
      label: "Priority Alerts",
      value: activeAlerts.length.toString(),
      detail: activeAlerts.length === 0 ? "All parameters nominal" : "Review via Alert Center",
    },
  ];

  function exportSnapshot() {
    downloadBlob(
      JSON.stringify({ generatedAt: new Date().toISOString(), factory: activeFactory, filters, intelligence, twinFeed }, null, 2),
      `mushroom-command-centre-${filters.to}.json`,
      "application/json",
    );
  }

  return (
    <>
      <header className="page-header command-centre-header">
        <div>
          <p className="eyebrow">
            Mushroom Crop Command Centre · {new Date(`${filters.to}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
          </p>
          <h1>See every crop. <span>Improve every flush.</span></h1>
          <p className="page-subtitle">
            {activeFactory?.name || "Mushroom Facility"} · Twin status: {reportingMachinesCount} reporting / {totalMachinesCount} configured assets · Latest scan: {twinFeed.freshness.machines.last_updated ? new Date(twinFeed.freshness.machines.last_updated).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "no scans yet"}
          </p>
        </div>
        <div className="page-actions" style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Link href="/data" className="button button-accent">Open Live Data <ArrowRight size={14} /></Link>
          <Link href="/data?view=sheet" className="button button-secondary"><FileSpreadsheet size={14} /> Sheet Format</Link>
          <button className="button button-secondary" onClick={exportSnapshot}><Download size={14} /> Export snapshot</button>
        </div>
      </header>

      <HomeModuleGrid />
      <TwinFreshnessDashboard />

      {/* Anchor Centerpiece: What is happening in the active machine at Time T */}
      <MachineAtTimeTWidget />

      <CommandFilters />

      {summaryMetrics.length > 0 && (
        <div className="answer-summary-strip home-summary-strip" style={{ gridTemplateColumns: `repeat(${summaryMetrics.length}, 1fr)` }}>
          {summaryMetrics.map((metric) => (
            <div key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </div>
          ))}
        </div>
      )}

      <div className="home-decision-grid">
        <RoomConditionsWidget number={1} />
        <PriorityExceptionsWidget number={2} />
      </div>

      <div className="traceability-footer">
        <ShieldAlert size={14} />
        <span>Only approved mapped records are used. Mushroom Factory Twin is the single source of truth.</span>
        <Link href="/data">Inspect QR &amp; data lineage <ExternalLink size={11} /></Link>
      </div>
    </>
  );
}

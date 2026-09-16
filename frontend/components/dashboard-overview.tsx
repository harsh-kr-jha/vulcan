"use client";

import {
  Activity,
  ArrowRight,
  Boxes,
  ExternalLink,
  ShieldAlert,
  Truck,
  Wrench,
} from "lucide-react";
import Link from "next/link";

import { CommandFilters } from "@/components/command-filters";
import { useFactory } from "@/lib/factory-context";

function PanelHeader({
  number,
  title,
  subtitle,
  href,
  actionLabel = "View details",
}: {
  number?: number;
  title: string;
  subtitle: string;
  href?: string;
  actionLabel?: string;
}) {
  return (
    <div className="panel-header command-panel-header">
      {number !== undefined && <div className="widget-number">{number}</div>}
      <div className="panel-title-group">
        <h2 className="panel-title typography-headline">{title}</h2>
        <p className="panel-subtitle typography-body">{subtitle}</p>
      </div>
      {href && (
        <Link className="panel-action" href={href}>
          {actionLabel} <ArrowRight size={12} />
        </Link>
      )}
    </div>
  );
}

function TwinFreshnessDashboard() {
  const { twinFeed } = useFactory();

  const getStatusBadge = (status: "fresh" | "moderate" | "stale" | "no_data") => {
    if (status === "fresh")
      return (
        <span
          style={{
            padding: "2px 8px",
            borderRadius: "10px",
            fontSize: "11px",
            fontWeight: 600,
            background: "rgba(65,111,87,0.15)",
            color: "#276749",
          }}
        >
          🟢 Fresh · Live
        </span>
      );
    if (status === "moderate")
      return (
        <span
          style={{
            padding: "2px 8px",
            borderRadius: "10px",
            fontSize: "11px",
            fontWeight: 600,
            background: "rgba(221,107,32,0.15)",
            color: "#c05621",
          }}
        >
          🟡 &lt;24h ago
        </span>
      );
    if (status === "stale")
      return (
        <span
          style={{
            padding: "2px 8px",
            borderRadius: "10px",
            fontSize: "11px",
            fontWeight: 600,
            background: "rgba(229,62,62,0.15)",
            color: "#c53030",
          }}
        >
          🔴 Needs update
        </span>
      );
    return (
      <span
        style={{
          padding: "2px 8px",
          borderRadius: "10px",
          fontSize: "11px",
          fontWeight: 600,
          background: "rgba(113,128,150,0.15)",
          color: "#4a5568",
        }}
      >
        ⚪ Awaiting scan
      </span>
    );
  };

  const formatTime = (ts: string | null) => {
    if (!ts) return "No scans recorded yet";
    const date = new Date(ts);
    const diffMin = Math.round((Date.now() - date.getTime()) / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffMin < 1440) return `${Math.round(diffMin / 60)}h ago`;
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const invMaterialsCount = twinFeed.inventory ? Object.keys(twinFeed.inventory.stock).length : 0;
  const dispatchAwaitingKg = twinFeed.dispatch
    ? Object.values(twinFeed.dispatch.awaiting).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <section className="panel" style={{ padding: "20px", marginBottom: "20px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "16px",
        }}
      >
        {/* Element 1: Machines & Rooms */}
        <div
          style={{
            border: "1px solid var(--color-border, #e2e8f0)",
            borderRadius: "8px",
            padding: "16px",
            background: "var(--color-card-bg, #ffffff)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600, fontSize: "13px" }}>
              <Wrench size={16} style={{ color: "#276749" }} />
              1. Machines &amp; Rooms
            </span>
            {getStatusBadge(twinFeed.freshness.machines.status)}
          </div>
          <p style={{ fontSize: "20px", fontWeight: 700, margin: "6px 0", color: "#276749" }}>
            {twinFeed.freshness.machines.reporting_count} / {twinFeed.machines.length || 0}{" "}
            <small style={{ fontSize: "12px", fontWeight: 400 }}>rooms active</small>
          </p>
          <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: "4px 0 10px 0" }}>
            Latest scan: <b>{formatTime(twinFeed.freshness.machines.last_updated)}</b>
          </p>
          <div
            style={{
              borderTop: "1px solid var(--color-border, #edf2f7)",
              paddingTop: "8px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>Climate &amp; run telemetry</span>
            <Link href="/data" style={{ fontSize: "11px", color: "var(--color-primary, #416f57)", fontWeight: 500 }}>
              Inspect rooms →
            </Link>
          </div>
        </div>

        {/* Element 2: Inventory */}
        <div
          style={{
            border: "1px solid var(--color-border, #e2e8f0)",
            borderRadius: "8px",
            padding: "16px",
            background: "var(--color-card-bg, #ffffff)",
          }}
        >
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
          <div
            style={{
              borderTop: "1px solid var(--color-border, #edf2f7)",
              paddingTop: "8px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>Substrates, spawn, soil</span>
            <Link href="/data" style={{ fontSize: "11px", color: "var(--color-primary, #416f57)", fontWeight: 500 }}>
              Inspect stock →
            </Link>
          </div>
        </div>

        {/* Element 3: Dispatch */}
        <div
          style={{
            border: "1px solid var(--color-border, #e2e8f0)",
            borderRadius: "8px",
            padding: "16px",
            background: "var(--color-card-bg, #ffffff)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600, fontSize: "13px" }}>
              <Truck size={16} style={{ color: "#2b6cb0" }} />
              3. Dispatch &amp; Harvest
            </span>
            {getStatusBadge(twinFeed.freshness.dispatch.status)}
          </div>
          <p style={{ fontSize: "20px", fontWeight: 700, margin: "6px 0", color: "#2b6cb0" }}>
            {dispatchAwaitingKg.toLocaleString("en-IN")}{" "}
            <small style={{ fontSize: "12px", fontWeight: 400 }}>kg awaiting dispatch</small>
          </p>
          <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: "4px 0 10px 0" }}>
            Latest dispatch: <b>{formatTime(twinFeed.freshness.dispatch.last_updated)}</b>
          </p>
          <div
            style={{
              borderTop: "1px solid var(--color-border, #edf2f7)",
              paddingTop: "8px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>Fresh &amp; packed mushrooms</span>
            <Link href="/data" style={{ fontSize: "11px", color: "var(--color-primary, #416f57)", fontWeight: 500 }}>
              Inspect dispatch →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function RoomConditionsWidget({ number }: { number?: number }) {
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

  const displayRooms =
    liveRooms.length > 0
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
        actionLabel="Open Twin"
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

export function DashboardOverview() {
  const { state, filters, intelligence, twinFeed } = useFactory();
  const activeFactory = state.factories.find((factory) => factory.id === state.activeFactoryId);
  const reportingMachinesCount = twinFeed.machines.filter((m) => m.status === "reporting").length;
  const totalMachinesCount = twinFeed.machines.length;
  const invMaterialsCount = twinFeed.inventory ? Object.keys(twinFeed.inventory.stock).length : 0;
  const dispatchAwaitingKg = twinFeed.dispatch
    ? Object.values(twinFeed.dispatch.awaiting).reduce((a, b) => a + b, 0)
    : 0;

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
      label: "Climate Compliance",
      value: `${(intelligence.mushroom?.environmentCompliance ?? 100).toFixed(0)}%`,
      detail: `${twinFeed.machines.filter((m) => m.latest_observation).length} monitored rooms`,
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
  ];

  return (
    <>
      <header className="page-header command-centre-header">
        <div>
          <h1 className="typography-display">
            See every crop. <span>Improve every flush.</span>
          </h1>
          <p className="page-subtitle typography-body">
            {activeFactory?.name || "Mushroom Facility"} · {reportingMachinesCount} of {totalMachinesCount} rooms active ·
            Telemetry: {twinFeed.freshness.machines.status === "fresh" ? "All systems live" : "Standby"}
          </p>
        </div>
      </header>

      <CommandFilters />

      {summaryMetrics.length > 0 && (
        <div
          className="answer-summary-strip home-summary-strip"
          style={{ gridTemplateColumns: `repeat(${summaryMetrics.length}, 1fr)` }}
        >
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
        <RoomConditionsWidget />
      </div>

      <TwinFreshnessDashboard />

      <div className="traceability-footer">
        <ShieldAlert size={14} />
        <span>Only approved mapped records are used. Mushroom Factory Twin is the single source of truth.</span>
        <Link href="/data">
          Inspect QR &amp; data lineage <ExternalLink size={11} />
        </Link>
      </div>
    </>
  );
}

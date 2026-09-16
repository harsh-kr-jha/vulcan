"use client";

import { useMemo } from "react";
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

function formatTime(ts: string | null) {
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
}

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

function TwinFreshnessDashboard({ number }: { number?: number }) {
  const { twinFeed } = useFactory();

  const getStatusBadge = (status: "fresh" | "moderate" | "stale" | "no_data") => {
    if (status === "fresh")
      return <span className="freshness-badge badge-fresh">Fresh · Live</span>;
    if (status === "moderate")
      return <span className="freshness-badge badge-moderate">&lt;24h ago</span>;
    if (status === "stale")
      return <span className="freshness-badge badge-stale">Needs update</span>;
    return <span className="freshness-badge badge-standby">Awaiting scan</span>;
  };

  const invMaterialsCount = twinFeed.inventory ? Object.keys(twinFeed.inventory.stock).length : 0;
  const dispatchAwaitingKg = twinFeed.dispatch
    ? Object.values(twinFeed.dispatch.awaiting).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <section className="panel command-widget twin-freshness-widget">
      <PanelHeader
        number={number}
        title="Live telemetry freshness & scans"
        subtitle="Tracking live telemetry incoming from QR codes across machines, rooms, inventory, and dispatch"
        href="/data"
        actionLabel="View Data Feed"
      />

      <div className="freshness-card-grid">
        {/* Element 1: Machines & Rooms */}
        <div className="freshness-subcard">
          <div className="freshness-subcard-header">
            <span className="freshness-subcard-title">
              <Wrench size={15} style={{ color: "var(--green, #416f57)" }} />
              1. Machines &amp; Rooms
            </span>
            {getStatusBadge(twinFeed.freshness.machines.status)}
          </div>
          <p className="freshness-subcard-value">
            {twinFeed.freshness.machines.reporting_count} / {twinFeed.machines.length || 0}{" "}
            <small>rooms active</small>
          </p>
          <p className="freshness-subcard-sublabel">
            Latest scan: <b>{formatTime(twinFeed.freshness.machines.last_updated)}</b>
          </p>
          <div className="freshness-subcard-footer">
            <span>Climate &amp; run telemetry</span>
            <Link href="/data">
              Inspect rooms →
            </Link>
          </div>
        </div>

        {/* Element 2: Inventory */}
        <div className="freshness-subcard">
          <div className="freshness-subcard-header">
            <span className="freshness-subcard-title">
              <Boxes size={15} style={{ color: "#c05621" }} />
              2. Materials Inventory
            </span>
            {getStatusBadge(twinFeed.freshness.inventory.status)}
          </div>
          <p className="freshness-subcard-value">
            {invMaterialsCount}{" "}
            <small>materials tracked</small>
          </p>
          <p className="freshness-subcard-sublabel">
            Latest change: <b>{formatTime(twinFeed.freshness.inventory.last_updated)}</b>
          </p>
          <div className="freshness-subcard-footer">
            <span>Substrates, spawn, soil</span>
            <Link href="/data">
              Inspect stock →
            </Link>
          </div>
        </div>

        {/* Element 3: Dispatch */}
        <div className="freshness-subcard">
          <div className="freshness-subcard-header">
            <span className="freshness-subcard-title">
              <Truck size={15} style={{ color: "#2b6cb0" }} />
              3. Dispatch &amp; Harvest
            </span>
            {getStatusBadge(twinFeed.freshness.dispatch.status)}
          </div>
          <p className="freshness-subcard-value">
            {dispatchAwaitingKg.toLocaleString("en-IN")}{" "}
            <small>kg awaiting dispatch</small>
          </p>
          <p className="freshness-subcard-sublabel">
            Latest dispatch: <b>{formatTime(twinFeed.freshness.dispatch.last_updated)}</b>
          </p>
          <div className="freshness-subcard-footer">
            <span>Fresh &amp; packed mushrooms</span>
            <Link href="/data">
              Inspect dispatch →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function RoomConditionsWidget({ number }: { number?: number }) {
  const { twinFeed } = useFactory();

  const twinMachines = twinFeed.machines || [];

  // Strictly connect to Digital Twin: only display rooms configured in the Digital Twin
  const displayRooms = useMemo(() => {
    // If no twin layout / twin deleted, return empty list (never fall back to historical runs)
    if (twinMachines.length === 0) return [];

    const extractNum = (values: Record<string, unknown>, keys: string[]): number | null => {
      for (const key of keys) {
        const val = values[key];
        if (typeof val === "number" && !isNaN(val)) return val;
        if (typeof val === "string" && val.trim() !== "") {
          const num = Number(val);
          if (!isNaN(num)) return num;
        }
      }
      const entries = Object.entries(values);
      for (const targetKey of keys) {
        const match = entries.find(([k]) => k.toLowerCase() === targetKey.toLowerCase());
        if (match) {
          const val = match[1];
          if (typeof val === "number" && !isNaN(val)) return val;
          if (typeof val === "string" && val.trim() !== "") {
            const num = Number(val);
            if (!isNaN(num)) return num;
          }
        }
      }
      return null;
    };

    return twinMachines.slice(0, 8).map((m) => {
      const obs = m.latest_observation;
      const vals = obs?.values ?? {};

      const temp = extractNum(vals, ["temperature", "temp", "temperature_c", "temp_c"]);
      const hum = extractNum(vals, ["humidity", "humidity_pct", "rh", "rh_pct", "relative_humidity"]);
      const co2 = extractNum(vals, ["co2", "co2_ppm", "carbon_dioxide"]);

      const hasObservation = obs !== null && (temp !== null || hum !== null || co2 !== null || Object.keys(vals).length > 0);

      let statusLabel = "Awaiting scan";
      let statusClass = "room-condition-standby";

      if (hasObservation) {
        if (m.status === "warning") {
          statusLabel = "Out of range";
          statusClass = "room-condition-warning";
        } else {
          statusLabel = "In range";
          statusClass = "room-condition-normal";
        }
      }

      const sublabel = hasObservation && obs?.submitted_at
        ? `Scanned ${formatTime(obs.submitted_at)}`
        : "Twin asset · Standby";

      return {
        id: m.id,
        room: m.name,
        sublabel,
        temperatureC: temp,
        humidityPct: hum,
        co2Ppm: co2,
        statusLabel,
        statusClass,
      };
    });
  }, [twinMachines]);

  return (
    <section className="panel command-widget room-conditions-widget">
      <PanelHeader
        number={number}
        title="Growing-room conditions"
        subtitle="Live temperature, humidity and CO2 by room (Twin live stream)"
        href={displayRooms.length > 0 ? "/digital-twin" : undefined}
        actionLabel={twinMachines.length > 8 ? `View all ${twinMachines.length} in Twin` : "Open Twin"}
      />

      {displayRooms.length > 0 ? (
        <div className="room-conditions-table-wrap">
          <div className="room-condition-header">
            <span className="room-col-name typography-label">Room / Zone</span>
            <span className="room-col-metric typography-label">Temperature</span>
            <span className="room-col-metric typography-label">Humidity</span>
            <span className="room-col-metric typography-label">CO2 Level</span>
            <span className="room-col-status typography-label">Status</span>
          </div>

          <div className="room-condition-list">
            {displayRooms.map((item) => (
              <article
                key={item.id}
                className={item.statusClass}
              >
                <div className="room-col-name">
                  <strong>{item.room}</strong>
                  <small>{item.sublabel}</small>
                </div>
                <span className="room-col-metric">
                  <small>Temp</small>
                  <b>{item.temperatureC === null ? "—" : `${item.temperatureC.toFixed(1)}°C`}</b>
                </span>
                <span className="room-col-metric">
                  <small>RH</small>
                  <b>{item.humidityPct === null ? "—" : `${item.humidityPct.toFixed(1)}%`}</b>
                </span>
                <span className="room-col-metric">
                  <small>CO2</small>
                  <b>{item.co2Ppm === null ? "—" : `${item.co2Ppm.toLocaleString("en-IN")} ppm`}</b>
                </span>
                <em>{item.statusLabel}</em>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="room-conditions-empty">
          <div className="room-conditions-empty-info">
            <div className="room-conditions-empty-icon">
              <Activity size={18} />
            </div>
            <div>
              <strong>No digital twin rooms configured</strong>
              <p>Configure room assets in Digital Twin to stream live environmental telemetry.</p>
            </div>
          </div>
          <Link href="/digital-twin" className="button button-secondary">
            Configure Twin <ArrowRight size={13} style={{ marginLeft: 4 }} />
          </Link>
        </div>
      )}
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
        <RoomConditionsWidget number={1} />
        <TwinFreshnessDashboard number={2} />
      </div>

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

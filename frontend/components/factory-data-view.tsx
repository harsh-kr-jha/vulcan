"use client";

import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock,
  Database,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Filter,
  Layers,
  Package,
  QrCode,
  RefreshCw,
  Search,
  Sparkles,
  Truck,
  Workflow,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { downloadBlob } from "@/lib/browser-files";
import { useFactory } from "@/lib/factory-context";
import type { TwinFeedEvent, TwinFeedMachine } from "@/lib/factory-domain";
import { QrCodePreview } from "@/components/digital-twin/builder/QrCodePreview";
import { UploadManager } from "@/components/upload-manager";

export function FactoryDataView() {
  const { twinFeed, refreshTwinFeed, state } = useFactory();
  const [activeTab, setActiveTab] = useState<"stream" | "machines" | "inventory" | "dispatch" | "sheets">("stream");
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<TwinFeedMachine | null>(null);
  const [qrModalItem, setQrModalItem] = useState<{ id: string; name: string; type: "machine" | "inventory" | "dispatch" } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "sheets" || params.get("add")) {
      setActiveTab("sheets");
    } else if (params.get("category") === "machines") {
      setActiveTab("machines");
    } else if (params.get("category") === "inventory") {
      setActiveTab("inventory");
    } else if (params.get("category") === "dispatch") {
      setActiveTab("dispatch");
    }
  }, []);

  const activeFactory = state.factories.find((f) => f.id === state.activeFactoryId) ?? state.factories[0];

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshTwinFeed();
    setRefreshing(false);
  };

  const filteredEvents = useMemo(() => {
    return twinFeed.recent_events.filter((e) => {
      const matchSource = sourceFilter === "all" || e.source === sourceFilter;
      const matchText = `${e.title} ${JSON.stringify(e.details)}`.toLowerCase().includes(query.toLowerCase());
      return matchSource && matchText;
    });
  }, [twinFeed.recent_events, sourceFilter, query]);

  const filteredMachines = useMemo(() => {
    return twinFeed.machines.filter((m) =>
      m.name.toLowerCase().includes(query.toLowerCase())
    );
  }, [twinFeed.machines, query]);

  const exportData = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      factory: activeFactory?.name,
      freshness: twinFeed.freshness,
      machines: twinFeed.machines,
      inventory: twinFeed.inventory,
      dispatch: twinFeed.dispatch,
      recent_events: twinFeed.recent_events,
    };
    downloadBlob(
      JSON.stringify(payload, null, 2),
      `vulcan-live-data-${activeFactory?.code || "farm"}-${new Date().toISOString().slice(0, 10)}.json`,
      "application/json"
    );
  };

  const getFreshnessBadge = (status: "fresh" | "moderate" | "stale" | "no_data") => {
    if (status === "fresh") return <span style={{ padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 600, background: "rgba(65,111,87,0.15)", color: "#276749" }}>Live · Fresh</span>;
    if (status === "moderate") return <span style={{ padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 600, background: "rgba(221,107,32,0.15)", color: "#c05621" }}>Moderate (&lt;24h)</span>;
    if (status === "stale") return <span style={{ padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 600, background: "rgba(229,62,62,0.15)", color: "#c53030" }}>Needs update</span>;
    return <span style={{ padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 600, background: "rgba(113,128,150,0.15)", color: "#4a5568" }}>No data</span>;
  };

  return (
    <>
      <header className="page-header command-centre-header">
        <div>
          <p className="eyebrow">Mushroom Factory Twin · Canonical Data Truth</p>
          <h1>Twin Data <span>&amp; Telemetry</span></h1>
          <p className="page-subtitle">
            {activeFactory?.name ?? "Mushroom Factory"} · Live data streams submitted via machine, inventory, and dispatch QR codes.
          </p>
        </div>
        <div className="page-actions">
          <button className="button button-secondary" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? "spin-animation" : ""} /> {refreshing ? "Refreshing…" : "Refresh feed"}
          </button>
          <button className="button button-secondary" onClick={exportData}>
            <Download size={14} /> Export feed (JSON)
          </button>
        </div>
      </header>

      {/* Freshness & KPI Strip */}
      <div className="answer-summary-strip home-summary-strip" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: "20px" }}>
        <div>
          <span>Machines &amp; Rooms</span>
          <strong>{twinFeed.freshness.machines.reporting_count} / {twinFeed.machines.length || "0"} reporting</strong>
          <small>{getFreshnessBadge(twinFeed.freshness.machines.status)} · {twinFeed.freshness.machines.last_updated ? new Date(twinFeed.freshness.machines.last_updated).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "none"}</small>
        </div>
        <div>
          <span>Materials Inventory</span>
          <strong>{twinFeed.inventory ? Object.keys(twinFeed.inventory.stock).length : 0} items in stock</strong>
          <small>{getFreshnessBadge(twinFeed.freshness.inventory.status)} · {twinFeed.freshness.inventory.last_updated ? new Date(twinFeed.freshness.inventory.last_updated).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "no records"}</small>
        </div>
        <div>
          <span>Dispatch &amp; Harvest</span>
          <strong>{twinFeed.dispatch ? Object.values(twinFeed.dispatch.awaiting).reduce((a, b) => a + b, 0).toLocaleString("en-IN") : 0} kg awaiting</strong>
          <small>{getFreshnessBadge(twinFeed.freshness.dispatch.status)} · {twinFeed.freshness.dispatch.last_updated ? new Date(twinFeed.freshness.dispatch.last_updated).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "no records"}</small>
        </div>
        <div>
          <span>QR Event Stream</span>
          <strong>{twinFeed.recent_events.length} captured</strong>
          <small>Single source of truth via twin scans</small>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--color-border, #e2e8f0)", marginBottom: "16px", paddingBottom: "4px" }}>
        <button
          className="button"
          onClick={() => setActiveTab("stream")}
          style={{
            background: activeTab === "stream" ? "var(--color-primary, #416f57)" : "transparent",
            color: activeTab === "stream" ? "#fff" : "inherit",
            border: "none",
            borderRadius: "6px",
            padding: "8px 16px",
            fontWeight: activeTab === "stream" ? 600 : 400,
          }}
        >
          <Database size={14} style={{ display: "inline", marginRight: "6px" }} />
          Live Event Stream ({twinFeed.recent_events.length})
        </button>
        <button
          className="button"
          onClick={() => setActiveTab("machines")}
          style={{
            background: activeTab === "machines" ? "var(--color-primary, #416f57)" : "transparent",
            color: activeTab === "machines" ? "#fff" : "inherit",
            border: "none",
            borderRadius: "6px",
            padding: "8px 16px",
            fontWeight: activeTab === "machines" ? 600 : 400,
          }}
        >
          <Wrench size={14} style={{ display: "inline", marginRight: "6px" }} />
          Machines &amp; Growing Rooms ({twinFeed.machines.length})
        </button>
        <button
          className="button"
          onClick={() => setActiveTab("inventory")}
          style={{
            background: activeTab === "inventory" ? "var(--color-primary, #416f57)" : "transparent",
            color: activeTab === "inventory" ? "#fff" : "inherit",
            border: "none",
            borderRadius: "6px",
            padding: "8px 16px",
            fontWeight: activeTab === "inventory" ? 600 : 400,
          }}
        >
          <Boxes size={14} style={{ display: "inline", marginRight: "6px" }} />
          Materials Inventory
        </button>
        <button
          className="button"
          onClick={() => setActiveTab("dispatch")}
          style={{
            background: activeTab === "dispatch" ? "var(--color-primary, #416f57)" : "transparent",
            color: activeTab === "dispatch" ? "#fff" : "inherit",
            border: "none",
            borderRadius: "6px",
            padding: "8px 16px",
            fontWeight: activeTab === "dispatch" ? 600 : 400,
          }}
        >
          <Truck size={14} style={{ display: "inline", marginRight: "6px" }} />
          Product Dispatch
        </button>
        <button
          className="button"
          onClick={() => setActiveTab("sheets")}
          style={{
            background: activeTab === "sheets" ? "var(--color-primary, #416f57)" : "transparent",
            color: activeTab === "sheets" ? "#fff" : "inherit",
            border: "none",
            borderRadius: "6px",
            padding: "8px 16px",
            fontWeight: activeTab === "sheets" ? 600 : 400,
          }}
        >
          <FileSpreadsheet size={14} style={{ display: "inline", marginRight: "6px" }} />
          Historical Sheets ({state.uploads.length})
        </button>
      </div>

      {/* Tab 1: Live Event Stream */}
      {activeTab === "stream" && (
        <section className="panel" style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <label className="search-field" style={{ margin: 0 }}>
                <Search size={14} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter incoming events…"
                  style={{ width: "240px" }}
                />
              </label>
              <div style={{ display: "flex", gap: "4px" }}>
                {(["all", "machine", "inventory", "dispatch"] as const).map((source) => (
                  <button
                    key={source}
                    onClick={() => setSourceFilter(source)}
                    style={{
                      padding: "4px 10px",
                      fontSize: "12px",
                      borderRadius: "14px",
                      border: "1px solid",
                      borderColor: sourceFilter === source ? "var(--color-primary, #416f57)" : "var(--color-border, #e2e8f0)",
                      background: sourceFilter === source ? "rgba(65,111,87,0.12)" : "transparent",
                      color: sourceFilter === source ? "var(--color-primary, #416f57)" : "var(--color-text-muted)",
                      cursor: "pointer",
                      textTransform: "capitalize",
                      fontWeight: sourceFilter === source ? 600 : 400,
                    }}
                  >
                    {source}
                  </button>
                ))}
              </div>
            </div>
            <small style={{ color: "var(--color-text-muted)" }}>
              Showing {filteredEvents.length} events
            </small>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {filteredEvents.map((evt) => (
              <article
                key={evt.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 16px",
                  borderRadius: "6px",
                  border: "1px solid var(--color-border, #e2e8f0)",
                  background: "var(--color-card-bg, #ffffff)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span
                    style={{
                      width: "34px",
                      height: "34px",
                      borderRadius: "8px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background:
                        evt.source === "machine"
                          ? "rgba(65,111,87,0.12)"
                          : evt.source === "inventory"
                          ? "rgba(221,107,32,0.12)"
                          : "rgba(49,130,206,0.12)",
                      color:
                        evt.source === "machine"
                          ? "#276749"
                          : evt.source === "inventory"
                          ? "#c05621"
                          : "#2b6cb0",
                    }}
                  >
                    {evt.source === "machine" ? <Workflow size={17} /> : evt.source === "inventory" ? <Boxes size={17} /> : <Truck size={17} />}
                  </span>
                  <div>
                    <strong style={{ fontSize: "13px", display: "block" }}>{evt.title}</strong>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
                      {Object.entries(evt.details).slice(0, 5).map(([k, v]) => (
                        <span key={k} style={{ fontSize: "11px", background: "rgba(0,0,0,0.04)", padding: "1px 6px", borderRadius: "3px" }}>
                          <span style={{ color: "var(--color-text-muted)" }}>{k}:</span> <b>{String(v)}</b>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <time style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "block" }}>
                    {new Date(evt.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </time>
                  {evt.machine_id && (
                    <Link
                      href={`/digital-twin/entry/${evt.machine_id}`}
                      target="_blank"
                      style={{ fontSize: "11px", color: "var(--color-primary, #416f57)", display: "inline-flex", alignItems: "center", gap: "3px", marginTop: "4px" }}
                    >
                      Open form <ExternalLink size={10} />
                    </Link>
                  )}
                </div>
              </article>
            ))}
            {!filteredEvents.length && (
              <div style={{ padding: "40px 10px", textAlign: "center", color: "var(--color-text-muted)" }}>
                <Database size={28} style={{ margin: "0 auto 8px auto", opacity: 0.5 }} />
                <p>No operational events match this search.</p>
                <small>Scan a machine QR code or submit test data to see live updates.</small>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Tab 2: Machines & Growing Rooms */}
      {activeTab === "machines" && (
        <section className="panel" style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <label className="search-field" style={{ margin: 0 }}>
              <Search size={14} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search rooms &amp; machines…"
                style={{ width: "240px" }}
              />
            </label>
            <Link href="/digital-twin" className="button button-secondary">
              <Workflow size={14} /> Open Mushroom Factory Twin
            </Link>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
            {filteredMachines.map((machine) => {
              const latest = machine.latest_observation;
              return (
                <div
                  key={machine.id}
                  style={{
                    border: "1px solid var(--color-border, #e2e8f0)",
                    borderRadius: "8px",
                    padding: "16px",
                    background: "var(--color-card-bg, #ffffff)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <strong style={{ fontSize: "14px" }}>{machine.name}</strong>
                        <small style={{ display: "block", color: "var(--color-text-muted)", fontSize: "11px" }}>
                          Grid: ({machine.position.x}, {machine.position.y}) · {machine.parameters.length} params
                        </small>
                      </div>
                      <span
                        style={{
                          fontSize: "10px",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          textTransform: "uppercase",
                          fontWeight: 600,
                          background:
                            machine.status === "running"
                              ? "rgba(65,111,87,0.12)"
                              : machine.status === "warning"
                              ? "rgba(221,107,32,0.12)"
                              : "rgba(113,128,150,0.12)",
                          color:
                            machine.status === "running"
                              ? "#276749"
                              : machine.status === "warning"
                              ? "#c05621"
                              : "#4a5568",
                        }}
                      >
                        {machine.status || "idle"}
                      </span>
                    </div>

                    <div style={{ margin: "12px 0", padding: "10px", background: "rgba(0,0,0,0.02)", borderRadius: "6px" }}>
                      <span style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "block", marginBottom: "4px" }}>
                        Latest QR Telemetry:
                      </span>
                      {latest ? (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                          {Object.entries(latest.values).slice(0, 4).map(([k, v]) => (
                            <div key={k} style={{ fontSize: "11px" }}>
                              <span style={{ color: "var(--color-text-muted)" }}>{k}:</span> <b>{String(v)}</b>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>No observations submitted yet.</span>
                      )}
                      {latest?.submitted_at && (
                        <small style={{ display: "block", marginTop: "6px", color: "var(--color-text-muted)", fontSize: "10px" }}>
                          Reported: {new Date(latest.submitted_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} ({machine.observation_count} total scans)
                        </small>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "6px", borderTop: "1px solid var(--color-border, #edf2f7)", paddingTop: "10px" }}>
                    <Link
                      href={`/digital-twin/entry/${machine.id}`}
                      target="_blank"
                      className="button button-primary"
                      style={{ flex: 1, padding: "4px 8px", fontSize: "11px", justifyContent: "center" }}
                    >
                      Enter Data <ExternalLink size={11} />
                    </Link>
                    <button
                      className="button button-secondary"
                      style={{ padding: "4px 8px", fontSize: "11px" }}
                      onClick={() => setQrModalItem({ id: machine.id, name: machine.name, type: "machine" })}
                      title="View Scannable QR Code"
                    >
                      <QrCode size={13} />
                    </button>
                    {machine.history.length > 0 && (
                      <button
                        className="button button-secondary"
                        style={{ padding: "4px 8px", fontSize: "11px" }}
                        onClick={() => setSelectedMachine(machine)}
                        title="View Submission History"
                      >
                        <Clock size={13} /> Logs
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Tab 3: Materials Inventory */}
      {activeTab === "inventory" && twinFeed.inventory && (
        <section className="panel" style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <div>
              <h2 style={{ fontSize: "16px", margin: 0 }}>Raw Materials &amp; Substrates</h2>
              <p style={{ fontSize: "12px", color: "var(--color-text-muted)", margin: "4px 0 0 0" }}>
                Total capacity: {twinFeed.inventory.storage_capacity.toLocaleString("en-IN")} {twinFeed.inventory.capacity_unit}
              </p>
            </div>
            {twinFeed.layout_id && (
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  className="button button-secondary"
                  onClick={() => setQrModalItem({ id: twinFeed.layout_id!, name: "Inventory QR", type: "inventory" })}
                >
                  <QrCode size={14} /> Inventory QR Sticker
                </button>
                <Link
                  href={`/digital-twin/inventory/${twinFeed.layout_id}`}
                  target="_blank"
                  className="button button-accent"
                >
                  Inventory Entry Form <ExternalLink size={13} />
                </Link>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "16px", marginBottom: "24px" }}>
            {twinFeed.inventory.materials.map((mat) => {
              const currentStock = twinFeed.inventory?.stock[mat.id] ?? mat.quantity;
              return (
                <div
                  key={mat.id}
                  style={{
                    border: "1px solid var(--color-border, #e2e8f0)",
                    borderRadius: "6px",
                    padding: "14px",
                    background: "var(--color-card-bg, #ffffff)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong>{mat.name}</strong>
                    <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{mat.unit}</span>
                  </div>
                  <p style={{ fontSize: "20px", fontWeight: 700, margin: "8px 0 4px 0", color: "var(--color-primary, #416f57)" }}>
                    {currentStock.toLocaleString("en-IN")} <small style={{ fontSize: "12px", fontWeight: 400 }}>{mat.unit}</small>
                  </p>
                  <small style={{ color: "var(--color-text-muted)" }}>
                    Initial allocation: {mat.quantity.toLocaleString("en-IN")} {mat.unit}
                  </small>
                </div>
              );
            })}
          </div>

          <h3>Recent Inventory Transactions</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "10px" }}>
            {twinFeed.inventory.changes.map((change) => {
              const mat = twinFeed.inventory?.materials.find((m) => m.id === change.material_id);
              return (
                <div
                  key={change.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    borderRadius: "4px",
                    background: "rgba(0,0,0,0.02)",
                    fontSize: "12px",
                  }}
                >
                  <span>
                    <b>{mat?.name ?? change.material_id}</b> · {change.direction === "inbound" ? "➕ Inbound receipt" : "➖ Outbound consumption"} of <b>{change.quantity}</b> {mat?.unit ?? "units"}
                  </span>
                  <span style={{ color: "var(--color-text-muted)" }}>
                    {new Date(change.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              );
            })}
            {!twinFeed.inventory.changes.length && <p style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>No stock transactions recorded yet.</p>}
          </div>
        </section>
      )}

      {/* Tab 4: Product Dispatch */}
      {activeTab === "dispatch" && twinFeed.dispatch && (
        <section className="panel" style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <div>
              <h2 style={{ fontSize: "16px", margin: 0 }}>Finished Mushrooms &amp; Harvest Dispatch</h2>
              <p style={{ fontSize: "12px", color: "var(--color-text-muted)", margin: "4px 0 0 0" }}>
                Harvest staging, packing and customer dispatch lines.
              </p>
            </div>
            {twinFeed.layout_id && (
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  className="button button-secondary"
                  onClick={() => setQrModalItem({ id: twinFeed.layout_id!, name: "Dispatch QR", type: "dispatch" })}
                >
                  <QrCode size={14} /> Dispatch QR Sticker
                </button>
                <Link
                  href={`/digital-twin/dispatch/${twinFeed.layout_id}`}
                  target="_blank"
                  className="button button-accent"
                >
                  Dispatch Entry Form <ExternalLink size={13} />
                </Link>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px", marginBottom: "24px" }}>
            {twinFeed.dispatch.products.map((prod) => {
              const awaiting = twinFeed.dispatch?.awaiting[prod.id] ?? 0;
              const dispatched = twinFeed.dispatch?.dispatched[prod.id] ?? 0;
              return (
                <div
                  key={prod.id}
                  style={{
                    border: "1px solid var(--color-border, #e2e8f0)",
                    borderRadius: "6px",
                    padding: "14px",
                    background: "var(--color-card-bg, #ffffff)",
                  }}
                >
                  <strong>{prod.name}</strong>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px" }}>
                    <div>
                      <small style={{ color: "var(--color-text-muted)", display: "block" }}>Awaiting Dispatch</small>
                      <strong style={{ fontSize: "16px", color: "#c05621" }}>{awaiting.toLocaleString("en-IN")} {prod.unit}</strong>
                    </div>
                    <div>
                      <small style={{ color: "var(--color-text-muted)", display: "block" }}>Total Dispatched</small>
                      <strong style={{ fontSize: "16px", color: "var(--color-primary, #416f57)" }}>{dispatched.toLocaleString("en-IN")} {prod.unit}</strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <h3>Recent Dispatch Events</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "10px" }}>
            {twinFeed.dispatch.events.map((evt) => {
              const prod = twinFeed.dispatch?.products.find((p) => p.id === evt.product_id);
              return (
                <div
                  key={evt.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    borderRadius: "4px",
                    background: "rgba(0,0,0,0.02)",
                    fontSize: "12px",
                  }}
                >
                  <span>
                    <b>{prod?.name ?? evt.product_id}</b> · {evt.event_type === "arrival" ? "📥 Arrived in packing" : "🚚 Dispatched"} · <b>{evt.quantity} {evt.unit}</b>
                  </span>
                  <span style={{ color: "var(--color-text-muted)" }}>
                    {new Date(evt.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              );
            })}
            {!twinFeed.dispatch.events.length && <p style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>No dispatch records logged yet.</p>}
          </div>
        </section>
      )}

      {/* Tab 5: Historical Sheets */}
      {activeTab === "sheets" && <UploadManager />}

      {/* Machine Observation Logs Modal */}
      {selectedMachine && (
        <div className="builder-dialog-overlay" onClick={() => setSelectedMachine(null)}>
          <div className="builder-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px", width: "90%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ margin: 0, fontSize: "16px" }}>{selectedMachine.name} · Observation History</h2>
              <button className="button button-secondary" onClick={() => setSelectedMachine(null)}><X size={14} /></button>
            </div>
            <div style={{ maxHeight: "380px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
              {selectedMachine.history.map((obs) => (
                <div key={obs.id} style={{ padding: "10px", borderRadius: "6px", border: "1px solid var(--color-border, #e2e8f0)", background: "rgba(0,0,0,0.02)", fontSize: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", color: "var(--color-text-muted)" }}>
                    <time>{new Date(obs.submitted_at).toLocaleString("en-IN")}</time>
                    <span>{obs.submitted_by ? `By: ${obs.submitted_by}` : "QR Scan"}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                    {Object.entries(obs.values).map(([k, v]) => (
                      <div key={k}>
                        <span style={{ color: "var(--color-text-muted)" }}>{k}:</span> <b>{String(v)}</b>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* QR Code Preview Modal */}
      {qrModalItem && (
        <div className="builder-dialog-overlay" onClick={() => setQrModalItem(null)}>
          <div className="builder-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "420px", width: "90%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h2 style={{ margin: 0, fontSize: "16px" }}>QR Sticker · {qrModalItem.name}</h2>
              <button className="button button-secondary" onClick={() => setQrModalItem(null)}><X size={14} /></button>
            </div>
            <p style={{ fontSize: "12px", color: "var(--color-text-muted)", margin: "0 0 16px 0" }}>
              Attach this QR sticker to the physical room, inventory station, or dispatch bay.
            </p>
            <QrCodePreview
              machineId={qrModalItem.id}
              machineName={qrModalItem.name}
            />
          </div>
        </div>
      )}
    </>
  );
}

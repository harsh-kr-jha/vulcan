"use client";

import {
  Activity,
  Cable,
  CircleAlert,
  KeyRound,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Square,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { DataInputStream } from "@/lib/data-stream-types";
import { useFactory } from "@/lib/factory-context";

const CONTROL_ICONS: Record<string, typeof Play> = {
  start: Play,
  pause: Pause,
  resume: Play,
  stop: Square,
  new_run: RotateCcw,
};

function relativeTime(value?: string | null) {
  if (!value) return "No readings yet";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

function friendlyStreamError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("out-of-order")) return "A repeated or older reading was received. No data was skipped; the source needs to resume from the saved position.";
  if (lower.includes("timed out") || lower.includes("urlopen") || lower.includes("connection refused")) return "The source cannot be reached right now. Vulcan will keep trying automatically.";
  if (lower.includes("unauthorized") || lower.includes("401") || lower.includes("403")) return "The source rejected its API key. Add a new key to reconnect.";
  return message;
}

export function DataStreamsManager() {
  const { state } = useFactory();
  const factoryId = state.activeFactoryId;
  const [streams, setStreams] = useState<DataInputStream[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("Machine data gateway");
  const [baseUrl, setBaseUrl] = useState("http://localhost:8765");
  const [apiKey, setApiKey] = useState("");
  const [rotationStreamId, setRotationStreamId] = useState<string | null>(null);
  const [rotatedKey, setRotatedKey] = useState("");
  const [seed, setSeed] = useState("42");
  const [speed, setSpeed] = useState("1");
  const [faultProbability, setFaultProbability] = useState("0.15");
  const [coldStart, setColdStart] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!factoryId) return;
    try {
      setStreams(await api.listDataStreams(factoryId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load data streams.");
    }
  }, [factoryId]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (!factoryId) return;
      api
        .listDataStreams(factoryId)
        .then((items) => {
          if (!cancelled) setStreams(items);
        })
        .catch((cause: unknown) => {
          if (!cancelled) {
            setError(cause instanceof Error ? cause.message : "Could not load data streams.");
          }
        });
    };
    load();
    const interval = window.setInterval(load, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [factoryId]);

  async function register() {
    if (!factoryId || !name.trim() || !baseUrl.trim() || !apiKey) return;
    setBusy("create");
    setError("");
    try {
      const created = await api.createDataStream({
        factory: factoryId,
        name: name.trim(),
        base_url: baseUrl.trim(),
        api_key: apiKey,
        poll_interval_seconds: 5,
      });
      await api.discoverDataStream(created.id);
      setApiKey("");
      setShowForm(false);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect the source.");
    } finally {
      setBusy("");
    }
  }

  async function discover(stream: DataInputStream) {
    setBusy(`discover-${stream.id}`);
    setError("");
    try {
      await api.discoverDataStream(stream.id);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Discovery failed.");
    } finally {
      setBusy("");
    }
  }

  async function control(stream: DataInputStream, action: string, channelId: string) {
    const actionKey = `${action}-${stream.id}-${channelId}`;
    setBusy(actionKey);
    setError("");
    try {
      const inputs = new Set(
        stream.capabilities.controls?.find((control) => control.id === action)?.inputs ?? [],
      );
      const payload: Record<string, string | number | boolean> = { channel_id: channelId };
      if (inputs.has("seed")) payload.seed = Number(seed);
      if (inputs.has("speed_factor")) payload.speed_factor = Number(speed);
      if (inputs.has("fault_probability")) {
        payload.fault_probability = Number(faultProbability);
      }
      if (inputs.has("cold_start")) payload.cold_start = coldStart;
      const result = await api.controlDataStream(stream.id, action, payload);
      setStreams((current) => current.map((item) => item.id === stream.id ? result.stream : item));
    } catch (cause) {
      const fallback = `Could not ${action.replace("_", " ")} source.`;
      setError(cause instanceof Error ? cause.message : fallback);
    } finally {
      setBusy("");
    }
  }

  async function toggle(stream: DataInputStream) {
    setBusy(`toggle-${stream.id}`);
    setError("");
    try {
      await api.updateDataStream(stream.id, { enabled: !stream.enabled });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the source.");
    } finally {
      setBusy("");
    }
  }

  async function rotateCredential(stream: DataInputStream) {
    if (!rotatedKey) return;
    setBusy(`rotate-${stream.id}`);
    setError("");
    try {
      await api.updateDataStream(stream.id, { api_key: rotatedKey });
      setRotatedKey("");
      setRotationStreamId(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not rotate the credential.");
    } finally {
      setBusy("");
    }
  }

  async function acceptSchema(machineId: string) {
    setBusy(`schema-${machineId}`);
    setError("");
    try {
      await api.acceptDataStreamSchema(machineId);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not accept the schema.");
    } finally {
      setBusy("");
    }
  }

  async function remove(stream: DataInputStream) {
    if (stream.assigned_machines > 0) return;
    setBusy(`delete-${stream.id}`);
    setError("");
    try {
      await api.deleteDataStream(stream.id);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete source.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="panel mb-5">
      <div className="uploads-toolbar">
        <div>
          <h2 className="panel-title">Data streams</h2>
          <p className="panel-subtitle">
            Connect pull gateways once, then assign discovered channels to machines in Lexicon™.
          </p>
        </div>
        <button className="button button-primary" onClick={() => setShowForm((value) => !value)}>
          <Plus size={13} /> Register stream
        </button>
      </div>

      {error && (
        <div className="wizard-error m-4" role="alert">
          <CircleAlert size={16} />
          <span>{error}</span>
        </div>
      )}

      {showForm && (
        <div className="grid gap-3 border-t border-gray-200 p-4 md:grid-cols-3">
          <label className="text-sm text-gray-600">
            Source name
            <input
              className="builder-dialog-input mt-1"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="text-sm text-gray-600">
            Base URL
            <input
              className="builder-dialog-input mt-1"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </label>
          <label className="text-sm text-gray-600">
            API key
            <input
              className="builder-dialog-input mt-1"
              type="password"
              autoComplete="new-password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2 md:col-span-3">
            <button className="button button-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button
              className="button button-primary"
              disabled={busy === "create" || !apiKey}
              onClick={() => void register()}
            >
              {busy === "create" ? "Connecting…" : "Connect and discover"}
            </button>
          </div>
        </div>
      )}

      <div className="border-t border-gray-200">
        {!streams.length && (
          <div className="empty-state">No live data streams are registered for this factory.</div>
        )}
        {streams.map((stream) => {
          const controls = stream.capabilities?.controls ?? [];
          const supportsFaultProbability = controls.some((control) =>
            control.inputs?.includes("fault_probability"),
          );
          return (
            <article key={stream.id} className="border-b border-gray-100 p-4 last:border-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex gap-3">
                  <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                    <Cable size={18} />
                  </span>
                  <div>
                    <strong>{stream.name}</strong>
                    <p className="mt-1 text-xs text-gray-500">
                      {stream.base_url} · key ••••{stream.key_hint || "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      stream.status === "connected"
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {stream.status}
                  </span>
                  <button
                    className="square-table-action"
                    title={stream.enabled ? "Disable polling" : "Enable polling"}
                    onClick={() => void toggle(stream)}
                  >
                    <Power size={14} />
                  </button>
                  <button
                    className="square-table-action"
                    title="Rotate API key"
                    onClick={() => setRotationStreamId(stream.id)}
                  >
                    <KeyRound size={14} />
                  </button>
                  <button
                    className="square-table-action"
                    title="Test connection and refresh schema"
                    disabled={!stream.enabled}
                    onClick={() => void discover(stream)}
                  >
                    <RefreshCw size={14} />
                  </button>
                  <button
                    className="square-table-action danger"
                    disabled={stream.assigned_machines > 0 || busy === `delete-${stream.id}`}
                    title={
                      stream.assigned_machines ? "Disconnect assigned machines first" : "Delete stream"
                    }
                    onClick={() => void remove(stream)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {rotationStreamId === stream.id && (
                <div className="mt-3 flex items-end gap-2">
                  <label className="text-xs text-gray-500">
                    New API key
                    <input
                      className="builder-dialog-input mt-1"
                      type="password"
                      autoComplete="new-password"
                      value={rotatedKey}
                      onChange={(event) => setRotatedKey(event.target.value)}
                    />
                  </label>
                  <button
                    className="button button-primary"
                    disabled={!rotatedKey || busy === `rotate-${stream.id}`}
                    onClick={() => void rotateCredential(stream)}
                  >
                    Rotate
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={() => setRotationStreamId(null)}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {stream.last_error && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"><strong>Source needs attention:</strong> {friendlyStreamError(stream.last_error)}</p>}

              <div className="mt-3 grid gap-2">
                {stream.channels.map((channel) => (
                  <div
                    key={channel.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 p-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{channel.name}</span>
                        {channel.control_state && channel.control_state !== "unknown" && (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${channel.control_state === "running" ? "bg-emerald-100 text-emerald-800" : channel.control_state === "paused" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>{channel.control_state}</span>
                        )}
                      </div>
                      <small className="block text-gray-500">
                        {channel.schema_version} · {channel.schema.fields?.length ?? 0} fields ·{" "}
                        {relativeTime(channel.binding_last_received_at)}
                        {channel.assigned_machine_name
                          ? ` · assigned to ${channel.assigned_machine_name}`
                          : " · available"}
                      </small>
                      {channel.binding_error && (
                        <small className="mt-1 block max-w-2xl text-amber-700">{friendlyStreamError(channel.binding_error)}</small>
                      )}
                      {channel.schema_review?.changes.map((change) => (
                        <small key={change.key} className="block text-amber-700">
                          {change.key}: {change.old_type} {change.old_unit || "unitless"} →{" "}
                          {change.new_type} {change.new_unit || "unitless"}
                        </small>
                      ))}
                    </div>

                    {channel.binding_status === "schema_review" && channel.assigned_machine_id && (
                      <button
                        className="button button-secondary"
                        disabled={busy === `schema-${channel.assigned_machine_id}`}
                        onClick={() => void acceptSchema(channel.assigned_machine_id!)}
                      >
                        <ShieldCheck size={12} /> Accept schema changes
                      </button>
                    )}

                    {!!controls.length && stream.enabled && (
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="text-[11px] text-gray-500">
                          Seed
                          <input
                            className="block w-16 rounded border px-2 py-1"
                            value={seed}
                            onChange={(event) => setSeed(event.target.value)}
                          />
                        </label>
                        <label className="text-[11px] text-gray-500">
                          Speed
                          <input
                            className="block w-16 rounded border px-2 py-1"
                            value={speed}
                            onChange={(event) => setSpeed(event.target.value)}
                          />
                        </label>
                        {supportsFaultProbability && (
                          <label className="text-[11px] text-gray-500">
                            Fault trigger
                          <input
                              className="block w-20 rounded border px-2 py-1"
                              type="number"
                              min="0"
                              max="1"
                              step="0.01"
                              value={faultProbability}
                              title="Chance of scheduling a multi-cycle fault after the healthy cooldown"
                              onChange={(event) => setFaultProbability(event.target.value)}
                            />
                          </label>
                        )}
                        <label className="flex items-center gap-1 pb-1 text-[11px] text-gray-500">
                          <input
                            type="checkbox"
                            checked={coldStart}
                            onChange={(event) => setColdStart(event.target.checked)}
                          />
                          Cold start
                        </label>
                        {controls.map((item) => {
                          const Icon = CONTROL_ICONS[item.id] ?? Activity;
                          const key = `${item.id}-${stream.id}-${channel.external_id}`;
                          const working = busy === key;
                          const runningAction = controls.some((control) => control.id === "start") ? "start" : "resume";
                          const selected = (channel.control_state === "running" && item.id === runningAction)
                            || (channel.control_state === "paused" && item.id === "pause")
                            || (channel.control_state === "stopped" && item.id === "stop");
                          const selectedStyle = channel.control_state === "running"
                            ? "stream-control-running"
                            : channel.control_state === "paused"
                              ? "stream-control-paused"
                              : "stream-control-stopped";
                          return (
                            <button
                              key={item.id}
                              className={`button button-secondary ${selected ? `stream-control-selected ${selectedStyle}` : ""}`}
                              aria-pressed={selected}
                              disabled={working}
                              onClick={() => void control(stream, item.id, channel.external_id)}
                            >
                              {working ? <LoaderCircle className="animate-spin" size={12} /> : <Icon size={12} />}
                              {working ? "Working…" : item.label ?? item.id}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="basis-full rounded-lg border border-gray-200 bg-white px-3 py-2">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Live data journey</p>
                      <div className="grid gap-2 text-xs sm:grid-cols-3">
                        <div className={`flex items-center gap-2 rounded-md px-2 py-2 ${stream.status === "connected" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}><span className={`h-2 w-2 rounded-full ${stream.status === "connected" ? "bg-emerald-500" : "bg-amber-500"}`} /><span><strong className="block">1. Source</strong>{stream.status === "connected" ? "Gateway is reachable" : "Waiting to reconnect"}</span></div>
                        <div className={`flex items-center gap-2 rounded-md px-2 py-2 ${channel.binding_status === "active" ? "bg-blue-50 text-blue-800" : "bg-gray-100 text-gray-600"}`}><span className={`h-2 w-2 rounded-full ${channel.binding_status === "active" ? "animate-pulse bg-blue-500" : "bg-gray-400"}`} /><span><strong className="block">2. Pulling readings</strong>{channel.binding_status === "active" ? `Last sample ${relativeTime(channel.binding_last_received_at)}` : channel.binding_status === "schema_review" ? "Waiting for schema approval" : "Not currently pulling"}</span></div>
                        <div className={`flex items-center gap-2 rounded-md px-2 py-2 ${channel.assigned_machine_name ? "bg-violet-50 text-violet-800" : "bg-gray-100 text-gray-600"}`}><span className={`h-2 w-2 rounded-full ${channel.assigned_machine_name ? "bg-violet-500" : "bg-gray-400"}`} /><span><strong className="block">3. Machine</strong>{channel.assigned_machine_name ? `Sending to ${channel.assigned_machine_name}` : "Ready to assign in Lexicon"}</span></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

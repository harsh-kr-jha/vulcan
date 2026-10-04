"use client";

import {
  Activity, AlertTriangle, ArrowLeft, BrainCircuit, Check, CheckCircle2,
  Clock3, Database, Gauge, LoaderCircle,
  PackageCheck, Radio, Settings2, SlidersHorizontal, Sparkles, WifiOff, X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import type { DataStreamField } from "@/lib/data-stream-types";
import { useFactory } from "@/lib/factory-context";

type RangeRule = { key: string; min: number; max: number; weight: number; phases: string[] };
type Profile = { id: string; sku_name: string; version: number };
type Model = { id: string; name: string; version: string; runtime: string; active: boolean; selected: boolean; metrics: Record<string, unknown>; source: string; discovered_at?: string };
type Status = {
  machine?: { id: string; name: string; status: string; factory: { id: string; name: string; code: string } };
  input_stream?: { name: string; channel: string; status: string; last_received_at?: string | null; last_error?: string } | null;
  enabled: boolean; state: string; stale_reason: string; active_profile: string | null;
  pending_profile: string | null; profiles: Profile[]; models: Model[];
  can_manage: boolean; outcome_channel: string | null;
  latest_cycle: { cycle_id?: string; completed?: boolean; profile?: Profile | null; health: number | null; violations: Record<string, boolean>; prediction: { failure_probability: number; label: string; model: string; model_name: string; model_version: string; observed_at: string } | null } | null;
};

const PHASES = ["loading", "clamping", "cutting", "butting", "release"];

function relativeTime(value?: string | null) {
  if (!value) return "No samples received";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  return `${Math.floor(seconds / 3600)} hours ago`;
}

function friendlyError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("database is locked")) return "Data processing is busy. This page will try again automatically.";
  if (lower.includes("run_id") || lower.includes("cycle_id")) return "The incoming stream is missing the cycle details needed for learning.";
  return message;
}

function stateTone(state: string) {
  if (state === "Active") return "bg-emerald-100 text-emerald-800";
  if (state === "Stale") return "bg-amber-100 text-amber-800";
  if (state === "Off") return "bg-gray-100 text-gray-600";
  return "bg-blue-100 text-blue-800";
}

type ProcessState = "done" | "active" | "waiting" | "warning";
function processState(done: boolean, active = false, warning = false): ProcessState {
  return warning ? "warning" : done ? "done" : active ? "active" : "waiting";
}

function ProcessStep({ icon: Icon, title, detail, state }: { icon: typeof Radio; title: string; detail: string; state: ProcessState }) {
  const styles = { done: "border-emerald-200 bg-emerald-50 text-emerald-800", active: "border-blue-200 bg-blue-50 text-blue-800", waiting: "border-gray-200 bg-white text-gray-500", warning: "border-amber-200 bg-amber-50 text-amber-800" };
  return <div className={`h-full rounded-xl border p-3 ${styles[state]}`}>
    <div className="flex items-center gap-2"><span className="relative rounded-lg bg-white/80 p-2 shadow-sm"><Icon size={17} />{state === "active" && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500" />}</span><div className="min-w-0"><p className="text-sm font-semibold">{title}</p><p className="truncate text-xs opacity-75" title={detail}>{detail}</p></div>{state === "done" && <CheckCircle2 className="ml-auto shrink-0" size={17} />}{state === "warning" && <AlertTriangle className="ml-auto shrink-0" size={17} />}{state === "waiting" && <Clock3 className="ml-auto shrink-0" size={16} />}</div>
  </div>;
}

function MetricCard({ label, value, detail, tone = "plain" }: { label: string; value: string; detail: string; tone?: "plain" | "good" | "bad" | "amber" }) {
  const tones = { plain: "border-gray-200 bg-white", good: "border-emerald-200 bg-emerald-50/70", bad: "border-red-200 bg-red-50/70", amber: "border-amber-200 bg-amber-50/70" };
  return <div className={`rounded-xl border p-4 ${tones[tone]}`}><p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p><p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p><p className="mt-1 text-xs text-gray-500">{detail}</p></div>;
}

export function MachineMLSummary({ machineId }: { machineId: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => api.mlStatus<Status>(machineId).then((value) => { if (!cancelled) setStatus(value); }).catch(() => {});
    void refresh(); const timer = window.setInterval(refresh, 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [machineId]);
  const latest = status?.latest_cycle;
  return <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3 text-xs"><div className="flex items-center justify-between gap-2"><a className="flex items-center gap-1.5 font-semibold text-blue-700" href={`/digital-twin/ml/${machineId}`}><BrainCircuit size={14} /> ML Observation</a><span className={`rounded-full px-2 py-1 font-semibold ${stateTone(status?.state ?? "Off")}`}>{status?.state ?? "Loading"}</span></div>{status?.enabled && <><p>Product: <strong>{status.profiles.find((p) => p.id === status.active_profile)?.sku_name ?? "Not selected"}</strong></p><p>Cycle health: <strong>{latest?.health == null ? "Calculating" : `${latest.health.toFixed(1)}%`}</strong></p><p>{latest?.prediction ? `${latest.prediction.label === "failure" ? "May fail" : "Looks good"} · ${(100 * latest.prediction.failure_probability).toFixed(1)}% risk` : "Waiting for an active model"}</p></>}</div>;
}

type MachineMLView = "observation" | "configuration";

export function MachineML({ machineId, embedded = false, view = "observation" }: { machineId: string; embedded?: boolean; view?: MachineMLView }) {
  const { state } = useFactory();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [sku, setSku] = useState("");
  const [phase, setPhase] = useState("cutting"); const [second, setSecond] = useState(3);
  const [fields, setFields] = useState<DataStreamField[]>([]); const [ranges, setRanges] = useState<RangeRule[]>([]);
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);

  const refresh = async () => { try { setStatus(await api.mlStatus<Status>(machineId)); } catch (cause) { setError(cause instanceof Error ? friendlyError(cause.message) : "Could not refresh status."); } };
  useEffect(() => {
    let cancelled = false;
    const loadStatus = () => api.mlStatus<Status>(machineId).then((value) => { if (!cancelled) setStatus(value); }).catch((cause: Error) => { if (!cancelled) setError(friendlyError(cause.message)); });
    void loadStatus();
    api.listDataStreams(state.activeFactoryId).then((streams) => {
      if (cancelled) return;
      setChannels(streams.flatMap((stream) => stream.channels.filter((channel) => channel.schema.fields?.some((field) => field.semantic === "quality_outcome")).map((channel) => ({ id: channel.id, name: `${stream.name} / ${channel.name}` }))));
      const bound = streams.flatMap((stream) => stream.channels).find((channel) => channel.assigned_machine_id === machineId);
      setFields(bound?.schema.fields?.filter((field) => field.data_type === "number") ?? []);
    }).catch((cause: Error) => setError(friendlyError(cause.message)));
    const timer = window.setInterval(loadStatus, 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [machineId, state.activeFactoryId]);
  async function action(name: string, data: object) { setBusy(true); setError(""); try { await api.mlAction(machineId, name, data); await refresh(); } catch (cause) { setError(friendlyError(cause instanceof Error ? cause.message : "The change could not be completed.")); } finally { setBusy(false); } }

  const activeSkus = state.masters.skus.filter((item) => item.active && item.factoryId === state.activeFactoryId);
  const activeProfile = status?.profiles.find((profile) => profile.id === status.active_profile);
  const pendingProfile = status?.profiles.find((profile) => profile.id === status.pending_profile);
  const latest = status?.latest_cycle;
  const activeModel = status?.models.find((model) => model.selected); const hasModel = Boolean(activeModel);
  const sourceWarning = Boolean(status?.input_stream?.last_error);
  const rangeWarning = Boolean(status?.stale_reason);
  const healthTone = latest?.health == null ? "plain" : latest.health >= 90 ? "good" : latest.health >= 70 ? "amber" : "bad";
  const fieldByKey = useMemo(() => new Map(fields.map((field) => [field.key, field])), [fields]);
  function addRange() { const unused = fields.find((field) => !ranges.some((rule) => rule.key === field.key)); if (unused) setRanges([...ranges, { key: unused.key, min: 0, max: 0, weight: 1, phases: ["cutting"] }]); }
  function addAllRanges() { setRanges((current) => [...current, ...fields.filter((field) => !current.some((rule) => rule.key === field.key)).map((field) => ({ key: field.key, min: 0, max: 0, weight: 1, phases: ["cutting"] }))]); }
  function togglePhase(index: number, selectedPhase: string) { setRanges(ranges.map((rule, ruleIndex) => ruleIndex !== index ? rule : { ...rule, phases: rule.phases.includes(selectedPhase) ? rule.phases.filter((item) => item !== selectedPhase) : [...rule.phases, selectedPhase] })); }

  if (!status) return <section className="panel flex min-h-72 items-center justify-center p-8"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-emerald-600" /><p className="mt-3 text-sm text-gray-600">Opening this machine’s observation workspace…</p></div></section>;

  return <div className={`space-y-4 ${embedded ? "pb-2" : "pb-10"}`}>
    {view === "observation" && <>
    <section className={`overflow-hidden rounded-2xl border border-gray-200 bg-white ${embedded ? "shadow-none" : "shadow-sm"}`}><div className="bg-gradient-to-r from-emerald-50 via-white to-blue-50 p-5 md:p-6">{!embedded && <a href="/digital-twin" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"><ArrowLeft size={15} /> Back to Lexicon</a>}<div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div className="flex items-start gap-3"><span className="rounded-xl bg-emerald-600 p-3 text-white shadow-sm"><BrainCircuit size={24} /></span><div><div className="flex flex-wrap items-center gap-2"><h1 className={`${embedded ? "text-xl" : "text-2xl"} font-semibold tracking-tight text-gray-950`}>{status.machine?.name ?? "Machine"}</h1><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${stateTone(status.state)}`}>{status.state}</span></div><p className="mt-1 text-sm text-gray-600">ML Observation · {status.machine?.factory.name ?? "Current factory"}</p><p className="mt-2 max-w-2xl text-sm text-gray-500">Watch each production cycle, check operating ranges, and estimate whether the product will be good or may fail.</p></div></div>{status.can_manage && <div className="flex items-center justify-between gap-5 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"><span><span className="block text-sm font-semibold text-gray-900">Observation</span><span className="block text-xs text-gray-500">{status.enabled ? "Watching new samples" : "Currently switched off"}</span></span><button type="button" role="switch" aria-label="Enable ML Observation" aria-checked={status.enabled} disabled={busy} onClick={() => void action("configuration", { enabled: !status.enabled })} className={`relative inline-flex h-6 w-11 shrink-0 items-center overflow-hidden rounded-full border p-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${status.enabled ? "border-emerald-600 bg-emerald-600" : "border-slate-300 bg-slate-300"}`}><span aria-hidden="true" className={`absolute left-0.5 top-0.5 block h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform duration-200 ${status.enabled ? "translate-x-5" : "translate-x-0"}`} /></button></div>}</div></div>{(error || status.stale_reason) && <div role="alert" className="flex items-start gap-3 border-t border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 shrink-0" size={17} /><div><strong>Needs attention</strong><p>{friendlyError(error || status.stale_reason)}</p></div>{error && <button aria-label="Dismiss message" className="ml-auto" onClick={() => setError("")}><X size={16} /></button>}</div>}</section>

    <section className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 shadow-sm"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold text-gray-900">What is happening now</h2><p className="text-xs text-gray-500">Updates automatically every five seconds.</p></div><button className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700" onClick={() => void refresh()}><Activity size={14} /> Refresh now</button></div><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4"><ProcessStep icon={Radio} title="1. Receiving data" detail={status.input_stream ? `${status.input_stream.channel} · ${relativeTime(status.input_stream.last_received_at)}` : "Connect a data stream"} state={processState(Boolean(status.input_stream) && !sourceWarning, false, sourceWarning)} /><ProcessStep icon={Gauge} title="2. Checking ranges" detail={rangeWarning ? friendlyError(status.stale_reason) : !activeProfile ? "Choose a product profile" : status.enabled ? `${activeProfile.sku_name} rules are active` : "Ready when observation is on"} state={processState(Boolean(activeProfile) && status.enabled, Boolean(activeProfile) && !status.enabled, rangeWarning)} /><ProcessStep icon={Database} title="3. Loading model" detail={activeModel ? `${activeModel.name} · v${activeModel.version}` : "Waiting for a production manifest"} state={processState(hasModel, status.enabled && !hasModel)} /><ProcessStep icon={Sparkles} title="4. Predicting quality" detail={latest?.prediction ? `${latest.prediction.model_name} v${latest.prediction.model_version}` : hasModel ? "Ready for the next prediction point" : "No compatible model selected"} state={processState(Boolean(latest?.prediction), hasModel)} /></div></section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Production type" value={activeProfile?.sku_name ?? "Not selected"} detail={pendingProfile ? `${pendingProfile.sku_name} starts next cycle` : activeProfile ? `Profile version ${activeProfile.version}` : "Set this before observation"} tone={activeProfile ? "good" : "amber"} /><MetricCard label="Current cycle health" value={latest?.health == null ? "—" : `${latest.health.toFixed(1)}%`} detail={!status.enabled ? "Observation is off" : latest?.completed ? "Final cycle score" : latest ? "Updating as readings arrive" : "Waiting for the next cycle"} tone={healthTone} /><MetricCard label="Quality prediction" value={latest?.prediction ? (latest.prediction.label === "failure" ? "May fail" : "Looks good") : "Not available"} detail={latest?.prediction ? `${(latest.prediction.failure_probability * 100).toFixed(1)}% failure risk` : hasModel ? "Waiting for readings" : "Add a production model manifest"} tone={latest?.prediction?.label === "failure" ? "bad" : latest?.prediction ? "good" : "plain"} /><MetricCard label="Prediction model" value={activeModel ? `v${activeModel.version}` : "None"} detail={activeModel ? `${activeModel.name} · ${activeModel.source}` : "Externally trained model required"} tone={activeModel ? "good" : "amber"} /></section>

    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 font-semibold text-gray-900"><PackageCheck size={18} className="text-emerald-600" /> Live cycle</h2>{!latest ? <div className="mt-5 rounded-xl bg-gray-50 p-5 text-center"><Clock3 className="mx-auto text-gray-400" /><p className="mt-2 text-sm font-medium">Waiting for a new cycle</p><p className="mt-1 text-xs text-gray-500">Details appear when the stream sends them.</p></div> : <div className="mt-4 space-y-3"><div className="flex items-center justify-between rounded-xl bg-gray-50 p-3"><span className="text-sm text-gray-500">Cycle</span><strong className="max-w-[60%] truncate text-sm">{latest.cycle_id ?? "Current cycle"}</strong></div><div className="flex items-center justify-between rounded-xl bg-gray-50 p-3"><span className="text-sm text-gray-500">Range checks</span><strong className="text-sm">{!status.enabled ? "Checks paused" : !latest.profile ? "Not observed" : Object.values(latest.violations ?? {}).filter(Boolean).length ? `${Object.values(latest.violations).filter(Boolean).length} need attention` : "All okay"}</strong></div>{status.enabled && Object.entries(latest.violations ?? {}).filter(([, bad]) => bad).map(([key]) => <div key={key} className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-800"><AlertTriangle size={14} /> {fieldByKey.get(key)?.label ?? key} is outside its range</div>)}</div>}</section>
    </>}

    {view === "configuration" && <section className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white p-5"><div className="flex items-start gap-3"><span className="rounded-xl bg-emerald-100 p-2.5 text-emerald-700"><SlidersHorizontal size={20} /></span><div><h2 className="font-semibold text-slate-950">Healthy operating ranges</h2><p className="mt-1 max-w-2xl text-sm leading-5 text-slate-600">Set the acceptable values for every numeric parameter, separately for each product made on this machine. Publishing creates a new version without changing earlier cycle history.</p></div></div></section>}
    {view === "configuration" && error && <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 shrink-0" size={17} /><div><strong>Could not save this configuration</strong><p>{friendlyError(error)}</p></div><button aria-label="Dismiss message" className="ml-auto" onClick={() => setError("")}><X size={16} /></button></div>}
    {view === "configuration" && !status.can_manage && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">You can view machine health, but you do not have permission to change product profiles.</section>}
    {view === "configuration" && status.can_manage && <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white"><Check size={13} /></span><h3 className="font-semibold text-slate-900">Profile in production</h3></div><p className="mt-2 text-xs leading-5 text-slate-500">Choose which published limits apply to incoming cycles.</p><select aria-label="Active production profile" className="builder-dialog-input mt-3" value={status.pending_profile ?? status.active_profile ?? ""} disabled={busy} onChange={(event) => void action("activate", { profile: event.target.value })}><option value="">Select a published profile</option>{status.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.sku_name} · version {profile.version}</option>)}</select>{pendingProfile && <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700"><Clock3 size={13} /> {pendingProfile.sku_name} starts safely with the next cycle.</p>}</div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">↗</span><h3 className="font-semibold text-slate-900">Product result source</h3></div><p className="mt-2 text-xs leading-5 text-slate-500">Used for analysis and model development; never used as a prediction input.</p><select aria-label="Product result source" className="builder-dialog-input mt-3" value={status.outcome_channel ?? ""} disabled={busy} onChange={(event) => void action("outcome-binding", { channel: event.target.value || null })}><option value="">Same telemetry stream (recommended)</option>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 px-5 py-4"><div className="flex items-center gap-2"><Settings2 size={18} className="text-slate-600" /><h3 className="font-semibold text-slate-950">Create a healthy-range profile</h3></div><p className="mt-1 text-sm text-slate-500">Work through the three steps, then publish the profile.</p></header>
        <div className="space-y-7 p-5">
          <div><div className="mb-3 flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">1</span><div><h4 className="text-sm font-semibold text-slate-900">Choose a product</h4><p className="text-xs text-slate-500">Ranges are saved separately for each product.</p></div></div>{activeSkus.length === 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>No active products are available.</strong><p className="mt-1">Add a product to the factory catalogue before creating ranges.</p><a className="mt-2 inline-flex font-semibold underline" href="/settings?tab=catalogue">Open product catalogue</a></div> : <select aria-label="Product for healthy ranges" className="builder-dialog-input" value={sku} onChange={(event) => setSku(event.target.value)}><option value="">Select a product…</option>{activeSkus.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}</select>}</div>

          <div><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">2</span><div><h4 className="text-sm font-semibold text-slate-900">Define healthy parameters</h4><p className="text-xs text-slate-500">Set acceptable limits and the production phases where each limit applies.</p></div></div><div className="flex gap-2"><button type="button" className="button button-secondary" disabled={!fields.some((field) => !ranges.some((rule) => rule.key === field.key))} onClick={addRange}>Add one</button><button type="button" className="button button-secondary" disabled={!fields.some((field) => !ranges.some((rule) => rule.key === field.key))} onClick={addAllRanges}>Add all</button></div></div>
            {!fields.length && <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><WifiOff size={17} className="shrink-0" /> Connect a numeric telemetry stream to configure healthy ranges.</div>}
            {!!fields.length && !ranges.length && <button type="button" onClick={addAllRanges} className="w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center transition hover:border-emerald-400 hover:bg-emerald-50/40"><strong className="block text-sm text-slate-800">No parameters added yet</strong><span className="mt-1 block text-xs text-slate-500">Add all {fields.length} numeric parameters to get started.</span></button>}
            <div className="space-y-3">{ranges.map((rule, index) => { const selectedField = fieldByKey.get(rule.key); const invalid = rule.min > rule.max || !rule.phases.length; return <article key={`${rule.key}-${index}`} className={`rounded-xl border p-4 ${invalid ? "border-red-200 bg-red-50/40" : "border-slate-200 bg-slate-50/60"}`}><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-xs font-bold text-slate-500 ring-1 ring-slate-200">{index + 1}</span><div><p className="text-sm font-semibold text-slate-900">{selectedField?.label ?? rule.key}</p><p className="text-xs text-slate-500">{selectedField?.unit || "Unitless parameter"}</p></div></div><button type="button" aria-label={`Remove ${rule.key} range`} className="rounded-md p-1.5 text-slate-400 hover:bg-red-100 hover:text-red-700" onClick={() => setRanges(ranges.filter((_, itemIndex) => itemIndex !== index))}><X size={15} /></button></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-xs font-medium text-slate-600">Parameter<select className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm" value={rule.key} onChange={(event) => setRanges(ranges.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item))}>{fields.map((field) => <option key={field.key} value={field.key}>{field.label || field.key}</option>)}</select></label>{(["min", "max", "weight"] as const).map((key) => <label key={key} className="text-xs font-medium text-slate-600">{key === "min" ? "Healthy minimum" : key === "max" ? "Healthy maximum" : "Importance"}<input className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm" type="number" value={rule[key]} onChange={(event) => setRanges(ranges.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: Number(event.target.value) } : item))} /></label>)}</div><div className="mt-4"><p className="mb-2 text-xs font-medium text-slate-600">Apply during phases</p><div className="flex flex-wrap gap-2">{PHASES.map((item) => <button key={item} type="button" aria-pressed={rule.phases.includes(item)} onClick={() => togglePhase(index, item)} className={`rounded-full border px-3 py-1.5 text-xs capitalize transition ${rule.phases.includes(item) ? "border-emerald-300 bg-emerald-100 font-semibold text-emerald-900" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"}`}>{rule.phases.includes(item) && <Check className="mr-1 inline" size={12} />}{item}</button>)}</div></div>{rule.min > rule.max && <p className="mt-3 text-xs font-medium text-red-700">Minimum must be lower than or equal to maximum.</p>}{!rule.phases.length && <p className="mt-3 text-xs font-medium text-red-700">Select at least one production phase.</p>}</article>; })}</div>
          </div>

          <div><div className="mb-3 flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">3</span><div><h4 className="text-sm font-semibold text-slate-900">Choose the prediction point</h4><p className="text-xs text-slate-500">This is when the cycle receives its official quality prediction.</p></div></div><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700">Production phase<select className="builder-dialog-input mt-1 capitalize" value={phase} onChange={(event) => setPhase(event.target.value)}>{PHASES.map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Seconds into phase<input className="builder-dialog-input mt-1" type="number" min={1} value={second} onChange={(event) => setSecond(Number(event.target.value))} /></label></div></div>
        </div>
        <footer className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-500">Publishing creates a new immutable profile version.</p><button className="button button-primary justify-center" disabled={busy || !sku || !ranges.length || ranges.some((rule) => rule.min > rule.max || !rule.phases.length)} onClick={() => void action("profiles", { sku, ranges, checkpoint_phase: phase, checkpoint_second: second })}>{busy ? "Publishing…" : "Publish healthy-range profile"}</button></footer>
      </section>
    </div>}

    {view === "observation" && <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div><h2 className="flex items-center gap-2 font-semibold text-gray-900"><BrainCircuit size={18} className="text-blue-600" /> Model registry</h2><p className="mt-1 text-sm text-gray-500">Externally trained, versioned models discovered for this machine. Production selection is declared in the manifest.</p></div>{!status.models.length ? <div className="mt-4 rounded-xl bg-gray-50 p-5 text-center text-sm text-gray-500">No compatible model manifests have been ingested for this machine.</div> : <div className="mt-4 grid gap-3">{status.models.map((model) => { const accuracyValue = model.metrics?.balanced_accuracy; const accuracy = typeof accuracyValue === "number" ? `${(accuracyValue * 100).toFixed(1)}% balanced accuracy` : "No evaluation metric supplied"; return <article key={model.id} className={`rounded-xl border p-4 ${model.selected ? "border-emerald-300 bg-emerald-50/50" : "border-gray-200"}`}><div className="flex items-start gap-3"><span className={`mt-0.5 rounded-lg p-2 ${model.selected ? "bg-emerald-100 text-emerald-700" : "bg-blue-50 text-blue-700"}`}><CheckCircle2 size={17} /></span><div><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{model.name} · v{model.version}</strong>{model.selected && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Predicting</span>}{model.active && !model.selected && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">Production for another profile</span>}</div><p className="mt-1 text-xs text-gray-500">{accuracy} · {model.runtime} · {model.source}</p>{model.discovered_at && <p className="mt-1 text-xs text-gray-500">Registry refreshed {relativeTime(model.discovered_at)}</p>}</div></div></article>; })}</div>}</section>}
  </div>;
}

export function MachineHealthyRanges({ machineId }: { machineId: string }) {
  return <MachineML machineId={machineId} embedded view="configuration" />;
}

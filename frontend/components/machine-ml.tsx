"use client";

import {
  Activity, AlertTriangle, ArrowLeft, BrainCircuit, Check, CheckCircle2,
  ChevronDown, ChevronUp, Clock3, Database, Gauge, LoaderCircle,
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

export function MachineML({ machineId }: { machineId: string }) {
  const { state } = useFactory();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [showSetup, setShowSetup] = useState(false); const [sku, setSku] = useState("");
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
  function togglePhase(index: number, selectedPhase: string) { setRanges(ranges.map((rule, ruleIndex) => ruleIndex !== index ? rule : { ...rule, phases: rule.phases.includes(selectedPhase) ? rule.phases.filter((item) => item !== selectedPhase) : [...rule.phases, selectedPhase] })); }

  if (!status) return <section className="panel flex min-h-72 items-center justify-center p-8"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-emerald-600" /><p className="mt-3 text-sm text-gray-600">Opening this machine’s observation workspace…</p></div></section>;

  return <div className="space-y-4 pb-10">
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"><div className="bg-gradient-to-r from-emerald-50 via-white to-blue-50 p-5 md:p-6"><a href="/digital-twin" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"><ArrowLeft size={15} /> Back to Lexicon</a><div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div className="flex items-start gap-3"><span className="rounded-xl bg-emerald-600 p-3 text-white shadow-sm"><BrainCircuit size={24} /></span><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight text-gray-950">{status.machine?.name ?? "Machine"}</h1><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${stateTone(status.state)}`}>{status.state}</span></div><p className="mt-1 text-sm text-gray-600">ML Observation · {status.machine?.factory.name ?? "Current factory"}</p><p className="mt-2 max-w-2xl text-sm text-gray-500">Watch each production cycle, check operating ranges, and estimate whether the product will be good or may fail.</p></div></div>{status.can_manage && <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"><span><span className="block text-sm font-semibold text-gray-900">Observation</span><span className="block text-xs text-gray-500">{status.enabled ? "Watching new samples" : "Currently switched off"}</span></span><button type="button" role="switch" aria-label="Enable ML Observation" aria-checked={status.enabled} disabled={busy} onClick={() => void action("configuration", { enabled: !status.enabled })} className={`relative h-7 w-12 rounded-full transition ${status.enabled ? "bg-emerald-600" : "bg-gray-300"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${status.enabled ? "left-6" : "left-1"}`} /></button></div>}</div></div>{(error || status.stale_reason) && <div role="alert" className="flex items-start gap-3 border-t border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 shrink-0" size={17} /><div><strong>Needs attention</strong><p>{friendlyError(error || status.stale_reason)}</p></div>{error && <button aria-label="Dismiss message" className="ml-auto" onClick={() => setError("")}><X size={16} /></button>}</div>}</section>

    <section className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 shadow-sm"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold text-gray-900">What is happening now</h2><p className="text-xs text-gray-500">Updates automatically every five seconds.</p></div><button className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700" onClick={() => void refresh()}><Activity size={14} /> Refresh now</button></div><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4"><ProcessStep icon={Radio} title="1. Receiving data" detail={status.input_stream ? `${status.input_stream.channel} · ${relativeTime(status.input_stream.last_received_at)}` : "Connect a data stream"} state={processState(Boolean(status.input_stream) && !sourceWarning, false, sourceWarning)} /><ProcessStep icon={Gauge} title="2. Checking ranges" detail={rangeWarning ? friendlyError(status.stale_reason) : !activeProfile ? "Choose a product profile" : status.enabled ? `${activeProfile.sku_name} rules are active` : "Ready when observation is on"} state={processState(Boolean(activeProfile) && status.enabled, Boolean(activeProfile) && !status.enabled, rangeWarning)} /><ProcessStep icon={Database} title="3. Loading model" detail={activeModel ? `${activeModel.name} · v${activeModel.version}` : "Waiting for a production manifest"} state={processState(hasModel, status.enabled && !hasModel)} /><ProcessStep icon={Sparkles} title="4. Predicting quality" detail={latest?.prediction ? `${latest.prediction.model_name} v${latest.prediction.model_version}` : hasModel ? "Ready for the next prediction point" : "No compatible model selected"} state={processState(Boolean(latest?.prediction), hasModel)} /></div></section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Production type" value={activeProfile?.sku_name ?? "Not selected"} detail={pendingProfile ? `${pendingProfile.sku_name} starts next cycle` : activeProfile ? `Profile version ${activeProfile.version}` : "Set this before observation"} tone={activeProfile ? "good" : "amber"} /><MetricCard label="Current cycle health" value={latest?.health == null ? "—" : `${latest.health.toFixed(1)}%`} detail={!status.enabled ? "Observation is off" : latest?.completed ? "Final cycle score" : latest ? "Updating as readings arrive" : "Waiting for the next cycle"} tone={healthTone} /><MetricCard label="Quality prediction" value={latest?.prediction ? (latest.prediction.label === "failure" ? "May fail" : "Looks good") : "Not available"} detail={latest?.prediction ? `${(latest.prediction.failure_probability * 100).toFixed(1)}% failure risk` : hasModel ? "Waiting for readings" : "Add a production model manifest"} tone={latest?.prediction?.label === "failure" ? "bad" : latest?.prediction ? "good" : "plain"} /><MetricCard label="Prediction model" value={activeModel ? `v${activeModel.version}` : "None"} detail={activeModel ? `${activeModel.name} · ${activeModel.source}` : "Externally trained model required"} tone={activeModel ? "good" : "amber"} /></section>

    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 font-semibold text-gray-900"><PackageCheck size={18} className="text-emerald-600" /> Live cycle</h2>{!latest ? <div className="mt-5 rounded-xl bg-gray-50 p-5 text-center"><Clock3 className="mx-auto text-gray-400" /><p className="mt-2 text-sm font-medium">Waiting for a new cycle</p><p className="mt-1 text-xs text-gray-500">Details appear when the stream sends them.</p></div> : <div className="mt-4 space-y-3"><div className="flex items-center justify-between rounded-xl bg-gray-50 p-3"><span className="text-sm text-gray-500">Cycle</span><strong className="max-w-[60%] truncate text-sm">{latest.cycle_id ?? "Current cycle"}</strong></div><div className="flex items-center justify-between rounded-xl bg-gray-50 p-3"><span className="text-sm text-gray-500">Range checks</span><strong className="text-sm">{!status.enabled ? "Checks paused" : !latest.profile ? "Not observed" : Object.values(latest.violations ?? {}).filter(Boolean).length ? `${Object.values(latest.violations).filter(Boolean).length} need attention` : "All okay"}</strong></div>{status.enabled && Object.entries(latest.violations ?? {}).filter(([, bad]) => bad).map(([key]) => <div key={key} className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-800"><AlertTriangle size={14} /> {fieldByKey.get(key)?.label ?? key} is outside its range</div>)}</div>}</section>

    {status.can_manage && <section className="rounded-2xl border border-gray-200 bg-white shadow-sm"><button className="flex w-full items-center justify-between gap-3 p-5 text-left" onClick={() => setShowSetup((value) => !value)}><span><span className="flex items-center gap-2 font-semibold text-gray-900"><Settings2 size={18} /> Production setup</span><span className="mt-1 block text-sm text-gray-500">Choose the product, acceptable ranges and prediction point.</span></span>{showSetup ? <ChevronUp /> : <ChevronDown />}</button>{showSetup && <div className="space-y-6 border-t border-gray-200 p-5"><div><label className="mb-1.5 block text-sm font-semibold text-gray-800">Active production profile</label><select className="builder-dialog-input" value={status.pending_profile ?? status.active_profile ?? ""} disabled={busy} onChange={(event) => void action("activate", { profile: event.target.value })}><option value="">Select a published profile</option>{status.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.sku_name} · version {profile.version}</option>)}</select>{pendingProfile && <p className="mt-2 flex items-center gap-1.5 text-xs text-blue-700"><Clock3 size={13} /> This profile starts safely with the next cycle.</p>}</div>
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-gray-900">Create a new profile</h3><p className="mt-1 text-xs text-gray-500">A published profile becomes a new version. Older history stays unchanged.</p></div><SlidersHorizontal className="text-gray-400" /></div>{activeSkus.length === 0 ? <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>No products have been added yet.</strong><p className="mt-1">Add a product, then return here to set its ranges.</p><a className="mt-2 inline-flex font-semibold underline" href="/settings?tab=catalogue">Add a Product/SKU</a></div> : <label className="mt-4 block text-sm font-medium text-gray-700">Product/SKU<select className="builder-dialog-input mt-1" value={sku} onChange={(event) => setSku(event.target.value)}><option value="">Choose a product</option>{activeSkus.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}</select></label>}
      <div className="mt-4 space-y-3">{ranges.map((rule, index) => { const selectedField = fieldByKey.get(rule.key); return <div key={`${rule.key}-${index}`} className="rounded-xl border border-gray-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-gray-900">{selectedField?.label ?? rule.key}</p><p className="text-xs text-gray-500">{selectedField?.unit || "No unit"}</p></div><button aria-label={`Remove ${rule.key} range`} className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" onClick={() => setRanges(ranges.filter((_, itemIndex) => itemIndex !== index))}><X size={16} /></button></div><div className="mt-3 grid gap-3 sm:grid-cols-4"><label className="text-xs text-gray-500">Parameter<select className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-2 text-sm" value={rule.key} onChange={(event) => setRanges(ranges.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item))}>{fields.map((field) => <option key={field.key} value={field.key}>{field.label || field.key}</option>)}</select></label>{(["min", "max", "weight"] as const).map((key) => <label key={key} className="text-xs text-gray-500">{key === "min" ? "Minimum" : key === "max" ? "Maximum" : "Importance"}<input className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm" type="number" value={rule[key]} onChange={(event) => setRanges(ranges.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: Number(event.target.value) } : item))} /></label>)}</div><div className="mt-3"><p className="mb-2 text-xs text-gray-500">Check this range during</p><div className="flex flex-wrap gap-2">{PHASES.map((item) => <button key={item} type="button" onClick={() => togglePhase(index, item)} className={`rounded-full border px-3 py-1 text-xs capitalize ${rule.phases.includes(item) ? "border-emerald-300 bg-emerald-50 font-semibold text-emerald-800" : "border-gray-200 bg-white text-gray-500"}`}>{rule.phases.includes(item) && <Check className="mr-1 inline" size={12} />}{item}</button>)}</div></div></div>; })}</div><button className="button button-secondary mt-4" disabled={!fields.some((field) => !ranges.some((rule) => rule.key === field.key))} onClick={addRange}>+ Add parameter range</button>{!fields.length && <p className="mt-3 flex items-center gap-2 text-sm text-amber-800"><WifiOff size={16} /> Connect a numeric telemetry stream first.</p>}<div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-gray-700">Official prediction stage<select className="builder-dialog-input mt-1 capitalize" value={phase} onChange={(event) => setPhase(event.target.value)}>{PHASES.map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-sm font-medium text-gray-700">Seconds into this stage<input className="builder-dialog-input mt-1" type="number" min={1} value={second} onChange={(event) => setSecond(Number(event.target.value))} /></label></div><button className="button button-primary mt-4" disabled={busy || !sku || !ranges.length || ranges.some((rule) => rule.min > rule.max || !rule.phases.length)} onClick={() => void action("profiles", { sku, ranges, checkpoint_phase: phase, checkpoint_second: second })}>Publish new profile</button></div>
      <label className="block text-sm font-semibold text-gray-800">Where product results come from<select className="builder-dialog-input mt-1" value={status.outcome_channel ?? ""} onChange={(event) => void action("outcome-binding", { channel: event.target.value || null })}><option value="">Same telemetry stream (recommended)</option>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select><span className="mt-1 block text-xs font-normal text-gray-500">Results are retained for analysis and external model development. They are never prediction inputs.</span></label></div>}</section>}

    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div><h2 className="flex items-center gap-2 font-semibold text-gray-900"><BrainCircuit size={18} className="text-blue-600" /> Model registry</h2><p className="mt-1 text-sm text-gray-500">Externally trained, versioned models discovered for this machine. Production selection is declared in the manifest.</p></div>{!status.models.length ? <div className="mt-4 rounded-xl bg-gray-50 p-5 text-center text-sm text-gray-500">No compatible model manifests have been ingested for this machine.</div> : <div className="mt-4 grid gap-3">{status.models.map((model) => { const accuracyValue = model.metrics?.balanced_accuracy; const accuracy = typeof accuracyValue === "number" ? `${(accuracyValue * 100).toFixed(1)}% balanced accuracy` : "No evaluation metric supplied"; return <article key={model.id} className={`rounded-xl border p-4 ${model.selected ? "border-emerald-300 bg-emerald-50/50" : "border-gray-200"}`}><div className="flex items-start gap-3"><span className={`mt-0.5 rounded-lg p-2 ${model.selected ? "bg-emerald-100 text-emerald-700" : "bg-blue-50 text-blue-700"}`}><CheckCircle2 size={17} /></span><div><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{model.name} · v{model.version}</strong>{model.selected && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Predicting</span>}{model.active && !model.selected && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">Production for another profile</span>}</div><p className="mt-1 text-xs text-gray-500">{accuracy} · {model.runtime} · {model.source}</p>{model.discovered_at && <p className="mt-1 text-xs text-gray-500">Registry refreshed {relativeTime(model.discovered_at)}</p>}</div></div></article>; })}</div>}</section>
  </div>;
}

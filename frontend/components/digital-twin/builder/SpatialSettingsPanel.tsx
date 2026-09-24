"use client";

import { ArrowDown, ArrowUp, Box, Plus, Trash2, Upload, X } from "lucide-react";
import { useState } from "react";
import { useFactoryBuilder } from "@/lib/factory-builder-context";
import { useFactory } from "@/lib/factory-context";
import { getCsrfToken } from "@/lib/api-client";
import type { FactoryModelAsset, FactoryZone, ModelTransform } from "@/lib/spatial-types";
import { DEFAULT_STATUS_VISUALIZATION } from "@/lib/spatial-api";

export function SpatialSettingsPanel({ onClose, onStartZone }: { onClose: () => void; onStartZone: () => void }) {
  const { state, configureZones, configureModelTransform, configureModelAsset, configureStatusVisualization } = useFactoryBuilder();
  const { state: factoryState } = useFactory();
  const [uploading, setUploading] = useState(false); const [error, setError] = useState("");
  const zones = state.layout.zones ?? [];
  const lines = factoryState.masters.lines;
  const transform = state.layout.modelTransform ?? { offsetX: 0, offsetY: 0, elevation: 0, scale: 1, rotationY: 0 };
  const statusConfig = { ...DEFAULT_STATUS_VISUALIZATION, ...(state.layout.statusVisualization ?? {}) };
  const updateZone = (id: string, patch: Partial<FactoryZone>) => configureZones(zones.map((zone) => zone.id === id ? { ...zone, ...patch } : zone));
  const updateTransform = (key: keyof ModelTransform, value: number) => configureModelTransform({ ...transform, [key]: Number.isFinite(value) ? value : 0 });
  async function upload(file?: File) {
    if (!file || !state.layout.id) return;
    setUploading(true); setError("");
    try { const data = new FormData(); data.append("file", file); const response = await fetch(`/api/backend/api/spatial/layouts/${state.layout.id}/model/`, { method: "POST", headers: { "X-CSRFToken": await getCsrfToken() }, credentials: "same-origin", body: data }); const body = await response.json(); if (!response.ok) throw new Error(body.file ?? body.detail ?? "Upload failed."); configureModelAsset({ id: body.id, filename: body.filename, sizeBytes: body.size_bytes, checksumSha256: body.checksum_sha256, downloadUrl: body.download_url } as FactoryModelAsset); } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed."); } finally { setUploading(false); }
  }
  return <aside className="absolute inset-y-0 right-0 z-40 flex w-[420px] max-w-full flex-col border-l border-slate-200 bg-white shadow-2xl" role="dialog" aria-label="Spatial layout settings">
    <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold text-slate-950">Spatial layout</h2><p className="text-xs text-slate-500">Zones and optional 3D context</p></div><button className="icon-button" onClick={onClose}><X size={18} /></button></header>
    <div className="flex-1 space-y-6 overflow-y-auto p-5">
      <section><div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-semibold text-slate-900">Zones</h3><p className="text-xs text-slate-500">Right-drag the floor after choosing Add zone.</p></div><button className="button button-secondary" onClick={onStartZone}><Plus size={13} /> Add zone</button></div>
        <div className="space-y-3">{zones.map((zone, index) => <article key={zone.id} className="rounded-xl border border-slate-200 p-3"><div className="flex gap-2"><input className="input flex-1" value={zone.name} onChange={(e) => updateZone(zone.id, { name: e.target.value })} aria-label="Zone name" /><input type="color" value={zone.color.slice(0, 7)} onChange={(e) => updateZone(zone.id, { color: e.target.value.toUpperCase() })} className="h-9 w-10" /><button className="icon-button" disabled={index === 0} onClick={() => { const next = [...zones]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; configureZones(next.map((item, order) => ({ ...item, displayOrder: order }))); }} title="Move zone up"><ArrowUp size={13} /></button><button className="icon-button" disabled={index === zones.length - 1} onClick={() => { const next = [...zones]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; configureZones(next.map((item, order) => ({ ...item, displayOrder: order }))); }} title="Move zone down"><ArrowDown size={13} /></button><button className="icon-button text-red-600" onClick={() => configureZones(zones.filter((item) => item.id !== zone.id))}><Trash2 size={14} /></button></div><div className="mt-2 grid grid-cols-4 gap-2">{([['x','X'],['y','Y'],['width','W'],['height','H']] as const).map(([key,label]) => { const value = key === 'x' || key === 'y' ? zone.position[key] : zone.size[key]; return <label key={key} className="text-[10px] text-slate-500">{label}<input type="number" min="0" step="0.5" className="input mt-1 w-full" value={value} onChange={(e) => updateZone(zone.id, key === 'x' || key === 'y' ? { position: { ...zone.position, [key]: Number(e.target.value) } } : { size: { ...zone.size, [key]: Number(e.target.value) } })} /></label>; })}</div><div className="mt-2 grid grid-cols-2 gap-2"><select className="input w-full" value={zone.type} onChange={(e) => updateZone(zone.id, { type: e.target.value })}><option value="operational">Operational</option><option value="safety">Safety</option><option value="storage">Storage</option><option value="restricted">Restricted</option></select><select className="input w-full" value={zone.lineId ?? ""} onChange={(e) => { const line = lines.find((item) => item.id === e.target.value); updateZone(zone.id, { lineId: line?.id ?? null, line: line ? { id: line.id, name: line.name, code: line.code } : null }); }}><option value="">No production line</option>{lines.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}</select></div></article>)}</div>
      </section>
      <section className="border-t border-slate-200 pt-5"><div className="mb-3 flex items-center gap-2"><Box size={16} /><div><h3 className="text-sm font-semibold text-slate-900">3D factory shell</h3><p className="text-xs text-slate-500">Optional GLB, maximum 15 MB. Primitives remain interactive.</p></div></div>
        {state.layout.modelAsset && <div className="mb-3 rounded-lg bg-slate-50 p-3 text-xs"><strong className="block text-slate-900">{state.layout.modelAsset.filename}</strong><span className="text-slate-500">{(state.layout.modelAsset.sizeBytes / 1024 / 1024).toFixed(1)} MB</span></div>}
        <label className={`button button-secondary inline-flex cursor-pointer ${!state.layout.id || uploading ? 'pointer-events-none opacity-50' : ''}`}><Upload size={13} />{uploading ? 'Uploading…' : 'Choose GLB'}<input className="hidden" type="file" accept=".glb,model/gltf-binary" onChange={(e) => void upload(e.target.files?.[0])} /></label>{!state.layout.id && <p className="mt-2 text-xs text-amber-700">Save the layout once before uploading its model.</p>}{error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-3">{([['offsetX','X offset'],['offsetY','Y offset'],['elevation','Elevation'],['scale','Scale'],['rotationY','Y rotation']] as const).map(([key,label]) => <label key={key} className="text-xs text-slate-600">{label}<input className="input mt-1 w-full" type="number" step={key === 'rotationY' ? 15 : 0.1} min={key === 'scale' ? 0.01 : undefined} value={transform[key]} onChange={(e) => updateTransform(key, Number(e.target.value))} /></label>)}</div>
      </section>
      <section className="border-t border-slate-200 pt-5"><h3 className="text-sm font-semibold text-slate-900">Operational status timing</h3><p className="mt-1 text-xs text-slate-500">Controls confirmation and light-to-dark persistence bands in every map view.</p>
        <div className="mt-3 grid grid-cols-2 gap-3">{([
          ['recentMinutes', 'Recent until (min)', 1],
          ['persistentMinutes', 'Persistent after (min)', 1],
          ['outOfRangeConfirmationSeconds', 'Out-of-range confirm (sec)', 1],
          ['rejectWindowCycles', 'Reject window (cycles)', 1],
          ['rejectMinimumCycles', 'Minimum outcomes', 1],
        ] as const).map(([key, label, step]) => <label key={key} className="text-xs text-slate-600">{label}<input className="input mt-1 w-full" type="number" min={key === 'outOfRangeConfirmationSeconds' ? 0 : 1} step={step} value={statusConfig[key]} onChange={(event) => configureStatusVisualization({ ...statusConfig, [key]: Number(event.target.value) })} /></label>)}</div>
      </section>
    </div>
  </aside>;
}

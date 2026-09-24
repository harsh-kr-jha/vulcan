"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { getCsrfToken } from "@/lib/api-client";
import type { LiveMachineCurrent, LiveMachineSummary } from "@/lib/factory-domain";
import type { MachineImageAsset, MachineNode, StatusVisualizationConfig } from "@/lib/spatial-types";
import type { ScreenAnchor } from "@/lib/spatial-overlay";
import { formatIssueDuration, resolveMachineVisualStatus } from "@/lib/machine-visual-status";

export interface MachineMapPopupHandle {
  setAnchor: (anchor: ScreenAnchor) => void;
}

interface Props {
  machine: MachineNode;
  liveMachine?: LiveMachineSummary;
  current: LiveMachineCurrent | null;
  imageAsset?: MachineImageAsset | null;
  onImageChange: (asset: MachineImageAsset) => void;
  onClose: () => void;
  onOpenDetails: () => void;
  statusVisualization?: StatusVisualizationConfig;
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export const MachineMapPopup = forwardRef<MachineMapPopupHandle, Props>(function MachineMapPopup({
  machine,
  liveMachine,
  current,
  imageAsset,
  onImageChange,
  onClose,
  onOpenDetails,
  statusVisualization,
}, forwardedRef) {
  const layerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGLineElement>(null);
  const lastAnchorRef = useRef<ScreenAnchor>({ x: 0, y: 0, visible: false });
  const [selectedParameter, setSelectedParameter] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const variables = current?.variables ?? [];
  const activeParameter = variables.find((item) => item.key === selectedParameter) ?? variables[0];
  const visual = resolveMachineVisualStatus(liveMachine, statusVisualization);

  const position = (anchor: ScreenAnchor) => {
    lastAnchorRef.current = anchor;
    const layer = layerRef.current;
    const card = cardRef.current;
    const line = lineRef.current;
    if (!layer || !card || !line) return;
    if (!anchor.visible) {
      layer.style.visibility = "hidden";
      return;
    }
    const width = layer.clientWidth;
    const height = layer.clientHeight;
    const cardWidth = card.offsetWidth || 304;
    const cardHeight = card.offsetHeight || 280;
    const margin = 8;
    const gap = 14;
    const above = anchor.y >= cardHeight + gap + margin;
    const left = Math.min(
      Math.max(anchor.x - cardWidth / 2, margin),
      Math.max(margin, width - cardWidth - margin),
    );
    const preferredTop = above ? anchor.y - cardHeight - gap : anchor.y + gap;
    const top = Math.min(
      Math.max(preferredTop, margin),
      Math.max(margin, height - cardHeight - margin),
    );
    const connectorX = Math.min(Math.max(anchor.x, left + 14), left + cardWidth - 14);
    const connectorY = above ? top + cardHeight : top;
    card.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
    line.setAttribute("x1", String(anchor.x));
    line.setAttribute("y1", String(anchor.y));
    line.setAttribute("x2", String(connectorX));
    line.setAttribute("y2", String(connectorY));
    layer.style.visibility = "visible";
  };

  useImperativeHandle(forwardedRef, () => ({ setAnchor: position }));

  useEffect(() => {
    setSelectedParameter("");
  }, [machine.id]);

  useEffect(() => {
    const observer = new ResizeObserver(() => position(lastAnchorRef.current));
    if (layerRef.current) observer.observe(layerRef.current);
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  });

  async function uploadImage(file?: File) {
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const data = new FormData();
      data.append("file", file);
      const response = await fetch(`/api/backend/api/spatial/machines/${machine.id}/image/`, {
        method: "POST",
        headers: { "X-CSRFToken": await getCsrfToken() },
        credentials: "same-origin",
        body: data,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.file ?? body.detail ?? "Image upload failed.");
      onImageChange({
        id: body.id,
        filename: body.filename,
        contentType: body.content_type,
        sizeBytes: body.size_bytes,
        checksumSha256: body.checksum_sha256,
        downloadUrl: body.download_url,
      });
    } catch (cause) {
      setUploadError(cause instanceof Error ? cause.message : "Image upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function runAction(value: string) {
    if (value === "details") onOpenDetails();
    if (value === "entry") window.location.assign(`/digital-twin/entry/${machine.id}`);
    if (value === "ml") window.location.assign(`/digital-twin/ml/${machine.id}`);
  }

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0 z-30 overflow-hidden" style={{ visibility: "hidden" }}>
      <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <line ref={lineRef} stroke="#475569" strokeWidth="1.5" strokeDasharray="3 3" />
      </svg>
      <div ref={cardRef} className="pointer-events-auto absolute left-0 top-0 w-[19rem] max-w-[calc(100%-1rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl" role="dialog" aria-label={`Live information for ${machine.name}`}>
        <header className="flex items-start justify-between border-b border-slate-100 px-3 py-2.5">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-950">{machine.name}</h3>
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-white" style={{ backgroundColor: visual.bodyColor }}>{visual.label}</span>
              {liveMachine?.lastObservedAt && <span className="text-[10px] text-slate-400">Live {new Date(liveMachine.lastObservedAt).toLocaleTimeString()}</span>}
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close machine popup"><X size={15} /></button>
        </header>

        <div className="max-h-[22rem] space-y-3 overflow-y-auto p-3">
          {!!visual.segments.length && <section className="space-y-1.5" aria-label="Active operational issues">{visual.segments.map((segment) => {
            const issue = liveMachine?.issues.find((item) => item.type === segment.type);
            const evidence = issue?.evidence ?? {};
            const detail = segment.type === "out_of_range"
              ? `${Number(evidence.count ?? 0)} parameter${Number(evidence.count ?? 0) === 1 ? "" : "s"}`
              : segment.type === "predicted_failure"
                ? `${Math.round(Number(evidence.failureProbability ?? 0) * 100)}% probability`
                : `${Number(evidence.rejectRate ?? 0).toFixed(1)}% rejects · target ${Number(evidence.targetRate ?? 0).toFixed(1)}%`;
            return <div key={segment.type} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-2 py-1.5 text-xs"><span className="flex min-w-0 items-center gap-2"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} /><span className="truncate font-semibold text-slate-800">{segment.label}</span></span><span className="shrink-0 text-right text-[10px] text-slate-500">{detail}<br />{formatIssueDuration(segment.durationMs)}</span></div>;
          })}{visual.stale && <p className="text-[10px] font-medium text-slate-500">Telemetry is stale; issues shown are the last known unresolved conditions.</p>}</section>}
          {imageAsset && <div role="img" aria-label={machine.name} className="h-28 w-full rounded-lg border border-slate-100 bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(imageAsset.downloadUrl)})` }} />}
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900">
            <ImagePlus size={14} />{uploading ? "Uploading…" : imageAsset ? "Replace image" : "Attach image"}
            <input className="hidden" type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => void uploadImage(event.target.files?.[0])} />
          </label>
          {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}

          <section>
            <div className="mb-1.5 flex items-center justify-between"><h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Live parameters</h4><span className="text-[10px] text-slate-400">{variables.length}</span></div>
            {variables.length ? <>
              <div className="grid grid-cols-2 gap-1.5">{(current?.highlightedVariables ?? variables).slice(0, 4).map((item) => <div key={item.key} className={`rounded-md border px-2 py-1.5 ${item.abnormal ? "border-red-200 bg-red-50" : "border-slate-100 bg-slate-50"}`}><p className="truncate text-[10px] text-slate-500">{item.label}</p><p className="truncate text-xs font-semibold text-slate-900">{formatValue(item.value)}{item.unit ? ` ${item.unit}` : ""}</p></div>)}</div>
              <label className="mt-2 block text-[10px] font-semibold text-slate-500">Inspect parameter<select className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800" value={activeParameter?.key ?? ""} onChange={(event) => setSelectedParameter(event.target.value)}>{variables.map((item) => <option key={item.key} value={item.key}>{item.label}: {formatValue(item.value)}{item.unit ? ` ${item.unit}` : ""}</option>)}</select></label>
            </> : <p className="rounded-md bg-slate-50 px-2 py-3 text-center text-xs text-slate-500">No live parameters received.</p>}
          </section>

          <select aria-label="Machine actions" className="w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-700" value="" onChange={(event) => runAction(event.target.value)}>
            <option value="">Machine actions…</option>
            <option value="details">Open full details</option>
            <option value="entry">Open data entry</option>
            <option value="ml">Open ML workspace</option>
          </select>
        </div>
      </div>
    </div>
  );
});

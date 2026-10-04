"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { ChevronRight } from "lucide-react";
import type { LiveMachineSummary } from "@/lib/factory-domain";
import { machinePredictionPresentation, machineStatePresentation } from "@/lib/machine-card";
import type { MachineNode } from "@/lib/spatial-types";
import type { ScreenAnchor } from "@/lib/spatial-overlay";

export interface MachineMapPopupHandle {
  setAnchor: (anchor: ScreenAnchor) => void;
}

interface Props {
  machine: MachineNode;
  liveMachine?: LiveMachineSummary;
  onOpenDetails: () => void;
}

export const MachineMapPopup = forwardRef<MachineMapPopupHandle, Props>(function MachineMapPopup({
  machine,
  liveMachine,
  onOpenDetails,
}, forwardedRef) {
  const layerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLButtonElement>(null);
  const lineRef = useRef<SVGLineElement>(null);
  const lastAnchorRef = useRef<ScreenAnchor>({ x: 0, y: 0, visible: false });
  const state = machineStatePresentation(liveMachine);
  const prediction = machinePredictionPresentation(liveMachine?.currentCyclePrediction);

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
    const cardWidth = card.offsetWidth || 256;
    const cardHeight = card.offsetHeight || 76;
    const margin = 8;
    const gap = 12;
    const above = anchor.y >= cardHeight + gap + margin;
    const left = Math.min(Math.max(anchor.x - cardWidth / 2, margin), Math.max(margin, layer.clientWidth - cardWidth - margin));
    const top = Math.min(
      Math.max(above ? anchor.y - cardHeight - gap : anchor.y + gap, margin),
      Math.max(margin, layer.clientHeight - cardHeight - margin),
    );
    card.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
    line.setAttribute("x1", String(anchor.x));
    line.setAttribute("y1", String(anchor.y));
    line.setAttribute("x2", String(Math.min(Math.max(anchor.x, left + 12), left + cardWidth - 12)));
    line.setAttribute("y2", String(above ? top + cardHeight : top));
    layer.style.visibility = "visible";
  };

  useImperativeHandle(forwardedRef, () => ({ setAnchor: position }));

  useEffect(() => {
    const observer = new ResizeObserver(() => position(lastAnchorRef.current));
    if (layerRef.current) observer.observe(layerRef.current);
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  });

  const predictionClass = prediction.tone === "defect"
    ? "bg-red-100 text-red-700"
    : prediction.tone === "good"
      ? "bg-emerald-100 text-emerald-700"
      : "bg-slate-100 text-slate-600";

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0 z-30 overflow-hidden" style={{ visibility: "hidden" }}>
      <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <line ref={lineRef} stroke="#94a3b8" strokeWidth="1.25" strokeDasharray="3 3" />
      </svg>
      <button
        ref={cardRef}
        type="button"
        onClick={onOpenDetails}
        className="pointer-events-auto absolute left-0 top-0 w-64 rounded-xl border border-slate-200 bg-white/95 px-3 py-2.5 text-left shadow-lg backdrop-blur transition hover:border-slate-300 hover:shadow-xl"
        aria-label={`Open details for ${machine.name}`}
      >
        <span className="flex items-center justify-between gap-3">
          <strong className="truncate text-sm font-semibold text-slate-950">{machine.name}</strong>
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-slate-600">Actions <ChevronRight size={13} /></span>
        </span>
        <span className="mt-2 flex items-center gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-slate-600">
            <i className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: state.color }} />
            <span className="truncate">{state.label}</span>
          </span>
          <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${predictionClass}`}>{prediction.label}</span>
        </span>
      </button>
    </div>
  );
});

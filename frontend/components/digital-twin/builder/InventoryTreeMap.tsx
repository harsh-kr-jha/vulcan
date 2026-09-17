"use client";

import type { EChartsOption } from "echarts";
import ReactECharts from "echarts-for-react";
import { Download, Eye, EyeOff, Printer, QrCode } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { generateInventoryQrSvg, generateInventoryQrDataUrl, dataUrlToBlob } from "@/lib/qr-generator";
import { useFactoryBuilder } from "@/lib/factory-builder-context";
import { useFactory } from "@/lib/factory-context";
import type { InventoryConfig } from "@/lib/spatial-types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface InventoryTreeMapProps {
  inventory: InventoryConfig;
  layoutId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * InventoryTreeMap — renders the configured inventory as an ECharts treemap
 * with a QR code below for mobile inventory operations.
 *
 * - Rectangle sizes proportional to material quantities.
 * - Zero-quantity materials rendered as minimal-size rectangles with visible names.
 * - Inventory QR code displayed below the treemap.
 *
 * Requirements: 11.4, 11.5, 11.6
 */
export function InventoryTreeMap({ inventory, layoutId }: InventoryTreeMapProps) {
  const treemapOption = useMemo<EChartsOption>(() => {
    const data = inventory.materials.map((material) => ({
      name: material.name,
      // Use Math.max to ensure zero-quantity materials still appear as minimal rectangles
      value: Math.max(material.quantity, 0.01),
    }));

    return {
      tooltip: {
        formatter: (params: { name?: string; value?: number } | unknown) => {
          const p = params as { name?: string; value?: number; data?: { name: string } };
          const name = p.data?.name ?? p.name ?? "";
          // Show actual quantity, not the clamped value
          const actualMaterial = inventory.materials.find((m) => m.name === name);
          const qty = actualMaterial?.quantity ?? 0;
          return `<strong>${name}</strong><br/>Quantity: ${qty.toLocaleString()}`;
        },
      },
      series: [
        {
          type: "treemap",
          data,
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          label: {
            show: true,
            formatter: "{b}",
            fontSize: 12,
            color: "#1f2937",
          },
          itemStyle: {
            borderColor: "#fff",
            borderWidth: 2,
            gapWidth: 1,
          },
          levels: [
            {
              itemStyle: {
                borderColor: "#e5e7eb",
                borderWidth: 2,
                gapWidth: 2,
              },
            },
          ],
        },
      ],
    };
  }, [inventory.materials]);

  return (
    <div className="flex flex-col gap-3">
      {/* Treemap visualization */}
      <div className="rounded-md border border-gray-100 bg-gray-50 p-1">
        <ReactECharts
          option={treemapOption}
          notMerge
          lazyUpdate
          style={{ height: 180, width: "100%" }}
          opts={{ renderer: "svg" }}
        />
      </div>

      {/* Inventory QR Code */}
      <InventoryQrCode layoutId={layoutId} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inventory QR Code sub-component
// ---------------------------------------------------------------------------

interface InventoryQrCodeProps {
  layoutId: string;
}

function InventoryQrCode({ layoutId }: InventoryQrCodeProps) {
  const [generating, setGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [svgString, setSvgString] = useState<string | null>(null);
  const { state: factoryState, filters } = useFactory();

  const companyName = "Vulcan";
  const activeFactory = factoryState.factories.find(
    (f) => f.id === (filters.factoryId || factoryState.activeFactoryId)
  );
  const factoryName = activeFactory?.name || "Mushroom Factory";

  const ensureGenerated = useCallback(async () => {
    if (svgString) return;
    const svg = await generateInventoryQrSvg(layoutId);
    setSvgString(svg);
  }, [svgString, layoutId]);

  const renderLabeledQr = useCallback(async (): Promise<Blob> => {
    const qrDataUrl = await generateInventoryQrDataUrl(layoutId);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const qrSize = 300, padding = 40, topH = 70, botH = 50;
    const w = qrSize + padding * 2, h = topH + qrSize + botH + padding * 2;
    canvas.width = w; canvas.height = h;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = "center";
    ctx.fillStyle = "#00a06c"; ctx.font = "700 12px system-ui, sans-serif";
    ctx.fillText("VULCAN · TWIN", w / 2, padding + 14);
    ctx.fillStyle = "#374151"; ctx.font = "600 14px system-ui, sans-serif";
    ctx.fillText(factoryName, w / 2, padding + 38);
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); img.src = qrDataUrl; });
    ctx.drawImage(img, padding, padding + topH, qrSize, qrSize);
    ctx.fillStyle = "#111827"; ctx.font = "700 16px system-ui, sans-serif";
    ctx.fillText("Inventory", w / 2, padding + topH + qrSize + 30);
    return new Promise((res) => { canvas.toBlob((b) => res(b!), "image/jpeg", 0.95); });
  }, [layoutId, factoryName]);

  const handleDownload = useCallback(async () => {
    setGenerating(true);
    try {
      const blob = await renderLabeledQr();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl; a.download = "inventory-qr.jpg"; a.click();
      URL.revokeObjectURL(blobUrl);
    } finally { setGenerating(false); }
  }, [renderLabeledQr]);

  const handlePrint = useCallback(async () => {
    setGenerating(true);
    try {
      const blob = await renderLabeledQr();
      const blobUrl = URL.createObjectURL(blob);
      const pw = window.open("", "_blank", "width=450,height=550");
      if (!pw) return;
      pw.document.write(`<!DOCTYPE html><html><head><title>Inventory QR</title><style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1rem}img{max-width:100%;height:auto}@media print{body{padding:0}img{width:8cm}}</style></head><body><img src="${blobUrl}"/><script>window.onload=function(){setTimeout(function(){window.print()},200);window.onafterprint=function(){window.close()}}</script></body></html>`);
      pw.document.close();
    } finally { setGenerating(false); }
  }, [renderLabeledQr]);

  const togglePreview = useCallback(async () => {
    if (!showPreview) await ensureGenerated();
    setShowPreview((prev) => !prev);
  }, [showPreview, ensureGenerated]);

  if (!layoutId) return null;

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleDownload}
          disabled={generating}
          title="Download QR (JPG)"
          className="icon-button"
          style={{ height: 28, width: 28 }}
        >
          <Download size={12} />
        </button>
        <button
          type="button"
          onClick={handlePrint}
          disabled={generating}
          title="Print QR"
          className="icon-button"
          style={{ height: 28, width: 28 }}
        >
          <Printer size={12} />
        </button>
        <button
          type="button"
          onClick={togglePreview}
          title={showPreview ? "Hide Preview" : "Preview QR"}
          className={`icon-button ${showPreview ? "bg-[var(--green-soft)] border-[var(--green)] text-[var(--green-dark)]" : ""}`}
          style={{ height: 28, width: 28 }}
        >
          {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
      </div>
      {showPreview && svgString && (
        <div className="mt-2 flex flex-col items-center rounded-lg border border-gray-100 bg-gray-50 p-3">
          <div
            className="w-20 h-20 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
            dangerouslySetInnerHTML={{ __html: svgString }}
            aria-label="QR code for inventory entry"
            role="img"
          />
          <p className="mt-1.5 text-xs text-gray-500 font-medium">Inventory</p>
        </div>
      )}
    </div>
  );
}

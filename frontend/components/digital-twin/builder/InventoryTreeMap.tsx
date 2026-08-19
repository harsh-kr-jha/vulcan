"use client";

import type { EChartsOption } from "echarts";
import ReactECharts from "echarts-for-react";
import { Download, Eye, EyeOff } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { generateInventoryQrSvg } from "@/lib/qr-generator";
import { useFactoryBuilder } from "@/lib/factory-builder-context";
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
  const { state } = useFactoryBuilder();

  const handleDownload = useCallback(async () => {
    setGenerating(true);
    try {
      const qrSvg = svgString ?? await generateInventoryQrSvg(layoutId);
      if (!svgString) setSvgString(qrSvg);
      const factoryName = state.layout.factoryId || "Factory";
      const htmlContent = `<!DOCTYPE html><html><head><title>Inventory QR - Vulcan by Tamaso</title><style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:2rem}.brand{font-size:12px;color:#6b7280;margin-bottom:1.5rem;letter-spacing:0.05em;text-transform:uppercase}.qr-svg{width:200px;height:200px}.qr-svg svg{width:100%;height:100%}.label{font-size:16px;font-weight:600;margin-top:1rem;text-align:center}.sublabel{font-size:12px;color:#6b7280;margin-top:0.25rem}</style></head><body><div class="brand">Vulcan by Tamaso</div><div class="qr-svg">${qrSvg}</div><div class="label">Inventory</div><div class="sublabel">${factoryName}</div></body></html>`;
      const blob = new Blob([htmlContent], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "inventory-qr.html";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setGenerating(false);
    }
  }, [layoutId, state.layout.factoryId, svgString]);

  const togglePreview = useCallback(async () => {
    if (!showPreview && !svgString) {
      // Generate on first preview open
      try {
        const svg = await generateInventoryQrSvg(layoutId);
        setSvgString(svg);
      } catch {
        // ignore — will show nothing
      }
    }
    setShowPreview((prev) => !prev);
  }, [showPreview, svgString, layoutId]);

  if (!layoutId) return null;

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleDownload}
          disabled={generating}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <Download size={14} />
          {generating ? "Generating..." : "Download QR"}
        </button>
        <button
          type="button"
          onClick={togglePreview}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          aria-label={showPreview ? "Hide QR preview" : "Show QR preview"}
          aria-pressed={showPreview}
        >
          {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
          {showPreview ? "Hide" : "Preview"}
        </button>
      </div>
      {showPreview && svgString && (
        <div className="mt-2 flex flex-col items-center gap-1">
          <div
            className="h-28 w-28"
            dangerouslySetInnerHTML={{ __html: svgString }}
            aria-label="QR code for inventory entry"
            role="img"
          />
          <p className="text-xs text-gray-500">Inventory</p>
        </div>
      )}
    </div>
  );
}

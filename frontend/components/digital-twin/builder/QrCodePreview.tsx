"use client";

import { Download, Eye, EyeOff, Printer, QrCode } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  generateMachineQrSvg,
  generateMachineQrDataUrl,
  generateInventoryQrSvg,
  generateInventoryQrDataUrl,
  generateDispatchQrSvg,
  generateDispatchQrDataUrl,
  dataUrlToBlob,
} from "@/lib/qr-generator";
import { useFactory } from "@/lib/factory-context";

export interface QrCodePreviewProps {
  machineId: string;
  machineName: string;
  machineCode?: string;
  type?: "machine" | "inventory" | "dispatch";
}

/**
 * Renders a labeled QR JPG (company + factory + machine name) via canvas,
 * with download, print, and preview as small icon sphere buttons.
 */
export function QrCodePreview({
  machineId,
  machineName,
  machineCode,
  type = "machine",
}: QrCodePreviewProps) {
  const { state, filters } = useFactory();
  const [svgString, setSvgString] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [generating, setGenerating] = useState(false);

  const companyName = "Vulcan";
  const activeFactory = state.factories.find(
    (f) => f.id === (filters.factoryId || state.activeFactoryId)
  );
  const factoryName = activeFactory?.name || "Mushroom Factory";

  const displayLabel = machineCode
    ? `${machineName} (${machineCode})`
    : machineName;

  const generateSvg = useCallback(() => {
    if (type === "inventory") return generateInventoryQrSvg(machineId);
    if (type === "dispatch") return generateDispatchQrSvg(machineId);
    return generateMachineQrSvg(machineId);
  }, [type, machineId]);

  const generateDataUrl = useCallback(() => {
    if (type === "inventory") return generateInventoryQrDataUrl(machineId);
    if (type === "dispatch") return generateDispatchQrDataUrl(machineId);
    return generateMachineQrDataUrl(machineId);
  }, [type, machineId]);

  // Generate QR data URL
  const ensureGenerated = useCallback(async () => {
    if (dataUrl) return dataUrl;
    setGenerating(true);
    try {
      const [svg, url] = await Promise.all([
        svgString ? Promise.resolve(svgString) : generateSvg(),
        generateDataUrl(),
      ]);
      setSvgString(svg);
      setDataUrl(url);
      return url;
    } finally {
      setGenerating(false);
    }
  }, [dataUrl, svgString, generateSvg, generateDataUrl]);

  // Generate SVG for inline preview
  useEffect(() => {
    if (!showPreview || svgString) return;
    let cancelled = false;
    (async () => {
      try {
        const svg = await generateSvg();
        if (!cancelled) setSvgString(svg);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [showPreview, svgString, generateSvg]);

  /**
   * Renders labeled QR image on a canvas and returns a Blob.
   * Layout: Company Name / Factory Name / [QR image] / Machine Name
   */
  const renderLabeledQr = useCallback(async (): Promise<Blob> => {
    const qrDataUrl = await ensureGenerated();
    if (!qrDataUrl) throw new Error("Failed to generate QR");

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    const qrSize = 300;
    const padding = 40;
    const topTextHeight = 70;
    const bottomTextHeight = 50;
    const width = qrSize + padding * 2;
    const height = topTextHeight + qrSize + bottomTextHeight + padding * 2;

    canvas.width = width;
    canvas.height = height;

    // White background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // Brand: Vulcan (top)
    ctx.fillStyle = "#00a06c";
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("VULCAN · TWIN", width / 2, padding + 14);

    // Factory name (below brand)
    ctx.fillStyle = "#374151";
    ctx.font = "600 14px system-ui, sans-serif";
    ctx.fillText(factoryName, width / 2, padding + 38);

    // QR code image
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("QR image failed"));
      img.src = qrDataUrl;
    });
    ctx.drawImage(img, padding, padding + topTextHeight, qrSize, qrSize);

    // Machine name (below QR)
    ctx.fillStyle = "#111827";
    ctx.font = "700 16px system-ui, sans-serif";
    ctx.fillText(
      machineName.length > 30 ? machineName.slice(0, 29) + "\u2026" : machineName,
      width / 2,
      padding + topTextHeight + qrSize + 28
    );

    // Machine code (if present)
    if (machineCode) {
      ctx.fillStyle = "#6b7280";
      ctx.font = "400 12px system-ui, sans-serif";
      ctx.fillText(machineCode, width / 2, padding + topTextHeight + qrSize + 46);
    }

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob!), "image/jpeg", 0.95);
    });
  }, [ensureGenerated, factoryName, machineName, machineCode]);

  const handleDownload = useCallback(async () => {
    setGenerating(true);
    try {
      const blob = await renderLabeledQr();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `qr-${machineName.replace(/[^a-zA-Z0-9]/g, "-")}.jpg`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } finally {
      setGenerating(false);
    }
  }, [renderLabeledQr, machineName]);

  const handlePrint = useCallback(async () => {
    setGenerating(true);
    try {
      const blob = await renderLabeledQr();
      const blobUrl = URL.createObjectURL(blob);
      const printWindow = window.open("", "_blank", "width=450,height=550");
      if (!printWindow) return;
      printWindow.document.write(`<!DOCTYPE html><html><head><title>QR - ${displayLabel}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1rem}img{max-width:100%;height:auto}@media print{body{padding:0}img{width:8cm}}</style></head><body><img src="${blobUrl}" alt="QR Code"/><script>window.onload=function(){setTimeout(function(){window.print()},200);window.onafterprint=function(){window.close()}}</script></body></html>`);
      printWindow.document.close();
    } finally {
      setGenerating(false);
    }
  }, [renderLabeledQr, displayLabel]);

  const togglePreview = useCallback(() => {
    setShowPreview((prev) => !prev);
  }, []);

  return (
    <div className="mt-3">
      {/* Icon sphere buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleDownload}
          disabled={generating}
          title="Download QR (JPG)"
          className="flex items-center justify-center h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm hover:bg-gray-50 hover:text-blue-600 hover:border-blue-200 disabled:opacity-50 transition-colors"
        >
          <Download size={14} />
        </button>
        <button
          type="button"
          onClick={handlePrint}
          disabled={generating}
          title="Print QR"
          className="flex items-center justify-center h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm hover:bg-gray-50 hover:text-blue-600 hover:border-blue-200 disabled:opacity-50 transition-colors"
        >
          <Printer size={14} />
        </button>
        <button
          type="button"
          onClick={togglePreview}
          title={showPreview ? "Hide Preview" : "Preview QR"}
          className={`flex items-center justify-center h-8 w-8 rounded-full border shadow-sm transition-colors ${
            showPreview
              ? "border-blue-300 bg-blue-50 text-blue-600"
              : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-blue-600 hover:border-blue-200"
          }`}
        >
          {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>

      {/* QR Preview */}
      {showPreview && (
        <div className="mt-3 flex flex-col items-center rounded-lg border border-gray-100 bg-gray-50 p-4">
          {!svgString ? (
            <div className="flex items-center justify-center h-24 w-24">
              <QrCode size={20} className="text-gray-300 animate-pulse" />
            </div>
          ) : (
            <div
              className="w-24 h-24 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
              dangerouslySetInnerHTML={{ __html: svgString }}
              aria-label={`QR code for ${machineName}`}
              role="img"
            />
          )}
          <p className="mt-2 text-xs font-medium text-gray-700 text-center truncate max-w-[160px]" title={machineName}>
            {displayLabel}
          </p>
        </div>
      )}
    </div>
  );
}

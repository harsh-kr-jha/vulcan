"use client";

import { Download, Eye, EyeOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { generateMachineQrSvg } from "@/lib/qr-generator";

export interface QrCodePreviewProps {
  machineId: string;
  machineName: string;
  machineCode?: string;
}

/**
 * QR code section for a machine with download + eye-preview toggle.
 *
 * - Download button: generates and downloads an HTML file with the QR code.
 * - Eye toggle: shows/hides an inline preview of the QR code.
 *
 * Requirements: 6.4, 6.5
 */
export function QrCodePreview({ machineId, machineName, machineCode }: QrCodePreviewProps) {
  const [svgString, setSvgString] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate QR SVG when preview is toggled on (lazy generation)
  useEffect(() => {
    if (!showPreview && !svgString) return; // Don't generate until needed
    if (svgString) return; // Already generated

    let cancelled = false;

    async function generate() {
      try {
        setError(null);
        const svg = await generateMachineQrSvg(machineId);
        if (!cancelled) setSvgString(svg);
      } catch {
        if (!cancelled) setError("Failed to generate QR code.");
      }
    }

    if (showPreview) generate();

    return () => { cancelled = true; };
  }, [showPreview, svgString, machineId]);

  const truncatedName =
    machineName.length > 50
      ? `${machineName.slice(0, 50)}\u2026`
      : machineName;

  const displayLabel = machineCode
    ? `${truncatedName} (${machineCode})`
    : truncatedName;

  const handleDownload = useCallback(async () => {
    setGenerating(true);
    try {
      const svg = svgString ?? await generateMachineQrSvg(machineId);
      if (!svgString) setSvgString(svg);
      const htmlContent = `<!DOCTYPE html><html><head><title>QR - ${displayLabel} - Vulcan by Tamaso</title><style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:2rem}.brand{font-size:12px;color:#6b7280;margin-bottom:1.5rem;letter-spacing:0.05em;text-transform:uppercase}.qr-svg{width:200px;height:200px}.qr-svg svg{width:100%;height:100%}.label{font-size:16px;font-weight:600;margin-top:1rem;text-align:center}.sublabel{font-size:12px;color:#6b7280;margin-top:0.25rem}</style></head><body><div class="brand">Vulcan by Tamaso</div><div class="qr-svg">${svg}</div><div class="label">${machineName}</div>${machineCode ? `<div class="sublabel">${machineCode}</div>` : ""}</body></html>`;
      const blob = new Blob([htmlContent], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `qr-${machineName.replace(/[^a-zA-Z0-9]/g, "-")}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setGenerating(false);
    }
  }, [svgString, machineId, machineName, machineCode, displayLabel]);

  const togglePreview = useCallback(() => {
    setShowPreview((prev) => !prev);
  }, []);

  return (
    <div className="mt-4 rounded-md border border-gray-200 bg-white p-3">
      {/* Action buttons row */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleDownload}
          disabled={generating}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          aria-label="Download QR code"
        >
          <Download size={14} />
          {generating ? "Generating..." : "Download QR"}
        </button>

        <button
          type="button"
          onClick={togglePreview}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          aria-label={showPreview ? "Hide QR preview" : "Show QR preview"}
          aria-pressed={showPreview}
        >
          {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
          {showPreview ? "Hide" : "Preview"}
        </button>
      </div>

      {/* Inline QR preview (toggled) */}
      {showPreview && (
        <div className="mt-3 flex flex-col items-center gap-2">
          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}
          {!svgString && !error && (
            <span className="text-xs text-gray-500">Generating QR...</span>
          )}
          {svgString && (
            <>
              <div
                className="h-32 w-32"
                dangerouslySetInnerHTML={{ __html: svgString }}
                aria-label={`QR code for machine ${truncatedName}`}
                role="img"
              />
              <p
                className="max-w-[10rem] truncate text-center text-xs font-medium text-gray-700"
                title={machineName}
              >
                {displayLabel}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

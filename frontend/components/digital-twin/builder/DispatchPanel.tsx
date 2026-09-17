"use client";

import type { EChartsOption } from "echarts";
import ReactECharts from "echarts-for-react";
import { Download, Eye, EyeOff, Package, Plus, Printer, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useFactoryBuilder } from "@/lib/factory-builder-context";
import { useFactory } from "@/lib/factory-context";
import { generateDispatchQrSvg, generateDispatchQrDataUrl, dataUrlToBlob } from "@/lib/qr-generator";
import { validateDispatchProductName } from "@/lib/spatial-validators";
import type { DispatchProduct } from "@/lib/spatial-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProductUnit = "meters" | "litres" | "units" | "kilograms";

interface ProductDraft {
  id: string;
  name: string;
  unit: ProductUnit;
}

const UNIT_OPTIONS: { value: ProductUnit; label: string }[] = [
  { value: "units", label: "Units" },
  { value: "kilograms", label: "Kilograms" },
  { value: "litres", label: "Litres" },
  { value: "meters", label: "Meters" },
];

function generateId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// DispatchPanel Component
// ---------------------------------------------------------------------------

/**
 * Dispatch panel displayed to the right of the FloorCanvas.
 * - If dispatch is not configured: shows a "Build Dispatch" placeholder.
 * - On "Build Dispatch": shows a configuration form for adding products.
 * - On save: calls configureDispatch from context.
 *
 * Requirements: 12.1, 12.2, 12.3
 */
interface DispatchPanelProps {
  isEditMode?: boolean;
}

export function DispatchPanel({ isEditMode: isEditModeProp }: DispatchPanelProps = {}) {
  const { state, configureDispatch } = useFactoryBuilder();
  const dispatchConfig = state.layout.dispatch;

  const [isConfiguring, setIsConfiguring] = useState(false);
  const [products, setProducts] = useState<ProductDraft[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [liveAwaiting, setLiveAwaiting] = useState<Record<string, number> | null>(null);
  const [liveDispatched, setLiveDispatched] = useState<Record<string, number> | null>(null);

  const layoutId = state.layout.id;
  const isEditMode = isEditModeProp ?? (state.isDirty || !layoutId);
  const isViewMode = !isEditMode && !!layoutId;

  // Fetch live awaiting quantities in view mode (polls every 10s)
  useEffect(() => {
    if (!isViewMode || !layoutId || !dispatchConfig) {
      setLiveAwaiting(null);
      setLiveDispatched(null);
      return;
    }

    let cancelled = false;

    async function fetchDispatchData() {
      try {
        const response = await fetch(
          `/api/backend/api/spatial/dispatch/${layoutId}/`,
          { headers: { Accept: "application/json" }, credentials: "same-origin" }
        );
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled && data.awaiting) {
          setLiveAwaiting(data.awaiting);
        }
        if (!cancelled && data.dispatched) {
          setLiveDispatched(data.dispatched);
        }
      } catch {
        // ignore
      }
    }

    fetchDispatchData();
    const interval = setInterval(fetchDispatchData, 10_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isViewMode, layoutId, dispatchConfig]);

  // Start configuration flow
  const handleBuildDispatch = useCallback(() => {
    // If already configured, pre-populate from existing config
    if (dispatchConfig) {
      setProducts(
        dispatchConfig.products.map((p) => ({
          id: p.id,
          name: p.name,
          unit: p.unit,
        }))
      );
    } else {
      setProducts([{ id: generateId(), name: "", unit: "units" }]);
    }
    setSaveError(null);
    setIsConfiguring(true);
  }, [dispatchConfig]);

  // Add a new product row
  const handleAddProduct = useCallback(() => {
    if (products.length >= 50) return;
    setProducts((prev) => [...prev, { id: generateId(), name: "", unit: "units" }]);
  }, [products.length]);

  // Remove a product row
  const handleRemoveProduct = useCallback((id: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Update product name
  const handleNameChange = useCallback((id: string, name: string) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name } : p))
    );
  }, []);

  // Update product unit
  const handleUnitChange = useCallback((id: string, unit: ProductUnit) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, unit } : p))
    );
  }, []);

  // Validate all products
  const getProductErrors = useCallback((): Map<string, string> => {
    const errors = new Map<string, string>();
    for (const product of products) {
      const result = validateDispatchProductName(product.name.trim());
      if (!result.valid) {
        errors.set(product.id, result.error);
      }
    }
    return errors;
  }, [products]);

  // Save configuration
  const handleSave = useCallback(() => {
    setSaveError(null);

    // Require at least one product (Req 12.3)
    if (products.length === 0) {
      setSaveError("At least one product is required.");
      return;
    }

    // Validate all product names
    const errors = getProductErrors();
    if (errors.size > 0) {
      return;
    }

    // Build dispatch config
    const dispatchProducts: DispatchProduct[] = products.map((p) => ({
      id: p.id,
      name: p.name.trim(),
      unit: p.unit,
      awaitingQuantity: 0,
    }));

    configureDispatch({ products: dispatchProducts });
    setIsConfiguring(false);
  }, [products, getProductErrors, configureDispatch]);

  // Cancel configuration
  const handleCancel = useCallback(() => {
    setIsConfiguring(false);
    setSaveError(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Render: Not configured placeholder
  // ---------------------------------------------------------------------------

  if (!isConfiguring && !dispatchConfig) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 mb-3">
          <Package size={24} className="text-gray-400" />
        </div>
        <p className="text-sm text-gray-500 mb-3">
          No dispatch area configured
        </p>
        {isEditMode && (
          <button
            type="button"
            className="button button-secondary"
            onClick={handleBuildDispatch}
          >
            <Plus size={14} />
            Build Dispatch
          </button>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Configured (summary view with treemap + QR code)
  // ---------------------------------------------------------------------------

  if (!isConfiguring && dispatchConfig) {
    // Apply live awaiting quantities if available
    const displayProducts = liveAwaiting
      ? dispatchConfig.products.map((p) => ({
          ...p,
          awaitingQuantity: liveAwaiting[p.id] ?? p.awaitingQuantity,
        }))
      : dispatchConfig.products;

    return (
      <div className="flex flex-col h-full p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-800">Dispatch</h3>
            {liveAwaiting && (
              <span className="text-xs text-green-600 font-medium">Live</span>
            )}
          </div>
          {isEditMode && (
            <button
              type="button"
              className="button button-secondary"
              style={{ minHeight: 0, padding: "4px 10px", fontSize: "12px" }}
              onClick={handleBuildDispatch}
            >
              Edit
            </button>
          )}
        </div>

        {/* Products table with awaiting quantities */}
        {displayProducts.length > 0 && (
          <div className="border border-gray-100 rounded-md overflow-hidden mb-3">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-2 py-1 font-medium text-gray-600">Product</th>
                  <th className="text-right px-2 py-1 font-medium text-gray-600">Awaiting</th>
                  <th className="text-left px-2 py-1 font-medium text-gray-600">Unit</th>
                </tr>
              </thead>
              <tbody>
                {displayProducts.map((p) => (
                  <tr key={p.id} className="border-t border-gray-50">
                    <td className="px-2 py-1 text-gray-800 truncate max-w-[100px]">{p.name}</td>
                    <td className="px-2 py-1 text-right font-medium text-gray-900">
                      {typeof p.awaitingQuantity === "number" && p.awaitingQuantity > 0
                        ? p.awaitingQuantity.toLocaleString(undefined, { maximumFractionDigits: 2 })
                        : "0"}
                    </td>
                    <td className="px-2 py-1 text-gray-500">{p.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Products table with dispatched quantities */}
        {displayProducts.length > 0 && liveDispatched && (
          <div className="border border-gray-100 rounded-md overflow-hidden mb-3">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-2 py-1 font-medium text-gray-600">Product</th>
                  <th className="text-right px-2 py-1 font-medium text-gray-600">Dispatched</th>
                  <th className="text-left px-2 py-1 font-medium text-gray-600">Unit</th>
                </tr>
              </thead>
              <tbody>
                {displayProducts.map((p) => {
                  const qty = liveDispatched[p.id] ?? 0;
                  return (
                    <tr key={p.id} className="border-t border-gray-50">
                      <td className="px-2 py-1 text-gray-800 truncate max-w-[100px]">{p.name}</td>
                      <td className="px-2 py-1 text-right font-medium text-gray-900">
                        {qty > 0
                          ? qty.toLocaleString(undefined, { maximumFractionDigits: 2 })
                          : "0"}
                      </td>
                      <td className="px-2 py-1 text-gray-500">{p.unit}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Treemap */}
        <DispatchTreemap products={displayProducts} />

        {/* QR Code */}
        <DispatchQrCode layoutId={state.layout.id} />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Configuration form
  // ---------------------------------------------------------------------------

  const productErrors = getProductErrors();

  return (
    <div className="flex flex-col h-full p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">
        Configure Dispatch
      </h3>

      {/* Products list */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {products.map((product, index) => {
          const nameError = productErrors.get(product.id);
          return (
            <div
              key={product.id}
              className="rounded-md border border-gray-200 bg-white p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">
                  Product {index + 1}
                </span>
                <button
                  type="button"
                  className="icon-button"
                  style={{ height: 28, width: 28 }}
                  onClick={() => handleRemoveProduct(product.id)}
                  aria-label={`Remove product ${index + 1}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Product name */}
              <div>
                <label
                  htmlFor={`product-name-${product.id}`}
                  className="block text-xs font-medium text-gray-600 mb-1"
                >
                  Name
                </label>
                <input
                  id={`product-name-${product.id}`}
                  type="text"
                  className={`w-full rounded-md border px-2.5 py-1.5 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--green)] focus:border-[var(--green)] ${
                    nameError
                      ? "border-red-300 bg-red-50"
                      : "border-gray-300 bg-white"
                  }`}
                  placeholder="Product name"
                  value={product.name}
                  onChange={(e) => handleNameChange(product.id, e.target.value)}
                  maxLength={50}
                />
                {nameError && (
                  <span className="text-xs text-red-600 mt-0.5 block" role="alert">
                    {nameError}
                  </span>
                )}
              </div>

              {/* Unit selector */}
              <div>
                <label
                  htmlFor={`product-unit-${product.id}`}
                  className="block text-xs font-medium text-gray-600 mb-1"
                >
                  Unit
                </label>
                <select
                  id={`product-unit-${product.id}`}
                  className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--green)] focus:border-[var(--green)]"
                  value={product.unit}
                  onChange={(e) =>
                    handleUnitChange(product.id, e.target.value as ProductUnit)
                  }
                >
                  {UNIT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add product button */}
      {products.length < 50 && (
        <button
          type="button"
          className="button button-accent"
          style={{ minHeight: 0, padding: "4px 10px", fontSize: "12px" }}
          onClick={handleAddProduct}
        >
          <Plus size={14} />
          Add Product
        </button>
      )}

      {/* Save error */}
      {saveError && (
        <div
          className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
          role="alert"
        >
          {saveError}
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-4 flex items-center gap-2 border-t border-gray-200 pt-3">
        <button
          type="button"
          className="button button-secondary flex-1"
          onClick={handleCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="button button-primary flex-1"
          onClick={handleSave}
          disabled={products.length === 0 || productErrors.size > 0}
        >
          Save
        </button>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// DispatchTreemap — ECharts treemap for awaiting quantities (Req 12.4)
// ---------------------------------------------------------------------------

interface DispatchTreemapProps {
  products: DispatchProduct[];
}

function DispatchTreemap({ products }: DispatchTreemapProps) {
  const allZero = products.every((p) => p.awaitingQuantity <= 0);

  if (allZero) {
    return (
      <div className="flex-1 flex items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50 p-4">
        <p className="text-xs text-gray-500 text-center">
          No quantities awaiting dispatch yet.
        </p>
      </div>
    );
  }

  const treemapData = products.map((p) => ({
    name: p.name,
    value: Math.max(p.awaitingQuantity, 0.01),
  }));

  const option: EChartsOption = {
    tooltip: {
      formatter: (params: unknown) => {
        const p = params as { name: string; value: number };
        return `${p.name}: ${p.value}`;
      },
    },
    series: [
      {
        type: "treemap",
        data: treemapData,
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        label: {
          show: true,
          formatter: "{b}",
          fontSize: 11,
        },
        itemStyle: {
          borderColor: "#fff",
          borderWidth: 2,
          gapWidth: 1,
        },
      },
    ],
  };

  return (
    <div className="flex-1 min-h-0">
      <ReactECharts
        option={option}
        notMerge
        lazyUpdate
        style={{ height: "100%", width: "100%", minHeight: 120 }}
        opts={{ renderer: "svg" }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// DispatchQrCode — QR code display for dispatch entry (Req 12.5)
// ---------------------------------------------------------------------------

interface DispatchQrCodeProps {
  layoutId: string;
}

function DispatchQrCode({ layoutId }: DispatchQrCodeProps) {
  const [generating, setGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [svgString, setSvgString] = useState<string | null>(null);
  const { state: factoryState, filters } = useFactory();

  const companyName = "Vulcan";
  const activeFactory = factoryState.factories.find(
    (f) => f.id === (filters.factoryId || factoryState.activeFactoryId)
  );
  const factoryName = activeFactory?.name || "Factory";

  const ensureGenerated = useCallback(async () => {
    if (svgString) return;
    const svg = await generateDispatchQrSvg(layoutId);
    setSvgString(svg);
  }, [svgString, layoutId]);

  const handleDownload = useCallback(async () => {
    setGenerating(true);
    try {
      const qrDataUrl = await generateDispatchQrDataUrl(layoutId);
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
      ctx.fillText("Dispatch", w / 2, padding + topH + qrSize + 30);
      const blob = await new Promise<Blob>((res) => { canvas.toBlob((b) => res(b!), "image/jpeg", 0.95); });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl; a.download = "dispatch-qr.jpg"; a.click();
      URL.revokeObjectURL(blobUrl);
    } finally {
      setGenerating(false);
    }
  }, [layoutId, factoryName]);

  const handlePrint = useCallback(async () => {
    setGenerating(true);
    try {
      const qrDataUrl = await generateDispatchQrDataUrl(layoutId);
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
      ctx.fillText("Dispatch", w / 2, padding + topH + qrSize + 30);
      const blob = await new Promise<Blob>((res) => { canvas.toBlob((b) => res(b!), "image/jpeg", 0.95); });
      const blobUrl = URL.createObjectURL(blob);
      const pw = window.open("", "_blank", "width=450,height=550");
      if (!pw) return;
      pw.document.write(`<!DOCTYPE html><html><head><title>Dispatch QR</title><style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1rem}img{max-width:100%;height:auto}@media print{body{padding:0}img{width:8cm}}</style></head><body><img src="${blobUrl}"/><script>window.onload=function(){setTimeout(function(){window.print()},200);window.onafterprint=function(){window.close()}}</script></body></html>`);
      pw.document.close();
    } finally {
      setGenerating(false);
    }
  }, [layoutId, factoryName]);

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
            aria-label="QR code for dispatch entry"
            role="img"
          />
          <p className="mt-1.5 text-xs text-gray-500 font-medium">Dispatch</p>
        </div>
      )}
    </div>
  );
}

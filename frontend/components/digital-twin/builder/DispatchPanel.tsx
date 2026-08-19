"use client";

import type { EChartsOption } from "echarts";
import ReactECharts from "echarts-for-react";
import { Download, Eye, EyeOff, Package, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useFactoryBuilder } from "@/lib/factory-builder-context";
import { generateDispatchQrSvg } from "@/lib/qr-generator";
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
export function DispatchPanel() {
  const { state, configureDispatch } = useFactoryBuilder();
  const dispatchConfig = state.layout.dispatch;

  const [isConfiguring, setIsConfiguring] = useState(false);
  const [products, setProducts] = useState<ProductDraft[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

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
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          onClick={handleBuildDispatch}
        >
          <Plus size={14} />
          Build Dispatch
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Configured (summary view with treemap + QR code)
  // ---------------------------------------------------------------------------

  if (!isConfiguring && dispatchConfig) {
    return (
      <div className="flex flex-col h-full p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800">Dispatch</h3>
          <button
            type="button"
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            onClick={handleBuildDispatch}
          >
            Edit
          </button>
        </div>

        {/* Treemap or placeholder */}
        <DispatchTreemap products={dispatchConfig.products} />

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
                  className="text-gray-400 hover:text-red-500 p-0.5"
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
                  className={`w-full rounded-md border px-2.5 py-1.5 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
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
                  className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
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
          className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          onClick={handleCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="flex-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
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
  const { state } = useFactoryBuilder();

  const handleDownload = useCallback(async () => {
    setGenerating(true);
    try {
      const qrSvg = svgString ?? await generateDispatchQrSvg(layoutId);
      if (!svgString) setSvgString(qrSvg);
      const factoryName = state.layout.factoryId || "Factory";
      const htmlContent = `<!DOCTYPE html><html><head><title>Dispatch QR - Vulcan by Tamaso</title><style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:2rem}.brand{font-size:12px;color:#6b7280;margin-bottom:1.5rem;letter-spacing:0.05em;text-transform:uppercase}.qr-svg{width:200px;height:200px}.qr-svg svg{width:100%;height:100%}.label{font-size:16px;font-weight:600;margin-top:1rem;text-align:center}.sublabel{font-size:12px;color:#6b7280;margin-top:0.25rem}</style></head><body><div class="brand">Vulcan by Tamaso</div><div class="qr-svg">${qrSvg}</div><div class="label">Dispatch</div><div class="sublabel">${factoryName}</div></body></html>`;
      const blob = new Blob([htmlContent], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "dispatch-qr.html";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setGenerating(false);
    }
  }, [layoutId, state.layout.factoryId, svgString]);

  const togglePreview = useCallback(async () => {
    if (!showPreview && !svgString) {
      try {
        const svg = await generateDispatchQrSvg(layoutId);
        setSvgString(svg);
      } catch {
        // ignore
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
            aria-label="QR code for dispatch entry"
            role="img"
          />
          <p className="text-xs text-gray-500">Dispatch</p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InventoryMaterial {
  id: string;
  name: string;
  unit: string;
  quantity: number;
}

interface InventoryState {
  storage_capacity: number;
  capacity_unit: string;
  materials: InventoryMaterial[];
}

type Direction = "addition" | "removal";

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const API_ROOT = "/api/backend/api";

async function fetchInventoryConfig(layoutId: string): Promise<InventoryState> {
  const response = await fetch(
    `${API_ROOT}/spatial/inventory/${layoutId}/`,
    {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? (payload as { detail: string }).detail
        : undefined;
    throw new ApiError(
      detail ?? `Failed to load inventory configuration (${response.status})`,
      response.status,
      payload,
    );
  }

  return response.json();
}

async function submitInventoryChange(
  layoutId: string,
  body: { material_id: string; direction: string; quantity: number },
): Promise<void> {
  const response = await fetch(
    `${API_ROOT}/spatial/inventory/${layoutId}/changes/`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? (payload as { detail: string }).detail
        : undefined;
    throw new ApiError(
      detail ?? `Submission failed (${response.status})`,
      response.status,
      payload,
    );
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function InventoryDataEntryPage() {
  const params = useParams<{ layoutId: string }>();
  const layoutId = params.layoutId;

  const [config, setConfig] = useState<InventoryState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Form state
  const [materialId, setMaterialId] = useState("");
  const [direction, setDirection] = useState<Direction>("addition");
  const [quantity, setQuantity] = useState("");

  // Submission state
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch inventory config on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        setNotFound(false);
        const data = await fetchInventoryConfig(layoutId);
        if (!cancelled) {
          setConfig(data);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError && err.status === 404) {
            setNotFound(true);
          } else {
            setError(
              err instanceof Error ? err.message : "An unexpected error occurred",
            );
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [layoutId]);

  // Validate form
  const validate = useCallback((): boolean => {
    const errors: Record<string, string> = {};

    if (!materialId) {
      errors.material = "Please select a material";
    }

    const qty = Number(quantity);
    if (!quantity || isNaN(qty)) {
      errors.quantity = "Quantity is required";
    } else if (qty < 1) {
      errors.quantity = "Quantity must be at least 1";
    } else if (config && qty > config.storage_capacity) {
      errors.quantity = `Quantity must not exceed storage capacity (${config.storage_capacity})`;
    }

    // Check removal against current stock
    if (direction === "removal" && config && materialId && !errors.quantity) {
      const material = config.materials.find((m) => m.id === materialId);
      if (material && qty > material.quantity) {
        errors.quantity = `Insufficient stock. Current quantity: ${material.quantity} ${material.unit}`;
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [materialId, direction, quantity, config]);

  // Handle form submission
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitError(null);
      setSubmitSuccess(false);

      if (!validate()) return;

      const directionValue = direction === "addition" ? "inbound" : "outbound";

      setSubmitting(true);
      try {
        await submitInventoryChange(layoutId, {
          material_id: materialId,
          direction: directionValue,
          quantity: Number(quantity),
        });

        // Success: reset form
        setSubmitSuccess(true);
        setMaterialId("");
        setDirection("addition");
        setQuantity("");
        setFieldErrors({});

        // Refresh inventory data to reflect updated quantities
        const updatedConfig = await fetchInventoryConfig(layoutId);
        setConfig(updatedConfig);
      } catch (err) {
        if (err instanceof ApiError && err.status === 400) {
          setSubmitError(err.message);
        } else {
          setSubmitError(
            err instanceof Error ? err.message : "Submission failed. Please try again.",
          );
        }
      } finally {
        setSubmitting(false);
      }
    },
    [layoutId, materialId, direction, quantity, validate],
  );

  // Clear field error on change
  const clearFieldError = useCallback((field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Render: Loading
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="entry-page">
        <div className="entry-container">
          <div className="entry-loading">
            <div className="entry-spinner" />
            <p>Loading inventory configuration...</p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Not Found
  // ---------------------------------------------------------------------------
  if (notFound) {
    return (
      <div className="entry-page">
        <div className="entry-container">
          <div className="entry-error-state">
            <div className="entry-error-icon">!</div>
            <h2>Inventory Not Found</h2>
            <p>
              This inventory configuration does not exist. The layout may have
              been removed or the QR code is invalid.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Error
  // ---------------------------------------------------------------------------
  if (error) {
    return (
      <div className="entry-page">
        <div className="entry-container">
          <div className="entry-error-state">
            <div className="entry-error-icon">!</div>
            <h2>Error</h2>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Form
  // ---------------------------------------------------------------------------
  const selectedMaterial = config?.materials.find((m) => m.id === materialId);

  return (
    <div className="entry-page">
      <div className="entry-container">
        <header className="entry-header">
          <h1>Inventory Entry</h1>
          <p className="entry-subtitle">Record material addition or removal</p>
        </header>

        {submitSuccess && (
          <div className="entry-success-banner" role="status">
            Inventory change recorded successfully.
          </div>
        )}

        {submitError && (
          <div className="entry-error-banner" role="alert">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="entry-form">
          {/* Material selection */}
          <div className={`entry-field ${fieldErrors.material ? "entry-field-error" : ""}`}>
            <label htmlFor="material-select" className="entry-field-label">
              Material<span className="entry-required-mark"> *</span>
            </label>
            <select
              id="material-select"
              className="entry-input entry-select"
              value={materialId}
              onChange={(e) => {
                setMaterialId(e.target.value);
                clearFieldError("material");
              }}
              aria-invalid={Boolean(fieldErrors.material)}
              aria-describedby={fieldErrors.material ? "material-error" : undefined}
            >
              <option value="">Select a material</option>
              {config?.materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.quantity} {m.unit})
                </option>
              ))}
            </select>
            {fieldErrors.material && (
              <p id="material-error" className="entry-field-error-text" role="alert">
                {fieldErrors.material}
              </p>
            )}
          </div>

          {/* Direction selection */}
          <div className="entry-field">
            <label className="entry-field-label">
              Direction<span className="entry-required-mark"> *</span>
            </label>
            <div className="entry-direction-group" role="radiogroup" aria-label="Direction">
              <label className="entry-direction-option">
                <input
                  type="radio"
                  name="direction"
                  value="addition"
                  checked={direction === "addition"}
                  onChange={() => setDirection("addition")}
                  className="entry-radio-input"
                />
                <span className={`entry-direction-label ${direction === "addition" ? "entry-direction-active" : ""}`}>
                  Addition
                </span>
              </label>
              <label className="entry-direction-option">
                <input
                  type="radio"
                  name="direction"
                  value="removal"
                  checked={direction === "removal"}
                  onChange={() => setDirection("removal")}
                  className="entry-radio-input"
                />
                <span className={`entry-direction-label ${direction === "removal" ? "entry-direction-active" : ""}`}>
                  Removal
                </span>
              </label>
            </div>
          </div>

          {/* Quantity input */}
          <div className={`entry-field ${fieldErrors.quantity ? "entry-field-error" : ""}`}>
            <label htmlFor="quantity-input" className="entry-field-label">
              Quantity{selectedMaterial ? ` (${selectedMaterial.unit})` : ""}
              <span className="entry-required-mark"> *</span>
            </label>
            <input
              id="quantity-input"
              type="text"
              inputMode="numeric"
              className="entry-input"
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value);
                clearFieldError("quantity");
              }}
              placeholder="Enter quantity"
              aria-invalid={Boolean(fieldErrors.quantity)}
              aria-describedby={fieldErrors.quantity ? "quantity-error" : undefined}
            />
            {fieldErrors.quantity && (
              <p id="quantity-error" className="entry-field-error-text" role="alert">
                {fieldErrors.quantity}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="entry-submit-button"
          >
            {submitting ? "Submitting..." : "Submit Inventory Change"}
          </button>
        </form>
      </div>
    </div>
  );
}

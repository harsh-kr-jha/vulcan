"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, getCsrfToken } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DispatchProduct {
  id: string;
  name: string;
  unit: string;
}

interface DispatchState {
  products: DispatchProduct[];
}

type EventType = "arrival" | "dispatched";

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const API_ROOT = "/api/backend/api";

async function fetchDispatchConfig(layoutId: string): Promise<DispatchState> {
  const response = await fetch(
    `${API_ROOT}/spatial/dispatch/${layoutId}/`,
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
      detail ?? `Failed to load dispatch configuration (${response.status})`,
      response.status,
      payload,
    );
  }

  return response.json();
}

async function submitDispatchEvent(
  layoutId: string,
  body: {
    product_id: string;
    event_type: string;
    quantity: number;
    unit: string;
  },
): Promise<void> {
  const csrfToken = await getCsrfToken();
  const response = await fetch(
    `${API_ROOT}/spatial/dispatch/${layoutId}/events/`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-CSRFToken": csrfToken,
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

export default function DispatchDataEntryPage() {
  const params = useParams<{ layoutId: string }>();
  const layoutId = params.layoutId;

  const [config, setConfig] = useState<DispatchState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Form state
  const [eventType, setEventType] = useState<EventType>("arrival");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");

  // Submission state
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch dispatch config on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        setNotFound(false);
        const data = await fetchDispatchConfig(layoutId);
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

    if (!productId) {
      errors.product = "Please select a product";
    }

    const qty = Number(quantity);
    if (!quantity || isNaN(qty)) {
      errors.quantity = "Quantity is required";
    } else if (qty < 0.01) {
      errors.quantity = "Quantity must be at least 0.01";
    } else if (qty > 999999999.99) {
      errors.quantity = "Quantity must not exceed 999,999,999.99";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [productId, quantity]);

  // Handle form submission
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitError(null);
      setSubmitSuccess(false);

      if (!validate()) return;

      const selectedProduct = config?.products.find((p) => p.id === productId);
      if (!selectedProduct) return;

      setSubmitting(true);
      try {
        await submitDispatchEvent(layoutId, {
          product_id: productId,
          event_type: eventType,
          quantity: Number(quantity),
          unit: selectedProduct.unit,
        });

        // Success: reset form
        setSubmitSuccess(true);
        setProductId("");
        setEventType("arrival");
        setQuantity("");
        setFieldErrors({});
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
    [layoutId, productId, eventType, quantity, config, validate],
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
            <p>Loading dispatch configuration...</p>
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
            <h2>Dispatch Not Found</h2>
            <p>
              This dispatch configuration does not exist. The layout may have
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
  const selectedProduct = config?.products.find((p) => p.id === productId);

  return (
    <div className="entry-page">
      <div className="entry-container">
        <header className="entry-header">
          <h1>Dispatch Entry</h1>
          <p className="entry-subtitle">Record dispatch arrival or actual dispatch</p>
        </header>

        {submitSuccess && (
          <div className="entry-success-banner" role="status">
            Dispatch event recorded successfully.
          </div>
        )}

        {submitError && (
          <div className="entry-error-banner" role="alert">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="entry-form">
          {/* Event type selection */}
          <div className="entry-field">
            <label className="entry-field-label">
              Event Type<span className="entry-required-mark"> *</span>
            </label>
            <div className="entry-direction-group" role="radiogroup" aria-label="Event type">
              <label className="entry-direction-option">
                <input
                  type="radio"
                  name="event-type"
                  value="arrival"
                  checked={eventType === "arrival"}
                  onChange={() => setEventType("arrival")}
                  className="entry-radio-input"
                />
                <span className={`entry-direction-label ${eventType === "arrival" ? "entry-direction-active" : ""}`}>
                  Arrival for Dispatch
                </span>
              </label>
              <label className="entry-direction-option">
                <input
                  type="radio"
                  name="event-type"
                  value="dispatched"
                  checked={eventType === "dispatched"}
                  onChange={() => setEventType("dispatched")}
                  className="entry-radio-input"
                />
                <span className={`entry-direction-label ${eventType === "dispatched" ? "entry-direction-active" : ""}`}>
                  Actual Dispatch
                </span>
              </label>
            </div>
          </div>

          {/* Product selection */}
          <div className={`entry-field ${fieldErrors.product ? "entry-field-error" : ""}`}>
            <label htmlFor="product-select" className="entry-field-label">
              Product<span className="entry-required-mark"> *</span>
            </label>
            <select
              id="product-select"
              className="entry-input entry-select"
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                clearFieldError("product");
              }}
              aria-invalid={Boolean(fieldErrors.product)}
              aria-describedby={fieldErrors.product ? "product-error" : undefined}
            >
              <option value="">Select a product</option>
              {config?.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.unit})
                </option>
              ))}
            </select>
            {fieldErrors.product && (
              <p id="product-error" className="entry-field-error-text" role="alert">
                {fieldErrors.product}
              </p>
            )}
          </div>

          {/* Quantity input */}
          <div className={`entry-field ${fieldErrors.quantity ? "entry-field-error" : ""}`}>
            <label htmlFor="quantity-input" className="entry-field-label">
              Quantity{selectedProduct ? ` (${selectedProduct.unit})` : ""}
              <span className="entry-required-mark"> *</span>
            </label>
            <input
              id="quantity-input"
              type="text"
              inputMode="decimal"
              className="entry-input"
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value);
                clearFieldError("quantity");
              }}
              placeholder="0.01 – 999,999,999.99"
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
            {submitting ? "Submitting..." : "Submit Dispatch Event"}
          </button>
        </form>
      </div>
    </div>
  );
}

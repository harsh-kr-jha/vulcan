"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, getCsrfToken } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EntryField {
  id: string;
  key: string;
  data_type: "number" | "text" | "boolean" | "date" | "selection";
  options?: string[];
  required: boolean;
  order: number;
  label?: string;
  unit_type?: string;
  io_type?: "input" | "output";
}

interface EntrySchema {
  machine_name: string;
  machine_id: string;
  parameters: EntryField[];
  io_fields?: EntryField[];
}

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

const API_ROOT = "/api/backend/api";

async function fetchEntrySchema(machineId: string): Promise<EntrySchema> {
  const response = await fetch(
    `${API_ROOT}/spatial/machines/${machineId}/entry-schema/`,
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
      detail ?? `Failed to load entry schema (${response.status})`,
      response.status,
      payload,
    );
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MachineDataEntryPage() {
  const params = useParams<{ machineId: string }>();
  const machineId = params.machineId;

  const [schema, setSchema] = useState<EntrySchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch entry schema on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        setNotFound(false);
        const data = await fetchEntrySchema(machineId);
        if (!cancelled) {
          setSchema(data);
          // Initialize values for all fields (parameters + io_fields)
          const allFields = [...(data.parameters || []), ...(data.io_fields || [])];
          const initial: Record<string, string | boolean> = {};
          for (const field of allFields) {
            initial[field.key] = field.data_type === "boolean" ? false : "";
          }
          // Always ensure 'active' is initialized for the status toggle
          if (!("active" in initial)) {
            initial["active"] = false;
          }
          setValues(initial);
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
  }, [machineId]);

  // Update field value
  const updateValue = useCallback(
    (key: string, value: string | boolean) => {
      setValues((prev) => ({ ...prev, [key]: value }));
      // Clear field error on change
      setFieldErrors((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [],
  );

  // Validate required fields
  const validate = useCallback((): boolean => {
    if (!schema) return false;
    const errors: Record<string, string> = {};
    const allFields = [...(schema.parameters || []), ...(schema.io_fields || [])];
    for (const field of allFields) {
      if (!field.required) continue;
      const val = values[field.key];
      if (field.data_type === "boolean") continue; // boolean is always valid (false is a valid value)
      if (val === undefined || val === null || val === "") {
        errors[field.key] = "This field is required";
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [schema, values]);

  // Handle form submission
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitError(null);
      setSubmitSuccess(false);

      if (!validate()) return;
      if (!schema) return;

      // Coerce values to appropriate types for submission
      const payload: Record<string, unknown> = {};
      const allFields = [...(schema.parameters || []), ...(schema.io_fields || [])];
      for (const field of allFields) {
        const raw = values[field.key];
        if (field.data_type === "number") {
          payload[field.key] = raw === "" ? null : Number(raw);
        } else if (field.data_type === "boolean") {
          payload[field.key] = raw;
        } else {
          payload[field.key] = raw === "" ? null : raw;
        }
      }
      // Always include the 'active' status in the payload
      if (!("active" in payload)) {
        payload["active"] = values["active"] ?? false;
      }

      setSubmitting(true);
      try {
        const csrfToken = await getCsrfToken();
        const response = await fetch(
          `${API_ROOT}/spatial/machines/${machineId}/observations/`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              "X-CSRFToken": csrfToken,
            },
            body: JSON.stringify({ values: payload }),
          },
        );

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          const detail =
            body && typeof body === "object" && "detail" in body
              ? (body as { detail: string }).detail
              : "Submission failed. Please try again.";
          throw new Error(detail);
        }

        // Success: reset form
        setSubmitSuccess(true);
        const allResetFields = [...(schema.parameters || []), ...(schema.io_fields || [])];
        const initial: Record<string, string | boolean> = {};
        for (const field of allResetFields) {
          initial[field.key] = field.data_type === "boolean" ? false : "";
        }
        if (!("active" in initial)) {
          initial["active"] = false;
        }
        setValues(initial);
        setFieldErrors({});
      } catch (err) {
        setSubmitError(
          err instanceof Error ? err.message : "Submission failed. Please try again.",
        );
      } finally {
        setSubmitting(false);
      }
    },
    [machineId, schema, values, validate],
  );

  // ---------------------------------------------------------------------------
  // Render: Loading
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="entry-page">
        <div className="entry-container">
          <div className="entry-loading">
            <div className="entry-spinner" />
            <p>Loading data entry form...</p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Not Found (deleted machine)
  // ---------------------------------------------------------------------------
  if (notFound) {
    return (
      <div className="entry-page">
        <div className="entry-container">
          <div className="entry-error-state">
            <div className="entry-error-icon">!</div>
            <h2>Machine Not Found</h2>
            <p>
              This machine no longer exists. The QR code may be invalid or the
              machine has been removed from the factory layout.
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
  return (
    <div className="entry-page">
      <div className="entry-container">
        <header className="entry-header">
          <h1>{schema?.machine_name}</h1>
          <p className="entry-subtitle">Submit observation data</p>
        </header>

        {submitSuccess && (
          <div className="entry-success-banner" role="status">
            Observation submitted successfully.
          </div>
        )}

        {submitError && (
          <div className="entry-error-banner" role="alert">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="entry-form">
          {/* No fields configured message */}
          {schema && (schema.parameters.length === 0 && (!schema.io_fields || schema.io_fields.length === 0)) && (
            <div className="entry-error-banner">
              No parameters configured for this machine. Add parameters in the Lexicon™ builder.
            </div>
          )}

          {/* Active/Inactive toggle - always shown */}
          {schema && (
            <div className="entry-section">
              <div className="entry-field" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0" }}>
                <span className="entry-field-label" style={{ margin: 0, fontWeight: 600, fontSize: "1rem" }}>
                  Machine Status
                </span>
                <label className="entry-toggle-wrapper" htmlFor="field-active" style={{ margin: 0 }}>
                  <input
                    id="field-active"
                    type="checkbox"
                    className="entry-toggle-input"
                    checked={values["active"] as boolean}
                    onChange={(e) => updateValue("active", e.target.checked)}
                  />
                  <span className="entry-toggle-track">
                    <span className="entry-toggle-thumb" />
                  </span>
                  <span className="entry-toggle-label" style={{ fontWeight: 600 }}>
                    {values["active"] ? "Active" : "Inactive"}
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Parameters section (excluding 'active' which is shown above) */}
          {schema && schema.parameters.filter((f) => f.key !== "active").length > 0 && (
            <div className="entry-section">
              <h3 className="entry-section-title">Parameters</h3>
              {schema.parameters
                .filter((field) => field.key !== "active")
                .map((field) => (
                <EntryFieldInput
                  key={field.id}
                  field={field}
                  value={values[field.key]}
                  error={fieldErrors[field.key]}
                  onChange={(val) => updateValue(field.key, val)}
                />
              ))}
            </div>
          )}

          {/* IO fields section */}
          {schema && schema.io_fields && schema.io_fields.length > 0 && (
            <div className="entry-section">
              <h3 className="entry-section-title">Inputs / Outputs</h3>
              {schema.io_fields.map((field) => (
                <EntryFieldInput
                  key={field.id}
                  field={field}
                  value={values[field.key]}
                  error={fieldErrors[field.key]}
                  onChange={(val) => updateValue(field.key, val)}
                />
              ))}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || (schema?.parameters.length === 0 && (!schema?.io_fields || schema.io_fields.length === 0))}
            className="entry-submit-button"
          >
            {submitting ? "Submitting..." : "Submit Observation"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unit type options (same extensive list as MachineConfigPanel)
// ---------------------------------------------------------------------------

const UNIT_TYPE_OPTIONS = [
  // Mass / Weight
  { value: "kilograms", label: "Kilograms (kg)", group: "Mass" },
  { value: "grams", label: "Grams (g)", group: "Mass" },
  { value: "milligrams", label: "Milligrams (mg)", group: "Mass" },
  { value: "tonnes", label: "Tonnes (t)", group: "Mass" },
  { value: "pounds", label: "Pounds (lb)", group: "Mass" },
  { value: "ounces", label: "Ounces (oz)", group: "Mass" },
  // Volume
  { value: "litres", label: "Litres (L)", group: "Volume" },
  { value: "millilitres", label: "Millilitres (mL)", group: "Volume" },
  { value: "cubic_meters", label: "Cubic meters (m³)", group: "Volume" },
  { value: "gallons", label: "Gallons (gal)", group: "Volume" },
  { value: "barrels", label: "Barrels (bbl)", group: "Volume" },
  // Length / Distance
  { value: "meters", label: "Meters (m)", group: "Length" },
  { value: "centimeters", label: "Centimeters (cm)", group: "Length" },
  { value: "millimeters", label: "Millimeters (mm)", group: "Length" },
  { value: "kilometers", label: "Kilometers (km)", group: "Length" },
  { value: "inches", label: "Inches (in)", group: "Length" },
  { value: "feet", label: "Feet (ft)", group: "Length" },
  { value: "yards", label: "Yards (yd)", group: "Length" },
  // Area
  { value: "square_meters", label: "Square meters (m²)", group: "Area" },
  { value: "square_feet", label: "Square feet (ft²)", group: "Area" },
  { value: "square_centimeters", label: "Square centimeters (cm²)", group: "Area" },
  // Count / Quantity
  { value: "units", label: "Units", group: "Count" },
  { value: "pieces", label: "Pieces (pcs)", group: "Count" },
  { value: "dozen", label: "Dozen", group: "Count" },
  { value: "pairs", label: "Pairs", group: "Count" },
  { value: "batches", label: "Batches", group: "Count" },
  // Packaging
  { value: "bags", label: "Bags", group: "Packaging" },
  { value: "boxes", label: "Boxes", group: "Packaging" },
  { value: "cartons", label: "Cartons", group: "Packaging" },
  { value: "crates", label: "Crates", group: "Packaging" },
  { value: "pallets", label: "Pallets", group: "Packaging" },
  { value: "rolls", label: "Rolls", group: "Packaging" },
  { value: "sheets", label: "Sheets", group: "Packaging" },
  { value: "bottles", label: "Bottles", group: "Packaging" },
  { value: "cans", label: "Cans", group: "Packaging" },
  { value: "packets", label: "Packets", group: "Packaging" },
  { value: "drums", label: "Drums", group: "Packaging" },
  { value: "containers", label: "Containers", group: "Packaging" },
  { value: "bundles", label: "Bundles", group: "Packaging" },
  { value: "sacks", label: "Sacks", group: "Packaging" },
  // Time
  { value: "seconds", label: "Seconds (s)", group: "Time" },
  { value: "minutes", label: "Minutes (min)", group: "Time" },
  { value: "hours", label: "Hours (hr)", group: "Time" },
  { value: "days", label: "Days", group: "Time" },
  // Temperature
  { value: "celsius", label: "Celsius (°C)", group: "Temperature" },
  { value: "fahrenheit", label: "Fahrenheit (°F)", group: "Temperature" },
  { value: "kelvin", label: "Kelvin (K)", group: "Temperature" },
  // Pressure
  { value: "pascal", label: "Pascal (Pa)", group: "Pressure" },
  { value: "bar", label: "Bar", group: "Pressure" },
  { value: "psi", label: "PSI", group: "Pressure" },
  // Energy / Power
  { value: "joules", label: "Joules (J)", group: "Energy" },
  { value: "kilowatt_hours", label: "Kilowatt-hours (kWh)", group: "Energy" },
  { value: "watts", label: "Watts (W)", group: "Energy" },
  { value: "kilowatts", label: "Kilowatts (kW)", group: "Energy" },
  // Speed / Flow
  { value: "meters_per_second", label: "Meters/sec (m/s)", group: "Speed" },
  { value: "litres_per_minute", label: "Litres/min (L/min)", group: "Speed" },
  { value: "cubic_meters_per_hour", label: "m³/hour", group: "Speed" },
  { value: "rpm", label: "RPM", group: "Speed" },
  // Electrical
  { value: "volts", label: "Volts (V)", group: "Electrical" },
  { value: "amperes", label: "Amperes (A)", group: "Electrical" },
  { value: "ohms", label: "Ohms (Ω)", group: "Electrical" },
  // Concentration
  { value: "percent", label: "Percent (%)", group: "Concentration" },
  { value: "ppm", label: "Parts per million (ppm)", group: "Concentration" },
  { value: "ph", label: "pH", group: "Concentration" },
] as const;

/** Group unit options by category for <optgroup> rendering */
const UNIT_TYPE_GROUPS = UNIT_TYPE_OPTIONS.reduce<Record<string, typeof UNIT_TYPE_OPTIONS[number][]>>(
  (acc, opt) => {
    if (!acc[opt.group]) acc[opt.group] = [];
    acc[opt.group].push(opt);
    return acc;
  },
  {},
);

// ---------------------------------------------------------------------------
// Field Components
// ---------------------------------------------------------------------------

interface EntryFieldInputProps {
  field: EntryField;
  value: string | boolean;
  error?: string;
  onChange: (value: string | boolean) => void;
}

function EntryFieldInput({ field, value, error, onChange }: EntryFieldInputProps) {
  const id = `field-${field.key}`;
  const hasError = Boolean(error);

  // Find label for unit_type if it matches one of our options
  const unitLabel = field.unit_type
    ? UNIT_TYPE_OPTIONS.find((u) => u.value === field.unit_type)?.label ?? field.unit_type
    : null;

  return (
    <div className={`entry-field ${hasError ? "entry-field-error" : ""}`}>
      <label htmlFor={id} className="entry-field-label">
        {field.label || field.key}
        {field.required && <span className="entry-required-mark"> *</span>}
      </label>

      {field.data_type === "number" && (
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            id={id}
            type="text"
            inputMode="decimal"
            className="entry-input"
            style={{ flex: 1 }}
            value={value as string}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter number"
            aria-invalid={hasError}
            aria-describedby={hasError ? `${id}-error` : undefined}
          />
          {unitLabel && (
            <span className="entry-field-unit-badge">{unitLabel}</span>
          )}
        </div>
      )}

      {field.data_type === "text" && (
        <input
          id={id}
          type="text"
          className="entry-input"
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter text"
          aria-invalid={hasError}
          aria-describedby={hasError ? `${id}-error` : undefined}
        />
      )}

      {field.data_type === "boolean" && (
        <label className="entry-toggle-wrapper" htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            className="entry-toggle-input"
            checked={value as boolean}
            onChange={(e) => onChange(e.target.checked)}
            aria-invalid={hasError}
            aria-describedby={hasError ? `${id}-error` : undefined}
          />
          <span className="entry-toggle-track">
            <span className="entry-toggle-thumb" />
          </span>
          <span className="entry-toggle-label">
            {value ? "Yes" : "No"}
          </span>
        </label>
      )}

      {field.data_type === "date" && (
        <input
          id={id}
          type="date"
          className="entry-input"
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${id}-error` : undefined}
        />
      )}

      {field.data_type === "selection" && (
        <select
          id={id}
          className="entry-input entry-select"
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${id}-error` : undefined}
        >
          <option value="">Select an option</option>
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )}

      {hasError && (
        <p id={`${id}-error`} className="entry-field-error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

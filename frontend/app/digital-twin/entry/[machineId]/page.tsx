"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api-client";

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
}

interface EntrySchema {
  machine_name: string;
  machine_id: string;
  parameters: EntryField[];
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
          // Initialize values
          const initial: Record<string, string | boolean> = {};
          for (const field of data.parameters) {
            initial[field.key] = field.data_type === "boolean" ? false : "";
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
    for (const field of schema.parameters) {
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
      for (const field of schema.parameters) {
        const raw = values[field.key];
        if (field.data_type === "number") {
          payload[field.key] = raw === "" ? null : Number(raw);
        } else if (field.data_type === "boolean") {
          payload[field.key] = raw;
        } else {
          payload[field.key] = raw === "" ? null : raw;
        }
      }

      setSubmitting(true);
      try {
        const response = await fetch(
          `${API_ROOT}/spatial/machines/${machineId}/observations/`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
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
        const initial: Record<string, string | boolean> = {};
        for (const field of schema.parameters) {
          initial[field.key] = field.data_type === "boolean" ? false : "";
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
          {schema?.parameters.map((field) => (
            <EntryFieldInput
              key={field.id}
              field={field}
              value={values[field.key]}
              error={fieldErrors[field.key]}
              onChange={(val) => updateValue(field.key, val)}
            />
          ))}

          <button
            type="submit"
            disabled={submitting}
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

  return (
    <div className={`entry-field ${hasError ? "entry-field-error" : ""}`}>
      <label htmlFor={id} className="entry-field-label">
        {field.key}
        {field.required && <span className="entry-required-mark"> *</span>}
      </label>

      {field.data_type === "number" && (
        <input
          id={id}
          type="text"
          inputMode="decimal"
          className="entry-input"
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter number"
          aria-invalid={hasError}
          aria-describedby={hasError ? `${id}-error` : undefined}
        />
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

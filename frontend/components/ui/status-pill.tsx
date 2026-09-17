type UploadStatus =
  | "COMPLETED"
  | "VALIDATION_REVIEW"
  | "VALIDATING"
  | "MAPPING_REQUIRED"
  | "INSPECTING"
  | "FAILED";

const uploadStatusLabels: Record<UploadStatus, string> = {
  COMPLETED: "Completed",
  VALIDATION_REVIEW: "Needs review",
  VALIDATING: "Validating",
  MAPPING_REQUIRED: "Map columns",
  INSPECTING: "Inspecting",
  FAILED: "Failed",
};

/**
 * UploadStatusPill complying with Newdesign.md:
 * - 8px badge squircle radius (--radius-badge)
 * - 12px label typography (0.75rem, uppercase, tracking 0.04em)
 * - Dual-layer semantic indicators for WCAG AA contrast (>= 4.5:1)
 */
export function UploadStatusPill({ status }: { status: UploadStatus }) {
  const isFailed = status === "FAILED";
  const isCompleted = status === "COMPLETED";

  return (
    <span
      className={`status-pill status-${status.toLowerCase()} typography-label`}
      style={{
        borderRadius: "var(--radius-badge, 8px)",
        color: isFailed
          ? "var(--color-negative-text, #93000a)"
          : isCompleted
          ? "var(--color-positive-text, #006a46)"
          : "var(--color-warning-text, #645f40)",
      }}
    >
      <span className="status-dot" />
      {uploadStatusLabels[status]}
    </span>
  );
}

/**
 * SeverityPill complying with Newdesign.md:
 * - 8px badge squircle radius (--radius-badge)
 * - Strict contrast contract
 */
export function SeverityPill({
  severity,
}: {
  severity: "critical" | "high" | "medium" | "low";
}) {
  const isCritical = severity === "critical";
  const isHigh = severity === "high";
  const isLow = severity === "low";

  return (
    <span
      className={`severity-pill severity-${severity} typography-label`}
      style={{
        borderRadius: "var(--radius-badge, 8px)",
        color: isCritical || isHigh
          ? "var(--color-negative-text, #93000a)"
          : isLow
          ? "var(--color-positive-text, #006a46)"
          : "var(--color-warning-text, #645f40)",
      }}
    >
      {severity}
    </span>
  );
}

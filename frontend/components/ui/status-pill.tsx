import type { UploadStatus } from "@/lib/types";

const uploadStatusLabels: Record<UploadStatus, string> = {
  COMPLETED: "Completed",
  VALIDATION_REVIEW: "Needs review",
  VALIDATING: "Validating",
  MAPPING_REQUIRED: "Map columns",
  INSPECTING: "Inspecting",
  FAILED: "Failed",
};

export function UploadStatusPill({ status }: { status: UploadStatus }) {
  return (
    <span className={`status-pill status-${status.toLowerCase()}`}>
      <span className="status-dot" />
      {uploadStatusLabels[status]}
    </span>
  );
}

export function SeverityPill({
  severity,
}: {
  severity: "critical" | "high" | "medium" | "low";
}) {
  return <span className={`severity-pill severity-${severity}`}>{severity}</span>;
}

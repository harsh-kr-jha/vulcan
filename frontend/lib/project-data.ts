export type ProjectStatus = "Not Started" | "In Progress" | "Delayed" | "Completed" | "On Hold";
export type StageStatus = "Not Started" | "In Progress" | "Completed" | "Delayed";
export type ProjectPriority = "Critical" | "High" | "Medium" | "Low";
export type DocumentCategory = "Drawing" | "Purchase Order" | "Inspection Report" | "Quality Document" | "Image" | "Other";

export interface ProjectTeamMember {
  name: string;
  role: string;
  initials: string;
}

export interface ProjectStage {
  id: string;
  code: string;
  name: string;
  sequence: number;
  status: StageStatus;
  progress: number;
  plannedStart: string;
  actualStart: string | null;
  plannedCompletion: string;
  actualCompletion: string | null;
  assignedTo: string;
  delayDays: number;
  notes: string;
  attachments: string[];
}

export interface ProjectDocument {
  id: string;
  name: string;
  category: DocumentCategory;
  size: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface ProjectActivity {
  id: string;
  type: "stage" | "status" | "comment" | "document" | "workflow";
  title: string;
  detail: string;
  user: string;
  timestamp: string;
}

export interface FactoryProject {
  id: string;
  projectNumber: string;
  poNumber: string;
  customer: string;
  name: string;
  category: string;
  quantity: number;
  uom: string;
  unit: string;
  orderValue: number;
  poReceivedDate: string;
  startDate: string;
  customerDueDate: string;
  commitmentDate: string;
  dispatchDate: string | null;
  priority: ProjectPriority;
  status: ProjectStatus;
  progress: number;
  assignedTeam: ProjectTeamMember[];
  deliveryPrediction: {
    date: string;
    confidence: number;
    state: "On track" | "At risk" | "Late";
  };
  stages: ProjectStage[];
  documents: ProjectDocument[];
  activities: ProjectActivity[];
  updatedAt: string;
  source: {
    filename: string;
    hasStageSheet: boolean;
  };
}

export function formatProjectDate(value: string | null, fallback = "—") {
  if (!value) return fallback;
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatProjectValue(value: number) {
  if (!value) return "Not supplied";
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)} Cr`;
  return `₹${(value / 100_000).toFixed(1)} L`;
}

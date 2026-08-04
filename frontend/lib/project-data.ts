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
  name: string;
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
}

export const defaultWorkflow = [
  "Raw Material Delivery",
  "Process Operations",
  "Profile Cutting",
  "Bending",
  "Machining",
  "Other fabrication processes",
  "Welding",
  "Polishing",
  "Packing",
] as const;

const stageOwners = ["Ajay Kumar", "Nisha Rao", "Imran Shaikh", "Ravi Joshi", "Nisha Rao", "Karthik S.", "Imran Shaikh", "Meera Patil", "Sandeep R."];
const stageDurations = [3, 2, 2, 2, 4, 3, 4, 2, 2];

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function buildStages(startDate: string, projectProgress: number, delayedStageIndex?: number): ProjectStage[] {
  const stagePosition = (projectProgress / 100) * defaultWorkflow.length;
  let dayOffset = 0;

  return defaultWorkflow.map((name, index) => {
    const plannedStart = addDays(startDate, dayOffset);
    dayOffset += stageDurations[index];
    const plannedCompletion = addDays(startDate, dayOffset - 1);
    const complete = index < Math.floor(stagePosition);
    const active = index === Math.floor(stagePosition) && projectProgress > 0 && projectProgress < 100;
    const isDelayed = delayedStageIndex === index;
    const progress = complete ? 100 : active ? Math.max(12, Math.round((stagePosition - Math.floor(stagePosition)) * 100)) : 0;
    const status: StageStatus = complete ? "Completed" : isDelayed ? "Delayed" : active ? "In Progress" : "Not Started";

    return {
      id: `stage-${index + 1}`,
      name,
      status,
      progress,
      plannedStart,
      actualStart: complete || active || isDelayed ? addDays(plannedStart, index === 0 ? 1 : 0) : null,
      plannedCompletion,
      actualCompletion: complete ? addDays(plannedCompletion, index === 0 ? 1 : 0) : null,
      assignedTo: stageOwners[index],
      delayDays: isDelayed ? 3 : complete && index === 0 ? 1 : 0,
      notes: isDelayed
        ? "Capacity conflict identified. Recovery sequence is under review with production planning."
        : index === 0
          ? "Material certificates verified against the purchase order before release to production."
          : complete
            ? "Stage inspection completed and released to the next operation."
            : active
              ? "Work is progressing against the latest shop-floor update."
              : "Awaiting release from the preceding operation.",
      attachments: index === 0 && complete ? ["material-test-certificate.pdf", "goods-receipt-note.pdf"] : [],
    };
  });
}

const coreTeam: ProjectTeamMember[] = [
  { name: "Nisha Rao", role: "Project lead", initials: "NR" },
  { name: "Imran Shaikh", role: "Production", initials: "IS" },
  { name: "Meera Patil", role: "Quality", initials: "MP" },
  { name: "Ajay Kumar", role: "Procurement", initials: "AK" },
];

function seedDocuments(projectNumber: string, poNumber: string): ProjectDocument[] {
  return [
    { id: `${projectNumber}-doc-1`, name: `${poNumber}.pdf`, category: "Purchase Order", size: "1.2 MB", uploadedBy: "Nisha Rao", uploadedAt: "2026-07-26T10:14:00+05:30" },
    { id: `${projectNumber}-doc-2`, name: "approved-general-arrangement.dwg", category: "Drawing", size: "4.8 MB", uploadedBy: "Ravi Joshi", uploadedAt: "2026-07-28T16:42:00+05:30" },
    { id: `${projectNumber}-doc-3`, name: "material-test-certificate.pdf", category: "Quality Document", size: "860 KB", uploadedBy: "Meera Patil", uploadedAt: "2026-07-30T09:18:00+05:30" },
  ];
}

function seedActivities(projectNumber: string, currentStage: string): ProjectActivity[] {
  return [
    { id: `${projectNumber}-activity-1`, type: "stage", title: `${currentStage} updated`, detail: "Progress and execution notes were updated from the shop floor.", user: "Nisha Rao", timestamp: "2026-08-04T14:32:00+05:30" },
    { id: `${projectNumber}-activity-2`, type: "document", title: "Quality document added", detail: "material-test-certificate.pdf was attached to the project.", user: "Meera Patil", timestamp: "2026-08-04T10:06:00+05:30" },
    { id: `${projectNumber}-activity-3`, type: "status", title: "Project health recalculated", detail: "Delivery prediction updated after the latest stage completion.", user: "Vulcan", timestamp: "2026-08-03T18:20:00+05:30" },
    { id: `${projectNumber}-activity-4`, type: "comment", title: "Planning note", detail: "Prioritize the critical-path operations in the first shift tomorrow.", user: "Imran Shaikh", timestamp: "2026-08-03T15:45:00+05:30" },
  ];
}

interface ProjectSeed {
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
  startDate: string;
  dueDate: string;
  priority: ProjectPriority;
  status: ProjectStatus;
  progress: number;
  prediction: string;
  confidence: number;
  predictionState: "On track" | "At risk" | "Late";
  delayedStageIndex?: number;
}

function buildProject(seed: ProjectSeed): FactoryProject {
  const stages = buildStages(seed.startDate, seed.progress, seed.delayedStageIndex);
  const currentStage = stages.find((stage) => stage.status === "Delayed" || stage.status === "In Progress")?.name ?? (seed.status === "Completed" ? "Packing" : "Raw Material Delivery");
  return {
    id: seed.id,
    projectNumber: seed.projectNumber,
    poNumber: seed.poNumber,
    customer: seed.customer,
    name: seed.name,
    category: seed.category,
    quantity: seed.quantity,
    uom: seed.uom,
    unit: seed.unit,
    orderValue: seed.orderValue,
    poReceivedDate: "2026-07-25",
    startDate: seed.startDate,
    customerDueDate: seed.dueDate,
    commitmentDate: seed.dueDate,
    dispatchDate: seed.status === "Completed" ? addDays(seed.dueDate, -1) : null,
    priority: seed.priority,
    status: seed.status,
    progress: seed.progress,
    assignedTeam: coreTeam,
    deliveryPrediction: { date: seed.prediction, confidence: seed.confidence, state: seed.predictionState },
    stages,
    documents: seedDocuments(seed.projectNumber, seed.poNumber),
    activities: seedActivities(seed.projectNumber, currentStage),
    updatedAt: "2026-08-04T14:32:00+05:30",
  };
}

export const initialProjects: FactoryProject[] = [
  buildProject({ id: "ig-2026-047", projectNumber: "IG-2026-047", poNumber: "PO/MYL/4821", customer: "Mylan Laboratories", name: "Purified Water Distribution Skid", category: "Process Equipment", quantity: 1, uom: "Set", unit: "Unit-I", orderValue: 4850000, startDate: "2026-07-28", dueDate: "2026-08-24", priority: "High", status: "In Progress", progress: 58, prediction: "2026-08-26", confidence: 72, predictionState: "At risk", delayedStageIndex: 5 }),
  buildProject({ id: "ig-2026-048", projectNumber: "IG-2026-048", poNumber: "PO/DRL/9914", customer: "Dr. Reddy's Laboratories", name: "Automated CIP Module", category: "Process Equipment", quantity: 2, uom: "Nos", unit: "Unit-II", orderValue: 7200000, startDate: "2026-07-27", dueDate: "2026-08-18", priority: "Critical", status: "Delayed", progress: 42, prediction: "2026-08-22", confidence: 54, predictionState: "Late", delayedStageIndex: 3 }),
  buildProject({ id: "ig-2026-050", projectNumber: "IG-2026-050", poNumber: "PO/BIO/3378", customer: "Biocon Biologics", name: "Jacketed Mixing Vessel – 2 KL", category: "Storage & Mixing", quantity: 1, uom: "Nos", unit: "Unit-I", orderValue: 3650000, startDate: "2026-07-24", dueDate: "2026-08-20", priority: "High", status: "In Progress", progress: 83, prediction: "2026-08-19", confidence: 88, predictionState: "On track" }),
  buildProject({ id: "ig-2026-051", projectNumber: "IG-2026-051", poNumber: "PO/AUR/7350", customer: "Aurobindo Pharma", name: "Material Transfer Trolley Set", category: "Material Handling", quantity: 6, uom: "Nos", unit: "Unit-II", orderValue: 980000, startDate: "2026-07-21", dueDate: "2026-08-05", priority: "Medium", status: "Completed", progress: 100, prediction: "2026-08-04", confidence: 100, predictionState: "On track" }),
  buildProject({ id: "ig-2026-054", projectNumber: "IG-2026-054", poNumber: "PO/SYN/2408", customer: "Syngene International", name: "Process Piping Manifold", category: "Piping", quantity: 4, uom: "Sets", unit: "Unit-I", orderValue: 2120000, startDate: "2026-08-01", dueDate: "2026-09-01", priority: "Medium", status: "In Progress", progress: 24, prediction: "2026-08-30", confidence: 91, predictionState: "On track" }),
  buildProject({ id: "ig-2026-057", projectNumber: "IG-2026-057", poNumber: "PO/ANT/1156", customer: "Anthem Biosciences", name: "SS316L Buffer Storage Tank", category: "Storage & Mixing", quantity: 2, uom: "Nos", unit: "Unit-II", orderValue: 5420000, startDate: "2026-08-08", dueDate: "2026-09-12", priority: "Low", status: "Not Started", progress: 0, prediction: "2026-09-10", confidence: 84, predictionState: "On track" }),
];

export function formatProjectDate(value: string | null, fallback = "—") {
  if (!value) return fallback;
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatProjectValue(value: number) {
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)} Cr`;
  return `₹${(value / 100_000).toFixed(1)} L`;
}

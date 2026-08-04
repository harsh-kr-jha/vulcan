"use client";

import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  CheckCircle2,
  Circle,
  CircleDot,
  Clock3,
  File,
  FileCheck2,
  FileImage,
  Files,
  Gauge,
  GitBranch,
  History,
  Info,
  MessageSquare,
  PackageCheck,
  Paperclip,
  Plus,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  TimerReset,
  Upload,
  UserRound,
  Users,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

import {
  formatProjectDate,
  formatProjectValue,
  type DocumentCategory,
  type FactoryProject,
  type ProjectActivity,
  type ProjectStage,
  type StageStatus,
} from "@/lib/project-data";
import { useProjects } from "@/lib/project-context";

type TrackerTab = "Overview" | "Timeline" | "Activity" | "Documents";

function StatusMark({ status }: { status: StageStatus }) {
  const Icon = status === "Completed" ? CheckCircle2 : status === "In Progress" ? CircleDot : status === "Delayed" ? AlertTriangle : Circle;
  return <span className={`stage-status stage-status-${status.toLowerCase().replaceAll(" ", "-")}`}><Icon size={14} />{status}</span>;
}

function ProjectState({ status }: { status: FactoryProject["status"] }) {
  return <span className={`project-status project-status-${status.toLowerCase().replaceAll(" ", "-")}`}><i />{status}</span>;
}

function StageEditModal({ project, stage, onClose }: { project: FactoryProject; stage: ProjectStage; onClose: () => void }) {
  const { updateStage, addDocuments } = useProjects();
  const [files, setFiles] = useState<File[]>([]);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const attachments = [...stage.attachments, ...files.map((file) => file.name)];
    updateStage(project.id, stage.id, {
      status: data.get("status") as StageStatus,
      progress: Math.min(100, Math.max(0, Number(data.get("progress")))),
      plannedStart: String(data.get("plannedStart")),
      actualStart: String(data.get("actualStart") || "") || null,
      plannedCompletion: String(data.get("plannedCompletion")),
      actualCompletion: String(data.get("actualCompletion") || "") || null,
      assignedTo: String(data.get("assignedTo")),
      delayDays: Math.max(0, Number(data.get("delayDays"))),
      notes: String(data.get("notes")),
      attachments,
    });
    if (files.length) addDocuments(project.id, files, "Other");
    onClose();
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="project-modal stage-edit-modal" onSubmit={save}>
      <header className="modal-header"><div><span className="modal-step">Stage {project.stages.findIndex((item) => item.id === stage.id) + 1} of {project.stages.length}</span><h2>{stage.name}</h2><p>Update the live production record for this operation.</p></div><button type="button" className="project-close" onClick={onClose} aria-label="Close"><X size={18} /></button></header>
      <div className="modal-body">
        <div className="stage-form-grid">
          <label><span>Status</span><select name="status" defaultValue={stage.status}><option>Not Started</option><option>In Progress</option><option>Completed</option><option>Delayed</option></select></label>
          <label><span>Completion %</span><input name="progress" type="number" min="0" max="100" defaultValue={stage.progress} /></label>
          <label><span>Planned start</span><input name="plannedStart" type="date" defaultValue={stage.plannedStart} required /></label>
          <label><span>Actual start</span><input name="actualStart" type="date" defaultValue={stage.actualStart ?? ""} /></label>
          <label><span>Planned completion</span><input name="plannedCompletion" type="date" defaultValue={stage.plannedCompletion} required /></label>
          <label><span>Actual completion</span><input name="actualCompletion" type="date" defaultValue={stage.actualCompletion ?? ""} /></label>
          <label><span>Assigned person</span><input name="assignedTo" defaultValue={stage.assignedTo} /></label>
          <label><span>Delay (days)</span><input name="delayDays" type="number" min="0" defaultValue={stage.delayDays} /></label>
          <label className="stage-notes-field"><span>Production notes</span><textarea name="notes" rows={4} defaultValue={stage.notes} /></label>
        </div>
        <label className="stage-attachment-drop"><Paperclip size={16} /><span><strong>Add stage evidence</strong><small>{files.length ? files.map((file) => file.name).join(", ") : "Drawings, inspection evidence or shop-floor photos"}</small></span><input type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></label>
        {!!stage.attachments.length && <div className="stage-existing-files"><span>Already attached</span>{stage.attachments.map((attachment) => <small key={attachment}><File size={12} />{attachment}</small>)}</div>}
      </div>
      <footer className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit">Save stage update <ArrowRight size={13} /></button></footer>
    </form>
  </div>;
}

function WorkflowModal({ project, onClose }: { project: FactoryProject; onClose: () => void }) {
  const { addStage, moveStage } = useProjects();
  const [name, setName] = useState("");

  function add(event: FormEvent) {
    event.preventDefault();
    addStage(project.id, name);
    setName("");
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="project-modal workflow-modal">
      <header className="modal-header"><div><span className="modal-step">Configurable by factory and order</span><h2>Manufacturing workflow</h2><p>Keep the default sequence or adapt it for this project.</p></div><button type="button" className="project-close" onClick={onClose} aria-label="Close"><X size={18} /></button></header>
      <div className="modal-body">
        <div className="workflow-editor-list">
          {project.stages.map((stage, index) => <article className={index === 0 ? "raw-material-stage" : ""} key={stage.id}><span>{index + 1}</span><div><strong>{stage.name}</strong><small>{index === 0 ? "Protected critical milestone" : stage.assignedTo}</small></div><div><button disabled={index <= 1} onClick={() => moveStage(project.id, stage.id, -1)} aria-label={`Move ${stage.name} up`}><ArrowUp size={14} /></button><button disabled={index === 0 || index === project.stages.length - 1} onClick={() => moveStage(project.id, stage.id, 1)} aria-label={`Move ${stage.name} down`}><ArrowDown size={14} /></button></div></article>)}
        </div>
        <form className="add-stage-form" onSubmit={add}><Plus size={16} /><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Add a factory-specific stage" aria-label="New workflow stage" /><button className="button button-secondary" disabled={!name.trim()}>Add stage</button></form>
        <p className="workflow-safety-note"><ShieldCheck size={14} />Raw Material Delivery remains the first milestone because downstream commitments depend on material readiness.</p>
      </div>
      <footer className="modal-footer"><button type="button" className="button button-primary" onClick={onClose}>Done</button></footer>
    </section>
  </div>;
}

function ProjectMetrics({ project }: { project: FactoryProject }) {
  const delayedStages = project.stages.filter((stage) => stage.status === "Delayed");
  const bottleneck = delayedStages.sort((first, second) => second.delayDays - first.delayDays)[0] ?? project.stages.find((stage) => stage.status === "In Progress");
  const cycleTime = Math.max(1, Math.round((new Date(`${project.deliveryPrediction.date}T00:00:00`).getTime() - new Date(`${project.startDate}T00:00:00`).getTime()) / 86_400_000));
  return <section className="project-performance-grid">
    <article><span><Gauge size={16} /></span><div><small>Overall progress</small><strong>{project.progress}%</strong><i><b style={{ width: `${project.progress}%` }} /></i></div></article>
    <article className={delayedStages.length ? "metric-warning" : ""}><span><AlertTriangle size={16} /></span><div><small>Delayed stages</small><strong>{delayedStages.length}</strong><p>{delayedStages.length ? `${delayedStages.reduce((total, stage) => total + stage.delayDays, 0)} delay-days open` : "No open delays"}</p></div></article>
    <article><span><TimerReset size={16} /></span><div><small>Predicted cycle time</small><strong>{cycleTime} days</strong><p>Start to predicted finish</p></div></article>
    <article className={project.deliveryPrediction.state === "On track" ? "metric-good" : "metric-warning"}><span><Target size={16} /></span><div><small>Delivery prediction</small><strong>{formatProjectDate(project.deliveryPrediction.date)}</strong><p>{project.deliveryPrediction.confidence}% confidence · {project.deliveryPrediction.state}</p></div></article>
    <article><span><Zap size={16} /></span><div><small>Current bottleneck</small><strong>{bottleneck?.name ?? "None"}</strong><p>{bottleneck ? `${bottleneck.assignedTo} · ${bottleneck.progress}% complete` : "Flow is clear"}</p></div></article>
  </section>;
}

function TrackerOverview({ project, onEdit }: { project: FactoryProject; onEdit: (stageId: string) => void }) {
  const rawMaterial = project.stages[0];
  const delayedStages = project.stages.filter((stage) => stage.status === "Delayed");
  const currentStage = project.stages.find((stage) => stage.status === "Delayed" || stage.status === "In Progress");
  return <>
    <ProjectMetrics project={project} />
    <div className="project-overview-grid">
      <section className="panel project-workflow-panel">
        <header className="project-section-header"><div><span><GitBranch size={16} /></span><div><h2>Manufacturing workflow</h2><p>Live progress from material receipt to final packing</p></div></div><small>{project.stages.filter((stage) => stage.status === "Completed").length} of {project.stages.length} stages complete</small></header>
        <button className={`raw-material-callout raw-state-${rawMaterial.status.toLowerCase().replaceAll(" ", "-")}`} onClick={() => onEdit(rawMaterial.id)}><span><PackageCheck size={20} /></span><div><small>Highest-priority milestone</small><strong>Raw Material Delivery</strong><p>{rawMaterial.notes}</p></div><div><StatusMark status={rawMaterial.status} /><small>{rawMaterial.delayDays ? `${rawMaterial.delayDays} day delay recorded` : "Material gate healthy"}</small></div><ArrowRight size={16} /></button>
        <div className="stage-table-heading"><span>Stage</span><span>Status & progress</span><span>Plan</span><span>Actual</span><span>Owner</span><span /></div>
        <div className="stage-list">
          {project.stages.map((stage, index) => <button className={`stage-row ${index === 0 ? "stage-row-raw" : ""}`} key={stage.id} onClick={() => onEdit(stage.id)}>
            <span className="stage-sequence">{index + 1}</span>
            <div className="stage-name"><strong>{stage.name}</strong><small>{stage.attachments.length ? <><Paperclip size={10} />{stage.attachments.length} attachment{stage.attachments.length === 1 ? "" : "s"}</> : stage.notes}</small></div>
            <div className="stage-state-cell"><StatusMark status={stage.status} /><i><b style={{ width: `${stage.progress}%` }} /></i><small>{stage.progress}%</small></div>
            <div className="stage-date-cell"><small>Start {formatProjectDate(stage.plannedStart)}</small><strong>{formatProjectDate(stage.plannedCompletion)}</strong></div>
            <div className="stage-date-cell"><small>Start {formatProjectDate(stage.actualStart)}</small><strong>{formatProjectDate(stage.actualCompletion, stage.status === "Completed" ? "Not recorded" : "Pending")}</strong></div>
            <div className="stage-owner"><span>{stage.assignedTo.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><div><strong>{stage.assignedTo}</strong><small className={stage.delayDays ? "text-danger" : ""}>{stage.delayDays ? `${stage.delayDays} days delayed` : "On plan"}</small></div></div>
            <ArrowRight className="stage-open-icon" size={15} />
          </button>)}
        </div>
      </section>
      <aside className="project-overview-aside">
        <section className={`panel project-health-card health-${project.deliveryPrediction.state.toLowerCase().replaceAll(" ", "-")}`}><header><span><Sparkles size={16} /></span><div><small>Vulcan delivery signal</small><strong>{project.deliveryPrediction.state}</strong></div></header><p>{project.deliveryPrediction.state === "On track" ? "The current sequence supports the committed delivery date." : `The latest execution plan predicts ${formatProjectDate(project.deliveryPrediction.date)}, after the ${formatProjectDate(project.commitmentDate)} commitment.`}</p><div><span>Prediction confidence</span><strong>{project.deliveryPrediction.confidence}%</strong></div><i><b style={{ width: `${project.deliveryPrediction.confidence}%` }} /></i></section>
        <section className="panel project-risk-card"><header><div><span><AlertTriangle size={16} /></span><div><h2>Execution risks</h2><p>Items needing owner attention</p></div></div><strong>{delayedStages.length}</strong></header>{delayedStages.length ? delayedStages.map((stage) => <button key={stage.id} onClick={() => onEdit(stage.id)}><i /><span><strong>{stage.name}</strong><small>{stage.delayDays} days · {stage.assignedTo}</small></span><ArrowRight size={13} /></button>) : <div className="project-all-clear"><CheckCircle2 size={20} /><span><strong>No open stage delays</strong><small>Continue monitoring the critical path.</small></span></div>}{currentStage && <div className="risk-next-action"><small>Recommended next action</small><strong>Review {currentStage.name.toLowerCase()} before the next shift handover.</strong></div>}</section>
        <section className="panel project-team-card"><header><div><span><Users size={16} /></span><div><h2>Assigned team</h2><p>Accountability for this order</p></div></div></header>{project.assignedTeam.map((member) => <div key={member.name}><span>{member.initials}</span><p><strong>{member.name}</strong><small>{member.role}</small></p></div>)}</section>
      </aside>
    </div>
  </>;
}

function TimelineView({ project, onEdit }: { project: FactoryProject; onEdit: (stageId: string) => void }) {
  const start = new Date(`${project.startDate}T00:00:00`).getTime();
  const end = Math.max(new Date(`${project.commitmentDate}T00:00:00`).getTime(), new Date(`${project.deliveryPrediction.date}T00:00:00`).getTime()) + 86_400_000;
  const span = Math.max(1, end - start);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => new Date(start + span * fraction).toISOString().slice(0, 10));
  const today = new Date().setHours(0, 0, 0, 0);
  const todayLeft = Math.min(100, Math.max(0, ((today - start) / span) * 100));
  return <section className="panel project-timeline-panel">
    <header className="project-section-header"><div><span><CalendarDays size={16} /></span><div><h2>Manufacturing timeline</h2><p>Planned sequence, execution progress and delivery commitment</p></div></div><div className="timeline-legend"><span><i className="completed" />Completed</span><span><i className="active" />In progress</span><span><i className="delayed" />Delayed</span></div></header>
    <div className="gantt-wrap">
      <div className="gantt-header"><span>Operation</span><div>{ticks.map((tick) => <small key={tick}>{formatProjectDate(tick).replace(" 2026", "")}</small>)}</div></div>
      <div className="gantt-body">
        <i className="gantt-today" style={{ left: `calc(245px + (100% - 245px) * ${todayLeft / 100})` }}><span>Today</span></i>
        {project.stages.map((stage, index) => {
          const stageStart = new Date(`${stage.plannedStart}T00:00:00`).getTime();
          const stageEnd = new Date(`${stage.plannedCompletion}T00:00:00`).getTime() + 86_400_000;
          const left = Math.max(0, ((stageStart - start) / span) * 100);
          const width = Math.max(2.5, ((stageEnd - stageStart) / span) * 100);
          return <button className="gantt-row" onClick={() => onEdit(stage.id)} key={stage.id}><span><i>{index + 1}</i><strong>{stage.name}</strong><small>{stage.assignedTo}</small></span><div className="gantt-track"><i className={`gantt-bar gantt-${stage.status.toLowerCase().replaceAll(" ", "-")}`} style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}><b style={{ width: `${stage.progress}%` }} /><span>{stage.progress}%</span></i></div></button>;
        })}
      </div>
    </div>
    <footer className="timeline-footer"><span><Target size={14} />Customer commitment <strong>{formatProjectDate(project.commitmentDate)}</strong></span><span className={project.deliveryPrediction.state === "On track" ? "text-good" : "text-danger"}><Sparkles size={14} />Predicted finish <strong>{formatProjectDate(project.deliveryPrediction.date)}</strong></span></footer>
  </section>;
}

const activityIcons: Record<ProjectActivity["type"], typeof History> = { stage: GitBranch, status: Gauge, comment: MessageSquare, document: Files, workflow: Settings2 };

function ActivityView({ project }: { project: FactoryProject }) {
  const { addComment } = useProjects();
  const [comment, setComment] = useState("");
  function submit(event: FormEvent) { event.preventDefault(); addComment(project.id, comment); setComment(""); }
  return <div className="project-activity-layout">
    <section className="panel activity-feed-panel"><header className="project-section-header"><div><span><History size={16} /></span><div><h2>Activity history</h2><p>Chronological, user-attributed execution trace</p></div></div><small>{project.activities.length} recorded events</small></header><div className="project-activity-feed">{project.activities.map((activity) => { const Icon = activityIcons[activity.type]; return <article key={activity.id}><span><Icon size={15} /></span><div><header><strong>{activity.title}</strong><time>{new Date(activity.timestamp).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</time></header><p>{activity.detail}</p><small><UserRound size={11} />{activity.user}</small></div></article>; })}</div></section>
    <aside className="panel project-comment-panel"><span><MessageSquare size={18} /></span><h2>Add a project comment</h2><p>Capture a decision, shift handover or customer update for the permanent project trail.</p><form onSubmit={submit}><textarea rows={6} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Write an update for the team…" /><button className="button button-primary" disabled={!comment.trim()}>Add to history <ArrowRight size={13} /></button></form><small><ShieldCheck size={12} />Comments are timestamped and attributed to your user.</small></aside>
  </div>;
}

const documentIcons: Record<DocumentCategory, typeof File> = { Drawing: File, "Purchase Order": FileCheck2, "Inspection Report": ShieldCheck, "Quality Document": ShieldCheck, Image: FileImage, Other: File };

function DocumentsView({ project }: { project: FactoryProject }) {
  const { addDocuments } = useProjects();
  const [category, setCategory] = useState<DocumentCategory>("Drawing");
  const categoryCounts = useMemo(() => project.documents.reduce<Partial<Record<DocumentCategory, number>>>((counts, document) => ({ ...counts, [document.category]: (counts[document.category] ?? 0) + 1 }), {}), [project.documents]);
  function upload(files: FileList | null) { if (files?.length) addDocuments(project.id, Array.from(files), category); }
  return <>
    <section className="project-document-summary">{(["Drawing", "Purchase Order", "Inspection Report", "Quality Document", "Image", "Other"] as DocumentCategory[]).map((item) => { const Icon = documentIcons[item]; return <article key={item}><span><Icon size={16} /></span><div><strong>{categoryCounts[item] ?? 0}</strong><small>{item}{(categoryCounts[item] ?? 0) === 1 ? "" : "s"}</small></div></article>; })}</section>
    <div className="project-documents-layout">
      <section className="panel document-list-panel"><header className="project-section-header"><div><span><Files size={16} /></span><div><h2>Project documents</h2><p>Drawings, POs, quality evidence and supporting files</p></div></div><small>{project.documents.length} files</small></header><div className="project-document-list"><div className="document-list-heading"><span>File</span><span>Category</span><span>Added by</span><span>Date</span></div>{project.documents.map((document) => { const Icon = documentIcons[document.category]; return <article key={document.id}><span><i><Icon size={16} /></i><span><strong>{document.name}</strong><small>{document.size}</small></span></span><em>{document.category}</em><span><strong>{document.uploadedBy}</strong></span><time>{new Date(document.uploadedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</time></article>; })}</div></section>
      <aside className="panel project-upload-card"><span><Upload size={20} /></span><h2>Add project files</h2><p>Attach source-of-truth evidence directly to this customer order.</p><label><span>Document type</span><select value={category} onChange={(event) => setCategory(event.target.value as DocumentCategory)}><option>Drawing</option><option>Purchase Order</option><option>Inspection Report</option><option>Quality Document</option><option>Image</option><option>Other</option></select></label><label className="project-file-drop"><Upload size={18} /><strong>Choose files</strong><small>PDF, images, Office or CAD files</small><input type="file" multiple onChange={(event) => upload(event.target.files)} /></label><small className="document-trace-note"><ShieldCheck size={12} />Each upload creates an activity-history entry.</small></aside>
    </div>
  </>;
}

function ProjectInfoStrip({ project }: { project: FactoryProject }) {
  return <section className="project-info-strip">
    <article className="project-progress-ring-card"><div className="project-progress-ring" style={{ background: `conic-gradient(var(--green) ${project.progress * 3.6}deg, #e8ece8 0deg)` }}><span>{project.progress}<small>%</small></span></div><div><small>Overall completion</small><strong>{project.status}</strong><p>{project.stages.filter((stage) => stage.status === "Completed").length} of {project.stages.length} stages complete</p></div></article>
    <article><span><Info size={15} /></span><div><small>Order value / PO</small><strong>{formatProjectValue(project.orderValue)}</strong><p>{project.poNumber}</p></div></article>
    <article><span><CalendarDays size={15} /></span><div><small>Project start</small><strong>{formatProjectDate(project.startDate)}</strong><p>PO received {formatProjectDate(project.poReceivedDate)}</p></div></article>
    <article><span><Target size={15} /></span><div><small>Delivery commitment</small><strong>{formatProjectDate(project.commitmentDate)}</strong><p>{project.deliveryPrediction.state}</p></div></article>
    <article><span><Users size={15} /></span><div><small>Assigned team</small><strong>{project.assignedTeam[0]?.name}</strong><p>+{Math.max(0, project.assignedTeam.length - 1)} cross-functional owners</p></div></article>
  </section>;
}

export function ProjectTracker({ projectId }: { projectId: string }) {
  const { getProject } = useProjects();
  const project = getProject(projectId);
  const [activeTab, setActiveTab] = useState<TrackerTab>("Overview");
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  if (!project) return <section className="panel project-not-found"><Info size={28} /><h1>Project not found</h1><p>This project is not available in the active factory workspace.</p><Link className="button button-primary" href="/projects">Return to projects</Link></section>;
  const selectedStage = selectedStageId ? project.stages.find((stage) => stage.id === selectedStageId) : undefined;
  const currentStage = project.stages.find((stage) => stage.status === "Delayed" || stage.status === "In Progress")
    ?? (project.status === "Completed" ? project.stages.at(-1) : project.stages[0]);

  return <>
    <header className="project-tracker-header">
      <div><div className="project-tracker-meta"><span>{project.projectNumber}</span><i /><span>{project.customer}</span><i /><span>{project.unit}</span></div><h1>{project.name}</h1><div className="project-header-tags"><ProjectState status={project.status} /><span className={`project-priority priority-${project.priority.toLowerCase()}`}><Zap size={12} />{project.priority} priority</span><span><Clock3 size={12} />Updated {new Date(project.updatedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span></div></div>
      <div className="page-actions"><button className="button button-secondary" onClick={() => setWorkflowOpen(true)}><Settings2 size={14} />Configure workflow</button>{currentStage && <button className="button button-accent" onClick={() => setSelectedStageId(currentStage.id)}>Update current stage <ArrowRight size={14} /></button>}</div>
    </header>
    <ProjectInfoStrip project={project} />
    <nav className="project-tracker-tabs" aria-label="Project tracker sections">{(["Overview", "Timeline", "Activity", "Documents"] as TrackerTab[]).map((tab) => { const Icon = tab === "Overview" ? Gauge : tab === "Timeline" ? CalendarDays : tab === "Activity" ? History : Files; return <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}><Icon size={15} />{tab}{tab === "Documents" && <span>{project.documents.length}</span>}</button>; })}</nav>
    {activeTab === "Overview" && <TrackerOverview project={project} onEdit={setSelectedStageId} />}
    {activeTab === "Timeline" && <TimelineView project={project} onEdit={setSelectedStageId} />}
    {activeTab === "Activity" && <ActivityView project={project} />}
    {activeTab === "Documents" && <DocumentsView project={project} />}
    {selectedStage && <StageEditModal project={project} stage={selectedStage} onClose={() => setSelectedStageId(null)} />}
    {workflowOpen && <WorkflowModal project={project} onClose={() => setWorkflowOpen(false)} />}
  </>;
}

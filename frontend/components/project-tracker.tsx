"use client";

import {
  AlertTriangle,
  ArrowRight,
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
import { useMemo, useState } from "react";

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
import { usePlatform } from "@/lib/variant";

type TrackerTab = "Overview" | "Timeline" | "Activity" | "Documents";

function StatusMark({ status }: { status: StageStatus }) {
  const Icon = status === "Completed" ? CheckCircle2 : status === "In Progress" ? CircleDot : status === "Delayed" ? AlertTriangle : Circle;
  return <span className={`stage-status stage-status-${status.toLowerCase().replaceAll(" ", "-")}`}><Icon size={14} />{status}</span>;
}

function ProjectState({ status }: { status: FactoryProject["status"] }) {
  return <span className={`project-status project-status-${status.toLowerCase().replaceAll(" ", "-")}`}><i />{status}</span>;
}

function StageDetailsModal({ project, stage, onClose, mushroomMode }: { project: FactoryProject; stage: ProjectStage; onClose: () => void; mushroomMode: boolean }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="project-modal stage-edit-modal">
      <header className="modal-header"><div><span className="modal-step">Stage {project.stages.findIndex((item) => item.id === stage.id) + 1} of {project.stages.length} · {stage.code}</span><h2>{stage.name}</h2><p>{mushroomMode ? "Crop facts" : "Production facts"} shown exactly as approved from the {mushroomMode ? "Crop cycle" : "Project"} stages sheet.</p></div><button type="button" className="project-close" onClick={onClose} aria-label="Close"><X size={18} /></button></header>
      <div className="modal-body">
        <div className="stage-form-grid">
          <label><span>Status</span><input value={stage.status} readOnly /></label>
          <label><span>Completion %</span><input value={`${stage.progress}%`} readOnly /></label>
          <label><span>Planned start</span><input value={formatProjectDate(stage.plannedStart)} readOnly /></label>
          <label><span>Actual start</span><input value={formatProjectDate(stage.actualStart)} readOnly /></label>
          <label><span>Planned completion</span><input value={formatProjectDate(stage.plannedCompletion)} readOnly /></label>
          <label><span>Actual completion</span><input value={formatProjectDate(stage.actualCompletion)} readOnly /></label>
          <label><span>Assigned person</span><input value={stage.assignedTo} readOnly /></label>
          <label><span>Delay (days)</span><input value={stage.delayDays} readOnly /></label>
          <label className="stage-notes-field"><span>Production notes</span><textarea rows={4} value={stage.notes} readOnly /></label>
        </div>
        {!!stage.attachments.length && <div className="stage-existing-files"><span>Already attached</span>{stage.attachments.map((attachment) => <small key={attachment}><File size={12} />{attachment}</small>)}</div>}
        {!stage.attachments.length && <div className="raw-preserved-note"><ShieldCheck size={14} /><span>No attachment references were supplied in the stage source.</span></div>}
      </div>
      <footer className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Close</button><Link className="button button-primary" href="/uploads?add=project_stages">Refresh stage source <ArrowRight size={13} /></Link></footer>
    </section>
  </div>;
}

function ProjectMetrics({ project, mushroomMode }: { project: FactoryProject; mushroomMode: boolean }) {
  const delayedStages = project.stages.filter((stage) => stage.status === "Delayed");
  const bottleneck = delayedStages.sort((first, second) => second.delayDays - first.delayDays)[0] ?? project.stages.find((stage) => stage.status === "In Progress");
  const cycleTime = Math.max(1, Math.round((new Date(`${project.deliveryPrediction.date}T00:00:00`).getTime() - new Date(`${project.startDate}T00:00:00`).getTime()) / 86_400_000));
  return <section className="project-performance-grid">
    <article><span><Gauge size={16} /></span><div><small>Overall progress</small><strong>{project.progress}%</strong><i><b style={{ width: `${project.progress}%` }} /></i></div></article>
    <article className={delayedStages.length ? "metric-warning" : ""}><span><AlertTriangle size={16} /></span><div><small>Delayed stages</small><strong>{delayedStages.length}</strong><p>{delayedStages.length ? `${delayedStages.reduce((total, stage) => total + stage.delayDays, 0)} delay-days open` : "No open delays"}</p></div></article>
    <article><span><TimerReset size={16} /></span><div><small>Predicted cycle time</small><strong>{cycleTime} days</strong><p>Start to predicted finish</p></div></article>
    <article className={project.deliveryPrediction.state === "On track" ? "metric-good" : "metric-warning"}><span><Target size={16} /></span><div><small>{mushroomMode ? "Harvest" : "Delivery"} prediction</small><strong>{formatProjectDate(project.deliveryPrediction.date)}</strong><p>{project.deliveryPrediction.confidence}% confidence · {project.deliveryPrediction.state}</p></div></article>
    <article><span><Zap size={16} /></span><div><small>Current bottleneck</small><strong>{bottleneck?.name ?? "None"}</strong><p>{bottleneck ? `${bottleneck.assignedTo} · ${bottleneck.progress}% complete` : "Flow is clear"}</p></div></article>
  </section>;
}

function TrackerOverview({ project, onEdit, mushroomMode }: { project: FactoryProject; onEdit: (stageId: string) => void; mushroomMode: boolean }) {
  const rawMaterial = (mushroomMode ? project.stages.find((stage) => stage.name.toLowerCase().includes("compost")) : undefined) ?? project.stages[0];
  const delayedStages = project.stages.filter((stage) => stage.status === "Delayed");
  const currentStage = project.stages.find((stage) => stage.status === "Delayed" || stage.status === "In Progress");
  return <>
    <ProjectMetrics project={project} mushroomMode={mushroomMode} />
    <div className="project-overview-grid">
      <section className="panel project-workflow-panel">
        <header className="project-section-header"><div><span><GitBranch size={16} /></span><div><h2>{mushroomMode ? "Cultivation" : "Production"} workflow</h2><p>{mushroomMode ? "Live progress from compost preparation to cold-room packing" : "Live progress from project start through production and delivery"}</p></div></div><small>{project.stages.filter((stage) => stage.status === "Completed").length} of {project.stages.length} stages complete</small></header>
        <button className={`raw-material-callout raw-state-${rawMaterial.status.toLowerCase().replaceAll(" ", "-")}`} onClick={() => onEdit(rawMaterial.id)}><span><PackageCheck size={20} /></span><div><small>Foundation milestone</small><strong>{rawMaterial.name}</strong><p>{rawMaterial.notes}</p></div><div><StatusMark status={rawMaterial.status} /><small>{rawMaterial.delayDays ? `${rawMaterial.delayDays} day delay recorded` : `${mushroomMode ? "Crop" : "Project"} foundation healthy`}</small></div><ArrowRight size={16} /></button>
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
        <section className={`panel project-health-card health-${project.deliveryPrediction.state.toLowerCase().replaceAll(" ", "-")}`}><header><span><Sparkles size={16} /></span><div><small>Vulcan {mushroomMode ? "harvest" : "delivery"} signal</small><strong>{project.deliveryPrediction.state}</strong></div></header><p>{project.deliveryPrediction.state === "On track" ? `The current stage sequence supports the expected ${mushroomMode ? "harvest" : "delivery"} date.` : `The latest ${mushroomMode ? "crop" : "production"} plan predicts ${formatProjectDate(project.deliveryPrediction.date)}, after the ${formatProjectDate(project.commitmentDate)} commitment.`}</p><div><span>Prediction confidence</span><strong>{project.deliveryPrediction.confidence}%</strong></div><i><b style={{ width: `${project.deliveryPrediction.confidence}%` }} /></i></section>
        <section className="panel project-risk-card"><header><div><span><AlertTriangle size={16} /></span><div><h2>Execution risks</h2><p>Items needing owner attention</p></div></div><strong>{delayedStages.length}</strong></header>{delayedStages.length ? delayedStages.map((stage) => <button key={stage.id} onClick={() => onEdit(stage.id)}><i /><span><strong>{stage.name}</strong><small>{stage.delayDays} days · {stage.assignedTo}</small></span><ArrowRight size={13} /></button>) : <div className="project-all-clear"><CheckCircle2 size={20} /><span><strong>No open stage delays</strong><small>Continue monitoring the critical path.</small></span></div>}{currentStage && <div className="risk-next-action"><small>Recommended next action</small><strong>Review {currentStage.name.toLowerCase()} before the next shift handover.</strong></div>}</section>
        <section className="panel project-team-card"><header><div><span><Users size={16} /></span><div><h2>Assigned team</h2><p>Accountability from source sheets</p></div></div></header>{project.assignedTeam.map((member) => <div key={member.name}><span>{member.initials}</span><p><strong>{member.name}</strong><small>{member.role}</small></p></div>)}{!project.assignedTeam.length && <div className="project-all-clear"><Users size={20} /><span><strong>No owners supplied</strong><small>Add team or stage owners in the source.</small></span></div>}</section>
      </aside>
    </div>
  </>;
}

function TimelineView({ project, onEdit, mushroomMode }: { project: FactoryProject; onEdit: (stageId: string) => void; mushroomMode: boolean }) {
  const start = new Date(`${project.startDate}T00:00:00`).getTime();
  const end = Math.max(new Date(`${project.commitmentDate}T00:00:00`).getTime(), new Date(`${project.deliveryPrediction.date}T00:00:00`).getTime()) + 86_400_000;
  const span = Math.max(1, end - start);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => new Date(start + span * fraction).toISOString().slice(0, 10));
  const today = new Date().setHours(0, 0, 0, 0);
  const todayLeft = Math.min(100, Math.max(0, ((today - start) / span) * 100));
  return <section className="panel project-timeline-panel">
    <header className="project-section-header"><div><span><CalendarDays size={16} /></span><div><h2>{mushroomMode ? "Crop" : "Project"} timeline</h2><p>Planned {mushroomMode ? "cultivation" : "production"} sequence, stage progress and expected {mushroomMode ? "harvest" : "delivery"}</p></div></div><div className="timeline-legend"><span><i className="completed" />Completed</span><span><i className="active" />In progress</span><span><i className="delayed" />Delayed</span></div></header>
    <div className="gantt-wrap">
      <div className="gantt-header"><span>{mushroomMode ? "Crop" : "Project"} stage</span><div>{ticks.map((tick) => <small key={tick}>{formatProjectDate(tick).replace(" 2026", "")}</small>)}</div></div>
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
    <footer className="timeline-footer"><span><Target size={14} />Expected {mushroomMode ? "harvest" : "delivery"} <strong>{formatProjectDate(project.commitmentDate)}</strong></span><span className={project.deliveryPrediction.state === "On track" ? "text-good" : "text-danger"}><Sparkles size={14} />Predicted finish <strong>{formatProjectDate(project.deliveryPrediction.date)}</strong></span></footer>
  </section>;
}

const activityIcons: Record<ProjectActivity["type"], typeof History> = { stage: GitBranch, status: Gauge, comment: MessageSquare, document: Files, workflow: Settings2 };

function ActivityView({ project, mushroomMode }: { project: FactoryProject; mushroomMode: boolean }) {
  return <div className="project-activity-layout">
    <section className="panel activity-feed-panel"><header className="project-section-header"><div><span><History size={16} /></span><div><h2>Activity history</h2><p>Chronological execution trace derived from approved sheets</p></div></div><small>{project.activities.length} recorded events</small></header><div className="project-activity-feed">{project.activities.map((activity) => { const Icon = activityIcons[activity.type]; return <article key={activity.id}><span><Icon size={15} /></span><div><header><strong>{activity.title}</strong><time>{new Date(activity.timestamp).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</time></header><p>{activity.detail}</p><small><UserRound size={11} />{activity.user}</small></div></article>; })}</div></section>
    <aside className="panel project-comment-panel"><span><MessageSquare size={18} /></span><h2>Source-controlled {mushroomMode ? "crop" : "project"} history</h2><p>Stage status, progress, dates and notes are read from the latest approved {mushroomMode ? "Crop cycle" : "Project"} stages sheet.</p><Link className="button button-primary" href="/uploads?add=project_stages">Import {mushroomMode ? "crop" : "project"} updates <ArrowRight size={13} /></Link><small><ShieldCheck size={12} />Portal edits cannot overwrite {mushroomMode ? "farm" : "factory"} source data.</small></aside>
  </div>;
}

const documentIcons: Record<DocumentCategory, typeof File> = { Drawing: File, "Purchase Order": FileCheck2, "Inspection Report": ShieldCheck, "Quality Document": ShieldCheck, Image: FileImage, Other: File };

function DocumentsView({ project, mushroomMode }: { project: FactoryProject; mushroomMode: boolean }) {
  const categoryCounts = useMemo(() => project.documents.reduce<Partial<Record<DocumentCategory, number>>>((counts, document) => ({ ...counts, [document.category]: (counts[document.category] ?? 0) + 1 }), {}), [project.documents]);
  return <>
    <section className="project-document-summary">{(["Drawing", "Purchase Order", "Inspection Report", "Quality Document", "Image", "Other"] as DocumentCategory[]).map((item) => { const Icon = documentIcons[item]; return <article key={item}><span><Icon size={16} /></span><div><strong>{categoryCounts[item] ?? 0}</strong><small>{item}{(categoryCounts[item] ?? 0) === 1 ? "" : "s"}</small></div></article>; })}</section>
    <div className="project-documents-layout">
      <section className="panel document-list-panel"><header className="project-section-header"><div><span><Files size={16} /></span><div><h2>{mushroomMode ? "Crop" : "Project"} documents</h2><p>{mushroomMode ? "Lab reports, images and references linked by approved crop-stage rows" : "Drawings, inspection reports and references linked by approved project-stage rows"}</p></div></div><small>{project.documents.length} references</small></header><div className="project-document-list"><div className="document-list-heading"><span>File</span><span>Category</span><span>Source owner</span><span>Date</span></div>{project.documents.map((document) => { const Icon = documentIcons[document.category]; return <article key={document.id}><span><i><Icon size={16} /></i><span><strong>{document.name}</strong><small>{document.size}</small></span></span><em>{document.category}</em><span><strong>{document.uploadedBy}</strong></span><time>{new Date(document.uploadedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</time></article>; })}{!project.documents.length && <div className="project-empty"><Files size={24} /><strong>No document references supplied</strong><p>Add {mushroomMode ? "lab-report names, crop images" : "drawing names, inspection reports"} or source links to the {mushroomMode ? "Crop cycle" : "Project"} stages sheet.</p></div>}</div></section>
      <aside className="panel project-upload-card"><span><Upload size={20} /></span><h2>Documents stay at the source</h2><p>Vulcan visualises references from the imported {mushroomMode ? "crop" : "project"}-stage sheet without replacing {mushroomMode ? "farm" : "factory"} documents.</p><Link className="button button-primary" href="/uploads?add=project_stages">Refresh {mushroomMode ? "crop" : "project"} sources <ArrowRight size={13} /></Link><small className="document-trace-note"><ShieldCheck size={12} />Source lineage remains attached to every imported row.</small></aside>
    </div>
  </>;
}

function ProjectInfoStrip({ project, mushroomMode }: { project: FactoryProject; mushroomMode: boolean }) {
  return <section className="project-info-strip">
    <article className="project-progress-ring-card"><div className="project-progress-ring" style={{ background: `conic-gradient(var(--green) ${project.progress * 3.6}deg, #e8ece8 0deg)` }}><span>{project.progress}<small>%</small></span></div><div><small>Overall completion</small><strong>{project.status}</strong><p>{project.stages.filter((stage) => stage.status === "Completed").length} of {project.stages.length} stages complete</p></div></article>
    <article><span><Info size={15} /></span><div><small>{mushroomMode ? "Expected crop value / batch" : "Order value"}</small><strong>{formatProjectValue(project.orderValue)}</strong><p>{project.poNumber}</p></div></article>
    <article><span><CalendarDays size={15} /></span><div><small>{mushroomMode ? "Cycle" : "Project"} start</small><strong>{formatProjectDate(project.startDate)}</strong><p>{mushroomMode ? "Compost loaded" : "PO received"} {formatProjectDate(project.poReceivedDate)}</p></div></article>
    <article><span><Target size={15} /></span><div><small>Expected {mushroomMode ? "harvest" : "delivery"}</small><strong>{formatProjectDate(project.commitmentDate)}</strong><p>{project.deliveryPrediction.state}</p></div></article>
    <article><span><Users size={15} /></span><div><small>Assigned team</small><strong>{project.assignedTeam[0]?.name ?? "Not supplied"}</strong><p>{project.assignedTeam.length > 1 ? `+${project.assignedTeam.length - 1} cross-functional owners` : "From project and stage sources"}</p></div></article>
  </section>;
}

export function ProjectTracker({ projectId }: { projectId: string }) {
  const variant = usePlatform();
  const mushroomMode = false;
  const { getProject } = useProjects();
  const project = getProject(projectId);
  const [activeTab, setActiveTab] = useState<TrackerTab>("Overview");
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  if (!project) return <section className="panel project-not-found"><Info size={28} /><h1>{mushroomMode ? "Crop cycle" : "Project"} not found</h1><p>This {variant.terminology.projectSingular} is not available in the active {variant.terminology.siteSingular} workspace.</p><Link className="button button-primary" href="/projects">Return to {variant.terminology.projectPlural}</Link></section>;
  const selectedStage = selectedStageId ? project.stages.find((stage) => stage.id === selectedStageId) : undefined;
  const currentStage = project.stages.find((stage) => stage.status === "Delayed" || stage.status === "In Progress")
    ?? (project.status === "Completed" ? project.stages.at(-1) : project.stages[0]);

  return <>
    <header className="project-tracker-header">
      <div><div className="project-tracker-meta"><span>{project.projectNumber}</span><i /><span>{project.customer}</span><i /><span>{project.unit}</span></div><h1>{project.name}</h1><div className="project-header-tags"><ProjectState status={project.status} /><span className={`project-priority priority-${project.priority.toLowerCase()}`}><Zap size={12} />{project.priority} priority</span><span><Clock3 size={12} />Updated {new Date(project.updatedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span><span><ShieldCheck size={12} />{project.source.hasStageSheet ? "Project + stage sources" : "Project master source"}</span></div></div>
      <div className="page-actions"><Link className="button button-secondary" href="/uploads?add=projects"><Upload size={14} />Refresh {mushroomMode ? "crop" : "project"} source</Link>{currentStage && <button className="button button-accent" onClick={() => setSelectedStageId(currentStage.id)}>View current stage <ArrowRight size={14} /></button>}</div>
    </header>
    <ProjectInfoStrip project={project} mushroomMode={mushroomMode} />
    <nav className="project-tracker-tabs" aria-label="Project tracker sections">{(["Overview", "Timeline", "Activity", "Documents"] as TrackerTab[]).map((tab) => { const Icon = tab === "Overview" ? Gauge : tab === "Timeline" ? CalendarDays : tab === "Activity" ? History : Files; return <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}><Icon size={15} />{tab}{tab === "Documents" && <span>{project.documents.length}</span>}</button>; })}</nav>
    {activeTab === "Overview" && <TrackerOverview project={project} onEdit={setSelectedStageId} mushroomMode={mushroomMode} />}
    {activeTab === "Timeline" && <TimelineView project={project} onEdit={setSelectedStageId} mushroomMode={mushroomMode} />}
    {activeTab === "Activity" && <ActivityView project={project} mushroomMode={mushroomMode} />}
    {activeTab === "Documents" && <DocumentsView project={project} mushroomMode={mushroomMode} />}
    {selectedStage && <StageDetailsModal project={project} stage={selectedStage} onClose={() => setSelectedStageId(null)} mushroomMode={mushroomMode} />}
  </>;
}

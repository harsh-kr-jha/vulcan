"use client";

import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  FolderKanban,
  IndianRupee,
  PackageCheck,
  Search,
  SlidersHorizontal,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { formatProjectDate, formatProjectValue, type FactoryProject } from "@/lib/project-data";
import { useFactory } from "@/lib/factory-context";
import { useProjects } from "@/lib/project-context";

type ViewFilter = "All" | "Active" | "At risk" | "Completed";

function ProjectStatus({ status }: { status: FactoryProject["status"] }) {
  return <span className={`project-status project-status-${status.toLowerCase().replaceAll(" ", "-")}`}><i />{status}</span>;
}

function ProgressBar({ value, danger = false }: { value: number; danger?: boolean }) {
  return <div className="project-progress"><i><b className={danger ? "danger" : ""} style={{ width: `${value}%` }} /></i><strong>{value}%</strong></div>;
}

export function ProjectsWorkspace() {
  const { projects } = useProjects();
  const { filters, state } = useFactory();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewFilter>("All");
  const [priority, setPriority] = useState("All priorities");

  const filteredProjects = useMemo(() => projects.filter((project) => {
    const searchMatch = `${project.name} ${project.customer} ${project.projectNumber} ${project.poNumber}`.toLowerCase().includes(query.toLowerCase());
    const viewMatch = view === "All"
      || (view === "Active" && ["In Progress", "Not Started"].includes(project.status))
      || (view === "At risk" && (project.status === "Delayed" || project.deliveryPrediction.state !== "On track"))
      || (view === "Completed" && project.status === "Completed");
    const priorityMatch = priority === "All priorities" || project.priority === priority;
    return searchMatch && viewMatch && priorityMatch;
  }), [priority, projects, query, view]);

  const active = projects.filter((project) => project.status !== "Completed").length;
  const atRisk = projects.filter((project) => project.status === "Delayed" || project.deliveryPrediction.state !== "On track").length;
  const totalValue = projects.reduce((total, project) => total + project.orderValue, 0);
  const cycleStart = new Date(`${filters.to}T00:00:00`);
  const cycleEnd = new Date(cycleStart); cycleEnd.setDate(cycleEnd.getDate() + 30);
  const dueSoon = projects.filter((project) => {
    const due = new Date(`${project.customerDueDate}T00:00:00`);
    return project.status !== "Completed" && due >= cycleStart && due <= cycleEnd;
  }).length;
  return <>
    <header className="page-header projects-page-header">
      <div>
        <p className="eyebrow">Customer order execution</p>
        <h1>Projects <span>from PO to dispatch.</span></h1>
        <p className="page-subtitle">One live view of every order, owner, milestone and delivery risk.</p>
      </div>
      <div className="page-actions"><Link className="button button-secondary" href="/uploads?add=project_stages"><UploadCloud size={14} />Import stages</Link><Link className="button button-accent" href="/uploads?add=projects">Import project master <ArrowRight size={14} /></Link></div>
    </header>

    <section className="project-source-note">
      <span><Sparkles size={16} /></span>
      <div><strong>Source-connected project analysis</strong><p>Projects and execution stages come from approved Excel or CSV sources for {state.factories.find((factory) => factory.id === state.activeFactoryId)?.name ?? "this factory"}. Portal screens do not create operational project data.</p></div>
      <small>{projects.length ? "Latest approved rows" : "Awaiting project source"}</small>
    </section>

    <section className="project-summary-grid" aria-label="Project summary">
      <article><span><FolderKanban size={17} /></span><div><small>Active projects</small><strong>{active}</strong><p>{projects.length} total customer orders</p></div></article>
      <article><span className="project-icon-danger"><AlertTriangle size={17} /></span><div><small>At-risk projects</small><strong>{atRisk}</strong><p>Need recovery decisions</p></div></article>
      <article><span><CalendarClock size={17} /></span><div><small>Due in next 30 days</small><strong>{dueSoon}</strong><p>From the selected end date</p></div></article>
      <article><span><IndianRupee size={17} /></span><div><small>Tracked order value</small><strong>{formatProjectValue(totalValue)}</strong><p>Across this portfolio</p></div></article>
    </section>

    <section className="panel project-list-panel">
      <header className="project-list-toolbar">
        <div className="project-view-tabs" aria-label="Project views">
          {(["All", "Active", "At risk", "Completed"] as ViewFilter[]).map((item) => <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{item}{item === "At risk" && atRisk > 0 && <span>{atRisk}</span>}</button>)}
        </div>
        <div className="project-list-filters">
          <label className="project-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search project, customer or PO" aria-label="Search projects" /></label>
          <label className="project-priority-filter"><SlidersHorizontal size={14} /><select value={priority} onChange={(event) => setPriority(event.target.value)} aria-label="Filter by priority"><option>All priorities</option><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></label>
        </div>
      </header>

      <div className="project-list-heading" aria-hidden="true"><span>Project</span><span>Status</span><span>Progress</span><span>Current operation</span><span>Commitment</span><span /></div>
      <div className="project-list">
        {filteredProjects.map((project) => {
          const currentStage = project.stages.find((stage) => stage.status === "Delayed" || stage.status === "In Progress")
            ?? (project.status === "Completed" ? project.stages.at(-1) : project.stages[0]);
          const danger = project.status === "Delayed" || project.deliveryPrediction.state !== "On track";
          return <Link className="project-list-row" href={`/projects/${project.id}`} key={project.id}>
            <div className="project-list-identity"><span className={`project-priority-mark priority-${project.priority.toLowerCase()}`} /><div><small>{project.projectNumber} · {project.unit}</small><strong>{project.name}</strong><p>{project.customer} · {project.quantity} {project.uom} · {project.poNumber}</p></div></div>
            <div><ProjectStatus status={project.status} /><small className={`priority-copy priority-${project.priority.toLowerCase()}`}>{project.priority} priority</small></div>
            <ProgressBar value={project.progress} danger={danger} />
            <div className="project-current-stage">{project.status === "Completed" ? <CheckCircle2 size={15} /> : danger ? <AlertTriangle size={15} /> : <CircleDot size={15} />}<span><strong>{currentStage?.name}</strong><small>{currentStage?.assignedTo}</small></span></div>
            <div className="project-due"><strong>{formatProjectDate(project.commitmentDate)}</strong><small className={danger ? "text-danger" : ""}>{project.deliveryPrediction.state} · {project.deliveryPrediction.confidence}% confidence</small></div>
            <span className="project-open"><ArrowRight size={16} /></span>
          </Link>;
        })}
        {!filteredProjects.length && <div className="project-empty"><PackageCheck size={28} /><strong>{projects.length ? "No projects match this view" : "No approved project source"}</strong><p>{projects.length ? "Change the search or filters to see other customer orders." : "Import the Project master sheet to populate this factory portfolio."}</p>{!projects.length && <Link className="button button-primary" href="/uploads?add=projects">Import project master <ArrowRight size={13} /></Link>}</div>}
      </div>
    </section>
  </>;
}

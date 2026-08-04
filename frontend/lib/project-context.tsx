"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import {
  initialProjects,
  type DocumentCategory,
  type FactoryProject,
  type ProjectActivity,
  type ProjectDocument,
  type ProjectStage,
} from "@/lib/project-data";

const STORAGE_KEY = "vulcan-project-tracker-v4";

interface ProjectContextValue {
  projects: FactoryProject[];
  getProject: (projectId: string) => FactoryProject | undefined;
  updateStage: (projectId: string, stageId: string, patch: Partial<ProjectStage>) => void;
  addStage: (projectId: string, name: string) => void;
  moveStage: (projectId: string, stageId: string, direction: -1 | 1) => void;
  addComment: (projectId: string, comment: string) => void;
  addDocuments: (projectId: string, files: File[], category: DocumentCategory) => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function newActivity(type: ProjectActivity["type"], title: string, detail: string): ProjectActivity {
  return { id: makeId("activity"), type, title, detail, user: "Factory team", timestamp: new Date().toISOString() };
}

function fileSize(bytes: number) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} B`;
}

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<FactoryProject[]>(initialProjects);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const restoreDraft = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) setProjects(JSON.parse(saved) as FactoryProject[]);
      } catch {
        // A damaged local draft should never prevent the factory workspace loading.
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(restoreDraft);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  }, [hydrated, projects]);

  function updateStage(projectId: string, stageId: string, patch: Partial<ProjectStage>) {
    setProjects((current) => current.map((project) => {
      if (project.id !== projectId) return project;
      const previous = project.stages.find((stage) => stage.id === stageId);
      if (!previous) return project;
      const stages = project.stages.map((stage) => stage.id === stageId ? { ...stage, ...patch } : stage);
      const progress = Math.round(stages.reduce((total, stage) => total + stage.progress, 0) / Math.max(stages.length, 1));
      const completed = stages.every((stage) => stage.status === "Completed");
      const delayed = stages.some((stage) => stage.status === "Delayed");
      const status = completed ? "Completed" : delayed ? "Delayed" : progress > 0 ? "In Progress" : "Not Started";
      const changes = [
        patch.status && patch.status !== previous.status ? `status changed to ${patch.status.toLowerCase()}` : null,
        patch.progress !== undefined && patch.progress !== previous.progress ? `progress set to ${patch.progress}%` : null,
        patch.assignedTo && patch.assignedTo !== previous.assignedTo ? `assigned to ${patch.assignedTo}` : null,
      ].filter(Boolean).join(" · ");
      return {
        ...project,
        stages,
        progress,
        status,
        updatedAt: new Date().toISOString(),
        activities: [newActivity("stage", `${previous.name} updated`, changes || "Dates, notes or attachments were updated."), ...project.activities],
      };
    }));
  }

  function addStage(projectId: string, name: string) {
    const cleanName = name.trim();
    if (!cleanName) return;
    setProjects((current) => current.map((project) => {
      if (project.id !== projectId) return project;
      const lastStage = project.stages.at(-1);
      const plannedStart = lastStage?.plannedCompletion ?? project.startDate;
      const stage: ProjectStage = {
        id: makeId("stage"),
        name: cleanName,
        status: "Not Started",
        progress: 0,
        plannedStart,
        actualStart: null,
        plannedCompletion: plannedStart,
        actualCompletion: null,
        assignedTo: "Unassigned",
        delayDays: 0,
        notes: "Custom workflow stage. Add the production requirements before release.",
        attachments: [],
      };
      const stages = [...project.stages, stage];
      const progress = Math.round(stages.reduce((total, item) => total + item.progress, 0) / stages.length);
      return { ...project, stages, progress, activities: [newActivity("workflow", `${cleanName} added`, "The project workflow was customized for this order."), ...project.activities] };
    }));
  }

  function moveStage(projectId: string, stageId: string, direction: -1 | 1) {
    setProjects((current) => current.map((project) => {
      if (project.id !== projectId) return project;
      const index = project.stages.findIndex((stage) => stage.id === stageId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= project.stages.length || project.stages[index].name === "Raw Material Delivery" || target === 0) return project;
      const stages = [...project.stages];
      [stages[index], stages[target]] = [stages[target], stages[index]];
      return { ...project, stages, activities: [newActivity("workflow", "Workflow sequence changed", `${stages[target].name} was moved in the execution sequence.`), ...project.activities] };
    }));
  }

  function addComment(projectId: string, comment: string) {
    const cleanComment = comment.trim();
    if (!cleanComment) return;
    setProjects((current) => current.map((project) => project.id === projectId
      ? { ...project, activities: [newActivity("comment", "Comment added", cleanComment), ...project.activities], updatedAt: new Date().toISOString() }
      : project));
  }

  function addDocuments(projectId: string, files: File[], category: DocumentCategory) {
    if (!files.length) return;
    const uploadedAt = new Date().toISOString();
    const documents: ProjectDocument[] = files.map((file) => ({
      id: makeId("document"),
      name: file.name,
      category,
      size: fileSize(file.size),
      uploadedBy: "Factory team",
      uploadedAt,
    }));
    setProjects((current) => current.map((project) => project.id === projectId
      ? {
          ...project,
          documents: [...documents, ...project.documents],
          activities: [newActivity("document", `${documents.length} document${documents.length === 1 ? "" : "s"} added`, documents.map((document) => document.name).join(", ")), ...project.activities],
          updatedAt: uploadedAt,
        }
      : project));
  }

  const value = useMemo<ProjectContextValue>(() => ({
    projects,
    getProject: (projectId) => projects.find((project) => project.id === projectId),
    updateStage,
    addStage,
    moveStage,
    addComment,
    addDocuments,
  }), [projects]);

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProjects() {
  const context = useContext(ProjectContext);
  if (!context) throw new Error("useProjects must be used inside ProjectProvider");
  return context;
}

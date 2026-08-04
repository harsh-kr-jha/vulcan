"use client";

import { createContext, useContext, useMemo } from "react";

import { useFactory } from "@/lib/factory-context";
import type { FactoryProject } from "@/lib/project-data";

interface ProjectContextValue {
  projects: FactoryProject[];
  getProject: (projectId: string) => FactoryProject | undefined;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { intelligence } = useFactory();
  const projects = intelligence.projects;
  const value = useMemo<ProjectContextValue>(() => ({
    projects,
    getProject: (projectId) => projects.find((project) => project.id === projectId),
  }), [projects]);

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProjects() {
  const context = useContext(ProjectContext);
  if (!context) throw new Error("useProjects must be used inside ProjectProvider");
  return context;
}

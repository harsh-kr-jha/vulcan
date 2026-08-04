import { PageBack } from "@/components/page-back";
import { ProjectTracker } from "@/components/project-tracker";

export default async function ProjectTrackerPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <><PageBack fallback="/projects" label="All projects" /><ProjectTracker projectId={projectId} /></>;
}

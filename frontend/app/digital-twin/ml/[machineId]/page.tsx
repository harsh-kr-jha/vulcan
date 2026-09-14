import { MachineML } from "@/components/machine-ml";

export default async function MachineMLPage({ params }: { params: Promise<{ machineId: string }> }) {
  const { machineId } = await params;
  return <MachineML machineId={machineId} />;
}

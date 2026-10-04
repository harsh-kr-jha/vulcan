import { DataInputManager } from "@/components/data-input-manager";

type DataPageProps = {
  searchParams: Promise<{ tab?: string; machine?: string }>;
};

export default async function DataPage({ searchParams }: DataPageProps) {
  const { tab, machine } = await searchParams;
  const initialTab = tab === "files" || tab === "streams" ? tab : "manage";
  return <DataInputManager initialTab={initialTab} focusedMachineId={machine} />;
}

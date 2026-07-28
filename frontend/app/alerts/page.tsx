import { AlertsWorkspace } from "@/components/alerts-workspace";
import { getAlerts } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  return <AlertsWorkspace initialAlerts={await getAlerts()} />;
}

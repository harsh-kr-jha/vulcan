import { DashboardOverview } from "@/components/dashboard-overview";
import { getAlerts, getDashboardSummary } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [summary, dashboardAlerts] = await Promise.all([
    getDashboardSummary(),
    getAlerts(),
  ]);

  return <DashboardOverview {...summary} alerts={dashboardAlerts} />;
}

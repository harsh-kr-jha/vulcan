import { IonLanding } from "@/components/ion-landing";
import { safeNextPath } from "@/lib/auth-paths";

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const candidate = Array.isArray(params.next) ? params.next[0] : params.next;
  return <IonLanding nextPath={safeNextPath(candidate)} />;
}

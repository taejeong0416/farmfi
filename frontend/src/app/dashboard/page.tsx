import { DashboardShell } from "@/components/FarmFi";

export default function DashboardPage({
  searchParams,
}: {
  searchParams: { projectId?: string };
}) {
  return <DashboardShell projectId={searchParams.projectId} />;
}

import { DashboardShell } from "@/components/FarmFi";

export default function DashboardPage({
  searchParams,
}: {
  searchParams: { projectId?: string };
}) {
  return (
    <main>
      <DashboardShell projectId={searchParams.projectId} />
    </main>
  );
}

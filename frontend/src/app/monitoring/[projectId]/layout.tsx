import { requireProjectPage } from "@/lib/page-guard";

export default async function MonitoringLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ projectId: string }> }>) {
  const { projectId } = await params;
  await requireProjectPage("/operator", projectId);
  return <>{children}</>;
}

import { ProjectDetail } from "@/components/farmfi/project/ProjectDetail";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectDetail projectId={id} />;
}

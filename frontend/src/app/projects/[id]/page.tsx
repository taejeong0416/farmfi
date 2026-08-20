import { ProjectDetailScreen } from "@/components/screens/investor/ProjectDetailScreen";

export const metadata = { title: "프로젝트 상세 | FarmFi" };

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectDetailScreen id={id} />;
}

import { ProjectDetail } from "@/components/FarmFi";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="page" style={{ paddingTop: 40, paddingBottom: 64 }}>
      <ProjectDetail id={id} />
    </main>
  );
}

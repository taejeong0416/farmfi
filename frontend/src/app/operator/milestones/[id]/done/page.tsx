import { ExecutionDoneScreen } from "@/components/screens/operator/ExecutionDoneScreen";

export const metadata = { title: "마일스톤 집행 완료 | FarmFi" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExecutionDoneScreen milestoneId={id} />;
}

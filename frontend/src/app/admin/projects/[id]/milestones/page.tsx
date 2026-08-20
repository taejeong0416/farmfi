import { MilestoneSetupScreen } from "@/components/screens/admin/MilestoneSetupScreen";

export const metadata = { title: "마일스톤 설정 | FarmFi" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MilestoneSetupScreen projectId={id} />;
}

import { EvidenceSubmitScreen } from "@/components/screens/operator/EvidenceSubmitScreen";

export const metadata = { title: "증빙 제출 | FarmFi" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EvidenceSubmitScreen milestoneId={id} />;
}

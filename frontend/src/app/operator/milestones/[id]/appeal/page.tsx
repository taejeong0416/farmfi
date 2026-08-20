import { AppealScreen } from "@/components/screens/operator/AppealScreen";

export const metadata = { title: "증빙 보완 · 이의제기 | FarmFi" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AppealScreen milestoneId={id} />;
}

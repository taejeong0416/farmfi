import { PayoutDetailScreen } from "@/components/screens/investor/PayoutDetailScreen";

export const metadata = { title: "투자금 회수 상세 | FarmFi" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PayoutDetailScreen id={id} />;
}

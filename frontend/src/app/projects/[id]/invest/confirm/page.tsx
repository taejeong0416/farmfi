import { Suspense } from "react";
import { InvestConfirmScreen } from "@/components/screens/investor/InvestConfirmScreen";

export const metadata = { title: "최종 확인 · 전자서명 | FarmFi" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense>
      <InvestConfirmScreen projectId={id} />
    </Suspense>
  );
}

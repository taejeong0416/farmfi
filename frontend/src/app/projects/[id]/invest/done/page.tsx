import { Suspense } from "react";
import { InvestDoneScreen } from "@/components/screens/investor/InvestDoneScreen";

export const metadata = { title: "투자 신청 완료 | FarmFi" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense>
      <InvestDoneScreen projectId={id} />
    </Suspense>
  );
}

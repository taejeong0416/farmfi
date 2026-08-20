import { Suspense } from "react";
import { InvestEligibilityScreen } from "@/components/screens/investor/InvestEligibilityScreen";

export const metadata = { title: "투자 적합성 확인 | FarmFi" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense>
      <InvestEligibilityScreen projectId={id} />
    </Suspense>
  );
}

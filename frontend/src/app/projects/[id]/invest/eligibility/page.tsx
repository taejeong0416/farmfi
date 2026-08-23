import { Suspense } from "react";
import { InvestEligibilityScreen } from "@/components/screens/investor/InvestEligibilityScreen";
import { ProjectDetailScreen } from "@/components/screens/investor/ProjectDetailScreen";

export const metadata = { title: "투자 적합성 확인 | FarmFi" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // `.fig` I-02는 프로젝트 상세 위에 뜨는 모달이다. 뒤가 비어 있으면
  // 닫았을 때 볼 것이 없고, 투자 금액이 어디서 왔는지도 보이지 않는다.
  return (
    <>
      <ProjectDetailScreen id={id} />
      <Suspense>
        <InvestEligibilityScreen projectId={id} />
      </Suspense>
    </>
  );
}

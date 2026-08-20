import { PageHeading, Shell } from "@/components/ui";
import { SpaceForm } from "@/components/farmfi/space/SpaceForm";

export const metadata = { title: "유휴공간 등록 | FarmFi" };

export default function SpacePage() {
  return (
    <Shell className="max-w-panel">
      <PageHeading
        eyebrow="공간 제공자"
        title="유휴공간 등록하기"
        desc="쓰지 않는 옥상, 빈 점포, 실내 유휴공간을 등록하면 스마트팜 적합도와 예상 임대 수익을 계산해 드립니다."
      />
      <SpaceForm />
    </Shell>
  );
}

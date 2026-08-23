"use client";

import { AuthShell, Button, StepList } from "@/components/ui";

export function VerifyDoneScreen() {
  return (
    <AuthShell>
      <h1 className="text-20 font-bold text-ink">투자 준비 완료</h1>

      <div className="mt-8">
        <StepList
          items={[
            {
              title: "투자금이 쓰인 과정을 확인할 수 있어요",
              desc: "계약부터 개점까지 진행 상황과 사용 내역을 차례대로 공개해요.",
              state: "done",
            },
            {
              title: "프로젝트 진행 자료를 함께 확인해요",
              desc: "계약서·설비 설치 사진·검수 결과를 프로젝트 화면에서 볼 수 있어요.",
              state: "done",
            },
            {
              title: "운영 결과에 따라 회수액이 달라질 수 있어요",
              desc: "운영비 반영 후 매출에 따라 회수액이 달라지며, 원금은 보장되지 않습니다.",
              state: "done",
            },
          ]}
        />
      </div>

      <div className="mt-8">
        <Button full href="/projects">
          프로젝트 둘러보기
        </Button>
      </div>
    </AuthShell>
  );
}

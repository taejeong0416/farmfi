"use client";

import { StepLine, type Step } from "@/components/ui";

const STEPS = [
  { key: "pickup", label: "픽업 지점", href: "/subscribe" },
  { key: "plan", label: "팩 크기", href: "/subscribe/plan" },
  { key: "compose", label: "구성 선택", href: "/subscribe/compose" },
  { key: "order", label: "주문·결제", href: "/subscribe/order" },
  { key: "done", label: "완료", href: "/subscribe/done" },
] as const;

export type SubscribeStepKey = (typeof STEPS)[number]["key"];

export function SubscribeStepLine({ current }: { current: SubscribeStepKey }) {
  const index = STEPS.findIndex((s) => s.key === current);
  // 끝낸 단계는 눌러서 되돌아간다. 완료 화면에서는 신청값이 이미 비워져 돌아갈 곳이 없다.
  const canGoBack = current !== "done";
  const steps: Step[] = STEPS.map((s, i) => ({
    label: s.label,
    state: i === index ? "current" : i < index ? "done" : "todo",
    href: canGoBack && i < index ? s.href : undefined,
  }));

  return (
    <div className="mb-8">
      <StepLine steps={steps} />
    </div>
  );
}

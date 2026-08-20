"use client";

import { StepLine, type Step } from "@/components/ui";

const STEPS = [
  { key: "pickup", label: "픽업 지점" },
  { key: "plan", label: "팩 크기" },
  { key: "compose", label: "구성 선택" },
  { key: "order", label: "주문·결제" },
  { key: "done", label: "완료" },
] as const;

export type SubscribeStepKey = (typeof STEPS)[number]["key"];

export function SubscribeStepLine({ current }: { current: SubscribeStepKey }) {
  const index = STEPS.findIndex((s) => s.key === current);
  const steps: Step[] = STEPS.map((s, i) => ({
    label: s.label,
    state: i === index ? "current" : i < index ? "done" : "todo",
  }));

  return (
    <div className="mb-8">
      <StepLine steps={steps} />
    </div>
  );
}

"use client";

import { StepLine, type Step } from "@/components/ui";
import type { OperatorApplication } from "../api";

const STEPS = [
  { key: "docs", label: "자격·서류" },
  { key: "visit", label: "현장 방문" },
  { key: "education", label: "필수 교육" },
  { key: "confirm", label: "공간 확정" },
  { key: "contract", label: "계약 서명" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

/** 운영 신청 5단계 중 현재 위치. 각 화면 상단에서 같은 형태로 쓴다. */
export function ApplyStepLine({
  application,
  current,
}: {
  application: OperatorApplication | null;
  current: StepKey;
}) {
  const done: Record<StepKey, boolean> = {
    docs: Boolean(application && application.documents.length > 0),
    visit: Boolean(application?.visitAt),
    education: Boolean(application?.educationDoneAt),
    confirm: Boolean(application?.confirmedAt),
    contract: Boolean(application?.contractSignedAt),
  };

  const steps: Step[] = STEPS.map((s) => ({
    label: s.label,
    state:
      s.key === current ? "current" : done[s.key] ? "done" : "todo",
  }));

  const index = STEPS.findIndex((s) => s.key === current) + 1;

  return (
    <div className="mb-7">
      <p className="mb-4 text-13 font-medium text-brand">
        운영 신청 {index} / {STEPS.length}
      </p>
      <StepLine steps={steps} />
    </div>
  );
}

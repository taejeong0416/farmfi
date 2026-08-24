"use client";

import Link from "next/link";
import { StepLine, type Step } from "@/components/ui";
import type { OperatorApplication } from "../api";

const STEPS = [
  { key: "docs", label: "자격·서류", href: "/operator/apply" },
  { key: "visit", label: "현장 방문", href: "/operator/apply/visit" },
  { key: "education", label: "필수 교육", href: "/operator/apply/education" },
  { key: "confirm", label: "공간 확정", href: "/operator/apply/confirm" },
  { key: "contract", label: "계약 서명", href: "/operator/apply/contract" },
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

  // 끝낸 단계는 눌러서 돌아갈 수 있다. 방문 일정을 바꾸거나 교육을 다시 보려면
  // 앞으로만 가는 흐름으로는 방법이 없다.
  const steps: Step[] = STEPS.map((s) => ({
    label: s.label,
    state: s.key === current ? "current" : done[s.key] ? "done" : "todo",
    href: s.key !== current && done[s.key] ? s.href : undefined,
  }));

  const index = STEPS.findIndex((s) => s.key === current) + 1;
  const prev = STEPS[index - 2];

  return (
    <div className="mb-7">
      {/* `.fig` O-03~O-07 공통 — 단계선 위에 자동 저장 표시, 아래에 이전 단계. */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-13 font-medium text-brand">
          운영 신청 {index} / {STEPS.length}
        </p>
        <span className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1.5">
          <span className="text-11 font-medium text-brand">✓ 자동 저장됨</span>
          <span className="text-12 text-body">방금 전</span>
        </span>
      </div>
      <StepLine steps={steps} />
      {prev ? (
        <Link
          href={prev.href}
          className="mt-4 inline-block text-13 font-medium text-ink"
        >
          ← 이전 단계
        </Link>
      ) : null}
    </div>
  );
}

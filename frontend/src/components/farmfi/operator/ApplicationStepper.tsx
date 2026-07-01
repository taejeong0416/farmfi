import type { OperatorApplicationStatus } from "./api";

// Same 5-stage order/labels the static preview on /operator already used,
// now driven by the real OperatorApplication.status column.
const STEPS: { key: OperatorApplicationStatus; label: string }[] = [
  { key: "applied", label: "지원서 제출" },
  { key: "docs", label: "서류/인터뷰" },
  { key: "education", label: "운영 교육" },
  { key: "matched", label: "공간 매칭" },
  { key: "operating", label: "운영 시작" },
];

/** 5-stage milestone stepper for an operator's join-flow progress — reuses the shared `.stepline` class. */
export function ApplicationStepper({ status }: { status: OperatorApplicationStatus }) {
  const currentIndex = STEPS.findIndex((step) => step.key === status);

  return (
    <div className="stepline" role="list" aria-label="운영 파트너 합류 절차">
      {STEPS.map((step, i) => {
        const isDone = currentIndex >= 0 && i < currentIndex;
        const isActive = i === currentIndex;
        const stateClass = isDone ? "is-done" : isActive ? "is-active" : "";
        return (
          <span
            className={`step ${stateClass}`.trim()}
            key={step.key}
            role="listitem"
            aria-current={isActive ? "step" : undefined}
          >
            {isDone ? "✓ " : `0${i + 1} · `}
            {step.label}
          </span>
        );
      })}
    </div>
  );
}

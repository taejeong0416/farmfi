"use client";

import { Icon } from "../ui/Icon";
import type { IdentityStatus } from "./types";

export type IdentityFlowStage = "idle" | IdentityStatus;

type StepVisualState = "done" | "active" | "upcoming" | "failed";

const STEPS: { title: string; desc: string; icon: string }[] = [
  {
    title: "① 모바일 신분증 인증",
    desc: "본인 명의 모바일 신분증으로 인증을 시작해요.",
    icon: "shield",
  },
  {
    title: "② 진본성 검증",
    desc: "제출된 정보가 진짜인지 확인하고 있어요.",
    icon: "check",
  },
  {
    title: "③ 자격 판별·승인",
    desc: "실명·연령을 확인하면 투자 한도가 늘어나요.",
    icon: "coin",
  },
];

// stage → 진행 중인 단계 번호(1~3). idle은 아직 아무 단계도 시작하지 않은 상태.
const STAGE_STEP_NUMBER: Record<IdentityFlowStage, number> = {
  idle: 0,
  pending: 1,
  submitted: 2,
  verified: 3,
  failed: 1,
};

function stepVisualState(stage: IdentityFlowStage, stepNumber: number): StepVisualState {
  const current = STAGE_STEP_NUMBER[stage];
  if (stage === "verified") return "done";
  if (stage === "failed") {
    if (stepNumber < current) return "done";
    if (stepNumber === current) return "failed";
    return "upcoming";
  }
  if (stepNumber < current) return "done";
  if (stepNumber === current) return "active";
  return "upcoming";
}

function StepIcon({ state, icon }: { state: StepVisualState; icon: string }) {
  if (state === "active") {
    return (
      <span
        aria-hidden="true"
        className="icon"
        style={{
          border: "2px solid var(--green-600)",
          borderTopColor: "transparent",
          animation: "farmfi-identity-spin 0.8s linear infinite",
        }}
      />
    );
  }
  if (state === "done") {
    return (
      <span
        aria-hidden="true"
        className="icon"
        style={{ background: "var(--green-700)", borderColor: "var(--green-700)", color: "#fff" }}
      >
        ✓
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span
        aria-hidden="true"
        className="icon"
        style={{ background: "#c0392b", borderColor: "#c0392b", color: "#fff" }}
      >
        ✕
      </span>
    );
  }
  return (
    <span className="icon">
      <Icon name={icon} />
    </span>
  );
}

/** PPT의 "①모바일 신분증 인증 → ②진본성 검증 → ③자격 판별·승인" 3단계를 시각화. */
export function IdentityStepper({ stage }: { stage: IdentityFlowStage }) {
  return (
    <div className="card flow" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
      <style>{`@keyframes farmfi-identity-spin { to { transform: rotate(360deg); } }`}</style>
      {STEPS.map((step, index) => {
        const stepNumber = index + 1;
        const state = stepVisualState(stage, stepNumber);
        return (
          <div className="flow-step" key={step.title}>
            <StepIcon state={state} icon={step.icon} />
            <h3>{step.title}</h3>
            <p className="muted">{step.desc}</p>
          </div>
        );
      })}
    </div>
  );
}

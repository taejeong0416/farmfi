"use client";

import type { DemoStepResponse } from "./demoStepUtils";
import { stepPassed } from "./demoStepUtils";

export interface DemoStepMeta {
  step: number;
  title: string;
  subtitle: string;
}

export const DEMO_STEPS: DemoStepMeta[] = [
  { step: 1, title: "김민수 청약", subtitle: "500구좌 · 5,000,000원" },
  { step: 2, title: "이서연 청약", subtitle: "250구좌 · 2,500,000원" },
  { step: 3, title: "박준혁 청약", subtitle: "1,000구좌 · 10,000,000원" },
  { step: 4, title: "마일스톤 1 · 공간 준비", subtitle: "계약서+영수증+사진 검증 → 35% 해제" },
  { step: 5, title: "마일스톤 2 · 시운전+안정성", subtitle: "IoT 14일 가동률 검증 → 30% 해제" },
  { step: 6, title: "마일스톤 3 · 첫 수확+판매", subtitle: "사진+영수증 검증 → 20% 해제" },
  { step: 7, title: "월 정산 + 배당", subtitle: "매출 2,970,000원 기준 워터폴 분배" },
  { step: 8, title: "마일스톤 4 · 지속 운영", subtitle: "IoT 60일+영수증 검증 → 15% 해제" },
];

function StatusDot({
  done,
  passed,
  loading,
}: {
  done: boolean;
  passed: boolean | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <span
        aria-hidden="true"
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          border: "2px solid var(--green-600)",
          borderTopColor: "transparent",
          animation: "farmfi-spin 0.8s linear infinite",
          flex: "0 0 auto",
        }}
      />
    );
  }
  if (!done) {
    return (
      <span
        aria-hidden="true"
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          border: "1px solid var(--line)",
          background: "#fff",
          flex: "0 0 auto",
        }}
      />
    );
  }
  const ok = passed !== false;
  return (
    <span
      aria-hidden="true"
      style={{
        width: 22,
        height: 22,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        color: "#fff",
        fontSize: 12,
        fontWeight: 900,
        background: ok ? "var(--green-700)" : "#c0392b",
        flex: "0 0 auto",
      }}
    >
      {ok ? "✓" : "✕"}
    </span>
  );
}

export function StepList({
  results,
  currentStep,
  loadingStep,
}: {
  results: Record<number, DemoStepResponse>;
  currentStep: number;
  loadingStep: number | null;
}) {
  return (
    <div className="card" style={{ padding: 10 }}>
      <style>{`@keyframes farmfi-spin { to { transform: rotate(360deg); } }`}</style>
      {DEMO_STEPS.map((meta) => {
        const entry = results[meta.step];
        const done = !!entry;
        const passed = done ? stepPassed(meta.step, entry.result) : null;
        const isLoading = loadingStep === meta.step;
        const isNext = !done && meta.step === currentStep + 1;

        return (
          <div
            key={meta.step}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 10px",
              borderRadius: 8,
              background: isNext ? "var(--green-50)" : "transparent",
            }}
          >
            <StatusDot done={done} passed={passed} loading={isLoading} />
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: 800, fontSize: 14 }}>
                STEP {meta.step} · {meta.title}
              </p>
              <p className="muted" style={{ marginTop: 2 }}>
                {meta.subtitle}
              </p>
              {entry?.fromCache ? (
                <span className="badge" style={{ marginTop: 6 }}>
                  캐시
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

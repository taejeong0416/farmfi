"use client";

import { Metric } from "@/components/FarmFi";
import { formatKRW } from "@/lib/format";
import {
  computeSummary,
  stepHeadline,
  stepPassed,
  type DemoStepResponse,
} from "./demoStepUtils";
import { DEMO_STEPS } from "./StepList";

const TOTAL_CAPEX = 17_500_000; // 시드 기준값 (docs/api-spec.md) — 펀딩/해제 진행률 분모

export function StateMirror({
  results,
  currentStep,
}: {
  results: Record<number, DemoStepResponse>;
  currentStep: number;
}) {
  const summary = computeSummary(results);
  const fundingPct = Math.min(100, (summary.invested / TOTAL_CAPEX) * 100);
  const releasedPct = Math.min(100, (summary.released / TOTAL_CAPEX) * 100);
  const isComplete = currentStep >= 8;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="card" style={{ padding: 18 }}>
        <h3>실시간 상태 미러</h3>
        <div style={{ marginTop: 16 }}>
          <p className="muted">펀딩 진행률 · {fundingPct.toFixed(1)}%</p>
          <div className="progress" style={{ marginTop: 6 }}>
            <span className="bar" style={{ width: `${fundingPct}%` }} />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <p className="muted">에스크로 해제율 · {releasedPct.toFixed(1)}%</p>
          <div className="progress" style={{ marginTop: 6 }}>
            <span className="bar" style={{ width: `${releasedPct}%` }} />
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <h3>스텝별 결과</h3>
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          {DEMO_STEPS.map((meta) => {
            const entry = results[meta.step];
            if (!entry) {
              return (
                <p key={meta.step} className="muted">
                  STEP {meta.step} · 대기 중
                </p>
              );
            }
            const passed = stepPassed(meta.step, entry.result);
            return (
              <p key={meta.step} style={{ fontSize: 13 }}>
                <b style={{ color: passed ? "var(--green-800)" : "#c0392b" }}>
                  STEP {meta.step}
                </b>{" "}
                · {stepHeadline(meta.step, entry.result)}
              </p>
            );
          })}
        </div>
      </div>

      {isComplete ? (
        <div className="card" style={{ padding: 18 }}>
          <h3>최종 요약</h3>
          <div className="stats-grid" style={{ marginTop: 16, gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
            <Metric label="총 투자액" value={formatKRW(summary.invested)} />
            <Metric label="총 해제액" value={formatKRW(summary.released)} />
            <Metric label="총 배당액" value={formatKRW(summary.totalDividend)} />
            <Metric label="수익률 (배당 기준)" value={`${summary.returnRate.toFixed(2)}%`} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

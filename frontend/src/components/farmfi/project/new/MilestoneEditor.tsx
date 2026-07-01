"use client";

import { Field } from "@/components/FarmFi";
import { SIGNAL_OPTIONS, type MilestoneDraft, type SignalCode } from "./types";

// SpaceForm.tsx의 SegGroup/ToggleChip과 동일한 인라인 스타일 관례를 따른다
// (globals.css는 이 Phase에서 편집 금지이므로 활성/비활성 표시는 인라인 스타일로).
const ACTIVE_CHIP_STYLE = {
  borderColor: "#72aa86",
  background: "#f0f8f3",
  color: "var(--green-800)",
  cursor: "pointer",
} as const;
const INACTIVE_CHIP_STYLE = { cursor: "pointer" } as const;

export function MilestoneEditor({
  milestone,
  onChange,
}: {
  milestone: MilestoneDraft;
  onChange: (patch: Partial<MilestoneDraft>) => void;
}) {
  const toggleSignal = (code: SignalCode) => {
    const active = milestone.requiredSignals.includes(code);
    const next = active
      ? milestone.requiredSignals.filter((c) => c !== code)
      : [...milestone.requiredSignals, code];
    onChange({ requiredSignals: next });
  };

  const showIot = milestone.requiredSignals.includes("iot");

  return (
    <article className="card" style={{ padding: 20 }}>
      <h3 style={{ display: "flex", alignItems: "center", gap: 10 }}>
        M{milestone.seq} · {milestone.name || `${milestone.seq}단계`}
        <span className="badge" style={{ fontSize: 11 }}>
          {milestone.releasePct}%
        </span>
      </h3>
      <div className="field-grid" style={{ marginTop: 16 }}>
        <Field
          label="마일스톤명"
          control={
            <input
              className="fake-control"
              style={{ width: "100%", font: "inherit" }}
              placeholder={`예: M${milestone.seq} 단계 이름`}
              value={milestone.name}
              onChange={(e) => onChange({ name: e.target.value })}
            />
          }
        />
        <Field
          label="내용"
          control={
            <textarea
              className="fake-control"
              style={{ width: "100%", font: "inherit", minHeight: 60, resize: "vertical" }}
              placeholder="이 단계에서 무엇을 하는지 설명해주세요"
              value={milestone.description}
              onChange={(e) => onChange({ description: e.target.value })}
            />
          }
        />
        <Field
          label="집행 비율"
          control={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number"
                min={1}
                max={100}
                className="fake-control"
                style={{ width: 90, font: "inherit" }}
                value={milestone.releasePct}
                onChange={(e) =>
                  onChange({ releasePct: e.target.value === "" ? 0 : Number(e.target.value) })
                }
              />
              <span className="muted">% (4단계 합계 100%가 되면 자금 집행 계획이 완성돼요)</span>
            </div>
          }
        />
        <Field
          label="검증 조건"
          control={
            <input
              className="fake-control"
              style={{ width: "100%", font: "inherit" }}
              placeholder="예: 임대차 계약서, 설비 구매 영수증 제출"
              value={milestone.conditionText}
              onChange={(e) => onChange({ conditionText: e.target.value })}
            />
          }
        />
        <Field
          label="검증 신호"
          control={
            <div className="seg" role="group" aria-label="검증 신호 선택">
              {SIGNAL_OPTIONS.map((option) => {
                const active = milestone.requiredSignals.includes(option.code);
                return (
                  <span
                    key={option.code}
                    role="checkbox"
                    aria-checked={active}
                    tabIndex={0}
                    style={active ? ACTIVE_CHIP_STYLE : INACTIVE_CHIP_STYLE}
                    onClick={() => toggleSignal(option.code)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleSignal(option.code);
                      }
                    }}
                  >
                    {option.label}
                  </span>
                );
              })}
            </div>
          }
        />
        {showIot && (
          <Field
            label="IoT 최소 가동일수"
            control={
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="number"
                  min={1}
                  className="fake-control"
                  style={{ width: 90, font: "inherit" }}
                  value={milestone.iotMinDays}
                  onChange={(e) =>
                    onChange({ iotMinDays: e.target.value === "" ? 0 : Number(e.target.value) })
                  }
                />
                <span className="muted">일 이상 가동하면 자동 검증돼요</span>
              </div>
            }
          />
        )}
      </div>
    </article>
  );
}

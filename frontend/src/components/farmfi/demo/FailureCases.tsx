"use client";

// 데모 8스텝은 모두 "성공 경로"만 실행한다 (step executor가 고정 시나리오라 실패를
// 강제로 재현할 API가 없음). 그래도 심사/시연 중 "실패하면 어떻게 되나요?" 질문에
// 바로 답할 수 있도록, 실제 구현된 3가지 실패 처리 로직을 문서(docs/api-spec.md) 기준
// 그대로 정리해 보여준다. 여기 나오는 요청/응답은 실제 route.ts 동작과 1:1로 맞춘 것.

const CASES = [
  {
    title: "잔액 부족 → 청약 거절",
    endpoint: "POST /api/subscribe",
    detail:
      "투자자 잔액보다 큰 금액을 청약하면 DB에 아무것도 반영하지 않고 즉시 거절한다.",
    sample: `{ "error": "Insufficient balance" }  // 400`,
  },
  {
    title: "잔여 토큰 초과 → 청약 거절",
    endpoint: "POST /api/subscribe",
    detail:
      "프로젝트에 남은 토큰 수보다 많은 구좌를 요청하면 청약을 막는다 (초과 판매 방지).",
    sample: `{ "error": "Not enough tokens available" }  // 400`,
  },
  {
    title: "AI 검증 실패 → 2회째 수동 검토 전환",
    endpoint: "POST /api/milestones/[id]/verify",
    detail:
      "필요 신호(계약서/영수증/사진/IoT) 중 하나라도 미통과면 트랜치를 풀지 않는다. 1회 실패는 재검증 안내, 2회 연속 실패면 status가 manual_review로 바뀌고 관리자 알림이 생성된다.",
    sample: `{ "passed": false, "signals": { "photo": false }, "retryCount": 2, "txHash": null }`,
  },
];

export function FailureCases() {
  return (
    <div className="card" style={{ padding: 18 }}>
      <h3>실패 케이스 (구현된 로직 기준)</h3>
      <p className="muted" style={{ marginTop: 6 }}>
        데모 8스텝은 성공 경로만 재생합니다. 아래는 실제 API가 실패를 처리하는 방식입니다.
      </p>
      <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
        {CASES.map((c) => (
          <div
            key={c.title}
            style={{
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: 14,
            }}
          >
            <p style={{ fontWeight: 900, fontSize: 14 }}>{c.title}</p>
            <p className="muted" style={{ marginTop: 4 }}>
              {c.endpoint}
            </p>
            <p className="muted" style={{ marginTop: 8 }}>
              {c.detail}
            </p>
            <pre
              style={{
                marginTop: 10,
                padding: 10,
                borderRadius: 6,
                background: "var(--soft)",
                fontSize: 12,
                overflowX: "auto",
              }}
            >
              {c.sample}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

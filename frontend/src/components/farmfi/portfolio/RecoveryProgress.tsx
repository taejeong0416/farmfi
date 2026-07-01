import { formatKRW } from "@/lib/format";

// 원금 회수 진행률 (누적 배당 수령액 / 투자 원금). 배당이 원금을 넘어서면
// (recoveryPercent > 100) 순수익 구간에 들어선 것 — bar는 100%에서 꽉 채우고
// 라벨로 초과분을 알려준다.
export function RecoveryProgress({
  investedAmount,
  dividendReceived,
  recoveryPercent,
}: {
  investedAmount: number;
  dividendReceived: number;
  recoveryPercent: number;
}) {
  const barWidth = Math.min(100, Math.max(0, recoveryPercent));
  const isComplete = recoveryPercent >= 100;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="muted">원금 회수 진행률</span>
        <strong style={{ color: isComplete ? "var(--green-800)" : "var(--ink)", fontSize: 14 }}>
          {Math.round(recoveryPercent)}%
        </strong>
      </div>
      <div className="progress" style={{ marginTop: 8 }}>
        <span className="bar" style={{ width: `${barWidth}%` }} />
      </div>
      <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
        {isComplete
          ? `투자 원금 ${formatKRW(investedAmount)}을 배당으로 모두 회수했습니다 (누적 배당 ${formatKRW(dividendReceived)})`
          : `누적 배당 ${formatKRW(dividendReceived)} / 투자 원금 ${formatKRW(investedAmount)}`}
      </p>
    </div>
  );
}

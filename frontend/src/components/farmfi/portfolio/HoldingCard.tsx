import Link from "next/link";
import { formatKRW } from "@/lib/format";
import { portfolioProjectStatusLabel } from "./status";
import { RecoveryProgress } from "./RecoveryProgress";
import type { PortfolioHolding } from "./types";

export function HoldingCard({ holding }: { holding: PortfolioHolding }) {
  const isLoss = holding.profitLoss < 0;
  const sign = holding.profitLoss > 0 ? "+" : "";

  return (
    <article className="card report-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <span className="badge">{portfolioProjectStatusLabel(holding.projectStatus)}</span>
          <h3 style={{ marginTop: 10 }}>{holding.projectName}</h3>
          <p className="muted" style={{ marginTop: 2 }}>
            {holding.tokenSymbol} · {holding.tokenAmount.toLocaleString()}개 보유
          </p>
        </div>
        <Link className="link" href={`/projects/${holding.projectId}`} style={{ marginTop: 4, whiteSpace: "nowrap" }}>
          상세 보기 →
        </Link>
      </div>

      <div className="kv" style={{ marginTop: 18 }}>
        <div>
          <span>투자 원금</span>
          <b>{formatKRW(holding.investedAmount)}</b>
        </div>
        <div>
          <span>현재 평가금액 (NAV)</span>
          <b>{formatKRW(holding.currentValue)}</b>
        </div>
        <div>
          <span>평가손익</span>
          <b style={{ color: isLoss ? "#c0392b" : "var(--green-800)" }}>
            {sign}
            {formatKRW(holding.profitLoss)} ({sign}
            {holding.profitLossPercent.toFixed(1)}%)
          </b>
        </div>
      </div>

      <RecoveryProgress
        investedAmount={holding.investedAmount}
        dividendReceived={holding.dividendReceived}
        recoveryPercent={holding.recoveryPercent}
      />
    </article>
  );
}

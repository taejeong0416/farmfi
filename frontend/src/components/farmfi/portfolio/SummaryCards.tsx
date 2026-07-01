import { formatKRW } from "@/lib/format";
import type { PortfolioSummary } from "./types";

// Deliberately not the shared `Metric` component (ui/Metric.tsx) — it
// hardcodes a "▲ 12.4% 전월 대비" caption on every card, which would
// misrepresent real portfolio figures. Same rationale as
// ../project/StatBox.tsx, kept local to avoid cross-folder coupling.
function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "profit" | "loss";
}) {
  return (
    <article className="card metric">
      <span>{label}</span>
      <strong
        style={
          tone === "profit"
            ? { color: "var(--green-800)" }
            : tone === "loss"
              ? { color: "#c0392b" }
              : undefined
        }
      >
        {value}
      </strong>
    </article>
  );
}

export function SummaryCards({ summary }: { summary: PortfolioSummary }) {
  const isLoss = summary.totalProfitLoss < 0;
  const sign = summary.totalProfitLoss > 0 ? "+" : "";

  return (
    <div className="grid-4">
      <SummaryStat label="총 투자 원금" value={formatKRW(summary.totalInvested)} />
      <SummaryStat label="현재 평가금액" value={formatKRW(summary.totalCurrentValue)} />
      <SummaryStat
        label="평가손익"
        value={`${sign}${formatKRW(summary.totalProfitLoss)} (${sign}${summary.totalProfitLossPercent.toFixed(1)}%)`}
        tone={isLoss ? "loss" : "profit"}
      />
      <SummaryStat label="누적 배당 수령액" value={formatKRW(summary.totalDividendReceived)} tone="profit" />
    </div>
  );
}

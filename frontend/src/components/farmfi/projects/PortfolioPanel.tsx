"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/farmfi/ui/Panel";

type Holding = {
  projectId: string;
  projectName: string;
  tokenSymbol: string | null;
  projectStatus: string;
  tokenAmount: number;
  investedAmount: number;
  currentValue: number;
  profitLoss: number;
  profitLossPercent: number;
  dividendReceived: number;
};
type Summary = {
  totalInvested: number;
  totalCurrentValue: number;
  totalProfitLoss: number;
  totalProfitLossPercent: number;
  totalDividendReceived: number;
};
type Portfolio = { summary: Summary; holdings: Holding[] };

function won(n: number): string {
  return Math.round(n).toLocaleString("ko-KR") + "원";
}
function signed(n: number): string {
  return (n >= 0 ? "+" : "") + won(n);
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  const color = tone === "up" ? "var(--green-700)" : tone === "down" ? "#c0392b" : "var(--ink)";
  return (
    <div className="card" style={{ padding: "16px 18px" }}>
      <span className="muted" style={{ fontSize: 13 }}>
        {label}
      </span>
      <strong style={{ display: "block", marginTop: 6, fontSize: 20, color }}>
        {value}
      </strong>
    </div>
  );
}

export function PortfolioPanel() {
  const [data, setData] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/portfolio")
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setData)
      .catch(() => setError("포트폴리오를 불러오지 못했습니다."));
  }, []);

  if (error)
    return (
      <Panel title="내 투자">
        <p className="muted">{error}</p>
      </Panel>
    );
  if (!data)
    return (
      <Panel title="내 투자">
        <p className="muted">불러오는 중…</p>
      </Panel>
    );
  if (data.holdings.length === 0)
    return (
      <Panel title="내 투자">
        <p className="muted">
          아직 투자 내역이 없습니다.{" "}
          <Link className="link" href="/projects">
            프로젝트 보기 →
          </Link>
        </p>
      </Panel>
    );

  const s = data.summary;
  const plTone = s.totalProfitLoss >= 0 ? "up" : "down";

  return (
    <Panel title="내 투자">
      <div className="grid-2" style={{ gap: 14 }}>
        <Stat label="총 투자금" value={won(s.totalInvested)} />
        <Stat label="평가액" value={won(s.totalCurrentValue)} />
        <Stat
          label="평가 손익"
          value={`${signed(s.totalProfitLoss)} (${s.totalProfitLossPercent.toFixed(1)}%)`}
          tone={plTone}
        />
        <Stat label="누적 배당" value={won(s.totalDividendReceived)} tone="up" />
      </div>

      <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
        {data.holdings.map((h) => (
          <Link
            key={h.projectId}
            href={`/projects/${h.projectId}`}
            className="card"
            style={{ padding: "14px 16px", display: "block" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <strong>{h.projectName}</strong>
                <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                  {h.tokenSymbol} · {h.tokenAmount.toLocaleString("ko-KR")}구좌
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <strong>{won(h.currentValue)}</strong>
                <p
                  style={{
                    fontSize: 13,
                    marginTop: 2,
                    color: h.profitLoss >= 0 ? "var(--green-700)" : "#c0392b",
                    fontWeight: 700,
                  }}
                >
                  {signed(h.profitLoss)} ({h.profitLossPercent.toFixed(1)}%)
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </Panel>
  );
}

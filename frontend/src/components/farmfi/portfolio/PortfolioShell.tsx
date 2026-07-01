"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/useAuth";
import { Section } from "../ui/Section";
import { fetchPortfolio, portfolioQueryKey } from "./api";
import { SummaryCards } from "./SummaryCards";
import { HoldingCard } from "./HoldingCard";
import { DividendHistory } from "./DividendHistory";
import { RecentActivity } from "./RecentActivity";

export function PortfolioShell() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const portfolioQuery = useQuery({
    queryKey: portfolioQueryKey(),
    queryFn: fetchPortfolio,
    enabled: isAuthenticated,
    retry: false,
  });

  if (!authLoading && !isAuthenticated) {
    return (
      <main className="page">
        <div className="shell section">
          <p className="muted">지갑 연결 후 로그인하면 내 포트폴리오를 확인할 수 있습니다.</p>
        </div>
      </main>
    );
  }

  if (authLoading || portfolioQuery.isLoading) {
    return (
      <main className="page">
        <div className="shell section">
          <p className="muted">포트폴리오 정보를 불러오는 중...</p>
        </div>
      </main>
    );
  }

  if (portfolioQuery.isError || !portfolioQuery.data) {
    return (
      <main className="page">
        <div className="shell section">
          <p className="muted">
            {portfolioQuery.error instanceof Error
              ? portfolioQuery.error.message
              : "포트폴리오 정보를 불러오지 못했습니다."}
          </p>
          <Link className="link" href="/projects">
            ← 프로젝트 목록으로
          </Link>
        </div>
      </main>
    );
  }

  const { summary, holdings, dividends, transactions } = portfolioQuery.data;

  return (
    <main className="page">
      <Section
        title="내 포트폴리오"
        desc="보유 프로젝트별 투자 현황과 배당 내역을 한눈에 확인합니다."
      >
        <SummaryCards summary={summary} />
      </Section>

      <Section
        title="보유 프로젝트"
        desc="프로젝트별 보유 토큰 수, 투자금액, 현재 평가금액(NAV), 원금 회수 진행률입니다."
      >
        {holdings.length > 0 ? (
          <div className="grid-2">
            {holdings.map((h) => (
              <HoldingCard key={h.projectId} holding={h} />
            ))}
          </div>
        ) : (
          <p className="muted">
            아직 보유 중인 프로젝트가 없습니다.{" "}
            <Link className="link" href="/projects">
              프로젝트 둘러보기 →
            </Link>
          </p>
        )}
      </Section>

      <Section title="배당 내역">
        <DividendHistory dividends={dividends} />
      </Section>

      <Section title="최근 거래">
        <RecentActivity transactions={transactions} />
      </Section>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Section } from "../ui/Section";
import { GreenBand } from "../ui/GreenBand";
import { formatDate, formatKRW, formatPercent } from "@/lib/format";
import { fetchProject, projectQueryKey } from "./api";
import { projectStatusLabel } from "./status";
import { StatBox } from "./StatBox";
import { MilestoneStepper } from "./MilestoneStepper";
import { EscrowSummary } from "./EscrowSummary";
import { TransactionList } from "./TransactionList";
import { SubscribeForm } from "./SubscribeForm";

export function ProjectDetail({ projectId }: { projectId: string }) {
  const {
    data: project,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: projectQueryKey(projectId),
    queryFn: () => fetchProject(projectId),
    retry: false,
  });

  if (isLoading) {
    return (
      <main className="page">
        <div className="shell section">
          <p className="muted">프로젝트 정보를 불러오는 중...</p>
        </div>
      </main>
    );
  }

  if (isError || !project) {
    return (
      <main className="page">
        <div className="shell section">
          <p className="muted">
            {error instanceof Error ? error.message : "프로젝트를 찾을 수 없습니다."}
          </p>
          <Link className="link" href="/projects">
            ← 프로젝트 목록으로
          </Link>
        </div>
      </main>
    );
  }

  const fundingPercent =
    project.targetAmount === 0 ? 0 : (project.currentAmount / project.targetAmount) * 100;
  const progressWidth = Math.min(100, Math.max(0, fundingPercent));
  const remainingTokens = project.totalTokens - project.soldTokens;

  return (
    <>
      <main className="page">
        <section className="hero">
          <div className="thumb detail">
            <div className="shell thumb-detail-inner" style={{ color: "#fff" }}>
              <span className="badge">{projectStatusLabel(project.status)}</span>
              <h1 style={{ marginTop: 18 }}>{project.name}</h1>
              <p className="lead" style={{ color: "rgba(255,255,255,.9)" }}>
                {project.location ?? "위치 정보 없음"}
              </p>
            </div>
          </div>
        </section>
        <div className="shell grid-2 section">
          <div>
            <Section title="프로젝트 소개">
              {project.description ? <p className="section-desc">{project.description}</p> : null}
              <div className="grid-3" style={{ marginTop: 18 }}>
                <StatBox label="토큰 심볼" value={project.tokenSymbol} />
                <StatBox label="토큰 단가" value={formatKRW(project.tokenPrice)} />
                <StatBox label="잔여 토큰" value={`${remainingTokens.toLocaleString()}개`} />
              </div>
            </Section>

            <Section title="모집 현황">
              <p className="muted">모집률</p>
              <p className="big-number">{formatPercent(Math.round(fundingPercent))}</p>
              <div className="progress">
                <span className="bar" style={{ width: `${progressWidth}%` }} />
              </div>
              <div className="kv">
                <div>
                  <span>목표 금액</span>
                  <b>{formatKRW(project.targetAmount)}</b>
                </div>
                <div>
                  <span>모집 금액</span>
                  <b>{formatKRW(project.currentAmount)}</b>
                </div>
                <div>
                  <span>참여자</span>
                  <b>{project.tokenHoldings.length}명</b>
                </div>
              </div>
            </Section>

            <Section
              title="마일스톤 진행 상황"
              desc="자금은 마일스톤 검증 후 단계적으로 집행됩니다."
            >
              <MilestoneStepper milestones={project.milestones} />
            </Section>

            <Section title="에스크로 현황">
              <EscrowSummary escrow={project.escrow} />
            </Section>

            <Section title="최근 거래 내역">
              <TransactionList transactions={project.transactions} />
            </Section>
          </div>

          <aside>
            <SubscribeForm project={project} />
            <article className="card report-card" style={{ marginTop: 20 }}>
              <h3>프로젝트 정보</h3>
              <div className="kv" style={{ borderTop: "none", paddingTop: 0, marginTop: 14 }}>
                <div>
                  <span>공간 유형</span>
                  <b>{project.buildingType ?? "-"}</b>
                </div>
                <div>
                  <span>면적</span>
                  <b>{project.areaSqm ? `${project.areaSqm}㎡` : "-"}</b>
                </div>
                <div>
                  <span>모집 마감</span>
                  <b>{project.fundingEnd ? formatDate(project.fundingEnd) : "미정"}</b>
                </div>
              </div>
            </article>
          </aside>
        </div>
      </main>
      <GreenBand text="이 프로젝트에 참여하고 도심의 미래를 함께 키워보세요" />
    </>
  );
}

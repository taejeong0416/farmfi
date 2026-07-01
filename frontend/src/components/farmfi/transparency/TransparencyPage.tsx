"use client";

import { useQuery } from "@tanstack/react-query";
import { Section } from "../ui/Section";
import { Panel } from "../ui/Panel";
import { GreenBand } from "../ui/GreenBand";
import { formatDate, shortenHash } from "@/lib/format";
import { MilestoneStatus } from "@/lib/constants";

type EscrowInfo = {
  totalLocked: number;
  totalReleased: number;
  remaining: number;
  status: string;
} | null;

type MilestoneInfo = { id: string; seq: number; name: string; status: string };

type TransparencyProject = {
  id: string;
  name: string;
  status: string;
  currentAmount: number;
  escrow: EscrowInfo;
  milestones: MilestoneInfo[];
};

type TransactionInfo = {
  id: string;
  type: string;
  amount: number;
  txHash: string | null;
  createdAt: string;
};

type ProjectDetail = {
  id: string;
  name: string;
  escrow: EscrowInfo;
  milestones: MilestoneInfo[];
  transactions: TransactionInfo[];
};

async function fetchProjects(): Promise<{ projects: TransparencyProject[] }> {
  const res = await fetch("/api/projects");
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

async function fetchProjectDetail(id: string): Promise<ProjectDetail> {
  const res = await fetch(`/api/projects/${id}`);
  if (!res.ok) throw new Error("Failed to fetch project detail");
  return res.json();
}

function won(amount: number): string {
  return `₩${Math.round(amount).toLocaleString("ko-KR")}`;
}

const TX_TYPE_LABEL: Record<string, string> = {
  subscription: "투자 입금",
  tranche_release: "에스크로 집행",
  dividend: "배당 지급",
  revenue: "운영 수익 입금",
};

const MILESTONE_STATUS_LABEL: Record<string, string> = {
  [MilestoneStatus.PENDING]: "대기",
  [MilestoneStatus.IN_PROGRESS]: "진행 중",
  [MilestoneStatus.VERIFIED]: "AI 검증 완료",
  [MilestoneStatus.COMPLETED]: "트랜치 지급 완료",
  [MilestoneStatus.FAILED]: "검증 실패",
  [MilestoneStatus.MANUAL_REVIEW]: "수동 검토 대기",
};

function milestoneIcon(status: string): string {
  if (status === MilestoneStatus.COMPLETED || status === MilestoneStatus.VERIFIED) {
    return "✓";
  }
  if (status === MilestoneStatus.FAILED || status === MilestoneStatus.MANUAL_REVIEW) {
    return "⚠";
  }
  return "○";
}

export function TransparencyPage() {
  const {
    data: projectsData,
    isError: projectsError,
    isLoading: projectsLoading,
  } = useQuery({
    queryKey: ["projects", "transparency"],
    queryFn: fetchProjects,
  });

  const projects = !projectsError ? (projectsData?.projects ?? []) : [];
  const primaryProjectId = projects[0]?.id;

  const { data: detail, isError: detailError } = useQuery({
    queryKey: ["project", primaryProjectId, "transparency"],
    queryFn: () => fetchProjectDetail(primaryProjectId as string),
    enabled: Boolean(primaryProjectId),
  });

  // Platform-wide totals (across every project) — real, from GET /api/projects.
  const totalInvestment = projects.reduce((sum, p) => sum + Number(p.currentAmount), 0);
  const escrowTotal = projects.reduce(
    (sum, p) => sum + Number(p.escrow?.remaining ?? 0),
    0,
  );
  const allMilestones = projects.flatMap((p) => p.milestones);
  const completedMilestones = allMilestones.filter(
    (m) => m.status === MilestoneStatus.COMPLETED,
  ).length;
  const milestoneRate =
    allMilestones.length > 0
      ? Math.round((completedMilestones / allMilestones.length) * 100)
      : 0;

  // Per-project detail (tx list + verification status) — real, from
  // GET /api/projects/[id] for the first live project on the platform.
  const transactions = !detailError ? (detail?.transactions ?? []) : [];
  const milestones = !detailError ? (detail?.milestones ?? []) : [];
  const escrow = !detailError ? detail?.escrow : null;

  const escrowPercent =
    escrow && Number(escrow.totalLocked) > 0
      ? Math.round((Number(escrow.remaining) / Number(escrow.totalLocked)) * 100)
      : null;

  const dataStatus = projectsLoading
    ? "동기화 중"
    : projectsError || detailError
      ? "오류"
      : "정상";

  return (
    <main className="page">
      <Section
        title="투명성 상세"
        desc="프로젝트 자금 흐름, 에스크로 보관 현황, 계약 검증 상태를 한 화면에서 확인합니다."
      >
        <div className="stats-grid">
          <article className="card metric">
            <span className="muted">총 투자 금액</span>
            <strong>{won(totalInvestment)}</strong>
            <p className="muted">{projects.length}개 프로젝트 누적</p>
          </article>
          <article className="card metric">
            <span className="muted">에스크로 보관 금액</span>
            <strong>{won(escrowTotal)}</strong>
            <p className="muted">투자금 대비 안전 보관 중</p>
          </article>
          <article className="card metric">
            <span className="muted">마일스톤 달성률</span>
            <strong>{milestoneRate}%</strong>
            <p className="muted">
              {completedMilestones}/{allMilestones.length} 완료
            </p>
          </article>
          <article className="card metric">
            <span className="muted">온체인 거래 수</span>
            <strong>{transactions.length}건</strong>
            <p className="muted">최근 거래 기준</p>
          </article>
          <article className="card metric">
            <span className="muted">데이터 업데이트</span>
            <strong>{dataStatus}</strong>
            <p className="muted">실시간 API 연동</p>
          </article>
        </div>
        <div className="grid-2" style={{ marginTop: 24 }}>
          <Panel title="온체인 자금 흐름">
            <div className="band" style={{ color: "#fff" }}>
              <b>투자자 → 에스크로 지갑 → 스마트팜 구축 · 운영 · 정산</b>
            </div>
          </Panel>
          <Panel title="에스크로 보관 현황">
            <div className="donut" />
            <p className="muted" style={{ marginTop: 12 }}>
              {escrowPercent !== null
                ? `보관 중 ${escrowPercent}% · 집행 완료 ${100 - escrowPercent}%`
                : "에스크로 데이터 없음"}
            </p>
          </Panel>
        </div>
        <div className="grid-2" style={{ marginTop: 24 }}>
          <Panel title="최근 온체인 거래 내역">
            <table className="table">
              <tbody>
                {transactions.length > 0 ? (
                  transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td>{formatDate(tx.createdAt)}</td>
                      <td>{TX_TYPE_LABEL[tx.type] ?? tx.type}</td>
                      {/* txHash is null until the escrow/tranche contracts
                          are deployed on Amoy — show a waiting/mock state
                          instead of a fake hash (see docs/api-spec.md #1). */}
                      <td>{tx.txHash ? shortenHash(tx.txHash) : "대기 · 모의"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="muted">
                      거래 내역이 아직 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Panel>
          <Panel title="계약 및 검증 상태">
            {milestones.length > 0 ? (
              milestones
                .slice()
                .sort((a, b) => a.seq - b.seq)
                .map((m) => (
                  <p className="muted" key={m.id}>
                    {milestoneIcon(m.status)} {m.name} ·{" "}
                    {MILESTONE_STATUS_LABEL[m.status] ?? m.status}
                  </p>
                ))
            ) : (
              <p className="muted">마일스톤 데이터가 아직 없습니다.</p>
            )}
          </Panel>
        </div>
      </Section>
      <GreenBand text="투명한 데이터, 검증된 운영. 함께 만드는 지속가능한 농업 생태계" />
    </main>
  );
}

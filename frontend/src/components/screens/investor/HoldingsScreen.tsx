"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  InfoRow,
  ProgressBar,
  Shell,
  SkeletonBlock,
  type Column,
} from "@/components/ui";
import {
  MILESTONE_STATUS_LABEL,
  milestoneTone,
  num,
  shortDate,
  useInvestments,
  useBankAccount,
  usePayouts,
  usePortfolio,
  useProjects,
  won,
  type PortfolioHolding,
  type ProjectSummary,
} from "../api";

export function HoldingsScreen() {
  const { data: portfolio, isLoading, isError } = usePortfolio();
  const { data: projects } = useProjects();
  const { data: payouts } = usePayouts();
  const { data: bankAccount } = useBankAccount();
  const { data: investments } = useInvestments();

  const projectById = useMemo(() => {
    const m = new Map<string, ProjectSummary>();
    (projects ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [projects]);

  if (isLoading) {
    return (
      <Shell>
        <SkeletonBlock height={420} />
      </Shell>
    );
  }

  if (isError || !portfolio) {
    return (
      <Shell>
        <EmptyState
          title="보유 투자를 볼 수 없습니다"
          desc="로그인 후 다시 확인해 주세요."
          action={<Button href="/login?next=/investor/holdings">로그인</Button>}
        />
      </Shell>
    );
  }

  const s = portfolio.summary;
  const total = s.totalInvested || 1;
  const expected = Math.max(0, s.totalCurrentValue - s.totalDividendReceived);

  const columns: Column<PortfolioHolding>[] = [
    {
      key: "name",
      header: "프로젝트",
      render: (h) => (
        <Link href={`/projects/${h.projectId}`} className="text-12 text-ink">
          {h.projectName}
        </Link>
      ),
    },
    {
      key: "amount",
      header: "투자 금액",
      align: "right",
      width: "150px",
      render: (h) => (
        <span className="font-num text-14 font-medium">
          {won(h.investedAmount)}
        </span>
      ),
    },
    {
      key: "share",
      header: "비중",
      align: "right",
      width: "80px",
      render: (h) => (
        <span className="font-num text-14">
          {Math.round((h.investedAmount / total) * 100)}%
        </span>
      ),
    },
    {
      key: "stage",
      header: "현재 단계",
      width: "150px",
      render: (h) => {
        const ms = [...(projectById.get(h.projectId)?.milestones ?? [])].sort(
          (a, b) => a.seq - b.seq,
        );
        const cur =
          ms.find((m) => m.status !== "completed" && m.status !== "verified") ??
          ms[ms.length - 1];
        if (!cur) return <span className="text-12 text-muted">-</span>;
        const tone = milestoneTone(cur.status);
        return (
          <span
            className={`text-12 ${
              tone === "fail" ? "text-danger" : "text-body"
            }`}
          >
            {cur.seq}단계 {MILESTONE_STATUS_LABEL[cur.status] ?? cur.status}
          </span>
        );
      },
    },
    {
      key: "progress",
      header: "마일스톤 진행률",
      width: "180px",
      render: (h) => {
        const ms = projectById.get(h.projectId)?.milestones ?? [];
        const paid = ms.filter((m) => m.status === "completed").length;
        return (
          <div className="w-[110px]">
            <ProgressBar value={ms.length ? (paid / ms.length) * 100 : 0} />
            <p className="mt-1.5 text-12 text-muted">
              {paid} / {ms.length}단계
            </p>
          </div>
        );
      },
    },
    {
      key: "payout",
      header: "회수 상태",
      width: "110px",
      render: (h) => {
        const mine = (payouts?.payouts ?? []).filter(
          (p) => p.projectId === h.projectId,
        );
        if (mine.length === 0)
          return <span className="text-12 text-muted">해당 없음</span>;
        const paid = mine.some((p) => p.status === "paid");
        return (
          <span
            className={`text-12 font-medium ${paid ? "text-brand" : "text-body"}`}
          >
            {paid ? "지급완료" : "지급예정"}
          </span>
        );
      },
    },
  ];

  return (
    <Shell>
      <h1 className="text-22 font-bold text-ink">내 투자 한눈에 보기</h1>
      <p className="mt-3 text-13 text-muted">
        {shortDate(new Date())} 기준 · 투자한 원금을 기준으로 보여드려요
      </p>

      <div className="mt-6 flex items-start gap-8">
        <div className="flex-1">
          <Card padded={false}>
            <div className="grid grid-cols-4">
              <Cell label="지금까지 투자한 금액" value={num(s.totalInvested)} unit="원" />
              <Cell
                label="프로젝트 수"
                value={String(portfolio.holdings.length)}
                unit="개"
                bordered
              />
              <Cell
                label="예상 회수액"
                value={num(Math.round(expected))}
                unit="원"
                bordered
                accent
              />
              <Cell
                label="지급 완료액"
                value={num(s.totalDividendReceived)}
                unit="원"
                bordered
              />
            </div>
          </Card>

          <h2 className="mt-8 text-15 font-medium text-ink">투자 현황</h2>
          <div className="mt-4">
            <DataTable
              columns={columns}
              rows={portfolio.holdings}
              rowKey={(h) => h.projectId}
              empty="아직 투자한 프로젝트가 없습니다."
            />
          </div>

          <div className="mt-3 flex items-center justify-between rounded-8 border border-line bg-surface px-5 py-3">
            <span className="text-12 text-muted">
              투자 신청 · 취소 내역 {investments?.length ?? 0}건
            </span>
            <Link
              href="/investor/applications"
              className="text-12 font-medium text-brand"
            >
              투자 신청 내역 보기
            </Link>
          </div>
        </div>

        <div className="w-[360px] shrink-0 space-y-6">
          <Card padded={false}>
            {/* `.fig` I-07 ConnectedAccountCard — 은행 · 계좌 끝자리 · 연결 상태 · 확인 시각. */}
            <div className="border-b border-line-soft px-5 py-4">
              <h2 className="text-14 font-bold text-ink">연결 계좌</h2>
            </div>
            <div className="px-5">
              <InfoRow label="은행" value={bankAccount?.bankName ?? "미연결"} />
              <InfoRow
                label="계좌 끝자리"
                value={
                  bankAccount ? `···${bankAccount.maskedNumber.slice(-4)}` : "-"
                }
              />
              <InfoRow
                label="연결 상태"
                value={
                  bankAccount ? (
                    <span className="text-brand">연결됨</span>
                  ) : (
                    "연결 전"
                  )
                }
              />
              <InfoRow
                label="확인 시각"
                value={
                  bankAccount?.verifiedAt ? shortDate(bankAccount.verifiedAt) : "-"
                }
              />
            </div>
            <div className="flex items-center justify-between border-t border-surface px-5 py-4">
              <span className="text-13 text-ink">
                회수 계좌{" "}
                <span className="text-body">
                  {bankAccount
                    ? `${bankAccount.bankName} · ${bankAccount.maskedNumber.slice(-4)}`
                    : "미등록"}
                </span>
              </span>
              <Link href="/verify/account" className="text-12 text-brand">
                변경
              </Link>
            </div>
          </Card>

          <Card padded={false}>
            <div className="flex items-center justify-between border-b border-line-soft px-5 py-4">
              <h2 className="text-14 font-bold text-ink">회수 일정</h2>
              <span className="text-12 text-muted">
                {new Date().getFullYear()}
              </span>
            </div>
            <div className="px-5">
              {(payouts?.payouts ?? []).slice(0, 3).map((p) => (
                <Link
                  key={p.id}
                  href={`/investor/payouts/${p.id}`}
                  className="flex items-center justify-between border-b border-surface py-3.5 last:border-b-0"
                >
                  <span className="text-12 text-muted">{p.period}</span>
                  <span className="flex-1 px-3 text-12 text-ink">
                    {p.project.name}
                  </span>
                  <span className="font-num text-13 font-medium text-ink">
                    {won(p.amount)}
                  </span>
                </Link>
              ))}
              {(payouts?.payouts ?? []).length === 0 ? (
                <p className="py-8 text-center text-12 text-muted">
                  예정된 회수 일정이 없습니다.
                </p>
              ) : null}
            </div>
            <div className="flex items-center justify-between border-t border-surface bg-surface px-5 py-3">
              <span className="text-12 text-body">전체 회수 내역</span>
              <span className="text-muted">›</span>
            </div>
          </Card>

          <p className="text-12 text-muted">
            예상 회수액은 매출과 운영비 정산 결과에 따라 달라질 수 있습니다.
          </p>
        </div>
      </div>
    </Shell>
  );
}

function Cell({
  label,
  value,
  unit,
  bordered,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  bordered?: boolean;
  accent?: boolean;
}) {
  return (
    <div className={`px-5 py-5 ${bordered ? "border-l border-line-soft" : ""}`}>
      <p className="text-13 text-muted">{label}</p>
      <p className="mt-1.5 flex items-baseline gap-1">
        <span
          className={`font-num text-24 font-medium ${accent ? "text-brand" : "text-ink"}`}
        >
          {value}
        </span>
        <span className="text-15 text-body">{unit}</span>
      </p>
    </div>
  );
}

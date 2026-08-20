"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  Button,
  Card,
  EmptyState,
  ProgressBar,
  Shell,
  SkeletonBlock,
} from "@/components/ui";
import { useAuth } from "@/lib/useAuth";
import {
  MILESTONE_STATUS_LABEL,
  milestoneTone,
  num,
  shortDate,
  useNotifications,
  usePortfolio,
  useProjects,
  won,
  type ProjectSummary,
} from "../api";

export function InvestorHomeScreen() {
  const { user } = useAuth();
  const { data: portfolio, isLoading, isError } = usePortfolio();
  const { data: projects } = useProjects();
  const { data: notifications } = useNotifications();

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
          title="투자 내역을 볼 수 없습니다"
          desc="로그인 후 다시 확인해 주세요."
          action={<Button href="/login?next=/investor">로그인</Button>}
        />
      </Shell>
    );
  }

  const s = portfolio.summary;
  const expected = Math.max(0, s.totalCurrentValue - s.totalDividendReceived);

  return (
    <Shell>
      <h1 className="text-22 font-bold text-ink">
        {user?.name ?? "투자자"}님, 투자한 프로젝트가 차근차근 진행 중이에요
      </h1>
      <p className="mt-3 text-13 text-muted">
        {shortDate(new Date())} 기준
      </p>

      <div className="mt-6 flex items-start gap-8">
        <div className="flex-1">
          <Card padded={false}>
            <div className="grid grid-cols-4">
              <Summary label="지금까지 투자한 금액" value={num(s.totalInvested)} unit="원" />
              <Summary
                label="함께한 프로젝트"
                value={String(portfolio.holdings.length)}
                unit="개"
                bordered
              />
              <Summary
                label="예상 회수액"
                value={num(Math.round(expected))}
                unit="원"
                bordered
                accent
              />
              <Summary
                label="지급 완료액"
                value={num(s.totalDividendReceived)}
                unit="원"
                bordered
              />
            </div>
          </Card>

          <div className="mt-8 flex items-center justify-between">
            <h2 className="text-15 font-bold text-ink">내 투자 진행 상황</h2>
            <Link href="/investor/holdings" className="text-12 text-muted">
              전체 보기
            </Link>
          </div>

          <Card className="mt-4" padded={false}>
            {portfolio.holdings.length === 0 ? (
              <p className="px-6 py-16 text-center text-13 text-muted">
                아직 투자한 프로젝트가 없습니다.
              </p>
            ) : (
              <div className="px-6">
                {portfolio.holdings.map((h) => {
                  const p = projectById.get(h.projectId);
                  const ms = [...(p?.milestones ?? [])].sort(
                    (a, b) => a.seq - b.seq,
                  );
                  const paid = ms.filter((m) => m.status === "completed").length;
                  const current =
                    ms.find(
                      (m) => m.status !== "completed" && m.status !== "verified",
                    ) ?? ms[ms.length - 1];
                  const progress = ms.length ? (paid / ms.length) * 100 : 0;

                  return (
                    <Link
                      key={h.projectId}
                      href={`/projects/${h.projectId}`}
                      className="block border-b border-surface py-5 last:border-b-0"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-14 font-medium text-ink">
                          {h.projectName}
                        </span>
                        <span className="font-num text-12 text-muted">
                          투자 신청 {won(h.investedAmount)}
                        </span>
                      </div>
                      <div className="mt-3">
                        <ProgressBar value={progress} />
                      </div>
                      <div className="mt-2.5 flex items-center justify-between">
                        <span className="text-12 text-body">
                          {current
                            ? `${current.seq}단계 ${current.name} · `
                            : "단계 정보 없음 "}
                          <span
                            className={
                              current && milestoneTone(current.status) === "pass"
                                ? "font-medium text-brand"
                                : current && milestoneTone(current.status) === "fail"
                                  ? "font-medium text-danger"
                                  : ""
                            }
                          >
                            {current
                              ? (MILESTONE_STATUS_LABEL[current.status] ??
                                current.status)
                              : ""}
                          </span>
                        </span>
                        <span className="text-12 text-muted">
                          {ms.length}단계 중 {paid}단계 집행 완료
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="w-[360px] shrink-0 space-y-6">
          <Card padded={false}>
            <div className="flex items-center justify-between border-b border-line-soft px-5 py-4">
              <h2 className="text-14 font-bold text-ink">최근 알림</h2>
              <Link href="/investor/notifications" className="text-12 text-muted">
                투자 소식
              </Link>
            </div>
            <div className="px-5">
              {(notifications ?? []).slice(0, 3).map((n) => (
                <div
                  key={n.id}
                  className="border-b border-surface py-4 last:border-b-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-13 font-medium text-ink">{n.message}</p>
                    <span className="shrink-0 text-12 text-muted">
                      {shortDate(n.createdAt).slice(5)}
                    </span>
                  </div>
                </div>
              ))}
              {(notifications ?? []).length === 0 ? (
                <p className="py-8 text-center text-12 text-muted">
                  새 소식이 없습니다.
                </p>
              ) : null}
            </div>
          </Card>

          <Card>
            <h2 className="text-15 font-bold text-ink">
              다른 서비스도 이용해보세요
            </h2>
            <p className="mt-3 text-13 leading-6 text-muted">
              가까운 팜에서 원하는 작물을 골라
              <br />
              3·5·7종 믹스팩으로 픽업할 수 있어요.
            </p>
            <div className="mt-5">
              <Button full href="/subscribe">
                구매자 화면으로 전환
              </Button>
            </div>
            <p className="mt-3 text-12 text-muted">
              투자 화면은 그대로 유지됩니다.
            </p>
          </Card>
        </div>
      </div>
    </Shell>
  );
}

function Summary({
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

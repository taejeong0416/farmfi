"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Card,
  EmptyState,
  Shell,
  SkeletonBlock,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  MILESTONE_STATUS_LABEL,
  getJson,
  milestoneTone,
  won,
} from "../api";

export type OperatorMilestone = {
  id: string;
  seq: number;
  name: string;
  status: string;
  releaseAmount: number;
  evidenceSubmittedAt: string | null;
  reviewNote: string | null;
  completedAt: string | null;
  project: { id: string; name: string; location: string | null };
};

export function useOperatorMilestones() {
  return useQuery({
    queryKey: ["milestones", "operator"],
    queryFn: () => getJson<{ milestones: OperatorMilestone[] }>("/api/milestones"),
    select: (d) => d.milestones,
    retry: false,
  });
}

export function MilestonesScreen() {
  const { data, isLoading, isError } = useOperatorMilestones();

  if (isLoading) {
    return (
      <Shell>
        <SkeletonBlock height={360} />
      </Shell>
    );
  }

  if (isError || !data) {
    return (
      <Shell>
        <EmptyState
          title="검증 현황을 볼 수 없습니다"
          desc="운영자로 로그인한 뒤 다시 확인해 주세요."
        />
      </Shell>
    );
  }

  const revision = data.filter((m) => m.status === "revision_required");

  return (
    <Shell>
      <h1 className="text-22 font-bold text-ink">마일스톤 검증 현황</h1>
      <p className="mt-3 text-13 text-muted">
        제출한 증빙의 판정과 다음에 할 일을 여기서 본다.
      </p>

      {revision.length > 0 ? (
        <>
          <h2 className="mt-8 text-15 font-bold text-ink">
            보완 요청 {revision.length}건
          </h2>
          <Card className="mt-4" padded={false}>
            <div className="px-6">
              {revision.map((m) => (
                <Link
                  key={m.id}
                  href={`/operator/milestones/${m.id}/evidence`}
                  className="block border-b border-surface py-4 last:border-b-0"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-14 font-medium text-ink">
                      {m.project.name}
                    </span>
                    <span className="text-12 text-muted">
                      {m.evidenceSubmittedAt
                        ? formatDate(m.evidenceSubmittedAt)
                        : "-"}
                    </span>
                  </div>
                  <p className="mt-2 text-12 text-danger">
                    {m.seq}단계 {m.name} · 보완 요청
                  </p>
                  {m.reviewNote ? (
                    <p className="mt-1.5 text-12 text-muted">{m.reviewNote}</p>
                  ) : null}
                </Link>
              ))}
            </div>
          </Card>
        </>
      ) : null}

      <h2 className="mt-8 text-18 font-bold text-ink">마일스톤 현황</h2>
      <Card className="mt-4" padded={false}>
        <div className="px-6">
          {data.length === 0 ? (
            <p className="py-16 text-center text-13 text-muted">
              맡은 마일스톤이 없습니다.
            </p>
          ) : (
            data.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-4 border-b border-surface py-4 last:border-b-0"
              >
                <span className="flex-1 text-14 text-ink">
                  {m.project.name} · {m.seq}단계 {m.name}
                </span>
                <Badge tone={milestoneTone(m.status)}>
                  {MILESTONE_STATUS_LABEL[m.status] ?? m.status}
                </Badge>
                <span className="w-[130px] text-right font-num text-13 text-ink">
                  {won(m.releaseAmount)}
                </span>
                <Link
                  href={
                    m.status === "completed"
                      ? `/operator/milestones/${m.id}/done`
                      : `/operator/milestones/${m.id}/evidence`
                  }
                  className="w-[80px] text-right text-12 font-medium text-brand"
                >
                  {m.status === "completed" ? "집행 내역" : "증빙 제출"}
                </Link>
              </div>
            ))
          )}
        </div>
      </Card>
    </Shell>
  );
}

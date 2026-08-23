"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  DataTable,
  SkeletonBlock,
  type Column,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import { useAuth } from "@/lib/useAuth";
import {
  MILESTONE_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
  getJson,
  num,
  useProjects,
  won,
} from "../api";
import { AdminShell } from "./AdminShell";

type PendingMilestone = {
  id: string;
  seq: number;
  name: string;
  status: string;
  releaseAmount: number;
  evidenceSubmittedAt: string | null;
  project: { id: string; name: string };
};

export function AdminHomeScreen() {
  const { user } = useAuth();
  const { data: projects, isLoading } = useProjects();
  const { data: pending } = useQuery({
    queryKey: ["milestones", "pendingReview"],
    queryFn: () =>
      getJson<{ milestones: PendingMilestone[] }>("/api/milestones?pendingReview=1"),
    select: (d) => d.milestones,
    retry: false,
  });

  const columns: Column<PendingMilestone>[] = [
    {
      key: "type",
      header: "유형",
      width: "110px",
      render: () => <span className="text-12 text-muted">증빙 재검토</span>,
    },
    {
      key: "project",
      header: "프로젝트명",
      render: (m) => (
        <Link href={`/projects/${m.project.id}`} className="text-13 text-ink">
          {m.project.name}
        </Link>
      ),
    },
    {
      key: "content",
      header: "내용",
      render: (m) => (
        <span className="text-13 text-body">
          {m.seq}단계 {m.name}
        </span>
      ),
    },
    {
      key: "amount",
      header: "집행 금액",
      align: "right",
      width: "140px",
      render: (m) => (
        <span className="font-num text-13">{won(m.releaseAmount)}</span>
      ),
    },
    {
      key: "at",
      header: "제출 시각",
      align: "right",
      width: "150px",
      render: (m) => (
        <span className="text-12 text-muted">
          {m.evidenceSubmittedAt ? formatDate(m.evidenceSubmittedAt) : "-"}
        </span>
      ),
    },
    {
      key: "status",
      header: "상태",
      align: "right",
      width: "100px",
      render: (m) => (
        <Link
          href="/admin/evidence"
          className="text-12 font-medium text-brand"
        >
          {MILESTONE_STATUS_LABEL[m.status] ?? m.status}
        </Link>
      ),
    },
  ];

  const list = projects ?? [];
  const raised = list.reduce((s, p) => s + p.currentAmount, 0);

  return (
    <AdminShell
      title={`${user?.name ?? "관리자"} 관리자님, 안녕하세요.`}
      desc={`처리 대기 ${pending?.length ?? 0}건`}
    >
      {isLoading ? (
        <SkeletonBlock height={360} />
      ) : (
        <>
          <Card padded={false}>
            <div className="grid grid-cols-4">
              <Stat label="전체 프로젝트" value={`${list.length}개`} />
              <Stat
                label="모집 중"
                value={`${list.filter((p) => p.status === "funding").length}개`}
                bordered
              />
              <Stat
                label="운영 중"
                value={`${list.filter((p) => p.status === "operating").length}개`}
                bordered
              />
              <Stat label="누적 모금액" value={`${num(raised)}원`} bordered />
            </div>
          </Card>

          <h2 className="mt-8 text-15 font-bold text-ink">처리 대기 목록</h2>
          <div className="mt-4">
            <DataTable
              columns={columns}
              rows={pending ?? []}
              rowKey={(m) => m.id}
              empty="처리할 항목이 없습니다."
            />
          </div>

          <h2 className="mt-8 text-15 font-bold text-ink">프로젝트 현황</h2>
          <Card className="mt-4" padded={false}>
            <div className="px-6">
              {list.map((p) => (
                <Link
                  key={p.id}
                  href={`/admin/projects/${p.id}/milestones`}
                  className="flex items-center justify-between border-b border-surface py-4 last:border-b-0"
                >
                  <span className="text-13 text-ink">{p.name}</span>
                  <span className="flex items-center gap-6">
                    <span className="font-num text-12 text-body">
                      {won(p.currentAmount)} / {won(p.targetAmount)}
                    </span>
                    <span className="w-[70px] text-right text-12 text-muted">
                      {PROJECT_STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </Card>
        </>
      )}
    </AdminShell>
  );
}

function Stat({
  label,
  value,
  bordered,
}: {
  label: string;
  value: string;
  bordered?: boolean;
}) {
  return (
    <div className={`px-5 py-5 ${bordered ? "border-l border-line-soft" : ""}`}>
      <p className="text-12 text-muted">{label}</p>
      <p className="mt-1.5 font-num text-20 font-medium text-ink">{value}</p>
    </div>
  );
}

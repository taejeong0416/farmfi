"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Shell,
  SkeletonBlock,
  type Column,
} from "@/components/ui";
import {
  INVESTMENT_STATUS_LABEL,
  postJson,
  shortDate,
  useInvestments,
  won,
  type Investment,
} from "../api";

const FILTERS = [
  { key: "all", label: "전체" },
  { key: "COMPLETED", label: "배정" },
  { key: "DEPOSIT_FAILED", label: "미배정 · 환불" },
  { key: "CANCELLED", label: "취소" },
] as const;

export function ApplicationsScreen() {
  const { data, isLoading, isError, refetch } = useInvestments();
  const [filter, setFilter] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list = data ?? [];
    return filter === "all" ? list : list.filter((i) => i.status === filter);
  }, [data, filter]);

  if (isLoading) {
    return (
      <Shell>
        <SkeletonBlock height={360} />
      </Shell>
    );
  }

  if (isError) {
    return (
      <Shell>
        <EmptyState
          title="신청 내역을 볼 수 없습니다"
          desc="로그인 후 다시 확인해 주세요."
          action={<Button href="/login?next=/investor/applications">로그인</Button>}
        />
      </Shell>
    );
  }

  async function cancel(id: string) {
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/investments/${id}/cancel`);
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "취소에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<Investment>[] = [
    {
      key: "project",
      header: "프로젝트",
      render: (i) => (
        <Link href={`/projects/${i.projectId}`} className="text-13 text-ink">
          {i.project?.name ?? i.projectId}
        </Link>
      ),
    },
    {
      key: "amount",
      header: "투자 금액",
      align: "right",
      width: "150px",
      render: (i) => (
        <span className="font-num text-14 font-medium">{won(i.amount)}</span>
      ),
    },
    {
      key: "created",
      header: "신청일",
      align: "right",
      width: "120px",
      render: (i) => (
        <span className="text-12 text-muted">{shortDate(i.createdAt)}</span>
      ),
    },
    {
      key: "status",
      header: "상태",
      width: "130px",
      render: (i) => (
        <Badge
          tone={
            i.status === "COMPLETED"
              ? "pass"
              : i.status === "DEPOSIT_FAILED"
                ? "fail"
                : "plain"
          }
        >
          {INVESTMENT_STATUS_LABEL[i.status] ?? i.status}
        </Badge>
      ),
    },
    {
      key: "action",
      header: "처리",
      align: "right",
      width: "120px",
      render: (i) =>
        i.status === "COMPLETED" || i.status === "CANCELLED" ? (
          <Link
            href={`/projects/${i.projectId}`}
            className="text-12 font-medium text-brand"
          >
            상세
          </Link>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void cancel(i.id)}
            className="text-12 text-muted hover:text-danger"
          >
            신청 취소
          </button>
        ),
    },
  ];

  return (
    <Shell>
      <h1 className="text-22 font-bold text-ink">투자 신청 내역</h1>
      <p className="mt-3 text-13 text-muted">전체 {data?.length ?? 0}건</p>

      <div className="mt-6 flex items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`h-[34px] rounded-6 border px-3.5 text-12 ${
              filter === f.key
                ? "border-brand font-medium text-brand"
                : "border-line text-body hover:bg-surface"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? <p className="mt-4 text-12 text-danger">{error}</p> : null}

      <div className="mt-5">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(i) => i.id}
          empty="신청 내역이 없습니다."
        />
      </div>

      <p className="mt-5 text-12 text-muted">
        신청 취소는 모집 마감 전까지만 가능합니다. 미배정분은 마감 후 3영업일 이내 연결 계좌로 환불됩니다.
      </p>
    </Shell>
  );
}

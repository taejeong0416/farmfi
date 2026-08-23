"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  SkeletonBlock,
  type Column,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import { getJson, won } from "../api";
import { AdminShell } from "./AdminShell";

type AdminSubscription = {
  id: string;
  packSize: number;
  perWeek: number;
  monthlyPrice: number;
  status: string;
  user: { id: string; name: string; email: string | null };
  project: { id: string; name: string };
};

type MissedPickup = {
  id: string;
  scheduledAt: string;
  code: string;
  subscription: {
    id: string;
    packSize: number;
    user: { id: string; name: string };
    project: { id: string; name: string };
  };
};

const STATUS_LABEL: Record<string, string> = {
  active: "이용 중",
  paused: "일시정지",
  waitlist: "대기 신청",
};

export function AdminSubscriptionsScreen() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "subscriptions"],
    queryFn: () =>
      getJson<{
        subscriptions: AdminSubscription[];
        missedPickups: MissedPickup[];
        summary: { active: number; paused: number; missed: number };
      }>("/api/admin/subscriptions"),
    retry: false,
  });

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (isLoading) {
    return (
      <AdminShell label="구독·픽업 예외 관리" title="오늘 해결해야 할 예외 건입니다">
        <SkeletonBlock height={360} />
      </AdminShell>
    );
  }

  if (isError || !data) {
    return (
      <AdminShell label="구독·픽업 예외 관리" title="오늘 해결해야 할 예외 건입니다">
        <EmptyState
          title="구독 목록을 볼 수 없습니다"
          desc="관리자로 로그인한 뒤 다시 확인해 주세요."
        />
      </AdminShell>
    );
  }

  async function markPicked(pickup: MissedPickup) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/subscriptions/${pickup.subscription.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "picked", pickupId: pickup.id }),
      });
      if (!res.ok) throw new Error("처리에 실패했습니다.");
      await refetch();
      setNote("수령 완료로 표시했습니다.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "처리에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const missedColumns: Column<MissedPickup>[] = [
    {
      key: "when",
      header: "예정 시각",
      render: (p) => (
        <span className="text-13 text-ink">{formatDate(p.scheduledAt)}</span>
      ),
    },
    {
      key: "who",
      header: "고객",
      render: (p) => p.subscription.user.name,
    },
    {
      key: "where",
      header: "지점",
      render: (p) => (
        <span className="text-12 text-body">{p.subscription.project.name}</span>
      ),
    },
    {
      key: "code",
      header: "확인번호",
      render: (p) => <span className="font-num text-12">{p.code}</span>,
    },
    {
      key: "action",
      header: "처리",
      align: "right",
      width: "140px",
      render: (p) => (
        <button
          type="button"
          disabled={busy}
          onClick={() => void markPicked(p)}
          className="text-12 font-medium text-brand"
        >
          수령 완료 표시
        </button>
      ),
    },
  ];

  const subColumns: Column<AdminSubscription>[] = [
    { key: "user", header: "고객", render: (s) => s.user.name },
    { key: "project", header: "지점", render: (s) => s.project.name },
    {
      key: "plan",
      header: "구성",
      render: (s) => (
        <span className="text-12 text-body">
          {s.packSize}종 · 주 {s.perWeek}회
        </span>
      ),
    },
    {
      key: "price",
      header: "월 결제",
      align: "right",
      width: "130px",
      render: (s) => (
        <span className="font-num text-13">{won(s.monthlyPrice)}</span>
      ),
    },
    {
      key: "status",
      header: "상태",
      align: "right",
      width: "110px",
      render: (s) => (
        <span
          className={`text-12 ${s.status === "active" ? "text-brand" : "text-muted"}`}
        >
          {STATUS_LABEL[s.status] ?? s.status}
        </span>
      ),
    },
  ];

  return (
    <AdminShell
      label="구독·픽업 예외 관리"
      title="오늘 해결해야 할 예외 건입니다"
      desc="자동으로 넘어가지 않은 결제·재고·픽업 건만 담당자가 확인합니다."
      action={
        <Button size="sm" variant="ghost" onClick={() => void refetch()}>
          새로 고침
        </Button>
      }
    >
      <Card padded={false}>
        <div className="grid grid-cols-3">
          <Stat label="이용 중" value={`${data.summary.active}건`} />
          <Stat label="일시정지" value={`${data.summary.paused}건`} bordered />
          <Stat label="미수령" value={`${data.summary.missed}건`} bordered />
        </div>
      </Card>

      {note ? <p className="mt-4 text-12 text-brand">{note}</p> : null}

      <h2 className="mt-8 text-15 font-bold text-ink">픽업 미수령</h2>
      <div className="mt-4">
        <DataTable
          columns={missedColumns}
          rows={data.missedPickups}
          rowKey={(p) => p.id}
          empty="미수령 건이 없습니다."
        />
      </div>

      <h2 className="mt-8 text-15 font-bold text-ink">구독 현황</h2>
      <div className="mt-4">
        <DataTable
          columns={subColumns}
          rows={data.subscriptions}
          rowKey={(s) => s.id}
          empty="구독이 없습니다."
        />
      </div>
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

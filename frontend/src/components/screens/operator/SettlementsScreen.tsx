"use client";

import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Shell,
  SkeletonBlock,
  type Column,
} from "@/components/ui";
import {
  MILESTONE_STATUS_LABEL,
  PAYOUT_STATUS_LABEL,
  milestoneTone,
  num,
  shortDate,
  usePayouts,
  won,
  type PayoutItem,
} from "../api";
import { useOperatorMilestones, type OperatorMilestone } from "./MilestonesScreen";

export function SettlementsScreen() {
  const { data: milestones, isLoading } = useOperatorMilestones();
  const { data: payouts } = usePayouts();

  if (isLoading) {
    return (
      <Shell>
        <SkeletonBlock height={360} />
      </Shell>
    );
  }

  const list = milestones ?? [];
  if (list.length === 0) {
    return (
      <Shell>
        <EmptyState
          title="정산 내역이 없습니다"
          desc="집행이 시작되면 단계별 지급 내역이 쌓입니다."
        />
      </Shell>
    );
  }

  const received = list
    .filter((m) => m.status === "completed")
    .reduce((s, m) => s + m.releaseAmount, 0);
  const scheduled = payouts?.summary.scheduled ?? 0;
  const nextPayout = (payouts?.payouts ?? []).find((p) => p.status === "scheduled");

  const milestoneColumns: Column<OperatorMilestone>[] = [
    {
      key: "step",
      header: "단계",
      render: (m) => (
        <span className="text-13 text-ink">
          {m.seq}단계 {m.name}
        </span>
      ),
    },
    {
      key: "amount",
      header: "집행 금액",
      align: "right",
      width: "150px",
      render: (m) => (
        <span className="font-num text-14 font-medium">
          {won(m.releaseAmount)}
        </span>
      ),
    },
    {
      key: "paid",
      header: "지급일",
      align: "right",
      width: "120px",
      render: (m) => (
        <span className="text-12 text-muted">{shortDate(m.completedAt)}</span>
      ),
    },
    {
      key: "status",
      header: "상태",
      align: "right",
      width: "110px",
      render: (m) => (
        <Badge tone={milestoneTone(m.status)}>
          {MILESTONE_STATUS_LABEL[m.status] ?? m.status}
        </Badge>
      ),
    },
  ];

  const payoutColumns: Column<PayoutItem>[] = [
    { key: "period", header: "기간", render: (p) => p.period },
    { key: "category", header: "항목", render: (p) => p.payeeName },
    {
      key: "amount",
      header: "금액",
      align: "right",
      render: (p) => (
        <span className="font-num text-14 font-medium">{won(p.amount)}</span>
      ),
    },
    {
      key: "status",
      header: "상태",
      align: "right",
      width: "110px",
      render: (p) => (
        <span
          className={`text-12 font-medium ${
            p.status === "paid"
              ? "text-brand"
              : p.status === "failed"
                ? "text-danger"
                : "text-body"
          }`}
        >
          {PAYOUT_STATUS_LABEL[p.status] ?? p.status}
        </span>
      ),
    },
  ];

  return (
    <Shell>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-22 font-bold text-ink">정산 · 지급 내역</h1>
          <p className="mt-3 text-13 text-muted">
            {list[0]?.project.name ?? "-"}
          </p>
        </div>
        <Button size="sm" variant="ghost" href="/api/payouts?format=csv">
          내역 내보내기
        </Button>
      </div>

      <Card className="mt-6" padded={false}>
        <div className="grid grid-cols-3">
          <Stat label="누적 집행 수령액" value={`${num(received)}원`} accent />
          <Stat label="지급 예정액" value={`${num(scheduled)}원`} bordered />
          <Stat
            label="다음 지급 예정"
            value={nextPayout ? nextPayout.period : "-"}
            bordered
          />
        </div>
      </Card>

      <h2 className="mt-8 text-15 font-bold text-ink">단계별 집행 지급</h2>
      <div className="mt-4">
        <DataTable
          columns={milestoneColumns}
          rows={list}
          rowKey={(m) => m.id}
          empty="집행 내역이 없습니다."
        />
      </div>

      <h2 className="mt-8 text-15 font-bold text-ink">정산 지급</h2>
      <div className="mt-4">
        <DataTable
          columns={payoutColumns}
          rows={payouts?.payouts ?? []}
          rowKey={(p) => p.id}
          empty="정산 지급 내역이 없습니다."
        />
      </div>
    </Shell>
  );
}

function Stat({
  label,
  value,
  bordered,
  accent,
}: {
  label: string;
  value: string;
  bordered?: boolean;
  accent?: boolean;
}) {
  return (
    <div className={`px-6 py-5 ${bordered ? "border-l border-line-soft" : ""}`}>
      <p className="text-13 text-muted">{label}</p>
      <p
        className={`mt-1.5 font-num text-24 font-medium ${accent ? "text-brand" : "text-ink"}`}
      >
        {value}
      </p>
    </div>
  );
}

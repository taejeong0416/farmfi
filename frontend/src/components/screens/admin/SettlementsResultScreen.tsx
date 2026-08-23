"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  DataTable,
  SkeletonBlock,
  type Column,
} from "@/components/ui";
import {
  PAYOUT_STATUS_LABEL,
  num,
  retryPayout,
  shortDate,
  usePayouts,
  won,
  type PayoutItem,
} from "../api";
import { AdminShell } from "./AdminShell";

const CATEGORY_LABEL: Record<string, string> = {
  dividend: "투자자 회수금",
  landlord_rent: "임대료",
  operator_settlement: "운영자 정산",
};

export function SettlementsResultScreen() {
  const { data, isLoading, refetch } = usePayouts();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (isLoading) {
    return (
      <AdminShell title="정산 결과">
        <SkeletonBlock height={360} />
      </AdminShell>
    );
  }

  const payouts = data?.payouts ?? [];
  const summary = data?.summary ?? { scheduled: 0, paid: 0, failed: 0 };

  async function process(id: string) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/payouts/${id}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ result: "paid" }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(d?.error ?? "처리에 실패했습니다.");
      }
      await refetch();
      setNote("지급 완료로 기록했습니다.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "처리에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  // 재시도는 어댑터를 다시 태우는 것이다. 사유가 재시도 대상이 아니면 서버가
  // 409로 막으므로, 화면은 버튼을 열지 않는 것으로 먼저 알린다.
  async function retry(id: string) {
    setBusy(true);
    setNote(null);
    try {
      const r = await retryPayout(id);
      await refetch();
      setNote(r.ok ? "지급 완료로 기록했습니다." : (r.error ?? "다시 실패했습니다."));
    } catch (e) {
      setNote(e instanceof Error ? e.message : "재시도에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<PayoutItem>[] = [
    { key: "period", header: "기간", width: "100px", render: (p) => p.period },
    {
      key: "project",
      header: "프로젝트",
      render: (p) => <span className="text-13 text-ink">{p.project.name}</span>,
    },
    {
      key: "category",
      header: "항목",
      width: "140px",
      render: (p) => (
        <span className="text-12 text-body">
          {CATEGORY_LABEL[p.category] ?? p.category}
        </span>
      ),
    },
    { key: "payee", header: "수취인", render: (p) => p.payeeName },
    {
      key: "amount",
      header: "금액",
      align: "right",
      width: "150px",
      render: (p) => (
        <span className="font-num text-14 font-medium">{won(p.amount)}</span>
      ),
    },
    {
      key: "paidAt",
      header: "지급일",
      align: "right",
      width: "110px",
      render: (p) => (
        <span className="text-12 text-muted">{shortDate(p.paidAt)}</span>
      ),
    },
    {
      key: "status",
      header: "상태",
      align: "right",
      width: "230px",
      render: (p) => (
        <div className="flex flex-col items-end gap-1.5">
          <span className="flex items-center justify-end gap-3">
            <Badge
              tone={
                p.status === "paid" ? "pass" : p.status === "failed" ? "fail" : "plain"
              }
            >
              {PAYOUT_STATUS_LABEL[p.status] ?? p.status}
            </Badge>
            {p.status === "scheduled" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void process(p.id)}
                className="text-12 font-medium text-brand"
              >
                지급 확정
              </button>
            ) : null}
            {p.status === "failed" && p.failure?.retryable ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void retry(p.id)}
                className="text-12 font-medium text-brand"
              >
                다시 시도
              </button>
            ) : null}
          </span>
          {p.status === "failed" ? (
            <span className="text-right text-11 leading-4 text-muted">
              {p.failure?.label ?? "확인 필요"}
              {p.retryCount > 0 ? ` · ${p.retryCount}회 시도` : ""}
              <br />
              {p.failure?.hint ?? p.failureReason}
            </span>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <AdminShell
      title="정산 결과"
      desc="기간별 지급 예정·완료 내역. 확정하면 감사 로그에 남는다."
      action={
        <Button size="sm" variant="ghost" href="/api/payouts?format=csv">
          지급 파일 내려받기
        </Button>
      }
    >
      <Card padded={false}>
        <div className="grid grid-cols-3">
          <Stat label="지급 예정" value={`${num(summary.scheduled)}원`} />
          <Stat label="지급 완료" value={`${num(summary.paid)}원`} bordered accent />
          <Stat label="지급 실패" value={`${num(summary.failed)}원`} bordered />
        </div>
      </Card>

      {note ? <p className="mt-4 text-12 text-brand">{note}</p> : null}

      <h2 className="mt-8 text-15 font-bold text-ink">지급 내역</h2>
      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={payouts}
          rowKey={(p) => p.id}
          empty="정산 내역이 없습니다."
        />
      </div>
    </AdminShell>
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
      <p className="text-12 text-muted">{label}</p>
      <p
        className={`mt-1.5 font-num text-22 font-medium ${accent ? "text-brand" : "text-ink"}`}
      >
        {value}
      </p>
    </div>
  );
}

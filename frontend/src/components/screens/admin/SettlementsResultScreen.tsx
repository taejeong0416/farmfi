"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  postJson,
  retryPayout,
  shortDate,
  useProjects,
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

/** 이번 달 앞의 달 — 매출이 마감된 기간이 정산 대상이다. */
function lastPeriod(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type PlanResponse = {
  plan: {
    period: string;
    operatorRevenue: number;
    operatingCost: number;
    feePool: {
      feePool: number;
      investorDividend: number;
      farmfiOperating: number;
      band: "deficit" | "surplus";
      investorShare: number;
    };
    total: number;
  };
};

export function SettlementsResultScreen() {
  const { data, isLoading, refetch } = usePayouts();
  const { data: projects } = useProjects();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const [period, setPeriod] = useState(lastPeriod());

  useEffect(() => {
    if (!projectId && projects && projects.length > 0) setProjectId(projects[0].id);
  }, [projects, projectId]);

  // 산출은 등록하지 않고 계산만 한다(dryRun). 확정을 눌러야 지급 줄이 생긴다.
  const {
    data: plan,
    isFetching: planLoading,
    refetch: recalc,
  } = useQuery({
    queryKey: ["payout-plan", projectId, period],
    queryFn: () =>
      postJson<PlanResponse>("/api/payouts", { projectId, period, dryRun: true }),
    select: (d) => d.plan,
    enabled: Boolean(projectId && period),
    retry: false,
  });

  const rows = useMemo(() => {
    if (!plan) return [];
    const distributable = plan.feePool.feePool;
    const investor = plan.feePool.investorDividend;
    const operator = plan.feePool.farmfiOperating;
    return [
      {
        label: "변동비 · 고정 운영비",
        amount: plan.operatingCost,
        basis: "매출에서 먼저 반영",
        state: "반영 완료",
      },
      {
        label: "투자자 월 회수액",
        amount: investor,
        basis: `배분율 ${Math.round(plan.feePool.investorShare * 100)}%`,
        state: "회수 예정",
      },
      {
        label: "운영자 실수령",
        amount: operator,
        basis: "월 회수액 반영 후 잔여액",
        state: "지급 예정",
      },
      {
        label: "미배분액",
        amount: distributable - investor - operator,
        basis: "미달분 없음",
        state: "—",
      },
    ];
  }, [plan]);

  async function confirmSettlement() {
    setBusy(true);
    setNote(null);
    try {
      await postJson("/api/payouts", { projectId, period });
      await refetch();
      setNote("지급 예정으로 등록했습니다.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "확정에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <AdminShell title="이번 정산의 결과를 확인해요">
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
      title="이번 정산의 결과를 확인해요"
      desc="확정 시 지급 파일이 생성되고 각 포털에 상태가 반영됩니다."
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={planLoading}
            onClick={() => void recalc()}
            className="h-8 rounded-6 border border-line px-3.5 text-11 font-medium text-ink hover:bg-surface disabled:opacity-50"
          >
            {planLoading ? "계산 중" : "재계산"}
          </button>
          <button
            type="button"
            disabled={busy || !plan}
            onClick={() => void confirmSettlement()}
            className="h-8 rounded-6 bg-brand px-3.5 text-11 font-medium text-white disabled:opacity-50"
          >
            결과 확정
          </button>
        </div>
      }
    >
      {/* `.fig` A-11 — 지점·기간을 고르고 그 달의 산출을 본다. */}
      <div className="mb-5 flex items-center gap-3">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="h-9 rounded-6 border border-line px-3 text-12 text-ink outline-none"
        >
          {(projects ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          placeholder="YYYY-MM"
          className="h-9 w-[110px] rounded-6 border border-line px-3 text-12 text-ink outline-none"
        />
        <span className="text-12 text-muted">
          {plan ? "산출 완료" : planLoading ? "산출 중" : "산출 대기"}
        </span>
      </div>

      <Card padded={false}>
        <div className="grid grid-cols-4">
          <Stat
            label="기간 매출"
            value={`${num(plan?.operatorRevenue ?? 0)}원`}
          />
          <Stat
            label="운영 비용"
            value={`${num(plan?.operatingCost ?? 0)}원`}
            bordered
          />
          <Stat
            label="분배 대상"
            value={`${num(plan?.feePool.feePool ?? 0)}원`}
            bordered
            accent
          />
          <Stat
            label="손익 구간"
            value={plan?.feePool.band === "deficit" ? "미달" : "정산 가능"}
            bordered
          />
        </div>
      </Card>

      <h2 className="mt-8 text-15 font-bold text-ink">산출 항목</h2>
      <Card className="mt-4" padded={false}>
        <div className="grid grid-cols-[1fr_160px_220px_100px] border-b border-line-soft px-6 py-3 text-12 text-muted">
          <span>산출 항목</span>
          <span className="text-right">금액</span>
          <span className="pl-8">산정 기준</span>
          <span className="text-right">상태</span>
        </div>
        <div className="px-6">
          {rows.length === 0 ? (
            <p className="py-10 text-center text-12 text-muted">
              지점과 기간을 고르면 산출됩니다.
            </p>
          ) : (
            rows.map((r) => (
              <div
                key={r.label}
                className="grid grid-cols-[1fr_160px_220px_100px] items-center border-b border-surface py-3.5 last:border-b-0"
              >
                <span className="text-13 text-ink">{r.label}</span>
                <span className="text-right font-num text-13 text-ink">
                  {num(r.amount)}원
                </span>
                <span className="pl-8 text-12 text-body">{r.basis}</span>
                <span className="text-right text-12 font-medium text-brand">
                  {r.state}
                </span>
              </div>
            ))
          )}
        </div>
      </Card>

      <p className="mt-4 text-12 text-muted">
        확정 시 지급 파일이 생성되고 각 포털에 상태가 반영됩니다.
      </p>

      <Card className="mt-6" padded={false}>
        <div className="grid grid-cols-3">
          <Stat label="지급 예정" value={`${num(summary.scheduled)}원`} />
          <Stat label="지급 완료" value={`${num(summary.paid)}원`} bordered accent />
          <Stat label="지급 실패" value={`${num(summary.failed)}원`} bordered />
        </div>
      </Card>

      {note ? <p className="mt-4 text-12 text-brand">{note}</p> : null}

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-15 font-bold text-ink">지급 내역</h2>
        <Button size="sm" variant="ghost" href="/api/payouts?format=csv">
          지급 파일 생성
        </Button>
      </div>
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

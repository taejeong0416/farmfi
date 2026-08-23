"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  DataTable,
  Select,
  SkeletonBlock,
  type Column,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import { getJson, postJson, won } from "../api";
import { AdminShell } from "./AdminShell";

/**
 * 보유 구좌 발행 현황 (v2.1).
 *
 * 투자자 화면에는 발행도 지갑도 나오지 않는다. 체인 전송이 막히면 "입금은 됐는데
 * 원장에 없는" 상태로 남으므로, 그걸 사람이 볼 수 있는 곳이 여기 하나다.
 */

type Issuance = {
  id: string;
  eventId: string;
  units: number;
  method: string;
  status: string;
  chainTxHash: string | null;
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  occurredAt: string;
  settledAt: string | null;
  investment: {
    id: string;
    amount: number;
    units: number;
    user: { id: string; name: string };
    project: { id: string; name: string };
  };
  wallet: { chainAddress: string; status: string };
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "대기",
  SENT: "전송됨",
  CONFIRMED: "발행 완료",
  CHAIN_FAILED: "체인 실패",
  CANCELLED: "취소",
};

/** 실패만 색으로 튀게 한다. 나머지는 글자로 구분한다. */
function tone(status: string): string {
  if (status === "CHAIN_FAILED") return "text-danger";
  if (status === "CONFIRMED") return "text-brand";
  return "text-body";
}

function shortAddr(addr: string): string {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export function IssuancesScreen() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-issuances", status],
    queryFn: () =>
      getJson<{ issuances: Issuance[]; counts: Record<string, number> }>(
        status ? `/api/admin/issuances?status=${status}` : "/api/admin/issuances",
      ),
    refetchInterval: 15000,
  });

  const retry = useMutation({
    mutationFn: (id?: string) =>
      postJson<{ processed?: number; confirmed?: number; failed?: number; result?: string }>(
        "/api/admin/issuances",
        id ? { id } : {},
      ),
    onSuccess: (res) => {
      setMessage(
        res.result
          ? `재시도 결과 ${res.result}`
          : `처리 ${res.processed ?? 0}건 · 발행 완료 ${res.confirmed ?? 0}건 · 실패 ${res.failed ?? 0}건`,
      );
      qc.invalidateQueries({ queryKey: ["admin-issuances"] });
    },
    onError: (e) => setMessage(e instanceof Error ? e.message : "처리에 실패했습니다."),
  });

  const counts = data?.counts ?? {};
  const rows = data?.issuances ?? [];

  const columns: Column<Issuance>[] = [
    {
      key: "investor",
      header: "투자자 · 프로젝트",
      render: (r) => (
        <div>
          <p className="text-13 text-ink">{r.investment.user.name}</p>
          <p className="mt-0.5 text-12 text-muted">{r.investment.project.name}</p>
        </div>
      ),
    },
    {
      key: "units",
      header: "구좌",
      align: "right",
      width: "90px",
      render: (r) => <span className="font-num text-14">{r.units}</span>,
    },
    {
      key: "amount",
      header: "납입액",
      align: "right",
      width: "130px",
      render: (r) => (
        <span className="font-num text-13 text-body">{won(r.investment.amount)}</span>
      ),
    },
    {
      key: "status",
      header: "상태",
      width: "110px",
      render: (r) => (
        <span className={`text-12 font-medium ${tone(r.status)}`}>
          {STATUS_LABEL[r.status] ?? r.status}
          {r.attempts > 1 ? ` (${r.attempts}회)` : ""}
        </span>
      ),
    },
    {
      key: "wallet",
      header: "수탁 지갑",
      width: "130px",
      render: (r) => (
        <span className="font-num text-12 text-muted">{shortAddr(r.wallet.chainAddress)}</span>
      ),
    },
    {
      key: "tx",
      header: "체인 기록",
      width: "150px",
      render: (r) =>
        r.chainTxHash ? (
          <span className="font-num text-12 text-body">{r.chainTxHash.slice(0, 14)}…</span>
        ) : (
          <span className="text-12 text-muted">—</span>
        ),
    },
    {
      key: "when",
      header: "발생",
      width: "150px",
      render: (r) => <span className="text-12 text-muted">{formatDate(r.occurredAt)}</span>,
    },
    {
      key: "action",
      header: "",
      width: "90px",
      render: (r) =>
        r.status === "CONFIRMED" || r.status === "CANCELLED" ? (
          <span className="text-12 text-muted">—</span>
        ) : (
          <button
            type="button"
            className="text-12 font-medium text-brand disabled:text-muted"
            disabled={retry.isPending}
            onClick={() => retry.mutate(r.id)}
          >
            재시도
          </button>
        ),
    },
  ];

  return (
    <AdminShell
      label="보유 구좌 발행"
      title="보유 구좌 발행"
      desc="입금이 확인된 신청은 투자자 수탁 지갑 앞으로 구좌가 발행됩니다. 체인 전송이 막힌 건은 여기서 다시 태웁니다."
      action={
        <Button variant="ghost" disabled={retry.isPending} onClick={() => retry.mutate(undefined)}>
          {retry.isPending ? "처리 중" : "대기 건 전체 처리"}
        </Button>
      }
    >
      <div className="grid grid-cols-5 gap-3">
        {(["PENDING", "SENT", "CONFIRMED", "CHAIN_FAILED", "CANCELLED"] as const).map((s) => (
          <Card key={s}>
            <p className="text-12 text-muted">{STATUS_LABEL[s]}</p>
            <p className={`mt-1.5 font-num text-24 font-medium ${tone(s)}`}>
              {counts[s] ?? 0}
            </p>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <div className="w-[200px]">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">전체 상태</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </div>
        {message ? <p className="text-12 text-body">{message}</p> : null}
      </div>

      {/* 실패 건은 사유가 목록 밖에 있으면 안 보인다. 표 위에 따로 세운다. */}
      {rows.some((r) => r.status === "CHAIN_FAILED") ? (
        <div className="mt-6 space-y-2">
          {rows
            .filter((r) => r.status === "CHAIN_FAILED")
            .map((r) => (
              <div
                key={r.id}
                className="rounded-8 border border-line bg-surface px-5 py-4"
              >
                <p className="text-13 font-medium text-danger">
                  {r.investment.user.name} · {r.units}구좌 발행 실패 ({r.attempts}회 시도)
                </p>
                <p className="mt-1.5 break-all text-12 text-body">
                  {r.lastError ?? "사유 기록 없음"}
                </p>
              </div>
            ))}
        </div>
      ) : null}

      <div className="mt-6">
        {isLoading ? (
          <SkeletonBlock height={320} />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            empty="발행 건이 없습니다."
          />
        )}
      </div>
    </AdminShell>
  );
}

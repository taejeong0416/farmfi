"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Card,
  DataTable,
  SkeletonBlock,
  type Column,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import { getJson, num, usePortfolio, won } from "../api";
import { AdminShell } from "./AdminShell";

type AuditLog = {
  id: string;
  action: string;
  actorRole: string | null;
  summary: string;
  createdAt: string;
  detail: unknown;
};

type Flag = {
  id: string;
  at: string;
  title: string;
  target: string;
  risk: "high" | "mid";
};

/**
 * 이상거래 판단은 감사 로그에서 끌어온다.
 * 고위험 — 같은 계정이 하루에 여러 건 청약 / 기한 초과 실패.
 * 중위험 — 검증 반려·보류, 지급 실패.
 */
function detectFlags(logs: AuditLog[]): Flag[] {
  const flags: Flag[] = [];
  const byDayActor = new Map<string, AuditLog[]>();

  for (const log of logs) {
    if (log.action === "subscription.created") {
      const day = log.createdAt.slice(0, 10);
      const key = `${day}|${log.summary.split(" ")[0]}`;
      const list = byDayActor.get(key) ?? [];
      list.push(log);
      byDayActor.set(key, list);
    }
    if (log.action === "milestone.timeout") {
      flags.push({
        id: log.id,
        at: log.createdAt,
        title: "마일스톤 기한 초과",
        target: log.summary,
        risk: "high",
      });
    }
    if (log.action === "milestone.rejected" || log.action === "payout.processed") {
      if (log.summary.includes("실패") || log.action === "milestone.rejected") {
        flags.push({
          id: log.id,
          at: log.createdAt,
          title:
            log.action === "milestone.rejected" ? "검증 반려" : "지급 실패",
          target: log.summary,
          risk: "mid",
        });
      }
    }
  }

  for (const [key, list] of byDayActor) {
    if (list.length >= 3) {
      flags.push({
        id: `burst-${key}`,
        at: list[0].createdAt,
        title: `하루 ${list.length}건 연속 청약`,
        target: list[0].summary,
        risk: "high",
      });
    }
  }

  return flags.sort((a, b) => b.at.localeCompare(a.at));
}

export function AmlScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", "aml"],
    queryFn: () => getJson<{ logs: AuditLog[] }>("/api/audit-logs"),
    select: (d) => d.logs,
    retry: false,
  });
  const { data: portfolio } = usePortfolio();

  const flags = useMemo(() => detectFlags(data ?? []), [data]);
  const high = flags.filter((f) => f.risk === "high");

  const columns: Column<Flag>[] = [
    {
      key: "at",
      header: "탐지 시각",
      width: "160px",
      render: (f) => (
        <span className="text-12 text-muted">{formatDate(f.at)}</span>
      ),
    },
    {
      key: "title",
      header: "내용",
      width: "200px",
      render: (f) => <span className="text-13 text-ink">{f.title}</span>,
    },
    {
      key: "target",
      header: "대상",
      render: (f) => <span className="text-12 text-body">{f.target}</span>,
    },
    {
      key: "risk",
      header: "위험도",
      align: "right",
      width: "100px",
      render: (f) => (
        <Badge tone={f.risk === "high" ? "fail" : "plain"}>
          {f.risk === "high" ? "고위험" : "중위험"}
        </Badge>
      ),
    },
    {
      key: "action",
      header: "처리",
      align: "right",
      width: "90px",
      render: () => (
        <span className="text-12 font-medium text-brand">검토</span>
      ),
    },
  ];

  return (
    <AdminShell
      title="의심 거래를 탐지하고 조치해요"
      desc="탐지 건은 청약 · 집행을 자동 차단하지 않으며, 검토 결과에 따라 계정 정지 또는 청약 제한이 적용됩니다."
      action={
        <span className="text-12 text-muted">
          미처리 {high.length}건 · 전체 {flags.length}건
        </span>
      }
    >
      <Card padded={false}>
        <div className="grid grid-cols-3">
          <Stat label="고위험" value={`${high.length}건`} />
          <Stat
            label="중위험"
            value={`${flags.length - high.length}건`}
            bordered
          />
          <Stat
            label="누적 청약액"
            value={`${num(portfolio?.summary.totalInvested ?? 0)}원`}
            bordered
          />
        </div>
      </Card>

      <h2 className="mt-8 text-15 font-bold text-ink">탐지 목록</h2>
      <div className="mt-4">
        {isLoading ? (
          <SkeletonBlock height={280} />
        ) : (
          <DataTable
            columns={columns}
            rows={flags}
            rowKey={(f) => f.id}
            empty="탐지된 이상 흐름이 없습니다."
          />
        )}
      </div>

      <p className="mt-5 text-12 text-muted">
        연간 투자한도 초과와 본인확인 미완료 청약은 API 단계에서 이미 거부되므로 이 목록에 오르지 않습니다.
        기록된 금액 기준은 원천징수 전입니다{" "}
        {portfolio ? `(누적 ${won(portfolio.summary.totalInvested)})` : ""}.
      </p>
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

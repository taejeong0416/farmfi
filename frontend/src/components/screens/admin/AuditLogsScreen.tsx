"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  DataTable,
  Field,
  Select,
  SkeletonBlock,
  TextInput,
  type Column,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import { getJson } from "../api";
import { AdminShell } from "./AdminShell";

type AuditLog = {
  id: string;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  projectId: string | null;
  summary: string;
  createdAt: string;
};

const ACTION_LABEL: Record<string, string> = {
  "subscription.created": "투자 신청",
  "milestone.evidence.submitted": "증빙 제출",
  "milestone.evidence.approved": "증빙 승인",
  "milestone.evidence.revision_requested": "보완 요청",
  "milestone.verified": "검증 통과",
  "milestone.rejected": "검증 반려",
  "milestone.completed": "집행 완료",
  "milestone.timeout": "기한 초과",
  "appeal.submitted": "이의제기 접수",
  "appeal.commented": "이의제기 의견",
  "appeal.decided": "이의제기 판정",
  "dividend.distributed": "회수금 분배",
  "settlement_rule.updated": "정산 규칙 변경",
  "payout.scheduled": "지급 등록",
  "payout.processed": "지급 처리",
  "project.status_changed": "프로젝트 상태 변경",
  "project.refunded": "환불",
  "user.role_changed": "권한 변경",
  "notification.sent": "알림 발송",
};

const ROLE_LABEL: Record<string, string> = {
  investor: "투자자",
  operator: "운영자",
  landlord: "공간주",
  admin: "관리자",
  auditor: "감사",
  system: "시스템",
};

export function AuditLogsScreen() {
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", action],
    queryFn: () =>
      getJson<{ logs: AuditLog[]; actions: string[] }>(
        action ? `/api/audit-logs?action=${action}` : "/api/audit-logs",
      ),
    retry: false,
  });

  const rows = useMemo(() => {
    const logs = data?.logs ?? [];
    if (!q.trim()) return logs;
    const key = q.trim().toLowerCase();
    return logs.filter(
      (l) =>
        l.summary.toLowerCase().includes(key) ||
        l.action.toLowerCase().includes(key),
    );
  }, [data, q]);

  const columns: Column<AuditLog>[] = [
    {
      key: "at",
      header: "시각",
      width: "160px",
      render: (l) => (
        <span className="text-12 text-muted">{formatDate(l.createdAt)}</span>
      ),
    },
    {
      key: "action",
      header: "이벤트",
      width: "160px",
      render: (l) => (
        <span className="text-13 text-ink">
          {ACTION_LABEL[l.action] ?? l.action}
        </span>
      ),
    },
    {
      key: "summary",
      header: "대상 · 내용",
      render: (l) => <span className="text-13 text-body">{l.summary}</span>,
    },
    {
      key: "actor",
      header: "행위자",
      align: "right",
      width: "110px",
      render: (l) => (
        <span className="text-12 text-muted">
          {l.actorRole ? (ROLE_LABEL[l.actorRole] ?? l.actorRole) : "-"}
        </span>
      ),
    },
  ];

  return (
    <AdminShell
      title="감사 로그 조회"
      desc="청약·검증·집행·정산·권한 변경 기록. 지우거나 고칠 수 없다."
      action={
        <Button size="sm" variant="ghost" href="/api/audit-logs?format=csv">
          CSV 내보내기
        </Button>
      }
    >
      <div className="mb-5 flex items-end gap-3">
        <div className="w-[280px]">
          <Field label="이벤트">
            <Select value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">전체</option>
              {(data?.actions ?? []).map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABEL[a] ?? a}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex-1">
          <Field label="검색">
            <TextInput
              placeholder="이벤트 · 대상 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </Field>
        </div>
      </div>

      {isLoading ? (
        <SkeletonBlock height={320} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(l) => l.id}
          empty="기록이 없습니다."
        />
      )}
    </AdminShell>
  );
}

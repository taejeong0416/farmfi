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
import { getJson, useProjects } from "../api";
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
  "pickup.completed": "픽업 수령 완료",
  "period_record.confirmed": "매출·비용 확정",
  "setpoint.applied": "설정점 적용",
  "credential.issued": "보증서 발급",
  "credential.status_changed": "보증서 상태 변경",
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

/** 한 번에 보여줄 줄 수. `다음`을 누르면 이만큼씩 더 편다. */
const PAGE = 30;

export function AuditLogsScreen() {
  const [action, setAction] = useState("");
  const [projectId, setProjectId] = useState("");
  const [actor, setActor] = useState("");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const { data: projects } = useProjects();

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", action],
    queryFn: () =>
      getJson<{ logs: AuditLog[]; actions: string[] }>(
        action ? `/api/audit-logs?action=${action}` : "/api/audit-logs",
      ),
    retry: false,
  });

  /** 행위자 목록은 로그에서 뽑는다 — 따로 내려주는 API가 없다. */
  const actors = useMemo(() => {
    const set = new Set<string>();
    for (const l of data?.logs ?? []) {
      if (l.actorRole) set.add(ROLE_LABEL[l.actorRole] ?? l.actorRole);
    }
    return [...set].sort();
  }, [data]);

  const rows = useMemo(() => {
    let logs = data?.logs ?? [];
    if (projectId) logs = logs.filter((l) => l.projectId === projectId);
    if (actor) {
      logs = logs.filter(
        (l) => (ROLE_LABEL[l.actorRole ?? ""] ?? l.actorRole) === actor,
      );
    }
    if (!q.trim()) return logs;
    const key = q.trim().toLowerCase();
    return logs.filter(
      (l) =>
        l.summary.toLowerCase().includes(key) ||
        l.action.toLowerCase().includes(key),
    );
  }, [data, q, projectId, actor]);

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
      title="모든 변경 이력을 감사 로그로 확인해요"
      desc="청약·검증·집행·정산·권한 변경 기록. 지우거나 고칠 수 없다."
      action={
        <Button size="sm" variant="ghost" href="/api/audit-logs?format=csv">
          CSV 내보내기
        </Button>
      }
    >
      {/* `.fig` A-12 — 프로젝트·이벤트·사용자 세 갈래로 좁히고 검색한다. */}
      <div className="mb-5 flex items-end gap-3">
        <div className="w-[220px]">
          <Field label="프로젝트">
            <Select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">프로젝트 전체</option>
              {(projects ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-[220px]">
          <Field label="사용자">
            <Select value={actor} onChange={(e) => setActor(e.target.value)}>
              <option value="">사용자 전체</option>
              {actors.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-[240px]">
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
        <>
          <DataTable
            columns={columns}
            rows={rows.slice(0, shown)}
            rowKey={(l) => l.id}
            empty="기록이 없습니다."
          />
          {rows.length > shown ? (
            <div className="mt-4 text-center">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShown((n) => n + PAGE)}
              >
                다음
              </Button>
            </div>
          ) : null}
        </>
      )}
    </AdminShell>
  );
}

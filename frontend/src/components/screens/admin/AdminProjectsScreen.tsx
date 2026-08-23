"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  DataTable,
  SkeletonBlock,
  type Column,
} from "@/components/ui";
import {
  PROJECT_STATUS_LABEL,
  postJson,
  shortDate,
  useProjects,
  won,
  type ProjectSummary,
} from "../api";
import { AdminShell } from "./AdminShell";

const FILTERS = [
  { key: "all", label: "상태 전체" },
  { key: "funding", label: "모집 중" },
  { key: "funded", label: "모집 완료" },
  { key: "operating", label: "운영 중" },
  { key: "paused", label: "중지" },
] as const;

export function AdminProjectsScreen() {
  const { data: projects, isLoading } = useProjects();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    let list = projects ?? [];
    if (filter !== "all") list = list.filter((p) => p.status === filter);
    if (q.trim()) {
      const key = q.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(key));
    }
    return list;
  }, [projects, filter, q]);

  // 사유는 감사 로그에 남으므로 라우트가 필수로 요구한다.
  async function act(id: string, action: string, reason: string) {
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/projects/${id}/status`, { action, reason });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "상태 변경에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<ProjectSummary>[] = [
    {
      key: "name",
      header: "프로젝트명",
      render: (p) => (
        <Link href={`/projects/${p.id}`} className="text-13 text-ink">
          {p.name}
        </Link>
      ),
    },
    {
      key: "location",
      header: "위치",
      render: (p) => (
        <span className="text-12 text-muted">{p.location ?? "-"}</span>
      ),
    },
    {
      key: "amount",
      header: "모금",
      align: "right",
      width: "200px",
      render: (p) => (
        <span className="font-num text-12 text-body">
          {won(p.currentAmount)} / {won(p.targetAmount)}
        </span>
      ),
    },
    {
      key: "status",
      header: "상태",
      width: "110px",
      render: (p) => (
        <Badge tone={p.status === "funding" ? "pass" : "plain"}>
          {PROJECT_STATUS_LABEL[p.status] ?? p.status}
        </Badge>
      ),
    },
    {
      key: "created",
      header: "등록일",
      align: "right",
      width: "110px",
      render: (p) => (
        <span className="text-12 text-muted">{shortDate(p.fundingEnd)}</span>
      ),
    },
    {
      key: "action",
      header: "처리",
      align: "right",
      width: "200px",
      render: (p) => (
        <span className="flex justify-end gap-2">
          <Link
            href={`/admin/projects/${p.id}/milestones`}
            className="text-12 font-medium text-brand"
          >
            마일스톤
          </Link>
          {p.status === "upcoming" ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(p.id, "approve", "관리자 심사 통과")}
                className="text-12 text-muted hover:text-brand"
              >
                승인
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(p.id, "reject", "관리자 심사 반려")}
                className="text-12 text-muted hover:text-danger"
              >
                반려
              </button>
            </>
          ) : p.status === "paused" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act(p.id, "resume", "관리자 재개")}
              className="text-12 text-muted hover:text-brand"
            >
              재개
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act(p.id, "suspend", "관리자 중지")}
              className="text-12 text-muted hover:text-danger"
            >
              중지
            </button>
          )}
        </span>
      ),
    },
  ];

  return (
    <AdminShell
      title="투자 프로젝트를 한눈에 확인하고 관리해요"
      desc="사유를 입력하면 감사 로그에 함께 저장됩니다."
      action={
        <Button size="sm" variant="ghost" href="/admin/evidence">
          증빙 재검토
        </Button>
      }
    >
      <div className="mb-5 flex items-center gap-2">
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
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="프로젝트 검색"
          className="ml-auto h-[34px] w-[240px] rounded-6 border border-line px-3.5 text-12 text-ink outline-none placeholder:text-muted focus:border-brand"
        />
      </div>

      {error ? <p className="mb-4 text-12 text-danger">{error}</p> : null}

      {isLoading ? (
        <SkeletonBlock height={320} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(p) => p.id}
          empty="조건에 맞는 프로젝트가 없습니다."
        />
      )}
    </AdminShell>
  );
}

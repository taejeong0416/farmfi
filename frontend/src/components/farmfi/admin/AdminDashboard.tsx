"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Section, Metric } from "@/components/FarmFi";
import { formatKRW } from "@/lib/format";
import { MilestoneVerifyPanel, type AdminMilestone } from "./MilestoneVerifyPanel";

interface AdminProject {
  id: string;
  name: string;
  status: string;
  currentAmount: number;
  targetAmount: number;
  escrow: { totalLocked: number; totalReleased: number; remaining: number } | null;
  milestones: AdminMilestone[];
}

const ADMIN_PROJECT_QUERY_KEY = ["admin", "project"] as const;

async function fetchAdminProject(): Promise<AdminProject> {
  const listRes = await fetch("/api/projects");
  if (!listRes.ok) throw new Error("프로젝트 목록을 불러오지 못했습니다.");
  const listData = (await listRes.json()) as { projects: { id: string }[] };
  const first = listData.projects?.[0];
  if (!first) {
    throw new Error("프로젝트가 없습니다. 데모 초기화(/demo에서 처음부터)를 먼저 실행하세요.");
  }

  const detailRes = await fetch(`/api/projects/${first.id}`);
  if (!detailRes.ok) throw new Error("프로젝트 상세 정보를 불러오지 못했습니다.");
  return (await detailRes.json()) as AdminProject;
}

export function AdminDashboard() {
  const queryClient = useQueryClient();

  const { data: project, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ADMIN_PROJECT_QUERY_KEY,
    queryFn: fetchAdminProject,
  });

  const handleChanged = () => {
    queryClient.invalidateQueries({ queryKey: ADMIN_PROJECT_QUERY_KEY });
  };

  return (
    <main className="page">
      <Section
        title="관리자 · 마일스톤 검증"
        desc="증빙(계약서/영수증/사진)을 업로드해 AI 검증을 실행하고, 통과한 마일스톤의 트랜치를 해제합니다."
        aside={
          <button className="ghost" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "새로고침 중…" : "새로고침"}
          </button>
        }
      >
        {isLoading ? <p className="muted">불러오는 중…</p> : null}

        {isError ? (
          <div className="card" style={{ padding: 18 }}>
            <p style={{ color: "#c0392b", fontWeight: 800 }}>
              {error instanceof Error ? error.message : "알 수 없는 오류"}
            </p>
          </div>
        ) : null}

        {project ? (
          <>
            <div className="stats-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
              <Metric label="모집 금액" value={`${formatKRW(project.currentAmount)} / ${formatKRW(project.targetAmount)}`} />
              <Metric label="에스크로 보관액" value={formatKRW(project.escrow?.remaining ?? 0)} />
              <Metric label="총 해제액" value={formatKRW(project.escrow?.totalReleased ?? 0)} />
              <Metric
                label="마일스톤 진행"
                value={`${project.milestones.filter((m) => m.status === "completed").length} / ${project.milestones.length} 완료`}
              />
            </div>

            <div style={{ display: "grid", gap: 18, marginTop: 24 }}>
              {project.milestones
                .slice()
                .sort((a, b) => a.seq - b.seq)
                .map((m) => (
                  <MilestoneVerifyPanel key={m.id} milestone={m} onChanged={handleChanged} />
                ))}
            </div>
          </>
        ) : null}
      </Section>
    </main>
  );
}

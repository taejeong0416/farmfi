"use client";

import { useQuery } from "@tanstack/react-query";
import { ProjectStatus } from "@/lib/constants";

type StatsProject = {
  id: string;
  status: string;
  currentAmount: number;
  targetAmount: number;
  areaSqm: number | null;
  investorCount: number;
  escrow: { remaining: number } | null;
};

type ProjectsResponse = { projects: StatsProject[] };

type SpaceItem = { id: string; status: string };

type SpacesResponse = { spaces: SpaceItem[] };

async function fetchProjects(): Promise<ProjectsResponse> {
  const res = await fetch("/api/projects");
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

async function fetchSpaces(): Promise<SpacesResponse> {
  const res = await fetch("/api/spaces");
  if (!res.ok) throw new Error("Failed to fetch spaces");
  return res.json();
}

function won(amount: number): string {
  return `₩${Math.round(amount).toLocaleString("ko-KR")}`;
}

// Shown while loading and if a request fails, so the section never renders
// empty. Kept in the same shape/order as the real computed stats.
const FALLBACK_STATS: [string, string, string][] = [
  ["총 프로젝트 수", "1 개", "진행 중 1 · 완료 0"],
  ["누적 투자금", "₩0", "목표 대비 0%"],
  ["임점 공간 수", "0 개", "승인 대기 중"],
  ["에스크로 보관액", "₩0", "투명하게 관리 중"],
  ["ESG 임팩트", "0.0 tCO₂", "연간 탄소 절감 효과"],
];

export function Stats() {
  const {
    data: projectsData,
    isError: projectsError,
  } = useQuery({
    queryKey: ["projects", "stats"],
    queryFn: fetchProjects,
  });

  // `/api/spaces` lists Space submissions (rooftop/vacant-store/indoor slots
  // landlords register). "임점 공간 수" = spaces that passed review.
  const { data: spacesData, isError: spacesError } = useQuery({
    queryKey: ["spaces", "stats"],
    queryFn: fetchSpaces,
  });

  const projects = projectsData?.projects;
  const spaces = spacesData?.spaces;

  const stats: [string, string, string][] =
    projects && !projectsError
      ? (() => {
          const total = projects.length;
          const completed = projects.filter(
            (p) => p.status === ProjectStatus.COMPLETED,
          ).length;
          const inProgress = total - completed;

          const currentSum = projects.reduce(
            (sum, p) => sum + Number(p.currentAmount),
            0,
          );
          const targetSum = projects.reduce(
            (sum, p) => sum + Number(p.targetAmount),
            0,
          );
          const fundingPercent =
            targetSum > 0 ? Math.round((currentSum / targetSum) * 100) : 0;

          const escrowSum = projects.reduce(
            (sum, p) => sum + Number(p.escrow?.remaining ?? 0),
            0,
          );
          const co2Sum = projects.reduce(
            (sum, p) => sum + (p.areaSqm ?? 0) * 2.5,
            0,
          );

          const spaceTotal = spaces && !spacesError ? spaces.length : null;
          const spaceApproved =
            spaces && !spacesError
              ? spaces.filter((s) => s.status === "approved").length
              : null;

          return [
            [
              "총 프로젝트 수",
              `${total} 개`,
              `진행 중 ${inProgress} · 완료 ${completed}`,
            ],
            ["누적 투자금", won(currentSum), `목표 대비 ${fundingPercent}%`],
            [
              "임점 공간 수",
              spaceApproved !== null ? `${spaceApproved} 개` : "- 개",
              spaceTotal !== null
                ? `전체 신청 ${spaceTotal}건 중 승인`
                : "공간 데이터 불러오는 중",
            ],
            ["에스크로 보관액", won(escrowSum), "투명하게 관리 중"],
            ["ESG 임팩트", `${co2Sum.toFixed(1)} tCO₂`, "연간 탄소 절감 효과"],
          ] as [string, string, string][];
        })()
      : FALLBACK_STATS;

  return (
    <div className="stats-grid">
      {stats.map(([label, value, desc]) => (
        <article className="card metric" key={label}>
          <span className="muted">{label}</span>
          <strong>{value}</strong>
          <p className="muted">{desc}</p>
        </article>
      ))}
    </div>
  );
}

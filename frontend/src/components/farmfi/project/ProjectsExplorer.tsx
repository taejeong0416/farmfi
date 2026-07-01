"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { formatKRW } from "@/lib/format";
import { Section } from "../ui/Section";
import { ProjectGrid } from "../home/ProjectGrid";
import { StatBox } from "./StatBox";
import { ProjectFilterBar, type ProjectFilters } from "./ProjectFilterBar";
import { fetchProjects, projectsQueryKey } from "./api";

/**
 * Client-side data + filter state for the /projects page. Owns the single
 * `useQuery(["projects"])` fetch that both the stats row and the grid read
 * from (react-query dedupes/caches by key, so ProjectGrid's own internal
 * query — used standalone on the home page — never double-fetches here
 * because we pass `projects`/`isLoading` explicitly, putting it in
 * "controlled" mode).
 */
export function ProjectsExplorer() {
  const { data, isLoading, isError } = useQuery({
    queryKey: projectsQueryKey(),
    queryFn: fetchProjects,
  });

  const [filters, setFilters] = useState<ProjectFilters>({ search: "", status: "all" });

  const projects = data ?? [];

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return projects.filter((p) => {
      const matchesStatus = filters.status === "all" || p.status === filters.status;
      const matchesSearch =
        q === "" ||
        p.name.toLowerCase().includes(q) ||
        (p.location ?? "").toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [projects, filters]);

  const fundingCount = projects.filter((p) => p.status === "funding").length;
  const totalRaised = projects.reduce((sum, p) => sum + p.currentAmount, 0);
  const totalInvestors = projects.reduce((sum, p) => sum + p.investorCount, 0);
  const avgFundingPercent =
    projects.length === 0
      ? 0
      : projects.reduce((sum, p) => sum + p.fundingPercent, 0) / projects.length;

  return (
    <>
      <Section title="프로젝트 검색">
        <ProjectFilterBar value={filters} onChange={setFilters} />
        <div className="stats-grid">
          <StatBox label="전체 프로젝트 수" value={`${projects.length}개`} />
          <StatBox label="모집중 프로젝트" value={`${fundingCount}개`} />
          <StatBox label="평균 모집률" value={`${Math.round(avgFundingPercent)}%`} />
          <StatBox label="누적 모집 금액" value={formatKRW(totalRaised)} />
          <StatBox label="누적 참여자 수" value={`${totalInvestors}명`} />
        </div>
      </Section>
      <Section
        title="모집 중인 프로젝트"
        aside={
          <Link className="link" href="/projects/haeundae">
            대표 프로젝트 보기 →
          </Link>
        }
      >
        {isError ? (
          <p className="muted">프로젝트 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>
        ) : (
          <ProjectGrid
            projects={filtered}
            isLoading={isLoading}
            emptyMessage="조건에 맞는 프로젝트가 없습니다."
          />
        )}
      </Section>
    </>
  );
}

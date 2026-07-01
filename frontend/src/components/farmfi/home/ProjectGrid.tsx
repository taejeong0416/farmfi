"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { formatKRW, formatPercent } from "@/lib/format";
import { fetchProjects, projectsQueryKey } from "../project/api";
import { projectStatusLabel } from "../project/status";
import type { ProjectListItem } from "../project/types";

function thumbVariant(buildingType: string | null): "roof" | "indoor" {
  if (
    buildingType &&
    (buildingType.includes("실내") || buildingType.toLowerCase().includes("indoor"))
  ) {
    return "indoor";
  }
  return "roof";
}

export function ProjectGrid({
  limit,
  projects: controlledProjects,
  isLoading: controlledLoading,
  emptyMessage = "아직 등록된 프로젝트가 없습니다.",
}: {
  limit?: number;
  /** Pass an already-fetched/filtered list to skip this component's own fetch (controlled mode). */
  projects?: ProjectListItem[];
  /** Required alongside `projects` when the caller owns the fetch/filter state. */
  isLoading?: boolean;
  emptyMessage?: string;
}) {
  const isControlled = controlledProjects !== undefined || controlledLoading !== undefined;

  const query = useQuery({
    queryKey: projectsQueryKey(),
    queryFn: fetchProjects,
    enabled: !isControlled,
  });

  const projects = controlledProjects ?? query.data ?? [];
  const isLoading = controlledLoading ?? query.isLoading;
  const isError = !isControlled && query.isError;

  const visible = projects.slice(0, limit ?? projects.length);
  const skeletonCount = limit ?? 3;

  if (isLoading) {
    return (
      <div className="grid-3">
        {Array.from({ length: skeletonCount }, (_, i) => (
          <article className="card project-card soft-card" key={i}>
            <div className="thumb roof" />
            <div className="project-body">
              <p className="muted">불러오는 중...</p>
            </div>
          </article>
        ))}
      </div>
    );
  }

  if (isError) {
    return <p className="muted">프로젝트 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>;
  }

  if (visible.length === 0) {
    return <p className="muted">{emptyMessage}</p>;
  }

  return (
    <div className="grid-3">
      {visible.map((project) => {
        const percent = Math.min(100, Math.max(0, Math.round(project.fundingPercent)));
        return (
          <article className="card project-card soft-card" key={project.id}>
            <div className={`thumb ${thumbVariant(project.buildingType)}`}>
              <span className="badge" style={{ margin: 14 }}>
                {projectStatusLabel(project.status)}
              </span>
            </div>
            <div className="project-body">
              <h3>{project.name}</h3>
              <p className="muted">⌖ {project.location ?? "위치 미정"}</p>
              <div className="kv">
                <div>
                  <span>목표 금액</span>
                  <b>{formatKRW(project.targetAmount)}</b>
                </div>
                <div>
                  <span>모집률</span>
                  <b>{formatPercent(percent)}</b>
                </div>
                <div>
                  <span>참여자</span>
                  <b>{project.investorCount}명</b>
                </div>
              </div>
              <div style={{ marginTop: 18 }} className="progress">
                <span className="bar" style={{ width: `${percent}%` }} />
              </div>
              <Link className="link" href={`/projects/${project.id}`}>
                상세 보기 →
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { PageHeading, Shell, SkeletonBlock } from "@/components/ui";
import { ProjectCard } from "../common/HomeScreen";
import { useProjects } from "../api";

const FILTERS = [
  { key: "all", label: "전체" },
  { key: "funding", label: "모집 중" },
  { key: "operating", label: "운영 중" },
  { key: "funded", label: "모집 완료" },
  { key: "completed", label: "정산 완료" },
] as const;

export function ProjectsScreen() {
  const { data: projects, isLoading } = useProjects();
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  const visible = useMemo(() => {
    let list = projects ?? [];
    if (filter !== "all") list = list.filter((p) => p.status === filter);
    if (q.trim()) {
      const key = q.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(key) ||
          (p.location ?? "").toLowerCase().includes(key),
      );
    }
    return list;
  }, [projects, filter, q]);

  return (
    <Shell>
      <PageHeading
        title="투자 프로젝트"
        desc="확인된 단계에만 자금이 집행됩니다. 각 프로젝트의 집행 계획과 진행 상황을 열어 확인하세요."
      />

      <div className="mb-6 flex items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`h-[34px] rounded-6 border px-4 text-12 ${
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
          placeholder="프로젝트 · 위치 검색"
          className="ml-auto h-[34px] w-[353px] rounded-6 border border-line px-4 text-12 text-ink outline-none placeholder:text-muted focus:border-brand"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-5">
          <SkeletonBlock height={370} />
          <SkeletonBlock height={370} />
          <SkeletonBlock height={370} />
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-10 border border-line bg-white px-6 py-16 text-center text-13 text-muted">
          조건에 맞는 프로젝트가 없습니다.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-5">
          {visible.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </Shell>
  );
}

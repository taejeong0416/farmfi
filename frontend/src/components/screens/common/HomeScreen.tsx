"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  PhotoSlot,
  ProgressBar,
  Shell,
  SkeletonBlock,
  StatRow,
} from "@/components/ui";
import {
  PROJECT_STATUS_LABEL,
  useProjects,
  won,
  type ProjectSummary,
} from "../api";

const FILTERS = [
  { key: "all", label: "전체" },
  { key: "funding", label: "모집 중" },
  { key: "operating", label: "운영 중" },
  { key: "funded", label: "모집 완료" },
] as const;

export function ProjectCard({ p }: { p: ProjectSummary }) {
  const pct = Math.round(p.fundingPercent);
  const target = p.targetAmount ?? 0;

  return (
    <Link
      href={`/projects/${p.id}`}
      className="block overflow-hidden rounded-10 border border-line bg-white transition-colors hover:border-brand"
    >
      <PhotoSlot label="대표 공간 사진" className="h-[151px] rounded-none border-0 border-b border-line" />
      <div className="p-5">
        <Badge tone={p.status === "funding" ? "solid" : "plain"}>
          {PROJECT_STATUS_LABEL[p.status] ?? p.status}
        </Badge>
        <h3 className="mt-4 text-15 font-bold text-ink">{p.name}</h3>
        <p className="mt-2 line-clamp-1 text-12 text-muted">
          {p.location ?? "위치 미정"}
        </p>

        <div className="mt-4">
          <ProgressBar value={pct} label={`모금률 ${pct.toFixed(1)}%`} />
          <p className="mt-1.5 font-num text-12 text-body">
            {won(p.currentAmount)} / {won(target)}
          </p>
        </div>

        <div className="mt-4 flex gap-8 border-t border-line-soft pt-4">
          <div>
            <p className="text-11 text-muted">참여자</p>
            <p className="mt-1 font-num text-12 font-medium text-ink">
              {p.investorCount}명
            </p>
          </div>
          <div>
            <p className="text-11 text-muted">최소 투자</p>
            <p className="mt-1 font-num text-12 font-medium text-ink">
              {won(p.tokenPrice)}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function HomeScreen() {
  const { data: projects, isLoading } = useProjects();
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  const stats = useMemo(() => {
    const list = projects ?? [];
    const raised = list.reduce((sum, p) => sum + p.currentAmount, 0);
    return [
      { label: "전체 프로젝트", value: list.length, unit: "개" },
      {
        label: "모집 중",
        value: list.filter((p) => p.status === "funding").length,
        unit: "개",
      },
      {
        label: "운영 중",
        value: list.filter((p) => p.status === "operating").length,
        unit: "개",
      },
      {
        label: "누적 투자금",
        value: new Intl.NumberFormat("ko-KR").format(raised),
        unit: "원",
      },
      {
        label: "참여자",
        value: list.reduce((sum, p) => sum + p.investorCount, 0),
        unit: "명",
      },
    ];
  }, [projects]);

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
    <Shell className="pt-0">
      <section className="flex items-center gap-16 border-b border-line-soft py-16">
        <div className="flex-1">
          <h1 className="text-28 font-bold leading-tight text-ink">
            도심의 빈 공간이,
            <br />
            새로운 가치로 자랍니다
          </h1>
          <p className="mt-6 text-14 leading-6 text-body">
            비어 있던 상가가 미니 스마트팜으로 바뀌는 여정에 함께하세요.
            <br />
            투자금은 확인된 단계마다 차근차근 집행됩니다.
          </p>
          <div className="mt-8 flex gap-2.5">
            <Button href="/projects">프로젝트 둘러보기</Button>
            <Button href="/subscribe" variant="secondary">
              신선 구독 만나보기
            </Button>
          </div>
          <p className="mt-6 text-12 font-medium text-brand">
            공간을 직접 운영하고 싶나요?{" "}
            <Link href="/operator/spaces" className="underline underline-offset-4">
              운영 가능한 공간 보기 →
            </Link>
          </p>
        </div>
        <PhotoSlot className="h-[262px] w-[522px] shrink-0" />
      </section>

      <StatRow items={stats} />

      <section className="pt-8">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-15 font-bold text-ink">진행 중 프로젝트</h2>
          <div className="flex items-center gap-2">
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
              placeholder="프로젝트 · 위치 검색"
              className="ml-2 h-[34px] w-[280px] rounded-6 border border-line px-3.5 text-12 text-ink outline-none placeholder:text-muted focus:border-brand"
            />
          </div>
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

        <p className="mt-6 text-11 text-muted">
          ※ 회수기간과 목표 총 회수율은 각 점포의 사업계획 기준 예상치이며, 실제 매출과 운영비에 따라 달라질 수 있습니다.
        </p>
      </section>
    </Shell>
  );
}

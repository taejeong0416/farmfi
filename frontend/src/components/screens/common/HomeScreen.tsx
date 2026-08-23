"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  PhotoSlot,
  ProgressBar,
  Shell,
  SkeletonBlock,
  StatRow,
} from "@/components/ui";
import {
  PROJECT_STATUS_LABEL,
  shortDate,
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
  const pct = p.fundingPercent;
  const target = p.targetAmount ?? 0;
  const funding = p.status === "funding";
  // 진행 중인 단계. milestones가 없으면 칸을 비운다.
  const stage = p.milestones?.find((m) => m.status !== "completed");

  return (
    <Link
      href={`/projects/${p.id}`}
      className="block overflow-hidden rounded-10 border border-line bg-white transition-colors hover:border-brand"
    >
      <div className="relative">
        <PhotoSlot
          label="대표 공간 사진"
          src={p.imageUrl ?? "/assets/farm-building-project.png"}
          className="h-[151px] w-full rounded-none border-0 border-b border-line"
        />
        <span
          className={`absolute left-3 top-3 rounded-4 px-2.5 py-1.5 text-11 font-medium ${
            funding ? "bg-brand text-white" : "bg-line-soft text-body"
          }`}
        >
          {PROJECT_STATUS_LABEL[p.status] ?? p.status}
        </span>
      </div>

      <div className="px-4 pb-4 pt-4">
        <h3 className="text-15 font-bold text-ink">{p.name}</h3>
        <p className="mt-1.5 line-clamp-1 text-12 text-muted">
          {p.location ?? "위치 미정"}
        </p>

        <div className="mt-4">
          <ProgressBar value={Math.round(pct)} />
          <div className="mt-1.5 flex items-baseline justify-between gap-3">
            <span className="text-13 font-medium text-brand">
              모금률 {pct.toFixed(1)}%
            </span>
            <span className="font-num text-12 text-body">
              {won(p.currentAmount)} / {won(target)}
            </span>
          </div>
        </div>

        <div className="mt-4 flex gap-8 border-t border-line-soft pt-3">
          <CardFact
            label="단계"
            value={stage ? `${stage.seq}단계 진행중` : "—"}
          />
          <CardFact
            label="모집 마감"
            value={p.fundingEnd ? shortDate(p.fundingEnd) : "—"}
          />
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-line-soft pt-3">
          <span className="text-12 text-muted">
            참여자{" "}
            <span className="font-num font-medium text-ink">
              {p.investorCount}명
            </span>
          </span>
          <span className="text-12 text-muted">
            최소 투자{" "}
            <span className="font-num font-medium text-ink">
              {won(p.tokenPrice)}
            </span>
          </span>
        </div>
      </div>
    </Link>
  );
}

function CardFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-11 text-muted">{label}</p>
      <p className="mt-1 text-13 font-medium text-ink">{value}</p>
    </div>
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
      <section
        className="-mx-[54px] flex h-[407px] flex-col justify-center bg-brand bg-cover bg-center px-[54px]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(20,84,46,0.72), rgba(20,84,46,0.72)), url('/assets/farm-building-hero.png')",
        }}
      >
        <div className="mx-auto w-full max-w-[1332px]">
          <h1 className="text-[36px] font-bold leading-tight text-white">
            도심의 빈 공간이,
            <br />
            새로운 가치로 자랍니다
          </h1>
          <p className="mt-11 text-14 leading-6 text-white">
            비어 있던 상가가 미니 스마트팜으로 바뀌는 여정에 함께하세요.
            <br />
            투자금은 확인된 단계마다 차근차근 집행됩니다.
          </p>
          <div className="mt-5 flex gap-3">
            <Link
              href="/projects"
              className="flex h-[46px] items-center rounded-6 border border-white px-6 text-14 font-medium text-white"
            >
              프로젝트 둘러보기
            </Link>
            <Link
              href="/subscribe"
              className="flex h-[46px] items-center rounded-6 border border-brand bg-white px-6 text-14 font-medium text-brand"
            >
              신선 구독 만나보기
            </Link>
          </div>
          <p className="mt-5 text-11 font-medium text-white">
            공간을 직접 운영하고 싶나요?{" "}
            <Link href="/operator/spaces" className="underline underline-offset-4">
              운영 가능한 공간 보기 →
            </Link>
          </p>
        </div>
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
              className="ml-5 h-[34px] w-[353px] rounded-6 border border-line px-4 text-12 text-ink outline-none placeholder:text-muted focus:border-brand"
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

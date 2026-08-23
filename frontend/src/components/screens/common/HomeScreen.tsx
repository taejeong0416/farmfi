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
  useSpaceCount,
  won,
  type ProjectSummary,
} from "../api";

/**
 * `.fig` C-01 FilterBar — `모집 중` 토글 하나와 드롭다운 네 개, 그리고 검색.
 * 앞의 토글만 켜고 끄는 칩이고 나머지는 값을 고르는 상자다.
 */
const STAGE_OPTIONS = [1, 2, 3, 4];
const PAYBACK_OPTIONS = [
  { value: "12", label: "12개월 이내" },
  { value: "18", label: "18개월 이내" },
  { value: "24", label: "24개월 이내" },
];
const STATUS_OPTIONS = ["funding", "funded", "operating", "completed"];

/** 위치 문자열의 앞 두 마디를 지역으로 본다 — "부산 동래구 명륜동" → "부산 동래구". */
function regionOf(location: string | null): string | null {
  if (!location) return null;
  return location.split(/\s+/).slice(0, 2).join(" ");
}

/** `.fig` 드롭다운 한 칸. 고르지 않으면 "…전체"가 보인다. */
function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-[34px] rounded-6 border px-3 text-12 outline-none ${
        value ? "border-brand font-medium text-brand" : "border-line text-body"
      }`}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * 카드 사진이 없을 때 쓰는 기본 이미지. `.fig` C-01은 카드 세 장에 서로 다른
 * 스마트팜 사진을 넣는다 — 한 장을 돌려쓰면 목록이 같은 그림으로 도배된다.
 */
const CARD_PHOTOS = [
  "/assets/figma/home-farm-1.jpg",
  "/assets/figma/home-farm-2.jpg",
  "/assets/figma/home-farm-3.jpg",
];

/** id에서 사진을 정한다. 목록 순서가 바뀌어도 같은 지점은 같은 사진이다. */
function cardPhoto(id: string): string {
  let sum = 0;
  for (const ch of id) sum += ch.charCodeAt(0);
  return CARD_PHOTOS[sum % CARD_PHOTOS.length];
}

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
          src={p.imageUrl ?? cardPhoto(p.id)}
          className="h-[151px] w-full rounded-none border-0 border-b border-line"
        />
        <span
          className={`absolute left-3 top-3 rounded-4 px-2.5 py-1.5 text-11 font-medium ${
            funding ? "bg-brand text-white" : "bg-line-soft text-body"
          }`}
        >
          {PROJECT_STATUS_LABEL[p.status] ?? p.status}
        </span>
        {/* `.fig` C-01 — 사진 오른쪽 위 목표 회수율 배지. 원금 비보장을 같이 적는다. */}
        {p.targetReturnPct ? (
          <span className="absolute right-3 top-3 rounded-4 border border-line bg-white px-2.5 py-1.5 text-10 font-medium text-brand">
            목표 {p.targetReturnPct}% · 비보장
          </span>
        ) : null}
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

        {/* `.fig` C-01 — 예상 회수기간 · 단계 · ESG 세 칸. */}
        <div className="mt-4 grid grid-cols-3 gap-4 border-t border-line-soft pt-3">
          <CardFact
            label="예상 회수기간"
            value={p.paybackMonths ? `${p.paybackMonths}개월` : "—"}
          />
          <CardFact
            label="단계"
            value={stage ? `${stage.seq}단계 진행중` : "—"}
          />
          <CardFact label="ESG" value={p.esgTag ?? "—"} />
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
  const { data: spaceCount } = useSpaceCount();
  const [onlyFunding, setOnlyFunding] = useState(false);
  const [region, setRegion] = useState("");
  const [stage, setStage] = useState("");
  const [payback, setPayback] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");

  const stats = useMemo(() => {
    const list = projects ?? [];
    const raised = list.reduce((sum, p) => sum + p.currentAmount, 0);
    // 값이 있는 지점만 평균한다. 하나도 없으면 칸을 비운다.
    const paybacks = list
      .map((p) => p.paybackMonths)
      .filter((v): v is number => v != null);
    const avgPayback = paybacks.length
      ? Math.round(paybacks.reduce((a, b) => a + b, 0) / paybacks.length)
      : null;
    return [
      { label: "전체 프로젝트", value: list.length, unit: "개" },
      {
        label: "모집 중",
        value: list.filter((p) => p.status === "funding").length,
        unit: "개",
      },
      { label: "예상 회수기간", value: avgPayback ?? "—", unit: avgPayback ? "개월" : "" },
      {
        label: "누적 투자금",
        value: new Intl.NumberFormat("ko-KR").format(raised),
        unit: "원",
      },
      { label: "등록 공간", value: spaceCount ?? 0, unit: "개" },
    ];
  }, [projects, spaceCount]);

  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const p of projects ?? []) {
      const r = regionOf(p.location);
      if (r) set.add(r);
    }
    return [...set].sort();
  }, [projects]);

  const visible = useMemo(() => {
    let list = projects ?? [];
    if (onlyFunding) list = list.filter((p) => p.status === "funding");
    if (status) list = list.filter((p) => p.status === status);
    if (region) list = list.filter((p) => regionOf(p.location) === region);
    if (stage) {
      list = list.filter((p) => {
        const cur = p.milestones?.find((m) => m.status !== "completed");
        return cur ? String(cur.seq) === stage : false;
      });
    }
    if (payback) {
      list = list.filter(
        (p) => p.paybackMonths != null && p.paybackMonths <= Number(payback),
      );
    }
    if (q.trim()) {
      const key = q.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(key) ||
          (p.location ?? "").toLowerCase().includes(key),
      );
    }
    return list;
  }, [projects, onlyFunding, status, region, stage, payback, q]);

  return (
    <Shell className="pt-0">
      <section
        // `.fig` Frame 168 — 밭 사진 위에 흰 글자다. 덧씌우는 막은 없다.
        className="-mx-[54px] flex h-[407px] flex-col justify-center bg-brand bg-cover bg-center px-[54px]"
        style={{ backgroundImage: "url('/assets/figma/home-field.jpg')" }}
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
            <button
              type="button"
              onClick={() => setOnlyFunding((v) => !v)}
              className={`h-[34px] rounded-6 border px-4 text-12 ${
                onlyFunding
                  ? "border-brand font-medium text-brand"
                  : "border-line text-body hover:bg-surface"
              }`}
            >
              모집 중
            </button>
            <FilterSelect
              value={region}
              onChange={setRegion}
              placeholder="지역 전체"
              options={regions.map((r) => ({ value: r, label: r }))}
            />
            <FilterSelect
              value={stage}
              onChange={setStage}
              placeholder="단계 전체"
              options={STAGE_OPTIONS.map((n) => ({
                value: String(n),
                label: `${n}단계`,
              }))}
            />
            <FilterSelect
              value={payback}
              onChange={setPayback}
              placeholder="회수기간 전체"
              options={PAYBACK_OPTIONS}
            />
            <FilterSelect
              value={status}
              onChange={setStatus}
              placeholder="운영 상태 전체"
              options={STATUS_OPTIONS.map((v) => ({
                value: v,
                label: PROJECT_STATUS_LABEL[v] ?? v,
              }))}
            />
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

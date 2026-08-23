"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PhotoSlot,
  Shell,
  SkeletonBlock,
} from "@/components/ui";
import {
  SPACE_STATUS_LABEL,
  SPACE_TYPE_LABEL,
  useAvailableSpaces,
  won,
} from "../api";

const FILTERS = [
  { key: "all", label: "전체" },
  { key: "approved", label: "신청 가능" },
  { key: "reviewing", label: "준비 중" },
] as const;

export function SpacesScreen() {
  const { data: spaces, isLoading, isError } = useAvailableSpaces();
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  const visible = useMemo(() => {
    let list = spaces ?? [];
    if (filter !== "all") list = list.filter((s) => s.status === filter);
    if (q.trim()) {
      const key = q.trim().toLowerCase();
      list = list.filter((s) => s.address.toLowerCase().includes(key));
    }
    return list;
  }, [spaces, filter, q]);

  if (isLoading) {
    return (
      <Shell>
        <SkeletonBlock height={480} />
      </Shell>
    );
  }

  if (isError) {
    return (
      <Shell>
        <EmptyState
          title="공간 목록을 볼 수 없습니다"
          desc="운영자로 로그인한 뒤 다시 확인해 주세요."
          action={<Button href="/login?next=/operator/spaces">로그인</Button>}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-28 font-bold text-ink">
        어디에서 시작할지, 먼저 살펴보세요
      </h1>
      <p className="mt-3 text-14 text-body">
        운영 가능한 공실과 준비 상태를 한눈에 비교할 수 있어요.
      </p>

      <div className="mt-6 flex items-center gap-2 rounded-10 border border-line bg-white px-5 py-3">
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
          placeholder="공간명 · 동네 검색"
          className="ml-auto h-[34px] w-[260px] rounded-6 border border-line px-3.5 text-12 text-ink outline-none placeholder:text-muted focus:border-brand"
        />
      </div>

      <p className="mt-8 text-15 font-bold text-ink">
        조건에 맞는 공간 {visible.length}곳
      </p>

      {visible.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="지금은 신청할 수 있는 공간이 없습니다"
            desc="새 공간이 등록되면 운영자 포털에서 안내합니다."
          />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-5">
          {visible.map((s) => (
            <Link
              key={s.id}
              href={`/operator/spaces/${s.id}`}
              className="block overflow-hidden rounded-10 border border-line bg-white transition-colors hover:border-brand"
            >
              <PhotoSlot
                label="공간 사진"
                src="/assets/farm-building-indoor.png"
                className="h-[140px] w-full rounded-none border-0 border-b border-line"
              />
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-15 font-bold text-ink">{s.address}</h2>
                  <Badge tone={s.status === "approved" ? "pass" : "plain"}>
                    {SPACE_STATUS_LABEL[s.status] ?? s.status}
                  </Badge>
                </div>
                <p className="mt-2 text-12 text-muted">
                  {SPACE_TYPE_LABEL[s.spaceType] ?? s.spaceType} · {s.area} ·
                  채광 {s.lighting}
                </p>
                <div className="mt-4 flex items-center justify-between border-t border-line-soft pt-4">
                  <span className="text-12 text-muted">
                    적합도 {s.suitabilityScore ?? "-"}점
                  </span>
                  <span className="text-12 font-medium text-brand">
                    자세히 보기 →
                  </span>
                </div>
                {s.estimatedRent ? (
                  <p className="mt-2 font-num text-12 text-body">
                    예상 월 임대 {won(s.estimatedRent)}
                  </p>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Card className="mt-8 flex items-center justify-between bg-brand">
        <div>
          <p className="text-18 font-bold text-white">
            내 조건에 맞는 공간이 없나요?
          </p>
          <p className="mt-2 text-12 text-brand-soft">
            새 공간이 등록되면 알려드릴게요
          </p>
        </div>
        <Button variant="secondary" href="/operator/apply">
          운영 신청 시작
        </Button>
      </Card>
    </Shell>
  );
}

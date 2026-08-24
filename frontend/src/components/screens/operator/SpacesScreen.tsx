"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Button,
  EmptyState,
  Shell,
  SkeletonBlock,
} from "@/components/ui";
import {
  SPACE_STATUS_LABEL,
  SPACE_TYPE_LABEL,
  useAvailableSpaces,
  type SpaceItem,
  won,
} from "../api";

const FILTERS = [
  { key: "all", label: "부산 전체" },
  { key: "approved", label: "신청 가능한 공간" },
  { key: "reviewing", label: "준비 중" },
] as const;

/** `.fig` O-01 지도 범례 — 상태마다 점 색이 다르다. */
const PIN_TONE: Record<string, { dot: string; label: string; chip: string }> = {
  approved: { dot: "bg-brand", label: "신청 가능", chip: "bg-surface text-brand" },
  reviewing: { dot: "bg-danger", label: "준비 중", chip: "bg-line text-body" },
  submitted: { dot: "bg-muted", label: "모집 예정", chip: "bg-line-soft text-body" },
};

function pinTone(status: string) {
  return PIN_TONE[status] ?? PIN_TONE.submitted;
}

/** 지도 위 좌표. 실제 위경도가 없으므로 id에서 자리를 정한다 — 새로고침해도 같은 자리다. */
function pinSpot(id: string): { left: string; top: string } {
  let a = 0;
  let b = 0;
  for (let i = 0; i < id.length; i += 1) {
    const c = id.charCodeAt(i);
    if (i % 2 === 0) a = (a + c) % 100;
    else b = (b + c) % 100;
  }
  return { left: `${12 + (a * 68) / 100}%`, top: `${14 + (b * 62) / 100}%` };
}

/**
 * `.fig` O-01 MapArea. 도면의 지도도 실제 지도가 아니라 도로·공원을 그린 모형이다.
 * 같은 모양을 만들고 그 위에 공간 핀을 올린다.
 */
function MapPanel({ spaces }: { spaces: SpaceItem[] }) {
  return (
    <div className="relative h-[674px] flex-1 overflow-hidden rounded-14 border border-line bg-line-soft">
      {[25, 35, 45, 55, 65, 75, 85].map((x) => (
        <span
          key={x}
          className="absolute top-[3%] h-[94%] w-3.5 rounded-7 bg-white"
          style={{ left: `${x}%` }}
        />
      ))}
      {[12, 28, 44, 60, 76].map((y) => (
        <span
          key={y}
          className="absolute left-[19%] h-3 w-[71%] rounded-6 bg-white"
          style={{ top: `${y}%` }}
        />
      ))}
      <span className="absolute left-[6%] top-[6%] h-[88%] w-[18%] rounded-[30px] bg-[#D1E0D6]" />

      {spaces.map((s) => {
        const tone = pinTone(s.status);
        const spot = pinSpot(s.id);
        return (
          <Link
            key={s.id}
            href={`/operator/spaces/${s.id}`}
            className="absolute -translate-x-1/2 text-center"
            style={spot}
          >
            <span
              className={`mx-auto block h-[34px] w-[34px] rounded-full border-4 border-white ${tone.dot}`}
            />
            <span className="mt-1.5 block whitespace-nowrap text-12 font-semibold text-ink">
              {s.address.split(" ")[1] ?? s.address}
            </span>
            <span className="block whitespace-nowrap text-11 text-body">
              {tone.label}
            </span>
          </Link>
        );
      })}

      <div className="absolute bottom-5 left-5 flex items-center gap-5 rounded-6 border border-line bg-white px-4 py-2.5">
        {["approved", "reviewing", "submitted"].map((k) => (
          <span key={k} className="flex items-center gap-2 text-12 text-body">
            <span className={`h-[9px] w-[9px] rounded-full ${PIN_TONE[k].dot}`} />
            {PIN_TONE[k].label}
          </span>
        ))}
      </div>
    </div>
  );
}

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
      <h1 className="text-30 font-bold text-ink">
        어디에서 시작할지, 지도에서 먼저 살펴보세요
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
        <span className="rounded-6 border border-line px-3.5 py-2 text-12 text-body">
          25평 내외
        </span>
        <span className="rounded-6 border border-line px-3.5 py-2 text-13 text-body">
          개점 예정일 전체
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="공간명 · 동네 검색"
          className="ml-auto h-[34px] w-[260px] rounded-6 border border-line px-3.5 text-12 text-ink outline-none placeholder:text-muted focus:border-brand"
        />
      </div>

      {/* `.fig` O-01 MainContentRow — 왼쪽 지도, 오른쪽 400 목록. */}
      <div className="mt-6 flex gap-8">
        <MapPanel spaces={visible} />

        <div className="w-[400px] shrink-0">
          <p className="text-15 font-semibold text-ink">
            지도에 {visible.length}개 공간이 있어요
          </p>

          {visible.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="지금은 신청할 수 있는 공간이 없습니다"
                desc="새 공간이 등록되면 운영자 포털에서 안내합니다."
              />
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {visible.map((s) => {
                const tone = pinTone(s.status);
                return (
                  <Link
                    key={s.id}
                    href={`/operator/spaces/${s.id}`}
                    className="block rounded-12 border border-line bg-white p-5 transition-colors hover:border-brand"
                  >
                    <h2 className="text-16 font-semibold text-ink">{s.address}</h2>
                    <p className="mt-1.5 text-12 text-body">
                      {SPACE_TYPE_LABEL[s.spaceType] ?? s.spaceType} · {s.area}
                    </p>
                    <span
                      className={`mt-3 inline-block rounded-4 px-3 py-1.5 text-11 font-medium ${tone.chip}`}
                    >
                      {SPACE_STATUS_LABEL[s.status] ?? s.status}
                    </span>
                    <div className="mt-3.5 flex items-center justify-between">
                      <span className="text-12 text-body">
                        {s.estimatedRent
                          ? `예상 월 임대 ${won(s.estimatedRent)}`
                          : `적합도 ${s.suitabilityScore ?? "-"}점`}
                      </span>
                      <span className="text-12 font-medium text-brand">
                        자세히 보기 →
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="mt-6 rounded-12 bg-brand px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <p className="text-18 font-bold text-white">
                내 조건에 맞는 공간이 없나요?
              </p>
              <Link
                href="/investor/notifications/settings"
                className="shrink-0 text-11 font-medium text-white underline underline-offset-4"
              >
                알림 받기
              </Link>
            </div>
            <p className="mt-2 text-12 text-[#D1E0D6]">
              새 공간이 등록되면 알려드릴게요
            </p>
          </div>
        </div>
      </div>

    </Shell>
  );
}

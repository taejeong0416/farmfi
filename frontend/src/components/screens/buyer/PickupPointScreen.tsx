"use client";

import { useRouter } from "next/navigation";
import { Button, EmptyState, OptionCard, Shell, SkeletonBlock } from "@/components/ui";
import { SubscribeStepLine } from "./SubscribeStepLine";
import { useCatalog, useSubscribeDraft } from "./useSubscribeDraft";

export function PickupPointScreen() {
  const router = useRouter();
  const { draft, update, ready } = useSubscribeDraft();
  const { data, isLoading } = useCatalog(null);

  if (isLoading || !ready) {
    return (
      <Shell>
        <SkeletonBlock height={420} />
      </Shell>
    );
  }

  const points = data?.pickupPoints ?? [];

  return (
    <Shell>
      <SubscribeStepLine current="pickup" />

      <h1 className="text-28 font-bold text-ink">먼저, 어디에서 픽업할까요?</h1>
      <p className="mt-3 text-14 text-body">
        선택한 지점에서 재배하거나 보유한 작물과 드레싱만 다음 단계에 표시됩니다.
      </p>

      {/* `.fig` B-01 — 지금 어디에서 찾고 있는지. 주소를 바꾸면 가까운 순서가 달라진다. */}
      <div className="mt-6 flex max-w-panel items-center justify-between rounded-10 border border-line bg-white px-5 py-3.5">
        <span className="text-13 text-ink">
          ⌖&nbsp;&nbsp;현재 위치&nbsp;&nbsp;
          <span className="text-body">
            {points[0]?.location ?? "위치를 확인하는 중"}
          </span>
        </span>
        <span className="text-12 font-medium text-brand">주소 변경</span>
      </div>

      {points.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="지금 픽업할 수 있는 지점이 없습니다"
            desc="운영을 시작한 지점이 생기면 여기에 표시됩니다."
          />
        </div>
      ) : (
        <>
          {/* `.fig` B-01 MainContentRow — 왼쪽 842 지도, 오른쪽 454 목록. */}
          <div className="mt-6 flex items-start gap-9">
            <div className="relative h-[578px] flex-1 overflow-hidden rounded-14 border border-line bg-line-soft">
              {[14, 26, 38, 50, 62, 74, 86].map((x) => (
                <span
                  key={x}
                  className="absolute top-[4%] h-[88%] w-3 rounded-6 bg-white"
                  style={{ left: `${x}%` }}
                />
              ))}
              {[20, 44, 68].map((y) => (
                <span
                  key={y}
                  className="absolute left-[5%] h-3 w-[88%] rounded-6 bg-white"
                  style={{ top: `${y}%` }}
                />
              ))}
              {points.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => update({ projectId: p.id })}
                  className="absolute -translate-x-1/2 text-center"
                  style={{ left: `${28 + i * 22}%`, top: `${30 + (i % 2) * 26}%` }}
                >
                  <span
                    className={`mx-auto block h-[34px] w-[34px] rounded-full border-4 border-white ${
                      draft.projectId === p.id ? "bg-brand" : "bg-muted"
                    }`}
                  />
                  <span className="mt-1.5 block whitespace-nowrap text-12 font-semibold text-ink">
                    {p.name.split(" ").slice(-1)[0]}
                  </span>
                </button>
              ))}
              <div className="absolute bottom-5 left-5 flex items-center gap-5 rounded-6 border border-line bg-white px-4 py-2.5">
                <span className="flex items-center gap-2 text-12 text-body">
                  <span className="h-[9px] w-[9px] rounded-full bg-brand" />
                  선택 지점
                </span>
                <span className="flex items-center gap-2 text-12 text-body">
                  <span className="h-[9px] w-[9px] rounded-full bg-muted" />
                  다른 지점
                </span>
              </div>
            </div>

            <div className="w-full lg:w-[454px] lg:shrink-0">
          <h2 className="text-16 font-semibold text-ink">가까운 픽업 지점</h2>
          <div className="mt-4 space-y-3">
            {points.map((p) => (
              <OptionCard
                key={p.id}
                selected={draft.projectId === p.id}
                title={p.name}
                desc={`${p.location ?? "위치 정보 없음"} · 화·금 17:00–20:00`}
                right={
                  draft.projectId === p.id ? (
                    <span className="text-12 font-medium text-brand">✓ 선택</span>
                  ) : (
                    <span className="text-12 text-muted">잔여 슬롯 있음</span>
                  )
                }
                onClick={() => update({ projectId: p.id })}
              />
            ))}
          </div>

          <div className="mt-6">
            <Button
              full
              disabled={!draft.projectId}
              onClick={() => router.push("/subscribe/plan")}
            >
              이 지점으로 계속
            </Button>
          </div>

          <p className="mt-4 text-12 text-muted">
            배송 상품이 아니라 지정한 팜에서 직접 픽업하는 서비스입니다.
          </p>
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}

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

      {points.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="지금 픽업할 수 있는 지점이 없습니다"
            desc="운영을 시작한 지점이 생기면 여기에 표시됩니다."
          />
        </div>
      ) : (
        <>
          <h2 className="mt-8 text-16 font-semibold text-ink">가까운 픽업 지점</h2>
          <div className="mt-4 max-w-panel space-y-3">
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

          <div className="mt-8 max-w-panel">
            <Button
              full
              disabled={!draft.projectId}
              onClick={() => router.push("/subscribe/plan")}
            >
              이 지점으로 계속
            </Button>
          </div>

          <p className="mt-4 max-w-panel text-12 text-muted">
            배송 상품이 아니라 지정한 팜에서 직접 픽업하는 서비스입니다.
          </p>
        </>
      )}
    </Shell>
  );
}

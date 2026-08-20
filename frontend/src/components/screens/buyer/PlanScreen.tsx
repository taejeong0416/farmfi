"use client";

import { useRouter } from "next/navigation";
import { Button, Card, Shell, SkeletonBlock } from "@/components/ui";
import { monthlyPrice, PACK_SIZES, type PackSize } from "@/lib/pickup-subscription";
import { won } from "../api";
import { SubscribeStepLine } from "./SubscribeStepLine";
import { useCatalog, useSubscribeDraft } from "./useSubscribeDraft";

export function PlanScreen() {
  const router = useRouter();
  const { draft, update, ready } = useSubscribeDraft();
  const { data } = useCatalog(draft.projectId);

  if (!ready) {
    return (
      <Shell>
        <SkeletonBlock height={360} />
      </Shell>
    );
  }

  const point = (data?.pickupPoints ?? []).find((p) => p.id === draft.projectId);

  function choose(size: PackSize) {
    update({ packSize: size, productIds: [] });
    router.push("/subscribe/compose");
  }

  return (
    <Shell>
      <SubscribeStepLine current="plan" />

      <h1 className="text-24 font-bold text-ink">
        {point?.name ?? "선택한 지점"}에서 받을 팩 크기를 골라주세요
      </h1>
      <p className="mt-3 text-14 text-body">
        선택한 지점의 생산량과 남은 구독 슬롯을 기준으로 신청할 수 있어요.
      </p>

      <Card className="mt-6 max-w-panel">
        <p className="text-12 text-muted">선택 지점</p>
        <p className="mt-2 text-15 font-bold text-ink">
          {point?.name ?? "지점을 먼저 골라 주세요"}
        </p>
        <p className="mt-2 text-12 text-muted">
          {point?.location ?? "-"} · 화/금 17:00–20:00
        </p>
      </Card>

      <div className="mt-6 flex gap-2">
        {[1, 2].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => update({ perWeek: n as 1 | 2 })}
            className={`h-9 rounded-6 border px-4 text-12 ${
              draft.perWeek === n
                ? "border-brand font-medium text-brand"
                : "border-line text-body hover:bg-surface"
            }`}
          >
            주 {n}회 수령
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-5">
        {PACK_SIZES.map((size) => {
          const price = monthlyPrice(size, draft.perWeek);
          const selected = draft.packSize === size;
          return (
            <Card
              key={size}
              className={selected ? "border-brand bg-brand-soft" : ""}
            >
              <h2 className="text-20 font-bold text-ink">{size}종 믹스팩</h2>
              <p className="mt-2 text-13 text-muted">
                작물 {size}종 · 드레싱 2봉
              </p>
              <p className="mt-5 font-num text-22 font-medium text-brand">
                월 {won(price)}
              </p>
              <p className="mt-4 text-12 text-muted">
                다음 단계에서 {point?.name ?? "지점"}의 작물·드레싱을 고릅니다.
              </p>
              <div className="mt-6">
                <Button full onClick={() => choose(size)}>
                  {size}종 구성하기
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <p className="mt-6 text-12 text-muted">
        표시 금액은 월 기준이며, 픽업 회차는 지점 운영 일정에 따라 달라질 수 있습니다.
      </p>
    </Shell>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { Button, Card, EmptyState, Shell, SkeletonBlock } from "@/components/ui";
import { monthlyPrice, PACK_SIZES, type PackSize } from "@/lib/pickup-subscription";
import { won } from "../api";
import { SubscribeStepLine } from "./SubscribeStepLine";
import { useCatalog, useSubscribeDraft } from "./useSubscribeDraft";

export function PlanScreen() {
  const router = useRouter();
  const { draft, update, ready } = useSubscribeDraft();
  const { data, isLoading } = useCatalog(draft.projectId);

  if (!ready) {
    return (
      <Shell>
        <SkeletonBlock height={360} />
      </Shell>
    );
  }

  // 주소로 바로 들어오면 지점이 비어 있다. 팩 크기는 지점의 작물 수에 달렸으니 먼저 고르게 한다.
  if (!draft.projectId) {
    return (
      <Shell>
        <SubscribeStepLine current="plan" />
        <EmptyState
          title="픽업 지점을 먼저 골라 주세요"
          desc="지점마다 고를 수 있는 작물이 달라서, 지점을 정해야 팩 크기를 고를 수 있습니다."
          action={<Button href="/subscribe">지점 고르기</Button>}
        />
      </Shell>
    );
  }

  const point = (data?.pickupPoints ?? []).find((p) => p.id === draft.projectId);
  // 지점이 지금 내줄 수 있는 작물 수. 이걸 넘는 팩은 다음 단계에서 구성할 수 없으니 아예 보여주지 않는다.
  const selectableCount = (data?.crops ?? []).filter((c) => c.available).length;
  const countKnown = !isLoading && Boolean(data);
  const sizes = countKnown
    ? PACK_SIZES.filter((size) => size <= selectableCount)
    : PACK_SIZES;
  const hidden = PACK_SIZES.length - sizes.length;

  function choose(size: PackSize) {
    update({ packSize: size, productIds: [] });
    router.push("/subscribe/compose");
  }

  if (sizes.length === 0) {
    return (
      <Shell>
        <SubscribeStepLine current="plan" />
        <EmptyState
          title="이 지점은 지금 믹스팩을 만들 만큼 작물이 없습니다"
          desc={`가장 작은 팩도 작물 ${PACK_SIZES[0]}종이 필요합니다. 다른 지점을 골라 주세요.`}
          action={<Button href="/subscribe">지점 다시 고르기</Button>}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <SubscribeStepLine current="plan" />

      <h1 className="text-24 font-bold text-ink">
        {point?.name ?? "선택한 지점"}에서 받을 팩 크기를 골라주세요
      </h1>
      <p className="mt-3 text-12 text-body">
        슬롯은 팜의 주간 생산량을 넘지 않도록 제한됩니다. 결제 완료 순서로 확정됩니다.
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

      {hidden > 0 ? (
        <p className="mt-6 text-12 text-muted">
          이 지점은 지금 작물 {selectableCount}종을 내줄 수 있어 {sizes.join("·")}종
          팩만 열려 있습니다.
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-3 gap-5">
        {sizes.map((size) => {
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

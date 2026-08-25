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
  /*
   * 지점이 지금 내줄 수 있는 작물 수. 이걸 넘는 팩은 다음 단계에서 구성할 수 없다.
   * 목록에서 빼면 3종만 있는 지점에서는 선택지가 하나로 보여 5·7종이 있다는 것조차
   * 모른다. 그래서 자리는 그대로 두고 잠근 뒤, 왜 잠겼는지 카드 위에 적는다.
   */
  const selectableCount = (data?.crops ?? []).filter((c) => c.available).length;
  const countKnown = !isLoading && Boolean(data);
  const openCount = countKnown
    ? PACK_SIZES.filter((size) => size <= selectableCount).length
    : PACK_SIZES.length;

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

      {countKnown && openCount < PACK_SIZES.length ? (
        <p className="mt-6 text-12 text-muted">
          이 지점은 이번 주에 작물 {selectableCount}종을 내줄 수 있습니다.
          {openCount === 0
            ? " 지금은 어떤 팩도 구성할 수 없어요 — 다른 지점을 골라 주세요."
            : " 작물이 모이면 더 큰 팩도 열립니다."}
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-3 gap-5">
        {PACK_SIZES.map((size) => {
          const price = monthlyPrice(size, draft.perWeek);
          const selected = draft.packSize === size;
          const locked = countKnown && size > selectableCount;
          return (
            <div key={size} className="relative">
              <Card
                className={`h-full ${
                  selected && !locked ? "border-brand bg-brand-soft" : ""
                }`}
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
                  <Button full disabled={locked} onClick={() => choose(size)}>
                    {size}종 구성하기
                  </Button>
                </div>
              </Card>

              {locked ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-10 bg-white/75 px-5 text-center backdrop-blur-[1px]">
                  <LockIcon />
                  <p className="text-13 font-bold text-ink">
                    작물이 {size}종에 모자라요
                  </p>
                  <p className="text-12 text-body">
                    이번 주 이 지점에서 고를 수 있는 작물은 {selectableCount}종입니다.
                  </p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {countKnown && openCount === 0 ? (
        <div className="mt-6">
          <Button href="/subscribe" variant="ghost">
            지점 다시 고르기
          </Button>
        </div>
      ) : null}

      <p className="mt-6 text-12 text-muted">
        표시 금액은 월 기준이며, 픽업 회차는 지점 운영 일정에 따라 달라질 수 있습니다.
      </p>
    </Shell>
  );
}

function LockIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="text-muted"
      aria-hidden
    >
      <rect x="4" y="8.5" width="12" height="8" rx="2" />
      <path d="M7 8.5V6a3 3 0 0 1 6 0v2.5" />
    </svg>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { Button, Card, EmptyState, Shell, SkeletonBlock } from "@/components/ui";
import { DRESSING_COUNT } from "@/lib/pickup-subscription";
import { shortDate } from "../api";
import { SubscribeStepLine } from "./SubscribeStepLine";
import { useCatalog, useSubscribeDraft } from "./useSubscribeDraft";

/**
 * 작물 아이콘 (`.fig` B-03). 카드마다 32x32 사진이 붙는다.
 * 이름이 도면에 없는 작물은 아이콘을 비운다 — 다른 작물 그림을 붙이면 거짓말이다.
 */
const CROP_ICON: Record<string, string> = {
  버터헤드: "butterhead",
  상추: "butterhead",
  로메인: "romaine",
  바질: "basil",
  루꼴라: "arugula",
  적근대: "chard",
  청경채: "bokchoy",
  케일: "kale",
  딜: "dill",
};

function CropIcon({ name }: { name: string }) {
  const slug = CROP_ICON[name];
  if (!slug) {
    return <span className="h-8 w-8 shrink-0 rounded-6 bg-surface" aria-hidden />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/assets/figma/crop-${slug}.png`}
      alt=""
      className="h-8 w-8 shrink-0 rounded-6 object-cover"
    />
  );
}

export function ComposeScreen() {
  const router = useRouter();
  const { draft, update, ready } = useSubscribeDraft();
  const { data, isLoading } = useCatalog(draft.projectId);

  if (isLoading || !ready) {
    return (
      <Shell>
        <SkeletonBlock height={420} />
      </Shell>
    );
  }

  const packSize = draft.packSize ?? 5;
  const point = (data?.pickupPoints ?? []).find((p) => p.id === draft.projectId);
  const crops = data?.crops ?? [];
  const dressings = data?.dressings ?? [];

  // 지점을 고르기 전에는 보여줄 작물 자체가 없다. 지점이 없어서인지, 지점에 작물이 없어서인지 구분해 말한다.
  if (!draft.projectId || crops.length === 0) {
    return (
      <Shell>
        <SubscribeStepLine current="compose" />
        <EmptyState
          title={
            draft.projectId
              ? "이 지점에서 고를 수 있는 작물이 없습니다"
              : "픽업 지점을 먼저 골라 주세요"
          }
          desc={
            draft.projectId
              ? "다른 픽업 지점을 골라 주세요."
              : "지점을 정하면 그 지점의 작물과 드레싱을 고를 수 있습니다."
          }
          action={<Button href="/subscribe">지점 고르기</Button>}
        />
      </Shell>
    );
  }

  function toggleCrop(productId: string, selectable: boolean) {
    if (!selectable) return;
    const has = draft.productIds.includes(productId);
    if (has) {
      update({ productIds: draft.productIds.filter((id) => id !== productId) });
      return;
    }
    if (draft.productIds.length >= packSize) return;
    update({ productIds: [...draft.productIds, productId] });
  }

  function toggleDressing(name: string) {
    const has = draft.dressings.includes(name);
    if (has) {
      update({ dressings: draft.dressings.filter((d) => d !== name) });
      return;
    }
    if (draft.dressings.length >= DRESSING_COUNT) return;
    update({ dressings: [...draft.dressings, name] });
  }

  const ready2 =
    draft.productIds.length === packSize &&
    draft.dressings.length === DRESSING_COUNT;

  // 고를 수 있는 작물이 팩 크기보다 적으면 이 단계는 끝낼 수 없다. 막다른 길이 되지 않게 이유와 되돌아갈 길을 보여준다.
  const selectableCount = crops.filter((c) => c.available).length;
  const notEnoughCrops = selectableCount < packSize;

  return (
    <Shell>
      <SubscribeStepLine current="compose" />

      <h1 className="text-24 font-bold text-ink">
        {point?.name ?? "선택한 지점"}에서 이번 믹스팩을 구성해보세요
      </h1>
      <p className="mt-3 text-14 text-body">
        이 지점에서 이번 주 수확·보유 중인 작물 {packSize}개와 드레싱{" "}
        {DRESSING_COUNT}봉을 선택하세요.
      </p>
      <p className="mt-2 text-12 text-muted">
        작물 수급에 따라 품절된 작물은 비슷한 품목으로 변경을 제안할 수 있어요.
      </p>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-15 font-bold text-ink">작물 선택</h2>
        <span className="text-12 text-muted">
          {draft.productIds.length} / {packSize} 선택
        </span>
      </div>

      {notEnoughCrops ? (
        <div className="mt-4 rounded-10 border border-line bg-surface px-5 py-4">
          <p className="text-13 font-medium text-ink">
            이 지점에서 지금 고를 수 있는 작물은 {selectableCount}종입니다
          </p>
          <p className="mt-1.5 text-12 text-body">
            {packSize}종 믹스팩은 구성할 수 없습니다. 팩 크기를 {selectableCount}종
            이하로 바꾸거나 다른 지점을 골라 주세요.
          </p>
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="secondary" href="/subscribe/plan">
              팩 크기 바꾸기
            </Button>
            <Button size="sm" variant="ghost" href="/subscribe">
              지점 다시 고르기
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-4 gap-3">
        {crops.map((c) => {
          const selected = draft.productIds.includes(c.productId);
          const selectable = c.available;
          return (
            <button
              key={c.productId}
              type="button"
              onClick={() => toggleCrop(c.productId, selectable)}
              disabled={!selectable}
              className={`rounded-10 border px-4 py-4 text-left transition-colors ${
                selected
                  ? "border-brand bg-brand-soft"
                  : selectable
                    ? "border-line bg-white hover:bg-surface"
                    : "border-line bg-surface opacity-60"
              }`}
            >
              <span className="flex items-center justify-between">
                <span className="flex items-center gap-2.5">
                  <CropIcon name={c.name} />
                  <span className="text-13 font-medium text-ink">{c.name}</span>
                </span>
                {selected ? (
                  <span className="text-13 font-bold text-brand">✓</span>
                ) : null}
              </span>
              <span className="mt-2 block text-11 text-muted">
                {c.available
                  ? "선택 가능"
                  : c.growing
                    ? `수확 예정 ${shortDate(c.expectedHarvestAt).slice(5)}`
                    : "품절"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-15 font-bold text-ink">드레싱 선택</h2>
        <span className="text-12 text-muted">
          {draft.dressings.length} / {DRESSING_COUNT}봉
        </span>
      </div>
      <div className="mt-4 flex gap-3">
        {dressings.map((d) => {
          const selected = draft.dressings.includes(d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => toggleDressing(d)}
              className={`h-11 rounded-10 border px-5 text-13 ${
                selected
                  ? "border-brand bg-brand-soft font-medium text-brand"
                  : "border-line bg-white text-body hover:bg-surface"
              }`}
            >
              {d}
            </button>
          );
        })}
      </div>

      <Card className="mt-8 max-w-panel">
        <div className="flex items-center justify-between">
          <span className="text-13 text-muted">이번 구성</span>
          <span className="text-13 font-medium text-ink">
            작물 {draft.productIds.length}종 · 드레싱 {draft.dressings.length}봉
          </span>
        </div>
        <div className="mt-5 flex gap-3">
          <Button variant="ghost" href="/subscribe/plan">
            팩 크기 다시 고르기
          </Button>
          <Button
            className="flex-1"
            disabled={!ready2}
            onClick={() => router.push("/subscribe/order")}
          >
            주문서로 넘어가기
          </Button>
        </div>
      </Card>
    </Shell>
  );
}

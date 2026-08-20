"use client";

import { useRouter } from "next/navigation";
import { Button, Card, EmptyState, Shell, SkeletonBlock } from "@/components/ui";
import { DRESSING_COUNT } from "@/lib/pickup-subscription";
import { shortDate } from "../api";
import { SubscribeStepLine } from "./SubscribeStepLine";
import { useCatalog, useSubscribeDraft } from "./useSubscribeDraft";

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

  if (crops.length === 0) {
    return (
      <Shell>
        <SubscribeStepLine current="compose" />
        <EmptyState
          title="이 지점에서 고를 수 있는 작물이 없습니다"
          desc="다른 픽업 지점을 골라 주세요."
          action={<Button href="/subscribe">지점 다시 고르기</Button>}
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

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-15 font-bold text-ink">작물 선택</h2>
        <span className="text-12 text-muted">
          {draft.productIds.length} / {packSize} 선택
        </span>
      </div>

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
                <span className="text-14 font-medium text-ink">{c.name}</span>
                {selected ? (
                  <span className="text-12 font-medium text-brand">✓</span>
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
        <div className="mt-5">
          <Button
            full
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

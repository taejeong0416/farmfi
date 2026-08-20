"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  PanelShell,
  SkeletonBlock,
} from "@/components/ui";
import { DRESSING_COUNT } from "@/lib/pickup-subscription";
import { formatDate } from "@/lib/format";
import {
  patchSubscription,
  shortDate,
  useSubscriptions,
  won,
} from "../api";
import { useCatalog } from "./useSubscribeDraft";

export function ChangeScreen() {
  const { data: subscriptions, isLoading, refetch } = useSubscriptions();
  const active = (subscriptions ?? []).find((s) => s.status !== "cancelled");
  const { data: catalog } = useCatalog(active?.projectId ?? null);

  const [productIds, setProductIds] = useState<string[]>([]);
  const [dressings, setDressings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!active) return;
    setProductIds(active.productIds);
    setDressings(active.dressings);
  }, [active]);

  if (isLoading) {
    return (
      <PanelShell>
        <SkeletonBlock height={420} />
      </PanelShell>
    );
  }

  if (!active) {
    return (
      <PanelShell>
        <EmptyState
          title="변경할 구독이 없습니다"
          desc="정기구독을 먼저 시작해 주세요."
          action={<Button href="/subscribe">정기구독 둘러보기</Button>}
        />
      </PanelShell>
    );
  }

  const next = active.pickups.find((p) => p.status === "scheduled");
  const crops = catalog?.crops ?? [];
  const dressingOptions = catalog?.dressings ?? [];

  function toggleCrop(id: string, selectable: boolean) {
    if (!selectable) return;
    setSaved(false);
    setProductIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= active!.packSize
          ? prev
          : [...prev, id],
    );
  }

  function toggleDressing(name: string) {
    setSaved(false);
    setDressings((prev) =>
      prev.includes(name)
        ? prev.filter((x) => x !== name)
        : prev.length >= DRESSING_COUNT
          ? prev
          : [...prev, name],
    );
  }

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await patchSubscription(active!.id, body);
      await refetch();
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const composeReady =
    productIds.length === active.packSize && dressings.length === DRESSING_COUNT;

  return (
    <PanelShell>
      <h1 className="text-24 font-bold text-ink">
        다음 회차부터 바꿀 내용을 선택하세요
      </h1>
      <p className="mt-3 text-14 text-body">
        {next
          ? `${formatDate(next.scheduledAt)} 픽업부터 적용됩니다.`
          : "다음 회차가 잡히면 적용됩니다."}
      </p>

      <Card className="mt-7 bg-brand-soft">
        <p className="text-14 font-bold text-brand">
          마감 이후에는 이미 수확·포장이 시작돼 다음 회차에 적용돼요.
        </p>
        <p className="mt-2 text-12 text-body">
          변경 가능 수량은 이번 주 생산 잔여분을 기준으로 표시됩니다.
        </p>
      </Card>

      <Card className="mt-4">
        <div className="flex items-center justify-between">
          <p className="text-15 font-bold text-ink">
            {active.packSize}종 믹스팩 · 주 {active.perWeek}회
          </p>
          <span className="font-num text-13 text-body">
            월 {won(active.monthlyPrice)}
          </span>
        </div>

        <p className="mt-6 text-12 text-muted">
          작물 {productIds.length} / {active.packSize}
        </p>
        <div className="mt-3 grid grid-cols-4 gap-3">
          {crops.map((c) => {
            const selected = productIds.includes(c.productId);
            return (
              <button
                key={c.productId}
                type="button"
                disabled={!c.available}
                onClick={() => toggleCrop(c.productId, c.available)}
                className={`rounded-10 border px-4 py-3 text-left text-13 ${
                  selected
                    ? "border-brand bg-brand-soft font-medium text-brand"
                    : c.available
                      ? "border-line bg-white text-body hover:bg-surface"
                      : "border-line bg-surface text-muted opacity-60"
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>

        <p className="mt-6 text-12 text-muted">
          드레싱 {dressings.length} / {DRESSING_COUNT}
        </p>
        <div className="mt-3 flex gap-3">
          {dressingOptions.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDressing(d)}
              className={`h-10 rounded-10 border px-4 text-13 ${
                dressings.includes(d)
                  ? "border-brand bg-brand-soft font-medium text-brand"
                  : "border-line bg-white text-body hover:bg-surface"
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="mt-6">
          <Button
            full
            disabled={busy || !composeReady}
            onClick={() => void act({ action: "compose", productIds, dressings })}
          >
            작물 · 드레싱 변경 저장
          </Button>
        </div>
      </Card>

      <Card className="mt-4">
        <p className="text-15 font-bold text-ink">수령 주기</p>
        <div className="mt-4 flex gap-2">
          {[1, 2].map((n) => (
            <button
              key={n}
              type="button"
              disabled={busy}
              onClick={() => void act({ action: "schedule", perWeek: n })}
              className={`h-10 rounded-6 border px-5 text-13 ${
                active.perWeek === n
                  ? "border-brand font-medium text-brand"
                  : "border-line text-body hover:bg-surface"
              }`}
            >
              주 {n}회
            </button>
          ))}
        </div>
        <p className="mt-3 text-12 text-muted">
          주기를 바꾸면 아직 오지 않은 회차가 새 일정으로 다시 잡힙니다.
        </p>
      </Card>

      <Card className="mt-4">
        <p className="text-15 font-bold text-ink">픽업 지점 · 결제</p>
        <p className="mt-3 text-13 text-ink">{active.project.name}</p>
        <p className="mt-1.5 text-12 text-muted">
          {active.project.location ?? "-"} · 화·금 17:00–20:00
        </p>
        <p className="mt-4 text-12 text-muted">
          {active.paymentMethod ?? "등록 카드"} · 다음 결제{" "}
          {shortDate(active.nextPaymentAt)} · {won(active.monthlyPrice)}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button full variant="ghost" href="/subscribe">
            픽업 지점 변경
          </Button>
          <Button full variant="ghost" href="/subscribe/payment">
            결제수단 변경
          </Button>
        </div>
      </Card>

      <Card className="mt-4">
        <p className="text-15 font-bold text-ink">이번 회차 건너뛰기</p>
        <p className="mt-2 text-12 text-muted">
          또는 최대 8주까지 구독을 잠시 멈출 수 있어요.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button
            full
            variant="ghost"
            disabled={busy || !next}
            onClick={() =>
              next && void act({ action: "skip", pickupId: next.id })
            }
          >
            이번 회차 건너뛰기
          </Button>
          <Button
            full
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void act({
                action: active.status === "paused" ? "resume" : "pause",
              })
            }
          >
            {active.status === "paused" ? "구독 다시 시작" : "구독 일시정지"}
          </Button>
        </div>
      </Card>

      {error ? <p className="mt-4 text-12 text-danger">{error}</p> : null}
      {saved ? <p className="mt-4 text-12 text-brand">저장했습니다.</p> : null}
    </PanelShell>
  );
}

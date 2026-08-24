"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  Shell,
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
import { canCancel, canChangePickup } from "@/lib/subscription-window";
import { useCatalog } from "./useSubscribeDraft";

const SHORTAGE_OPTIONS = [
  "비슷한 작물로 자동 대체",
  "알림을 받고 직접 선택",
  "해당 작물만 제외",
];

export function ChangeScreen() {
  const { data: subscriptions, isLoading, refetch } = useSubscriptions();
  const active = (subscriptions ?? []).find((s) => s.status !== "cancelled");
  const { data: catalog } = useCatalog(active?.projectId ?? null);

  const [productIds, setProductIds] = useState<string[]>([]);
  const [dressings, setDressings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [shortage, setShortage] = useState<string>(SHORTAGE_OPTIONS[0]);

  useEffect(() => {
    if (!active) return;
    setProductIds(active.productIds);
    setDressings(active.dressings);
  }, [active]);

  if (isLoading) {
    return (
      <Shell>
        <SkeletonBlock height={420} />
      </Shell>
    );
  }

  if (!active) {
    return (
      <Shell>
        <EmptyState
          title="변경할 구독이 없습니다"
          desc="정기구독을 먼저 시작해 주세요."
          action={<Button href="/subscribe">정기구독 둘러보기</Button>}
        />
      </Shell>
    );
  }

  const next = active.pickups.find((p) => p.status === "scheduled");

  // 마감 규칙은 서버와 같은 함수를 쓴다. 화면이 따로 계산하면 언젠가 갈리고,
  // 그때는 열려 있는 버튼이 거절당한다.
  const skipOpen = next ? canChangePickup(new Date(next.scheduledAt)).ok : false;
  const cancelOpen = canCancel(
    active.nextPaymentAt ? new Date(active.nextPaymentAt) : null,
  ).ok;
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
    <Shell>
      <h1 className="text-24 font-bold text-ink">
        다음 회차부터 바꿀 내용을 선택하세요
      </h1>
      <p className="mt-3 text-14 text-body">
        {next
          ? `${formatDate(next.scheduledAt)} 픽업부터 적용됩니다.`
          : "다음 회차가 잡히면 적용됩니다."}
      </p>

      <Card className="mt-7 bg-brand-soft">
        <p className="text-12 text-brand">
          마감 이후에는 이미 수확·포장이 시작돼 다음 회차에 적용돼요.
        </p>
        <p className="mt-2 text-12 text-body">
          변경 가능 수량은 이번 주 생산 잔여분을 기준으로 표시됩니다.
        </p>
      </Card>

      {/* `.fig` B-08 MainContentRow — 왼쪽 982(484 두 칸), 오른쪽 318. */}
      <div className="mt-4 flex items-start gap-8">
        <div className="grid flex-1 grid-cols-2 items-start gap-4">
      <Card>
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
            변경 내용 저장
          </Button>
        </div>
      </Card>

      <Card>
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

      <Card>
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


      <Card>
        <p className="text-15 font-bold text-ink">이번 회차 건너뛰기</p>
        <p className="mt-2 text-12 text-muted">
          픽업 3시간 전까지 건너뛸 수 있어요. 또는 구독을 잠시 멈출 수 있어요.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button
            full
            variant="ghost"
            disabled={busy || !next || !skipOpen}
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
            {active.status === "paused" ? "구독 다시 시작" : "건너뛰기·일시정지"}
          </Button>
        </div>
        {/* 마감이 지났으면 버튼을 막고 이유를 쓴다. 눌러 보고 거절당하게 두지 않는다. */}
        {next && !skipOpen ? (
          <p className="mt-3 text-11 text-muted">
            매장이 이미 준비를 시작했습니다. 이번 회차는 건너뛸 수 없어요.
          </p>
        ) : null}
      </Card>

      <Card className="col-span-2">
        <p className="text-15 font-bold text-ink">구독 해지</p>
        <p className="mt-2 text-12 text-muted">
          구독 해지는 다음 결제일 전까지 가능하며, 이미 결제된 회차는 픽업 완료 후
          종료됩니다.
        </p>
        <p className="mt-2 text-12 text-body">
          다음 결제일 {active.nextPaymentAt ? formatDate(active.nextPaymentAt) : "미정"}
        </p>
        <div className="mt-5">
          {confirmCancel ? (
            <div className="grid grid-cols-2 gap-3">
              <Button full variant="ghost" onClick={() => setConfirmCancel(false)}>
                그대로 두기
              </Button>
              <Button
                full
                disabled={busy}
                onClick={() => void act({ action: "cancel" })}
              >
                해지 확정
              </Button>
            </div>
          ) : (
            <Button
              full
              variant="ghost"
              disabled={busy || !cancelOpen}
              onClick={() => setConfirmCancel(true)}
            >
              구독 해지
            </Button>
          )}
        </div>
        {!cancelOpen ? (
          <p className="mt-3 text-11 text-muted">
            결제일이 지나 이번 주기는 해지할 수 없어요. 다음 주기 전날까지 다시 시도해
            주세요.
          </p>
        ) : null}
      </Card>

        </div>

        <div className="w-[318px] shrink-0">
        <Card>
          <p className="text-18 font-bold text-ink">선택한 작물이 부족할 때</p>
          <div className="mt-4 space-y-3">
            {SHORTAGE_OPTIONS.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setShortage(o)}
                className={`block w-full rounded-10 border px-5 py-4 text-left text-13 ${
                  shortage === o
                    ? "border-brand font-medium text-brand"
                    : "border-line text-body hover:bg-surface"
                }`}
              >
                {o}
              </button>
            ))}
          </div>
          <p className="mt-3 text-12 text-muted">
            대체가 어려우면 해당 회차 금액에서 자동 차감됩니다.
          </p>
        </Card>
        </div>
      </div>

      {error ? <p className="mt-4 text-12 text-danger">{error}</p> : null}
      {saved ? <p className="mt-4 text-12 text-brand">저장했습니다.</p> : null}
    </Shell>
  );
}

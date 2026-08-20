"use client";

import { useState } from "react";
import { Button, Card, EmptyState, PanelShell, SkeletonBlock } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { patchSubscription, useSubscriptions } from "../api";

/** 확인번호를 굵기 다른 막대로 그린다. 매장 스캐너 대신 눈으로도 대조할 수 있다. */
function Barcode({ code }: { code: string }) {
  const bars = code
    .replace(/-/g, "")
    .split("")
    .flatMap((ch) => {
      const n = ch.charCodeAt(0);
      return [n % 3 === 0 ? 6 : n % 3 === 1 ? 3 : 2, 2];
    });
  return (
    <div className="flex h-[88px] items-stretch justify-center gap-[2px]">
      {bars.map((w, i) => (
        <span
          key={i}
          style={{ width: w }}
          className={i % 2 === 0 ? "bg-ink" : "bg-transparent"}
        />
      ))}
    </div>
  );
}

export function PickupPassScreen({ pickupId }: { pickupId: string }) {
  const { data: subscriptions, isLoading, refetch } = useSubscriptions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <PanelShell>
        <SkeletonBlock height={420} />
      </PanelShell>
    );
  }

  const subscription = (subscriptions ?? []).find((s) =>
    s.pickups.some((p) => p.id === pickupId),
  );
  const pickup = subscription?.pickups.find((p) => p.id === pickupId);

  if (!subscription || !pickup) {
    return (
      <PanelShell>
        <EmptyState
          title="픽업 확인증을 찾을 수 없습니다"
          desc="내 구독에서 다시 열어 주세요."
          action={<Button href="/subscriptions">내 구독</Button>}
        />
      </PanelShell>
    );
  }

  async function skip() {
    setBusy(true);
    setError(null);
    try {
      await patchSubscription(subscription!.id, {
        action: "skip",
        pickupId,
      });
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PanelShell className="max-w-modal">
      <p className="text-13 font-medium text-brand">이번 픽업</p>
      <h1 className="mt-3 text-22 font-bold text-ink">
        준비되면 알림으로 알려드릴게요
      </h1>
      <p className="mt-3 text-13 leading-6 text-muted">
        매장에서 아래 바코드를 보여 주세요. 웹을 다시 열기 어려울 수 있으니 출발 전에 화면을 저장해 주세요.
      </p>

      <Card className="mt-7">
        <p className="text-15 font-bold text-ink">
          {formatDate(pickup.scheduledAt)}
        </p>
        <p className="mt-2 text-12 text-muted">
          {subscription.project.name} · {subscription.project.location ?? "-"}
        </p>
        <p className="mt-2 text-12 text-body">
          {subscription.packSize}종 믹스팩 · 드레싱{" "}
          {subscription.dressings.length}봉
        </p>
        <p className="mt-3 font-num text-13 font-medium text-brand">
          확인번호 {pickup.code}
        </p>

        <div className="mt-6 rounded-10 border border-line px-5 py-6">
          <Barcode code={pickup.code} />
          <p className="mt-4 text-center font-num text-14 tracking-[0.3em] text-ink">
            {pickup.code}
          </p>
        </div>

        <p className="mt-4 text-11 text-muted">
          직원이 바코드를 확인하면 수령 완료로 바뀝니다. 밝기를 높이면 더 잘 보여요.
        </p>
      </Card>

      {error ? <p className="mt-4 text-12 text-danger">{error}</p> : null}

      <Card className="mt-5">
        <p className="text-14 font-bold text-ink">오늘 받기 어렵다면</p>
        <p className="mt-2 text-12 text-muted">
          픽업 시작 3시간 전까지 일정 변경 또는 이번 회차 건너뛰기가 가능해요.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button full variant="ghost" href="/subscriptions/change">
            픽업 일정 변경
          </Button>
          <Button
            full
            variant="ghost"
            disabled={busy || pickup.status !== "scheduled"}
            onClick={skip}
          >
            {pickup.status === "skipped" ? "건너뛴 회차" : "이번 회차 건너뛰기"}
          </Button>
        </div>
      </Card>
    </PanelShell>
  );
}

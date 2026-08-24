"use client";

import { useSearchParams } from "next/navigation";
import { Button, Card, EmptyState, PanelShell, SkeletonBlock } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { useSubscriptions, won } from "../api";
import { SubscribeStepLine } from "./SubscribeStepLine";

export function SubscribeDoneScreen() {
  const params = useSearchParams();
  const id = params?.get("id") ?? null;
  const { data: subscriptions, isLoading } = useSubscriptions();

  if (isLoading) {
    return (
      <PanelShell>
        <SkeletonBlock height={360} />
      </PanelShell>
    );
  }

  const subscription =
    (subscriptions ?? []).find((s) => s.id === id) ?? (subscriptions ?? [])[0];

  if (!subscription) {
    return (
      <PanelShell>
        <EmptyState
          title="구독 정보를 찾을 수 없습니다"
          desc="내 구독에서 다시 확인해 주세요."
          action={<Button href="/subscriptions">내 구독</Button>}
        />
      </PanelShell>
    );
  }

  const first = subscription.pickups[0];

  return (
    <PanelShell>
      <SubscribeStepLine current="done" />

      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-14 text-white">
          ✓
        </span>
        <h1 className="text-30 font-bold text-ink">정기구독이 시작됐어요</h1>
      </div>
      <p className="mt-3 text-14 text-muted">
        첫 픽업 전에 작물과 드레싱 구성을 한 번 더 알려드릴게요.
      </p>

      <Card className="mt-7" padded={false}>
        <div className="px-6 py-5">
          <Row
            label="첫 픽업"
            value={first ? formatDate(first.scheduledAt) : "일정 준비 중"}
          />
          <Row
            label="픽업 지점"
            value={`${subscription.project.name} · ${subscription.project.location ?? "-"}`}
          />
          <Row
            label="구성"
            value={`${subscription.packSize}종 믹스팩 + ${subscription.dressings.join("·")} 드레싱`}
          />
          <Row
            label="오늘 결제"
            value={`${won(subscription.monthlyPrice)} · ${subscription.paymentMethod ?? "등록 카드"}`}
          />
          {first ? <Row label="확인번호" value={first.code} /> : null}
        </div>
      </Card>

      <div className="mt-7 grid grid-cols-2 gap-3">
        <Button full href="/subscriptions">
          내 구독 확인
        </Button>
        {first ? (
          <Button full variant="ghost" href={`/subscriptions/pickup/${first.id}`}>
            픽업 확인증 보기
          </Button>
        ) : null}
      </div>

      <Card className="mt-6">
        <p className="text-14 font-bold text-ink">내 구독에서 할 수 있어요</p>
        <p className="mt-3 text-12 text-muted">
          작물·드레싱 변경 · 이번 회차 건너뛰기 · 일시정지 · 결제수단 변경
        </p>
      </Card>
    </PanelShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-surface py-3.5 last:border-b-0">
      <span className="shrink-0 text-13 text-muted">{label}</span>
      <span className="text-right text-13 font-medium text-ink">{value}</span>
    </div>
  );
}

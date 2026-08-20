"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  InfoRow,
  Shell,
  SkeletonBlock,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  PICKUP_STATUS_LABEL,
  patchSubscription,
  shortDate,
  useSubscriptions,
  won,
} from "../api";

const STATUS_LABEL: Record<string, string> = {
  active: "이용 중",
  paused: "일시정지",
  cancelled: "해지됨",
  waitlist: "대기 신청",
};

export function MySubscriptionsScreen() {
  const { data: subscriptions, isLoading, isError, refetch } = useSubscriptions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Shell>
        <SkeletonBlock height={420} />
      </Shell>
    );
  }

  if (isError) {
    return (
      <Shell>
        <EmptyState
          title="구독을 볼 수 없습니다"
          desc="로그인 후 다시 확인해 주세요."
          action={<Button href="/login?next=/subscriptions">로그인</Button>}
        />
      </Shell>
    );
  }

  const list = (subscriptions ?? []).filter((s) => s.status !== "cancelled");

  // B-00E · 구독 없음 빈 상태
  if (list.length === 0) {
    return (
      <Shell>
        <h1 className="text-22 font-bold text-ink">내 구독</h1>
        <div className="mt-6 max-w-panel">
          <EmptyState
            title="아직 이용 중인 구독이 없어요"
            desc="가까운 팜의 생산 슬롯을 확인하고, 필요한 만큼만 정기 픽업해보세요."
            action={<Button href="/subscribe">정기구독 플랜 둘러보기</Button>}
          />
          <p className="mt-5 text-center text-12 text-muted">
            배송 상품이 아니라 지정한 팜에서 직접 픽업하는 서비스입니다.
          </p>
        </div>
      </Shell>
    );
  }

  async function act(id: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await patchSubscription(id, body);
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <h1 className="text-22 font-bold text-ink">내 구독</h1>
      <p className="mt-3 text-13 text-muted">
        생산량 안에서 작물과 드레싱 구성을 유연하게 바꿔보세요.
      </p>

      {error ? <p className="mt-4 text-12 text-danger">{error}</p> : null}

      <div className="mt-7 space-y-8">
        {list.map((s) => {
          const next = s.pickups.find((p) => p.status === "scheduled");
          return (
            <div key={s.id} className="flex items-start gap-8">
              <Card className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <Badge tone={s.status === "active" ? "pass" : "plain"}>
                      {STATUS_LABEL[s.status] ?? s.status}
                    </Badge>
                    <h2 className="mt-3 text-20 font-bold text-ink">
                      {s.packSize}종 믹스팩
                    </h2>
                    <p className="mt-2 text-13 text-muted">
                      월 {won(s.monthlyPrice)} · 주 {s.perWeek}회 ·{" "}
                      {s.project.name}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" href="/subscriptions/change">
                      구성 변경
                    </Button>
                    {s.status === "active" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void act(s.id, { action: "pause" })}
                      >
                        일시정지
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void act(s.id, { action: "resume" })}
                      >
                        다시 시작
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy}
                      onClick={() => void act(s.id, { action: "cancel" })}
                    >
                      구독 해지
                    </Button>
                  </div>
                </div>

                <div className="mt-6">
                  <InfoRow
                    label="다음 결제일"
                    value={shortDate(s.nextPaymentAt)}
                  />
                  <InfoRow
                    label="이번 구성"
                    value={`작물 ${s.productIds.length}종 · 드레싱 ${s.dressings.join("·")}`}
                  />
                  <InfoRow
                    label="결제수단"
                    value={s.paymentMethod ?? "등록 카드"}
                  />
                </div>

                <h3 className="mt-7 text-14 font-bold text-ink">이번 달 픽업</h3>
                <div className="mt-3">
                  {s.pickups.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between border-b border-surface py-3 last:border-b-0"
                    >
                      <span className="text-13 text-ink">
                        {formatDate(p.scheduledAt)}
                      </span>
                      <span className="flex items-center gap-3">
                        <span
                          className={`text-12 ${
                            p.status === "picked"
                              ? "font-medium text-brand"
                              : "text-muted"
                          }`}
                        >
                          {PICKUP_STATUS_LABEL[p.status] ?? p.status}
                        </span>
                        {p.status === "scheduled" ? (
                          <>
                            <Link
                              href={`/subscriptions/pickup/${p.id}`}
                              className="text-12 font-medium text-brand"
                            >
                              확인증
                            </Link>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void act(s.id, {
                                  action: "skip",
                                  pickupId: p.id,
                                })
                              }
                              className="text-12 text-muted hover:text-ink"
                            >
                              건너뛰기
                            </button>
                          </>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="w-[320px] shrink-0">
                <h3 className="text-14 font-bold text-ink">다음 픽업</h3>
                {next ? (
                  <>
                    <p className="mt-4 text-15 font-medium text-ink">
                      {formatDate(next.scheduledAt)}
                    </p>
                    <p className="mt-2 text-12 text-muted">
                      {s.project.name} · {s.project.location ?? "-"}
                    </p>
                    <p className="mt-3 font-num text-13 text-brand">
                      확인번호 {next.code}
                    </p>
                    <div className="mt-5">
                      <Button full href={`/subscriptions/pickup/${next.id}`}>
                        픽업 확인증 열기
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="mt-4 text-12 text-muted">
                    예정된 픽업이 없습니다.
                  </p>
                )}
                <p className="mt-5 text-11 text-muted">
                  변경 가능 수량은 이번 주 생산 잔여분을 기준으로 표시됩니다.
                </p>
              </Card>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

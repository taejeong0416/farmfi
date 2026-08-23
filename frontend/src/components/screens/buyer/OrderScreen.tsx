"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  Modal,
  PanelShell,
  SkeletonBlock,
} from "@/components/ui";
import { monthlyPrice, upcomingPickups } from "@/lib/pickup-subscription";
import { shortDate, won } from "../api";
import { SubscribeStepLine } from "./SubscribeStepLine";
import { useCatalog, useSubscribeDraft } from "./useSubscribeDraft";

const COUPONS = [
  {
    code: "FIRST5000",
    title: "첫 구독 5,000원 할인",
    desc: "20,000원 이상 · 오늘까지",
    discount: 5_000,
    recommended: true,
  },
  {
    code: "FRIEND3000",
    title: "픽업 친구 추천 3,000원",
    desc: "15,000원 이상 · 이번 달까지",
    discount: 3_000,
  },
  {
    code: "DRESSING",
    title: "드레싱 2봉 무료",
    desc: "다음 2회차까지",
    discount: 2_000,
  },
];

const CONSENTS = [
  { key: "autopay", label: "정기구독 및 자동결제에 동의합니다. (필수)", required: true },
  { key: "policy", label: "취소·환불 및 픽업 정책을 확인했습니다. (필수)", required: true },
  { key: "marketing", label: "할인·신상품 소식 수신에 동의합니다. (선택)", required: false },
] as const;

export function OrderScreen() {
  const router = useRouter();
  const { draft, update, ready } = useSubscribeDraft();
  const [consents, setConsents] = useState<Record<string, boolean>>({
    autopay: false,
    policy: false,
    marketing: false,
  });
  const requiredAgreed = CONSENTS.every((c) => !c.required || consents[c.key]);
  const { data } = useCatalog(draft.projectId);
  const [couponOpen, setCouponOpen] = useState(false);

  if (!ready) {
    return (
      <PanelShell>
        <SkeletonBlock height={420} />
      </PanelShell>
    );
  }

  const packSize = draft.packSize ?? 5;
  const point = (data?.pickupPoints ?? []).find((p) => p.id === draft.projectId);
  const crops = data?.crops ?? [];
  const chosen = crops.filter((c) => draft.productIds.includes(c.productId));
  const base = monthlyPrice(packSize, draft.perWeek);
  const total = Math.max(0, base - draft.discount);
  const firstPickup = upcomingPickups(draft.perWeek, 1)[0];

  return (
    <PanelShell>
      <SubscribeStepLine current="order" />

      <h1 className="text-24 font-bold text-ink">정기구독 주문서</h1>
      <p className="mt-3 text-14 text-body">
        픽업 정보와 할인, 자동결제 내용을 확인해 주세요.
      </p>

      <Card className="mt-7">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-13 text-muted">구독 상품</p>
            <p className="mt-2 text-17 font-bold text-ink">
              {packSize}종 믹스팩 · 주 {draft.perWeek}회
            </p>
            <p className="mt-2 text-12 text-muted">
              {chosen.map((c) => c.name).join(" · ") || "작물 미선택"} / 드레싱{" "}
              {draft.dressings.join(" · ") || "미선택"}
            </p>
          </div>
          <Button size="sm" variant="ghost" href="/subscribe/compose">
            구성 변경
          </Button>
        </div>
      </Card>

      <Card className="mt-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-13 text-muted">픽업 정보</p>
            <p className="mt-2 text-15 font-bold text-ink">
              {point?.name ?? "지점 미선택"}
            </p>
            <p className="mt-2 text-12 text-muted">
              {point?.location ?? "-"} · 화/금 17:00–20:00
            </p>
            <p className="mt-3 text-13 font-medium text-brand">
              첫 픽업 {shortDate(firstPickup)}
            </p>
          </div>
          <Button size="sm" variant="ghost" href="/subscribe">
            변경
          </Button>
        </div>
      </Card>

      <Card className="mt-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-13 text-muted">쿠폰 · 할인</p>
            <p className="mt-2 text-15 font-medium text-ink">
              {draft.couponCode
                ? (COUPONS.find((c) => c.code === draft.couponCode)?.title ??
                  draft.couponCode)
                : "적용된 쿠폰 없음"}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setCouponOpen(true)}>
            보유 쿠폰 {COUPONS.length}장
          </Button>
        </div>
      </Card>

      <Card className="mt-4" padded={false}>
        <div className="px-6 py-5">
          <Row label="구독 상품" value={won(base)} />
          <Row
            label="쿠폰 할인"
            value={draft.discount ? `-${won(draft.discount)}` : "-"}
          />
          <div className="mt-3 flex items-center justify-between border-t border-line-soft pt-4">
            <span className="text-14 font-medium text-ink">오늘 결제</span>
            <span className="font-num text-22 font-medium text-brand">
              {won(total)}
            </span>
          </div>
        </div>
      </Card>

      <Card className="mt-4">
        {CONSENTS.map((c) => (
          <div
            key={c.key}
            className="flex items-center justify-between gap-4 border-b border-line-soft py-3 last:border-b-0"
          >
            <Checkbox
              label={c.label}
              checked={consents[c.key]}
              onChange={(e) =>
                setConsents((v) => ({ ...v, [c.key]: e.target.checked }))
              }
            />
            <span className="shrink-0 text-12 text-muted underline underline-offset-4">
              약관 보기
            </span>
          </div>
        ))}
      </Card>

      <div className="mt-7">
        <Button
          full
          disabled={!requiredAgreed}
          onClick={() => router.push("/subscribe/payment")}
        >
          {won(total)} 결제하기
        </Button>
      </div>

      <p className="mt-4 text-center text-12 text-muted">
        결제 후 남은 생산 슬롯 1개가 확정됩니다.
      </p>
      <p className="mt-2 text-center text-12 text-muted">
        다음 결제 전날까지 이번 회차 건너뛰기·일시정지가 가능해요.
      </p>

      <Modal
        open={couponOpen}
        onClose={() => setCouponOpen(false)}
        title="사용할 혜택을 골라 주세요"
        desc="한 주문에 쿠폰 1개를 사용할 수 있어요. 가장 큰 혜택이 위에 표시됩니다."
        footer={
          <Button
            full
            variant="ghost"
            onClick={() => {
              update({ couponCode: null, discount: 0 });
              setCouponOpen(false);
            }}
          >
            쿠폰 없이 진행
          </Button>
        }
      >
        <div className="space-y-3">
          {COUPONS.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => {
                update({ couponCode: c.code, discount: c.discount });
                setCouponOpen(false);
              }}
              className={`w-full rounded-10 border px-5 py-4 text-left ${
                draft.couponCode === c.code
                  ? "border-brand bg-brand-soft"
                  : "border-line bg-white hover:bg-surface"
              }`}
            >
              <p className="text-14 font-medium text-ink">
                {c.recommended ? "추천 · " : ""}
                {c.title}
              </p>
              <p className="mt-1.5 text-12 text-muted">{c.desc}</p>
              <p className="mt-2 font-num text-12 text-brand">
                적용하면 {won(Math.max(0, base - c.discount))}
              </p>
            </button>
          ))}
        </div>
      </Modal>
    </PanelShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-13 text-muted">{label}</span>
      <span className="font-num text-14 text-ink">{value}</span>
    </div>
  );
}

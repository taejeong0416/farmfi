"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, PanelShell, SkeletonBlock } from "@/components/ui";
import { monthlyPrice, nextPaymentDate } from "@/lib/pickup-subscription";
import { postJson, shortDate, won } from "../api";
import { useSubscribeDraft } from "./useSubscribeDraft";

const REGISTERED = {
  key: "card",
  label: "신한카드  **** 4821",
  short: "신한카드",
  desc: "개인 · 일시불",
};

// 제3자 브랜드 마크는 `.fig`에 든 원본 로고를 그대로 쓴다.
const EASY = [
  { key: "kakao", label: "Kakao Pay", short: "Kakao Pay", mark: "/assets/figma/pay-kakao.png" },
  { key: "naver", label: "N pay", short: "N pay", mark: "/assets/figma/pay-naver.png" },
  { key: "toss", label: "toss pay", short: "toss pay", mark: "/assets/figma/pay-toss.png" },
];

const METHODS = [REGISTERED, ...EASY];

export function PaymentScreen() {
  const router = useRouter();
  const { draft, update, clear, ready } = useSubscribeDraft();
  const [method, setMethod] = useState(METHODS[0].key);
  const [autopay, setAutopay] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) {
    return (
      <PanelShell>
        <SkeletonBlock height={360} />
      </PanelShell>
    );
  }

  const packSize = draft.packSize ?? 5;
  const base = monthlyPrice(packSize, draft.perWeek);
  const total = Math.max(0, base - draft.discount);
  const picked = METHODS.find((m) => m.key === method) ?? REGISTERED;
  const label = picked.label;

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      update({ paymentMethod: label });
      const res = await postJson<{ subscription: { id: string } }>(
        "/api/subscriptions",
        {
          projectId: draft.projectId,
          packSize,
          perWeek: draft.perWeek,
          productIds: draft.productIds,
          dressings: draft.dressings,
          couponCode: draft.couponCode,
          discount: draft.discount,
          paymentMethod: label,
        },
      );
      clear();
      router.push(`/subscribe/done?id=${res.subscription.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "결제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/70 p-6">
      <div className="relative w-full max-w-[600px] rounded-[18px] bg-white px-8 py-8">
      <h1 className="text-24 font-bold text-ink">결제수단 선택</h1>
      <p className="mt-2 text-12 text-body">
        이번 결제와 다음 자동결제에 사용할 수단을 골라주세요.
      </p>

      <p className="mt-7 text-14 font-medium text-ink">등록된 결제수단</p>
      <button
        type="button"
        onClick={() => setMethod(REGISTERED.key)}
        className={`mt-3 flex w-full items-center gap-4 rounded-10 border px-5 py-4 text-left ${
          method === REGISTERED.key
            ? "border-brand bg-surface"
            : "border-line bg-white hover:bg-surface"
        }`}
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-8 bg-muted text-11 font-medium text-white">
          CARD
        </span>
        <span className="flex-1">
          <span className="block text-14 font-medium text-ink">
            {REGISTERED.label}
          </span>
          <span className="mt-1 block text-12 text-body">{REGISTERED.desc}</span>
        </span>
        {method === REGISTERED.key ? (
          <span className="text-18 font-bold text-brand">✓</span>
        ) : null}
      </button>

      <p className="mt-6 text-14 font-medium text-ink">간편결제</p>
      <div className="mt-3 grid grid-cols-3 gap-[29px]">
        {EASY.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMethod(m.key)}
            className={`flex items-center gap-3 rounded-10 border px-4 py-4 text-left ${
              method === m.key ? "border-brand bg-surface" : "border-line bg-white"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={m.mark}
              alt=""
              className="h-[34px] w-[34px] shrink-0 rounded-8 border border-line object-cover"
            />
            <span className="text-11 font-medium text-ink">{m.label}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        className="mt-6 h-12 w-full rounded-8 border border-line text-14 font-medium text-brand hover:bg-surface"
      >
        +&nbsp;&nbsp;새 카드 등록
      </button>

      <div className="mt-7 border-t border-line pt-7">
        <p className="text-14 font-medium text-ink">결제 정보</p>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-12 text-body">오늘 결제</span>
          <span className="font-num text-18 font-bold text-ink">{won(total)}</span>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-12 text-body">다음 결제</span>
          <span className="font-num text-14 font-medium text-ink">
            {shortDate(nextPaymentDate())} · {won(base)}
          </span>
        </div>
      </div>

      <button
        type="button"
        aria-pressed={autopay}
        onClick={() => setAutopay((v) => !v)}
        className="mt-5 flex h-[58px] w-full items-center rounded-8 bg-surface px-5 text-left text-14 font-medium text-brand"
      >
        {autopay ? "✓" : "○"}&nbsp;&nbsp;선택한 결제수단을 정기결제에 등록합니다.
      </button>

      {error ? <p className="mt-4 text-12 text-danger">{error}</p> : null}

      <div className="mt-7">
        <Button full disabled={busy} onClick={pay}>
          {busy ? "처리 중" : `${picked.short}로 결제`}
        </Button>
      </div>

      <p className="mt-4 text-center text-12 text-muted">
        결제 정보는 결제사에서 안전하게 처리됩니다.
      </p>
      </div>
    </div>
  );
}

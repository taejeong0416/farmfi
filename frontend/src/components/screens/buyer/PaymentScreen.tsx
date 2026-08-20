"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Checkbox, PanelShell, SkeletonBlock } from "@/components/ui";
import { monthlyPrice, nextPaymentDate } from "@/lib/pickup-subscription";
import { postJson, shortDate, won } from "../api";
import { SubscribeStepLine } from "./SubscribeStepLine";
import { useSubscribeDraft } from "./useSubscribeDraft";

const METHODS = [
  { key: "card", label: "등록 카드", desc: "개인 · 일시불" },
  { key: "kakao", label: "카카오페이", desc: "간편결제" },
  { key: "naver", label: "네이버페이", desc: "간편결제" },
  { key: "toss", label: "토스페이", desc: "간편결제" },
];

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
  const label = METHODS.find((m) => m.key === method)?.label ?? "등록 카드";

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
    <PanelShell className="max-w-modal">
      <SubscribeStepLine current="order" />

      <h1 className="text-20 font-bold text-ink">결제수단 선택</h1>
      <p className="mt-3 text-13 text-muted">
        이번 결제와 다음 자동결제에 사용할 수단을 골라주세요.
      </p>

      <div className="mt-6 space-y-3">
        {METHODS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMethod(m.key)}
            className={`flex w-full items-center justify-between rounded-10 border px-5 py-4 text-left ${
              method === m.key
                ? "border-brand bg-brand-soft"
                : "border-line bg-white hover:bg-surface"
            }`}
          >
            <span>
              <span className="block text-14 font-medium text-ink">
                {m.label}
              </span>
              <span className="mt-1 block text-12 text-muted">{m.desc}</span>
            </span>
            {method === m.key ? (
              <span className="text-12 font-medium text-brand">✓</span>
            ) : null}
          </button>
        ))}
      </div>

      <Card className="mt-6" padded={false}>
        <div className="px-6 py-5">
          <div className="flex items-center justify-between py-2">
            <span className="text-13 text-muted">오늘 결제</span>
            <span className="font-num text-17 font-medium text-ink">
              {won(total)}
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-13 text-muted">다음 결제</span>
            <span className="font-num text-13 text-body">
              {shortDate(nextPaymentDate())} · {won(base)}
            </span>
          </div>
        </div>
      </Card>

      <div className="mt-5">
        <Checkbox
          label="선택한 결제수단을 정기결제에 등록합니다."
          checked={autopay}
          onChange={(e) => setAutopay(e.target.checked)}
        />
      </div>

      {error ? <p className="mt-4 text-12 text-danger">{error}</p> : null}

      <div className="mt-7">
        <Button full disabled={busy} onClick={pay}>
          {busy ? "처리 중" : `${label}로 결제`}
        </Button>
      </div>

      <p className="mt-4 text-center text-12 text-muted">
        결제 정보는 결제사에서 안전하게 처리됩니다.
      </p>
    </PanelShell>
  );
}

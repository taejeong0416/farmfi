"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, PanelShell, Select, TextInput } from "@/components/ui";

const BANKS = [
  "부산은행",
  "국민은행",
  "신한은행",
  "하나은행",
  "우리은행",
  "농협은행",
  "카카오뱅크",
  "토스뱅크",
];

export function VerifyAccountScreen() {
  const router = useRouter();
  const [bank, setBank] = useState(BANKS[0]);
  const [number, setNumber] = useState("");
  const [holder, setHolder] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 예금주 확인은 은행 실시간 조회 자리다. 지금은 입력한 계좌를 그대로 확인 상태로 표시한다.
  function checkHolder() {
    setError(null);
    const digits = number.replace(/\D/g, "");
    if (digits.length < 10) {
      setError("계좌번호를 다시 확인해 주세요.");
      setHolder(null);
      return;
    }
    setHolder("본인 명의");
  }

  const masked =
    number.replace(/\D/g, "").length >= 10
      ? `${number.replace(/\D/g, "").slice(0, 3)}-****-${number.replace(/\D/g, "").slice(-4)}`
      : number || "계좌번호를 입력하세요";

  return (
    <PanelShell className="max-w-modal">
      <h1 className="text-20 font-bold text-ink">
        투자 준비 3 / 3 · 본인 계좌 확인
      </h1>
      <p className="mt-3 text-13 leading-6 text-body">
        회수금과 환불을 받을 본인 명의 계좌를 확인해 주세요.
      </p>

      <div className="mt-6 rounded-12 bg-surface p-5">
        <div className="rounded-8 bg-white px-5 py-5">
          <p className="text-15 font-bold text-ink">은행 선택 · {bank}</p>
          <p className="mt-2 font-num text-12 text-body">계좌번호 · {masked}</p>
          <p className="mt-2 text-12 font-medium text-brand">
            예금주 · {holder ?? "확인 전"}
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-12 border border-line px-6 py-6">
        <p className="text-14 font-bold text-ink">본인 명의 계좌를 확인해요</p>
        <ol className="mt-4 space-y-3">
          <li className="text-13 text-body">1 은행을 선택하고 계좌번호 입력</li>
          <li className="text-13 text-body">2 계좌번호 입력 후 예금주 확인</li>
          <li className="text-13 text-body">3 확인된 계좌를 회수 계좌로 등록</li>
        </ol>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <Field label="은행">
          <Select value={bank} onChange={(e) => setBank(e.target.value)}>
            {BANKS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="계좌번호" error={error ?? undefined}>
          <TextInput
            inputMode="numeric"
            placeholder="숫자만 입력"
            value={number}
            onChange={(e) => {
              setNumber(e.target.value);
              setHolder(null);
            }}
          />
        </Field>
      </div>

      <div className="mt-4">
        <Button full variant="ghost" onClick={checkHolder}>
          예금주 확인
        </Button>
      </div>

      <div className="mt-6">
        <Button full disabled={!holder} onClick={() => router.push("/verify/done")}>
          계좌 확인하기
        </Button>
      </div>

      <p className="mt-4 text-11 text-muted">
        확인된 계좌는 회수금·환불 지급에만 사용하며, 계좌번호는 마스킹해 보관합니다.
      </p>
    </PanelShell>
  );
}

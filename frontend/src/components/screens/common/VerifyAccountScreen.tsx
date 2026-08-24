"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthShell, Button, Field, Select, TextInput } from "@/components/ui";
import { registerBankAccount, verifyAccountHolder } from "../api";

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

/** 시연용 계좌. 예금주 조회는 지급사 어댑터가 본인확인 이름을 그대로 돌려준다. */
const DEMO_ACCOUNT = { bank: "부산은행", number: "1012345678901" };

/** next: 등록을 마친 뒤 돌아갈 앱 내부 경로. 없으면 본인확인 완료로 간다. */
export function VerifyAccountScreen({ next }: { next?: string }) {
  const router = useRouter();
  const [bank, setBank] = useState(BANKS[0]);
  const [number, setNumber] = useState("");
  const [holder, setHolder] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 예금주 조회는 지급사 어댑터가 한다. 본인확인 이름과 다르면 서버가 거절한다.
  async function checkHolder() {
    setError(null);
    setHolder(null);
    setBusy(true);
    try {
      setHolder(await verifyAccountHolder(bank, number));
    } catch (e) {
      setError(e instanceof Error ? e.message : "예금주를 확인하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function register(bankName = bank, accountNumber = number) {
    setError(null);
    setBusy(true);
    try {
      await registerBankAccount(bankName, accountNumber);
      router.push(next ?? "/verify/done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "계좌를 등록하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * 발표 자리에서는 실제 계좌번호를 부를 수 없다. 신분증 화면의 `시연 넘어가기`와
   * 짝이 되는 한 칸으로, 시연용 계좌를 채우고 확인·등록을 한 번에 끝낸다.
   */
  async function demoFill() {
    setError(null);
    setBusy(true);
    setBank(DEMO_ACCOUNT.bank);
    setNumber(DEMO_ACCOUNT.number);
    try {
      setHolder(await verifyAccountHolder(DEMO_ACCOUNT.bank, DEMO_ACCOUNT.number));
      await registerBankAccount(DEMO_ACCOUNT.bank, DEMO_ACCOUNT.number);
      router.push(next ?? "/verify/done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "시연 계좌를 등록하지 못했습니다.");
      setBusy(false);
    }
  }

  const masked =
    number.replace(/\D/g, "").length >= 10
      ? `${number.replace(/\D/g, "").slice(0, 3)}-****-${number.replace(/\D/g, "").slice(-4)}`
      : number || "계좌번호를 입력하세요";

  return (
    <AuthShell>
      <p className="text-14 text-brand">투자 준비 3 / 3 · 본인 계좌 확인</p>
      <h1 className="mt-4 text-24 font-bold text-ink">
        회수금과 환불을 받을 본인 명의 계좌를 확인해 주세요.
      </h1>

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
        <Button full variant="ghost" disabled={busy} onClick={checkHolder}>
          {busy && !holder ? "확인 중" : "예금주 확인"}
        </Button>
      </div>

      <div className="mt-6">
        <Button full disabled={!holder || busy} onClick={() => void register()}>
          계좌 확인하기
        </Button>
      </div>

      {/* 발표 자리에서 실제 계좌번호를 부를 수 없을 때 이 한 칸을 대신 채운다. */}
      <div className="mt-4">
        <Button full variant="ghost" disabled={busy} onClick={() => void demoFill()}>
          {busy ? "처리 중" : "시연 넘어가기"}
        </Button>
        <p className="mt-2 text-center text-11 text-muted">
          시연용 계좌로 확인·등록을 한 번에 마칩니다
        </p>
      </div>

      <p className="mt-4 text-11 text-muted">
        확인된 계좌는 회수금·환불 지급에만 사용하며, 계좌번호는 마스킹해 보관합니다.
      </p>
    </AuthShell>
  );
}

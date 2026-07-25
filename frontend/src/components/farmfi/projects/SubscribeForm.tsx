"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { formatKRW } from "@/lib/format";
import { explorerTxUrl } from "@/lib/onchain";

// POST /api/subscribe 가 돌려주는 error 키 → 한국어.
// lib/subscription.ts 상단 주석이 "error 문자열은 프론트(SubscribeForm)가 번역하는 키"
// 라고 못박은 계약이라 키를 그대로 쓴다. 여기 없는 키는 서버 문구를 그대로 노출해서
// 새로 생긴 에러가 "알 수 없는 오류"로 조용히 삼켜지지 않게 한다.
const ERROR_KO: Record<string, string> = {
  Unauthorized: "로그인이 필요합니다.",
  "Identity verification required": "본인인증을 마쳐야 청약할 수 있습니다.",
  "Invalid request body": "청약 수량을 다시 확인해주세요.",
  "Insufficient balance": "예치 잔액이 부족합니다.",
  "Not enough tokens available": "잔여 구좌가 부족합니다.",
  "Annual investment limit exceeded":
    "연간 투자한도를 초과했습니다. 마이페이지에서 한도를 확인하세요.",
  "Project is not open for funding": "청약을 받지 않는 지점입니다.",
  "Project not found": "프로젝트를 찾을 수 없습니다.",
  "Project escrow not found": "에스크로 정보를 찾을 수 없습니다.",
  "User not found": "사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.",
  "Subscription failed": "청약 처리 중 오류가 발생했습니다.",
};

// 서버가 identityVerified를 세션 응답(/api/auth/me)에 담지 않으므로,
// 본인인증 미완료는 이 403 키로만 구분할 수 있다.
const NEEDS_IDENTITY = "Identity verification required";

export type SubscribeProject = {
  id: string;
  status: string;
  tokenSymbol: string | null;
  tokenPrice: number | null;
  totalTokens: number | null;
  soldTokens: number;
};

type Result =
  | { ok: true; tokenAmount: number; amount: number; txHash: string | null }
  | { ok: false; code: string; message: string };

export function SubscribeForm({
  project,
  onSubscribed,
}: {
  project: SubscribeProject;
  onSubscribed?: () => void;
}) {
  const { isAuthenticated, isLoading } = useAuth();
  const [amount, setAmount] = useState("1");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const tokenPrice = project.tokenPrice ?? 0;
  const remaining = Math.max(0, (project.totalTokens ?? 0) - project.soldTokens);
  // 서버는 status를 보지 않지만 UI에서는 모집 중인 라운드만 청약을 연다.
  const isOpen = project.status === "funding" && remaining > 0;

  const qty = Number(amount);
  const qtyValid = Number.isInteger(qty) && qty >= 1 && qty <= remaining;
  const totalCost = qtyValid ? qty * tokenPrice : 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending || !qtyValid) return;

    setPending(true);
    setResult(null);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        // userId는 보내지 않는다 — 서버가 세션(JWT)에서만 읽는다(IDOR 방지).
        body: JSON.stringify({ projectId: project.id, tokenAmount: qty }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        transaction?: { txHash: string | null; amount: number; tokenAmount: number };
      } | null;

      if (!res.ok || !data?.success) {
        const code = data?.error ?? "Subscription failed";
        setResult({ ok: false, code, message: ERROR_KO[code] ?? code });
        return;
      }

      setResult({
        ok: true,
        tokenAmount: data.transaction?.tokenAmount ?? qty,
        amount: data.transaction?.amount ?? totalCost,
        txHash: data.transaction?.txHash ?? null,
      });
      setAmount("1");
      // 보유·잔여 구좌가 갱신돼 보이도록 상세를 다시 읽는다.
      onSubscribed?.();
    } catch {
      setResult({
        ok: false,
        code: "network",
        message: "네트워크 오류로 청약을 보내지 못했습니다.",
      });
    } finally {
      setPending(false);
    }
  }

  if (!isOpen) {
    return (
      <p className="muted" style={{ marginTop: 16 }}>
        {remaining <= 0
          ? "모든 구좌가 소진되었습니다."
          : "지금은 청약을 받지 않는 라운드입니다."}
      </p>
    );
  }

  if (isLoading) {
    return (
      <p className="muted" style={{ marginTop: 16 }}>
        불러오는 중…
      </p>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <Link className="btn" href="/login" style={{ marginTop: 16, width: "100%" }}>
          로그인하고 청약하기 →
        </Link>
        <p className="muted" style={{ fontSize: 13 }}>
          청약은 로그인 + 본인인증을 마친 계정만 할 수 있습니다.
        </p>
      </>
    );
  }

  const txUrl = result?.ok && result.txHash ? explorerTxUrl(result.txHash) : "";

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
      <div className="field">
        <label htmlFor="subscribe-amount">청약 구좌</label>
        <input
          id="subscribe-amount"
          className="fake-control"
          type="number"
          min={1}
          max={remaining}
          step={1}
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={pending}
          style={{ color: "var(--ink)", fontWeight: 700 }}
        />
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label>총 청약금액</label>
        <div className="fake-control" style={{ color: "var(--ink)", fontWeight: 800 }}>
          {formatKRW(totalCost)}
        </div>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>
        잔여 {remaining.toLocaleString("ko-KR")}구좌 · 1구좌 {formatKRW(tokenPrice)}
        {project.tokenSymbol ? ` (${project.tokenSymbol})` : ""}
      </p>

      <button
        className="btn"
        type="submit"
        disabled={pending || !qtyValid}
        style={{ marginTop: 12, width: "100%" }}
      >
        {pending ? "청약 처리 중…" : "청약하기 →"}
      </button>

      {!qtyValid ? (
        <p className="muted" style={{ fontSize: 13 }}>
          1 ~ {remaining.toLocaleString("ko-KR")} 사이의 정수를 입력하세요.
        </p>
      ) : null}

      {result ? (
        <div
          role="status"
          style={{
            marginTop: 14,
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1.7,
            color: result.ok ? "var(--green-800)" : "#c0392b",
          }}
        >
          {result.ok ? (
            <>
              {result.tokenAmount.toLocaleString("ko-KR")}구좌 청약 완료 (
              {formatKRW(result.amount)}).
              {result.txHash ? (
                txUrl ? (
                  <>
                    {" "}
                    <a
                      className="link"
                      href={txUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ marginTop: 0 }}
                    >
                      트랜잭션 보기 ↗
                    </a>
                  </>
                ) : (
                  <span style={{ fontWeight: 600 }}> tx {result.txHash}</span>
                )
              ) : null}
            </>
          ) : (
            <>
              {result.message}
              {result.code === NEEDS_IDENTITY ? (
                <>
                  {" "}
                  <Link className="link" href="/verify-identity" style={{ marginTop: 0 }}>
                    본인인증 하러 가기 →
                  </Link>
                </>
              ) : null}
              {result.code === "Unauthorized" ? (
                <>
                  {" "}
                  <Link className="link" href="/login" style={{ marginTop: 0 }}>
                    로그인 →
                  </Link>
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </form>
  );
}

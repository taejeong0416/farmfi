/**
 * 토스페이먼츠 정산지급대행 어댑터 (명세 16.2 · 17.3).
 *
 * 가상계좌(입금)와 **다른 상품**이다. 키도 둘로 나뉜다.
 *   - `TOSS_PAYOUT_SECRET_KEY` — 정산지급대행 전용 시크릿. 가상계좌용과 별개.
 *   - `TOSS_SECURITY_KEY`      — 본문 JWE 암호화 키. hex 64자(32바이트, AES-256).
 *
 * 지급 요청 본문에는 받는 사람의 계좌번호와 실명이 들어간다. 그래서 토스가 본문을
 * 통째로 암호화하라고 요구한다 — `dir` + `A256GCM`.
 *
 * **셀러 등록이 선행이다.** 토스는 계좌로 바로 쏘지 않고, 먼저 등록한 셀러에게
 * 보낸다. 우리 BankAccount.accountToken이 그 셀러 ID를 담을 자리다(지금은 계좌
 * 식별 해시가 들어 있다 — 계좌번호 원문을 저장하지 않기 때문이다).
 *
 * 라이브 키로 실제 지급을 실행하지 않는다. 명세 17.1-5가 법률 검토 전 실제
 * 모집을 금지하고, 나가는 돈은 되돌릴 수 없다.
 */
import { CompactEncrypt } from "jose";

import type {
  PayoutAdapter,
  PayoutInquiry,
  PayoutProviderStatus,
  PayoutRequest,
  PayoutResult,
} from "@/lib/payout-adapter";

const API_BASE = "https://api.tosspayments.com/v2";

function secretKey(): string {
  return (process.env.TOSS_PAYOUT_SECRET_KEY ?? "").trim();
}

function securityKey(): Buffer | null {
  const raw = (process.env.TOSS_SECURITY_KEY ?? "").trim();
  // hex 64자 = 32바이트. 다른 길이면 A256GCM이 거부하므로 미리 걸러 낸다.
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) return null;
  return Buffer.from(raw, "hex");
}

export function isTossPayoutConfigured(): boolean {
  return secretKey().length > 0 && securityKey() !== null;
}

/** 라이브 키인가. 실제 돈이 나가는지 판단하는 유일한 근거다. */
export function isLiveKey(): boolean {
  return secretKey().startsWith("live_");
}

/** 본문을 JWE로 감싼다. 계좌번호·실명이 평문으로 나가지 않게 하는 요구사항이다. */
export async function encryptBody(payload: unknown): Promise<string> {
  const key = securityKey();
  if (!key) throw new Error("TOSS_SECURITY_KEY가 hex 64자가 아닙니다");
  return new CompactEncrypt(new TextEncoder().encode(JSON.stringify(payload)))
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .encrypt(key);
}

function authHeader(): string {
  // 토스 규약: 시크릿 키 뒤에 콜론을 붙여 base64. 비밀번호 없는 Basic 인증이다.
  return `Basic ${Buffer.from(`${secretKey()}:`).toString("base64")}`;
}

export class TossPayoutAdapter implements PayoutAdapter {
  readonly provider = "toss-payout";

  status(): PayoutProviderStatus {
    return {
      mode: "live",
      label: isLiveKey() ? "토스페이먼츠 지급대행" : "토스페이먼츠 지급대행 · 테스트",
      provider: this.provider,
    };
  }

  async transfer(request: PayoutRequest): Promise<PayoutResult> {
    if (!isTossPayoutConfigured()) {
      return { ok: false, code: "PAYOUT_NOT_CONFIGURED", message: "지급대행이 설정되지 않았습니다." };
    }
    if (!request.accountToken) {
      return {
        ok: false,
        code: "PAYOUT_NO_ACCOUNT",
        message: "등록된 회수 계좌가 없습니다. 계좌를 등록한 뒤 다시 시도해 주세요.",
      };
    }

    try {
      // refPayoutId를 우리 payoutId로 고정한다. 같은 건을 두 번 보내도 토스가
      // 같은 요청으로 본다 — 이중 이체를 막는 유일한 장치다.
      const encrypted = await encryptBody({
        refPayoutId: request.payoutId,
        destination: request.accountToken,
        scheduleType: "EXPRESS",
        amount: Number(request.amount),
        transactionDescription: request.memo.slice(0, 20),
        metadata: { payeeName: request.payeeName },
      });

      const res = await fetch(`${API_BASE}/payouts`, {
        method: "POST",
        headers: {
          Authorization: authHeader(),
          "Content-Type": "text/plain",
          "TossPayments-api-security-mode": "ENCRYPTION",
          "Idempotency-Key": request.payoutId,
        },
        body: encrypted,
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });

      const text = await res.text();
      if (!res.ok) {
        const parsed = safeJson(text);
        return {
          ok: false,
          code: parsed?.code ?? `TOSS_${res.status}`,
          message: parsed?.message ?? "지급 요청이 거절됐습니다.",
        };
      }
      const body = safeJson(text);
      return {
        ok: true,
        providerTransferId: body?.id ?? request.payoutId,
        transferredAt: body?.requestedAt ? new Date(body.requestedAt) : new Date(),
      };
    } catch (e) {
      // 응답을 못 받았다. 재송금하지 말고 조회해야 한다 — execute 라우트가 그렇게 한다.
      console.error("[payout:toss] 요청 실패:", e);
      return {
        ok: false,
        code: "PAYOUT_TIMEOUT",
        message: "지급사 응답이 없습니다. 결과를 조회한 뒤 처리합니다.",
      };
    }
  }

  async inquire(payoutId: string): Promise<PayoutInquiry> {
    if (!isTossPayoutConfigured()) return { state: "unknown", message: "지급대행 미설정" };
    try {
      const res = await fetch(`${API_BASE}/payouts?refPayoutId=${encodeURIComponent(payoutId)}`, {
        headers: { Authorization: authHeader() },
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 404) return { state: "not_found" };
      if (!res.ok) return { state: "unknown", message: `조회 실패 (${res.status})` };

      const body = safeJson(await res.text());
      const row = Array.isArray(body) ? body[0] : (body?.payouts?.[0] ?? body);
      if (!row) return { state: "not_found" };

      // COMPLETED·IN_PROGRESS는 돈이 이미 움직였다는 뜻이다. 재송금하면 안 된다.
      if (["COMPLETED", "IN_PROGRESS", "REQUESTED"].includes(row.status)) {
        return {
          state: "sent",
          providerTransferId: row.id ?? payoutId,
          transferredAt: row.requestedAt ? new Date(row.requestedAt) : new Date(),
        };
      }
      if (["FAILED", "CANCELED"].includes(row.status)) {
        return { state: "failed", code: row.status, message: row.failureReason ?? "지급 실패" };
      }
      return { state: "unknown", message: `확정되지 않은 상태: ${row.status}` };
    } catch (e) {
      console.error("[payout:toss] 조회 실패:", e);
      return { state: "unknown", message: "조회 중 오류가 발생했습니다." };
    }
  }
}

function safeJson(text: string): Record<string, string> | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

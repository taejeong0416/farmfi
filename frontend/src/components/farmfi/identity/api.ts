import type { IdentityOffer, IdentityStatusResponse } from "./types";

export const identityStatusQueryKey = (txId: string | null) =>
  ["identity", "status", txId] as const;

async function parseJsonSafe(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function createIdentityOffer(): Promise<IdentityOffer> {
  const res = await fetch("/api/identity/offer", { method: "POST" });
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(body?.error ?? "인증 요청 생성에 실패했습니다.");
  }
  return body as IdentityOffer;
}

export async function fetchIdentityStatus(
  txId: string,
): Promise<IdentityStatusResponse> {
  const res = await fetch(`/api/identity/status?txId=${encodeURIComponent(txId)}`);
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(body?.error ?? "인증 상태 조회에 실패했습니다.");
  }
  return body as IdentityStatusResponse;
}

// 데모 전용 — 지갑앱 없이 세션을 verified로 확정한다(admin 게이트). 상세: /api/identity/confirm.
export async function confirmIdentity(txId: string): Promise<void> {
  const res = await fetch("/api/identity/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ txId }),
  });
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(body?.error ?? "데모 인증 확정에 실패했습니다.");
  }
}

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

import { createHash } from "crypto";
import { prisma } from "@/lib/db";

/**
 * 캐시 키 = `${signalType}:${이미지 sha256 앞 16자}` (최대 25자, @@unique 안전).
 * 지문이 없으면 같은 마일스톤에 아무 이미지나 올려도 이전 통과 결과가 재사용되는
 * 캐시 오염(위조 통과)이 생긴다.
 */
export function cacheKey(signalType: string, imageBase64: string): string {
  const fingerprint = createHash("sha256")
    .update(imageBase64)
    .digest("hex")
    .slice(0, 16);
  return `${signalType}:${fingerprint}`;
}

export async function getCachedAIResult(
  milestoneId: string,
  signalType: string
): Promise<any | null> {
  const entry = await prisma.aiCache.findUnique({
    where: { milestoneId_signalType: { milestoneId, signalType } },
  });
  return entry?.result ?? null;
}

export async function cacheAIResult(
  milestoneId: string,
  signalType: string,
  result: any
): Promise<void> {
  await prisma.aiCache.upsert({
    where: { milestoneId_signalType: { milestoneId, signalType } },
    update: { result },
    create: { milestoneId, signalType, result },
  });
}

// AI 호출 캐시 레이어 — 캐시 히트 시 즉시 반환, 타임아웃/실패 시 캐시로 fallback.
// 시연 중 외부 API 장애에도 데모가 멈추지 않게 한다 (L2-10-2).
export async function withAICache<T>(
  milestoneId: string,
  signalType: string,
  imageBase64: string,
  apiFn: () => Promise<T>,
  timeoutMs: number = 30000
): Promise<T & { fromCache?: boolean }> {
  const key = cacheKey(signalType, imageBase64);

  const cached = await getCachedAIResult(milestoneId, key);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  try {
    const result = await Promise.race<T>([
      apiFn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AI call timed out")), timeoutMs)
      ),
    ]);

    // 실패(passed:false)는 캐시하지 않는다 — 올바른 재제출이 옛 실패에 막히지 않게
    if ((result as { passed?: boolean })?.passed !== false) {
      await cacheAIResult(milestoneId, key, result);
    }
    return result as T & { fromCache?: boolean };
  } catch (error) {
    const fallback = await getCachedAIResult(milestoneId, key);
    if (fallback) {
      return { ...fallback, fromCache: true };
    }
    throw error;
  }
}

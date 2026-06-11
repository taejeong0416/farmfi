import { prisma } from "@/lib/db";

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
  apiFn: () => Promise<T>,
  timeoutMs: number = 15000
): Promise<T & { fromCache?: boolean }> {
  const cached = await getCachedAIResult(milestoneId, signalType);
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

    await cacheAIResult(milestoneId, signalType, result);
    return result as T & { fromCache?: boolean };
  } catch (error) {
    const fallback = await getCachedAIResult(milestoneId, signalType);
    if (fallback) {
      return { ...fallback, fromCache: true };
    }
    throw error;
  }
}

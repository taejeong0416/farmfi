import { prisma } from "@/lib/db";

export async function getCachedAIResult(
  milestoneId: string,
  signalType: string
): Promise<any | null> {
  const entry = await prisma.demoCache.findFirst({
    where: {
      step: parseInt(milestoneId, 10),
      signalType,
    },
  });
  return entry?.result ?? null;
}

export async function cacheAIResult(
  milestoneId: string,
  signalType: string,
  result: any
): Promise<void> {
  const existing = await prisma.demoCache.findFirst({
    where: {
      step: parseInt(milestoneId, 10),
      signalType,
    },
  });

  if (existing) {
    await prisma.demoCache.update({
      where: { id: existing.id },
      data: { result },
    });
  } else {
    await prisma.demoCache.create({
      data: {
        step: parseInt(milestoneId, 10),
        signalType,
        result,
      },
    });
  }
}

export async function withAICache<T>(
  milestoneId: string,
  signalType: string,
  apiFn: () => Promise<T>,
  timeoutMs: number = 5000
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

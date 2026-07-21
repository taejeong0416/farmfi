import { prisma } from "@/lib/db";

export type DemoMode = "live" | "cached";

export function getDemoMode(): DemoMode {
  return (process.env.DEMO_MODE as DemoMode) || "live";
}

export function isLiveMode(): boolean {
  return getDemoMode() === "live";
}

export function isCachedMode(): boolean {
  return getDemoMode() === "cached";
}

export async function getCachedResult(step: number, signalType?: string) {
  const entry = await prisma.demoCache.findFirst({
    where: {
      step,
      ...(signalType !== undefined ? { signalType } : {}),
    },
  });
  return entry?.result ?? null;
}

export async function saveCacheResult(
  step: number,
  signalType: string | null,
  txHash: string | null,
  blockNumber: number | null,
  result: any
) {
  // (step, signalType) 조합당 1건 유지. DemoCache에는 복합 unique가 없어
  // findFirst → update/create 로 멱등 저장한다.
  const existing = await prisma.demoCache.findFirst({
    where: { step, signalType: signalType ?? null },
  });
  if (existing) {
    await prisma.demoCache.update({
      where: { id: existing.id },
      data: { txHash, blockNumber, result },
    });
  } else {
    await prisma.demoCache.create({
      data: { step, signalType, txHash, blockNumber, result },
    });
  }
}

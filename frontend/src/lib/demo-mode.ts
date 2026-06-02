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
  await prisma.demoCache.upsert({
    where: {
      id:
        (
          await prisma.demoCache.findFirst({
            where: { step, signalType: signalType ?? undefined },
          })
        )?.id ?? "",
    },
    update: { txHash, blockNumber, result },
    create: { step, signalType, txHash, blockNumber, result },
  });
}

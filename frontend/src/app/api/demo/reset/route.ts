import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { seedScenario } from "@/lib/seed-scenario";

// 데모를 기준 상태로 되돌린다 (seed.ts와 동일한 seedScenario 재사용).
// cached 모드 재생을 위해 DemoCache는 리셋 후 복원한다.
export async function POST() {
  try {
    await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  try {
    const savedCache = await prisma.demoCache.findMany();

    const summary = await seedScenario(prisma);

    if (savedCache.length > 0) {
      await prisma.demoCache.createMany({
        data: savedCache.map((c) => ({
          step: c.step,
          signalType: c.signalType,
          txHash: c.txHash,
          blockNumber: c.blockNumber,
          result: c.result ?? undefined,
        })),
      });
    }

    return NextResponse.json({ status: "reset", ...summary });
  } catch (error) {
    console.error("POST /api/demo/reset error:", error);
    return NextResponse.json(
      { error: "Demo reset failed", detail: String(error) },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

/**
 * GET /api/admin/subscriptions — 구독·픽업 예외 관리 (A-05).
 * 자동으로 넘어가지 않은 건만 담당자가 본다 — 일시정지된 구독과 지나간 미수령 회차.
 */
export async function GET() {
  try {
    await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const now = new Date();

  const [subscriptions, missed] = await Promise.all([
    prisma.subscription.findMany({
      where: { status: { in: ["active", "paused", "waitlist"] } },
      include: {
        user: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    // 시간이 지났는데 아직 수령 표시가 없는 회차 = 미수령
    prisma.pickupOrder.findMany({
      where: { status: "scheduled", scheduledAt: { lt: now } },
      include: {
        subscription: {
          include: {
            user: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { scheduledAt: "asc" },
      take: 100,
    }),
  ]);

  return NextResponse.json({
    subscriptions,
    missedPickups: missed,
    summary: {
      active: subscriptions.filter((s) => s.status === "active").length,
      paused: subscriptions.filter((s) => s.status === "paused").length,
      missed: missed.length,
    },
  });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { serializeBigInt } from "@/lib/serialize";

// GET /api/admin/deposits/review-queue — 자동 확정하지 않은 입금 (금액 불일치·기한 초과).
export async function GET() {
  try {
    await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const events = await prisma.depositEvent.findMany({
    where: { status: { not: "CONFIRMED" }, reviewedAt: null },
    orderBy: { receivedAt: "desc" },
    take: 100,
    include: {
      investment: {
        select: {
          id: true,
          amount: true,
          status: true,
          user: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
      },
    },
  });

  return NextResponse.json(serializeBigInt({ events }));
}

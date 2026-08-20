import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { serializeBigInt } from "@/lib/serialize";

// POST /api/investments/[id]/cancel — 신청 취소 (I-05).
// 납입이 끝난 건은 취소하지 않는다 — 모집 마감 전 신청 단계에서만 가능하다.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const investment = await prisma.investment.findUnique({ where: { id } });
  if (!investment || investment.userId !== session.userId) {
    return NextResponse.json({ error: "신청 내역을 찾을 수 없습니다." }, { status: 404 });
  }
  if (investment.status === "COMPLETED") {
    return NextResponse.json(
      { error: "납입이 끝난 신청은 취소할 수 없습니다." },
      { status: 400 },
    );
  }

  const updated = await prisma.investment.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  return NextResponse.json({ investment: serializeBigInt(updated) });
}

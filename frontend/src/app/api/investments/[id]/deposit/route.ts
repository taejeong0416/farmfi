import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { serializeBigInt } from "@/lib/serialize";
import { settleInvestment } from "@/lib/investment";

// POST /api/investments/[id]/deposit — 납입 실행 (I-03 → I-04).
// 실제 처리는 lib/investment.settleInvestment가 executeSubscription을 감싸서 한다.
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

  const result = await settleInvestment(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    investment: serializeBigInt(result.investment),
    transaction: serializeBigInt(result.transaction),
  });
}

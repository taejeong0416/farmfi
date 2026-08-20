import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { serializeBigInt } from "@/lib/serialize";
import { judgeEligibility } from "@/lib/investment";

// POST /api/investments/[id]/eligibility — 적합성 판정 (I-02).
// 통과하면 ELIGIBILITY_CHECKED, 아니면 판정 사유를 남기고 상태를 되돌린다.
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
  if (investment.status === "COMPLETED" || investment.status === "CANCELLED") {
    return NextResponse.json({ error: "이미 끝난 신청입니다." }, { status: 400 });
  }

  const result = await judgeEligibility({
    userId: session.userId,
    projectId: investment.projectId,
    amount: investment.amount,
  });

  const updated = await prisma.investment.update({
    where: { id },
    data: {
      eligible: result.eligible,
      eligibilityMemo: result.memo,
      annualLimit: result.annualLimit,
      status: result.eligible ? "ELIGIBILITY_CHECKED" : "IDENTITY_REQUIRED",
    },
  });

  return NextResponse.json({
    investment: serializeBigInt(updated),
    eligibility: serializeBigInt(result),
  });
}

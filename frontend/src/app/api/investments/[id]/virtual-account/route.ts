import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { serializeBigInt } from "@/lib/serialize";
import { issueVirtualAccount } from "@/lib/deposit";

// POST /api/investments/[id]/virtual-account — 건별 가상계좌 발급 (I-03).
// 동의를 마친 신청에만 발급하고, 이미 받은 계좌가 있으면 새 계좌로 바꾼다.
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

  const result = await issueVirtualAccount(id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  }

  const { bankName, accountNumber, holderName, amount, expiresAt } = result.account;
  return NextResponse.json({
    virtualAccount: serializeBigInt({
      bankName,
      accountNumber,
      holderName,
      amount,
      expiresAt,
    }),
  });
}

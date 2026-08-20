import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { serializeBigInt } from "@/lib/serialize";
import { getDepositState, markFailure, syncDepositStatus } from "@/lib/deposit";

// POST /api/investments/[id]/deposit-inquiry — 입금내역 확인 요청 (I-03E).
// 지급사에 한 번 더 조회하고, 그래도 확인되지 않으면 확인 요청 상태로 둔다.
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
  if (investment.status !== "AWAITING_DEPOSIT") {
    return NextResponse.json({ error: "납입 대기 상태가 아닙니다." }, { status: 400 });
  }

  await syncDepositStatus(id);
  const state = await getDepositState(id);
  if (state?.status === "AWAITING_DEPOSIT" && state.failureCode == null) {
    await markFailure(id, "DEPOSIT_INQUIRY");
  }

  return NextResponse.json(serializeBigInt({ deposit: await getDepositState(id) }));
}

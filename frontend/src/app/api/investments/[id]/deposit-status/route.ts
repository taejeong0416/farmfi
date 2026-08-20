import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { serializeBigInt } from "@/lib/serialize";
import { getDepositState, syncDepositStatus } from "@/lib/deposit";

// GET /api/investments/[id]/deposit-status — 납입 상태 조회 (I-03 대기 화면).
// 조회할 때 기한과 입금 여부를 지급사에 한 번 맞춰본다.
export async function GET(
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

  await syncDepositStatus(id);
  const state = await getDepositState(id);

  return NextResponse.json(serializeBigInt({ deposit: state }));
}

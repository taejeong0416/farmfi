import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { serializeBigInt } from "@/lib/serialize";

// POST /api/investments/[id]/consent — 최종 확인·전자서명 (I-03).
// 서명 문자열을 남기고 납입 대기로 넘긴다.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const signature = (body as { signature?: unknown } | null)?.signature;
  if (typeof signature !== "string" || !signature.trim()) {
    return NextResponse.json({ error: "서명을 입력해 주세요." }, { status: 400 });
  }

  const investment = await prisma.investment.findUnique({ where: { id } });
  if (!investment || investment.userId !== session.userId) {
    return NextResponse.json({ error: "신청 내역을 찾을 수 없습니다." }, { status: 404 });
  }
  if (investment.status !== "ELIGIBILITY_CHECKED" && investment.status !== "CONSENT_REQUIRED") {
    return NextResponse.json(
      { error: "적합성 확인을 먼저 마쳐야 합니다." },
      { status: 400 },
    );
  }

  const updated = await prisma.investment.update({
    where: { id },
    data: {
      signature: signature.trim(),
      consentedAt: new Date(),
      status: "AWAITING_DEPOSIT",
    },
  });

  return NextResponse.json({ investment: serializeBigInt(updated) });
}

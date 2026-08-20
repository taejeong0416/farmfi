import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { serializeBigInt } from "@/lib/serialize";

// GET /api/investments/[id] — 신청 한 건. 본인 것만 볼 수 있다.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const investment = await prisma.investment.findUnique({
    where: { id },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          location: true,
          status: true,
          tokenPrice: true,
          fundingEnd: true,
        },
      },
    },
  });

  if (!investment || investment.userId !== session.userId) {
    return NextResponse.json({ error: "신청 내역을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ investment: serializeBigInt(investment) });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";

// GET /api/spaces/available — 운영자가 고를 수 있는 공간 목록 (O-01 · O-02).
// 소유자 스코프인 GET /api/spaces와 달리, 심사를 통과한 공간을 전부 보여준다.
// 소유자 개인정보는 내려보내지 않는다.
export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const spaces = await prisma.space.findMany({
    where: { status: { in: ["approved", "reviewing"] } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      spaceType: true,
      address: true,
      area: true,
      electricity: true,
      water: true,
      lighting: true,
      preferredMode: true,
      photos: true,
      suitabilityScore: true,
      estimatedRent: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ spaces });
}

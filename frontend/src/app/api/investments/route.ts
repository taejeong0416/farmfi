import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { serializeBigInt } from "@/lib/serialize";

// GET /api/investments — 내 투자 신청 목록 (I-05 신청·취소 내역).
// userId는 세션에서만 읽는다 — 클라이언트 값은 신뢰하지 않는다.
export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const investments = await prisma.investment.findMany({
    where: { userId: session.userId },
    include: { project: { select: { id: true, name: true, status: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ investments: serializeBigInt(investments) });
}

// POST /api/investments — 신청 시작. 프로젝트당 진행 중인 신청은 하나만 둔다.
export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { projectId, amount } = (body ?? {}) as {
    projectId?: unknown;
    amount?: unknown;
  };

  if (typeof projectId !== "string" || !projectId) {
    return NextResponse.json({ error: "projectId가 필요합니다." }, { status: 400 });
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "신청 금액을 확인해 주세요." }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  }
  if (project.tokenPrice == null || project.tokenPrice === BigInt(0)) {
    return NextResponse.json(
      { error: "이 프로젝트는 모집 설정이 끝나지 않았습니다." },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  const amountBig = BigInt(Math.floor(amount));
  const units = Number(amountBig / project.tokenPrice);

  // 같은 프로젝트에 진행 중인 신청이 있으면 그 건을 이어서 쓴다.
  const open = await prisma.investment.findFirst({
    where: {
      userId: session.userId,
      projectId,
      status: { notIn: ["COMPLETED", "CANCELLED"] },
    },
  });

  const status = user?.identityVerified ? "DRAFT" : "IDENTITY_REQUIRED";

  const investment = open
    ? await prisma.investment.update({
        where: { id: open.id },
        data: { amount: amountBig, units, status, failureReason: null },
      })
    : await prisma.investment.create({
        data: {
          userId: session.userId,
          projectId,
          amount: amountBig,
          units,
          status,
        },
      });

  return NextResponse.json({ investment: serializeBigInt(investment) });
}

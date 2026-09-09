import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeBigInt } from "@/lib/serialize";
import { resolveSettlementRule } from "@/lib/waterfall";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        escrow: true,
        milestones: { orderBy: { seq: "asc" } },
        tokenHoldings: true,
        transactions: { orderBy: { createdAt: "desc" }, take: 10 },
        // 상세 화면의 운영자·파트너 영역이 쓴다.
        // operator는 User라 통째로 내리면 비밀번호 해시와 잔액까지 공개 응답에 실린다.
        operator: { select: { id: true, name: true } },
        partners: {
          select: { id: true, role: true, name: true, totalContribution: true },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // 목록과 같은 두 값을 여기서도 계산한다. 없으면 상세 화면이
    // 달성률 NaN%·참여자 undefined명으로 그린다.
    const target = Number(project.targetAmount ?? 0);
    const fundingPercent =
      target === 0 ? 0 : (Number(project.currentAmount) / target) * 100;

    // 상세 화면의 회수 조건이 쓴다. 지점별 규칙이 아직 없으면 기본값이 내려간다 —
    // 정산과 같은 해석기를 쓰지 않으면 화면과 실제 배분이 다른 말을 하게 된다.
    const settlementRule = await resolveSettlementRule(id);

    return NextResponse.json(
      serializeBigInt({
        ...project,
        fundingPercent,
        investorCount: project.tokenHoldings.length,
        settlementRule,
      }),
    );
  } catch (error) {
    console.error("GET /api/projects/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch project" },
      { status: 500 }
    );
  }
}

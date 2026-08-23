import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeBigInt } from "@/lib/serialize";

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

    return NextResponse.json(
      serializeBigInt({
        ...project,
        fundingPercent,
        investorCount: project.tokenHoldings.length,
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

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function serializeBigInt(obj: any): any {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}

export async function GET(request: NextRequest) {
  try {
    const projects = await prisma.project.findMany({
      include: {
        escrow: true,
        milestones: true,
        _count: { select: { tokenHoldings: true } },
      },
    });

    const result = projects.map((p) => {
      const fundingPercent =
        Number(p.targetAmount) === 0
          ? 0
          : (Number(p.currentAmount) / Number(p.targetAmount)) * 100;

      return {
        ...p,
        fundingPercent,
        investorCount: p._count.tokenHoldings,
      };
    });

    return NextResponse.json({ projects: serializeBigInt(result) });
  } catch (error) {
    console.error("GET /api/projects error:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

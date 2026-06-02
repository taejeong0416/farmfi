import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateNAV } from "@/lib/nav-calculator";

function serialize(obj: any): any {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        escrow: true,
        milestones: { orderBy: { seq: "asc" } },
        partners: true,
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const transactions = await prisma.transaction.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const tokenHoldersCount = await prisma.tokenHolding.count({
      where: { projectId },
    });

    const dividends = await prisma.dividend.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });

    // Latest IoT data + last 24h (48 records)
    const latestIot = await prisma.iotData.findFirst({
      where: { projectId },
      orderBy: { recordedAt: "desc" },
    });

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const iotHistory = await prisma.iotData.findMany({
      where: { projectId, recordedAt: { gte: twentyFourHoursAgo } },
      orderBy: { recordedAt: "desc" },
      take: 48,
    });

    const navSnapshots = await prisma.navSnapshot.findMany({
      where: { projectId },
      orderBy: { recordedAt: "desc" },
    });

    const nav = await calculateNAV(projectId);

    const co2Reduction = (project.areaSqm || 0) * 2.5;
    const foodMileReduction = (project.areaSqm || 0) * 15;

    return NextResponse.json(
      serialize({
        project,
        escrow: project.escrow,
        milestones: project.milestones,
        transactions,
        tokenHoldersCount,
        dividends,
        iot: {
          latest: latestIot,
          history: iotHistory,
        },
        navSnapshots,
        nav,
        esg: {
          co2Reduction,
          foodMileReduction,
        },
      })
    );
  } catch (error) {
    console.error("GET /api/dashboard/[projectId] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { releaseTrancheOnChain } from "@/lib/onchain";

function serialize(obj: any): any {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const milestone = await prisma.milestone.findUnique({
      where: { id },
      include: { project: { include: { escrow: true, milestones: true } } },
    });

    if (!milestone) {
      return NextResponse.json(
        { error: "Milestone not found" },
        { status: 404 }
      );
    }

    if (milestone.status === "completed") {
      return NextResponse.json(
        { error: "Milestone already completed" },
        { status: 400 }
      );
    }

    if (milestone.status === "manual_review") {
      return NextResponse.json(
        { error: "Requires admin approval" },
        { status: 400 }
      );
    }

    if (milestone.status !== "verified") {
      return NextResponse.json(
        { error: "Milestone must be verified first" },
        { status: 400 }
      );
    }

    const escrow = milestone.project.escrow;
    if (!escrow) {
      return NextResponse.json(
        { error: "Escrow not found" },
        { status: 404 }
      );
    }

    const releaseAmount = milestone.releaseAmount;

    // Update milestone, escrow, create transaction, and advance next milestone
    const updatedMilestone = await prisma.$transaction(async (tx) => {
      const completed = await tx.milestone.update({
        where: { id },
        data: { status: "completed", completedAt: new Date() },
      });

      await tx.escrow.update({
        where: { id: escrow.id },
        data: {
          totalReleased: { increment: releaseAmount },
          remaining: { decrement: releaseAmount },
        },
      });

      await tx.transaction.create({
        data: {
          projectId: milestone.projectId,
          type: "tranche_release",
          amount: releaseAmount,
          memo: `Milestone ${milestone.seq} completed: ${milestone.name}`,
        },
      });

      // Activate next milestone
      const nextMilestone = await tx.milestone.findUnique({
        where: {
          projectId_seq: {
            projectId: milestone.projectId,
            seq: milestone.seq + 1,
          },
        },
      });

      if (nextMilestone) {
        await tx.milestone.update({
          where: { id: nextMilestone.id },
          data: { status: "in_progress" },
        });
      }

      // Check if all milestones are completed
      const allMilestones = await tx.milestone.findMany({
        where: { projectId: milestone.projectId },
      });
      const allCompleted = allMilestones.every(
        (m) => m.id === id || m.status === "completed"
      );

      if (allCompleted) {
        await tx.project.update({
          where: { id: milestone.projectId },
          data: { status: "operating" },
        });
      }

      return completed;
    });

    // 트랜치 자동집행을 온체인에 실행 (배포 전이면 null, 체인 오류 시 DB는 유지)
    let txHash: string | null = null;
    try {
      txHash = await releaseTrancheOnChain(milestone.seq);
    } catch (e) {
      console.error("releaseTrancheOnChain failed:", e);
    }

    return NextResponse.json(
      serialize({
        success: true,
        milestone: updatedMilestone,
        txHash,
      })
    );
  } catch (error) {
    console.error("POST /api/milestones/[id]/complete error:", error);
    return NextResponse.json(
      { error: "Failed to complete milestone" },
      { status: 500 }
    );
  }
}

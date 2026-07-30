import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeBigInt as serialize } from "@/lib/serialize";
import { requireRole } from "@/lib/auth";
import { releaseTrancheOnChain, MILESTONE_TIMEOUT_MS } from "@/lib/onchain";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 에스크로 자금을 실제로 집행하는 라우트라 admin 전용이다. Project에 소유자
  // 필드가 없어 "내 프로젝트만" 검증이 불가하므로, 누구나 스스로 operator가 되어
  // 남의 프로젝트 트랜치를 집행하는 권한 자가상승을 admin 게이트로 차단한다.
  try {
    await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
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

    // 에스크로 잔액을 초과하는 릴리즈 차단 (잔액 음수·NAV 왜곡 방지)
    if (releaseAmount > escrow.remaining) {
      return NextResponse.json(
        { error: "Insufficient escrow balance for tranche release" },
        { status: 400 }
      );
    }

    // 상태검사 → 에스크로 차감 → 완료 처리를 한 트랜잭션으로 원자화한다.
    // 위의 사전 검사는 에러 메시지용일 뿐 TOCTOU를 막지 못하므로, 실제 차단은
    // 아래 조건부 updateMany(status: "verified")가 담당한다.
    const updatedMilestone = await prisma.$transaction(async (tx) => {
      // verified인 행만 completed로 전이. 동시 요청 중 하나만 성공한다.
      const claimed = await tx.milestone.updateMany({
        where: { id, status: "verified" },
        data: { status: "completed", completedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new Error("ALREADY_COMPLETED");
      }

      // 잔액도 트랜잭션 안에서 재확인 — 동시 집행으로 remaining이 음수가 되지 않게.
      const freshEscrow = await tx.escrow.findUnique({ where: { id: escrow.id } });
      if (!freshEscrow || releaseAmount > freshEscrow.remaining) {
        throw new Error("INSUFFICIENT_ESCROW");
      }

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
        // 다음 단계의 180일 시계를 지금 시작한다 —
        // Escrow.releaseTranche가 `milestoneDeadline = block.timestamp + MILESTONE_TIMEOUT`
        // 로 기한을 갱신하는 것과 같은 규칙(직전 완료 시각 + 180일).
        await tx.milestone.update({
          where: { id: nextMilestone.id },
          data: {
            status: "in_progress",
            deadlineAt: new Date(Date.now() + MILESTONE_TIMEOUT_MS),
          },
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

      // updateMany는 행을 반환하지 않으므로 트랜잭션 안에서 갱신된 행을 다시 읽는다.
      return tx.milestone.findUniqueOrThrow({ where: { id } });
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
    // 트랜잭션 안에서 던진 이중집행/잔액부족 신호는 4xx로 되돌린다.
    const message = error instanceof Error ? error.message : "";
    if (message.includes("ALREADY_COMPLETED")) {
      return NextResponse.json(
        { error: "Milestone already completed" },
        { status: 400 }
      );
    }
    if (message.includes("INSUFFICIENT_ESCROW")) {
      return NextResponse.json(
        { error: "Insufficient escrow balance for tranche release" },
        { status: 400 }
      );
    }
    console.error("POST /api/milestones/[id]/complete error:", error);
    return NextResponse.json(
      { error: "Failed to complete milestone" },
      { status: 500 }
    );
  }
}

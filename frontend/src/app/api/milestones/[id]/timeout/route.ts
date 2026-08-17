import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeBigInt as serialize } from "@/lib/serialize";
import { requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { triggerTimeoutFailureOnChain } from "@/lib/onchain";

// POST /api/milestones/[id]/timeout — 마일스톤 기한 초과 → 프로젝트 실패 전환.
//
// 컨트랙트(Escrow.triggerTimeoutFailure)는 permissionless지만, 이 라우트는 DB 상태를
// 되돌릴 수 없게 바꾸므로 admin 게이트를 건다. 투자자 셀프 트리거는 온체인 경로
// (누구나 컨트랙트에 직접 호출)가 담당한다 — 그게 admin 선의에 의존하지 않는 탈출구다.
//
// 온체인 호출은 시도하되 실패는 삼킨다. 컨트랙트 가드가
// `block.timestamp > milestoneDeadline`(배포 + 180일)이라 시연 구간에서는 반드시
// "Deadline not passed"로 revert한다. verify/complete 라우트와 같은 패턴 — DB가 진실이고
// 온체인 기록은 best-effort다.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  try {
    const { id } = await params;

    const milestone = await prisma.milestone.findUnique({
      where: { id },
      include: { project: { include: { escrow: true } } },
    });

    if (!milestone) {
      return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
    }

    if (milestone.status === "completed") {
      return NextResponse.json(
        { error: "Milestone already completed" },
        { status: 400 }
      );
    }
    if (milestone.status === "failed" || milestone.project.status === "failed") {
      return NextResponse.json(
        { error: "Project already failed" },
        { status: 400 }
      );
    }
    if (!milestone.deadlineAt) {
      return NextResponse.json(
        { error: "Milestone has no deadline" },
        { status: 400 }
      );
    }

    const now = new Date();
    if (now <= milestone.deadlineAt) {
      const remainingDays = Math.ceil(
        (milestone.deadlineAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
      );
      return NextResponse.json(
        {
          error: "Deadline not passed",
          deadlineAt: milestone.deadlineAt.toISOString(),
          remainingDays,
        },
        { status: 400 }
      );
    }

    // 상태검사 → 실패 전환을 원자화. 위의 사전 검사는 에러 메시지용이고, 실제 이중
    // 전환 차단은 조건부 updateMany(status not in completed/failed)가 담당한다.
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.milestone.updateMany({
        where: { id, status: { notIn: ["completed", "failed"] } },
        data: { status: "failed" },
      });
      if (claimed.count === 0) {
        throw new Error("ALREADY_FAILED");
      }

      await tx.project.update({
        where: { id: milestone.projectId },
        data: { status: "failed", failedAt: now },
      });

      // 에스크로 잔액은 이 시점에 건드리지 않는다. 환불(POST /api/projects/[id]/refund)이
      // active → failed → refunded 순서로 상태를 넘기며 실제 분배를 집행한다.
      if (milestone.project.escrow) {
        await tx.escrow.update({
          where: { id: milestone.project.escrow.id },
          data: { status: "failed" },
        });
      }

      await tx.notification.create({
        data: {
          projectId: milestone.projectId,
          milestoneId: milestone.id,
          type: "milestone_timeout",
          message: `마일스톤 "${milestone.name}" 기한 초과(${milestone.deadlineAt!.toLocaleDateString(
            "ko-KR"
          )}) — 프로젝트 실패 전환. 잔여 에스크로는 보유 구좌 비례로 환불됩니다.`,
        },
      });

      return tx.milestone.findUniqueOrThrow({
        where: { id },
        include: { project: { include: { escrow: true } } },
      });
    });

    // 온체인 실패 전환 시도 (배포 전이면 null, revert/체인 오류 시 DB는 유지)
    let txHash: string | null = null;
    let onchainError: string | null = null;
    try {
      txHash = await triggerTimeoutFailureOnChain();
    } catch (e) {
      // viem 에러 전문은 수십 줄이라 첫 줄(= revert 사유)만 남긴다. admin 전용 응답이고
      // 컨트랙트 revert 문구는 공개 정보라 노출해도 안전하다.
      const raw = e instanceof Error ? e.message : String(e);
      onchainError = raw.split("\n")[0].slice(0, 200);
      console.error("triggerTimeoutFailureOnChain failed:", e);
    }

    await recordAudit({
      actorId: session.userId,
      actorRole: "admin",
      action: "milestone.timeout",
      entityType: "milestone",
      entityId: id,
      projectId: milestone.projectId,
      summary: `마일스톤 ${milestone.seq} "${milestone.name}" 기한 초과 — 프로젝트 실패 전환`,
      detail: { deadlineAt: milestone.deadlineAt.toISOString(), txHash, onchainError },
    });

    return NextResponse.json(
      serialize({
        success: true,
        milestone: result,
        project: result.project,
        txHash,
        // 시연 중 온체인 revert 사유를 숨기지 않는다 (컨트랙트 180일 가드).
        onchainError,
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("ALREADY_FAILED")) {
      return NextResponse.json(
        { error: "Project already failed" },
        { status: 400 }
      );
    }
    console.error("POST /api/milestones/[id]/timeout error:", error);
    return NextResponse.json(
      { error: "Failed to trigger milestone timeout" },
      { status: 500 }
    );
  }
}

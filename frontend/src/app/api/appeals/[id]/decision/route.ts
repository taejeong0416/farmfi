import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { APPEAL_TRANSITIONS, type AppealAction } from "@/lib/appeal";

const ACTION_LABEL: Record<AppealAction, string> = {
  review: "운영팀 검토 착수",
  escalate: "외부 전문가 판정 의뢰",
  approve: "인정",
  reject: "기각",
};

// POST /api/appeals/[id]/decision — 단계적 재검증의 상태를 전이시킨다 (명세 1.3).
//   review   : open → under_review        (운영팀 검토 착수)
//   escalate : open|under_review → escalated (외부 전문가 최종 판정 의뢰)
//   approve  : under_review|escalated → approved
//   reject   : under_review|escalated → rejected
//
// 인정(approve)되면 마일스톤을 재검증 가능한 상태로 되돌린다. 자동 검증 2회 실패로
// manual_review에 갇힌 건이 이의제기 인정 후에도 그대로면 재제출 경로가 없기 때문이다.
// 되돌리는 대상은 manual_review 건뿐이다 — 기한 초과로 failed된 프로젝트는 환불
// 절차로 넘어갔으므로 이의제기로 되살리지 않는다.
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
    const { action, decision } = await request.json();

    if (!action || !(action in APPEAL_TRANSITIONS)) {
      return NextResponse.json(
        { error: `action must be one of: ${Object.keys(APPEAL_TRANSITIONS).join(", ")}` },
        { status: 400 }
      );
    }
    const step = APPEAL_TRANSITIONS[action as AppealAction];

    const isFinal = action === "approve" || action === "reject";
    if (isFinal && (typeof decision !== "string" || decision.trim().length === 0)) {
      return NextResponse.json(
        { error: "최종 판정에는 사유(decision)가 필요합니다" },
        { status: 400 }
      );
    }

    const appeal = await prisma.appeal.findUnique({
      where: { id },
      include: { milestone: { select: { id: true, seq: true, name: true, status: true } } },
    });
    if (!appeal) {
      return NextResponse.json({ error: "Appeal not found" }, { status: 404 });
    }

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      // 허용된 이전 상태인 행만 전이시킨다. 동시 판정 중 하나만 성공한다.
      const claimed = await tx.appeal.updateMany({
        where: { id, status: { in: [...step.from] } },
        data: {
          status: step.to,
          ...(isFinal
            ? { decision: String(decision).trim(), decidedById: session.userId, decidedAt: now }
            : {}),
        },
      });
      if (claimed.count === 0) {
        throw new Error("INVALID_TRANSITION");
      }

      if (action === "approve" && appeal.milestone.status === "manual_review") {
        await tx.milestone.update({
          where: { id: appeal.milestoneId },
          data: { status: "in_progress", retryCount: 0 },
        });
      }

      return tx.appeal.findUniqueOrThrow({
        where: { id },
        include: { comments: { orderBy: { createdAt: "asc" } } },
      });
    });

    await prisma.notification.create({
      data: {
        milestoneId: appeal.milestoneId,
        projectId: appeal.projectId,
        type: "appeal_decided",
        message: `마일스톤 ${appeal.milestone.seq} "${appeal.milestone.name}" 이의제기 — ${ACTION_LABEL[action as AppealAction]}${
          isFinal ? `: ${String(decision).trim().slice(0, 120)}` : ""
        }`,
      },
    });

    await recordAudit({
      actorId: session.userId,
      actorRole: "admin",
      action: "appeal.decided",
      entityType: "appeal",
      entityId: id,
      projectId: appeal.projectId,
      summary: `이의제기 ${ACTION_LABEL[action as AppealAction]} (${appeal.status} → ${step.to})`,
      detail: {
        from: appeal.status,
        to: step.to,
        ...(isFinal ? { decision: String(decision).trim() } : {}),
        milestoneReopened: action === "approve" && appeal.milestone.status === "manual_review",
      },
    });

    return NextResponse.json({ appeal: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("INVALID_TRANSITION")) {
      return NextResponse.json(
        { error: "현재 상태에서 허용되지 않는 판정입니다" },
        { status: 409 }
      );
    }
    console.error("POST /api/appeals/[id]/decision error:", error);
    return NextResponse.json({ error: "Failed to decide appeal" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { canAccessProjectAppeal, isAppealable } from "@/lib/appeal";

// POST /api/milestones/[id]/appeals — 반려·보류된 마일스톤에 이의제기를 접수한다 (명세 1.3).
// 운영자는 자기 지점만, admin은 전부. 마일스톤당 미결(open/under_review/escalated)
// 이의제기는 하나만 허용한다 — 같은 건이 병렬로 판정되면 상태가 갈린다.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { reason, attachmentUrl } = await request.json();

    if (typeof reason !== "string" || reason.trim().length === 0) {
      return NextResponse.json({ error: "reason is required" }, { status: 400 });
    }

    const milestone = await prisma.milestone.findUnique({
      where: { id },
      select: { id: true, name: true, seq: true, projectId: true, status: true, retryCount: true },
    });
    if (!milestone) {
      return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
    }

    if (!(await canAccessProjectAppeal(session, milestone.projectId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!isAppealable(milestone.status, milestone.retryCount)) {
      return NextResponse.json(
        { error: "보류·반려된 마일스톤에만 이의제기할 수 있습니다" },
        { status: 400 }
      );
    }

    const pending = await prisma.appeal.findFirst({
      where: {
        milestoneId: id,
        status: { in: ["open", "under_review", "escalated"] },
      },
      select: { id: true },
    });
    if (pending) {
      return NextResponse.json(
        { error: "이미 진행 중인 이의제기가 있습니다", appealId: pending.id },
        { status: 409 }
      );
    }

    const appeal = await prisma.appeal.create({
      data: {
        milestoneId: id,
        projectId: milestone.projectId,
        submittedById: session.userId,
        reason: reason.trim(),
        // 보완 자료는 스레드의 첫 코멘트로 남겨 이후 자료와 같은 방식으로 읽히게 한다.
        ...(attachmentUrl
          ? {
              comments: {
                create: {
                  authorId: session.userId,
                  authorRole: session.role,
                  body: "이의제기 보완 자료",
                  attachmentUrl: String(attachmentUrl),
                },
              },
            }
          : {}),
      },
      include: { comments: true },
    });

    // 운영팀이 알림함에서 바로 집도록 알림을 남긴다.
    await prisma.notification.create({
      data: {
        milestoneId: id,
        projectId: milestone.projectId,
        type: "appeal_submitted",
        message: `마일스톤 ${milestone.seq} "${milestone.name}" 이의제기 접수 — ${reason.trim().slice(0, 120)}`,
        evidenceUrl: attachmentUrl ? String(attachmentUrl) : null,
      },
    });

    await recordAudit({
      actorId: session.userId,
      actorRole: session.role,
      action: "appeal.submitted",
      entityType: "appeal",
      entityId: appeal.id,
      projectId: milestone.projectId,
      summary: `마일스톤 ${milestone.seq} "${milestone.name}" 이의제기 접수`,
      detail: { milestoneId: id, reason: reason.trim() },
    });

    return NextResponse.json({ appeal }, { status: 201 });
  } catch (error) {
    console.error("POST /api/milestones/[id]/appeals error:", error);
    return NextResponse.json({ error: "Failed to submit appeal" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { canAccessProjectAppeal } from "@/lib/appeal";

// POST /api/appeals/[id]/comments — 코멘트 스레드에 글을 남긴다 (명세 1.3.1).
// 운영자는 자기 지점 건만, admin은 전부. admin은 asRole="auditor"로 외부 전문가
// 의견을 대신 기록할 수 있다 (Role에 auditor 계정 역할이 없다 — lib/appeal.ts 주석).
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
    const { body, attachmentUrl, asRole } = await request.json();

    if (typeof body !== "string" || body.trim().length === 0) {
      return NextResponse.json({ error: "body is required" }, { status: 400 });
    }

    const appeal = await prisma.appeal.findUnique({
      where: { id },
      select: { id: true, projectId: true, status: true, milestoneId: true },
    });
    if (!appeal) {
      return NextResponse.json({ error: "Appeal not found" }, { status: 404 });
    }
    if (!(await canAccessProjectAppeal(session, appeal.projectId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (appeal.status === "approved" || appeal.status === "rejected") {
      return NextResponse.json(
        { error: "최종 판정된 이의제기에는 코멘트를 남길 수 없습니다" },
        { status: 400 }
      );
    }

    const authorRole =
      asRole === "auditor" && session.role === "admin" ? "auditor" : session.role;

    const comment = await prisma.appealComment.create({
      data: {
        appealId: id,
        authorId: session.userId,
        authorRole,
        body: body.trim(),
        attachmentUrl: attachmentUrl ? String(attachmentUrl) : null,
      },
    });

    await recordAudit({
      actorId: session.userId,
      actorRole: authorRole === "auditor" ? "auditor" : session.role,
      action: "appeal.commented",
      entityType: "appeal",
      entityId: id,
      projectId: appeal.projectId,
      summary: `이의제기 코멘트 (${authorRole}): ${body.trim().slice(0, 120)}`,
      detail: { commentId: comment.id, hasAttachment: !!attachmentUrl },
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    console.error("POST /api/appeals/[id]/comments error:", error);
    return NextResponse.json({ error: "Failed to add comment" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

// GET /api/admin/notifications — 발송 이력 (A-14)
export async function GET() {
  try {
    await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const notifications = await prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ notifications });
}

/**
 * POST /api/admin/notifications — 공지 발송 (A-14).
 * 마일스톤 검증 실패 전용인 /api/admin/notify와 달리 프로젝트 단위 공지를 보낸다.
 */
export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { projectId, title, message } = (body ?? {}) as {
    projectId?: unknown;
    title?: unknown;
    message?: unknown;
  };

  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "제목을 입력해 주세요." }, { status: 400 });
  }
  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "내용을 입력해 주세요." }, { status: 400 });
  }

  const target = typeof projectId === "string" && projectId ? projectId : null;
  if (target) {
    const project = await prisma.project.findUnique({ where: { id: target } });
    if (!project) {
      return NextResponse.json(
        { error: "프로젝트를 찾을 수 없습니다." },
        { status: 404 },
      );
    }
  }

  const notification = await prisma.notification.create({
    data: {
      projectId: target,
      type: "notice",
      message: `${title.trim()} — ${message.trim()}`,
    },
  });

  await recordAudit({
    actorId: session.userId,
    actorRole: "admin",
    action: "notification.sent",
    entityType: "project",
    entityId: target,
    projectId: target,
    summary: `공지 발송: ${title.trim()}`,
    detail: { title: title.trim(), message: message.trim() },
  });

  return NextResponse.json({ notification });
}

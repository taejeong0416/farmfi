import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { getMyApplication, rollUpEducation } from "@/lib/operator-apply";

/**
 * POST /api/operator/courses/[id]/progress — 강의 진도를 남긴다 (O-05).
 *
 * 재생 중에 계속 불린다. 진도는 뒤로 가지 않는다 — 이어보기로 앞부분을 다시 봐도
 * 이미 본 만큼은 본 것이다. 중단 지점(`lastPositionSec`)은 그대로 덮어써서
 * 다음에 그 자리에서 이어볼 수 있게 한다.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const progress = Number(b.progress);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
    return NextResponse.json(
      { error: "교육 진행률이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const course = await prisma.operatorCourse.findFirst({
    where: { OR: [{ id }, { code: id }], isActive: true },
  });
  if (!course) {
    return NextResponse.json({ error: "과정을 찾을 수 없습니다." }, { status: 404 });
  }

  const application = await getMyApplication(session.userId);
  if (!application) {
    return NextResponse.json({ error: "진행 중인 신청이 없습니다." }, { status: 404 });
  }

  const rounded = Math.round(progress);
  const positionRaw = Number(b.lastPositionSec);
  const position = Number.isFinite(positionRaw)
    ? Math.min(course.durationSec, Math.max(0, Math.round(positionRaw)))
    : Math.round((rounded / 100) * course.durationSec);

  const existing = await prisma.operatorCourseProgress.findUnique({
    where: {
      applicationId_courseId: { applicationId: application.id, courseId: course.id },
    },
  });
  const next = Math.max(rounded, existing?.progress ?? 0);
  const done = next >= 100;

  const saved = await prisma.operatorCourseProgress.upsert({
    where: {
      applicationId_courseId: { applicationId: application.id, courseId: course.id },
    },
    update: {
      progress: next,
      lastPositionSec: position,
      completedAt: done ? (existing?.completedAt ?? new Date()) : null,
    },
    create: {
      applicationId: application.id,
      courseId: course.id,
      progress: next,
      lastPositionSec: position,
      completedAt: done ? new Date() : null,
    },
  });

  const rolled = await rollUpEducation(application.id);

  return NextResponse.json({
    progress: {
      courseId: course.id,
      code: course.code,
      progress: saved.progress,
      lastPositionSec: saved.lastPositionSec,
      completedAt: saved.completedAt,
    },
    education: rolled,
  });
}

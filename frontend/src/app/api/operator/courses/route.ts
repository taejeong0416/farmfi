import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { getMyApplication } from "@/lib/operator-apply";

// GET /api/operator/courses — 필수 교육 과정과 내 진도 (O-05).
// 진도 행이 없는 과정은 0으로 준다 — 화면이 없는 경우를 따로 다루지 않게.
export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const courses = await prisma.operatorCourse.findMany({
    where: { isActive: true },
    orderBy: { seq: "asc" },
  });
  const application = await getMyApplication(session.userId);

  const progresses = application
    ? await prisma.operatorCourseProgress.findMany({
        where: { applicationId: application.id },
      })
    : [];
  const byCourse = new Map(progresses.map((p) => [p.courseId, p]));

  return NextResponse.json({
    courses: courses.map((c) => {
      const p = byCourse.get(c.id);
      return {
        id: c.id,
        code: c.code,
        title: c.title,
        summary: c.summary,
        seq: c.seq,
        weight: c.weight,
        durationSec: c.durationSec,
        progress: p?.progress ?? 0,
        lastPositionSec: p?.lastPositionSec ?? 0,
        completedAt: p?.completedAt ?? null,
      };
    }),
    educationProgress: application?.educationProgress ?? 0,
    educationDoneAt: application?.educationDoneAt ?? null,
  });
}

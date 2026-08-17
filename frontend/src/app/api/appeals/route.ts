import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { APPEAL_STATUSES } from "@/lib/appeal";

// GET /api/appeals?projectId=&milestoneId=&status= — 이의제기 목록 (명세 1.3).
// admin은 전부, 운영자는 자기가 운영하는 지점 건만 본다. 그 외 역할은 접근 불가.
export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin" && session.role !== "operator") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = req.nextUrl.searchParams;
  const projectId = q.get("projectId");
  const milestoneId = q.get("milestoneId");
  const status = q.get("status");

  if (status && !APPEAL_STATUSES.includes(status as (typeof APPEAL_STATUSES)[number])) {
    return NextResponse.json({ error: `Unknown status: ${status}` }, { status: 400 });
  }

  try {
    // 운영자 스코프: 자기 지점 목록으로 where를 좁힌다 (projectId를 직접 넘겨도 교집합만 남음).
    let scopedProjectIds: string[] | null = null;
    if (session.role === "operator") {
      const own = await prisma.project.findMany({
        where: { operatorId: session.userId },
        select: { id: true },
      });
      scopedProjectIds = own.map((p) => p.id);
      if (projectId && !scopedProjectIds.includes(projectId)) {
        return NextResponse.json({ appeals: [] });
      }
    }

    const appeals = await prisma.appeal.findMany({
      where: {
        ...(milestoneId ? { milestoneId } : {}),
        ...(status ? { status } : {}),
        ...(projectId
          ? { projectId }
          : scopedProjectIds
            ? { projectId: { in: scopedProjectIds } }
            : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        milestone: { select: { seq: true, name: true, status: true } },
        _count: { select: { comments: true } },
      },
    });

    return NextResponse.json({ appeals, statuses: APPEAL_STATUSES });
  } catch (error) {
    console.error("GET /api/appeals error:", error);
    return NextResponse.json({ error: "Failed to load appeals" }, { status: 500 });
  }
}

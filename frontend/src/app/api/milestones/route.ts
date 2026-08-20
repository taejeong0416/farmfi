import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeBigInt } from "@/lib/serialize";
import { getServerSession } from "@/lib/auth";

// GET /api/milestones?projectId=&status=&pendingReview=1
// 마일스톤 목록. 운영자 검증 현황(O-10)과 관리자 재검토 대기열(A-08)이 같이 쓴다.
export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams;
  const projectId = q.get("projectId");
  const status = q.get("status");
  const pendingReview = q.get("pendingReview") === "1";

  const milestones = await prisma.milestone.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
      ...(status ? { status } : {}),
      ...(pendingReview
        ? {
            status: {
              in: ["evidence_submitted", "in_progress", "manual_review"],
            },
          }
        : {}),
      // 운영자는 자기가 맡은 지점만 본다.
      ...(session.role === "operator"
        ? { project: { operatorId: session.userId } }
        : {}),
    },
    include: {
      project: { select: { id: true, name: true, location: true } },
    },
    orderBy: [{ evidenceSubmittedAt: "asc" }, { seq: "asc" }],
    take: 200,
  });

  return NextResponse.json({ milestones: serializeBigInt(milestones) });
}

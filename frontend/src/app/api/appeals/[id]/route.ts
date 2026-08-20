import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { serializeBigInt as serialize } from "@/lib/serialize";
import { canAccessProjectAppeal } from "@/lib/appeal";

// GET /api/appeals/[id] — 이의제기 상세 + 코멘트 스레드 (명세 1.3.1).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const appeal = await prisma.appeal.findUnique({
      where: { id },
      include: {
        milestone: {
          select: {
            seq: true,
            name: true,
            status: true,
            retryCount: true,
            aiVerificationResult: true,
            releaseAmount: true,
          },
        },
        comments: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!appeal) {
      return NextResponse.json({ error: "Appeal not found" }, { status: 404 });
    }
    if (!(await canAccessProjectAppeal(session, appeal.projectId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(serialize({ appeal }));
  } catch (error) {
    console.error("GET /api/appeals/[id] error:", error);
    return NextResponse.json({ error: "Failed to load appeal" }, { status: 500 });
  }
}

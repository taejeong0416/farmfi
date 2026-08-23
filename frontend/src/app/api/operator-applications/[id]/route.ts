import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";

// GET /api/operator-applications/[id] — 신청 한 건. 본인 또는 관리자만 볼 수 있다.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const application = await prisma.operatorApplication.findUnique({
    where: { id },
  });
  if (
    !application ||
    (application.userId !== session.userId && session.role !== "admin")
  ) {
    return NextResponse.json({ error: "신청을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ application });
}

/**
 * PATCH /api/operator-applications/[id] — 서류 제출과 공간 확정.
 *
 * 방문 예약·교육 이수·계약 서명은 각자 상태를 가지므로 여기 얹지 않는다.
 *   방문 → POST /api/operator/visits · PATCH /api/operator/visits/[id]
 *   교육 → POST /api/operator/courses/[id]/progress
 *   계약 → POST /api/operator/contracts/[id]/signature-request
 */
export async function PATCH(
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
  const step = b.step;

  const application = await prisma.operatorApplication.findUnique({
    where: { id },
  });
  if (!application || application.userId !== session.userId) {
    return NextResponse.json({ error: "신청을 찾을 수 없습니다." }, { status: 404 });
  }

  switch (step) {
    case "docs": {
      const documents = Array.isArray(b.documents)
        ? b.documents.filter((u): u is string => typeof u === "string")
        : [];
      const updated = await prisma.operatorApplication.update({
        where: { id },
        data: {
          documents,
          spaceId: typeof b.spaceId === "string" ? b.spaceId : application.spaceId,
          status: "docs",
          reviewNote: null,
        },
      });
      return NextResponse.json({ application: updated });
    }

    case "confirm": {
      if (!application.educationDoneAt) {
        return NextResponse.json(
          { error: "필수 교육을 먼저 마쳐야 합니다." },
          { status: 400 },
        );
      }
      const updated = await prisma.operatorApplication.update({
        where: { id },
        data: {
          spaceId: typeof b.spaceId === "string" ? b.spaceId : application.spaceId,
          confirmedAt: new Date(),
          status: "matched",
        },
      });
      return NextResponse.json({ application: updated });
    }

    default:
      return NextResponse.json(
        { error: "알 수 없는 단계입니다." },
        { status: 400 },
      );
  }
}

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
 * PATCH /api/operator-applications/[id] — 신청 단계 진행.
 * step으로 어느 단계를 밀지 고른다. 앞 단계가 끝나지 않으면 다음 단계로 넘어가지 않는다.
 *
 *   docs → visit → education → confirm → contract
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

    case "visit": {
      if (typeof b.visitAt !== "string" || Number.isNaN(Date.parse(b.visitAt))) {
        return NextResponse.json(
          { error: "방문 일시를 선택해 주세요." },
          { status: 400 },
        );
      }
      const updated = await prisma.operatorApplication.update({
        where: { id },
        data: {
          visitAt: new Date(b.visitAt),
          visitNote: typeof b.visitNote === "string" ? b.visitNote : null,
          status: "visit",
        },
      });
      return NextResponse.json({ application: updated });
    }

    case "education": {
      const progress = Number(b.progress);
      if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
        return NextResponse.json(
          { error: "교육 진행률이 올바르지 않습니다." },
          { status: 400 },
        );
      }
      const done = progress >= 100;
      const updated = await prisma.operatorApplication.update({
        where: { id },
        data: {
          educationProgress: Math.round(progress),
          educationDoneAt: done ? new Date() : null,
          status: done ? "education" : application.status,
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

    case "contract": {
      if (!application.confirmedAt) {
        return NextResponse.json(
          { error: "공간을 먼저 확정해야 합니다." },
          { status: 400 },
        );
      }
      if (typeof b.signature !== "string" || !b.signature.trim()) {
        return NextResponse.json({ error: "서명을 입력해 주세요." }, { status: 400 });
      }
      // 계약 서명이 끝나면 보증서 번호를 발급한다.
      const certificateNo = `FF-${new Date().getFullYear()}-${id.slice(-6).toUpperCase()}`;
      const updated = await prisma.operatorApplication.update({
        where: { id },
        data: {
          contractSignature: b.signature.trim(),
          contractSignedAt: new Date(),
          certificateNo,
          certificateIssuedAt: new Date(),
          status: "operating",
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

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

// GET /api/admin/operator-applications — 운영자 심사 대기열 (A-02 · A-03).
// 본인 것만 보는 GET /api/operator-applications와 달리 전체를 본다.
export async function GET(req: NextRequest) {
  try {
    await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const status = req.nextUrl.searchParams.get("status");

  const applications = await prisma.operatorApplication.findMany({
    where: status ? { status } : {},
    include: {
      user: { select: { id: true, name: true, email: true, identityVerified: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ applications });
}

/**
 * PATCH /api/admin/operator-applications — 심사 판정.
 * action: approve(조건부 승인) · revise(보완 요청)
 *
 * 보증서 발급·정지는 `/api/admin/operator-credentials`가 맡는다. 보증서는
 * 신청 행의 칸이 아니라 상태를 가진 별도 행이고, 앱이 그 상태를 본다.
 */
export async function PATCH(request: NextRequest) {
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
  const b = (body ?? {}) as Record<string, unknown>;

  if (typeof b.id !== "string") {
    return NextResponse.json({ error: "신청 id가 필요합니다." }, { status: 400 });
  }

  const application = await prisma.operatorApplication.findUnique({
    where: { id: b.id },
  });
  if (!application) {
    return NextResponse.json({ error: "신청을 찾을 수 없습니다." }, { status: 404 });
  }

  switch (b.action) {
    case "approve": {
      const updated = await prisma.operatorApplication.update({
        where: { id: b.id },
        data: { status: "education", reviewNote: null },
      });
      return NextResponse.json({ application: updated });
    }

    case "revise": {
      if (typeof b.note !== "string" || !b.note.trim()) {
        return NextResponse.json(
          { error: "보완 요청 사유를 적어 주세요." },
          { status: 400 },
        );
      }
      const updated = await prisma.operatorApplication.update({
        where: { id: b.id },
        data: { status: "docs", reviewNote: b.note.trim() },
      });
      return NextResponse.json({ application: updated });
    }

    default:
      return NextResponse.json({ error: "알 수 없는 요청입니다." }, { status: 400 });
  }
}

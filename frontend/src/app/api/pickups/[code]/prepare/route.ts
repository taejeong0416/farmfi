import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { guardProject } from "@/lib/operator-scope";

/**
 * POST /api/pickups/[code]/prepare — 팩 준비 완료·해제 (앱 M-16).
 * body.ready === false 면 예정으로 되돌린다. 잘못 누른 것을 되돌릴 길이 있어야 한다.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  let session;
  try {
    session = await requireRole("operator");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const { code } = await params;
  const normalized = code.trim().toUpperCase();
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // 본문 없이 부르면 준비 완료로 본다
  }
  const ready = (body as { ready?: unknown } | null)?.ready !== false;

  const pickup = await prisma.pickupOrder.findUnique({
    where: { code: normalized },
    include: { subscription: { select: { projectId: true } } },
  });
  if (!pickup) {
    return NextResponse.json({ error: "픽업을 찾을 수 없습니다." }, { status: 404 });
  }
  const denied = await guardProject(session, pickup.subscription.projectId);
  if (denied) return denied;

  if (pickup.status === "picked" || pickup.status === "skipped") {
    return NextResponse.json(
      { error: "이미 마감된 픽업입니다." },
      { status: 400 },
    );
  }

  const updated = await prisma.pickupOrder.update({
    where: { code: normalized },
    data: ready
      ? { status: "ready", preparedAt: new Date() }
      : { status: "scheduled", preparedAt: null },
  });

  return NextResponse.json({ pickup: updated });
}

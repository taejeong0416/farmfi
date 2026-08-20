import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { canAccessProject } from "@/lib/operator-scope";
import { recordAudit } from "@/lib/audit";

/**
 * POST /api/pickups/[code]/complete — 수령 완료 처리 (앱 M-12).
 *
 * 인수 기준: "같은 바코드는 두 번 처리되지 않는다."
 * 조건부 updateMany(status가 아직 picked가 아닌 행만)로 잠근다. 사전 조회로
 * 막으면 두 스캔이 동시에 들어왔을 때 둘 다 통과한다.
 */
export async function POST(
  _request: Request,
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

  const pickup = await prisma.pickupOrder.findUnique({
    where: { code: normalized },
    include: { subscription: { select: { projectId: true, project: { select: { name: true } } } } },
  });
  if (!pickup) {
    return NextResponse.json(
      { error: "확인번호를 찾을 수 없습니다.", code: "PICKUP_NOT_FOUND" },
      { status: 404 },
    );
  }

  if (!(await canAccessProject(session, pickup.subscription.projectId))) {
    return NextResponse.json(
      {
        error: `${pickup.subscription.project.name}의 픽업입니다. 이 매장에서는 처리할 수 없습니다.`,
        code: "PICKUP_OTHER_STORE",
      },
      { status: 403 },
    );
  }

  if (pickup.status === "skipped") {
    return NextResponse.json(
      { error: "구매자가 건너뛴 회차입니다.", code: "PICKUP_SKIPPED" },
      { status: 400 },
    );
  }

  // 동시 스캔 중 하나만 통과한다.
  const claimed = await prisma.pickupOrder.updateMany({
    where: { code: normalized, status: { in: ["scheduled", "ready"] } },
    data: { status: "picked", pickedAt: new Date(), pickedById: session.userId },
  });

  if (claimed.count === 0) {
    const fresh = await prisma.pickupOrder.findUnique({ where: { code: normalized } });
    let handler: string | null = null;
    if (fresh?.pickedById) {
      const who = await prisma.user.findUnique({
        where: { id: fresh.pickedById },
        select: { name: true },
      });
      handler = who?.name ?? null;
    }
    return NextResponse.json(
      {
        error: "이미 수령 처리된 바코드입니다.",
        code: "PICKUP_BARCODE_USED",
        pickedAt: fresh?.pickedAt ?? null,
        handledBy: handler,
      },
      { status: 409 },
    );
  }

  const updated = await prisma.pickupOrder.findUniqueOrThrow({ where: { code: normalized } });

  await recordAudit({
    actorId: session.userId,
    actorRole: session.role,
    action: "pickup.completed",
    entityType: "pickup",
    entityId: updated.id,
    projectId: pickup.subscription.projectId,
    summary: `픽업 수령 완료 · 확인번호 ${normalized}`,
  });

  return NextResponse.json({ pickup: updated });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { canAccessProject } from "@/lib/operator-scope";
import { maskName } from "../route";

/**
 * GET /api/pickups/[code] — 확인번호로 픽업 한 건 조회 (앱 M-12 스캔·수동입력).
 *
 * 처리하지 않고 보여주기만 한다. 운영자가 상품을 확인한 뒤 수령 완료를 누른다.
 * 명세가 요구하는 네 분기(정상·이미 사용됨·다른 지점·예정일 아님)를 여기서 판정해
 * 화면이 그대로 띄울 수 있게 `verdict`로 내려준다.
 */
export async function GET(
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
  const pickup = await prisma.pickupOrder.findUnique({
    where: { code: code.trim().toUpperCase() },
    include: {
      subscription: {
        select: {
          packSize: true,
          productIds: true,
          dressings: true,
          projectId: true,
          user: { select: { name: true } },
          project: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!pickup) {
    return NextResponse.json(
      { error: "확인번호를 찾을 수 없습니다.", code: "PICKUP_NOT_FOUND" },
      { status: 404 },
    );
  }

  const mine = await canAccessProject(session, pickup.subscription.projectId);

  const products = await prisma.product.findMany({
    where: { id: { in: pickup.subscription.productIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(products.map((p) => [p.id, p.name]));

  let handler: string | null = null;
  if (pickup.pickedById) {
    const who = await prisma.user.findUnique({
      where: { id: pickup.pickedById },
      select: { name: true },
    });
    handler = who?.name ?? null;
  }

  const today = new Date();
  const sameDay =
    pickup.scheduledAt.getFullYear() === today.getFullYear() &&
    pickup.scheduledAt.getMonth() === today.getMonth() &&
    pickup.scheduledAt.getDate() === today.getDate();

  // 판정 순서가 곧 안내 우선순위다. 다른 지점 건은 상세를 보여줄 이유가 없다.
  const verdict = !mine
    ? "OTHER_STORE"
    : pickup.status === "picked"
      ? "ALREADY_USED"
      : pickup.status === "skipped"
        ? "SKIPPED"
        : !sameDay
          ? "NOT_TODAY"
          : "OK";

  return NextResponse.json({
    verdict,
    pickup: {
      id: pickup.id,
      code: pickup.code,
      status: pickup.status,
      scheduledAt: pickup.scheduledAt,
      preparedAt: pickup.preparedAt,
      pickedAt: pickup.pickedAt,
      handledBy: handler,
      project: pickup.subscription.project,
      // 다른 지점 건이면 구성까지 보여주지 않는다 — 남의 매장 데이터다.
      buyerName: mine ? maskName(pickup.subscription.user.name) : null,
      packSize: mine ? pickup.subscription.packSize : null,
      crops: mine
        ? pickup.subscription.productIds.map((id) => nameById.get(id) ?? id)
        : null,
      dressings: mine ? pickup.subscription.dressings : null,
    },
  });
}

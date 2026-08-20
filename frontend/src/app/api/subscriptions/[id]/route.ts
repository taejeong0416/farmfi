import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import {
  DRESSING_COUNT,
  monthlyPrice,
  createPickupOrders,
  upcomingPickups,
  type PackSize,
} from "@/lib/pickup-subscription";

async function loadOwned(id: string, userId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true, location: true } },
      pickups: { orderBy: { scheduledAt: "asc" } },
    },
  });
  if (!subscription || subscription.userId !== userId) return null;
  return subscription;
}

// GET /api/subscriptions/[id] — 구독 한 건 (B-07 · B-08 · B-09)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const subscription = await loadOwned(id, session.userId);
  if (!subscription) {
    return NextResponse.json({ error: "구독을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ subscription });
}

/**
 * PATCH /api/subscriptions/[id] — 구성·일정 변경과 상태 전환 (B-08).
 * action: compose(구성 변경) · schedule(주기 변경) · pause · resume · cancel
 *         · skip(이번 회차 건너뛰기) · picked(픽업 완료)
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

  const subscription = await loadOwned(id, session.userId);
  if (!subscription) {
    return NextResponse.json({ error: "구독을 찾을 수 없습니다." }, { status: 404 });
  }
  if (subscription.status === "cancelled") {
    return NextResponse.json(
      { error: "이미 해지된 구독입니다." },
      { status: 400 },
    );
  }

  switch (b.action) {
    case "compose": {
      const productIds = Array.isArray(b.productIds)
        ? b.productIds.filter((v): v is string => typeof v === "string")
        : [];
      const dressings = Array.isArray(b.dressings)
        ? b.dressings.filter((v): v is string => typeof v === "string")
        : [];
      if (productIds.length !== subscription.packSize) {
        return NextResponse.json(
          { error: `작물 ${subscription.packSize}종을 골라 주세요.` },
          { status: 400 },
        );
      }
      if (dressings.length !== DRESSING_COUNT) {
        return NextResponse.json(
          { error: `드레싱 ${DRESSING_COUNT}봉을 골라 주세요.` },
          { status: 400 },
        );
      }
      const updated = await prisma.subscription.update({
        where: { id },
        data: { productIds, dressings },
      });
      return NextResponse.json({ subscription: updated });
    }

    case "schedule": {
      const perWeek = Number(b.perWeek);
      if (![1, 2].includes(perWeek)) {
        return NextResponse.json(
          { error: "수령 주기를 골라 주세요." },
          { status: 400 },
        );
      }
      const price = Math.max(
        0,
        monthlyPrice(subscription.packSize as PackSize, perWeek) -
          subscription.discount,
      );
      // 아직 오지 않은 회차를 새 주기로 다시 만든다.
      await prisma.pickupOrder.deleteMany({
        where: { subscriptionId: id, status: "scheduled" },
      });
      const dates = upcomingPickups(perWeek, 4);
      await createPickupOrders(prisma, id, dates);
      const updated = await prisma.subscription.update({
        where: { id },
        data: { perWeek, monthlyPrice: price },
      });
      return NextResponse.json({ subscription: updated });
    }

    case "pause":
    case "resume":
    case "cancel": {
      const status =
        b.action === "pause"
          ? "paused"
          : b.action === "resume"
            ? "active"
            : "cancelled";
      const updated = await prisma.subscription.update({
        where: { id },
        data: { status },
      });
      return NextResponse.json({ subscription: updated });
    }

    case "skip":
    case "picked": {
      if (typeof b.pickupId !== "string") {
        return NextResponse.json(
          { error: "회차를 골라 주세요." },
          { status: 400 },
        );
      }
      const pickup = subscription.pickups.find((p) => p.id === b.pickupId);
      if (!pickup) {
        return NextResponse.json(
          { error: "회차를 찾을 수 없습니다." },
          { status: 404 },
        );
      }
      const updated = await prisma.pickupOrder.update({
        where: { id: pickup.id },
        data: {
          status: b.action === "skip" ? "skipped" : "picked",
          pickedAt: b.action === "picked" ? new Date() : null,
        },
      });
      return NextResponse.json({ pickup: updated });
    }

    default:
      return NextResponse.json(
        { error: "알 수 없는 요청입니다." },
        { status: 400 },
      );
  }
}

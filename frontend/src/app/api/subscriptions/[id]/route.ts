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
import {
  canCancel,
  canChangePickup,
  cancelDeadline,
  pickupChangeDeadline,
} from "@/lib/subscription-window";

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
  // 마감 판정은 서버가 한다. 화면이 각자 계산하면 시계가 갈리고, 눌러 보고서야
  // 거절당하는 버튼이 생긴다.
  const now = new Date();
  return NextResponse.json({
    subscription,
    deadlines: {
      cancelBy: cancelDeadline(subscription.nextPaymentAt)?.toISOString() ?? null,
      canCancel: canCancel(subscription.nextPaymentAt, now).ok,
      pickups: subscription.pickups.map((p) => ({
        pickupId: p.id,
        changeBy: pickupChangeDeadline(p.scheduledAt).toISOString(),
        canChange: p.status === "scheduled" && canChangePickup(p.scheduledAt, now).ok,
      })),
    },
  });
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
      // 아직 오지 않은 회차를 새 주기로 다시 만든다. 다만 변경 마감이 지난
      // 회차는 남긴다 — 매장이 이미 담기 시작한 팩을 주기 변경이 조용히 지우면
      // 손님은 오지 않고 물건은 버려진다.
      const now = new Date();
      const locked = subscription.pickups.filter(
        (p) => p.status === "scheduled" && !canChangePickup(p.scheduledAt, now).ok,
      );
      await prisma.pickupOrder.deleteMany({
        where: {
          subscriptionId: id,
          status: "scheduled",
          id: { notIn: locked.map((p) => p.id) },
        },
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
      if (b.action === "cancel") {
        const gate = canCancel(subscription.nextPaymentAt);
        if (!gate.ok) {
          return NextResponse.json(
            { error: gate.error, code: gate.code, deadline: gate.deadline },
            { status: 409 },
          );
        }
      }
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
      if (pickup.status !== "scheduled") {
        return NextResponse.json(
          {
            error:
              pickup.status === "picked"
                ? "이미 수령한 회차입니다."
                : "이미 건너뛴 회차입니다.",
            code: "PICKUP_NOT_SCHEDULED",
          },
          { status: 409 },
        );
      }
      // 건너뛰기에만 마감을 건다. 수령 처리(picked)는 매장이 실제로 건네준
      // 사실을 적는 것이라 시각으로 막을 것이 아니다.
      if (b.action === "skip") {
        const gate = canChangePickup(pickup.scheduledAt);
        if (!gate.ok) {
          return NextResponse.json(
            { error: gate.error, code: gate.code, deadline: gate.deadline },
            { status: 409 },
          );
        }
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

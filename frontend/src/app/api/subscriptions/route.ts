import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import {
  DRESSING_COUNT,
  isPackSize,
  monthlyPrice,
  nextPaymentDate,
  createPickupOrders,
  upcomingPickups,
} from "@/lib/pickup-subscription";

// GET /api/subscriptions — 내 정기구독 (B-07 · B-00E)
export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subscriptions = await prisma.subscription.findMany({
    where: { userId: session.userId },
    include: {
      project: { select: { id: true, name: true, location: true } },
      pickups: { orderBy: { scheduledAt: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ subscriptions });
}

// POST /api/subscriptions — 정기구독 신청 (B-01~B-05 결과를 한 번에 받는다)
export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  if (typeof b.projectId !== "string" || !b.projectId) {
    return NextResponse.json({ error: "픽업 지점을 골라 주세요." }, { status: 400 });
  }
  if (!isPackSize(b.packSize)) {
    return NextResponse.json({ error: "팩 크기를 골라 주세요." }, { status: 400 });
  }
  const perWeek = Number(b.perWeek ?? 1);
  if (![1, 2].includes(perWeek)) {
    return NextResponse.json({ error: "수령 주기를 골라 주세요." }, { status: 400 });
  }

  const productIds = Array.isArray(b.productIds)
    ? b.productIds.filter((v): v is string => typeof v === "string")
    : [];
  const dressings = Array.isArray(b.dressings)
    ? b.dressings.filter((v): v is string => typeof v === "string")
    : [];

  if (productIds.length !== b.packSize) {
    return NextResponse.json(
      { error: `작물 ${b.packSize}종을 골라 주세요.` },
      { status: 400 },
    );
  }
  if (dressings.length !== DRESSING_COUNT) {
    return NextResponse.json(
      { error: `드레싱 ${DRESSING_COUNT}봉을 골라 주세요.` },
      { status: 400 },
    );
  }

  const project = await prisma.project.findUnique({ where: { id: b.projectId } });
  if (!project) {
    return NextResponse.json({ error: "픽업 지점을 찾을 수 없습니다." }, { status: 404 });
  }

  const discount = Number(b.discount ?? 0);
  const price = Math.max(0, monthlyPrice(b.packSize, perWeek) - discount);

  const subscription = await prisma.subscription.create({
    data: {
      userId: session.userId,
      projectId: b.projectId,
      packSize: b.packSize,
      perWeek,
      productIds,
      dressings,
      monthlyPrice: price,
      discount,
      couponCode: typeof b.couponCode === "string" ? b.couponCode : null,
      paymentMethod:
        typeof b.paymentMethod === "string" ? b.paymentMethod : "등록 카드",
      nextPaymentAt: nextPaymentDate(),
    },
  });

  // 앞으로 4회차를 미리 만들어 둔다. 매장에서 보여줄 확인번호가 회차마다 필요하다.
  const dates = upcomingPickups(perWeek, 4);
  await createPickupOrders(prisma, subscription.id, dates);

  const created = await prisma.subscription.findUnique({
    where: { id: subscription.id },
    include: {
      project: { select: { id: true, name: true, location: true } },
      pickups: { orderBy: { scheduledAt: "asc" } },
    },
  });

  return NextResponse.json({ subscription: created });
}

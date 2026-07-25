import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

const DAY_MS = 24 * 60 * 60 * 1000;

// GET /api/sales?projectId=&days=30&recent=10
// 지점 판매 리포트 — 기간 합계 + 일자별 매출 + 최근 판매 내역.
// 품목별 순위는 /api/sales/trend가 담당한다 (중복 집계 없음).
// 매출은 운영 데이터이므로 operator(또는 admin) 세션에서만 조회 가능.
export async function GET(req: NextRequest) {
  try {
    await requireRole("operator");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const daysRaw = Number(req.nextUrl.searchParams.get("days") ?? 30);
    // 1~365일로 클램프 — 무제한 스캔 방지.
    const days = Number.isFinite(daysRaw)
      ? Math.min(365, Math.max(1, Math.floor(daysRaw)))
      : 30;

    const recentRaw = Number(req.nextUrl.searchParams.get("recent") ?? 10);
    const recentLimit = Number.isFinite(recentRaw)
      ? Math.min(50, Math.max(1, Math.floor(recentRaw)))
      : 10;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const since = new Date(Date.now() - days * DAY_MS);

    const [records, recentRecords] = await Promise.all([
      prisma.salesRecord.findMany({
        where: { projectId, soldAt: { gte: since } },
        orderBy: { soldAt: "asc" },
        select: { quantity: true, amount: true, soldAt: true },
      }),
      prisma.salesRecord.findMany({
        where: { projectId },
        orderBy: { soldAt: "desc" },
        take: recentLimit,
        include: { product: { select: { name: true, unit: true } } },
      }),
    ]);

    // 일자별 집계 (판매가 없는 날은 행이 없다 — 차트가 실제 기록만 잇도록).
    const byDay = new Map<string, { amount: number; quantity: number; orderCount: number }>();
    for (const r of records) {
      const key = r.soldAt.toISOString().slice(0, 10);
      const bucket = byDay.get(key) ?? { amount: 0, quantity: 0, orderCount: 0 };
      bucket.amount += r.amount;
      bucket.quantity += r.quantity;
      bucket.orderCount += 1;
      byDay.set(key, bucket);
    }

    const daily = [...byDay.entries()]
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      project,
      periodDays: days,
      summary: {
        totalAmount: records.reduce((sum, r) => sum + r.amount, 0),
        totalQuantity: records.reduce((sum, r) => sum + r.quantity, 0),
        orderCount: records.length,
      },
      daily,
      recent: recentRecords.map((r) => ({
        id: r.id,
        soldAt: r.soldAt.toISOString(),
        productId: r.productId,
        productName: r.product.name,
        unit: r.product.unit,
        quantity: r.quantity,
        amount: r.amount,
      })),
    });
  } catch (error) {
    console.error("GET /api/sales error:", error);
    return NextResponse.json({ error: "Failed to fetch sales" }, { status: 500 });
  }
}

// POST /api/sales — 운영자 판매 수기입력 (외부 POS 연동 아님)
// body: { projectId, productId, quantity, soldAt? }
// 판매 기록과 동시에 해당 품목의 매장 재고(inStock)를 차감한다 — '오늘 할 일'의
// 보충(restock) 판정이 실판매를 반영하도록.
export async function POST(req: NextRequest) {
  // 매출·재고를 바꾸는 쓰기 라우트 — 미인증 데이터 위조를 막는다.
  try {
    await requireRole("operator");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  let body: { projectId?: string; productId?: string; quantity?: number; soldAt?: string } | null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  const { projectId, productId, quantity, soldAt } = body ?? {};
  if (
    !projectId ||
    !productId ||
    typeof quantity !== "number" ||
    !Number.isInteger(quantity) ||
    quantity <= 0
  ) {
    return NextResponse.json(
      { error: "projectId, productId, quantity(양의 정수) are required" },
      { status: 400 }
    );
  }

  let soldAtDate: Date | undefined;
  if (soldAt !== undefined) {
    soldAtDate = new Date(soldAt);
    if (Number.isNaN(soldAtDate.getTime())) {
      return NextResponse.json({ error: "invalid soldAt" }, { status: 400 });
    }
  }

  const [project, product] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.product.findUnique({ where: { id: productId } }),
  ]);
  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }
  if (!product) {
    return NextResponse.json({ error: "product not found" }, { status: 404 });
  }

  const record = await prisma.$transaction(async (tx) => {
    const created = await tx.salesRecord.create({
      data: {
        projectId,
        productId,
        quantity,
        amount: quantity * product.unitPrice,
        soldAt: soldAtDate,
      },
    });

    // 매장 재고 차감 (0 미만 방지 — 재고보다 많이 팔린 입력은 0으로 클램프)
    const inventory = await tx.inventory.findUnique({
      where: { projectId_productId: { projectId, productId } },
    });
    if (inventory) {
      await tx.inventory.update({
        where: { id: inventory.id },
        data: { inStock: Math.max(0, inventory.inStock - quantity) },
      });
    }

    return created;
  });

  return NextResponse.json({ record }, { status: 201 });
}

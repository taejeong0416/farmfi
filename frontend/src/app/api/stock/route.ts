import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// 명세 5.1 재고 현황 및 조정 — 입출고 이력 + 수동 조정.
//
// 이력은 세 출처를 합쳐 시간순으로 낸다:
//   HarvestRecord(수확 입고) · SalesRecord(판매 출고) · StockAdjustment(수동 조정)
// 한 테이블에 몰아넣지 않는 이유: 판매/수확은 각자 도메인 이벤트고, 수동 조정은
// 그것으로 설명되지 않는 차이(폐기·실사 보정)만 남아야 사유가 의미를 갖는다.

// GET /api/stock?projectId=&productId=
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  const productId = req.nextUrl.searchParams.get("productId");
  if (!projectId || !productId) {
    return NextResponse.json({ error: "projectId, productId가 필요합니다." }, { status: 400 });
  }

  const inventory = await prisma.inventory.findUnique({
    where: { projectId_productId: { projectId, productId } },
    include: { product: true },
  });
  if (!inventory) {
    return NextResponse.json({ error: "재고 품목을 찾을 수 없습니다." }, { status: 404 });
  }

  const [harvests, sales, adjustments] = await Promise.all([
    prisma.harvestRecord.findMany({ where: { projectId, productId }, orderBy: { harvestedAt: "desc" }, take: 30 }),
    prisma.salesRecord.findMany({ where: { projectId, productId }, orderBy: { soldAt: "desc" }, take: 30 }),
    prisma.stockAdjustment.findMany({ where: { projectId, productId }, orderBy: { adjustedAt: "desc" }, take: 30 }),
  ]);

  const history = [
    ...harvests.map((h) => ({ id: h.id, at: h.harvestedAt.toISOString(), delta: h.quantity, kind: "harvest" as const, reason: "수확 입고", actor: null as string | null })),
    ...sales.map((s) => ({ id: s.id, at: s.soldAt.toISOString(), delta: -s.quantity, kind: "sale" as const, reason: "매장 판매", actor: null as string | null })),
    ...adjustments.map((a) => ({ id: a.id, at: a.adjustedAt.toISOString(), delta: a.delta, kind: "adjustment" as const, reason: a.reason, actor: a.adjustedBy })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 40);

  return NextResponse.json({
    projectId,
    product: { id: inventory.product.id, name: inventory.product.name, unit: inventory.product.unit },
    inStock: inventory.inStock,
    growing: inventory.growing,
    history,
  });
}

// POST /api/stock  { projectId, productId, delta, reason } — 수동 조정
export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { projectId, productId, delta, reason } = (body ?? {}) as Record<string, unknown>;
  if (typeof projectId !== "string" || typeof productId !== "string") {
    return NextResponse.json({ error: "projectId, productId가 필요합니다." }, { status: 400 });
  }
  const n = Number(delta);
  if (!Number.isInteger(n) || n === 0) {
    return NextResponse.json({ error: "조정 수량은 0이 아닌 정수여야 합니다." }, { status: 400 });
  }
  if (typeof reason !== "string" || !reason.trim()) {
    return NextResponse.json({ error: "조정 사유를 입력해주세요." }, { status: 400 });
  }

  // 명세 예외: 동시 조정으로 수량이 바뀌었으면 최신 수량을 안내하고 재입력을 요청한다.
  // 트랜잭션 안에서 읽고 쓰되, 음수가 되면 저장하지 않는다.
  try {
    const result = await prisma.$transaction(async (tx) => {
      const inv = await tx.inventory.findUnique({
        where: { projectId_productId: { projectId, productId } },
      });
      if (!inv) throw new Error("NOT_FOUND");

      const after = inv.inStock + n;
      if (after < 0) throw new Error(`NEGATIVE:${inv.inStock}`);

      await tx.stockAdjustment.create({
        data: {
          projectId, productId, delta: n,
          beforeQty: inv.inStock, afterQty: after,
          reason: reason.trim(), adjustedBy: session.userId,
        },
      });
      const updated = await tx.inventory.update({
        where: { projectId_productId: { projectId, productId } },
        data: { inStock: after },
      });
      return updated;
    });

    return NextResponse.json({ projectId, productId, inStock: result.inStock });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NOT_FOUND") {
      return NextResponse.json({ error: "재고 품목을 찾을 수 없습니다." }, { status: 404 });
    }
    if (msg.startsWith("NEGATIVE:")) {
      const current = msg.split(":")[1];
      return NextResponse.json(
        { error: `현재 수량 ${current}보다 많이 차감할 수 없습니다.`, currentStock: Number(current) },
        { status: 409 }
      );
    }
    console.error("POST /api/stock error:", e);
    return NextResponse.json({ error: "재고 조정에 실패했습니다." }, { status: 500 });
  }
}

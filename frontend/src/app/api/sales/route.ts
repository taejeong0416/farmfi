import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// POST /api/sales — 운영자 판매 수기입력 (외부 POS 연동 아님)
// body: { projectId, productId, quantity, soldAt? }
// 판매 기록과 동시에 해당 품목의 매장 재고(inStock)를 차감한다 — '오늘 할 일'의
// 보충(restock) 판정이 실판매를 반영하도록.
export async function POST(req: NextRequest) {
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

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// POST /api/sales — 운영자 판매 수기입력 (외부 POS 연동 아님)
// body: { projectId, productId, quantity, soldAt? }
export async function POST(req: NextRequest) {
  let body: { projectId?: string; productId?: string; quantity?: number; soldAt?: string } | null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  const { projectId, productId, quantity, soldAt } = body ?? {};
  if (!projectId || !productId || typeof quantity !== "number" || quantity <= 0) {
    return NextResponse.json(
      { error: "projectId, productId, quantity(>0) are required" },
      { status: 400 }
    );
  }

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    return NextResponse.json({ error: "product not found" }, { status: 404 });
  }

  const record = await prisma.salesRecord.create({
    data: {
      projectId,
      productId,
      quantity,
      amount: quantity * product.unitPrice,
      soldAt: soldAt ? new Date(soldAt) : undefined,
    },
  });

  return NextResponse.json({ record }, { status: 201 });
}

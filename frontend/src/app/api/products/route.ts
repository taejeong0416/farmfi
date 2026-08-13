import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// 명세 5.2 재고 품목 등록.
// 품목(Product)은 전 지점 공용이고, 지점 재고(Inventory)는 별도 행이다.
// 등록 시 두 개를 한 트랜잭션으로 만든다 — 품목만 생기고 재고가 없으면
// 목록에서 사라져 "등록했는데 안 보인다"가 된다.

// GET /api/products
export async function GET() {
  const products = await prisma.product.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ products });
}

// POST /api/products  { projectId, name, category, unit, unitPrice, growDays, initialStock, lowStockThreshold }
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

  const b = (body ?? {}) as Record<string, unknown>;
  const projectId = typeof b.projectId === "string" ? b.projectId : "";
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const category = typeof b.category === "string" ? b.category : "leafy";
  const unit = typeof b.unit === "string" && b.unit ? b.unit : "봉";
  const unitPrice = Number(b.unitPrice ?? 0);
  const growDays = Number(b.growDays ?? 30);
  const initialStock = Number(b.initialStock ?? 0);

  if (!projectId) return NextResponse.json({ error: "projectId가 필요합니다." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "품목명을 입력해주세요." }, { status: 400 });
  // 명세 비즈니스 규칙: 초기 재고 수량은 0 이상.
  if (!Number.isInteger(initialStock) || initialStock < 0) {
    return NextResponse.json({ error: "초기 수량은 0 이상 정수여야 합니다." }, { status: 400 });
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return NextResponse.json({ error: "판매단가는 0 이상이어야 합니다." }, { status: 400 });
  }
  if (!Number.isInteger(growDays) || growDays <= 0) {
    return NextResponse.json({ error: "재배일수는 1 이상 정수여야 합니다." }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "지점을 찾을 수 없습니다." }, { status: 404 });

  // 명세 예외: 동일 품목명이 이미 있으면 중복 등록을 안내한다.
  // Product.name 에 unique 제약이 없어 여기서 검사한다(경쟁 조건은 지점 재고
  // unique 제약이 최종적으로 막는다).
  const dup = await prisma.product.findFirst({ where: { name }, select: { id: true } });
  if (dup) {
    const already = await prisma.inventory.findUnique({
      where: { projectId_productId: { projectId, productId: dup.id } },
      select: { id: true },
    });
    if (already) {
      return NextResponse.json({ error: "이미 등록된 품목명입니다." }, { status: 409 });
    }
    // 품목은 있지만 이 지점에 재고 행이 없다 — 재고만 붙인다.
    const inv = await prisma.inventory.create({
      data: { projectId, productId: dup.id, inStock: initialStock, growing: 0 },
    });
    return NextResponse.json({ productId: dup.id, inventoryId: inv.id, reusedProduct: true }, { status: 201 });
  }

  const created = await prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: { name, category, unit, unitPrice: Math.round(unitPrice), growDays },
    });
    const inventory = await tx.inventory.create({
      data: { projectId, productId: product.id, inStock: initialStock, growing: 0 },
    });
    return { product, inventory };
  });

  return NextResponse.json(
    { productId: created.product.id, inventoryId: created.inventory.id, reusedProduct: false },
    { status: 201 }
  );
}

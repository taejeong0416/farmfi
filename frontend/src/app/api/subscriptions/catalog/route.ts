import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DRESSINGS } from "@/lib/pickup-subscription";

/**
 * GET /api/subscriptions/catalog?projectId=
 * 구매자가 고를 수 있는 것들 — 픽업 지점 목록과, 지점별 이번 주 작물.
 * 운영 전용인 /api/inventory와 달리 재고 수치 대신 "고를 수 있는지"만 내려준다.
 */
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");

  const projects = await prisma.project.findMany({
    where: { status: { in: ["operating", "funded"] } },
    select: { id: true, name: true, location: true },
    orderBy: { createdAt: "asc" },
  });

  if (!projectId) {
    return NextResponse.json({ pickupPoints: projects, crops: [], dressings: DRESSINGS });
  }

  const inventories = await prisma.inventory.findMany({
    where: { projectId },
    include: { product: true },
  });

  const crops = inventories.map((inv) => ({
    productId: inv.productId,
    name: inv.product.name,
    category: inv.product.category,
    unitPrice: inv.product.unitPrice,
    // 진열 재고가 있으면 바로 고를 수 있고, 재배 중이면 수확 예정일을 함께 보여준다.
    available: inv.inStock > 0,
    growing: inv.growing > 0,
    expectedHarvestAt: inv.expectedHarvestAt,
  }));

  return NextResponse.json({ pickupPoints: projects, crops, dressings: DRESSINGS });
}

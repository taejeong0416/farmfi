import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// 매장 진열 재고가 이 값 미만이면 '보충' 대상.
const RESTOCK_THRESHOLD = 5;

// GET /api/tasks/today?projectId=...
// 재고-생육 연동 "오늘 할 일": 재고 상태 + 작물 성숙 시점을 결합해
// 방문 시 수확/보충 대상을 산출한다. (지시·검증·근태 아님 — §10-5)
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const inventories = await prisma.inventory.findMany({
    where: { projectId },
    include: { product: true },
    orderBy: { expectedHarvestAt: "asc" },
  });

  const now = new Date();
  const tasks: {
    type: "harvest" | "restock";
    productId: string;
    productName: string;
    message: string;
  }[] = [];

  for (const inv of inventories) {
    if (inv.expectedHarvestAt && inv.expectedHarvestAt <= now && inv.growing > 0) {
      tasks.push({
        type: "harvest",
        productId: inv.productId,
        productName: inv.product.name,
        message: `${inv.product.name} 수확 시점 도래 · 재배중 ${inv.growing}${inv.product.unit}`,
      });
    }
    if (inv.inStock < RESTOCK_THRESHOLD) {
      tasks.push({
        type: "restock",
        productId: inv.productId,
        productName: inv.product.name,
        message: `${inv.product.name} 재고 부족 · 현재 ${inv.inStock}${inv.product.unit} 보충 필요`,
      });
    }
  }

  return NextResponse.json({ projectId, generatedAt: now.toISOString(), tasks });
}

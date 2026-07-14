import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/sales/trend?projectId=&days=14
// 품목별 판매 추이 → 다음 재배 사이클의 품목·수량 조정 근거.
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }
  const daysRaw = Number(req.nextUrl.searchParams.get("days") ?? 14);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 14;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const grouped = await prisma.salesRecord.groupBy({
    by: ["productId"],
    where: { projectId, soldAt: { gte: since } },
    _sum: { quantity: true, amount: true },
  });

  const products = await prisma.product.findMany({
    where: { id: { in: grouped.map((g) => g.productId) } },
  });
  const nameOf = new Map(products.map((p) => [p.id, p.name]));

  const rows = grouped
    .map((g) => ({
      productId: g.productId,
      productName: nameOf.get(g.productId) ?? g.productId,
      totalQuantity: g._sum.quantity ?? 0,
      totalAmount: g._sum.amount ?? 0,
      avgDaily: Math.round(((g._sum.quantity ?? 0) / days) * 10) / 10,
    }))
    .sort((a, b) => b.totalQuantity - a.totalQuantity);

  // 재배 조정 근거: 최상위=증산, 최하위=감축, 나머지=유지.
  const n = rows.length;
  const byProduct = rows.map((r, i) => ({
    ...r,
    recommendation:
      n >= 3 ? (i === 0 ? "증산 검토" : i === n - 1 ? "감축 검토" : "유지") : "유지",
  }));

  return NextResponse.json({ projectId, periodDays: days, byProduct });
}

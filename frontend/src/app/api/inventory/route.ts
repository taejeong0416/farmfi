import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeBigInt } from "@/lib/serialize";
import { requireRole } from "@/lib/auth";
import { allowedProjectIds, guardProject, scopeFilter } from "@/lib/operator-scope";

const DAY_MS = 24 * 60 * 60 * 1000;

// 파종~예상수확 구간에서 현재 위치를 0~100%로 환산.
// expectedHarvestAt이 없으면 product.growDays로 종점을 추정한다.
function computeMaturity(
  plantedAt: Date | null,
  harvestAt: Date | null,
  now: Date
): number {
  if (!plantedAt || !harvestAt) return 0;
  const total = harvestAt.getTime() - plantedAt.getTime();
  if (total <= 0) return 100;
  const elapsed = now.getTime() - plantedAt.getTime();
  return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
}

// GET /api/inventory?projectId=...
// 지점×품목 재고-생육 현황. projectId를 생략하면 전 지점을 지점별로 묶어 반환한다
// (모바일 매장 목록이 지점마다 요청을 반복하지 않도록).
// 재고·수확 실적은 운영 데이터이므로 operator(또는 admin) 세션에서만 조회 가능.
export async function GET(request: NextRequest) {
  let session;
  try {
    session = await requireRole("operator");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  try {
    const projectId = request.nextUrl.searchParams.get("projectId");

    if (projectId) {
      const exists = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true },
      });
      if (!exists) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
      const denied = await guardProject(session, projectId);
      if (denied) return denied;
    }

    // projectId를 안 주면 "내 매장 전부"다. 전에는 전 지점이 나갔다 —
    // 앱 매장 목록이 남의 매장까지 받아 볼 수 있었다.
    const projectFilter = projectId
      ? { projectId }
      : scopeFilter(await allowedProjectIds(session));

    const inventories = await prisma.inventory.findMany({
      where: projectFilter,
      include: {
        product: true,
        project: { select: { id: true, name: true, status: true, location: true } },
      },
      orderBy: [{ projectId: "asc" }, { expectedHarvestAt: "asc" }],
    });

    const now = new Date();
    // 이번 달 1일 00:00 (서버 시각 기준) — '이번 달 수확량' 타일의 집계 시작점.
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const harvestByProject = await prisma.harvestRecord.groupBy({
      by: ["projectId"],
      where: { ...projectFilter, harvestedAt: { gte: monthStart } },
      _sum: { quantity: true },
    });
    const monthlyHarvestOf = new Map(
      harvestByProject.map((h) => [h.projectId, h._sum.quantity ?? 0])
    );

    type Item = {
      inventoryId: string;
    productId: string;
      productName: string;
      category: string;
      unit: string;
      unitPrice: number;
      inStock: number;
      growing: number;
      plantedAt: string | null;
      expectedHarvestAt: string | null;
      growDays: number;
      maturityPercent: number;
      daysToHarvest: number | null;
      harvestReady: boolean;
    };

    const groups = new Map<
      string,
      {
        projectId: string;
        projectName: string;
        projectStatus: string;
        projectLocation: string | null;
        items: Item[];
      }
    >();

    for (const inv of inventories) {
      const harvestAt =
        inv.expectedHarvestAt ??
        (inv.plantedAt
          ? new Date(inv.plantedAt.getTime() + inv.product.growDays * DAY_MS)
          : null);

      const item: Item = {
        inventoryId: inv.id,
        productId: inv.productId,
        productName: inv.product.name,
        category: inv.product.category,
        unit: inv.product.unit,
        unitPrice: inv.product.unitPrice,
        inStock: inv.inStock,
        growing: inv.growing,
        plantedAt: inv.plantedAt?.toISOString() ?? null,
        expectedHarvestAt: harvestAt?.toISOString() ?? null,
        growDays: inv.product.growDays,
        maturityPercent: computeMaturity(inv.plantedAt, harvestAt, now),
        daysToHarvest: harvestAt
          ? Math.ceil((harvestAt.getTime() - now.getTime()) / DAY_MS)
          : null,
        harvestReady: harvestAt != null && harvestAt <= now && inv.growing > 0,
      };

      const group = groups.get(inv.projectId);
      if (group) {
        group.items.push(item);
      } else {
        groups.set(inv.projectId, {
          projectId: inv.projectId,
          projectName: inv.project.name,
          projectStatus: inv.project.status,
          projectLocation: inv.project.location,
          items: [item],
        });
      }
    }

    const projects = [...groups.values()].map((g) => ({
      ...g,
      summary: {
        bedCount: g.items.length,
        inStockTotal: g.items.reduce((sum, i) => sum + i.inStock, 0),
        growingTotal: g.items.reduce((sum, i) => sum + i.growing, 0),
        harvestReadyTotal: g.items.reduce(
          (sum, i) => sum + (i.harvestReady ? i.growing : 0),
          0
        ),
        monthlyHarvest: monthlyHarvestOf.get(g.projectId) ?? 0,
      },
    }));

    return NextResponse.json(
      serializeBigInt({
        generatedAt: now.toISOString(),
        projectId: projectId ?? null,
        projects,
      })
    );
  } catch (error) {
    console.error("GET /api/inventory error:", error);
    return NextResponse.json(
      { error: "Failed to fetch inventory" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/reports/institution?institutionId=&days=30
// 기관 성과 리포트: 공간활용(운영률)·생산량·판매·운영현황을 지점별로 집계.
export async function GET(req: NextRequest) {
  const institutionId = req.nextUrl.searchParams.get("institutionId");
  if (!institutionId) {
    return NextResponse.json({ error: "institutionId is required" }, { status: 400 });
  }
  const daysRaw = Number(req.nextUrl.searchParams.get("days") ?? 30);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const institution = await prisma.institution.findUnique({
    where: { id: institutionId },
    include: { projects: true },
  });
  if (!institution) {
    return NextResponse.json({ error: "institution not found" }, { status: 404 });
  }

  const byProject = await Promise.all(
    institution.projects.map(async (proj) => {
      const [harvest, sales, iotCount, anomalyCount] = await Promise.all([
        prisma.harvestRecord.aggregate({
          where: { projectId: proj.id, harvestedAt: { gte: since } },
          _sum: { quantity: true },
        }),
        prisma.salesRecord.aggregate({
          where: { projectId: proj.id, soldAt: { gte: since } },
          _sum: { quantity: true, amount: true },
        }),
        prisma.iotData.count({ where: { projectId: proj.id, recordedAt: { gte: since } } }),
        prisma.iotData.count({
          where: { projectId: proj.id, recordedAt: { gte: since }, isAnomaly: true },
        }),
      ]);
      return {
        projectId: proj.id,
        name: proj.name,
        status: proj.status,
        harvestQuantity: harvest._sum.quantity ?? 0,
        salesQuantity: sales._sum.quantity ?? 0,
        revenue: sales._sum.amount ?? 0,
        iotRecords: iotCount,
        anomalyRate: iotCount > 0 ? Math.round((anomalyCount / iotCount) * 1000) / 10 : 0,
      };
    })
  );

  const operating = institution.projects.filter((p) => p.status === "operating").length;
  const total = institution.projects.length;
  const summary = {
    projectCount: total,
    operatingRate: total > 0 ? Math.round((operating / total) * 1000) / 10 : 0,
    totalHarvest: byProject.reduce((s, p) => s + p.harvestQuantity, 0),
    totalSalesQuantity: byProject.reduce((s, p) => s + p.salesQuantity, 0),
    totalRevenue: byProject.reduce((s, p) => s + p.revenue, 0),
  };

  return NextResponse.json({
    institution: { id: institution.id, name: institution.name },
    periodDays: days,
    summary,
    byProject,
  });
}

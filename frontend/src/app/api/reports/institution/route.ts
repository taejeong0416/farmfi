import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { resolveDataWindow } from "@/lib/data-window";

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /api/reports/institution?institutionId=&days=30&format=csv
// 기관 성과 리포트 (A-11): 공간활용(운영률)·생산량·판매·운영현황을 지점별로 집계.
//
// institutionId를 주지 않으면 기관 목록만 돌려준다 — 화면이 무엇을 고를 수 있는지
// 알아야 하는데 그것만을 위한 라우트를 따로 두면 같은 권한 검사를 두 번 쓰게 된다.
//
// 지점별 매출이 그대로 나오는 경로다. 도입 기관 담당자와 운영팀이 보는 값이므로
// 관리자 세션에서만 연다.
export async function GET(req: NextRequest) {
  try {
    await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const institutionId = req.nextUrl.searchParams.get("institutionId");
  if (!institutionId) {
    const institutions = await prisma.institution.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, _count: { select: { projects: true } } },
    });
    return NextResponse.json({
      institutions: institutions.map((i) => ({
        id: i.id,
        name: i.name,
        type: i.type,
        projectCount: i._count.projects,
      })),
    });
  }
  const daysRaw = Number(req.nextUrl.searchParams.get("days") ?? 30);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 30;

  const institution = await prisma.institution.findUnique({
    where: { id: institutionId },
    include: { projects: true },
  });
  if (!institution) {
    return NextResponse.json({ error: "institution not found" }, { status: 404 });
  }

  // 창의 끝점은 기관 전체에서 하나만 잡는다 — 지점마다 다른 구간을 합산하면
  // 기관 합계가 서로 다른 기간의 숫자를 더한 값이 된다.
  const projectIds = institution.projects.map((p) => p.id);
  const [lastHarvest, lastSale, lastIot] = await Promise.all([
    prisma.harvestRecord.findFirst({
      where: { projectId: { in: projectIds } },
      orderBy: { harvestedAt: "desc" },
      select: { harvestedAt: true },
    }),
    prisma.salesRecord.findFirst({
      where: { projectId: { in: projectIds } },
      orderBy: { soldAt: "desc" },
      select: { soldAt: true },
    }),
    prisma.iotData.findFirst({
      where: { projectId: { in: projectIds } },
      orderBy: { recordedAt: "desc" },
      select: { recordedAt: true },
    }),
  ]);
  const latest = [lastHarvest?.harvestedAt, lastSale?.soldAt, lastIot?.recordedAt]
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const { since, dataAsOf, stale } = resolveDataWindow(latest, days);

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

  if (req.nextUrl.searchParams.get("format") === "csv") {
    const header = [
      "institution",
      "project",
      "status",
      "harvestQuantity",
      "salesQuantity",
      "revenue",
      "iotRecords",
      "anomalyRate",
    ];
    const rows = byProject.map((p) =>
      [
        institution.name,
        p.name,
        p.status,
        p.harvestQuantity,
        p.salesQuantity,
        p.revenue,
        p.iotRecords,
        p.anomalyRate,
      ]
        .map(csvCell)
        .join(","),
    );
    // Excel이 UTF-8로 열도록 BOM을 붙인다.
    const csv = "﻿" + [header.join(","), ...rows].join("\r\n");
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="institution-${institution.id}-${days}d.csv"`,
      },
    });
  }

  return NextResponse.json({
    institution: { id: institution.id, name: institution.name },
    periodDays: days,
    dataAsOf,
    stale,
    summary,
    byProject,
  });
}

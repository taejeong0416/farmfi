import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeBigInt as serialize } from "@/lib/serialize";
import { getServerSession, requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import {
  buildPayoutPlan,
  parsePeriod,
  PAYOUT_CATEGORIES,
  PAYOUT_CATEGORY_LABEL,
  PAYOUT_STATUSES,
  type PayoutCategory,
} from "@/lib/payout";

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /api/payouts?projectId=&period=&status=&category=&format=csv
// 지급 내역 조회 (명세 2.2). admin은 전부, 그 외 역할은 자기가 수취인인 건만 본다.
// format=csv는 명세 2.2.1의 '지급 파일' — 예정 건을 이체 담당자에게 넘기는 형태.
export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams;
  const projectId = q.get("projectId");
  const period = q.get("period");
  const status = q.get("status");
  const category = q.get("category");
  const isCsv = q.get("format") === "csv";

  if (period && !parsePeriod(period).ok) {
    return NextResponse.json({ error: "period must be YYYY-MM" }, { status: 400 });
  }
  if (status && !PAYOUT_STATUSES.includes(status as (typeof PAYOUT_STATUSES)[number])) {
    return NextResponse.json({ error: `Unknown status: ${status}` }, { status: 400 });
  }
  if (category && !PAYOUT_CATEGORIES.includes(category as PayoutCategory)) {
    return NextResponse.json({ error: `Unknown category: ${category}` }, { status: 400 });
  }

  try {
    const payouts = await prisma.payout.findMany({
      where: {
        ...(projectId ? { projectId } : {}),
        ...(period ? { period } : {}),
        ...(status ? { status } : {}),
        ...(category ? { category } : {}),
        // 수취인 본인 스코프. 계정이 연결되지 않은 파트너 지급 건은 admin만 본다.
        ...(session.role === "admin" ? {} : { payeeUserId: session.userId }),
      },
      orderBy: [{ period: "desc" }, { createdAt: "desc" }],
      take: isCsv ? 5000 : 200,
      include: { project: { select: { name: true } } },
    });

    if (isCsv) {
      const header = [
        "period",
        "project",
        "category",
        "payeeName",
        "amount",
        "status",
        "paidAt",
        "memo",
      ];
      const rows = payouts.map((p) =>
        [
          p.period,
          p.project.name,
          PAYOUT_CATEGORY_LABEL[p.category as PayoutCategory] ?? p.category,
          p.payeeName,
          Number(p.amount),
          p.status,
          p.paidAt?.toISOString() ?? "",
          p.memo ?? "",
        ]
          .map(csvCell)
          .join(",")
      );
      // Excel이 UTF-8로 열도록 BOM을 붙인다.
      const csv = "﻿" + [header.join(","), ...rows].join("\r\n");
      return new NextResponse(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="payouts-${period ?? "all"}.csv"`,
        },
      });
    }

    const summary = {
      scheduled: payouts
        .filter((p) => p.status === "scheduled")
        .reduce((s, p) => s + Number(p.amount), 0),
      paid: payouts.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0),
      failed: payouts
        .filter((p) => p.status === "failed")
        .reduce((s, p) => s + Number(p.amount), 0),
    };

    return NextResponse.json(
      serialize({ payouts, summary, categories: PAYOUT_CATEGORIES, statuses: PAYOUT_STATUSES })
    );
  } catch (error) {
    console.error("GET /api/payouts error:", error);
    return NextResponse.json({ error: "Failed to load payouts" }, { status: 500 });
  }
}

// POST /api/payouts — 기간 정산을 계산해 지급 예정 건을 등록한다 (명세 2.2.1).
// 같은 기간·수취인·항목은 유니크 제약으로 중복 등록되지 않는다(재호출 안전).
// dryRun=1이면 계산 결과만 돌려주고 등록하지 않는다.
export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  try {
    const body = await request.json();
    const { projectId, period, operatorRevenue, experienceRevenue, b2bIncrementalRevenue, dryRun } =
      body;

    if (!projectId || !period) {
      return NextResponse.json(
        { error: "projectId and period (YYYY-MM) are required" },
        { status: 400 }
      );
    }
    if (!parsePeriod(String(period)).ok) {
      return NextResponse.json({ error: "period must be YYYY-MM" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const plan = await buildPayoutPlan(projectId, String(period), {
      operatorRevenue: operatorRevenue == null ? undefined : Number(operatorRevenue),
      experienceRevenue: experienceRevenue == null ? undefined : Number(experienceRevenue),
      b2bIncrementalRevenue:
        b2bIncrementalRevenue == null ? undefined : Number(b2bIncrementalRevenue),
    });

    if (dryRun) {
      return NextResponse.json(serialize({ dryRun: true, plan }));
    }

    const created = await prisma.payout.createMany({
      data: plan.lines.map((l) => ({
        projectId,
        period: plan.period,
        category: l.category,
        payeeUserId: l.payeeUserId,
        payeeName: l.payeeName,
        amount: l.amount,
        memo: l.memo,
      })),
      skipDuplicates: true,
    });

    const skipped = plan.lines.length - created.count;

    await recordAudit({
      actorId: session.userId,
      actorRole: "admin",
      action: "payout.scheduled",
      entityType: "payout",
      entityId: null,
      projectId,
      summary: `${project.name} ${plan.period} 지급 예정 ${created.count}건 등록 (총 ${Number(plan.total).toLocaleString("ko-KR")}원${skipped > 0 ? `, 중복 ${skipped}건 제외` : ""})`,
      detail: {
        period: plan.period,
        created: created.count,
        skipped,
        total: Number(plan.total),
        perToken: plan.perToken,
        operatorRevenue: plan.operatorRevenue,
        operatorRevenueMeasured: plan.operatorRevenueMeasured,
      },
    });

    const payouts = await prisma.payout.findMany({
      where: { projectId, period: plan.period },
      orderBy: { category: "asc" },
    });

    return NextResponse.json(
      serialize({ created: created.count, skipped, plan, payouts }),
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_PERIOD") {
      return NextResponse.json({ error: "period must be YYYY-MM" }, { status: 400 });
    }
    console.error("POST /api/payouts error:", error);
    return NextResponse.json({ error: "Failed to schedule payouts" }, { status: 500 });
  }
}

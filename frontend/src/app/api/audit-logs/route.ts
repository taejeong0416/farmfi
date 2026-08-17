import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { AUDIT_ACTIONS } from "@/lib/audit";

// 한 번에 내려주는 최대 행 수. CSV 내보내기는 감사자가 기간 전체를 받아야 하므로 더 크게 둔다.
const PAGE_MAX = 200;
const CSV_MAX = 5000;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "object" ? JSON.stringify(value) : String(value);
  // 쉼표·따옴표·개행이 있으면 따옴표로 감싸고 내부 따옴표를 이스케이프한다.
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /api/audit-logs?from=&to=&projectId=&actorId=&action=&entityType=&limit=&cursor=&format=csv
// 명세 2.5.1 — 기간·프로젝트·사용자·이벤트 유형으로 검색·필터하고 CSV로 내보낸다.
// 감사 로그는 전 사용자의 행위를 담으므로 admin 전용이다 (외부 감사자도 admin 계정으로 접근).
export async function GET(req: NextRequest) {
  try {
    await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const q = req.nextUrl.searchParams;
  const from = q.get("from");
  const to = q.get("to");
  const projectId = q.get("projectId");
  const actorId = q.get("actorId");
  const action = q.get("action");
  const entityType = q.get("entityType");
  const cursor = q.get("cursor");
  const isCsv = q.get("format") === "csv";

  if (action && !AUDIT_ACTIONS.includes(action as (typeof AUDIT_ACTIONS)[number])) {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if ((fromDate && Number.isNaN(fromDate.getTime())) || (toDate && Number.isNaN(toDate.getTime()))) {
    return NextResponse.json({ error: "from/to must be ISO date strings" }, { status: 400 });
  }

  const requested = Number(q.get("limit"));
  const max = isCsv ? CSV_MAX : PAGE_MAX;
  const limit =
    Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), max) : max;

  const where = {
    ...(projectId ? { projectId } : {}),
    ...(actorId ? { actorId } : {}),
    ...(action ? { action } : {}),
    ...(entityType ? { entityType } : {}),
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };

  try {
    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1, // 한 건 더 읽어 다음 페이지 존재 여부만 판단
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = logs.length > limit;
    const page = hasMore ? logs.slice(0, limit) : logs;

    if (isCsv) {
      const header = [
        "createdAt",
        "action",
        "entityType",
        "entityId",
        "projectId",
        "actorId",
        "actorRole",
        "summary",
        "detail",
      ];
      const rows = page.map((l) =>
        [
          l.createdAt.toISOString(),
          l.action,
          l.entityType,
          l.entityId,
          l.projectId,
          l.actorId,
          l.actorRole,
          l.summary,
          l.detail,
        ]
          .map(csvCell)
          .join(",")
      );
      // Excel이 UTF-8로 열도록 BOM을 붙인다 (한글 summary가 깨지는 것을 막음).
      const csv = "﻿" + [header.join(","), ...rows].join("\r\n");
      const stamp = new Date().toISOString().slice(0, 10);
      return new NextResponse(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="audit-logs-${stamp}.csv"`,
        },
      });
    }

    return NextResponse.json({
      logs: page,
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
      actions: AUDIT_ACTIONS,
    });
  } catch (error) {
    console.error("GET /api/audit-logs error:", error);
    return NextResponse.json({ error: "Failed to load audit logs" }, { status: 500 });
  }
}

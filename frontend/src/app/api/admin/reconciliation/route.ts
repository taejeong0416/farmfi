import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { serializeBigInt } from "@/lib/serialize";
import { recordAudit } from "@/lib/audit";
import { sweepReceipts, reconcileHoldings } from "@/lib/reconciliation";

// GET /api/admin/reconciliation — 대사 감사 큐.
// 대사가 찾아낸 DB↔체인 불일치를 사람이 보는 창구다. 자동 수정은 하지 않는다.
export async function GET(request: NextRequest) {
  try {
    await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const status = request.nextUrl.searchParams.get("status") ?? "OPEN";
  const entries = await prisma.reconciliationEntry.findMany({
    where: status === "ALL" ? {} : { status },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const counts = await prisma.reconciliationEntry.groupBy({
    by: ["status"],
    _count: { _all: true },
  });

  return NextResponse.json(
    serializeBigInt({
      entries,
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    }),
  );
}

// POST /api/admin/reconciliation — 두 가지 용도.
//   { id, resolution } → 항목 해소 (사람이 판단을 남긴다)
//   { mode }           → 대사 수동 실행. receipts · holdings · full(기본)
export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // 본문 없이 부르면 전체 대사
  }
  const input = (body ?? {}) as { id?: unknown; resolution?: unknown; mode?: unknown };

  if (typeof input.id === "string" && input.id) {
    const resolution = typeof input.resolution === "string" ? input.resolution.trim() : "";
    if (!resolution) {
      return NextResponse.json(
        { error: "해소 사유를 적어야 합니다." },
        { status: 400 },
      );
    }
    const target = await prisma.reconciliationEntry.findUnique({ where: { id: input.id } });
    if (!target) {
      return NextResponse.json({ error: "대사 항목을 찾을 수 없습니다." }, { status: 404 });
    }

    const updated = await prisma.reconciliationEntry.update({
      where: { id: input.id },
      data: {
        status: "RESOLVED",
        resolution,
        resolvedBy: session.userId,
        resolvedAt: new Date(),
      },
    });
    await recordAudit({
      actorId: session.userId,
      actorRole: "admin",
      action: "reconciliation.resolved",
      entityType: "reconciliation",
      entityId: updated.id,
      summary: `대사 불일치 해소 · ${updated.kind} · ${updated.entityType} ${updated.entityId}`,
      detail: {
        expected: updated.expectedText,
        actual: updated.actualText,
        resolution,
      },
    });
    return NextResponse.json(serializeBigInt({ entry: updated }));
  }

  const mode = typeof input.mode === "string" ? input.mode : "full";
  const receipts = mode === "holdings" ? null : await sweepReceipts();
  const holdings = mode === "receipts" ? null : await reconcileHoldings();

  return NextResponse.json({ mode, receipts, holdings });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { serializeBigInt } from "@/lib/serialize";
import { recordAudit } from "@/lib/audit";

/**
 * POST /api/admin/projects/[id]/records/confirm — 기간 매출·비용 확정 (A-16).
 *
 * 확정돼야 정산 계산에 들어간다. 사유(`note`)를 필수로 받는다 — 숫자만 남으면
 * 왜 그 값으로 확정했는지가 사라지고, 나중에 아무도 검증할 수 없다.
 *
 * body.undo === true 면 확정을 해제한다(수정하려면 이 경로를 거친다).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { period, note, undo } = (body ?? {}) as Record<string, unknown>;

  if (typeof period !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    return NextResponse.json({ error: "period는 YYYY-MM 형식이어야 합니다." }, { status: 400 });
  }

  const record = await prisma.periodRecord.findUnique({
    where: { projectId_period: { projectId: id, period } },
  });
  if (!record) {
    return NextResponse.json(
      { error: "저장된 입력값이 없습니다. 먼저 매출·비용을 저장해 주세요." },
      { status: 404 },
    );
  }

  if (undo === true) {
    if (record.status !== "confirmed") {
      return NextResponse.json({ error: "확정되지 않은 기간입니다." }, { status: 400 });
    }
    // 이미 배당이 나간 기간을 되돌리면 근거와 결과가 어긋난다.
    const paid = await prisma.dividend.findFirst({
      where: { projectId: id, period },
      select: { id: true },
    });
    if (paid) {
      return NextResponse.json(
        { error: "이 기간은 이미 회수금이 분배됐습니다. 확정을 해제할 수 없습니다." },
        { status: 409 },
      );
    }
    const undone = await prisma.periodRecord.update({
      where: { id: record.id },
      data: { status: "draft", confirmedAt: null, confirmedById: null },
    });
    await recordAudit({
      actorId: session.userId,
      actorRole: "admin",
      action: "period_record.confirmed",
      entityType: "project",
      entityId: id,
      projectId: id,
      summary: `${period} 매출·비용 확정 해제`,
    });
    return NextResponse.json(serializeBigInt({ record: undone }));
  }

  if (typeof note !== "string" || !note.trim()) {
    return NextResponse.json(
      { error: "확정 사유를 적어 주세요." },
      { status: 400 },
    );
  }
  if (record.status === "confirmed") {
    return NextResponse.json({ error: "이미 확정된 기간입니다." }, { status: 400 });
  }

  const confirmed = await prisma.periodRecord.update({
    where: { id: record.id },
    data: {
      status: "confirmed",
      confirmNote: note.trim(),
      confirmedById: session.userId,
      confirmedAt: new Date(),
    },
  });

  await recordAudit({
    actorId: session.userId,
    actorRole: "admin",
    action: "period_record.confirmed",
    entityType: "project",
    entityId: id,
    projectId: id,
    summary: `${period} 매출·비용 확정 — 매출 ${Number(record.revenue).toLocaleString("ko-KR")}원 · 비용 ${Number(record.totalCost).toLocaleString("ko-KR")}원`,
    detail: { note: note.trim() },
  });

  return NextResponse.json(serializeBigInt({ record: confirmed }));
}

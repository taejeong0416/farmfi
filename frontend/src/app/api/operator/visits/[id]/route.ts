import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";

// PATCH /api/operator/visits/[id] — 예약 변경·취소 (명세 O-04).
// 본인 예약만 건드릴 수 있고, 이미 다녀온 예약은 바꾸지 않는다.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const visit = await prisma.operatorVisit.findUnique({
    where: { id },
    include: { application: { select: { id: true, userId: true, status: true } } },
  });
  if (!visit || visit.application.userId !== session.userId) {
    return NextResponse.json({ error: "예약을 찾을 수 없습니다." }, { status: 404 });
  }
  if (visit.status === "COMPLETED") {
    return NextResponse.json(
      { error: "이미 방문을 마친 예약입니다." },
      { status: 400 },
    );
  }

  if (b.cancel === true) {
    const cancelled = await prisma.operatorVisit.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    // 살아 있는 예약이 없어지면 신청 행의 방문 시각도 비운다. 상태는 건드리지
    // 않는다 — 진행 표시줄은 visitAt을 보고 판단하고, 뒤 단계까지 간 신청을
    // 예약 취소로 되돌리면 이미 끝난 교육·계약이 없던 일이 된다.
    await prisma.operatorApplication.update({
      where: { id: visit.application.id },
      data: { visitAt: null, visitNote: null },
    });
    return NextResponse.json({ visit: cancelled });
  }

  if (visit.status === "CANCELLED") {
    return NextResponse.json(
      { error: "취소한 예약입니다. 새로 예약해 주세요." },
      { status: 400 },
    );
  }

  if (typeof b.scheduledAt !== "string" || Number.isNaN(Date.parse(b.scheduledAt))) {
    return NextResponse.json({ error: "방문 일시를 선택해 주세요." }, { status: 400 });
  }
  const scheduledAt = new Date(b.scheduledAt);
  if (scheduledAt.getTime() < Date.now()) {
    return NextResponse.json(
      { error: "지난 시각으로는 예약할 수 없습니다." },
      { status: 400 },
    );
  }

  const note = typeof b.note === "string" && b.note.trim() ? b.note.trim() : visit.note;
  const updated = await prisma.operatorVisit.update({
    where: { id },
    data: {
      scheduledAt,
      slot: typeof b.slot === "string" ? b.slot : visit.slot,
      note,
    },
  });
  await prisma.operatorApplication.update({
    where: { id: visit.application.id },
    data: { visitAt: scheduledAt, visitNote: note },
  });

  return NextResponse.json({ visit: updated });
}

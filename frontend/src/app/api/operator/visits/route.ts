import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { getMyApplication } from "@/lib/operator-apply";

// GET /api/operator/visits — 내 방문 예약. 취소한 건도 준다(이력이다).
export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const application = await getMyApplication(session.userId);
  if (!application) return NextResponse.json({ visits: [] });

  const visits = await prisma.operatorVisit.findMany({
    where: { applicationId: application.id },
    orderBy: { scheduledAt: "desc" },
  });
  return NextResponse.json({ visits });
}

// POST /api/operator/visits — 현장 방문을 예약한다 (O-04).
// 이미 잡아둔 예약이 있으면 새로 만들지 않고 그 건을 옮긴다. 예약이 여러 개
// 살아 있으면 어느 날 가는지가 흐려진다.
export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

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

  const application = await getMyApplication(session.userId);
  if (!application) {
    return NextResponse.json({ error: "진행 중인 신청이 없습니다." }, { status: 404 });
  }
  if (application.documents.length === 0) {
    return NextResponse.json(
      { error: "자격·서류를 먼저 제출해 주세요." },
      { status: 400 },
    );
  }

  const slot = typeof b.slot === "string" ? b.slot : scheduledAt.toISOString().slice(11, 16);
  const note = typeof b.note === "string" && b.note.trim() ? b.note.trim() : null;

  const active = await prisma.operatorVisit.findFirst({
    where: { applicationId: application.id, status: "RESERVED" },
  });

  const visit = active
    ? await prisma.operatorVisit.update({
        where: { id: active.id },
        data: { scheduledAt, slot, note },
      })
    : await prisma.operatorVisit.create({
        data: {
          applicationId: application.id,
          spaceId: application.spaceId,
          scheduledAt,
          slot,
          note,
        },
      });

  // 진행 표시줄과 개점 준비 현황이 신청 행을 본다. 예약된 시각을 거기에도 남긴다.
  // 상태는 앞으로만 민다 — 교육까지 끝낸 사람이 방문 일정을 바꿨다고 해서
  // 신청이 방문 단계로 돌아가면 안 된다.
  await prisma.operatorApplication.update({
    where: { id: application.id },
    data: {
      visitAt: scheduledAt,
      visitNote: note,
      ...(application.status === "applied" || application.status === "docs"
        ? { status: "visit" }
        : {}),
    },
  });

  return NextResponse.json({ visit, rescheduled: Boolean(active) });
}

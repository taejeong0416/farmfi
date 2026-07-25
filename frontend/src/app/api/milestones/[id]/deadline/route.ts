import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeBigInt as serialize } from "@/lib/serialize";
import { requireRole } from "@/lib/auth";
import { MILESTONE_TIMEOUT_DAYS } from "@/lib/onchain";

// PATCH /api/milestones/[id]/deadline — ⚠️ 데모 전용. 마일스톤 기한을 임의 시점으로 옮긴다.
//
// 실제 기한은 트랜치 집행 시각 + 180일로만 정해진다(complete 라우트가 갱신). 이 라우트는
// 발표에서 "기한 초과 → 실패 전환 → 환불"을 180일 기다리지 않고 보여주기 위한 admin 전용
// 조작 창구다. 프로덕션 운영 흐름에 쓰면 안 된다.
//
// body: { daysFromNow: number }  음수 = 과거로 당김. 생략 시 -1(어제).
const MAX_SHIFT_DAYS = 3650;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const raw = (body as { daysFromNow?: unknown }).daysFromNow;
    const daysFromNow = typeof raw === "number" && Number.isFinite(raw) ? raw : -1;

    if (Math.abs(daysFromNow) > MAX_SHIFT_DAYS) {
      return NextResponse.json(
        { error: `daysFromNow must be within ±${MAX_SHIFT_DAYS}` },
        { status: 400 }
      );
    }

    const milestone = await prisma.milestone.findUnique({ where: { id } });
    if (!milestone) {
      return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
    }

    const updated = await prisma.milestone.update({
      where: { id },
      data: { deadlineAt: new Date(Date.now() + daysFromNow * DAY_MS) },
    });

    return NextResponse.json(
      serialize({
        success: true,
        milestone: updated,
        demoOnly: true,
        note: `데모 전용 조작 — 실제 기한은 트랜치 집행 + ${MILESTONE_TIMEOUT_DAYS}일로만 정해집니다.`,
      })
    );
  } catch (error) {
    console.error("PATCH /api/milestones/[id]/deadline error:", error);
    return NextResponse.json(
      { error: "Failed to update deadline" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeBigInt } from "@/lib/serialize";
import { requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { canApproveItems, canReview, reviewSignalsOf } from "@/lib/milestone-gate";

// POST /api/milestones/[id]/approve — 관리자 증빙 재검토 (A-08).
// decision: "approve" → verified (집행 가능) · "revise" → revision_required (재제출 요청)
// 승인 없이는 집행 API가 통과시키지 않는다.
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
  const { decision, note, items } = (body ?? {}) as {
    decision?: unknown;
    note?: unknown;
    /** [{ signal, verdict, evidenceUrl?, note? }] — 조건 항목별 판정 */
    items?: unknown;
  };
  if (decision !== "approve" && decision !== "revise") {
    return NextResponse.json(
      { error: "decision은 approve 또는 revise여야 합니다." },
      { status: 400 },
    );
  }
  if (decision === "revise" && (typeof note !== "string" || !note.trim())) {
    return NextResponse.json(
      { error: "보완 요청 사유를 적어 주세요." },
      { status: 400 },
    );
  }

  const milestone = await prisma.milestone.findUnique({
    where: { id },
    include: { project: { select: { id: true, name: true } }, reviewItems: true },
  });
  if (!milestone) {
    return NextResponse.json({ error: "단계를 찾을 수 없습니다." }, { status: 404 });
  }
  if (milestone.status === "completed") {
    return NextResponse.json(
      { error: "이미 집행이 끝난 단계입니다." },
      { status: 400 },
    );
  }
  if (!canReview(milestone.status)) {
    return NextResponse.json(
      { error: "증빙이 제출된 단계만 판정할 수 있습니다." },
      { status: 400 },
    );
  }
  // 승인은 집행 문을 여는 행위다. 증빙 없이 승인하면 조건부 집행이 무너진다.
  // 보완 요청(revise)은 반대 방향이라 증빙이 없어도 낼 수 있다 — 증빙 없이
  // verified가 된 옛 단계를 되돌리는 유일한 경로이기도 하다.
  if (decision === "approve" && !milestone.evidenceSubmittedAt) {
    return NextResponse.json(
      { error: "운영자 증빙이 제출되지 않은 단계는 승인할 수 없습니다." },
      { status: 400 },
    );
  }

  // 조건 항목별 판정을 먼저 반영한다. 명세 A-08: "각 항목마다 충족·미충족과
  // 근거가 된 증빙을 지정해야 승인 버튼이 열린다."
  // 자동 검증 결과는 초안일 뿐이라 그것만으로 승인이 되면 안 된다.
  if (Array.isArray(items)) {
    for (const raw of items) {
      if (typeof raw !== "object" || raw === null) continue;
      const { signal, verdict, evidenceUrl, note: itemNote } = raw as Record<string, unknown>;
      if (typeof signal !== "string" || !signal) continue;
      if (verdict !== "met" && verdict !== "unmet" && verdict !== "undecided") continue;
      const data = {
        verdict,
        evidenceUrl: typeof evidenceUrl === "string" ? evidenceUrl : null,
        note: typeof itemNote === "string" ? itemNote : null,
        // 사람이 손댔다는 표시. 초안과 확정을 구분해야 "누가 정했나"가 남는다.
        autoDraft: false,
        decidedById: session.userId,
        decidedAt: new Date(),
      };
      await prisma.milestoneReviewItem.upsert({
        where: { milestoneId_signal: { milestoneId: id, signal } },
        create: { milestoneId: id, signal, ...data },
        update: data,
      });
    }
  }

  if (decision === "approve") {
    const fresh = await prisma.milestoneReviewItem.findMany({ where: { milestoneId: id } });
    const itemGate = canApproveItems(reviewSignalsOf(milestone), fresh);
    if (!itemGate.ok) {
      return NextResponse.json({ error: itemGate.error }, { status: 400 });
    }
  }

  // 판정 시점의 상태를 조건으로 걸어 동시 판정 중 하나만 반영되게 한다.
  const result = await prisma.milestone.updateMany({
    where: { id, status: milestone.status },
    data: {
      status: decision === "approve" ? "verified" : "revision_required",
      reviewNote: typeof note === "string" && note.trim() ? note.trim() : null,
      reviewedById: session.userId,
      reviewedAt: new Date(),
    },
  });
  if (result.count === 0) {
    return NextResponse.json(
      { error: "다른 판정이 먼저 반영됐습니다. 새로고침 후 다시 확인해 주세요." },
      { status: 409 },
    );
  }

  const updated = await prisma.milestone.findUnique({ where: { id } });

  await recordAudit({
    actorId: session.userId,
    actorRole: "admin",
    action:
      decision === "approve"
        ? "milestone.evidence.approved"
        : "milestone.evidence.revision_requested",
    entityType: "milestone",
    entityId: id,
    projectId: milestone.projectId,
    summary: `${milestone.project.name} ${milestone.seq}단계 ${
      decision === "approve" ? "증빙 승인" : "보완 요청"
    }`,
    detail: {
      note: typeof note === "string" ? note : null,
      // 명세 A-08: "승인자, 조건 항목별 판정, 사유, 시각을 감사 로그에 기록한다."
      items: await prisma.milestoneReviewItem.findMany({
        where: { milestoneId: id },
        select: { signal: true, verdict: true, evidenceUrl: true, note: true },
      }),
    },
  });

  return NextResponse.json({ milestone: serializeBigInt(updated) });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeBigInt } from "@/lib/serialize";
import { requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { canReview } from "@/lib/milestone-gate";

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
  const { decision, note } = (body ?? {}) as {
    decision?: unknown;
    note?: unknown;
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
    include: { project: { select: { id: true, name: true } } },
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
    detail: { note: typeof note === "string" ? note : null },
  });

  return NextResponse.json({ milestone: serializeBigInt(updated) });
}

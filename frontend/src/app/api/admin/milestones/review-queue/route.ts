import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { serializeBigInt } from "@/lib/serialize";
import { SIGNAL_LABEL, canApproveItems, reviewSignalsOf } from "@/lib/milestone-gate";

/**
 * GET /api/admin/milestones/review-queue — 검토 대기 큐 (T2 · A-08).
 *
 * 명세: "프로젝트, 단계, 제출자, 제출 시각, 경과 시간 순으로 표시한다."
 * 오래 기다린 건이 위로 온다 — 자금이 묶여 있는 시간이 곧 운영자의 손해다.
 *
 * `manual_review`도 같은 큐에 담는다(T3). 자동 검증 실패는 반려가 아니라
 * 사람이 볼 일이고, 별도 화면으로 빼면 아무도 안 본다.
 */
export async function GET() {
  try {
    await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const rows = await prisma.milestone.findMany({
    where: { status: { in: ["evidence_submitted", "manual_review", "revision_required"] } },
    include: {
      project: { select: { id: true, name: true, operator: { select: { name: true } } } },
      reviewItems: true,
    },
    // 제출이 오래된 순. 미제출(null)은 뒤로.
    orderBy: [{ evidenceSubmittedAt: "asc" }, { seq: "asc" }],
    take: 100,
  });

  const now = Date.now();
  const queue = rows.map((m) => {
    const signals = reviewSignalsOf(m);
    const gate = canApproveItems(signals, m.reviewItems);
    const decided = m.reviewItems.filter((i) => i.verdict !== "undecided").length;
    return {
      id: m.id,
      seq: m.seq,
      name: m.name,
      status: m.status,
      conditionText: m.conditionText,
      releaseAmount: m.releaseAmount,
      project: { id: m.project.id, name: m.project.name },
      submittedBy: m.project.operator?.name ?? null,
      evidenceSubmittedAt: m.evidenceSubmittedAt,
      // 경과 시간(시간 단위). 미제출이면 null.
      waitingHours: m.evidenceSubmittedAt
        ? Math.floor((now - m.evidenceSubmittedAt.getTime()) / 3_600_000)
        : null,
      evidenceCount: m.evidenceUrls.length,
      items: { decided, total: signals.length, labels: signals.map((s) => SIGNAL_LABEL[s] ?? s) },
      canApprove: gate.ok,
      blockedReason: gate.ok ? null : gate.error,
      // 자동 검증이 2회 실패해 사람에게 넘어온 건 (T3)
      escalated: m.status === "manual_review",
    };
  });

  return NextResponse.json(
    serializeBigInt({
      queue,
      counts: {
        total: queue.length,
        ready: queue.filter((q) => q.canApprove).length,
        escalated: queue.filter((q) => q.escalated).length,
      },
    }),
  );
}

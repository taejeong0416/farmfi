import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { serializeBigInt } from "@/lib/serialize";
import { canAccessProject } from "@/lib/operator-scope";
import { SIGNAL_LABEL, canApproveItems, reviewSignalsOf } from "@/lib/milestone-gate";

/**
 * GET /api/milestones/[id]/verification — 검증 근거 (T1 · 명세 9.8).
 *
 * 자동 검증이 만든 판정 초안과 관리자가 확정한 항목별 판정을 함께 준다.
 * 관리자는 이 화면에서 항목마다 근거를 보고 확인·수정한다. 자동 검증은
 * **초안일 뿐** 그 자체로 승인이 아니다 — 그래서 둘을 나란히 내려준다.
 *
 * 투자자도 읽을 수 있다(명세 A-08 "투자자 열람"). 다만 원본 파일 경로 대신
 * 지문(해시)만 보여준다 — 증빙에는 계약 상대방·금액 같은 게 담긴다.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const milestone = await prisma.milestone.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true, operatorId: true } },
      reviewItems: { orderBy: { signal: "asc" } },
    },
  });
  if (!milestone) {
    return NextResponse.json({ error: "단계를 찾을 수 없습니다." }, { status: 404 });
  }

  // 원본 파일을 볼 수 있는 사람 — 관리자와 그 지점 운영자만.
  const canSeeFiles =
    session.role === "admin" || (await canAccessProject(session, milestone.projectId));

  const signals = reviewSignalsOf(milestone);
  const auto = (milestone.aiVerificationResult ?? {}) as Record<string, boolean>;
  const bySignal = new Map(milestone.reviewItems.map((i) => [i.signal, i]));

  const items = signals.map((signal) => {
    const saved = bySignal.get(signal);
    return {
      signal,
      label: SIGNAL_LABEL[signal] ?? signal,
      // 자동 검증 초안 — 아직 안 돌았으면 null(실패와 구분한다)
      autoDraft: signal in auto ? auto[signal] : null,
      verdict: saved?.verdict ?? "undecided",
      evidenceUrl: saved && canSeeFiles ? saved.evidenceUrl : null,
      note: saved?.note ?? null,
      decidedAt: saved?.decidedAt ?? null,
      /** 사람이 손댔는가. 초안 그대로면 false */
      touched: saved ? !saved.autoDraft : false,
    };
  });

  const gate = canApproveItems(signals, milestone.reviewItems);

  return NextResponse.json(
    serializeBigInt({
      milestone: {
        id: milestone.id,
        seq: milestone.seq,
        name: milestone.name,
        status: milestone.status,
        conditionText: milestone.conditionText,
        releaseAmount: milestone.releaseAmount,
        evidenceSubmittedAt: milestone.evidenceSubmittedAt,
        reviewNote: milestone.reviewNote,
        reviewedAt: milestone.reviewedAt,
        project: { id: milestone.project.id, name: milestone.project.name },
      },
      items,
      // 증빙 지문 — 원본이 바뀌면 어긋난다. 파일 접근권과 무관하게 공개한다.
      evidenceHashes: milestone.evidenceHashes,
      evidenceUrls: canSeeFiles ? milestone.evidenceUrls : [],
      canApprove: gate.ok,
      blockedReason: gate.ok ? null : gate.error,
    }),
  );
}

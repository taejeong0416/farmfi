import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

// POST /api/projects/[id]/status — 프로젝트 승인·반려·중지·재개 + 사유 기록 (명세 2.4.1).
//
//   approve : upcoming → funding    (심사 통과 — 모집 개시)
//   reject  : upcoming → rejected   (심사 반려 — 모집 개시하지 않음)
//   suspend : funding|funded|operating → paused (중지)
//   resume  : paused → 아래 사다리로 복귀 상태를 정함
//
// completed·failed는 이 라우트로 되돌리지 않는다. 청산과 기한초과 실패는 각각
// 정산·환불 절차가 뒤따르므로 상태만 뒤집으면 그 절차와 어긋난다.
const ACTIONS = {
  approve: { from: ["upcoming"], to: "funding", label: "승인" },
  reject: { from: ["upcoming"], to: "rejected", label: "반려" },
  suspend: { from: ["funding", "funded", "operating"], to: "paused", label: "중지" },
  resume: { from: ["paused"], to: null, label: "재개" },
} as const;

type Action = keyof typeof ACTIONS;

type ResumeTarget = { project: {
  fundingEnd: Date | null;
  totalTokens: number | null;
  soldTokens: number;
  tokenPrice: bigint | null;
  milestones: { status: string }[];
} };

/**
 * 중지된 프로젝트를 어디로 되돌릴지 정한다. 중지 이전 상태를 따로 저장하지 않고
 * 현재 사실관계에서 유도한다 — 저장해둔 값과 실제 진행도가 어긋나는 경우를 없애기 위해.
 */
function resumeTarget({ project }: ResumeTarget): string {
  const isFundingProject = project.tokenPrice != null && project.totalTokens != null;
  if (!isFundingProject) return "operating"; // 펀딩 없는 운영 전용 지점

  const stillRecruiting =
    project.fundingEnd != null &&
    project.fundingEnd > new Date() &&
    project.soldTokens < (project.totalTokens ?? 0);
  if (stillRecruiting) return "funding";

  const allDone =
    project.milestones.length > 0 && project.milestones.every((m) => m.status === "completed");
  return allDone ? "operating" : "funded";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  try {
    const { id } = await params;
    const { action, reason } = await request.json();

    if (!action || !(action in ACTIONS)) {
      return NextResponse.json(
        { error: `action must be one of: ${Object.keys(ACTIONS).join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof reason !== "string" || reason.trim().length === 0) {
      return NextResponse.json({ error: "사유(reason)는 필수입니다" }, { status: 400 });
    }

    const spec = ACTIONS[action as Action];

    const project = await prisma.project.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        fundingEnd: true,
        totalTokens: true,
        soldTokens: true,
        tokenPrice: true,
        milestones: { select: { status: true } },
      },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!(spec.from as readonly string[]).includes(project.status)) {
      return NextResponse.json(
        {
          error: `현재 상태(${project.status})에서는 ${spec.label}할 수 없습니다`,
          allowedFrom: spec.from,
        },
        { status: 409 }
      );
    }

    const to = spec.to ?? resumeTarget({ project });

    // 허용된 이전 상태인 행만 전이시킨다 — 동시 요청 중 하나만 성공한다.
    const claimed = await prisma.project.updateMany({
      where: { id, status: { in: [...spec.from] } },
      data: { status: to },
    });
    if (claimed.count === 0) {
      return NextResponse.json(
        { error: "다른 요청이 먼저 상태를 바꿨습니다" },
        { status: 409 }
      );
    }

    await recordAudit({
      actorId: session.userId,
      actorRole: "admin",
      action: "project.status_changed",
      entityType: "project",
      entityId: id,
      projectId: id,
      summary: `${project.name} ${spec.label} — ${project.status} → ${to} (사유: ${reason.trim()})`,
      detail: { action, from: project.status, to, reason: reason.trim() },
    });

    // 프로젝트 구독자(투자자·운영자)가 알림함에서 상태 변화를 볼 수 있게 남긴다.
    await prisma.notification.create({
      data: {
        projectId: id,
        type: "project_status_changed",
        message: `${project.name} ${spec.label} — ${reason.trim().slice(0, 160)}`,
      },
    });

    return NextResponse.json({
      projectId: id,
      from: project.status,
      to,
      action,
      reason: reason.trim(),
    });
  } catch (error) {
    console.error("POST /api/projects/[id]/status error:", error);
    return NextResponse.json({ error: "Failed to change project status" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeBigInt } from "@/lib/serialize";
import { getServerSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { canSubmitEvidence } from "@/lib/milestone-gate";

// GET /api/milestones/[id]/evidence — 제출 화면(O-11)이 쓰는 단계 상세.
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
      project: { select: { id: true, name: true, location: true, operatorId: true } },
    },
  });
  if (!milestone) {
    return NextResponse.json({ error: "단계를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ milestone: serializeBigInt(milestone) });
}

// POST /api/milestones/[id]/evidence — 운영자 증빙 제출.
// 이 제출이 있어야 검증·승인 단계로 넘어간다. 승인 전에는 집행 API가 거부한다.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "operator" && session.role !== "admin") {
    return NextResponse.json(
      { error: "운영자만 증빙을 제출할 수 있습니다." },
      { status: 403 },
    );
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { urls, note } = (body ?? {}) as { urls?: unknown; note?: unknown };

  const fileUrls = Array.isArray(urls)
    ? urls.filter((u): u is string => typeof u === "string" && u.length > 0)
    : [];
  if (fileUrls.length === 0) {
    return NextResponse.json(
      { error: "증빙 파일을 한 개 이상 첨부해 주세요." },
      { status: 400 },
    );
  }

  const milestone = await prisma.milestone.findUnique({
    where: { id },
    include: { project: { select: { id: true, name: true, operatorId: true } } },
  });
  if (!milestone) {
    return NextResponse.json({ error: "단계를 찾을 수 없습니다." }, { status: 404 });
  }
  // 남의 지점 단계에 증빙을 밀어 넣는 경로를 막는다.
  if (
    session.role === "operator" &&
    milestone.project.operatorId &&
    milestone.project.operatorId !== session.userId
  ) {
    return NextResponse.json(
      { error: "이 지점의 운영자만 제출할 수 있습니다." },
      { status: 403 },
    );
  }
  if (!canSubmitEvidence(milestone.status)) {
    return NextResponse.json(
      { error: "지금은 증빙을 제출할 수 있는 단계가 아닙니다." },
      { status: 400 },
    );
  }

  const updated = await prisma.milestone.update({
    where: { id },
    data: {
      evidenceUrls: fileUrls,
      evidenceUrl: fileUrls[0],
      evidenceNote: typeof note === "string" ? note : null,
      evidenceSubmittedAt: new Date(),
      status: "evidence_submitted",
      reviewNote: null,
    },
  });

  await recordAudit({
    actorId: session.userId,
    actorRole: session.role,
    action: "milestone.evidence.submitted",
    entityType: "milestone",
    entityId: id,
    projectId: milestone.projectId,
    summary: `${milestone.project.name} ${milestone.seq}단계 증빙 제출 (${fileUrls.length}건)`,
    detail: { urls: fileUrls },
  });

  return NextResponse.json({ milestone: serializeBigInt(updated) });
}

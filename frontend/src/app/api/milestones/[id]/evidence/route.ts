import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeBigInt } from "@/lib/serialize";
import { getServerSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { canSubmitEvidence } from "@/lib/milestone-gate";
import { recordEvidenceOnChain } from "@/lib/audit-trail";

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
  const { urls, note, hashes } = (body ?? {}) as {
    urls?: unknown;
    note?: unknown;
    hashes?: unknown;
  };

  const fileUrls = Array.isArray(urls)
    ? urls.filter((u): u is string => typeof u === "string" && u.length > 0)
    : [];
  if (fileUrls.length === 0) {
    return NextResponse.json(
      { error: "증빙 파일을 한 개 이상 첨부해 주세요." },
      { status: 400 },
    );
  }

  // 업로드 시점에 계산된 파일 지문. urls와 같은 순서여야 짝이 맞는다.
  // 개수가 어긋나면 어느 해시가 어느 파일 것인지 알 수 없으므로 저장하지 않는다 —
  // 틀린 짝을 남기는 것보다 비워 두는 편이 낫다.
  const rawHashes = Array.isArray(hashes)
    ? hashes.filter((h): h is string => typeof h === "string" && /^[0-9a-f]{64}$/.test(h))
    : [];
  const fileHashes = rawHashes.length === fileUrls.length ? rawHashes : [];

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
      evidenceHashes: fileHashes,
      evidenceUrl: fileUrls[0],
      evidenceNote: typeof note === "string" ? note : null,
      evidenceSubmittedAt: new Date(),
      status: "evidence_submitted",
      reviewNote: null,
    },
  });

  // 증빙 해시를 체인에 남긴다 (명세 9.6 submitEvidenceHash). 나중에 파일을 다시
  // 해시해 이 값과 맞춰보면 교체 여부를 알 수 있다. 순차로 보내는 이유는 같은
  // 운영키로 동시에 쏘면 nonce가 충돌하기 때문이다.
  const evidenceTxHashes: string[] = [];
  for (const [index, fileHash] of fileHashes.entries()) {
    const tx = await recordEvidenceOnChain({
      eventId: `evidence:${id}:${index}:${fileHash}`,
      projectId: milestone.projectId,
      milestoneSeq: milestone.seq,
      fileSha256: fileHash,
    });
    if (tx) evidenceTxHashes.push(tx);
  }

  await recordAudit({
    actorId: session.userId,
    actorRole: session.role,
    action: "milestone.evidence.submitted",
    entityType: "milestone",
    entityId: id,
    projectId: milestone.projectId,
    summary: `${milestone.project.name} ${milestone.seq}단계 증빙 제출 (${fileUrls.length}건)`,
    detail: { urls: fileUrls, hashes: fileHashes, chainTxHashes: evidenceTxHashes },
  });

  return NextResponse.json({
    milestone: serializeBigInt(updated),
    chainTxHashes: evidenceTxHashes,
  });
}

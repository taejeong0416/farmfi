import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import {
  CREDENTIAL_STATUS_LABEL,
  SUSPEND_REASONS,
  checkCredential,
  credentialNo,
} from "@/lib/credential";

// GET /api/admin/operator-credentials — 발급 현황 (A-03)
export async function GET() {
  try {
    await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const rows = await prisma.operatorCredential.findMany({
    orderBy: { issuedAt: "desc" },
    take: 100,
    include: {
      user: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({
    credentials: rows.map((c) => ({
      id: c.id,
      credentialNo: c.credentialNo,
      operator: c.user,
      project: c.project,
      status: c.status,
      statusLabel: CREDENTIAL_STATUS_LABEL[c.status] ?? c.status,
      statusNote: c.statusNote,
      issuedAt: c.issuedAt,
      expiresAt: c.expiresAt,
      // 저장된 status가 active여도 기간이 지났으면 실제로는 만료다.
      effective: checkCredential(c),
    })),
    suspendReasons: SUSPEND_REASONS,
  });
}

/**
 * POST /api/admin/operator-credentials — 발급 (A-03).
 * body: { applicationId, projectId?, months? }
 *
 * 명세 17.1-8: 유효기간은 지점 운영계약 기간과 연동한다. 계약 종료일을 모르면
 * 기본 12개월로 두되, 그 값이 계약과 다르면 관리자가 고쳐야 한다.
 */
export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { applicationId, projectId, months } = (body ?? {}) as Record<string, unknown>;

  if (typeof applicationId !== "string" || !applicationId) {
    return NextResponse.json({ error: "applicationId가 필요합니다." }, { status: 400 });
  }

  const application = await prisma.operatorApplication.findUnique({
    where: { id: applicationId },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!application) {
    return NextResponse.json({ error: "신청을 찾을 수 없습니다." }, { status: 404 });
  }

  // 유효한 보증서가 이미 있으면 두 장이 생긴다. 재발급은 기존 것을 해지한 뒤에 한다.
  const existing = await prisma.operatorCredential.findFirst({
    where: { userId: application.userId, status: { in: ["active", "suspended"] } },
  });
  if (existing) {
    return NextResponse.json(
      {
        error: `이미 발급된 보증서가 있습니다 (${existing.credentialNo}). 재발급하려면 기존 보증서를 먼저 해지해 주세요.`,
      },
      { status: 409 },
    );
  }

  const span = typeof months === "number" && months > 0 ? Math.floor(months) : 12;
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + span);

  const created = await prisma.operatorCredential.create({
    data: {
      credentialNo: credentialNo(applicationId),
      userId: application.userId,
      applicationId,
      spaceId: application.spaceId ?? null,
      projectId: typeof projectId === "string" && projectId ? projectId : null,
      status: "active",
      expiresAt,
    },
  });

  await recordAudit({
    actorId: session.userId,
    actorRole: "admin",
    action: "credential.issued",
    entityType: "user",
    entityId: application.userId,
    summary: `${application.user.name} 운영자 보증서 발급 · ${created.credentialNo} (${span}개월)`,
    detail: { credentialNo: created.credentialNo, expiresAt: created.expiresAt.toISOString() },
  });

  return NextResponse.json({ credential: created });
}

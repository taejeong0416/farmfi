import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { CREDENTIAL_STATUS_LABEL, SUSPEND_REASONS } from "@/lib/credential";

/**
 * PATCH /api/admin/operator-credentials/[id]/status — 정지·재개·해지 (A-03).
 * body: { status: "active" | "suspended" | "revoked", reason?, note }
 *
 * 명세 17.1-8: 교육·안전점검 만료 또는 중대 위반 시 정지한다.
 * 정지는 되돌릴 수 있고 해지는 되돌릴 수 없다 — 그래서 해지에는 사유를 강제한다.
 * 만료(`expired`)는 시간이 정하는 것이라 사람이 찍지 않는다.
 */
const SETTABLE = new Set(["active", "suspended", "revoked"]);

export async function PATCH(
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
  const { status, reason, note } = (body ?? {}) as Record<string, unknown>;

  if (typeof status !== "string" || !SETTABLE.has(status)) {
    return NextResponse.json(
      { error: "status는 active · suspended · revoked 중 하나여야 합니다. 만료는 기간이 정합니다." },
      { status: 400 },
    );
  }
  // 운영자가 앱에서 막히는 이유를 보게 된다. 사유가 없으면 "왜 막혔는지" 알 수 없다.
  if (status !== "active" && (typeof note !== "string" || !note.trim())) {
    return NextResponse.json({ error: "사유를 적어 주세요." }, { status: 400 });
  }
  if (status === "suspended" && typeof reason === "string" && !(reason in SUSPEND_REASONS)) {
    return NextResponse.json(
      { error: `정지 사유 코드가 올바르지 않습니다: ${Object.keys(SUSPEND_REASONS).join(" · ")}` },
      { status: 400 },
    );
  }

  const credential = await prisma.operatorCredential.findUnique({
    where: { id },
    include: { user: { select: { name: true } } },
  });
  if (!credential) {
    return NextResponse.json({ error: "보증서를 찾을 수 없습니다." }, { status: 404 });
  }
  if (credential.status === "revoked") {
    return NextResponse.json(
      { error: "해지된 보증서는 되돌릴 수 없습니다. 새로 발급해 주세요." },
      { status: 400 },
    );
  }

  const updated = await prisma.operatorCredential.update({
    where: { id },
    data: {
      status,
      statusReason: status === "active" ? null : (typeof reason === "string" ? reason : "other"),
      statusNote: status === "active" ? null : (note as string).trim(),
      statusChangedAt: new Date(),
      statusChangedBy: session.userId,
    },
  });

  await recordAudit({
    actorId: session.userId,
    actorRole: "admin",
    action: "credential.status_changed",
    entityType: "user",
    entityId: credential.userId,
    summary: `${credential.user.name} 보증서 ${credential.credentialNo} → ${CREDENTIAL_STATUS_LABEL[status] ?? status}`,
    detail: { from: credential.status, to: status, reason: reason ?? null, note: note ?? null },
  });

  return NextResponse.json({ credential: updated });
}

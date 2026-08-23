import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { checkCredential, CREDENTIAL_STATUS_LABEL } from "@/lib/credential";

/**
 * GET /api/operator/credential — 내 보증서 (O-08 · 앱 M-02).
 *
 * 앱이 이걸 보고 운영 기능을 열고 닫는다. 그래서 "유효한가"를 서버가 판정해
 * 내려준다 — 앱이 status 문자열을 보고 스스로 판단하면 만료 계산이 두 벌이 되고
 * 언젠가 갈린다.
 */
export async function GET() {
  let session;
  try {
    session = await requireRole("operator");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const credential = await prisma.operatorCredential.findFirst({
    where: { userId: session.userId },
    orderBy: { issuedAt: "desc" },
    include: {
      user: { select: { name: true } },
      project: { select: { id: true, name: true, location: true } },
    },
  });

  if (!credential) {
    return NextResponse.json({
      credential: null,
      check: {
        valid: false,
        status: "none",
        reason: "발급된 보증서가 없습니다.",
        action: "공간 신청과 계약을 마치면 보증서가 발급됩니다.",
      },
    });
  }

  const check = checkCredential(credential);

  return NextResponse.json({
    credential: {
      credentialNo: credential.credentialNo,
      operatorName: credential.user.name,
      project: credential.project,
      status: credential.status,
      statusLabel: CREDENTIAL_STATUS_LABEL[credential.status] ?? credential.status,
      issuedAt: credential.issuedAt,
      expiresAt: credential.expiresAt,
      // VC가 아직 없으면 번호로만 검증한다는 사실을 숨기지 않는다.
      verifiedBy: credential.vcId ? "vc" : "number",
    },
    check,
  });
}

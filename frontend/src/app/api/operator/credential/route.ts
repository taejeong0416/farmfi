import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import QRCode from "qrcode";

import { checkCredential, CREDENTIAL_STATUS_LABEL } from "@/lib/credential";
import { offerPayloadFor, openDidIssuerStatus } from "@/lib/identity/opendid-issuer";

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

  // 앱(M-02)이 스캔할 QR. 담는 값은 보증서 번호 하나다 — 명세가 "번호 입력 또는
  // QR 스캔"이라 두 경로가 같은 값을 가리켜야 한다. 번호는 비밀이 아니므로 QR에
  // 토큰이나 개인정보를 싣지 않는다. 검증은 스캔한 뒤 이 API가 다시 한다.
  //
  // 유효하지 않은 보증서는 QR을 만들지 않는다. 스캔되는 순간 서버가 거절할 텐데
  // 굳이 찍게 만들 이유가 없다.
  const qrDataUrl = check.valid
    ? await QRCode.toDataURL(credential.credentialNo, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 320,
      }).catch(() => null)
    : null;

  // Open DID 발급 오퍼 QR. 운영자가 DID 지갑으로 스캔하면 보증서가 VC로 발급된다.
  // 오퍼가 없거나 이미 수령했으면(vcId 존재) 만들지 않는다.
  const vcOffer =
    credential.vcOfferId && credential.vcPlanId && !credential.vcId
      ? await QRCode.toDataURL(
          offerPayloadFor({
            offerId: credential.vcOfferId,
            vcPlanId: credential.vcPlanId,
            issuer: "did:omn:issuer",
            validUntil: (credential.vcOfferAt ?? new Date()).toISOString(),
          }),
          { errorCorrectionLevel: "M", margin: 2, width: 320 },
        ).catch(() => null)
      : null;

  return NextResponse.json({
    credential: {
      credentialNo: credential.credentialNo,
      qrDataUrl,
      // VC 발급 경로 (Open DID). 오퍼가 있어도 수령 전에는 vcId가 null이다.
      vcOfferQrDataUrl: vcOffer,
      vcPlanId: credential.vcPlanId,
      vcIssuer: openDidIssuerStatus().enabled ? "opendid" : null,
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

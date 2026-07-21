import { NextResponse } from "next/server";
import { getVerifier } from "@/lib/identity/verifier";
import { getServerSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// 모바일 신분증 인증에 요구할 클레임 — 실명, 생년월일, 성인 여부.
const REQUIRED_CLAIMS = ["realName", "birthDate", "adult"];

/**
 * POST /api/identity/offer
 * ≈ OpenDID Verifier의 request-offer-qr. 인증 세션(txId)을 발급하고
 * 지갑 앱이 스캔/딥링크로 열 수 있는 offer(QR 페이로드 + 딥링크)를 반환한다.
 * 로그인 상태면 세션 사용자와 인증 세션을 연결해둔다(추적용, best-effort).
 */
export async function POST() {
  try {
    const offer = await getVerifier().createOffer({ claims: REQUIRED_CLAIMS });

    const session = await getServerSession();
    if (session) {
      try {
        await prisma.identityVerification.update({
          where: { txId: offer.txId },
          data: { userId: session.userId },
        });
      } catch (linkError) {
        // 연결 실패해도 인증 흐름 자체는 계속 진행 가능 — 로그만 남긴다.
        console.error("POST /api/identity/offer: failed to link session user:", linkError);
      }
    }

    return NextResponse.json(offer);
  } catch (error) {
    console.error("POST /api/identity/offer error:", error);
    return NextResponse.json(
      { error: "인증 요청 생성에 실패했습니다." },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import type { Prisma } from "@/generated/prisma/client";

/**
 * POST /api/identity/confirm   body: { txId }
 *
 * 데모 전용 — 홀더 지갑앱(QR 스캔·VP 제출) 없이 신원인증 세션을 verified로 확정한다.
 * 실 OpenDID Verifier는 request-offer-qr(QR 발급)까지 실연동되지만, VP를 제출할
 * 사용자 지갑앱이 없어 confirm-verify가 실제로 올라오지 않는다. 이 라우트가 그 자리를
 * 대신해 로컬 세션 행을 verified로 채운다.
 *
 * requireRole("admin") 게이트 필수 — 임의 txId를 인증 통과시키는 KYC 우회이므로,
 * 데모 콘솔(admin 세션)에서만 호출한다. 상태를 채우면 폴링(GET /api/identity/status)이
 * verified를 감지해 User.identityVerified·실명·연간한도 반영을 이어서 처리한다.
 */

// 데모용 검증 클레임 — 실명·성인(만 25세) 요건 충족.
function demoClaims(): Prisma.InputJsonValue {
  const birth = new Date();
  birth.setFullYear(birth.getFullYear() - 25);
  return {
    realName: "홍길동",
    birthDate: birth.toISOString().slice(0, 10),
    adult: true,
  };
}

export async function POST(request: NextRequest) {
  try {
    await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  let txId: string | undefined;
  try {
    ({ txId } = (await request.json()) as { txId?: string });
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }
  if (!txId) {
    return NextResponse.json({ error: "txId is required" }, { status: 400 });
  }

  const record = await prisma.identityVerification.findUnique({ where: { txId } });
  if (!record) {
    return NextResponse.json({ error: "인증 세션을 찾을 수 없습니다." }, { status: 404 });
  }

  // 이미 확정된 세션이면 멱등하게 그대로 반환.
  if (record.status === "verified") {
    return NextResponse.json({ status: "verified", txId });
  }

  await prisma.identityVerification.update({
    where: { txId },
    data: { status: "verified", claims: demoClaims() },
  });

  return NextResponse.json({ status: "verified", txId });
}

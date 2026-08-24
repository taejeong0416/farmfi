import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import type { Prisma } from "@/generated/prisma/client";

/**
 * POST /api/identity/confirm   body: { txId }
 *
 * 시연 전용 — 신분증 앱 없이 신원인증 세션을 verified로 확정한다. 실 OACX 연동은
 * QR 발급까지 살아 있지만, 발표 자리에서 실물 신분증을 꺼낼 수 없을 때 흐름이
 * 여기서 끊긴다. 이 라우트가 그 한 칸을 대신 채운다.
 *
 * 자기 세션이 발급한 txId 만 확정할 수 있다 — 남의 인증을 통과시키지는 못한다.
 * 상태를 채우면 폴링(GET /api/identity/status)이 verified를 감지해
 * User.identityVerified·실명·연간한도 반영을 이어서 처리한다.
 *
 * 이 프로젝트는 목데이터로 도는 시연물이다. 실제 모집을 시작하려면 이 라우트를
 * 먼저 지워야 한다 — 명세 17.1-5.
 */

// 시연용 검증 클레임 — 계정 이름을 그대로 쓰고 성인 요건을 채운다.
function demoClaims(realName: string): Prisma.InputJsonValue {
  const birth = new Date();
  birth.setFullYear(birth.getFullYear() - 25);
  return {
    realName,
    birthDate: birth.toISOString().slice(0, 10),
    adult: true,
  };
}

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
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
  if (!record || record.userId !== session.userId) {
    return NextResponse.json({ error: "인증 세션을 찾을 수 없습니다." }, { status: 404 });
  }

  // 이미 확정된 세션이면 멱등하게 그대로 반환.
  if (record.status === "verified") {
    return NextResponse.json({ status: "verified", txId });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { name: true },
  });

  await prisma.identityVerification.update({
    where: { txId },
    data: { status: "verified", claims: demoClaims(user?.name ?? "홍길동") },
  });

  return NextResponse.json({ status: "verified", txId });
}

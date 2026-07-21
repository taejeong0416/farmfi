import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";

/**
 * 지갑 연결용 nonce 발급. 로그인 세션(쿠키/Bearer)이 있어야 한다 —
 * userId는 세션(JWT)에서만 가져오고 클라이언트 body는 신뢰하지 않는다.
 * 새 nonce를 User.nonce에 저장하고, 지갑으로 서명할 message와 함께 반환한다.
 */
export async function POST(_request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const nonce = randomUUID();

    // 세션의 userId로만 갱신 — 존재하지 않는 사용자면 404.
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await prisma.user.update({
      where: { id: session.userId },
      data: { nonce },
    });

    const message = `FarmFi 지갑 연결 인증\nnonce: ${nonce}`;

    return NextResponse.json({ nonce, message });
  } catch (error) {
    console.error("POST /api/auth/wallet/nonce error:", error);
    return NextResponse.json(
      { error: "Failed to issue nonce" },
      { status: 500 }
    );
  }
}

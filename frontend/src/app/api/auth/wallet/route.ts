import { NextRequest, NextResponse } from "next/server";
import { verifyMessage, isAddress } from "viem";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";

/**
 * 지갑 연결(부착). 로그인 세션(쿠키/Bearer) 필요 — userId는 세션에서만 가져온다.
 * body { address, signature } 를 받아, 앞서 발급한 User.nonce로 서명 메시지를
 * 재구성하고 viem verifyMessage로 검증한다. 성공 시 walletAddress를 저장하고
 * nonce는 소진(null)한다. 로그인 대체가 아니라 계정에 지갑을 붙이는 용도.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { address, signature } = (body ?? {}) as {
      address?: unknown;
      signature?: unknown;
    };

    if (
      typeof address !== "string" ||
      !isAddress(address) ||
      typeof signature !== "string" ||
      !signature.startsWith("0x")
    ) {
      return NextResponse.json(
        { error: "address와 signature를 올바르게 입력해주세요." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (!user.nonce) {
      // nonce 발급(/api/auth/wallet/nonce) 없이 바로 검증 시도 → 챌린지 없음.
      return NextResponse.json(
        { error: "지갑 연결 nonce가 없습니다. 먼저 nonce를 발급받아주세요." },
        { status: 400 }
      );
    }

    const message = `FarmFi 지갑 연결 인증\nnonce: ${user.nonce}`;

    const valid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
    if (!valid) {
      return NextResponse.json(
        { error: "서명 검증에 실패했습니다." },
        { status: 400 }
      );
    }

    try {
      const updated = await prisma.user.update({
        where: { id: session.userId },
        data: { walletAddress: address, nonce: null },
      });
      return NextResponse.json({ ok: true, walletAddress: updated.walletAddress });
    } catch (e) {
      // walletAddress unique 위반 — 이미 다른 계정이 연결한 주소.
      if (
        e &&
        typeof e === "object" &&
        "code" in e &&
        (e as { code?: string }).code === "P2002"
      ) {
        return NextResponse.json(
          { error: "이미 다른 계정에 연결된 지갑 주소입니다." },
          { status: 409 }
        );
      }
      throw e;
    }
  } catch (error) {
    console.error("POST /api/auth/wallet error:", error);
    return NextResponse.json(
      { error: "Failed to connect wallet" },
      { status: 500 }
    );
  }
}

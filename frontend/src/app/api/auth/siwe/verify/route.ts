import { NextRequest, NextResponse } from "next/server";
import { SiweMessage } from "siwe";
import { prisma } from "@/lib/db";
import { signSession, sessionCookieOptions, Role } from "@/lib/auth";

const NONCE_COOKIE = "siwe-nonce";

export async function POST(request: NextRequest) {
  try {
    const { message, signature } = await request.json();

    if (typeof message !== "string" || typeof signature !== "string") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const nonce = request.cookies.get(NONCE_COOKIE)?.value;
    if (!nonce) {
      return NextResponse.json(
        { error: "Missing or expired nonce" },
        { status: 400 }
      );
    }

    // 도메인 바인딩: 피싱 dApp이 다른 도메인에서 받아낸 서명을 재사용하는
    // 크로스도메인 리플레이를 차단한다. host는 배포 도메인(NEXT_PUBLIC_BASE_URL)
    // 또는 요청 Host 헤더로 검증.
    const expectedDomain = new URL(
      process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
    ).host;
    const requestHost = request.headers.get("host");
    const domain =
      requestHost && requestHost === expectedDomain ? requestHost : expectedDomain;

    const siweMessage = new SiweMessage(message);
    const result = await siweMessage.verify({
      signature,
      nonce,
      domain,
      time: new Date().toISOString(), // 만료(expirationTime) 지난 메시지 거부
    });

    if (!result.success) {
      return NextResponse.json(
        { error: "Signature verification failed" },
        { status: 401 }
      );
    }

    // 체인 고정: Polygon Amoy(80002) 서명만 허용.
    if (result.data.chainId !== 80002) {
      return NextResponse.json({ error: "Wrong chain" }, { status: 401 });
    }

    const walletAddress = result.data.address.toLowerCase();

    // Upsert user by wallet. New wallets default to `investor`.
    const user = await prisma.user.upsert({
      where: { walletAddress },
      update: {},
      create: {
        walletAddress,
        name: `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`,
        role: "investor",
      },
    });

    const token = await signSession({
      userId: user.id,
      walletAddress,
      role: user.role as Role,
    });

    const response = NextResponse.json({
      user: { id: user.id, walletAddress, role: user.role },
    });

    // Set session cookie.
    const opts = sessionCookieOptions();
    response.cookies.set({ ...opts, value: token });

    // Clear the one-time nonce.
    response.cookies.set({
      name: NONCE_COOKIE,
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error("POST /api/auth/siwe/verify error:", error);
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500 }
    );
  }
}

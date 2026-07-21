import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeBigInt } from "@/lib/serialize";
import { getServerSession } from "@/lib/auth";
import { executeSubscription } from "@/lib/subscription";

// POST /api/subscribe — 청약. userId는 반드시 세션(JWT)에서만 가져온다 —
// 클라이언트가 보내는 값은 절대 신뢰하지 않는다 (IDOR 방지).
// 게이트: 본인인증(identityVerified) 완료 + 연간 투자한도 이내여야 청약 가능.
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId, tokenAmount } = await request.json();

    if (!projectId || !tokenAmount || tokenAmount <= 0 || !Number.isInteger(tokenAmount)) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (!user.identityVerified) {
      return NextResponse.json(
        { error: "Identity verification required" },
        { status: 403 }
      );
    }

    const result = await executeSubscription({
      userId: session.userId,
      projectId,
      tokenAmount,
      annualLimit: user.investorAnnualLimit,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({
      success: true,
      transaction: serializeBigInt(result.transaction),
    });
  } catch (error) {
    console.error("POST /api/subscribe error:", error);
    return NextResponse.json(
      { error: "Subscription failed" },
      { status: 500 }
    );
  }
}

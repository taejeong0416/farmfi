import { NextRequest, NextResponse } from "next/server";
import {
  getServerSession,
  sessionCookieOptions,
  signSession,
  type Role,
} from "@/lib/auth";
import { prisma } from "@/lib/db";

function serializeBigInt<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}

// 마이페이지/온보딩 응답 shape. 항상 세션의 userId로만 조회 — 클라이언트가
// 보낼 수 있는 어떤 id도 신뢰하지 않는다.
async function loadUserPayload(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      tokenHoldings: {
        include: {
          project: { select: { id: true, name: true, tokenSymbol: true } },
        },
      },
    },
  });
  if (!user) return null;

  return serializeBigInt({
    id: user.id,
    name: user.name,
    role: user.role,
    email: user.email,
    walletAddress: user.walletAddress,
    identityVerified: user.identityVerified,
    verifiedAt: user.verifiedAt,
    realName: user.realName,
    investorAnnualLimit: user.investorAnnualLimit,
    businessRegNo: user.businessRegNo,
    tokenHoldings: user.tokenHoldings.map((h) => ({
      projectId: h.projectId,
      projectName: h.project.name,
      tokenSymbol: h.project.tokenSymbol,
      amount: h.amount,
      avgPrice: h.avgPrice,
    })),
  });
}

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ user: null });
  }

  const user = await loadUserPayload(session.userId);
  return NextResponse.json({ user });
}

const ASSIGNABLE_ROLES = ["landlord", "operator"] as const;

/**
 * 회원가입 온보딩에서 역할을 확정한다. "admin"은 여기서 자가배정 불가(시드/운영 전용).
 * 세션(JWT)의 userId만 갱신 대상으로 쓰며, role 변경 후 세션 쿠키도 새 role로
 * 재서명한다 — 그러지 않으면 requireRole()이 갱신 전 JWT의 stale role로
 * 계속 판정해 인가 버그(예: 방금 operator가 된 유저가 여전히 investor 취급)로 이어진다.
 */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const role = (body as { role?: unknown } | null)?.role;
  if (
    typeof role !== "string" ||
    !ASSIGNABLE_ROLES.includes(role as (typeof ASSIGNABLE_ROLES)[number])
  ) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { role },
  });

  const user = await loadUserPayload(session.userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const token = await signSession({
    userId: session.userId,
    walletAddress: session.walletAddress,
    role: role as Role,
  });

  const response = NextResponse.json({ user });
  response.cookies.set({ ...sessionCookieOptions(), value: token });
  return response;
}

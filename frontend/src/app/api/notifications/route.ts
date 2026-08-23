import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession, type SessionPayload } from "@/lib/auth";
import { allowedProjectIds, operatorGate, scopeFilter } from "@/lib/operator-scope";

/**
 * 투자자에게 보내는 알림 종류.
 *
 * 지점으로만 좁히면 `drift_temperature`·`dli_shortfall` 같은 설비·생육 경보가
 * 그대로 넘어간다. 그건 현장에서 조치할 사람이 볼 것이지 투자자가 볼 것이 아니다.
 * 마일스톤에 묶인 알림은 종류와 무관하게 통과시킨다 — 집행 판정의 이력이다.
 */
const INVESTOR_TYPES = [
  "milestone_verify",
  "verification_failed",
  "manual_review",
  "milestone_timeout",
  "milestone_released",
  "appeal_decided",
  "project_status_changed",
  "payout_scheduled",
];

/**
 * 투자자가 알림을 받는 지점 — 보유 구좌가 있거나 청약을 넣은 프로젝트.
 * 배정 매장이 기준인 운영자와 달리, 투자자는 돈이 들어간 곳이 기준이다.
 */
async function investorWhere(userId: string): Promise<Record<string, unknown>> {
  const [holdings, investments] = await Promise.all([
    prisma.tokenHolding.findMany({ where: { userId }, select: { projectId: true } }),
    prisma.investment.findMany({ where: { userId }, select: { projectId: true } }),
  ]);
  const scope = [...new Set([...holdings, ...investments].map((r) => r.projectId))];
  return {
    ...scopeFilter(scope),
    OR: [{ type: { in: INVESTOR_TYPES } }, { milestoneId: { not: null } }],
  };
}

/** 이 세션이 다룰 수 있는 알림의 where 절. 조회와 확인 처리가 같은 범위를 써야 한다. */
async function scopeWhere(session: SessionPayload): Promise<Record<string, unknown>> {
  if (session.role === "admin") return {};
  if (session.role === "investor") return investorWhere(session.userId);
  return scopeFilter(await allowedProjectIds(session));
}

// GET /api/notifications?projectId=&unreadOnly=1 — 알림 조회
export async function GET(req: NextRequest) {
  const unreadOnly = req.nextUrl.searchParams.get("unreadOnly") === "1";

  // 투자자는 배정 매장이 없어 운영 게이트를 통과할 수 없다. 게이트만 두면
  // 투자자 알림함(I-09)이 403을 받고, 화면은 그것을 "새 소식 없음"과 구분하지
  // 못해 알림이 영영 비어 보인다. 역할별로 범위를 따로 잡는다.
  const session = await getServerSession();
  if (session?.role === "investor") {
    const notifications = await prisma.notification.findMany({
      where: {
        ...(await investorWhere(session.userId)),
        ...(unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ notifications });
  }

  const gate = await operatorGate(req);
  if (gate instanceof Response) return gate;

  const notifications = await prisma.notification.findMany({
    where: {
      // projectId를 안 줘도 내 매장으로 좁힌다. 열어 두면 전 지점 알림이 나온다.
      ...scopeFilter(gate.scope),
      ...(unreadOnly ? { isRead: false } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ notifications });
}

// PATCH /api/notifications  { id } — 알림 확인 처리
// 명세 2.2: 이미 확인된 알림을 다시 확인해도 상태를 중복 변경하지 않는다.
// updateMany + isRead:false 조건으로 멱등하게 만든다(이미 읽음이면 count 0).
export async function PATCH(req: NextRequest) {
  // 조회와 같은 범위를 건다. id만 받아 그대로 갱신하면 로그인조차 없이
  // 남의 매장 알림을 읽음 처리할 수 있다.
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const scope = await scopeWhere(session);

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const id = (body as { id?: unknown } | null)?.id;
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "알림 id가 필요합니다." }, { status: 400 });
  }

  const result = await prisma.notification.updateMany({
    where: { id, isRead: false, ...scope },
    data: { isRead: true },
  });

  // count 0 은 "없는 알림"과 "이미 확인함" 둘 다다. 존재 여부를 한 번 더 확인해
  // 404 와 멱등 성공을 구분한다. 범위 밖 알림도 여기서 404로 떨어진다.
  if (result.count === 0) {
    const exists = await prisma.notification.findFirst({
      where: { id, ...scope },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ error: "알림을 찾을 수 없습니다." }, { status: 404 });
    }
  }

  return NextResponse.json({ id, isRead: true, changed: result.count > 0 });
}

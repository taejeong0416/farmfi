import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/notifications?projectId=&unreadOnly=1 — 생육 이상 알림 조회
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  const unreadOnly = req.nextUrl.searchParams.get("unreadOnly") === "1";

  const notifications = await prisma.notification.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
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
    where: { id, isRead: false },
    data: { isRead: true },
  });

  // count 0 은 "없는 알림"과 "이미 확인함" 둘 다다. 존재 여부를 한 번 더 확인해
  // 404 와 멱등 성공을 구분한다.
  if (result.count === 0) {
    const exists = await prisma.notification.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      return NextResponse.json({ error: "알림을 찾을 수 없습니다." }, { status: 404 });
    }
  }

  return NextResponse.json({ id, isRead: true, changed: result.count > 0 });
}

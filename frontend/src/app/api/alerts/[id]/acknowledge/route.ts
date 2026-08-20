import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// POST /api/alerts/[id]/acknowledge — 명세 2.2 알림 확인 처리.
// 멱등하다. 이미 확인된 알림을 다시 눌러도 상태를 중복 변경하지 않는다
// (updateMany + isRead:false 조건이라 두 번째 호출은 count 0).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "알림 id가 필요합니다." }, { status: 400 });

  const result = await prisma.notification.updateMany({
    where: { id, isRead: false },
    data: { isRead: true },
  });

  if (result.count === 0) {
    const exists = await prisma.notification.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: "알림을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ id, isRead: true, changed: result.count > 0 });
}

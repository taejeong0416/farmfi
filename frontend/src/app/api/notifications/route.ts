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

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { guardProject, allowedProjectIds } from "@/lib/operator-scope";

/**
 * GET /api/pickups?projectId=&date=YYYY-MM-DD — 그날의 픽업 예정 (앱 M-16).
 *
 * 준비 요약(팩 크기별 개수·작물별 필요 수량)까지 같이 만든다. 운영자가 이걸 보고
 * 한 번에 팩을 만든다 — 목록만 주면 세면서 만들어야 한다.
 */
export async function GET(request: NextRequest) {
  let session;
  try {
    session = await requireRole("operator");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const projectId = request.nextUrl.searchParams.get("projectId");
  const dateParam = request.nextUrl.searchParams.get("date");

  if (projectId) {
    const denied = await guardProject(session, projectId);
    if (denied) return denied;
  }

  const day = dateParam ? new Date(dateParam) : new Date();
  if (Number.isNaN(day.getTime())) {
    return NextResponse.json({ error: "date 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const from = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);

  const scope = projectId ? [projectId] : await allowedProjectIds(session);

  const pickups = await prisma.pickupOrder.findMany({
    where: {
      scheduledAt: { gte: from, lt: to },
      ...(scope ? { subscription: { projectId: { in: scope } } } : {}),
    },
    orderBy: { scheduledAt: "asc" },
    include: {
      subscription: {
        select: {
          id: true,
          packSize: true,
          productIds: true,
          dressings: true,
          projectId: true,
          user: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
      },
    },
  });

  // 작물 이름을 붙인다. productIds는 Product.id 배열이다.
  const productIds = [...new Set(pickups.flatMap((p) => p.subscription.productIds))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(products.map((p) => [p.id, p.name]));

  // 준비 요약 — 팩 크기별 건수와 작물별 총 필요 수량.
  const packCounts: Record<number, number> = {};
  const cropNeed: Record<string, number> = {};
  for (const p of pickups) {
    if (p.status === "skipped") continue; // 건너뛴 회차는 만들 필요가 없다
    packCounts[p.subscription.packSize] = (packCounts[p.subscription.packSize] ?? 0) + 1;
    for (const pid of p.subscription.productIds) {
      const name = nameById.get(pid) ?? pid;
      cropNeed[name] = (cropNeed[name] ?? 0) + 1;
    }
  }

  return NextResponse.json({
    // 로컬 날짜를 그대로 적는다. toISOString()은 KST 자정을 UTC 전날로 바꿔
    // 화면에 하루 밀린 날짜가 뜬다.
    date: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`,
    pickups: pickups.map((p) => ({
      id: p.id,
      code: p.code,
      status: p.status,
      scheduledAt: p.scheduledAt,
      preparedAt: p.preparedAt,
      pickedAt: p.pickedAt,
      // 구매자 이름은 마스킹해서 내보낸다 (명세 M-16).
      buyerName: maskName(p.subscription.user.name),
      packSize: p.subscription.packSize,
      crops: p.subscription.productIds.map((id) => nameById.get(id) ?? id),
      dressings: p.subscription.dressings,
      project: p.subscription.project,
    })),
    summary: {
      total: pickups.length,
      packCounts,
      cropNeed,
    },
  });
}

/** 홍길동 → 홍*동 · 김철 → 김* · 외자면 그대로 */
export function maskName(name: string): string {
  if (name.length <= 1) return name;
  if (name.length === 2) return name[0] + "*";
  return name[0] + "*".repeat(name.length - 2) + name[name.length - 1];
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { serializeBigInt } from "@/lib/serialize";
import { drainIssuances, processIssuance } from "@/lib/chain-relay";

// GET /api/admin/issuances — 보유 구좌 발행 현황.
// 투자자 화면에는 발행·토큰·지갑을 노출하지 않는다. 운영자용 창구다.
export async function GET(request: NextRequest) {
  try {
    await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const status = request.nextUrl.searchParams.get("status");
  const issuances = await prisma.holdingIssuance.findMany({
    where: status ? { status } : {},
    orderBy: { occurredAt: "desc" },
    take: 100,
    include: {
      investment: {
        select: {
          id: true,
          amount: true,
          units: true,
          user: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
      },
      // 주소는 운영 조사에 필요해 admin에게만 준다. 투자자 응답에는 절대 싣지 않는다.
      wallet: { select: { chainAddress: true, status: true } },
    },
  });

  const counts = await prisma.holdingIssuance.groupBy({
    by: ["status"],
    _count: { _all: true },
  });

  return NextResponse.json(
    serializeBigInt({
      issuances,
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    }),
  );
}

// POST /api/admin/issuances — 아웃박스 처리. body.id가 있으면 그 건만 재시도한다.
// CHAIN_FAILED로 마감된 건은 재시도 카운터를 되돌려 다시 태운다.
export async function POST(request: NextRequest) {
  try {
    await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // 본문 없이 부르면 전체 드레인
  }
  const id = (body as { id?: unknown } | null)?.id;

  if (typeof id === "string" && id) {
    const target = await prisma.holdingIssuance.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json({ error: "발행 건을 찾을 수 없습니다." }, { status: 404 });
    }
    if (target.status === "CHAIN_FAILED") {
      await prisma.holdingIssuance.update({
        where: { id },
        data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date() },
      });
    }
    const result = await processIssuance(id);
    return NextResponse.json({ id, result });
  }

  const result = await drainIssuances();
  return NextResponse.json(result);
}

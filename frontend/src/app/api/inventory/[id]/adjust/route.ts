import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// POST /api/inventory/[id]/adjust  { delta, reason }
// 명세 5.1 재고 수동 조정. 수확·판매로 설명되지 않는 변동만 여기 남으므로 사유가 필수다.
//
// 동시 조정 대비로 읽기-쓰기를 한 트랜잭션에 묶고, 결과가 음수면 저장하지 않는다.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  let body: unknown = null;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 }); }

  const { delta, reason } = (body ?? {}) as Record<string, unknown>;
  const n = Number(delta);
  if (!Number.isInteger(n) || n === 0) {
    return NextResponse.json({ error: "조정 수량은 0이 아닌 정수여야 합니다." }, { status: 400 });
  }
  if (typeof reason !== "string" || !reason.trim()) {
    return NextResponse.json({ error: "조정 사유를 입력해주세요." }, { status: 400 });
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const inv = await tx.inventory.findUnique({ where: { id } });
      if (!inv) throw new Error("NOT_FOUND");
      const after = inv.inStock + n;
      if (after < 0) throw new Error(`NEGATIVE:${inv.inStock}`);

      await tx.stockAdjustment.create({
        data: {
          projectId: inv.projectId, productId: inv.productId, delta: n,
          beforeQty: inv.inStock, afterQty: after,
          reason: reason.trim(), adjustedBy: session.userId,
        },
      });
      return tx.inventory.update({ where: { id }, data: { inStock: after } });
    });
    return NextResponse.json({ id, inStock: updated.inStock });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NOT_FOUND") return NextResponse.json({ error: "재고 품목을 찾을 수 없습니다." }, { status: 404 });
    if (msg.startsWith("NEGATIVE:")) {
      const cur = Number(msg.split(":")[1]);
      return NextResponse.json({ error: `현재 수량 ${cur}보다 많이 차감할 수 없습니다.`, currentStock: cur }, { status: 409 });
    }
    console.error("POST /api/inventory/[id]/adjust error:", e);
    return NextResponse.json({ error: "재고 조정에 실패했습니다." }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeBigInt as serialize } from "@/lib/serialize";
import { requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { PAYOUT_CATEGORY_LABEL, type PayoutCategory } from "@/lib/payout";

// POST /api/payouts/[id]/process — 지급 처리 결과를 상태로 반영한다 (명세 2.2.1).
// body: { result: "paid" | "failed", failureReason?, evidenceUrl? }
//
// 실제 이체·온체인 전송은 하지 않는다. 이체 담당자가 지급 파일로 처리한 결과를
// 원장에 되돌려 적는 경로다. 실패 건은 재시도할 수 있어 failed → paid도 허용한다.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  try {
    const { id } = await params;
    const { result, failureReason, evidenceUrl } = await request.json();

    if (result !== "paid" && result !== "failed") {
      return NextResponse.json(
        { error: 'result must be "paid" or "failed"' },
        { status: 400 }
      );
    }
    if (result === "failed" && (typeof failureReason !== "string" || !failureReason.trim())) {
      return NextResponse.json(
        { error: "실패 처리에는 사유(failureReason)가 필요합니다" },
        { status: 400 }
      );
    }

    const payout = await prisma.payout.findUnique({
      where: { id },
      include: { project: { select: { name: true } } },
    });
    if (!payout) {
      return NextResponse.json({ error: "Payout not found" }, { status: 404 });
    }
    if (payout.status === "paid") {
      return NextResponse.json({ error: "이미 지급 완료된 건입니다" }, { status: 400 });
    }

    const now = new Date();
    // scheduled·failed인 행만 전이시킨다 — 동시 처리로 완료 건이 덮이지 않게.
    const claimed = await prisma.payout.updateMany({
      where: { id, status: { in: ["scheduled", "failed"] } },
      data:
        result === "paid"
          ? {
              status: "paid",
              paidAt: now,
              failureCode: null,
              failureReason: null,
              ...(evidenceUrl ? { evidenceUrl: String(evidenceUrl) } : {}),
            }
          : {
              status: "failed",
              // 사람이 손으로 적은 실패에는 어댑터 코드가 없다. 코드가 없으면
              // 재시도를 열지 않는다 — 원인을 모르는 채 다시 보내지 않는다.
              failureCode: null,
              failureReason: String(failureReason).trim(),
              paidAt: null,
            },
    });
    if (claimed.count === 0) {
      return NextResponse.json(
        { error: "다른 요청이 먼저 상태를 바꿨습니다" },
        { status: 409 }
      );
    }

    const label = PAYOUT_CATEGORY_LABEL[payout.category as PayoutCategory] ?? payout.category;
    await recordAudit({
      actorId: session.userId,
      actorRole: "admin",
      action: "payout.processed",
      entityType: "payout",
      entityId: id,
      projectId: payout.projectId,
      summary:
        result === "paid"
          ? `${payout.project.name} ${payout.period} ${label} 지급 완료 — ${payout.payeeName} ${Number(payout.amount).toLocaleString("ko-KR")}원`
          : `${payout.project.name} ${payout.period} ${label} 지급 실패 — ${payout.payeeName} (${String(failureReason).trim()})`,
      detail: {
        result,
        category: payout.category,
        payeeName: payout.payeeName,
        amount: Number(payout.amount),
        ...(result === "failed" ? { failureReason: String(failureReason).trim() } : {}),
      },
    });

    const updated = await prisma.payout.findUniqueOrThrow({ where: { id } });
    return NextResponse.json(serialize({ payout: updated }));
  } catch (error) {
    console.error("POST /api/payouts/[id]/process error:", error);
    return NextResponse.json({ error: "Failed to process payout" }, { status: 500 });
  }
}

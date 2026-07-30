import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeBigInt as serialize } from "@/lib/serialize";
import { requireRole } from "@/lib/auth";

// POST /api/projects/[id]/refund — 실패한 프로젝트의 잔여 에스크로를 보유 구좌 비례로 환불.
//
// ─── 왜 온체인 refund()를 부르지 않는가 (정직한 한계 표기) ───
// Escrow.refund()는 `investments[msg.sender]` 기준이라 **온체인 subscribe()를 직접 호출한
// 지갑**에게만 지급된다. 이 앱의 청약은 DB(TokenHolding)에 기록되고 투자자가 온체인
// subscribe를 호출한 적이 없어 investments[투자자] == 0 → 온체인 refund는 우리 투자자에게
// "No investment"로 revert한다. 그래서 환불 집행은 아래 DB 비례 계산이 담당하고, 컨트랙트
// refund()는 지갑으로 직접 청약한 온체인 투자자용 경로로 남겨둔다.
//
// ─── 비례 산식 (컨트랙트와 동일) ───
//   refund_i = floor(보유구좌_i × 구좌단가 × escrow.remaining / escrow.totalLocked)
// 컨트랙트는 환불 1건마다 totalLocked·remaining을 함께 줄이지만 비율 remaining/totalLocked는
// 불변이므로(수식 전개상 동일), 실패 시점 스냅샷 비율로 일괄 계산해도 결과가 같다.
// 내림(BigInt 나눗셈)에서 생기는 잔돈은 에스크로에 남고 잔액 0으로 마감하지 않는다.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  try {
    const { id } = await params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: { escrow: true, tokenHoldings: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (!project.escrow) {
      return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
    }
    if (project.status !== "failed") {
      return NextResponse.json(
        { error: "Project is not failed" },
        { status: 400 }
      );
    }
    // 멱등성: 환불은 프로젝트당 1회. escrow.status failed → refunded 전이로 잠근다.
    if (project.escrow.status === "refunded") {
      return NextResponse.json(
        { error: "Project already refunded" },
        { status: 400 }
      );
    }
    if (project.tokenPrice == null) {
      return NextResponse.json(
        { error: "Project has no token price" },
        { status: 400 }
      );
    }

    const escrow = project.escrow;
    if (escrow.totalLocked <= BigInt(0)) {
      return NextResponse.json(
        { error: "Nothing to refund" },
        { status: 400 }
      );
    }

    const tokenPrice = project.tokenPrice;
    // 구좌단가는 라운드 전체에 고정이라 holding.avgPrice == project.tokenPrice다.
    // 산식 입력은 명세대로 구좌단가를 쓴다.
    const payouts = project.tokenHoldings
      .map((h) => {
        const invested = BigInt(h.amount) * tokenPrice;
        const amount = (invested * escrow.remaining) / escrow.totalLocked; // BigInt 나눗셈 = 내림
        return { userId: h.userId, tokenAmount: h.amount, invested, amount };
      })
      .filter((p) => p.amount > BigInt(0));

    if (payouts.length === 0) {
      return NextResponse.json({ error: "Nothing to refund" }, { status: 400 });
    }

    const totalRefunded = payouts.reduce(
      (sum, p) => sum + p.amount,
      BigInt(0)
    );

    const now = new Date();

    const result = await prisma.$transaction(
      async (tx) => {
        // failed인 에스크로만 refunded로 전이. 동시 요청 중 하나만 성공한다.
        const claimed = await tx.escrow.updateMany({
          where: { id: escrow.id, status: "failed" },
          data: {
            status: "refunded",
            remaining: { decrement: totalRefunded },
          },
        });
        if (claimed.count === 0) {
          throw new Error("ALREADY_REFUNDED");
        }

        for (const p of payouts) {
          // 배당 분배(api/dividends/distribute)와 동일하게 사용자 원화 잔액에 즉시 반영.
          await tx.user.update({
            where: { id: p.userId },
            data: { balance: { increment: p.amount } },
          });

          await tx.transaction.create({
            data: {
              projectId: id,
              userId: p.userId,
              type: "refund",
              amount: p.amount,
              tokenAmount: p.tokenAmount,
              memo: `실패 전환 환불 (${p.tokenAmount.toLocaleString("ko-KR")}구좌 · 투자원금 대비 ${(
                (Number(p.amount) / Number(p.invested)) * 100
              ).toFixed(1)}%)`,
            },
          });
        }

        // TokenHolding은 남긴다 — 토큰(증권) 자체가 소각되는 게 아니라 잔여 재원만
        // 비례 반환하는 구조라서다. 재환불은 위 escrow 상태 전이가 막는다.
        return tx.escrow.findUniqueOrThrow({ where: { id: escrow.id } });
      },
      { maxWait: 5000, timeout: 15000 } // 보유자별 잔액·거래 쓰기 다수 — pooler 지연 대비
    );

    return NextResponse.json(
      serialize({
        success: true,
        escrow: result,
        totalRefunded,
        refunds: payouts,
        // 온체인 refund()는 온체인 청약자 전용이라 서버가 대신 호출할 수 없다(상단 주석).
        txHash: null,
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("ALREADY_REFUNDED")) {
      return NextResponse.json(
        { error: "Project already refunded" },
        { status: 400 }
      );
    }
    console.error("POST /api/projects/[id]/refund error:", error);
    return NextResponse.json({ error: "Failed to refund" }, { status: 500 });
  }
}

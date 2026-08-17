import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeBigInt as serialize } from "@/lib/serialize";
import { requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { calculateFeePool } from "@/lib/waterfall";

export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  try {
    const { projectId, totalRevenue, experienceRevenue, b2bIncrementalRevenue } =
      await request.json();

    if (!projectId || totalRevenue == null) {
      return NextResponse.json(
        { error: "projectId and totalRevenue are required" },
        { status: 400 }
      );
    }

    // 배당 재원은 운영자 매출이 아니라 FarmFi 수수료 풀 (기획안 v18 §2 설계 원칙 2).
    // totalRevenue는 차감 대상이 아니라 체험 수수료 추정 입력값으로만 쓰인다.
    const feePool = await calculateFeePool(projectId, totalRevenue, {
      experienceRevenue: experienceRevenue ?? undefined,
      b2bIncrementalRevenue: b2bIncrementalRevenue ?? undefined,
    });

    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { tokenHoldings: true },
    });

    const totalTokensHeld = project.tokenHoldings.reduce(
      (sum, h) => sum + h.amount,
      0
    );

    const perToken =
      totalTokensHeld > 0
        ? Math.floor(feePool.investorDividend / totalTokensHeld)
        : 0;

    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const result = await prisma.$transaction(async (tx) => {
      const dividend = await tx.dividend.create({
        data: {
          projectId,
          totalRevenue: BigInt(Math.floor(totalRevenue)),
          totalDividend: BigInt(Math.floor(feePool.investorDividend)),
          perToken: BigInt(perToken),
          period,
        },
      });

      // 토큰 보유자별 배당 — 데모에서는 자동 클레임 (잔액 즉시 반영)
      for (const holding of project.tokenHoldings) {
        const claimAmount = BigInt(perToken) * BigInt(holding.amount);
        await tx.dividendClaim.create({
          data: {
            dividendId: dividend.id,
            userId: holding.userId,
            tokenAmount: holding.amount,
            claimAmount,
            claimed: true,
            claimedAt: now,
          },
        });

        await tx.user.update({
          where: { id: holding.userId },
          data: { balance: { increment: claimAmount } },
        });

        await tx.transaction.create({
          data: {
            projectId,
            userId: holding.userId,
            type: "dividend",
            amount: claimAmount,
            tokenAmount: holding.amount,
            memo: `${period} 배당 (${holding.amount} 토큰)`,
          },
        });
      }

      return dividend;
    }, { maxWait: 5000, timeout: 15000 }); // 보유자별 배당 쿼리 다수 — pooler 지연 대비 기본 5s 확장

    await recordAudit({
      actorId: session.userId,
      actorRole: "admin",
      action: "dividend.distributed",
      entityType: "dividend",
      entityId: result.id,
      projectId,
      summary: `${period} 배당 분배 — 총 ${feePool.investorDividend.toLocaleString("ko-KR")}원, 구좌당 ${perToken.toLocaleString("ko-KR")}원 (보유자 ${project.tokenHoldings.length}명)`,
      detail: {
        period,
        perToken,
        totalDividend: feePool.investorDividend,
        holders: project.tokenHoldings.length,
      },
    });

    return NextResponse.json(
      serialize({
        feePool,
        dividend: result,
        txHash: null,
      })
    );
  } catch (error) {
    console.error("POST /api/dividends/distribute error:", error);
    return NextResponse.json(
      { error: "Failed to distribute dividends" },
      { status: 500 }
    );
  }
}

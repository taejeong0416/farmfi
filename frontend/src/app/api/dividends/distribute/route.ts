import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { calculateWaterfall } from "@/lib/waterfall";

function serialize(obj: any): any {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}

export async function POST(request: NextRequest) {
  try {
    await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  try {
    const { projectId, totalRevenue } = await request.json();

    if (!projectId || totalRevenue == null) {
      return NextResponse.json(
        { error: "projectId and totalRevenue are required" },
        { status: 400 }
      );
    }

    const waterfall = await calculateWaterfall(projectId, totalRevenue);

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
        ? Math.floor(waterfall.investorDividend / totalTokensHeld)
        : 0;

    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const result = await prisma.$transaction(async (tx) => {
      const dividend = await tx.dividend.create({
        data: {
          projectId,
          totalRevenue: BigInt(Math.floor(totalRevenue)),
          totalDividend: BigInt(Math.floor(waterfall.investorDividend)),
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
    });

    return NextResponse.json(
      serialize({
        waterfall,
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

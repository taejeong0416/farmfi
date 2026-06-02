import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateWaterfall } from "@/lib/waterfall";

function serialize(obj: any): any {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}

export async function POST(request: NextRequest) {
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

      // Update partner recovered amount
      if (waterfall.partnerRecovery > 0) {
        const partner = await tx.projectPartner.findFirst({
          where: { projectId, role: "equipment_partner" },
        });

        if (partner) {
          const newRecovered =
            Number(partner.recoveredAmount) + waterfall.partnerRecovery;
          const recoveryComplete =
            newRecovered >= Number(partner.totalContribution);

          await tx.projectPartner.update({
            where: { id: partner.id },
            data: {
              recoveredAmount: BigInt(Math.floor(newRecovered)),
              recoveryComplete,
            },
          });
        }
      }

      // Create dividend claims for each token holder
      for (const holding of project.tokenHoldings) {
        const claimAmount = BigInt(perToken) * BigInt(holding.amount);
        await tx.dividendClaim.create({
          data: {
            dividendId: dividend.id,
            userId: holding.userId,
            tokenAmount: holding.amount,
            claimAmount,
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

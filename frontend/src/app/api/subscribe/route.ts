import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function serializeBigInt(obj: any): any {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}

export async function POST(request: NextRequest) {
  try {
    const { userId, projectId, tokenAmount } = await request.json();

    if (!userId || !projectId || !tokenAmount || tokenAmount <= 0) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const [user, project] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.project.findUnique({
        where: { id: projectId },
        include: { escrow: true },
      }),
    ]);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }
    if (!project.escrow) {
      return NextResponse.json(
        { error: "Project escrow not found" },
        { status: 404 }
      );
    }

    const totalCost = BigInt(tokenAmount) * project.tokenPrice;

    if (user.balance < totalCost) {
      return NextResponse.json(
        { error: "Insufficient balance" },
        { status: 400 }
      );
    }

    if (project.soldTokens + tokenAmount > project.totalTokens) {
      return NextResponse.json(
        { error: "Not enough tokens available" },
        { status: 400 }
      );
    }

    // Look up existing holding for avgPrice calculation
    const existingHolding = await prisma.tokenHolding.findUnique({
      where: { userId_projectId: { userId, projectId } },
    });

    const newAvgPrice = existingHolding
      ? (existingHolding.avgPrice * BigInt(existingHolding.amount) + totalCost) /
        BigInt(existingHolding.amount + tokenAmount)
      : project.tokenPrice;

    const newCurrentAmount = project.currentAmount + totalCost;
    const isFunded = newCurrentAmount >= project.targetAmount;

    const transaction = await prisma.$transaction(async (tx) => {
      // 1. Deduct user balance
      await tx.user.update({
        where: { id: userId },
        data: { balance: { decrement: totalCost } },
      });

      // 2. Update project
      await tx.project.update({
        where: { id: projectId },
        data: {
          soldTokens: { increment: tokenAmount },
          currentAmount: { increment: totalCost },
          ...(isFunded ? { status: "funded" } : {}),
        },
      });

      // 3. Update escrow
      await tx.escrow.update({
        where: { id: project.escrow!.id },
        data: {
          totalLocked: { increment: totalCost },
          remaining: { increment: totalCost },
        },
      });

      // 4. Upsert token holding
      await tx.tokenHolding.upsert({
        where: { userId_projectId: { userId, projectId } },
        create: {
          userId,
          projectId,
          amount: tokenAmount,
          avgPrice: project.tokenPrice,
        },
        update: {
          amount: { increment: tokenAmount },
          avgPrice: newAvgPrice,
        },
      });

      // 5. Create transaction record
      const txRecord = await tx.transaction.create({
        data: {
          projectId,
          userId,
          type: "subscription",
          amount: totalCost,
          tokenAmount,
          memo: `Subscribed ${tokenAmount} tokens`,
        },
      });

      return txRecord;
    });

    return NextResponse.json({
      success: true,
      transaction: serializeBigInt({
        txHash: null,
        amount: transaction.amount,
        tokenAmount: transaction.tokenAmount,
      }),
    });
  } catch (error) {
    console.error("POST /api/subscribe error:", error);
    return NextResponse.json(
      { error: "Subscription failed" },
      { status: 500 }
    );
  }
}

import { prisma } from "@/lib/db";

// 청약 핵심 로직 (잔액·재고 검증 → DB 트랜잭션).
// - /api/subscribe: 세션 유저로 호출 (본인인증·연간한도 게이트 포함)
// - /api/demo/step: 시드 투자자로 직접 호출 (신뢰된 서버 내부 경로, HTTP self-fetch 제거)
// error 문자열은 프론트(SubscribeForm)가 한국어로 번역하는 키이므로 임의 변경 금지.

export type SubscriptionResult =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      transaction: { txHash: string | null; amount: bigint; tokenAmount: number };
    };

export async function executeSubscription(params: {
  userId: string;
  projectId: string;
  tokenAmount: number;
  // 연간 투자한도(원). null/undefined면 한도 검사 생략 (데모 경로).
  annualLimit?: bigint | null;
}): Promise<SubscriptionResult> {
  const { userId, projectId, tokenAmount, annualLimit } = params;

  const [user, project] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.project.findUnique({
      where: { id: projectId },
      include: { escrow: true },
    }),
  ]);

  if (!user) {
    return { ok: false, status: 404, error: "User not found" };
  }
  if (!project) {
    return { ok: false, status: 404, error: "Project not found" };
  }
  if (!project.escrow) {
    return { ok: false, status: 404, error: "Project escrow not found" };
  }

  // 펀딩 설정(토큰가·발행량·목표액)이 없는 운영 전용 지점은 청약 불가.
  const { tokenPrice, totalTokens, targetAmount } = project;
  if (tokenPrice == null || totalTokens == null || targetAmount == null) {
    return { ok: false, status: 400, error: "Project is not open for funding" };
  }

  const totalCost = BigInt(tokenAmount) * tokenPrice;

  if (user.balance < totalCost) {
    return { ok: false, status: 400, error: "Insufficient balance" };
  }

  if (project.soldTokens + tokenAmount > totalTokens) {
    return { ok: false, status: 400, error: "Not enough tokens available" };
  }

  // 연간 투자한도: 올해 청약 누적액 + 이번 금액이 한도를 넘으면 거절
  // (자본시장법 룰엔진 investor-limit.ts가 산출해 User에 저장한 값을 집행).
  if (annualLimit != null) {
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);
    const agg = await prisma.transaction.aggregate({
      _sum: { amount: true },
      where: {
        userId,
        type: "subscription",
        createdAt: { gte: startOfYear },
      },
    });
    const yearInvested = agg._sum.amount ?? BigInt(0);
    if (yearInvested + totalCost > annualLimit) {
      return { ok: false, status: 400, error: "Annual investment limit exceeded" };
    }
  }

  // Look up existing holding for avgPrice calculation
  const existingHolding = await prisma.tokenHolding.findUnique({
    where: { userId_projectId: { userId, projectId } },
  });

  const newAvgPrice = existingHolding
    ? (existingHolding.avgPrice * BigInt(existingHolding.amount) + totalCost) /
      BigInt(existingHolding.amount + tokenAmount)
    : tokenPrice;

  const newCurrentAmount = project.currentAmount + totalCost;
  const isFunded = newCurrentAmount >= targetAmount;

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
        avgPrice: tokenPrice,
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

  return {
    ok: true,
    transaction: {
      txHash: transaction.txHash,
      amount: transaction.amount,
      tokenAmount: transaction.tokenAmount ?? tokenAmount,
    },
  };
}

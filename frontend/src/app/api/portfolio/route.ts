import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeBigInt as serialize } from "@/lib/serialize";
import { getServerSession } from "@/lib/auth";
import { calculateNAV } from "@/lib/nav-calculator";

// GET /api/portfolio — 로그인한 유저의 포트폴리오 집계 (보유 토큰 · 배당 · 거래내역).
// userId는 반드시 세션(JWT)에서만 읽는다 — 클라이언트가 보내는 값은 절대 신뢰하지 않음 (IDOR 방지).
export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.userId;

    const [holdings, dividendClaims, transactions] = await Promise.all([
      prisma.tokenHolding.findMany({
        where: { userId },
        include: { project: true },
      }),
      prisma.dividendClaim.findMany({
        where: { userId },
        include: { dividend: { include: { project: true } } },
        orderBy: { dividend: { createdAt: "desc" } },
      }),
      prisma.transaction.findMany({
        where: { userId },
        include: { project: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    // 프로젝트별 현재 NAV (좌당) — nav-calculator.ts 재사용, 프로젝트당 1회만 계산.
    const navByProject = new Map<string, number>();
    await Promise.all(
      holdings.map(async (h) => {
        if (navByProject.has(h.projectId)) return;
        const nav = await calculateNAV(h.projectId);
        navByProject.set(h.projectId, nav.nav);
      })
    );

    // 프로젝트별 누적 수령 배당액 (원금 회수 진행률 계산용).
    const dividendByProject = new Map<string, bigint>();
    for (const claim of dividendClaims) {
      const projectId = claim.dividend.projectId;
      dividendByProject.set(
        projectId,
        (dividendByProject.get(projectId) ?? BigInt(0)) + claim.claimAmount
      );
    }

    const holdingsOut = holdings.map((h) => {
      const investedAmount = h.avgPrice * BigInt(h.amount);
      const investedNum = Number(investedAmount);
      const currentNav = navByProject.get(h.projectId) ?? 0;
      const currentValue = currentNav * h.amount;
      const dividendReceived = Number(
        dividendByProject.get(h.projectId) ?? BigInt(0)
      );
      const profitLoss = currentValue - investedNum;
      const profitLossPercent =
        investedNum > 0 ? (profitLoss / investedNum) * 100 : 0;
      const recoveryPercent =
        investedNum > 0 ? (dividendReceived / investedNum) * 100 : 0;

      return {
        projectId: h.projectId,
        projectName: h.project.name,
        tokenSymbol: h.project.tokenSymbol,
        projectStatus: h.project.status,
        imageUrl: h.project.imageUrl,
        tokenAmount: h.amount,
        avgPrice: h.avgPrice,
        investedAmount,
        currentNav,
        currentValue,
        profitLoss,
        profitLossPercent,
        dividendReceived,
        recoveryPercent,
      };
    });

    const totalInvested = holdingsOut.reduce(
      (sum, h) => sum + Number(h.investedAmount),
      0
    );
    const totalCurrentValue = holdingsOut.reduce(
      (sum, h) => sum + h.currentValue,
      0
    );
    const totalProfitLoss = totalCurrentValue - totalInvested;
    const totalProfitLossPercent =
      totalInvested > 0 ? (totalProfitLoss / totalInvested) * 100 : 0;
    const totalDividendReceived = dividendClaims.reduce(
      (sum, c) => sum + c.claimAmount,
      BigInt(0)
    );

    const dividendsOut = dividendClaims.map((c) => ({
      id: c.id,
      projectId: c.dividend.projectId,
      projectName: c.dividend.project.name,
      period: c.dividend.period,
      perToken: c.dividend.perToken,
      tokenAmount: c.tokenAmount,
      claimAmount: c.claimAmount,
      claimed: c.claimed,
      claimedAt: c.claimedAt,
    }));

    const transactionsOut = transactions.map((t) => ({
      id: t.id,
      projectId: t.projectId,
      projectName: t.project.name,
      type: t.type,
      amount: t.amount,
      tokenAmount: t.tokenAmount,
      txHash: t.txHash,
      createdAt: t.createdAt,
    }));

    return NextResponse.json(
      serialize({
        summary: {
          totalInvested,
          totalCurrentValue,
          totalProfitLoss,
          totalProfitLossPercent,
          totalDividendReceived,
        },
        holdings: holdingsOut,
        dividends: dividendsOut,
        transactions: transactionsOut,
      })
    );
  } catch (error) {
    console.error("GET /api/portfolio error:", error);
    return NextResponse.json(
      { error: "Failed to fetch portfolio data" },
      { status: 500 }
    );
  }
}

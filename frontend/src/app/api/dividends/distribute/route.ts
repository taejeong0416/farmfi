import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeBigInt as serialize } from "@/lib/serialize";
import { requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { calculateSettlement } from "@/lib/waterfall";

export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  try {
    const { projectId, period: periodInput, unitsSold } =
      await request.json();

    if (!projectId) {
      return NextResponse.json({ error: "projectId가 필요합니다." }, { status: 400 });
    }

    const now = new Date();
    const period =
      typeof periodInput === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(periodInput)
        ? periodInput
        : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // 인수 기준: "관리자가 매출·비용을 확정해야 정산 계산이 돈다. 확정 전 값은
    // 계산에 들어가지 않는다." 매출을 요청 본문에서 받으면 이 문장이 성립하지
    // 않는다 — 부르는 쪽이 숫자를 정하게 된다. 확정된 기간 기록에서만 읽는다.
    const record = await prisma.periodRecord.findUnique({
      where: { projectId_period: { projectId, period } },
    });
    if (!record) {
      return NextResponse.json(
        { error: `${period} 매출·비용이 입력되지 않았습니다. 매출·비용 입력(A-16)에서 먼저 저장해 주세요.` },
        { status: 400 }
      );
    }
    if (record.status !== "confirmed") {
      return NextResponse.json(
        { error: `${period} 매출·비용이 확정되지 않았습니다. 확정해야 정산이 돕니다.` },
        { status: 400 }
      );
    }

    // 같은 기간을 두 번 분배하면 회수금이 이중 지급된다.
    const already = await prisma.dividend.findFirst({
      where: { projectId, period },
      select: { id: true },
    });
    if (already) {
      return NextResponse.json(
        { error: `${period}은 이미 분배됐습니다.` },
        { status: 409 }
      );
    }

    const totalRevenue = Number(record.revenue);

    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { tokenHoldings: true },
    });

    const totalTokensHeld = project.tokenHoldings.reduce(
      (sum, h) => sum + h.amount,
      0
    );
    // 투자 원금 = 보유 구좌 × 구좌 단가. 투자안이 정하는 회수액의 근거다.
    const investedPrincipal = totalTokensHeld * Number(project.tokenPrice ?? 0);

    // 배분 재원은 매출에서 월 비용을 뺀 이익이고, 배분액은 투자안이 정한 회수액이다
    // (기획 0826 슬라이드 38·36·37). 이익이 모자라면 있는 만큼만 나간다.
    const settlement = await calculateSettlement(projectId, totalRevenue, {
      unitsSold: unitsSold ?? undefined,
      investedPrincipal,
    });

    const perToken =
      totalTokensHeld > 0
        ? Math.floor(settlement.investorPayout / totalTokensHeld)
        : 0;

    const result = await prisma.$transaction(async (tx) => {
      const dividend = await tx.dividend.create({
        data: {
          projectId,
          totalRevenue: BigInt(Math.floor(totalRevenue)),
          totalDividend: BigInt(Math.floor(settlement.investorPayout)),
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
            memo: `${period} 회수금 (${holding.amount} 구좌)`,
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
      summary: `${period} 회수금 분배 — 총 ${settlement.investorPayout.toLocaleString("ko-KR")}원, 구좌당 ${perToken.toLocaleString("ko-KR")}원 (보유자 ${project.tokenHoldings.length}명)`,
      detail: {
        period,
        perToken,
        totalDividend: settlement.investorPayout,
        holders: project.tokenHoldings.length,
      },
    });

    return NextResponse.json(
      serialize({
        settlement,
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

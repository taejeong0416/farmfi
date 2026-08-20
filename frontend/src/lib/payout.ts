// 지급 원장 산출 (명세 2.2 / 2.2.1)
//
// 범위: 실제 계좌이체·온체인 전송은 하지 않는다. 기간 정산 결과를 "지급 예정" 건으로
// 등록하고 상태(예정/완료/실패)와 증빙만 관리한다. 잔액(User.balance)은 건드리지 않는다 —
// 배당의 즉시 지급은 /api/dividends/distribute가 담당하고, 이 원장은 그와 별개로
// 지급 사무(누구에게 얼마를 언제 보냈나)를 추적한다.

import { prisma } from "@/lib/db";
import { calculateFeePool } from "@/lib/waterfall";

export const PAYOUT_CATEGORIES = ["dividend", "landlord_rent", "operator_settlement"] as const;
export type PayoutCategory = (typeof PAYOUT_CATEGORIES)[number];

export const PAYOUT_CATEGORY_LABEL: Record<PayoutCategory, string> = {
  dividend: "투자자 회수금",
  landlord_rent: "건물주 임대료",
  operator_settlement: "운영자 정산",
};

export const PAYOUT_STATUSES = ["scheduled", "paid", "failed"] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

/** YYYY-MM 형식 검사 + 해당 월의 [시작, 다음달 시작) 경계 산출. */
export function parsePeriod(
  period: string
): { ok: true; start: Date; end: Date } | { ok: false } {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return { ok: false };
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return { ok: false };
  return {
    ok: true,
    start: new Date(year, month - 1, 1),
    end: new Date(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1),
  };
}

export interface PayoutLine {
  category: PayoutCategory;
  payeeUserId: string | null;
  payeeName: string;
  amount: bigint;
  memo: string;
}

export interface PayoutPlan {
  period: string;
  operatorRevenue: number;
  operatorRevenueMeasured: boolean;
  feePool: Awaited<ReturnType<typeof calculateFeePool>>;
  perToken: number;
  lines: PayoutLine[];
  total: bigint;
}

/**
 * 한 프로젝트의 한 달 지급 계획을 계산한다 (등록은 하지 않는다).
 *
 * @param projectId 대상 지점
 * @param period YYYY-MM
 * @param actuals 매출 실측치. operatorRevenue를 넘기지 않으면 SalesRecord 합계를 쓴다.
 */
export async function buildPayoutPlan(
  projectId: string,
  period: string,
  actuals?: {
    operatorRevenue?: number;
    experienceRevenue?: number;
    b2bIncrementalRevenue?: number;
  }
): Promise<PayoutPlan> {
  const parsed = parsePeriod(period);
  if (!parsed.ok) throw new Error("INVALID_PERIOD");

  const [project, partners, holdings, sales] = await Promise.all([
    prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { id: true, name: true, operatorId: true, operator: { select: { name: true } } },
    }),
    prisma.projectPartner.findMany({ where: { projectId, role: "landlord" } }),
    prisma.tokenHolding.findMany({
      where: { projectId },
      include: { user: { select: { name: true } } },
    }),
    prisma.salesRecord.aggregate({
      where: { projectId, soldAt: { gte: parsed.start, lt: parsed.end } },
      _sum: { amount: true },
    }),
  ]);

  const measuredRevenue = sales._sum.amount ?? 0;
  const operatorRevenueMeasured = actuals?.operatorRevenue == null;
  const operatorRevenue = operatorRevenueMeasured
    ? measuredRevenue
    : Math.max(0, actuals!.operatorRevenue!);

  const feePool = await calculateFeePool(projectId, operatorRevenue, {
    experienceRevenue: actuals?.experienceRevenue,
    b2bIncrementalRevenue: actuals?.b2bIncrementalRevenue,
  });

  const totalTokensHeld = holdings.reduce((sum, h) => sum + h.amount, 0);
  const perToken =
    totalTokensHeld > 0 ? Math.floor(feePool.investorDividend / totalTokensHeld) : 0;

  const lines: PayoutLine[] = [];

  // ① 투자자 배당 — 보유 구좌 비례. 내림에서 남는 잔돈은 배분하지 않는다.
  for (const h of holdings) {
    const amount = BigInt(perToken) * BigInt(h.amount);
    if (amount <= BigInt(0)) continue;
    lines.push({
      category: "dividend",
      payeeUserId: h.userId,
      payeeName: h.user.name,
      amount,
      memo: `${h.amount.toLocaleString("ko-KR")}구좌 × 구좌당 ${perToken.toLocaleString("ko-KR")}원`,
    });
  }

  // ② 건물주 임대료 — 월 고정. 매출과 무관하게 지급한다.
  const rentTotal = partners.reduce((sum, p) => sum + p.monthlyRecoveryAmount, BigInt(0));
  for (const p of partners) {
    if (p.monthlyRecoveryAmount <= BigInt(0)) continue;
    lines.push({
      category: "landlord_rent",
      payeeUserId: p.userId,
      payeeName: p.name,
      amount: p.monthlyRecoveryAmount,
      memo: `${period} 월 고정 임대료`,
    });
  }

  // ③ 운영자 정산 — 운영자는 매출을 직접 보유하고 이용료·임대료를 지불한다(v18 설계 원칙 2).
  // 여기 등록하는 금액은 그 차액(운영자가 최종적으로 손에 쥐는 몫)이고, 음수 구간은
  // 0으로 눕히되 원값을 memo에 남긴다 — 지급 원장에 마이너스 지급 건은 의미가 없다.
  if (project.operatorId) {
    const net = BigInt(Math.round(operatorRevenue)) - BigInt(feePool.platformUsageFee) - rentTotal;
    lines.push({
      category: "operator_settlement",
      payeeUserId: project.operatorId,
      payeeName: project.operator?.name ?? "운영자",
      amount: net > BigInt(0) ? net : BigInt(0),
      memo:
        `매출 ${Math.round(operatorRevenue).toLocaleString("ko-KR")}` +
        ` − 이용료 ${feePool.platformUsageFee.toLocaleString("ko-KR")}` +
        ` − 임대료 ${Number(rentTotal).toLocaleString("ko-KR")}` +
        ` = ${Number(net).toLocaleString("ko-KR")}원`,
    });
  }

  return {
    period,
    operatorRevenue,
    operatorRevenueMeasured,
    feePool,
    perToken,
    lines,
    total: lines.reduce((sum, l) => sum + l.amount, BigInt(0)),
  };
}

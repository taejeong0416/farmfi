// 지급 원장 산출 (명세 2.2 / 2.2.1)
//
// 범위: 실제 계좌이체·온체인 전송은 하지 않는다. 기간 정산 결과를 "지급 예정" 건으로
// 등록하고 상태(예정/완료/실패)와 증빙만 관리한다. 잔액(User.balance)은 건드리지 않는다 —
// 배당의 즉시 지급은 /api/dividends/distribute가 담당하고, 이 원장은 그와 별개로
// 지급 사무(누구에게 얼마를 언제 보냈나)를 추적한다.

import { prisma } from "@/lib/db";
import { resolveConfirmedRecord } from "@/lib/period-record";
import { calculateFeePool } from "@/lib/waterfall";

export const PAYOUT_CATEGORIES = ["dividend", "landlord_rent", "operator_settlement"] as const;
export type PayoutCategory = (typeof PAYOUT_CATEGORIES)[number];

export const PAYOUT_CATEGORY_LABEL: Record<PayoutCategory, string> = {
  dividend: "투자자 회수금",
  landlord_rent: "건물주 임대료",
  operator_settlement: "운영자 정산",
};

// processing = 어댑터에 이체를 넘긴 상태. 이 값이 있어야 동시 요청 둘이 같은 건을
// 두 번 보내는 것을 상태 전이로 막을 수 있다.
export const PAYOUT_STATUSES = ["scheduled", "processing", "paid", "failed"] as const;
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
  /** 매출을 판매 기록 합계에서 가져왔는지 (false면 확정 입력값 또는 호출자 주입) */
  operatorRevenueMeasured: boolean;
  /** 확정된 기간 입력값(`PeriodRecord`)을 반영했는지 */
  recordConfirmed: boolean;
  /** 확정 입력값의 운영 비용 합계. 운영자 정산 몫에서만 차감한다. */
  operatingCost: number;
  feePool: Awaited<ReturnType<typeof calculateFeePool>>;
  perToken: number;
  lines: PayoutLine[];
  total: bigint;
}

/**
 * 한 프로젝트의 한 달 지급 계획을 계산한다 (등록은 하지 않는다).
 *
 * 매출의 출처는 세 단계다: 호출자가 넘긴 actuals → 확정된 기간 입력값
 * (`PeriodRecord`, 명세 2.1) → 판매 기록 합계. 확정되지 않은 입력값은 읽지 않는다.
 * 운영 비용은 확정 입력값에서만 오고, 운영자 정산 줄에서만 빠진다.
 *
 * @param projectId 대상 지점
 * @param period YYYY-MM
 * @param actuals 매출 실측치. 넘긴 값이 확정 입력값보다 우선한다.
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

  const [project, partners, holdings, sales, record] = await Promise.all([
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
    resolveConfirmedRecord(projectId, period),
  ]);

  const measuredRevenue = sales._sum.amount ?? 0;
  const inputRevenue = actuals?.operatorRevenue ?? record?.revenue ?? null;
  const operatorRevenueMeasured = inputRevenue == null;
  const operatorRevenue = operatorRevenueMeasured
    ? measuredRevenue
    : Math.max(0, inputRevenue);
  const operatingCost = record?.totalCost ?? 0;

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

  // ③ 운영자 정산 — 운영자는 매출을 직접 보유하고 이용료·임대료·운영비를 지불한다
  // (v18 설계 원칙 2). 여기 등록하는 금액은 그 차액(운영자가 최종적으로 손에 쥐는 몫)이고,
  // 음수 구간은 0으로 눕히되 원값을 memo에 남긴다 — 지급 원장에 마이너스 지급 건은 의미가 없다.
  // 운영비는 확정된 기간 입력값에서만 온다. 투자자 회수금은 이 비용에 영향받지 않는다.
  if (project.operatorId) {
    const net =
      BigInt(Math.round(operatorRevenue)) -
      BigInt(feePool.platformUsageFee) -
      rentTotal -
      BigInt(operatingCost);
    lines.push({
      category: "operator_settlement",
      payeeUserId: project.operatorId,
      payeeName: project.operator?.name ?? "운영자",
      amount: net > BigInt(0) ? net : BigInt(0),
      memo:
        `매출 ${Math.round(operatorRevenue).toLocaleString("ko-KR")}` +
        ` − 이용료 ${feePool.platformUsageFee.toLocaleString("ko-KR")}` +
        ` − 임대료 ${Number(rentTotal).toLocaleString("ko-KR")}` +
        (operatingCost > 0 ? ` − 운영비 ${operatingCost.toLocaleString("ko-KR")}` : "") +
        ` = ${Number(net).toLocaleString("ko-KR")}원`,
    });
  }

  return {
    period,
    operatorRevenue,
    operatorRevenueMeasured,
    recordConfirmed: record != null,
    operatingCost,
    feePool,
    perToken,
    lines,
    total: lines.reduce((sum, l) => sum + l.amount, BigInt(0)),
  };
}

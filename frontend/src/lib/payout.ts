// 지급 원장 산출 (명세 2.2 / 2.2.1)
//
// 범위: 실제 계좌이체·온체인 전송은 하지 않는다. 기간 정산 결과를 "지급 예정" 건으로
// 등록하고 상태(예정/완료/실패)와 증빙만 관리한다. 잔액(User.balance)은 건드리지 않는다 —
// 배당의 즉시 지급은 /api/dividends/distribute가 담당하고, 이 원장은 그와 별개로
// 지급 사무(누구에게 얼마를 언제 보냈나)를 추적한다.

import { prisma } from "@/lib/db";
import { resolveConfirmedRecord } from "@/lib/period-record";
import { calculateSettlement } from "@/lib/waterfall";

// equipment_tranche만 성격이 다르다. 나머지 셋은 기간 정산(POST /api/payouts)이
// 만드는 월 단위 지급이고, 이것은 마일스톤이 집행될 때 그 자리에서 한 건씩 생긴다
// (POST /api/milestones/[id]/complete). 조성자금이 운영자를 거치지 않고 설비업체
// 계좌로 곧장 간다는 것을 원장에 남기는 것이 목적이다.
export const PAYOUT_CATEGORIES = [
  "dividend",
  "landlord_rent",
  "operator_settlement",
  "equipment_tranche",
] as const;
export type PayoutCategory = (typeof PAYOUT_CATEGORIES)[number];

export const PAYOUT_CATEGORY_LABEL: Record<PayoutCategory, string> = {
  dividend: "투자자 회수금",
  landlord_rent: "건물주 임대료",
  operator_settlement: "운영자 정산",
  equipment_tranche: "설비업체 집행",
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
  settlement: Awaited<ReturnType<typeof calculateSettlement>>;
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
      select: {
        id: true, name: true, operatorId: true, tokenPrice: true,
        operator: { select: { name: true } },
      },
    }),
    prisma.projectPartner.findMany({ where: { projectId, role: "landlord" } }),
    prisma.tokenHolding.findMany({
      where: { projectId },
      include: { user: { select: { name: true } } },
    }),
    prisma.salesRecord.aggregate({
      where: { projectId, soldAt: { gte: parsed.start, lt: parsed.end } },
      // 수량은 팩당 변동비 산출에 쓴다. 취소·환불이 음수로 들어와 순판매가 된다.
      _sum: { amount: true, quantity: true },
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

  const totalTokensHeld = holdings.reduce((sum, h) => sum + h.amount, 0);
  // 투자 원금 = 보유 구좌 × 구좌 단가. 회수액이 여기서 나온다.
  const investedPrincipal = totalTokensHeld * Number(project.tokenPrice ?? 0);

  const settlement = await calculateSettlement(projectId, operatorRevenue, {
    unitsSold: sales._sum.quantity ?? 0,
    investedPrincipal,
  });

  // 배분액은 남은 이익을 나누는 게 아니라 투자안이 정한 회수액이다(기획 0826 §36·37).
  // 이익이 모자라면 있는 만큼만 나가고 부족분은 recoveryShortfall로 남는다.
  const perToken =
    totalTokensHeld > 0 ? Math.floor(settlement.investorPayout / totalTokensHeld) : 0;

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

  // ③ 운영자 정산 — 두 몫을 합친다.
  //   · 운영자 보수: 월 비용에 이미 잡혀 있는 고정 몫(기획 0826 슬라이드 38)
  //   · 배분 후 잔여: 투자자 회수액을 채우고 남은 이익. 매장에 남는다.
  // 임대료는 여기서 뺀다 — 건물주에게 따로 지급되는 돈이라 이중 계상을 막는다.
  // 음수 구간은 0으로 눕히되 원값을 memo에 남긴다. 마이너스 지급 건은 원장에서 의미가 없다.
  if (project.operatorId) {
    const net =
      BigInt(settlement.operatorPay) +
      BigInt(Math.round(settlement.storeRetained)) -
      rentTotal;
    lines.push({
      category: "operator_settlement",
      payeeUserId: project.operatorId,
      payeeName: project.operator?.name ?? "운영자",
      amount: net > BigInt(0) ? net : BigInt(0),
      memo:
        `보수 ${settlement.operatorPay.toLocaleString("ko-KR")}` +
        ` + 배분 후 잔여 ${Math.round(settlement.storeRetained).toLocaleString("ko-KR")}` +
        (rentTotal > BigInt(0) ? ` − 임대료 ${Number(rentTotal).toLocaleString("ko-KR")}` : "") +
        ` = ${Number(net).toLocaleString("ko-KR")}원`,
    });
  }

  return {
    period,
    operatorRevenue,
    operatorRevenueMeasured,
    recordConfirmed: record != null,
    operatingCost,
    settlement,
    perToken,
    lines,
    total: lines.reduce((sum, l) => sum + l.amount, BigInt(0)),
  };
}

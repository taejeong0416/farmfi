/**
 * 회수 조건 계산.
 *
 * 투자자가 상세 화면에서 물어보는 것은 "얼마를 언제 돌려받나"인데, 답은 하나가 아니라
 * 판매량의 함수다. 목표 회수율 115%는 특정 판매량을 가정했을 때의 숫자이므로,
 * 화면은 그 가정을 숨기지 않고 조작 가능한 값으로 보여준다. 여기가 그 계산이다.
 *
 * 비용 항목과 순서는 SettlementRule의 정의를 그대로 따른다 —
 * 매출에서 변동비·결제수수료·고정비를 뺀 나머지가 투자자 배분 재원이다.
 */

import type { SettlementRule } from "@/components/screens/api";

/**
 * 사업계획 기준 팩 평균 단가(원). Product.unitPrice가 품목별로 3,000~4,000원이라
 * 그 중간값을 쓴다. 지점마다 취급 품목이 달라 실제 객단가는 달라질 수 있다.
 */
export const PLAN_PACK_PRICE = 3_500;

/** 한 달을 30일로 본다. 일 판매량에서 월 판매량을 낼 때만 쓴다. */
const DAYS_PER_MONTH = 30;

/**
 * 회수 기간의 상한(개월). SettlementRule.recoveryMonths가 기준이고, 실적이 안 나오면
 * 여기까지 연장한다. 이 기간 안에 목표에 못 닿으면 원금 미달로 끝난다.
 */
export const MAX_RECOVERY_MONTHS = 36;

/** 매출에 비례하지 않고 매달 그대로 나가는 비용의 합. */
function monthlyFixedCost(rule: SettlementRule): number {
  return (
    rule.operatorPay + rule.facilityCost + rule.unitUpkeepCost + rule.platformFee
  );
}

/** 팩 하나를 팔았을 때 고정비 회수에 쓸 수 있는 금액. */
function contributionPerPack(rule: SettlementRule): number {
  return (
    PLAN_PACK_PRICE -
    rule.unitVariableCost -
    PLAN_PACK_PRICE * rule.paymentFeeRate
  );
}

export type MonthlyBreakdown = {
  revenue: number;
  variableCost: number;
  paymentFee: number;
  fixedCost: number;
  /** 투자자에게 나눠줄 수 있는 돈. 고정비를 못 채우면 0이다(음수로 두지 않는다). */
  pool: number;
};

/** 일 판매량 하나로 그 달의 매출·비용·배분 재원을 전부 낸다. */
export function monthlyBreakdown(
  dailyPacks: number,
  rule: SettlementRule,
): MonthlyBreakdown {
  const packs = dailyPacks * DAYS_PER_MONTH;
  const revenue = packs * PLAN_PACK_PRICE;
  const variableCost = packs * rule.unitVariableCost;
  const paymentFee = revenue * rule.paymentFeeRate;
  const fixedCost = monthlyFixedCost(rule);
  return {
    revenue,
    variableCost,
    paymentFee,
    fixedCost,
    pool: Math.max(0, revenue - variableCost - paymentFee - fixedCost),
  };
}

/** 배분 재원이 0원이 되는 일 판매량. 이 아래로 팔리면 그 달 배분은 없다. */
export function breakEvenPacks(rule: SettlementRule): number {
  const perPack = contributionPerPack(rule);
  if (perPack <= 0) return Infinity;
  return Math.ceil(monthlyFixedCost(rule) / (perPack * DAYS_PER_MONTH));
}

/**
 * 목표 회수액을 정해진 개월 안에 채우려면 하루 몇 팩을 팔아야 하는지.
 * 화면의 기준 시나리오는 이 함수로 프로젝트의 `paybackMonths`에서 역산한다 —
 * 판매량을 상수로 박아두면 지점마다 다른 사업계획을 한 숫자로 덮게 된다.
 */
export function packsForMonths(
  rule: SettlementRule,
  targetRecovery: number,
  months: number,
): number {
  const perPack = contributionPerPack(rule);
  if (perPack <= 0 || months <= 0) return Infinity;
  const poolNeeded = targetRecovery / months;
  return Math.ceil(
    (poolNeeded + monthlyFixedCost(rule)) / (perPack * DAYS_PER_MONTH),
  );
}

/**
 * 목표 회수액에 닿기까지 걸리는 개월 수. 배분 재원이 없으면 닿지 않으므로 null이다.
 * 반올림하지 않고 소수로 돌려준다 — 표기 방식은 화면이 정한다.
 */
export function monthsToTarget(pool: number, targetRecovery: number): number | null {
  if (pool <= 0) return null;
  return targetRecovery / pool;
}

/** 목표 총 회수액. 원금에 목표 회수율을 곱한 값이다. */
export function targetRecoveryAmount(
  targetAmount: number,
  targetReturnPct: number,
): number {
  return (targetAmount * targetReturnPct) / 100;
}

/** 내 투자금이 그 달 배분 재원에서 가져가는 몫. 보유 비율에 그대로 비례한다. */
export function myMonthlyShare(
  pool: number,
  myAmount: number,
  targetAmount: number,
): number {
  if (targetAmount <= 0) return 0;
  return pool * (myAmount / targetAmount);
}

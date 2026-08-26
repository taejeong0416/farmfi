// 투자자 배분 = 매출 − 월 비용, 그리고 투자안이 정한 회수액 (기획 0826 §BM)
//
// 슬라이드 38 — "매장은 월 매출에서 운영비와 운영자 수익을 뺀 이익을 투자자에게 배분한다."
//
//   월 매출 792팩 × 11,000원 = 871만원
//   − 제품 변동비 118.8 (팩당 1,500 × 792)
//   − 결제 수수료  13.1 (매출 1.5%)
//   − 운영자 보수  70 · 전기관리수도 123 · 소모품유지보수 47.6 · 서비스이용료 5
//   ────────────────────────────────
//   투자자 배분 전 이익 493.5만원
//
// **배분액은 남은 이익을 비율로 나누는 게 아니다.** 슬라이드 36·37이 그 구조를 정한다:
// 투자안(투자금 · 연 프리미엄 · 회수기간)이 월 회수액을 먼저 정하고, 매장은 그것을
// 감당할 수 있는지 검증받는다(필요 판매량 ≤ 기준 판매량). 남는 이익은 매장에 남는다.
//
//   24개월·연 6% → 22팩/일 필요, 배당 전 운영선 9팩/일 → 투자자 몫 13팩/일
//
// 이전 버전은 기획 v18의 "수수료 풀(이용료+체험30%+B2B8%)의 60%"였다. 0826 기획에서
// 그 구조가 사라졌다 — 이용료는 배당 재원이 아니라 **매장이 팜피에 내는 비용**이고
// (슬라이드 38 서비스 이용료 5만원), 팜피 수익은 별도 모델로 분리됐다(슬라이드 40).
// 폐기된 필드는 스키마에 남겨 두되 계산에 쓰지 않는다.

import { prisma } from "@/lib/db";

// 기본값은 슬라이드 35 입력값(8유닛 매장 기준). 프로젝트별 SettlementRule이 있으면 그 값이 이긴다.
export const DEFAULT_UNIT_VARIABLE_COST = 1_500; // 팩당 변동비(원)
export const DEFAULT_PAYMENT_FEE_RATE = 0.015; // 결제 수수료 (매출의 1.5%)
export const DEFAULT_OPERATOR_PAY = 700_000; // 운영자 보수(월)
export const DEFAULT_FACILITY_COST = 1_230_000; // 전기·관리·수도(월)
export const DEFAULT_UNIT_UPKEEP_COST = 476_000; // 소모품·유지보수(월)
export const DEFAULT_PLATFORM_FEE = 50_000; // 팜피 서비스 이용료(월)
export const DEFAULT_ANNUAL_PREMIUM_RATE = 0.06; // 연 프리미엄
export const DEFAULT_RECOVERY_MONTHS = 24; // 회수 기간(개월)

/** 실적이 안 나올 때 늘릴 수 있는 회수 기간 상한 (슬라이드 37 각주). */
export const MAX_RECOVERY_MONTHS = 36;

/** 프로젝트에 적용되는 정산 규칙 (행이 없으면 전부 기본값). */
export interface EffectiveSettlementRule {
  unitVariableCost: number;
  paymentFeeRate: number;
  operatorPay: number;
  facilityCost: number;
  unitUpkeepCost: number;
  platformFee: number;
  annualPremiumRate: number;
  recoveryMonths: number;
  /** 프로젝트별 규칙 행이 존재하는지 (false면 전부 기본값) */
  isCustom: boolean;
}

export const DEFAULT_SETTLEMENT_RULE: EffectiveSettlementRule = {
  unitVariableCost: DEFAULT_UNIT_VARIABLE_COST,
  paymentFeeRate: DEFAULT_PAYMENT_FEE_RATE,
  operatorPay: DEFAULT_OPERATOR_PAY,
  facilityCost: DEFAULT_FACILITY_COST,
  unitUpkeepCost: DEFAULT_UNIT_UPKEEP_COST,
  platformFee: DEFAULT_PLATFORM_FEE,
  annualPremiumRate: DEFAULT_ANNUAL_PREMIUM_RATE,
  recoveryMonths: DEFAULT_RECOVERY_MONTHS,
  isCustom: false,
};

/** 프로젝트에 저장된 정산 규칙을 읽고, 없으면 기본값을 돌려준다. */
export async function resolveSettlementRule(
  projectId: string
): Promise<EffectiveSettlementRule> {
  const rule = await prisma.settlementRule.findUnique({ where: { projectId } });
  if (!rule) return DEFAULT_SETTLEMENT_RULE;
  return {
    unitVariableCost: Number(rule.unitVariableCost),
    paymentFeeRate: rule.paymentFeeRate,
    operatorPay: Number(rule.operatorPay),
    facilityCost: Number(rule.facilityCost),
    unitUpkeepCost: Number(rule.unitUpkeepCost),
    platformFee: Number(rule.platformFee),
    annualPremiumRate: rule.annualPremiumRate,
    recoveryMonths: rule.recoveryMonths,
    isCustom: true,
  };
}

export interface SettlementResult {
  /** 매장 월 매출 */
  revenue: number;
  /** 판매 수량(팩). 변동비 산출에 쓴다. 모르면 0 — 그때 변동비는 0이다. */
  unitsSold: number;
  /** 제품 변동비 = 팩당 변동비 × 판매량 */
  variableCost: number;
  /** 결제 수수료 = 매출 × 수수료율 */
  paymentFee: number;
  /** 운영자 보수 */
  operatorPay: number;
  /** 전기·관리·수도 */
  facilityCost: number;
  /** 소모품·유지보수 */
  unitUpkeepCost: number;
  /** 팜피 서비스 이용료 — 팜피 수익이지 배당 재원이 아니다 */
  platformFee: number;
  /** 월 비용 합계 */
  totalCost: number;
  /** 투자자 배분 전 이익 = 매출 − 월 비용. 음수면 0으로 자르지 않는다(적자를 감춘다). */
  distributableProfit: number;
  /** 투자안이 정한 월 회수액. 투자금을 모르면 0. */
  scheduledRecovery: number;
  /** 실제 투자자 배분액 = min(회수액, 이익). 이익이 모자라면 그만큼만 나간다. */
  investorPayout: number;
  /** 회수액에서 모자란 몫. 다음 기간으로 이월되는 금액 */
  recoveryShortfall: number;
  /** 배분 후 매장에 남는 몫 */
  storeRetained: number;
  rule: EffectiveSettlementRule;
  /** 비용 구성 (합계 = totalCost) */
  breakdown: { label: string; amount: number; color: string }[];
}

/**
 * 투자안이 정하는 월 회수액.
 *
 *   원금 × (1 + 연프리미엄 × 회수연수) ÷ 회수개월
 *
 * 단리로 본다. 슬라이드 37이 "회수기간이 길어지면 같은 연 프리미엄을 더 오래 받아
 * 총수익이 커진다"고 하는데, 복리라면 기간이 길수록 월 회수액이 더 가파르게 줄어
 * 그 표의 팩/일 감소폭과 맞지 않는다.
 */
export function monthlyRecovery(
  principal: number,
  annualPremiumRate: number,
  recoveryMonths: number
): number {
  if (principal <= 0 || recoveryMonths <= 0) return 0;
  const years = recoveryMonths / 12;
  const total = principal * (1 + annualPremiumRate * years);
  return Math.round(total / recoveryMonths);
}

/**
 * 한 매장의 1개월 정산.
 *
 * @param projectId 프로젝트 ID
 * @param revenue 해당 기간 매장 매출(원)
 * @param opts.unitsSold 판매 수량(팩). 변동비 산출에 필요하다.
 * @param opts.investedPrincipal 투자 원금(원). 회수액 산출에 필요하다.
 */
export async function calculateSettlement(
  projectId: string,
  revenue: number,
  opts?: { unitsSold?: number; investedPrincipal?: number }
): Promise<SettlementResult> {
  const rule = await resolveSettlementRule(projectId);

  const rev = Math.max(0, revenue);
  const unitsSold = Math.max(0, opts?.unitsSold ?? 0);

  const variableCost = unitsSold * rule.unitVariableCost;
  const paymentFee = Math.round(rev * rule.paymentFeeRate);
  const totalCost =
    variableCost +
    paymentFee +
    rule.operatorPay +
    rule.facilityCost +
    rule.unitUpkeepCost +
    rule.platformFee;

  // 적자면 음수 그대로 둔다. 0으로 자르면 "손해가 없었다"로 읽힌다.
  const distributableProfit = rev - totalCost;

  const scheduledRecovery = monthlyRecovery(
    opts?.investedPrincipal ?? 0,
    rule.annualPremiumRate,
    rule.recoveryMonths
  );

  // 이익이 회수액에 못 미치면 있는 만큼만 나간다. 없는 돈을 배분할 수 없다.
  const investorPayout = Math.max(0, Math.min(scheduledRecovery, distributableProfit));
  const recoveryShortfall = Math.max(0, scheduledRecovery - investorPayout);
  const storeRetained = distributableProfit - investorPayout;

  return {
    revenue: rev,
    unitsSold,
    variableCost,
    paymentFee,
    operatorPay: rule.operatorPay,
    facilityCost: rule.facilityCost,
    unitUpkeepCost: rule.unitUpkeepCost,
    platformFee: rule.platformFee,
    totalCost,
    distributableProfit,
    scheduledRecovery,
    investorPayout,
    recoveryShortfall,
    storeRetained,
    rule,
    breakdown: [
      { label: "제품 변동비", amount: variableCost, color: "#3B82F6" },
      { label: "결제 수수료", amount: paymentFee, color: "#8B5CF6" },
      { label: "운영자 보수", amount: rule.operatorPay, color: "#22C55E" },
      { label: "전기·관리·수도", amount: rule.facilityCost, color: "#F59E0B" },
      { label: "소모품·유지보수", amount: rule.unitUpkeepCost, color: "#EF4444" },
      { label: "서비스 이용료", amount: rule.platformFee, color: "#6B7280" },
    ],
  };
}

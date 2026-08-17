// 배당 재원 = FarmFi 플랫폼 수수료 풀 (기획안 v18 §2 · §4)
//
// v18 §2 설계 원칙 2 — "운영자 주머니 불가침: 배당은 운영자 매출이 아니라 FarmFi
// 수수료에서 나온다. 운영자가 살아야 전부 산다."
// v18 §2 자금 흐름 — "[운영자(청년)] ... 매출 100% 소유, 이용료 지불"
//
// [FarmFi 수익 = 투자자 배당 재원] (v18 §2)
//   ① 온보딩피 400만/사이트 (성과연동 — 설비 셋업 검증 후 지급)
//   ② 플랫폼 이용료 월 20만/사이트
//   ③ 체험프로그램 중개 30% (상방)
//   ④ B2B 신규계약 성사 수수료 8% (FarmFi가 성사시킨 증분 매출에만)
//   → 수수료 풀의 60% 분기 변동 배당, 40% FarmFi 운영
//
// ①(온보딩피)는 이 정산에 넣지 않는다. v18 §4 표가 배당 풀에서 제외하고 있기 때문이다:
//   "수수료 풀 (중립, 연) 2,280만 (이용료 1,200 + 체험 1,080)" — 온보딩피 없음
//   "FarmFi 1차연도 총 보수 2,912만" = 온보딩피 400만×5사이트(2,000만) + 풀의 40%(912만)
// 즉 온보딩피는 라운드 셋업 대가로 FarmFi 본체에 귀속되는 1회성 수익이고, 정기 배당
// 재원은 ②③④의 반복 수수료다. (§2 목록과 §4 산식 사이의 이 불일치는 §4를 따랐다.
// §4가 공표 수익률 3.3%/6.2%를 만들어내는 쪽이다.)

import { prisma } from "@/lib/db";

export const ONBOARDING_FEE_PER_SITE = 4_000_000; // v18 §2 ① — 1회성, 배당 풀 제외(위 주석)

// 아래 다섯 값은 프로젝트별 SettlementRule이 없을 때 쓰는 기본값이다(명세 2.1).
// 규칙 행이 있으면 그 값이 이긴다 — resolveSettlementRule 참고.
export const DEFAULT_MONTHLY_PLATFORM_FEE = 200_000; // v18 §2 ② 이용료 월 20만/사이트
export const DEFAULT_EXPERIENCE_FEE_RATE = 0.3; // v18 §2 ③ 체험 중개 30%
export const DEFAULT_B2B_FEE_RATE = 0.08; // v18 §2 ④ B2B 신규계약 성사 8%
export const DEFAULT_INVESTOR_SHARE = 0.6; // v18 §2 수수료 풀의 60% 배당 / 40% FarmFi 운영
export const DEFAULT_BREAK_EVEN_REVENUE = 0; // 0 = 구간 전환 없음

// [근사 — 한계 명시] 체험 실적을 담는 테이블이 스키마에 없다(SalesRecord는 작물 판매만).
// 그래서 체험 개최 횟수를 매장 가동 수준의 프록시인 작물 매출로 추정한다.
// v18 §4 중립 시나리오(사이트당 월): 작물 매출 140만 / 체험 총액 60만(회당 30만 × 2회).
// 주의 — 이 비율은 "체험이 몇 번 열렸나"를 추정하는 용도일 뿐, 운영자 작물 매출에 과금하는
// 것이 아니다. 수수료는 체험 매출(운영자 70 / FarmFi 30)에서만 나온다.
// 체험 예약·정산 테이블이 생기면 experienceRevenue 실측치를 직접 넘겨야 한다.
const EXPERIENCE_REVENUE_PER_PRODUCT_REVENUE = 600_000 / 1_400_000;

/** 프로젝트에 적용되는 정산 규칙 (행이 없으면 전부 기본값). */
export interface EffectiveSettlementRule {
  monthlyPlatformFee: number;
  experienceFeeRate: number;
  b2bFeeRate: number;
  /** 적자 구간(기간 매출 < breakEvenRevenue)에서의 투자자 우선 배분율 */
  deficitInvestorShare: number;
  /** 흑자 구간에서의 투자자 배분율 — 운영자·FarmFi 몫 상향분의 반대편 */
  surplusInvestorShare: number;
  /** 흑자 판정 기준선(원). 0이면 전환 없이 항상 흑자 구간 비율을 쓴다. */
  breakEvenRevenue: number;
  /** 프로젝트별 규칙 행이 존재하는지 (false면 전부 기본값) */
  isCustom: boolean;
}

export const DEFAULT_SETTLEMENT_RULE: EffectiveSettlementRule = {
  monthlyPlatformFee: DEFAULT_MONTHLY_PLATFORM_FEE,
  experienceFeeRate: DEFAULT_EXPERIENCE_FEE_RATE,
  b2bFeeRate: DEFAULT_B2B_FEE_RATE,
  deficitInvestorShare: DEFAULT_INVESTOR_SHARE,
  surplusInvestorShare: DEFAULT_INVESTOR_SHARE,
  breakEvenRevenue: DEFAULT_BREAK_EVEN_REVENUE,
  isCustom: false,
};

/** 프로젝트에 저장된 정산 규칙을 읽고, 없으면 기본값을 돌려준다. */
export async function resolveSettlementRule(
  projectId: string
): Promise<EffectiveSettlementRule> {
  const rule = await prisma.settlementRule.findUnique({ where: { projectId } });
  if (!rule) return DEFAULT_SETTLEMENT_RULE;
  return {
    monthlyPlatformFee: Number(rule.monthlyPlatformFee),
    experienceFeeRate: rule.experienceFeeRate,
    b2bFeeRate: rule.b2bFeeRate,
    deficitInvestorShare: rule.deficitInvestorShare,
    surplusInvestorShare: rule.surplusInvestorShare,
    breakEvenRevenue: Number(rule.breakEvenRevenue),
    isCustom: true,
  };
}

export interface FeePoolResult {
  /** 운영자 작물 매출 — 참고 표시용. 배당 재원에서 차감하지 않는다(운영자 100% 소유). */
  operatorRevenue: number;
  /** ② 플랫폼 이용료 (사이트 1개 × 1개월) */
  platformUsageFee: number;
  /** ③ 체험 중개 수수료 (체험 매출의 30%) */
  experienceFee: number;
  /** 위 수수료 산정에 쓰인 체험 매출 — 실적 테이블이 없으면 추정치 */
  experienceRevenue: number;
  /** 체험 매출이 추정치인지 여부 (호출자가 실적을 넘기면 false) */
  experienceRevenueEstimated: boolean;
  /** ④ B2B 신규계약 성사 수수료 (FarmFi가 성사시킨 증분 매출의 8%) */
  b2bFee: number;
  /** 수수료 풀 = ② + ③ + ④ */
  feePool: number;
  /** 투자자 배당 = 수수료 풀 × 적용 배분율 */
  investorDividend: number;
  /** 나머지 — FarmFi 운영 */
  farmfiOperating: number;
  /** 이번 산출에 적용된 정산 규칙 */
  rule: EffectiveSettlementRule;
  /** 적용된 구간 — 기간 매출이 breakEvenRevenue 이상이면 surplus */
  band: "deficit" | "surplus";
  /** 적용된 투자자 배분율 (band에 따라 규칙에서 고른 값) */
  investorShare: number;
  /** 수수료 풀의 재원 구성 (합계 = feePool) */
  breakdown: { label: string; amount: number; color: string }[];
}

/**
 * 한 사이트의 1개월 수수료 풀과 투자자 배당을 산출한다.
 * 운영자 매출·운영비·임대료는 정산에서 차감하지 않는다 (v18 설계 원칙 2).
 *
 * 수수료율과 배분율은 프로젝트별 SettlementRule에서 읽고, 규칙이 없으면 기본값을 쓴다.
 * 배분율은 기간 매출이 breakEvenRevenue를 넘었는지에 따라 적자/흑자 구간 중 하나를
 * 고른다(명세 2.1.1 우선배분·전환).
 *
 * @param projectId 사이트 ID. 프로젝트 1개 = 사이트 1개라 이용료는 1개월분 고정.
 * @param operatorRevenue 해당 기간 운영자 작물 매출 (원). 체험 매출 추정 + 구간 판정에 쓰인다.
 * @param actuals 체험·B2B 실적을 아는 경우 직접 주입 (추정 대신 실측 사용)
 */
export async function calculateFeePool(
  projectId: string,
  operatorRevenue: number,
  actuals?: { experienceRevenue?: number; b2bIncrementalRevenue?: number }
): Promise<FeePoolResult> {
  const rule = await resolveSettlementRule(projectId);

  const platformUsageFee = rule.monthlyPlatformFee;

  const actualExperienceRevenue = actuals?.experienceRevenue;
  const experienceRevenueEstimated = actualExperienceRevenue == null;
  const experienceRevenue = experienceRevenueEstimated
    ? Math.max(0, operatorRevenue) * EXPERIENCE_REVENUE_PER_PRODUCT_REVENUE
    : Math.max(0, actualExperienceRevenue);
  const experienceFee = Math.round(experienceRevenue * rule.experienceFeeRate);

  // B2B는 FarmFi가 성사시킨 증분 계약에만 붙는다. 실적이 없으면 0
  // (v18 §4 중립 시나리오도 수수료 풀에 B2B를 계상하지 않는다 — 상방 옵션).
  const b2bIncrementalRevenue = Math.max(0, actuals?.b2bIncrementalRevenue ?? 0);
  const b2bFee = Math.round(b2bIncrementalRevenue * rule.b2bFeeRate);

  const feePool = platformUsageFee + experienceFee + b2bFee;

  // 기준선이 0이면 전환 없음 — 흑자 구간 비율로 본다.
  const band: "deficit" | "surplus" =
    rule.breakEvenRevenue > 0 && operatorRevenue < rule.breakEvenRevenue
      ? "deficit"
      : "surplus";
  const investorShare =
    band === "deficit" ? rule.deficitInvestorShare : rule.surplusInvestorShare;

  const investorDividend = Math.round(feePool * investorShare);
  const farmfiOperating = feePool - investorDividend;

  const breakdown = [
    { label: "플랫폼 이용료", amount: platformUsageFee, color: "#3B82F6" },
    { label: "체험 중개 수수료", amount: experienceFee, color: "#22C55E" },
    { label: "B2B 성사 수수료", amount: b2bFee, color: "#8B5CF6" },
  ];

  return {
    operatorRevenue,
    platformUsageFee,
    experienceFee,
    experienceRevenue: Math.round(experienceRevenue),
    experienceRevenueEstimated,
    b2bFee,
    feePool,
    investorDividend,
    farmfiOperating,
    rule,
    band,
    investorShare,
    breakdown,
  };
}

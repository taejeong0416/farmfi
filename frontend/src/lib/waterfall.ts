export interface WaterfallResult {
  opex: number;
  landlordRent: number;
  platformFee: number;
  investorDividend: number;
  operatorResidual: number;
  breakdown: { label: string; amount: number; color: string }[];
}

// 사업계획서 단위경제(표9·표10·표11·표13) 기준 월 정산 워터폴
// 매출 → OPEX(100만) → 건물주 고정 임대료(50만) → 순이익 → 투자자 배당 / 운영자 잔여
// 플랫폼 정산 수수료는 순이익의 1.5% (표13). 발행 3%·자체몰 10%는 별도 수익원.
export async function calculateWaterfall(
  _projectId: string,
  totalRevenue: number
): Promise<WaterfallResult> {
  const OPEX_TOTAL = 1_000_000; // 전기 60만 + 재료 40만 (표9)
  const LANDLORD_RENT = 500_000; // 건물주 월 고정 임대료, 매출 무관 (표10)
  const PLATFORM_FEE_RATE = 0.015; // 정산 운영 수수료 1.5% (표13)
  const INVESTOR_SHARE = 0.7; // BEP 전 투자자 배당 70% (표11)

  // 순차 차감: 각 단계는 남은 금액을 넘지 못함 (breakdown 합계 ≤ 매출)
  let remaining = totalRevenue;

  const opex = Math.min(OPEX_TOTAL, remaining);
  remaining -= opex;

  const landlordRent = Math.min(LANDLORD_RENT, remaining);
  remaining -= landlordRent;

  // 남은 금액 = 월 순이익. 플랫폼 수수료(1.5%) 차감 후 투자자/운영자 분배.
  const platformFee = Math.round(remaining * PLATFORM_FEE_RATE);
  const distributable = remaining - platformFee;

  const investorDividend = Math.round(distributable * INVESTOR_SHARE);
  const operatorResidual = distributable - investorDividend;

  const breakdown = [
    { label: "운영비(OPEX)", amount: opex, color: "#9CA3AF" },
    { label: "건물주 임대료", amount: landlordRent, color: "#3B82F6" },
    { label: "플랫폼 수수료", amount: platformFee, color: "#D1D5DB" },
    { label: "투자자 배당", amount: investorDividend, color: "#22C55E" },
    { label: "운영자 잔여수익", amount: operatorResidual, color: "#8B5CF6" },
  ];

  return {
    opex,
    landlordRent,
    platformFee,
    investorDividend,
    operatorResidual,
    breakdown,
  };
}
